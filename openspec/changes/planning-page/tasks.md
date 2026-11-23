# Planning page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Default execution in this repo: skill `executar-plano` (sdd.js).

**Goal:** Ship `/planning` in layout C (planner placeholder), with plan dialogs, monthly check-in, settings, stress, drift and assumption log, driven by `fetchPlanningSnapshot` and the client-side engine.

**Architecture:** Thin server page loads `PlanningSnapshot` and renders `PlanningPage` (client). `PlanningPage` computes `runProjection(applyStress(snapshot.input, activeStress))` in a `useMemo` and passes view models to presentational components. All logic that can be wrong lives in pure functions under `src/features/planning/lib/` and is unit-tested; components are verified by `tsc`, lint and a manual run (no React Testing Library in this repo).

**Tech Stack:** Next.js 16.3 App Router, React 19 (React Compiler), Tailwind 4, shadcn/ui from `src/shared/components/ui`, recharts 3 via `ChartContainer`, sonner toasts, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-23-financial-planning-design.md` (sections "4. Monthly check-in", "6. Assumption log", "UI decisions"). Visual reference: `src/app/preview-planning/planning-preview.tsx` variant `c` (read it before Task 4; delete it in Task 13).

## Global Constraints

- Depends on `planning-engine` and `planning-data` merged. Names used here: `runProjection`, `applyStress`, `stressEffects`, `detectDrift`, `liquidToday` (engine); `fetchPlanningSnapshot`, `PlanningSnapshot`, `PlanView`, `InvestmentAccountView`, `PositionView`, `ContributionRow`, `AssumptionView`, all actions in `src/features/planning/actions.ts`, `PlanInput`, `toCents` (data).
- Before writing the page, read `node_modules/next/dist/docs/01-app/` for pages and `connection()`; follow `src/app/(dashboard)/trips/page.tsx` as the thin-page model.
- UI copy in PT-BR; identifiers in English. Currency via `formatCurrency` (`src/shared/utils/currency.ts`); months via `formatShortPeriodLabel` / `MONTH_NAMES` (`src/shared/utils/period`).
- Status badge labels (exact): on-track `"Em dia"` (`variant="success"`), at-risk `"Em risco"` (outline warning), off-track `"Fora do eixo"` (`variant="destructive"`), as in the preview.
- Build only from existing ui components (Card, Table, Progress, Badge, ChartContainer, Dialog, Select, Input, CurrencyInput, Switch, Textarea, Button, Tooltip).
- After a mutation: toast the `ActionResult.message` or `error`, then `router.refresh()`.
- Public repo: no personal figures in code, fixtures or copy.
- Iterate with `pnpm exec vitest run --maxWorkers=4 <file>`; lint per file; `tsc` once at the end. Visual tweaks do not touch tests.
- Manual dev-server checks are best-effort; acceptance is `tsc` + lint + tests.
- Commits PT-BR `feat(planning): ...`, explicit paths only.

## Review Focus

1. Brand-new user (no investment account, no plans, no settings row): page renders empty states with guidance, KPIs show R$ 0,00 and missing values read "Sem dados". Test in Task 1.
2. Position older than 45 days: staleness shown as warning on the KPI and the account row. Test in Task 1.
3. Check-in contribution not assigned: counts as daily liquidity in the prefilled lines (spec). Test in Task 9.
4. Plan without any month in the horizon (all events clipped) or with zero required: coverage shows 100%, not NaN. Test in Task 2.
5. Consórcio with `bidBase "both"`: the dialog preview shows both bases side by side so the user can confirm later. Test in Task 7.

---

### Task 1: KPI view model

**Files:**
- Create: `src/features/planning/lib/view-model.ts`
- Test: `src/features/planning/lib/view-model.test.ts`

**Interfaces:**
- Consumes: `PlanningSnapshot`, `Projection`, `liquidToday`.
- Produces: `STALE_AFTER_DAYS = 45`; `type PlanningKpis = { totalPatrimony: Cents; stalestDays: number | null; isStale: boolean; liquidToday: Cents; reserveFloor: Cents; firstUnfunded: { month: Period; planName: string } | null }`; `buildKpis(snapshot: PlanningSnapshot, projection: Projection, today: Date): PlanningKpis` (total = sum of latest positions; `stalestDays` = age in days of the oldest account `lastAsOf`; first unfunded from the base scenario).

Test: new, because distinct contract.

- [x] **Step 1: Write the failing test**: empty snapshot → `{ totalPatrimony: 0, stalestDays: null, isStale: false, liquidToday: 0, reserveFloor: 0, firstUnfunded: null }`; two accounts as-of 10 and 50 days before `today` → `stalestDays 50`, `isStale true`; projection with base `firstUnfunded { month: "2027-02", planId: "p" }` → `planName` of plan `p`.
- [x] **Step 2: Run** `pnpm exec vitest run --maxWorkers=4 src/features/planning/lib/view-model.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement**.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planning): indicadores da pagina de planejamento"`.

