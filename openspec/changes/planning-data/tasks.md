# Planning data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Default execution in this repo: skill `executar-plano` (sdd.js).

**Goal:** Tables, one versioned migration, transaction classification, the snapshot query that builds `EngineInput`, and validated server actions for every planning mutation.

**Architecture:** Schema in `src/db/schema.ts`. Feature code in `src/features/planning/`: pure helpers in `lib/` (tested directly), db reads in `lib/queries/` composed by `queries.ts`, tx-scoped writes in `lib/writes.ts` used by `actions/*.ts` (barrel `actions.ts`). Builder decisions D1 to D10 in `design.md`.

**Tech Stack:** Next.js 16.3, Drizzle 0.45 + Postgres, drizzle-kit 0.31, Zod 4, Vitest 4, Biome 2, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-23-financial-planning-design.md`, plus `openspec/changes/planning-data/design.md` (decisions cited as D1..D10) and the engine contract in `openspec/changes/planning-engine/tasks.md` Task 1.

## Global Constraints

- Depends on `planning-engine` merged: import types from `@/features/planning/lib/engine`.
- Every query and write filters by `userId` (AGENTS.md rule 1). Admin payer via `getAdminPayerId(userId)`, never a JOIN on `payers`.
- Money: db `numeric(12, 2)` strings; percentages `numeric(5, 2)`; Zod inputs and engine values are integer cents. Convert only in `src/features/planning/lib/cents.ts`.
- Periods `YYYY-MM`; dates as in the repo: `parseLocalDateString` to write, `toDateOnlyString` to read (`src/shared/utils/date.ts`).
- Schema change only through `pnpm run db:generate`; never `db:push`. CI fails when `schema.ts` changes without a migration.
- SQL names in Portuguese (repo pattern: `viagens`, `nome`); TS identifiers in English.
- Server action errors: generic messages via `handleActionError`; not-found message `"Registro não encontrado."`.
- Tests: no db harness; repo pattern is `vi.mock("@/shared/lib/db")` with a hoisted chain (see `src/features/trips/queries.test.ts`, `src/features/transactions/actions/reconciliation-action.test.ts`) and `new PgDialect().sqlToQuery(...)` to inspect conditions.
- Public repo: synthetic values only in tests, fixtures and migration defaults.
- Iterate with `pnpm exec vitest run <file>`; lint per file `pnpm exec biome check --formatter-enabled=false <files>`; `tsc` once at the end.
- Commits PT-BR `feat(planning): ...`, explicit paths only.

## Review Focus

1. Foreign `accountId`, `planId` or `categoryId` (another user's) in any action: rejected with `"Registro não encontrado."` and nothing written. Tests in Tasks 10, 11, 12, 13.
2. Account of a non-investment type sent to positions replace or earmark: rejected. Test in Task 11.
3. User with no admin payer, no transactions or no positions: `fetchPlanningSnapshot` returns zeros and empty arrays, not an exception. Test in Task 9.
4. Window where `targetMonth` falls outside `[earliest, latest]`, `latest < earliest`, maturity liquidity without month: Zod rejects with a PT-BR message. Test in Task 5.
5. Card purchase plus its invoice payment counted twice in cost of living: the `AUTO_FATURA:` payment is ignored. Test in Task 6.

---

### Task 1: Settings, positions and the earmark flag

**Files:**
- Modify: `src/db/schema.ts` (column on `financialAccounts` ~line 197; new tables after `trips` ~line 686; types block at the end)
- Test: `src/db/schema.planning.test.ts`

**Interfaces:**
- Produces (exact):
  - `financialAccounts.isEarmarkedPot = boolean("pote_reservado").notNull().default(false)`
  - `planningSettings = pgTable("planejamento_ajustes", { userId text "user_id" PK FK user cascade, plannedContribution numeric "aporte_planejado" notNull default "0", reserveMonths smallint "meses_reserva" notNull default 3, baselineMonths smallint "meses_base" notNull default 6, ipcaForecastPct numeric(5,2) "previsao_ipca" notNull default "4.00", inccForecastPct numeric(5,2) "previsao_incc" notNull default "5.00", horizonEnd text "horizonte_fim", stressContributionCap numeric "estresse_teto_aporte", stressIncomeLossMonths smallint "estresse_meses_sem_renda" notNull default 3, stressPlanCostPct numeric(5,2) "estresse_custo_planos" notNull default "10.00", plannerModelId text "modelo_planejador", updatedAt timestamp "updated_at" notNull defaultNow })`
  - `investmentPositions = pgTable("planejamento_posicoes", { id uuid PK, userId, accountId uuid "conta_id" FK contas cascade notNull, description text "descricao" notNull, amount numeric "valor" notNull, liquidity text "liquidez" notNull, maturityMonth text "mes_vencimento", annualRealReturnPct numeric(5,2) "retorno_real_anual", asOf date "data_referencia" (mode date) notNull, createdAt })` with index `planejamento_posicoes_user_conta_ref_idx (user_id, conta_id, data_referencia)`
  - types `PlanningSettings`, `InvestmentPosition` (`$inferSelect`).

Test: new, because distinct contract (pattern of `src/db/schema.trips.test.ts`; the planning tables are a cross-change contract).

- [ ] **Step 1: Write the failing test**: one `it.each` over `[table, sqlName, requiredColumns, nullableColumns]` for `planningSettings` and `investmentPositions` using `getTableConfig`; plus `financialAccounts` has `pote_reservado` notNull.
- [ ] **Step 2: Run** `pnpm exec vitest run src/db/schema.planning.test.ts`. Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the column, tables and types.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `src/db/schema.ts src/db/schema.planning.test.ts`; `git commit -m "feat(planning): tabelas de ajustes e posicoes e flag de pote reservado"`.

### Task 2: Plans, events, bids and category mappings

**Files:**
- Modify: `src/db/schema.ts`
- Test: extend `src/db/schema.planning.test.ts` (same `it.each`)

**Interfaces:**
- Produces:
  - `plans = pgTable("planejamento_planos", { id, userId, name "nome", type "tipo" ("goal"|"consorcio"), priority integer "prioridade" notNull, nonNegotiable boolean "inegociavel" notNull default false, lifecycle text "status" notNull default "draft", basis text "base_valor" notNull, priceIndex text "indice" notNull, targetMonth text "mes_alvo" notNull, windowEarliest text "janela_inicio", windowLatest text "janela_fim", potAccountIds uuid("contas_pote").array().notNull() (default: empty uuid array), targetMin numeric "valor_min", targetBase numeric "valor_alvo", targetMax numeric "valor_max", letterValue numeric "valor_carta", outstandingBalance numeric "saldo_devedor", bidBase text "base_lance", bidMarginPp numeric(5,2) "margem_lance", embeddedBidEnabled boolean "lance_embutido" notNull default false, embeddedBidPct numeric(5,2) "pct_lance_embutido" notNull default "0", createdAt, updatedAt })`, index `(user_id, prioridade)`
  - `planEvents = pgTable("planejamento_eventos", { id, userId, planId uuid "plano_id" FK plans cascade, label "descricao", direction "direcao", basis "base_valor", amountMin "valor_min", amountBase "valor", amountMax "valor_max" (numeric notNull), startMonth "mes_inicio" notNull, endMonth "mes_fim", createdAt })`
  - `bidRecords = pgTable("planejamento_lances", { id, userId, planId FK cascade, month "mes" notNull, winningBidPct numeric(5,2) "pct_vencedor" notNull, createdAt })`, unique `(plano_id, mes)`
  - `planCategoryMappings = pgTable("planejamento_categorias", { id, userId, planId FK cascade, categoryId uuid "categoria_id" FK categorias cascade })`, unique `(user_id, categoria_id)`
  - types `Plan`, `PlanEventRow`, `BidRecord`, `PlanCategoryMapping`.

Test: extends `schema.planning.test.ts` table, plus one assertion that both unique constraints exist.

- [ ] **Step 1:** Add the four rows to the `it.each` and the unique-constraint assertion.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** the tables, relations to `user` like `trips`, and types.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): tabelas de planos, eventos, lances e mapeamento de categorias"`.

