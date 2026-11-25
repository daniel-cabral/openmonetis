# Planner scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Default execution in this repo: skill `executar-plano` (sdd.js).

**Goal:** The planner simulates user hypotheses (winning bid, positions, ad-hoc cash) without persisting, does every non-engine calculation through a deterministic `finance_calc` tool, asks for missing data instead of refusing, and declares its assumptions.

**Architecture:** Pure `applyScenario(input, scenario)` (`lib/planner/scenario.ts`) rewrites an `EngineInput` copy before `run_projection` / `simulate_lever`; ad-hoc cash goes into a new optional `EngineInput.adhocEvents` read by the monthly loop in `project.ts`. Pure financial functions in cents (`lib/finance.ts`) back one tool `finance_calc` with an `op` discriminator. Reais become cents only in `llm-input.ts`; cents become reais only in `toModelOutput` (`llm-format.ts`). Prompt and web-search policy text change; `PLANNER_MAX_STEPS` goes to 12.

**Tech Stack:** TypeScript, Zod 4, AI SDK 6 `tool`, Vitest 4, Biome 2.

**Spec:** `docs/superpowers/specs/2026-11-24-planner-scenarios-design.md` (sections "Change A", "Grilling" 1-7, "Calls minhas"). Delta specs: `specs/planning-planner/spec.md`, `specs/planning-engine/spec.md`.

## Global Constraints

- Simulation never persists. `scenario` exists only on `run_projection` and `simulate_lever`, never on `propose_change`.
- Engine values and `execute` results stay `Cents`; tool inputs take reais (max 2 decimals, `reaisToCents`); model-facing money uses `formatCentsForLlm` (test literals like `"R$ 250,00"`, non-breaking space).
- The engine already exports a type named `Scenario` (`"pessimistic" | "base" | "optimistic"`). The planner hypothesis type is `PlannerScenario`; never reuse `Scenario`.
- Errors the model can fix return `{ error: string }` from the tool (throw `ProposalError` or `FinanceError`, caught by `toErrorOutput` in `tools.ts`); never throw out of `execute`.
- Rates in the calculator are % a.a., converted to monthly by `(1 + r/100) ** (1/12) - 1` (Grilling 4).
- UI copy and prompt text PT-BR; identifiers and comments English. Features never import other features.
- Iterate with `pnpm exec vitest run <file>`; `tsc` and biome once at the end; full suite once. One heavy process at a time.
- Commits PT-BR `feat(planejamento): ...`, explicit paths only (never `git add -A` / `.`), `git status --short` before each commit.
- Local files are CRLF: check biome per file with `tr -d '\r' < f | pnpm exec biome check --stdin-file-path=f`.

## Review Focus

1. Scenario naming a plan id that is not consórcio, or a position id that does not exist: tool returns `{ error }`, not a throw or a silent no-op. Test in Task 4.
2. `finance_calc` with inputs that have no finite answer (perpetuity at 0% real rate, installment that does not cover the interest, drawdown without months): `{ error }` with a PT-BR message. Tests in Tasks 1 and 2.
3. Prompt without web search must not contain "pesquis" or "confirm" (existing assertion in `system-prompt.test.ts`): new rules must avoid those words. Locked by the existing test kept green in Task 7.
4. Term (NPER) floating error: `11.999995` must give 12, not 13 (`Math.ceil(n - 1e-9)`). Test in Task 1.
5. `bidAtRangeMax` stress with a hypothetical bid has no effect (Grilling 2). Assertion in Task 4.

---

### Task 1: Financial calculator functions

**Files:**
- Create: `src/features/planning/lib/finance.ts`
- Test: `src/features/planning/lib/finance.test.ts`

**Interfaces:**
- Produces:

```ts
export class FinanceError extends Error {}
export function monthlyRate(annualPct: number): number; // (1 + a/100) ** (1/12) - 1
export function installmentFor(principal: Cents, months: number, annualPct: number): Cents; // rate 0 => round(principal / months)
export function termFor(principal: Cents, installment: Cents, annualPct: number): number; // months, Math.ceil(n - 1e-9)
export function presentValue(installment: Cents, months: number, annualPct: number): Cents; // rate 0 => installment * months
export function capitalForIncome(monthlyIncome: Cents, annualRealPct: number, mode: "perpetuity" | "drawdown", months?: number): Cents;
export type FinanceRequest =
	| { op: "installment"; principal: Cents; months: number; annualRatePct: number }
	| { op: "term"; principal: Cents; installment: Cents; annualRatePct: number }
	| { op: "present_value"; installment: Cents; months: number; annualRatePct: number }
	| { op: "capital_for_income"; monthlyIncome: Cents; annualRealRatePct: number; mode: "perpetuity" | "drawdown"; months?: number };
export type FinanceResult = { request: FinanceRequest; value: number; unit: "cents" | "months"; outsideProjection: true };
export function runFinanceCalc(request: FinanceRequest): FinanceResult;
```

- Errors (`FinanceError`, exact PT-BR): perpetuity with rate ≤ 0 → `"Perpetuidade exige taxa real maior que zero."`; term where `installment <= principal * r` → `"A parcela não cobre os juros do saldo."`; drawdown without months → `"Informe em quantos meses o capital será consumido."`.

Test: new, because distinct contract (new module).