### Task 2: Chart series and plan rows

**Files:**
- Modify: `src/features/planning/lib/view-model.ts`
- Test: extend `src/features/planning/lib/view-model.test.ts`

**Interfaces:**
- Produces: `type ChartPoint = { month: Period; label: string; base: Cents; pessimistic: Cents; required: Cents }`; `buildChartSeries(projection: Projection): ChartPoint[]` (liquid of base and pessimistic, required of base); `type PlanRow = { id: string; name: string; kind: "reserve" | "goal" | "consorcio"; priority: number; nonNegotiable: boolean; month: Period | null; target: Cents; coveragePct: number; health: PlanHealth }`; `buildPlanRows(plans: PlanView[], projection: Projection, kpis: PlanningKpis): PlanRow[]`: row 0 is the reserve (`id "reserve"`, name `"Reserva de emergência"`, target = floor, coverage = `min(100, round(100 × liquidToday / floor))` and 100 when floor is 0, health on-track when covered else off-track); then active plans by priority with `target = requiredByPlan` (base), `coveragePct = round(100 × (required - shortfall) / required)`, 100 when required is 0.

Test: extends `view-model.test.ts` (same fixtures).

- [x] **Step 1: Add failing assertions**: chart has one point per projection month with literal cents from a 2-month fixture; plan with `required 200_000` and `shortfall 50_000` → `coveragePct 75`; plan with `required 0` → `100`; reserve row first; reserve with floor `0` → `coveragePct 100` and `Number.isFinite(coveragePct)` (no NaN/Infinity).
- [x] **Step 2: Run** `pnpm exec vitest run --maxWorkers=4 src/features/planning/lib/view-model.test.ts`. Expected: FAIL on the new assertions.
- [x] **Step 3: Implement**.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planning): series do grafico e linhas da tabela de planos"`.

### Task 3: Route, page shell and navbar

**Files:**
- Create: `src/app/(dashboard)/planning/page.tsx`, `src/features/planning/components/planning-page.tsx`, `src/features/planning/components/planner-placeholder.tsx`
- Modify: `src/shared/components/navigation/navbar/nav-items.tsx` (item `{ href: "/planning", label: "Planejamento", description: "Metas, liquidez e planos futuros", icon: <RiCompass3Line /> }` in the "Relatórios" group before "Insights")

**Interfaces:**
- Consumes: `fetchPlanningSnapshot`, `getUserId`, `runProjection`, Task 1 and 2.
- Produces: `PlanningPage(props: { snapshot: PlanningSnapshot; today: string }): JSX.Element` (client), holding state `activeStress: StressToggles` (default `{}`) and computing `projection`, `kpis`, `chart`, `rows` with `useMemo`. Layout: header, KPI slot, `grid lg:grid-cols-5` with left `lg:col-span-2` `PlannerPlaceholder` and right `lg:col-span-3` chart and table slots (KPI, chart and table slots are filled by Task 4 only).
- Placeholder copy: title `"Planejador"`, body `"O planejador com IA chega em breve. Enquanto isso, use o check-in e os ajustes."`

Test: none, because thin route and layout (no logic beyond Tasks 1 and 2); verified by tsc and a manual run.