### Task 3: Assumption log and planner conversation tables

**Files:**
- Modify: `src/db/schema.ts`
- Test: extend `src/db/schema.planning.test.ts`

**Interfaces:**
- Produces:
  - `assumptionLog = pgTable("planejamento_premissas", { id, userId, kind "tipo" notNull ("contribution"|"return"|"bid"|"index"|"plan-change"|"other"), summary "resumo" notNull, source "origem" notNull ("user"|"planner"), proposalId text "proposta_id", reviewByMonth text "revisar_em", createdAt })`, index `(user_id, created_at)`, unique `(user_id, proposta_id)`
  - `plannerConversations = pgTable("planejamento_conversas", { id uuid, userId, title "titulo" notNull, createdAt, updatedAt })`
  - `plannerMessages = pgTable("planejamento_mensagens", { id text PK, conversationId uuid "conversa_id" FK conversations cascade notNull, userId, role "papel" notNull, parts jsonb "partes" notNull, createdAt })`, index `(conversa_id, created_at)`
  - types `AssumptionEntry`, `PlannerConversation`, `PlannerMessageRow`.

Test: extends `schema.planning.test.ts` table.

- [ ] **Step 1:** Add the three rows to the `it.each`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): tabelas de premissas e conversas do planejador"`.

### Task 4: Versioned migration