- [x] **Step 1: Write the failing tests** in `finance.test.ts`:
  - `it.each` "computes <op>" over `runFinanceCalc` with literal values: installment `{ principal: 10_000_000, months: 12, annualRatePct: 12 }` → `885_621` cents; installment `{ principal: 12_000_000, months: 120, annualRatePct: 0 }` → `100_000`; term `{ principal: 10_000_000, installment: 885_621, annualRatePct: 12 }` → `12` months (locks the `1e-9` ceil); term at 0% `{ principal: 1_000_000, installment: 300_000 }` → `4`; present_value `{ installment: 100_000, months: 12, annualRatePct: 12 }` → `1_129_152`; capital perpetuity `{ monthlyIncome: 500_000, annualRealRatePct: 6 }` → `102_721_070`; capital drawdown 240 months, 6% → `70_692_154`. Each case also asserts `outsideProjection: true` and the `unit`.
  - `it.each` "rejects <case>" over the three error inputs → `toThrow(FinanceError)` with the exact message.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/finance.test.ts`. Expected: FAIL (module missing).
- [x] **Step 3: Implement** `finance.ts` with the signatures above (standard PMT, NPER, PV annuity formulas; perpetuity = `round(income / r)`).
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit** `finance.ts` and its test; `git commit -m "feat(planejamento): calculadora financeira deterministica"`.

### Task 2: `finance_calc` tool

**Files:**
- Modify: `src/features/planning/lib/planner/llm-input.ts` (schema + converter), `src/features/planning/lib/planner/llm-format.ts` (model view), `src/features/planning/lib/planner/tools.ts` (tool, `toErrorOutput` also catches `FinanceError`)
- Test: `src/features/planning/lib/planner/tools.test.ts`

**Interfaces:**
- Consumes: `runFinanceCalc`, `FinanceRequest`, `FinanceResult`, `FinanceError` (Task 1); `reaisToCents`, `formatCentsForLlm`.
- Produces:
  - `llmFinanceCalcSchema` (reais): discriminated by `op`; `installment { principal, months: int 1..600, annualRatePct: number 0..100 default 0 }`, `term { principal, installment, annualRatePct default 0 }`, `present_value { installment, months, annualRatePct default 0 }`, `capital_for_income { monthlyIncome, annualRealRatePct: number -10..100, mode: enum, months?: int 1..600 }`; `toFinanceRequest(input: LlmFinanceCalc): FinanceRequest`.
  - `toLlmFinanceResult(result: FinanceResult)`: `{ op, result: string, assumptions: Record<string, string | number>, outsideProjection: true }`; `result` is `formatCentsForLlm(value)` for `"cents"` and `"<n> meses"` for `"months"`; money fields in `assumptions` formatted in reais, rates as numbers.
  - Tool `finance_calc` in `buildPlannerTools`, description PT-BR stating it is a calculation outside the plan projection and values are in reais.

Test: extends `tools.test.ts::exposes only the five planner tools when the model has no web search` (now six names, add `"finance_calc"`; rename to "exposes only the six planner tools ..."); new `tools.test.ts::finance_calc returns a reais view marked outside the projection, and an error for a perpetuity at zero rate`, because distinct contract (tool boundary: reais in, cents result, reais view).

- [x] **Step 1: Write the failing tests**: execute `{ op: "installment", principal: 1000, months: 4 }` → output `toMatchObject({ value: 25_000, unit: "cents", outsideProjection: true })`; `toModelOutput` value `toMatchObject({ op: "installment", result: "R$ 250,00", outsideProjection: true })`; execute `{ op: "capital_for_income", monthlyIncome: 5000, annualRealRatePct: 0, mode: "perpetuity" }` → `{ error: "Perpetuidade exige taxa real maior que zero." }`. Extend the tool-names assertion.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/tools.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** schema, converter, view and tool.
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit** the four paths; `git commit -m "feat(planejamento): ferramenta finance_calc no planejador"`.

### Task 3: Ad-hoc cash events in the engine

**Files:**
- Modify: `src/features/planning/lib/engine/types.ts` (type + optional field), `src/features/planning/lib/engine/project.ts` (monthly loop)
- Test: `src/features/planning/lib/engine/project.test.ts`

**Interfaces:**
- Produces: `export type AdhocCashEvent = { month: Period; direction: Direction; amount: Cents; label: string };` and `EngineInput.adhocEvents?: AdhocCashEvent[]` (optional so existing `EngineInput` literals and `test-fixtures.ts` stay valid). In `projectScenario`, the month's ad-hoc inflows are added and outflows subtracted in the same `general` update as `regular - irregular + inflows`, identical in all scenarios, before plan claims.

Test: new `project.test.ts::adds ad-hoc cash to general in its month and lets an outflow go below the floor`, because distinct setup (no plans, ad-hoc events only).

- [x] **Step 1: Write the failing test**: `engineInput({ startMonth: "2027-01", horizonEnd: "2027-03", positions: [position({ amount: 100_000 })], adhocEvents: [{ month: "2027-02", direction: "inflow", amount: 50_000, label: "bônus" }, { month: "2027-03", direction: "outflow", amount: 200_000, label: "reforma" }] })`; `runProjection(...).scenarios.base.months` → `slack` `[100_000, 150_000, -50_000]`, last row `reserveBreached: true`; pessimistic `slack` equal to base.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/project.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement**.
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit** the three paths; `git commit -m "feat(planejamento): entradas e saidas avulsas no motor"`.

### Task 4: `applyScenario`

**Files:**
- Create: `src/features/planning/lib/planner/scenario.ts`
- Test: `src/features/planning/lib/planner/scenario.test.ts`

**Interfaces:**
- Consumes: `AdhocCashEvent`, `EngineInput.adhocEvents` (Task 3); `ProposalError` (`proposal.ts`); fixtures `engineInput`, `goalPlan`, `position` (`engine/test-fixtures.ts`).
- Produces:

```ts
export type PlannerScenario = {
	winningBidPct?: { planId: string; pct: number }[];
	positions?: {
		add?: { accountId: string | null; amount: Cents; liquidity: LiquidityKind; maturityMonth: Period | null; annualRealReturnPct: number | null }[];
		remove?: string[];
		edit?: { id: string; amount?: Cents; liquidity?: LiquidityKind; maturityMonth?: Period | null; annualRealReturnPct?: number | null }[];
	};
	cashEvents?: AdhocCashEvent[];
};
export function applyScenario(input: EngineInput, scenario: PlannerScenario): EngineInput;
```

- Rules: `winningBidPct` replaces the plan's `bidHistory` with `[{ month: plan.targetMonth, winningBidPct: pct }]` (margin stays); unknown plan → `ProposalError("Plano não encontrado.")`; non-consórcio → `ProposalError("O lance hipotético só vale para consórcio.")`. Positions: remove, then edit, then add; unknown id → `ProposalError("Posição não encontrada.")`; added ids `scenario-position-<index>`, `accountId: null` becomes `"scenario"` (not a pot, so it lands in general). `cashEvents` appended to `adhocEvents`. Input never mutated.

Test: new, because distinct contract (new module). One `describe("applyScenario")` with three tests.

- [x] **Step 1: Write the failing tests**:
  - "replaces the bid history with the hypothetical bid at the target month, keeping the margin": `engineInput({ startMonth: "2027-01", horizonEnd: "2027-06", plans: [...] })` with a consórcio plan (build with `goalPlan(id, "2027-03", ..., { fields: { type: "consorcio", letterValue: 10_000_000, outstandingBalance: 0, bidBase: "letter", marginPp: 3, embeddedBid: { enabled: false, pct: 0 } }, bidHistory: [{ month: "2026-12", winningBidPct: 40 }] })`), scenario `{ winningBidPct: [{ planId, pct: 66 }] }` → plan `bidHistory` `[{ month: "2027-03", winningBidPct: 66 }]`; `runProjection(applyStress(result, { bidAtRangeMax: true })).scenarios.pessimistic.requiredByPlan[planId]` is `6_900_000` (69% of the letter, Grilling 2); original input's `bidHistory` unchanged.
  - "removes, edits and adds positions": positions `p1` 100_000 daily, `p2` 50_000 daily; scenario remove `["p2"]`, edit `[{ id: "p1", amount: 30_000 }]`, add one `{ accountId: null, amount: 10_000, liquidity: "daily", maturityMonth: null, annualRealReturnPct: null }` → positions `toEqual` the literal array (p1 with 30_000, then `{ id: "scenario-position-0", accountId: "scenario", ... }`).
  - "rejects unknown references": `it.each` over unknown plan id, goal plan id with a bid, unknown position id in `edit` → `toThrow` with the exact messages above.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/scenario.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement**.
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit** both paths; `git commit -m "feat(planejamento): cenario hipotetico aplicado ao motor"`.

### Task 5: LLM scenario schema

**Files:**
- Modify: `src/features/planning/lib/planner/llm-input.ts`
- Test: `src/features/planning/lib/planner/llm-input.test.ts`

**Interfaces:**
- Consumes: `PlannerScenario` (Task 4).
- Produces: `llmScenarioSchema` (reais, every array `.max(10)`): `winningBidPct: [{ planId: z.uuid(), pct: number 0..100 }]`; `positions: { add: [{ accountId: z.uuid().nullable().default(null), amount: reais, liquidity: enum, maturityMonth: periodSchema.nullable().default(null), annualRealReturnPct: number.nullable().default(null) }], remove: [z.string()], edit: [...] }` with a refine on `add`/`edit` items: `liquidity === "maturity"` requires `maturityMonth` (`"Informe o vencimento da posição."`); `cashEvents: [{ month: periodSchema, direction: z.enum(["in", "out"]), amount: reais, label: string 1..80 }]`. `export type LlmScenario`; `toScenario(input: LlmScenario): PlannerScenario` (reais via `reaisToCents`, `"in"`→`"inflow"`, `"out"`→`"outflow"`).

Test: new `llm-input.test.ts::converts a reais scenario to cents and maps cash directions`, because distinct contract (new converter). The 2-decimal rule is already locked for `reaisToCents` by the existing `parseLlmProposal` `it.each`; not re-asserted here.

- [x] **Step 1: Write the failing test**: `toScenario({ positions: { add: [{ accountId: null, amount: 1500.5, liquidity: "daily", maturityMonth: null, annualRealReturnPct: null }] }, cashEvents: [{ month: "2027-02", direction: "out", amount: 2000, label: "reforma" }] })` → `positions.add[0].amount` `150_050`, `cashEvents` `[{ month: "2027-02", direction: "outflow", amount: 200_000, label: "reforma" }]`.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/llm-input.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement**.
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit** both paths; `git commit -m "feat(planejamento): esquema do cenario hipotetico em reais"`.

### Task 6: `scenario` on `run_projection` and `simulate_lever`

**Files:**
- Modify: `src/features/planning/lib/planner/tools.ts`
- Test: `src/features/planning/lib/planner/tools.test.ts`

**Interfaces:**
- Consumes: `applyScenario` (Task 4), `llmScenarioSchema`, `toScenario` (Task 5).
- Produces: `run_projection` input `{ changes?, stress?, scenario?: llmScenarioSchema }`, applied as `applyStress(applyScenario(withChanges(changes), toScenario(scenario ?? {})), toStress(stress ?? {}))`; `simulate_lever` input `{ lever, scenario? }`, `simulateLever(applyScenario(input, toScenario(scenario ?? {})), toLever(lever))`. Descriptions say the scenario is hypothetical and nothing is saved. `propose_change` unchanged.

Test: new `tools.test.ts::run_projection applies a hypothetical cash outflow without touching the input, and errors on an unknown plan in the scenario`, because distinct contract (tool-level scenario wiring and error path). `simulate_lever` wiring: none, because same `applyScenario` call locked by this test and Task 4.

- [x] **Step 1: Write the failing test**: with `deps()` (daily 100_000 cents, horizon 2026-01..2026-03), execute `run_projection` `{ scenario: { cashEvents: [{ month: "2026-02", direction: "out", amount: 3000, label: "reforma" }] } }` → `minSlack.base` `-200_000`; then `deps().input.adhocEvents` still `undefined`; execute with `{ scenario: { winningBidPct: [{ planId: PLAN_ID, pct: 50 }] } }` → `{ error: "Plano não encontrado." }`.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/tools.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement**.
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planejamento): cenario em run_projection e simulate_lever"`.