- [x] **Step 1:** Write the page (`await connection()`, `getUserId()`, `fetchPlanningSnapshot(userId)`).
- [x] **Step 2:** Write `PlanningPage` shell and `PlannerPlaceholder`; add the navbar item.
- [ ] **Step 3: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 4: Manual check (best-effort)**: `pnpm run dev` (one heavy process at a time), open `/planning` logged in. Expected: header, placeholder and empty slots render with no console error.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): rota /planning com layout da pagina"`.

### Task 4: KPI row, liquidity chart and plans table

**Files:**
- Create: `src/features/planning/components/kpi-row.tsx`, `liquidity-chart.tsx`, `plans-table.tsx`, `health-badge.tsx` (all under `src/features/planning/components/`)
- Modify: `src/features/planning/components/planning-page.tsx`

**Interfaces:**
- Consumes: `PlanningKpis`, `ChartPoint[]`, `PlanRow[]`.
- Produces: `KpiRow({ kpis })`, `LiquidityChart({ points, previewLabel?: string })` (base `Area`, pessimistic `Line strokeDasharray="4 4"`, required `Line type="stepAfter"`; `previewLabel` is used by `planning-planner`), `PlansTable({ rows, onEdit(planId) })`, `HealthBadge({ health })`.
- Copy: KPI titles `"Patrimônio total"` (with `"atualizado há N dias"`, warning tone when `isStale`), `"Liquidez hoje"`, `"Piso da reserva"`, `"Primeiro mês descoberto"` (`"Sem furo no horizonte"` when null, else `"<mês> · <plano> cede"`); table headers `"Prioridade", "Plano", "Tipo", "Mês", "Cobertura", "Status"`; tag `"Inegociável"`.

Test: none, because presentational over Tasks 1 and 2 view models.

- [ ] **Step 1:** Implement the four components following the preview variant c structure.
- [ ] **Step 2:** Wire them into `PlanningPage`.
- [ ] **Step 3: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 4: Manual check (best-effort)** with dev server: chart lines and table render with at least one plan created via Task 6 later, or with seeded test data in a local db only.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): indicadores, grafico de liquidez e tabela de planos"`.

### Task 5: Plan form mapping

**Files:**
- Create: `src/features/planning/lib/plan-form.ts`
- Test: `src/features/planning/lib/plan-form.test.ts`

**Interfaces:**
- Consumes: `PlanInput`, `PlanView`.
- Produces: `type PlanFormValues` (strings as typed in inputs: amounts in BRL decimal strings, months `YYYY-MM`, `hasWindow: boolean`, `hasRange: boolean`); `emptyPlanForm(type: "goal" | "consorcio", currentMonth: Period): PlanFormValues`; `planToForm(plan: PlanView): PlanFormValues`; `formToPlanInput(values: PlanFormValues): PlanInput` (amount strings → cents via `toCents` after `normalizeDecimalInput`; `hasRange false` → `min = base = max`; `hasWindow false` → `window null`).

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: goal form with `"1.500,00"` and no range → `target { min: 150_000, base: 150_000, max: 150_000 }`; round trip `formToPlanInput(planToForm(plan))` equals the plan's `PlanInput` fields for one goal and one consórcio fixture.
- [ ] **Step 2: Run** `pnpm exec vitest run --maxWorkers=4 src/features/planning/lib/plan-form.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): mapeamento do formulario de plano"`.

### Task 6: Plan dialog, goal fields and delete/reorder

**Files:**
- Create: `src/features/planning/components/plan-dialog/plan-dialog.tsx`, `goal-fields.tsx`, `common-fields.tsx`
- Modify: `plans-table.tsx` (row actions: editar, subir, descer, excluir with `AlertDialog`), `planning-page.tsx` (button `"Novo plano"` with type choice `"Objetivo"` / `"Consórcio"`)