**Files:**
- Create: `drizzle/00NN_<generated>.sql`, `drizzle/meta/00NN_snapshot.json`; Modify: `drizzle/meta/_journal.json`

Test: none, because CI's "Check migrations" step locks schema/migration parity.

- [ ] **Step 1: Run** `pnpm run db:generate --name planning`. Expected: one new SQL file.
- [ ] **Step 2: Check** the SQL creates the eight `planejamento_*` tables, adds `contas.pote_reservado` with `DEFAULT false NOT NULL`, and has no `DROP`.
- [ ] **Step 3: Run** `pnpm exec drizzle-kit generate --name drift_probe`. Expected: "No schema changes" (delete nothing else).
- [ ] **Step 4: Commit** the generated files by path; `git commit -m "feat(planning): migration das tabelas de planejamento"`.

### Task 5: Zod input schemas and cents conversion

**Files:**
- Create: `src/features/planning/lib/cents.ts`, `src/features/planning/lib/schemas.ts`
- Test: `src/features/planning/lib/schemas.test.ts`

**Interfaces:**
- Produces:
  - `toCents(value: string | number | null | undefined): Cents` (null → 0); `centsToDecimal(cents: Cents): string` (`"1234.50"`).
  - `periodSchema` (`/^\d{4}-(0[1-9]|1[0-2])$/`), `amountRangeSchema` (ints ≥ 0, `min <= base <= max`).
  - `planFieldsSchema` (unrefined object, needed by `.partial()` in `planning-planner`) and `planInputSchema = planFieldsSchema.superRefine(...)`; `type PlanInput = z.infer<typeof planInputSchema>` with exactly the `EnginePlan` field names: `name, nonNegotiable, lifecycle, basis, index, targetMonth, window, potAccountIds, fields` (`fields` = discriminated union on `type`: `goal { target }`, `consorcio { letterValue > 0, outstandingBalance >= 0, bidBase, marginPp 0..50, embeddedBid { enabled, pct 0..30 } }`).
  - `planEventFieldsSchema` (`label, direction, basis, amount, startMonth, endMonth`) and `planEventInputSchema = planEventFieldsSchema.extend({ id: uuid optional, planId: uuid })` refined `endMonth >= startMonth`; `PlanEventInputData`.
  - `positionLineSchema`, `replacePositionsSchema { accountId, asOf "YYYY-MM-DD", positions (max 50) }`; `ReplacePositionsInput`.
  - `planningSettingsFieldsSchema { plannedContribution, reserveMonths 0..24, baselineMonths 3..24, indexForecastPct { IPCA, INCC } -10..50, horizonEnd, stressContributionCap, stressIncomeLossMonths 0..24, stressPlanCostPct 0..100, plannerModelId }`; `PlanningSettingsInput`.
  - `bidInputSchema { planId, month, winningBidPct 0..100 }`, `categoryMappingInputSchema { planId, categoryIds }`, `assumptionInputSchema { kind, summary 1..300, reviewByMonth }`, `reorderPlansSchema { orderedIds (min 1) }`, and their `z.infer` types.

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: `toCents("1234.56") === 123_456`, `centsToDecimal(123_450) === "1234.50"`; one `it.each` of invalid plan inputs with the expected message: window `latest < earliest` → `"A janela termina antes de começar."`; `targetMonth` outside window → `"O mês alvo deve estar dentro da janela."`; `embeddedBid.pct 31` → `"O lance embutido vai até 30%."`; one `it.each` for `replacePositionsSchema`: `liquidity "maturity"` without month → `"Informe o mês de vencimento."`, `"daily"` with month → `"Vencimento só vale para liquidez no vencimento."`; one valid goal and one valid consórcio parse.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/schemas.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): schemas de entrada e conversao de centavos"`.

