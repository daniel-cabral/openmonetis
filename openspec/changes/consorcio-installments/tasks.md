# Consórcio installments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Default execution in this repo: skill `executar-plano` (sdd.js).

**Goal:** A consórcio plan with a monthly installment projects its installments up to the bid and the remaining balance after it (reduced installment or reduced term), persisted in three nullable columns, editable in the plan dialog, and visible to the planner.

**Architecture:** Three optional fields on `ConsorcioFields` flow DB → `mappers.ts` → engine, and form → `plan-form.ts` → `planInputSchema` → `writes.ts`. Two pure helpers in `plan-types/consorcio.ts` (`consorcioTotalBid`, `postBidInstallment`) are shared by `expandConsorcioEvents` and the dialog preview (`consorcio-preview.ts`), so screen and engine agree. A pure `needsInstallmentMapping` feeds both the dialog warning and the planner context flag.

**Tech Stack:** TypeScript, Drizzle ORM + drizzle-kit, Zod 4, React 19 / shadcn, Vitest 4, Biome 2.

**Spec:** `docs/superpowers/specs/2026-11-24-planner-scenarios-design.md` (sections "Change B", "Grilling" 8-15, "Calls minhas"). Delta specs under `specs/`. Requires change `planner-scenarios` merged.

## Global Constraints

- Without `monthlyInstallment` (null, undefined or 0) every consórcio behaves exactly as today (flat mapped line, bid only). Existing tests stay green unchanged except fixtures/literals that must now carry the new keys.
- `monthlyInstallment` is always today's money (Grilling 9), corrected month by month by the plan index `ctx.indexForecastPct[plan.index]` with `inflateToMonth` (Grilling 8). Post-bid installments are corrected from the target month.
- Balance before the bid = installment corrected to the target month × months after the target up to `lastInstallmentMonth` inclusive; total bid = own cash + embedded (Grilling 11); new balance floored at 0.
- Each engine scenario slot (min/base/max) derives its post-bid installment from the bid in the same slot. Pessimistic (`max`) pays the largest bid and therefore the smallest post-bid installment. Intentional: keeps each scenario internally coherent (`pickAmount` picks by slot and does not require ordered ranges for expanded events).
- DB columns: `parcela_mensal numeric(12,2)`, `ultima_parcela text`, `modo_pos_lance text`, all nullable, no default.
- Validation messages (PT-BR, exact): `"Informe o mês da última parcela."`, `"A última parcela deve ser depois do mês alvo."` (Grilling 10).
- UI copy PT-BR; identifiers English. No mockup round (design "Calls minhas": 3 fields in the approved dialog pattern).
- Iterate with `pnpm exec vitest run <file>`; `tsc`, biome once at the end; full suite once. One heavy process at a time.
- Commits PT-BR `feat(planejamento): ...`, explicit paths only, `git status --short` before each commit. CRLF: biome per file with `tr -d '\r' < f | pnpm exec biome check --stdin-file-path=f`.

## Review Focus

1. `lastInstallmentMonth` equal to the target month (zero months left): rejected by validation, so the engine never divides by zero. Test in Task 1.
2. Bid larger than the remaining balance: no post-bid events, no negative amounts. Test in Task 3.
3. Plan with installment but no bid history: installment runs unchanged to the last month, no bid. Test in Task 4.
4. Editing an existing consórcio and clearing the installment field: saves nulls and the plan goes back to the mapped line. Test in Task 7 (form) and Task 4 (engine falls back when null).
5. Target month already in the past (before `ctx.start`): installments start at `ctx.start`; post-bid months before `ctx.start` are dropped by the existing range filter in `expandPlanEvents`. Locked by that filter; the implementer generates from `ctx.start`, never from a plan start.

---

### Task 1: Types and validation

**Files:**
- Modify: `src/features/planning/lib/engine/types.ts`, `src/features/planning/lib/schemas.ts` (`consorcioFieldsSchema` ~L35, `planInputSchema` superRefine)
- Test: `src/features/planning/lib/schemas.test.ts`

**Interfaces:**
- Produces: `export type PostBidMode = "reduce-installment" | "reduce-term";` `ConsorcioFields` gains `monthlyInstallment?: Cents | null; lastInstallmentMonth?: Period | null; postBidMode?: PostBidMode;` (optional: existing literals stay valid; absent `postBidMode` means `"reduce-installment"`). `consorcioFieldsSchema` gains `monthlyInstallment: amountCentsSchema.nullable().optional()`, `lastInstallmentMonth: periodSchema.nullable().optional()`, `postBidMode: z.enum(["reduce-installment", "reduce-term"]).optional()`. `planInputSchema` superRefine: for a consórcio with `monthlyInstallment > 0`, missing `lastInstallmentMonth` → issue at `["fields", "lastInstallmentMonth"]` `"Informe o mês da última parcela."`; `lastInstallmentMonth <= targetMonth` → `"A última parcela deve ser depois do mês alvo."`.