**Interfaces:**
- Consumes: Task 5, `createPlanAction`, `updatePlanAction`, `deletePlanAction`, `reorderPlansAction`, `snapshot.accounts` (pots = `isEarmarkedPot`).
- Produces: `PlanDialog({ open, onOpenChange, type, plan?: PlanView, potAccounts: InvestmentAccountView[], currentMonth })`; type-specific fields render through a `fields` slot so Task 7 plugs in consórcio.
- Common fields copy: `"Nome"`, `"Inegociável"`, `"Status"` (`Rascunho, Ativo, Pausado, Concluído, Abandonado`), `"Valor em"` (`"Dinheiro de hoje"` / `"Valor nominal"`), `"Índice"` (`IPCA` / `INCC`), `"Mês alvo"`, `"Janela flexível"` (earliest/latest), `"Potes que podem pagar"`.

Test: none, because form-to-input logic is locked by Task 5 and validation by `planning-data` Task 5.

- [ ] **Step 1:** Implement the dialog and goal fields; submit via `formToPlanInput` then create/update action.
- [ ] **Step 2:** Row actions in the table (`reorderPlansAction` with the swapped id list).
- [ ] **Step 3: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 4: Manual check (best-effort)**: create a goal, edit it, move it, delete it; toasts appear and the table updates after refresh.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): dialogo de plano do tipo objetivo"`.

### Task 7: Consórcio fields with bid preview

**Files:**
- Create: `src/features/planning/components/plan-dialog/consorcio-fields.tsx`, `src/features/planning/lib/consorcio-preview.ts`
- Test: `src/features/planning/lib/consorcio-preview.test.ts`

**Interfaces:**
- Consumes: `bidPctRange`, `consorcioOwnCash`, `inflateToMonth` (engine).
- Produces: `type BidPreview = { pct: AmountRange | null; letter: AmountRange | null; outstanding: AmountRange | null }`; `buildBidPreview(fields: ConsorcioFields, history: BidPoint[], inccPct: number, start: Period, targetMonth: Period): BidPreview` (both bases computed always, so `"both"` can be confirmed later).
- Copy: `"Valor da carta (hoje)"`, `"Saldo devedor"`, `"Base do lance"` (`"Valor da carta"`, `"Saldo devedor"`, `"Ainda não sei (mostrar as duas)"`), `"Margem sobre o lance vencedor (p.p.)"`, `"Lance embutido"` + `"% da carta"` (max 30), note `"Sem FGTS neste plano."`; preview table with min/base/max per base.

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: history and fields of engine Task 4/5 (INCC 10, start `2027-01`, target `2028-01`) → `letter { min: 352_000, base: 418_000, max: 418_000 }`, `outstanding { min: 256_000, base: 304_000, max: 304_000 }`; empty history → all `null`.
- [ ] **Step 2: Run** `pnpm exec vitest run --maxWorkers=4 src/features/planning/lib/consorcio-preview.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helper and `ConsorcioFields` component (plug into `PlanDialog`).
- [ ] **Step 4: Run** the test. Expected: PASS. Then `pnpm exec tsc --noEmit`: exit 0.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): campos e previa de lance do consorcio"`.

### Task 8: Plan events editor and category mapping

**Files:**
- Create: `src/features/planning/components/plan-dialog/plan-events-editor.tsx`, `category-mapping-field.tsx`
- Modify: `src/features/planning/components/plan-dialog/plan-dialog.tsx` (sections shown only when editing an existing plan)
- Modify: `src/features/planning/lib/plan-form.ts`; Test: extend `plan-form.test.ts`

**Interfaces:**
- Consumes: `savePlanEventAction`, `deletePlanEventAction`, `setPlanCategoryMappingsAction`, expense categories (pass `categories: { id: string; name: string }[]` from the page; add `expenseCategories` to the page query in `src/app/(dashboard)/planning/page.tsx` via the existing categories fetch used by other pages, filtered `type = "despesa"`).
- Produces: `eventFormToInput(values: PlanEventFormValues, planId: string): PlanEventInputData` in `plan-form.ts` (`kind "one-off"` → `endMonth = startMonth`; `kind "recurring"` with empty end → `null`).
- Copy: `"Eventos do plano"`, `"Pagamento único"` / `"Mudança recorrente"`, `"Saída"` / `"Entrada"`, `"Faixa (mín, base, máx)"`; `"Categorias deste plano"` with hint `"Saem do custo de vida e entram como saída do plano."`