### Task 6: Transaction classification and baselines

**Files:**
- Create: `src/features/planning/lib/baseline.ts`
- Test: `src/features/planning/lib/baseline.test.ts`

**Interfaces:**
- Consumes: constants from `src/shared/lib/accounts/constants.ts` (`ACCOUNT_AUTO_INVOICE_NOTE_PREFIX`, `INVOICE_ADJUSTMENT_NAME`, `ACCOUNT_BALANCE_ADJUSTMENT_NAME`, `INITIAL_BALANCE_CATEGORY_NAME`, `REFUND_NOTE_PREFIX`).
- Produces:
  - `INVESTMENT_ACCOUNT_TYPE = "Conta Investimento"`, `CONTRIBUTION_CATEGORY_NAME = "Investimentos"`, `YIELD_CATEGORY_NAME = "Rendimentos"`
  - `type TxRow = { id: string; period: Period; date: string; name: string; amount: Cents /* signed */; transactionType: string; categoryId: string | null; categoryName: string | null; note: string | null; transferId: string | null; accountType: string | null }`
  - `type TxClass = "income" | "cost" | "contribution" | "mapped" | "irregular" | "ignored"`
  - `classifyTransaction(row: TxRow, ctx: { mappedCategoryPlan: Map<string, string>; irregularCategoryIds: Set<string> }): TxClass` (D4)
  - `type Baselines = { incomeBaseline: Cents; costOfLiving: Cents; contributionsByMonth: { month: Period; amount: Cents }[]; mappedMonthlyByPlan: Record<string, Cents> }`
  - `buildBaselines(rows: TxRow[], months: Period[], ctx): Baselines`: averages over `months.length`; cost and contributions as positive cents; `contributionsByMonth` one entry per month ascending (0 when none).

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: one `it.each` over D4 rows → class (transfer into investment account → contribution; transfer elsewhere → ignored; `AUTO_FATURA:` note → ignored; `"Ajuste de saldo"` → ignored; Despesa `Investimentos` → contribution; Receita `Investimentos` → ignored; Receita `Rendimentos` → ignored; refund note → cost; mapped Despesa → mapped; plain Despesa → cost; plain Receita → income). Then `buildBaselines` over two months with income `500_000` and `520_000`, cost `-300_000` and `-340_000`, one `AUTO_FATURA:` `-340_000`, mapped `-20_000` each month for plan `"p"` → `{ incomeBaseline: 510_000, costOfLiving: 320_000, mappedMonthlyByPlan: { p: 20_000 } }`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/baseline.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): classificacao de lancamentos e linhas de base"`.