Test: extends `schemas.test.ts::planInputSchema rejects %s` (`it.each`: two new rows, installment `200_000` without last month, and last month equal to `targetMonth`) and `schemas.test.ts::accepts a goal plan and a consorcio plan` (one more `safeParse` with installment `200_000`, last month after the target, `postBidMode: "reduce-term"` → success).

- [x] **Step 1: Add the failing cases**.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/schemas.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement**.
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit** the three paths; `git commit -m "feat(planejamento): campos de parcela do consorcio com validacao"`.

### Task 2: Columns, migration, mapping and writes

**Files:**
- Modify: `src/db/schema.ts` (`plans` table ~L836-880: `monthlyInstallment: numeric("parcela_mensal", { precision: 12, scale: 2 })`, `lastInstallmentMonth: text("ultima_parcela")`, `postBidMode: text("modo_pos_lance")`), `src/features/planning/lib/mappers.ts` (`toPlanFields`), `src/features/planning/lib/writes.ts` (`toPlanColumns`: goal → three nulls; consórcio → `centsToDecimal` or null, month or null, mode or null)
- Create (generated): `drizzle/0041_*.sql`, `drizzle/meta/0041_snapshot.json`, `drizzle/meta/_journal.json` (modified)
- Test: `src/features/planning/lib/mappers.test.ts`

**Interfaces:**
- Consumes: `ConsorcioFields`, `PostBidMode` (Task 1).
- Produces: `toEnginePlan` consórcio fields with `monthlyInstallment: row.monthlyInstallment === null ? null : toCents(row.monthlyInstallment)`, `lastInstallmentMonth: row.lastInstallmentMonth`, `postBidMode: (row.postBidMode ?? "reduce-installment") as PostBidMode`.

Test: extends `mappers.test.ts::maps a consorcio row to cents fields and a null window when both bounds are null` (row with `monthlyInstallment: "2000.00"`, `lastInstallmentMonth: "2028-12"`, `postBidMode: "reduce-term"` → fields `200_000`, `"2028-12"`, `"reduce-term"`); the `planRow` fixture gains the three columns as `null`. `toPlanColumns`: none, because it is private and DB-bound; locked by `tsc` (the insert type requires the columns) and the manual check in Task 10.

- [ ] **Step 1:** Edit `src/db/schema.ts`.
- [ ] **Step 2: Run** `pnpm run db:generate` (if it requires `DATABASE_URL`, pass a dummy one: generate does not connect). Open the new SQL: Expected exactly three `ALTER TABLE "planejamento_planos" ADD COLUMN ...` statements (`"parcela_mensal" numeric(12, 2)`, `"ultima_parcela" text`, `"modo_pos_lance" text`), no `NOT NULL`, no `DEFAULT`, nothing else. Anything else: stop and report.
- [ ] **Step 3: Write the failing assertion** in `mappers.test.ts`; run `pnpm exec vitest run src/features/planning/lib/mappers.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `mappers.ts` and `writes.ts`; run the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/db/schema.ts`, the generated `drizzle/` files, `mappers.ts`, `writes.ts`, `mappers.test.ts`; `git commit -m "feat(planejamento): colunas de parcela do consorcio"`.

### Task 3: Post-bid helpers

**Files:**
- Modify: `src/features/planning/lib/engine/plan-types/consorcio.ts`
- Test: `src/features/planning/lib/engine/plan-types/consorcio.test.ts`

**Interfaces:**
- Consumes: `PostBidMode` (Task 1), `consorcioOwnCash`.
- Produces:

```ts
/** Own cash plus embedded part: the full bid that reduces the balance. */
export function consorcioTotalBid(fields: ConsorcioFields, pct: AmountRange, letterAtBid: Cents): AmountRange; // consorcioOwnCash with embeddedBid disabled
export function postBidInstallment(installmentAtTarget: Cents, monthsLeft: number, totalBid: Cents, mode: PostBidMode): { amount: Cents; months: number };
// balance = installmentAtTarget * monthsLeft; left = max(0, balance - totalBid)
// reduce-installment: left === 0 ? { amount: 0, months: 0 } : { amount: round(left / monthsLeft), months: monthsLeft }
// reduce-term: left === 0 ? { amount: 0, months: 0 } : { amount: installmentAtTarget, months: ceil(left / installmentAtTarget) }
```