### Task 7: Positions with ids in the planner context

**Files:**
- Modify: `src/features/planning/lib/planner/context.ts` (`PlannerContext.patrimony.positions`)
- Test: `src/features/planning/lib/planner/context.test.ts`

**Interfaces:**
- Produces: `patrimony.positions: { id: string; accountId: string; amount: LlmMoney; liquidity: LiquidityKind; maturityMonth: Period | null; annualRealReturnPct: number | null }[]` from `snapshot.input.positions` (the ids `scenario.positions.edit/remove` need).

Test: extends `context.test.ts::formats maturities and pots in reais, keeps the 20 newest assumptions and reads plan health from the projection` (same snapshot) with one assertion: `context.patrimony.positions[0]` `toEqual` the literal entry with the amount in reais.

- [x] **Step 1: Add the failing assertion**.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/context.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement**.
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planejamento): posicoes com id no contexto do planejador"`.

### Task 8: System prompt, glossary, step budget and web-search policy

**Files:**
- Modify: `src/features/planning/lib/planner/system-prompt.ts`, `src/features/planning/lib/planner/stream.ts` (`PLANNER_MAX_STEPS = 12`), `src/shared/lib/ai/web-search.ts` (`WEB_SEARCH_POLICY`)
- Test: `src/features/planning/lib/planner/system-prompt.test.ts`