### Task 7: Irregular annual expenses

**Files:**
- Create: `src/features/planning/lib/irregular.ts`
- Test: `src/features/planning/lib/irregular.test.ts`

**Interfaces:**
- Consumes: `TxRow`, `classifyTransaction`.
- Produces: `IRREGULAR_MIN_SHARE = 0.25`; `detectIrregularExpenses(rows: TxRow[], months: Period[]): { expenses: IrregularExpense[]; categoryIds: Set<string> }` (D5; classify with an empty irregular set; one `IrregularExpense` per category and calendar month, `label = categoryName`).

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: 12 months of `-40_000` "Mercado"; "Impostos" `-30_000` only in `2026-02` → `expenses` `[{ calendarMonth: 2, amount: 30_000, label: "Impostos" }]`; "Presentes" in 3 distinct months → not irregular; "Taxa" `-1_000` once → not irregular (below share).
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/irregular.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): deteccao de despesas anuais irregulares"`.

### Task 8: Row-to-engine mappers

**Files:**
- Create: `src/features/planning/lib/mappers.ts`
- Test: `src/features/planning/lib/mappers.test.ts`

**Interfaces:**
- Consumes: schema types (Tasks 1 to 3), `toCents`, engine types.
- Produces:
  - `latestPositionSet(rows: InvestmentPosition[]): InvestmentPosition[]` (per account, rows with the max `asOf`)
  - `toEnginePosition(row: InvestmentPosition): EnginePosition`
  - `toEnginePlan(row: Plan, events: PlanEventRow[], bids: BidRecord[], mappedMonthlyOutflow: Cents): EnginePlan` (`fields` from columns by `type`; events and bids filtered by `planId`, bids sorted by month)
  - `toSettingsInput(row: PlanningSettings | undefined): PlanningSettingsInput` with `DEFAULT_PLANNING_SETTINGS` when undefined (same defaults as Task 1 columns).

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: two accounts with as-of `2026-10-31` and `2026-11-30` rows → only the November rows for the first account, both rows for the second; a consórcio `Plan` row with `valor_carta "10000.00"`, `margem_lance "2.00"` → `fields` `{ type: "consorcio", letterValue: 1_000_000, marginPp: 2, ... }` and `window null` when both window columns are null; `toSettingsInput(undefined).reserveMonths === 3`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/mappers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): mapeamento das linhas do banco para o motor"`.

### Task 9: Planning snapshot query

**Files:**
- Create: `src/features/planning/lib/queries/transactions.ts`, `src/features/planning/lib/queries/planning-rows.ts`, `src/features/planning/queries.ts`, `src/features/planning/lib/snapshot-types.ts`
- Test: `src/features/planning/queries.test.ts`

**Interfaces:**
- Consumes: Tasks 5 to 8, `getAdminPayerId`, `buildPeriodRange`, `getCurrentPeriod`.
- Produces:
  - `fetchBaselineRows(userId: string, adminPayerId: string, periods: Period[]): Promise<TxRow[]>` (transactions left join categories and contas; `where user_id = ? and pagador_id = ? and periodo in (...)`)
  - `snapshot-types.ts`:

```ts
export type PositionView = { id: string; description: string; amount: Cents; liquidity: LiquidityKind; maturityMonth: Period | null; annualRealReturnPct: number | null; asOf: string };
export type InvestmentAccountView = { id: string; name: string; logo: string; isEarmarkedPot: boolean; lastAsOf: string | null; positions: PositionView[] };
export type PlanView = EnginePlan & { type: "goal" | "consorcio"; categoryIds: string[] };
export type ContributionRow = { id: string; name: string; date: string; amount: Cents };
export type AssumptionView = { id: string; kind: string; summary: string; source: "user" | "planner"; proposalId: string | null; reviewByMonth: Period | null; createdAt: string };
export type PlanningSnapshot = {
  currentMonth: Period; input: EngineInput; settings: PlanningSettingsInput; plans: PlanView[];
  accounts: InvestmentAccountView[]; contributionsByMonth: { month: Period; amount: Cents }[];
  currentMonthContributions: ContributionRow[]; assumptions: AssumptionView[];
};
```

  - `fetchPlanningSnapshot(userId: string, now?: Date): Promise<PlanningSnapshot>`: settings → baseline months (last `baselineMonths` complete months) and 12-month window for irregular detection (one `fetchBaselineRows` over the union, current month included for `currentMonthContributions`); `input.startMonth = currentMonth`, `horizonEnd` from settings, `potAccountIds` = earmarked investment accounts, `stress: {}`, `extraMonthlySaving: 0`; assumptions newest first (limit 50).

Test: new, because the query is a distinct contract (db mocked as in `src/features/trips/queries.test.ts`).

- [ ] **Step 1: Write the failing tests**:
  - "filters baseline rows by user, admin payer and periods": render the captured where with `PgDialect`; params include `"user-1"`, `"admin"`, `"2026-10"`.
  - "returns an empty snapshot for a user without admin payer": `getAdminPayerId` → `null`, every select → `[]`; expect `input.incomeBaseline 0`, `input.costOfLiving 0`, `plans []`, `accounts []`, `settings.reserveMonths 3`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/queries.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the files.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): snapshot do planejamento a partir do banco"`.

### Task 10: Write helpers, revalidation entity and settings action

**Files:**
- Create: `src/features/planning/lib/writes.ts`, `src/features/planning/actions/settings.ts`, `src/features/planning/actions.ts` (barrel)
- Modify: `src/shared/lib/actions/helpers.ts` (add `planning: ["/planning"]` to `revalidateConfig`; not in `DASHBOARD_ENTITIES`)
- Test: `src/features/planning/actions/settings.test.ts`

**Interfaces:**
- Produces (`writes.ts`, all take `tx` = the drizzle transaction or `db`, typed `PlanningTx`):
  - `upsertSettings(tx, userId: string, patch: Partial<PlanningSettingsInput>): Promise<void>`
  - `insertAssumption(tx, userId: string, entry: AssumptionInput & { source: "user" | "planner"; proposalId?: string }): Promise<void>`
  - `insertPlan(tx, userId: string, input: PlanInput): Promise<string>` (priority = current max + 1)
  - `updatePlan(tx, userId: string, planId: string, input: PlanInput): Promise<boolean>` (false when not owned)
  - `insertPlanEvent(tx, userId: string, planId: string, event: z.infer<typeof planEventFieldsSchema>): Promise<string>`
  - `assertOwnedPlan(tx, userId, planId): Promise<Plan | null>`, `assertOwnedInvestmentAccount(tx, userId, accountId): Promise<boolean>`
- Produces (action): `savePlanningSettingsAction(input: PlanningSettingsInput): Promise<ActionResult>`: upsert; one `insertAssumption` (source `"user"`) per changed field among `plannedContribution` (kind `contribution`) and `indexForecastPct.IPCA/INCC` (kind `index`), summary in PT-BR like `"Previsão de IPCA: 4,00% → 4,50% ao ano"`; `revalidateForEntity("planning", userId)`.

Test: new, because distinct contract (db mocked, pattern of `reconciliation-action.test.ts`).

- [ ] **Step 1: Write the failing test**: previous settings IPCA `4.00`, input IPCA `4.50` and unchanged contribution → one upsert and exactly one assumption insert with `{ kind: "index", source: "user" }`; `revalidatePath` called with `"/planning"`. Invalid input (`reserveMonths: 30`) → `success false`, no writes.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/actions/settings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `writes.ts`, the action, the barrel and the helpers entry.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): ajustes do planejamento com registro de premissas"`.

### Task 11: Positions replace and earmark actions