Test: new `consorcio.test.ts::postBidInstallment` `it.each`, because distinct contract: `(200_000, 21, 3_000_000, "reduce-installment")` → `{ amount: 57_143, months: 21 }`; same with `"reduce-term"` → `{ amount: 200_000, months: 6 }`; `(200_000, 21, 5_000_000, "reduce-installment")` → `{ amount: 0, months: 0 }`; same with `"reduce-term"` → `{ amount: 0, months: 0 }`. New `consorcio.test.ts::consorcioTotalBid includes the embedded part`, because distinct contract: `fields({ marginPp: 0, embeddedBid: { enabled: true, pct: 10 } })`, pct `{ min: 30, base: 30, max: 30 }`, letter `10_000_000` → all `3_000_000` (while `consorcioOwnCash` gives `2_000_000`, already locked by the existing embedded test).

- [ ] **Step 1: Write the failing tests**.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/plan-types/consorcio.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** both paths; `git commit -m "feat(planejamento): saldo e parcela apos o lance do consorcio"`.

### Task 4: Installments in `expandConsorcioEvents`

**Files:**
- Modify: `src/features/planning/lib/engine/plan-types/consorcio.ts` (`expandConsorcioEvents`)
- Test: `src/features/planning/lib/engine/plan-types/consorcio.test.ts`