**Interfaces:**
- Consumes: `PLANNER_MAX_STEPS` (import into `system-prompt.ts`; the steps line reads `` `o ciclo de ferramentas para após ${PLANNER_MAX_STEPS} passos` ``).
- Produces (prompt rules, PT-BR; must not contain "pesquis" or "confirm" outside the web policy):
  - Replace the "Nunca calcule nem estime esses números. Se a ferramenta não traz o número, diga que não sabe." rule with: plan numbers only from projection tools; any other arithmetic (parcela, prazo, valor presente, capital para renda, somas) only with `finance_calc`; never do math in the head.
  - Hypotheses go in `scenario` (winning bid, positions, avulsas) or `changes` (plans, aporte); simulating saves nothing.
  - Missing user-specific data: ask before answering, `no máximo 2 perguntas` at a time, never refuse; data already in the context (IPCA, aporte, posições) is used and declared.
  - Every numeric answer lists `premissas` and separates "Projeção do plano" from "Cálculo fora da projeção" (`finance_calc`).
  - At the end of a simulation, optionally offer to adjust plans with `propose_change`.
  - Glossary `marginPp`: points added to the winning bid, literal example `lance 66% + margem 3 = 69%`; hypothetical bid via `scenario.winningBidPct`; bid without margin via `changes` with `marginPp` 0. Remove the `71%` example.
  - `WEB_SEARCH_POLICY` gains a line: external indicators (IPCA projetado, Selic, mercado de consórcio) may be a `premissa de um cenário` simulado, citing source and date; never recorded without the user's confirmation.