**Files:**
- Create: `src/features/planning/actions/positions.ts`
- Modify: `src/features/planning/actions.ts`
- Test: `src/features/planning/actions/positions.test.ts`

**Interfaces:**
- Produces: `replaceAccountPositionsAction(input: ReplacePositionsInput): Promise<ActionResult>` (D8, inside `db.transaction`); `setAccountEarmarkedAction(input: { accountId: string; earmarked: boolean }): Promise<ActionResult>`. Both require `assertOwnedInvestmentAccount`.

Test: new, because distinct actor (account ownership and type).

- [ ] **Step 1: Write the failing tests**: account of another user or of type `"Conta Corrente"` → `{ success: false, error: "Registro não encontrado." }` and no writes (one `it.each`); valid replace → one delete scoped to `(user_id, conta_id, data_referencia)` and one insert with `valor "1500.00"` for `amount 150_000`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/actions/positions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): atualizacao de posicoes e pote reservado"`.

### Task 12: Plan CRUD and reorder actions

**Files:**
- Create: `src/features/planning/actions/plans.ts`
- Modify: `src/features/planning/actions.ts`
- Test: `src/features/planning/actions/plans.test.ts`

**Interfaces:**
- Produces: `createPlanAction(input: PlanInput): Promise<ActionResult<{ planId: string }>>`; `updatePlanAction(input: PlanInput & { id: string }): Promise<ActionResult>`; `deletePlanAction(input: { id: string }): Promise<ActionResult>`; `reorderPlansAction(input: { orderedIds: string[] }): Promise<ActionResult>` (must be exactly the user's plan ids; priorities `1..n`). `potAccountIds` must all be the user's earmarked accounts, else `"Pote inválido."`

Test: new, because distinct actor (plans).

- [ ] **Step 1: Write the failing tests**: create assigns priority `max + 1` (existing max 2 → 3); update/delete of a foreign id → not found, no writes; reorder with a missing or foreign id → `"Ordem inválida."`; pot not earmarked → `"Pote inválido."`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/actions/plans.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): cadastro e ordenacao de planos"`.

### Task 13: Events, winning bid, category mappings and assumptions actions

**Files:**
- Create: `src/features/planning/actions/plan-details.ts`
- Modify: `src/features/planning/actions.ts`
- Test: `src/features/planning/actions/plan-details.test.ts`

**Interfaces:**
- Produces: `savePlanEventAction(input: PlanEventInputData): Promise<ActionResult<{ eventId: string }>>`; `deletePlanEventAction(input: { id: string }): Promise<ActionResult>`; `recordWinningBidAction(input: BidInput): Promise<ActionResult>` (only `consorcio` plans; upsert on `(plano_id, mes)`); `setPlanCategoryMappingsAction(input: CategoryMappingInput): Promise<ActionResult>` (replaces the plan's set; a category mapped to another plan moves; categories must be the user's); `addAssumptionAction(input: AssumptionInput): Promise<ActionResult>` (source `"user"`).

Test: new, because distinct actor (plan children).

- [ ] **Step 1: Write the failing tests**: bid on a `goal` plan → `"Lance só vale para consórcio."`; bid upsert uses `onConflictDoUpdate` on `(plano_id, mes)`; foreign category id in mappings → not found, no writes; event on a foreign plan → not found.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/actions/plan-details.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): eventos, lances, categorias mapeadas e premissas"`.

### Task 14: Closing checks

Test: none, because no behaviour change.

- [ ] **Step 1: Run** `pnpm exec vitest run src/features/planning src/db/schema.planning.test.ts`. Expected: all PASS.
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Run** `pnpm exec biome check --formatter-enabled=false src/features/planning src/db/schema.ts src/shared/lib/actions/helpers.ts`. Expected: no errors.
- [ ] **Step 4: Run** `pnpm exec knip --reporter compact` and confirm only actions not yet used by UI are reported (expected until `planning-page`).