**Interfaces:**
- Consumes: `consorcioTotalBid`, `postBidInstallment` (Task 3), `inflateToMonth`, `bidPctRange`.
- Produces: when `fields.monthlyInstallment` is set and > 0 (else today's code path, untouched):
  - no `"mapped"` events;
  - outflow `label: "installment"` each month from `ctx.start` to `plan.targetMonth` inclusive, amount `inflateToMonth(installment, idx, ctx.start, month)` in all three slots;
  - the bid event as today (`label: plan.name`);
  - for k = 1.. months after the target: `label: "installment"`, slot s amount `k <= months_s ? inflateToMonth(amount_s, idx, targetMonth, month) : 0`, where `{ amount_s, months_s } = postBidInstallment(installmentAtTarget, monthsLeft, totalBid[s], mode)`, `monthsLeft` = months from target (exclusive) to `lastInstallmentMonth` (inclusive); skip months where all three slots are 0;
  - without bid history: `"installment"` from `ctx.start` to `lastInstallmentMonth` at the corrected installment, no bid.

Test: new tests in `describe("expandConsorcioEvents")`, because distinct setup (installment fields). Shared literal plan: `basis: "nominal"`, `index: "INCC"`, `targetMonth: "2027-03"`, `mappedMonthlyOutflow: 99_999`, `bidHistory: [{ month: "2027-02", winningBidPct: 30 }]`, fields `fields({ letterValue: 10_000_000, bidBase: "letter", marginPp: 0, monthlyInstallment: 200_000, lastInstallmentMonth: "2028-12" })`; ctx `start: "2027-01"`, `end: "2028-12"`, INCC 0, no stress.
  - "replaces the mapped line with installments and reduces the installment after the bid": `it.each` over embedded off / on 10% → bid event (label = plan name) `3_000_000` / `2_000_000`; no `"mapped"` event; `"installment"` events in 2027-01..2027-03 are `200_000`; the 21 events 2027-04..2028-12 are `57_143` (same in both rows: embedded counts in the total bid).
  - "reduce-term keeps the installment for fewer months": `postBidMode: "reduce-term"` → post-bid `"installment"` months exactly `2027-04`..`2027-09` at `200_000`.
  - "corrects the installment by the plan index": INCC 12 → `"installment"` in `2027-02` is `201_898`.
  - "without bid history the installment runs unchanged to the last month": `bidHistory: []` → 24 `"installment"` events of `200_000`, no bid event.

- [ ] **Step 1: Write the failing tests**.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/plan-types/consorcio.test.ts`. Expected: FAIL (existing tests still PASS).
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `pnpm exec vitest run src/features/planning/lib/engine`. Expected: PASS.
- [ ] **Step 5: Commit** both paths; `git commit -m "feat(planejamento): parcelas do consorcio na projecao"`.

### Task 5: Installment fields at the LLM boundary and in proposal descriptions

**Files:**
- Modify: `src/features/planning/lib/planner/llm-input.ts` (consórcio branch of `llmPlanFieldsSchema`: `monthlyInstallment: reais.nullable().optional()`, `lastInstallmentMonth: periodSchema.nullable().optional()`, `postBidMode: z.enum([...]).optional()`; `toPlanFields` converts the installment with `reaisToCents`), `src/features/planning/lib/planner/describe-change.ts` (`typeFieldRows`: when `monthlyInstallment` is set, rows `"Parcela mensal (hoje)"` → `formatCents`, `"Última parcela"` → month, `"Após o lance"` → `"Reduzir a parcela"` / `"Reduzir o prazo"`)
- Test: `src/features/planning/lib/planner/llm-input.test.ts`, `src/features/planning/lib/planner/describe-change.test.ts`

**Interfaces:**
- Consumes: Task 1 schema. Hypothetical installments through `run_projection` `changes` / `update-plan` then work with no tool change (design B.4).

Test: new `llm-input.test.ts::converts the consórcio installment from reais to cents`, because distinct field: `parseLlmProposal` with an `update-plan` patch whose consórcio `fields` carry `monthlyInstallment: 2000`, `lastInstallmentMonth: "2028-12"` → `proposal.changes[0].patch.fields.monthlyInstallment` `200_000`. New `describe-change.test.ts::lists the installment rows of a consórcio plan`, because distinct type branch (no existing describe-change test builds a consórcio): rows contain `["Parcela mensal (hoje)", "R$ 2.000,00"]` and `["Após o lance", "Reduzir o prazo"]`.

- [ ] **Step 1: Write the failing tests**.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/llm-input.test.ts src/features/planning/lib/planner/describe-change.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** the four paths; `git commit -m "feat(planejamento): parcela do consorcio nas propostas do planejador"`.

### Task 6: Unmapped-installment flag and fields in the planner context

**Files:**
- Modify: `src/features/planning/lib/consorcio-preview.ts` (helper), `src/features/planning/lib/planner/context.ts` (`LlmPlanFields` consórcio gains `monthlyInstallment: LlmMoney | null`, `lastInstallmentMonth: Period | null`, `postBidMode: PostBidMode`; each plan gains `installmentUnmapped: boolean`), `src/features/planning/lib/planner/system-prompt.ts` (glossary lines for `monthlyInstallment` (valor de hoje), `postBidMode` and `installmentUnmapped`: "parcela sem categoria mapeada; pode estar contada duas vezes (custo de vida e plano); avise o usuário")
- Test: `src/features/planning/lib/planner/context.test.ts`, `src/features/planning/lib/planner/system-prompt.test.ts`

**Interfaces:**
- Produces: `export function needsInstallmentMapping(fields: PlanTypeFields, categoryIds: string[]): boolean` (true iff consórcio, `monthlyInstallment > 0` and `categoryIds.length === 0`), used here and by the dialog in Task 9.

Test: new `context.test.ts::carries the consórcio installment and flags it when no category is mapped`, because distinct setup (consórcio plans with and without mapping): two consórcio `PlanView`s with installment `200_000`, `categoryIds` `[]` and `["<uuid>"]` → `installmentUnmapped` `true` / `false`, `fields.monthlyInstallment` `"R$ 2.000,00"`. Extends `system-prompt.test.ts::prompt carries glossary, tool-number rules and the answer discipline` with literal `"installmentUnmapped"`.

- [ ] **Step 1: Write the failing tests**.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/context.test.ts src/features/planning/lib/planner/system-prompt.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** the five paths; `git commit -m "feat(planejamento): planejador ve a parcela do consorcio e o aviso de mapeamento"`.

### Task 7: Plan form values

**Files:**
- Modify: `src/features/planning/lib/plan-form.ts`
- Test: `src/features/planning/lib/plan-form.test.ts`

**Interfaces:**
- Produces: `PlanFormValues` gains `monthlyInstallment: string` (default `""`), `lastInstallmentMonth: Period` (default the target month), `postBidMode: PostBidMode` (default `"reduce-installment"`). `planToForm` fills them (`centsToDecimal`, `?? plan.targetMonth`, `?? "reduce-installment"`). `formToPlanInput`: empty or zero installment → `monthlyInstallment: null, lastInstallmentMonth: null`, `postBidMode` kept; otherwise the three values.

Test: extends `plan-form.test.ts::round-trips a goal and a consorcio back to the same plan input` (consórcio literal gains `monthlyInstallment: 200_000`, `lastInstallmentMonth: "2028-12"`, `postBidMode: "reduce-term"`); new `plan-form.test.ts::stores no installment when the field is empty`, because distinct branch (the existing `formToPlanInput` test is goal-only): consórcio form with `monthlyInstallment: ""` → fields `monthlyInstallment: null`, `lastInstallmentMonth: null`.

- [ ] **Step 1: Write the failing tests**.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/plan-form.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** both paths; `git commit -m "feat(planejamento): parcela do consorcio no formulario do plano"`.

### Task 8: Installment after the bid in the preview

**Files:**
- Modify: `src/features/planning/lib/consorcio-preview.ts` (`BidPreview` gains `afterBid`)
- Test: `src/features/planning/lib/consorcio-preview.test.ts`

**Interfaces:**
- Consumes: `consorcioTotalBid`, `postBidInstallment` (Task 3).
- Produces: `BidPreview.afterBid: Record<"min" | "base" | "max", { amount: Cents; months: number }> | null`; null without bid history or without installment/last month. Uses the plan's `bidBase` (for `"both"` the same mix as the engine), the installment corrected to the target month with `inccPct` (the preview's existing index convention), and the plan's `postBidMode`.

Test: new `consorcio-preview.test.ts::previews the installment after the bid`, because distinct output field: fields `bidBase: "letter"`, `marginPp: 0`, letter `10_000_000`, installment `200_000`, last `"2028-12"`, history `[{ month: "2027-02", winningBidPct: 30 }]`, `inccPct` 0, start `"2027-01"`, target `"2027-03"`, basis `"nominal"` → `afterBid.base` `{ amount: 57_143, months: 21 }`. Extends `consorcio-preview.test.ts::returns no preview without bid history` with `afterBid: null` in its expected object.

- [ ] **Step 1: Write the failing tests**.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/consorcio-preview.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** both paths; `git commit -m "feat(planejamento): previa da parcela apos o lance"`.

### Task 9: Dialog fields, preview line and warning

**Files:**
- Modify: `src/features/planning/components/plan-dialog/consorcio-fields.tsx`, `src/features/planning/components/plan-dialog/plan-dialog.tsx` (pass `categoryIds={plan?.categoryIds ?? []}` to `ConsorcioFields`)

**Interfaces:**
- Consumes: `PlanFormValues` fields (Task 7), `BidPreview.afterBid` (Task 8), `needsInstallmentMapping` (Task 6), `MonthPicker` from `@/shared/components/ui/month-picker` (same usage as the target month in `common-fields.tsx`).
- Produces (copy PT-BR, same layout pattern as "Valor da carta" / "Base do lance"): `CurrencyInput` `"Parcela mensal (hoje)"` (`id="consorcio-installment"`); `MonthPicker` `"Última parcela"`; `Select` `"Após o lance"` with `"Reduzir a parcela"` / `"Reduzir o prazo"`; the preview table gains a row `"Parcela após o lance"` (min/base/max cells: `formatCents(amount)` for reduce-installment, `` `${formatCents(amount)} × ${months} meses` `` for reduce-term, `"Quitado"` when `months === 0`) shown only when `afterBid` is not null; warning `"Mapeie a categoria onde a parcela cai para ela sair do custo de vida."` when `needsInstallmentMapping(formToPlanInput(values).fields, categoryIds)`, styled like an existing muted warning in the feature (does not block saving).

Test: none, because UI wiring; preview math locked by Task 8, warning rule by Task 6, form values by Task 7.

- [ ] **Step 1: Implement** both components.
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Commit** both paths; `git commit -m "feat(planejamento): campos de parcela e aviso no dialogo do consorcio"`.

### Task 10: Closing checks, changelog and production check

**Files:**
- Modify: `CHANGELOG.md` (under the existing `## [Não lançado]`, `### Adicionado`: parcelas do consórcio na projeção, com redução de parcela ou de prazo após o lance; aviso de parcela sem categoria mapeada), `README.md` (Planejamento line ~86: mention the consórcio installments before and after the bid)

Test: none, because no behaviour change.

- [ ] **Step 1:** Edit `CHANGELOG.md` and `README.md`. No version bump, no tag (Grilling 14).
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Run** biome on every touched `.ts`/`.tsx` file (not the generated SQL/JSON): `for f in <files>; do tr -d '\r' < "$f" | pnpm exec biome check --stdin-file-path="$f" || echo "FAIL $f"; done`. Expected: no `FAIL`.
- [ ] **Step 4: Run** the full suite once: `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `CHANGELOG.md` and `README.md`; `git commit -m "docs: changelog das parcelas do consorcio"`.
- [ ] **Step 6: Production check (Chrome, after the deploy finished and serves this commit):** the entrypoint applied the migration (app loads `/planning` without error); edit the consórcio plan, fill installment, last month and mode, save, reopen: values persist (locks `toPlanColumns`); the preview shows "Parcela após o lance"; with no category mapped the warning appears; the liquidity chart shows the installments ending at the last month.