Test: extends `system-prompt.test.ts::prompt carries glossary, tool-number rules and the answer discipline` (literal list: drop `"71%"`, add `"66% + margem 3 = 69%"`, `"finance_calc"`, `"scenario"`, `"no máximo 2 perguntas"`, `"premissas"`, `"Cálculo fora da projeção"`, `"propose_change"`, `` `${PLANNER_MAX_STEPS} passos` ``; add `expect(prompt).not.toContain("diga que não sabe")`, the only lock on the refusal regression) and `system-prompt.test.ts::web search policy appears only when web search is enabled` (add `expect(on).toContain("premissa de um cenário")`). `PLANNER_MAX_STEPS = 12`: none, because a constant; the steps literal above reads it.

- [x] **Step 1: Update the assertions**.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/system-prompt.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** the three files.
- [x] **Step 4: Run** `pnpm exec vitest run src/features/planning/lib/planner/system-prompt.test.ts src/features/planning/lib/planner/stream.test.ts src/shared/lib/ai/web-search.test.ts`. Expected: PASS.
- [x] **Step 5: Commit** the four paths; `git commit -m "feat(planejamento): planejador pergunta, simula e declara premissas"`.

### Task 9: Closing checks and changelog

**Files:**
- Modify: `CHANGELOG.md` (under the existing `## [Não lançado]`: `### Adicionado` cenários hipotéticos no planejador, calculadora `finance_calc`, entradas/saídas avulsas; `### Alterado` regras do planejador (pergunta dado faltante, declara premissas), limite de passos 12, política de busca), `README.md` (Planejamento line, line ~86: mention "simulações de cenários hipotéticos e calculadora financeira" in the planner clause)

Test: none, because no behaviour change.

- [x] **Step 1:** Edit `CHANGELOG.md` and `README.md`. No version bump, no tag (Grilling 14).
- [x] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [x] **Step 3: Run** biome on every touched file: `for f in <touched .ts files>; do tr -d '\r' < "$f" | pnpm exec biome check --stdin-file-path="$f" || echo "FAIL $f"; done`. Expected: no `FAIL`.
- [x] **Step 4: Run** the full suite once: `pnpm test`. Expected: PASS.
- [x] **Step 5: Commit** `CHANGELOG.md` and `README.md`; `git commit -m "docs: changelog dos cenarios do planejador"`.
- [x] **Step 6: Manual check (best-effort, production, Chrome):** after deploy, ask the real case ("sem embutido e com lance vencedor de 66%, quanto preciso em caixa para a parcela remanescente ser paga com renda passiva?"): the planner asks for the remaining term and the real rate (at most 2 questions), then answers with `finance_calc` figures labeled outside the projection and lists its assumptions.