Test: extends `plan-form.test.ts` (same form-mapping contract).

- [ ] **Step 1: Add failing assertions** for `eventFormToInput` (one-off and open recurring).
- [ ] **Step 2: Run** `pnpm exec vitest run --maxWorkers=4 src/features/planning/lib/plan-form.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helper and both components.
- [ ] **Step 4: Run** again (PASS) and `pnpm exec tsc --noEmit` (exit 0).
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): eventos do plano e categorias mapeadas"`.

### Task 9: Check-in contribution assignment

**Files:**
- Create: `src/features/planning/lib/check-in.ts`
- Test: `src/features/planning/lib/check-in.test.ts`

**Interfaces:**
- Consumes: `PositionView`, `ContributionRow`.
- Produces: `type ContributionAssignment = { contributionId: string; accountId: string; liquidity: LiquidityKind; maturityMonth: Period | null; amount: Cents }`; `type PositionLineDraft = { description: string; amount: Cents; liquidity: LiquidityKind; maturityMonth: Period | null; annualRealReturnPct: number | null }`; `defaultAssignment(row: ContributionRow, accountId: string): ContributionAssignment` (daily); `prefillPositionLines(current: PositionView[], assignments: ContributionAssignment[], accountId: string): PositionLineDraft[]` (copies the account's current lines; each assignment of that account adds to the line with the same liquidity and maturity month, else appends `"Aporte <dd/mm>"`).

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: current daily `100_000` and maturity `2028-05` `50_000`; assignments daily `10_000`, maturity `2028-05` `5_000`, maturity `2029-01` `7_000`, one for another account → lines `[daily 110_000, 2028-05 55_000, 2029-01 7_000]`; unassigned (default) contribution adds to daily.
- [ ] **Step 2: Run** `pnpm exec vitest run --maxWorkers=4 src/features/planning/lib/check-in.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): atribuicao de aportes no check-in"`.

### Task 10: Check-in dialog

**Files:**
- Create: `src/features/planning/components/check-in/check-in-dialog.tsx`, `contributions-step.tsx`, `balances-step.tsx`, `bids-step.tsx`
- Modify: `planning-page.tsx` (header button `"Check-in de <mês>"` using `MONTH_NAMES` in lowercase)

**Interfaces:**
- Consumes: Task 9, `replaceAccountPositionsAction`, `setAccountEarmarkedAction`, `recordWinningBidAction`, `snapshot.currentMonthContributions`, `snapshot.accounts`, consórcio `snapshot.plans`.
- Produces: `CheckInDialog({ snapshot, open, onOpenChange })` with three steps (`"Aportes do mês"`, `"Saldos por conta"`, `"Lance vencedor"`). Step 2 shows each account with `"atualizado há N dias"`, editable lines (prefilled from step 1), `"Pote reservado"` switch, `"Salvar conta"` per account (as-of = today). Step 3: one percentage input per active consórcio plan for the current month. Steps save independently.

Test: none, because prefill logic is locked by Task 9 and persistence by `planning-data` Tasks 11 and 13.

- [ ] **Step 1:** Implement the dialog and steps.
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Manual check (best-effort)**: assign a contribution, save an account, record a bid; KPIs and chart update after refresh.
- [ ] **Step 4: Commit**; `git commit -m "feat(planning): check-in mensal"`.

### Task 11: Settings dialog and assumption log card

**Files:**
- Create: `src/features/planning/components/settings-dialog.tsx`, `assumption-log-card.tsx`, `src/features/planning/lib/labels.ts`
- Modify: `planning-page.tsx` (header button `"Ajustes"`; log card below the table)

**Interfaces:**
- Consumes: `savePlanningSettingsAction`, `addAssumptionAction`, `snapshot.settings`, `snapshot.assumptions`.
- Produces: `ASSUMPTION_KIND_LABEL: Record<string, string>` (`contribution "Aporte"`, `return "Retorno"`, `bid "Lance"`, `index "Índice"`, `"plan-change" "Mudança de plano"`, `other "Outro"`), `SOURCE_LABEL` (`user "Você"`, `planner "Planejador"`). Settings copy: `"Aporte mensal planejado"`, `"Meses de reserva"`, `"Meses da linha de base"`, `"Previsão IPCA (% a.a.)"`, `"Previsão INCC (% a.a.)"`, `"Fim do horizonte (opcional)"`, stress fields. Log card: `"Premissas e decisões"`, list (date, kind, source, summary, `"revisar em <mês>"`), small form `"Registrar premissa"`.

Test: none, because presentational; persistence locked by `planning-data` Tasks 10 and 13.

- [ ] **Step 1:** Implement both components and labels.
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Manual check (best-effort)**: change IPCA forecast; a new `"Índice"` entry appears in the log.
- [ ] **Step 4: Commit**; `git commit -m "feat(planning): ajustes e registro de premissas na pagina"`.

### Task 12: Stress card and drift banner

**Files:**
- Create: `src/features/planning/components/stress-card.tsx`, `drift-banner.tsx`, `src/features/planning/lib/drift-view.ts`
- Test: `src/features/planning/lib/drift-view.test.ts`
- Modify: `planning-page.tsx`

**Interfaces:**
- Consumes: `stressEffects`, `detectDrift`, `snapshot.settings` (stress values), `snapshot.contributionsByMonth`.
- Produces: `driftMessages(signals: DriftSignal[], planNames: Record<string, string>): string[]` (PT-BR, one per signal: `"<plano> está em risco"`, `"<plano> está fora do eixo"`, `"Reserva abaixo do piso em R$ X"`, `"Aporte abaixo do planejado em <mês> e <mês>"`). `StressCard({ effects, active, onToggle })`: one row per toggle (`"Aporte cai para R$ X"`, `"Sem renda por N meses"`, `"Lance no máximo da faixa"`, `"Planos custam +X%"`) with the slack delta and first unfunded month; checking a toggle sets `activeStress` in `PlanningPage` so chart and table show the stressed projection. `DriftBanner({ messages, onDiscuss?: () => void })` hidden when empty (`onDiscuss` is wired by `planning-planner` Task 14).

Test: new, because `driftMessages` is a distinct contract (assert each kind produces a message containing the plan name or formatted amount, not the full sentence).

- [ ] **Step 1: Write the failing test** with one `it.each` over the four signal kinds.
- [ ] **Step 2: Run** `pnpm exec vitest run --maxWorkers=4 src/features/planning/lib/drift-view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** helper and both components; wire into the page.
- [ ] **Step 4: Run** the test (PASS) and `pnpm exec tsc --noEmit` (exit 0).
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): cenarios de estresse e alerta de desvio na pagina"`.

### Task 13: Remove preview, version and closing checks

**Files:**
- Delete: `src/app/preview-planning/page.tsx`, `src/app/preview-planning/planning-preview.tsx` (untracked: plain `rm -r`)
- Modify: `CHANGELOG.md`, `package.json` (`version`), `README.md` (badge and a short "Planejamento" line in the features list)

Test: none, because no behaviour change in tested code; the existing changelog/version coherence test covers the bump.

- [ ] **Step 1:** Delete the preview folder; `git grep -n "preview-planning"` returns nothing.
- [ ] **Step 2:** Bump to the next minor of the current `package.json` version; add the `CHANGELOG.md` entry with the introductory paragraph (AGENTS.md rule 6) and `### Adicionado`; update the README badge.
- [ ] **Step 3: Run** `pnpm exec vitest run --maxWorkers=4 src/features/planning src/features/settings/lib/parse-changelog.test.ts`. Expected: PASS.
- [ ] **Step 4: Run** `pnpm exec tsc --noEmit` and `pnpm exec biome check --formatter-enabled=false src/features/planning 'src/app/(dashboard)/planning' src/shared/components/navigation`. Expected: clean.
- [ ] **Step 5: Run** the full suite once: `pnpm exec vitest run --maxWorkers=4`. Expected: PASS.
- [ ] **Step 6: Commit** `git add` the changed paths and the deletion by path (`git rm -r --cached` not needed: the folder was never tracked); `git commit -m "feat(planning): pagina de planejamento e versao X.Y.0"`. Do not tag.
