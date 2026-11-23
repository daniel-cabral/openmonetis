# Planning engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Default execution in this repo: skill `executar-plano` (sdd.js).

**Goal:** Pure, unit-tested functions that turn positions, cash-flow baselines and plans into a three-scenario monthly liquidity projection with priority waterfall, plan health, stress effects, lever coverage and drift signals.

**Architecture:** One folder `src/features/planning/lib/engine/`, one responsibility per file, a barrel `index.ts`. Money is integer cents end to end; periods are `YYYY-MM` strings handled with `src/shared/utils/period`. Plan types only expand their fields into `ExpandedEvent`s; the projection sees events only.

**Tech Stack:** TypeScript 7, Vitest 4, Biome 2, pnpm. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-23-financial-planning-design.md` (sections "3. Projection engine" and "Engine rules" are normative for every task here).

## Global Constraints

- Pure functions only: no import from `@/db`, `@/shared/lib/db`, `next/*`, `react` or any feature. Allowed imports: `@/shared/utils/period` and files inside `engine/`.
- Money: `Cents` = integer number of centavos. Every function that multiplies money returns `Math.round(...)`. No floats leak into outputs.
- Periods: `"YYYY-MM"` strings. Use `addMonthsToPeriod`, `comparePeriods`, `buildPeriodRange`, `parsePeriod` from `src/shared/utils/period/index.ts`.
- All series are nominal. Targets with `basis: "today"` are inflated by their plan's index using `indexForecastPct[index]` (annual %), compounded monthly from `startMonth`.
- Scenario picking: outflow takes `max` (pessimistic), `base`, `min` (optimistic); inflow takes the opposite ends.
- The reserve floor is plan zero: `reserveMonths × costOfLiving`, never consumed by plans.
- Only plans with `lifecycle === "active"` are projected.
- Public repo: tests use synthetic round values (e.g. `100_000` cents). No personal figures anywhere.
- Identifiers and comments in English. Test names in English.
- Run only the touched test file while iterating: `pnpm exec vitest run <file>`. Lint per file (CRLF noise locally): `pnpm exec biome check --formatter-enabled=false <files>`. Typecheck once in the last task.
- Commits in PT-BR, `feat(planning): ...`, staging explicit paths only (never `git add -A` or `git add .`).

- Test fixtures: shared `EngineInput` builders live in `src/features/planning/lib/engine/test-fixtures.ts`, created in Task 7 and reused by Tasks 8 to 11 (no verbatim duplication across test files).

## Review Focus

1. Plan month before `startMonth` (stale target) or event `endMonth` after the horizon: events are clipped to `[start, end]`, never dropped silently into month zero. Test in Task 5.
2. Negative free cash (cost above income, irregular month): liquidity decreases, can go below the floor, `reserveBreached` is true, no exception. Test in Task 7.
3. Consórcio plan with no bid history: no bid event and no crash; the plan still projects its mapped installments. Test in Task 5.
4. A failing high-priority claim must not block lower priorities that still fit (gives way, processing continues). Test in Task 8.
5. Shift lever to a month outside the plan window, or on a plan without a window: rejected with `LeverError`, input untouched. Test in Task 11.

---

### Task 1: Engine types and money helpers

**Files:**
- Create: `src/features/planning/lib/engine/types.ts`
- Create: `src/features/planning/lib/engine/money.ts`
- Test: `src/features/planning/lib/engine/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact, every later change relies on these names):

```ts
export type Period = string; // "YYYY-MM"
export type Cents = number; // integer centavos
export type Scenario = "pessimistic" | "base" | "optimistic";
export const SCENARIOS: readonly Scenario[] = ["pessimistic", "base", "optimistic"];
export type Direction = "outflow" | "inflow";
export type AmountRange = { min: Cents; base: Cents; max: Cents };
export type PriceIndex = "IPCA" | "INCC";
export type MoneyBasis = "today" | "nominal";
export type LiquidityKind = "daily" | "maturity" | "locked";
export type PlanLifecycle = "draft" | "active" | "paused" | "done" | "abandoned";

export type EnginePosition = {
  id: string; accountId: string; amount: Cents;
  liquidity: LiquidityKind; maturityMonth: Period | null; // set iff liquidity === "maturity"
  annualRealReturnPct: number | null; // null => DEFAULT_REAL_RETURN_PCT[liquidity]
};
export type PlanEventInput = {
  id: string; label: string; direction: Direction; amount: AmountRange; basis: MoneyBasis;
  startMonth: Period; endMonth: Period | null; // one-off: endMonth === startMonth; null: open-ended
};
export type BidPoint = { month: Period; winningBidPct: number };
export type GoalFields = { type: "goal"; target: AmountRange };
export type ConsorcioFields = {
  type: "consorcio";
  letterValue: Cents; // today's money, inflated by the plan index (INCC) to the bid month
  outstandingBalance: Cents; // nominal as entered
  bidBase: "letter" | "outstanding" | "both";
  marginPp: number; // percentage points added to the winning %
  embeddedBid: { enabled: boolean; pct: number }; // pct of the letter value, 0..30
};
export type PlanTypeFields = GoalFields | ConsorcioFields;
export type EnginePlan = {
  id: string; name: string; priority: number; // 1 = first after the reserve
  nonNegotiable: boolean; lifecycle: PlanLifecycle;
  basis: MoneyBasis; index: PriceIndex;
  targetMonth: Period; window: { earliest: Period; latest: Period } | null;
  potAccountIds: string[]; fields: PlanTypeFields;
  events: PlanEventInput[]; bidHistory: BidPoint[]; mappedMonthlyOutflow: Cents;
};
export type IrregularExpense = { calendarMonth: number; amount: Cents; label: string }; // 1..12
export type StressToggles = {
  contributionCap?: Cents; incomeLossMonths?: number; bidAtRangeMax?: boolean; planCostPct?: number;
};
export type EngineInput = {
  startMonth: Period; horizonEnd: Period | null;
  positions: EnginePosition[]; potAccountIds: string[];
  incomeBaseline: Cents; costOfLiving: Cents; irregularExpenses: IrregularExpense[];
  reserveMonths: number; indexForecastPct: Record<PriceIndex, number>;
  plans: EnginePlan[]; stress: StressToggles; extraMonthlySaving: Cents;
};
export type ExpandedEvent = { planId: string; month: Period; direction: Direction; amount: AmountRange; label: string };
export type MonthRow = {
  month: Period; totalPatrimony: Cents; liquid: Cents; required: Cents; paid: Cents;
  reserveFloor: Cents; slack: Cents; unfundedPlanIds: string[]; reserveBreached: boolean;
};
export type UnfundedAt = { month: Period; planId: string };
export type ScenarioResult = {
  scenario: Scenario; months: MonthRow[]; firstUnfunded: UnfundedAt | null;
  requiredByPlan: Record<string, Cents>; shortfallByPlan: Record<string, Cents>;
};
export type PlanHealth = "on-track" | "at-risk" | "off-track";
export type Projection = {
  start: Period; end: Period; scenarios: Record<Scenario, ScenarioResult>; health: Record<string, PlanHealth>;
};
```

- Produces (money.ts): `pickAmount(range: AmountRange, direction: Direction, scenario: Scenario): Cents`, `inflateToMonth(amount: Cents, annualPct: number, from: Period, to: Period): Cents`, `scaleRange(range: AmountRange, factor: number): AmountRange`.

Test: new, because no planning code exists yet (distinct contract).

- [x] **Step 1: Write the failing test** `money.test.ts`

```ts
it.each([
  ["outflow", "pessimistic", 130], ["outflow", "base", 100], ["outflow", "optimistic", 80],
  ["inflow", "pessimistic", 80], ["inflow", "optimistic", 130],
] as const)("pickAmount %s %s", (direction, scenario, expected) => {
  expect(pickAmount({ min: 80, base: 100, max: 130 }, direction, scenario)).toBe(expected);
});
it("inflates monthly-compounded and never deflates", () => {
  expect(inflateToMonth(100_000, 12, "2027-01", "2028-01")).toBe(112_000);
  expect(inflateToMonth(100_000, 12, "2027-01", "2027-07")).toBe(105_830);
  expect(inflateToMonth(100_000, 12, "2027-01", "2026-06")).toBe(100_000);
});
it("scales a range with rounding", () => {
  expect(scaleRange({ min: 10_001, base: 20_000, max: 30_000 }, 1.1)).toEqual({ min: 11_001, base: 22_000, max: 33_000 });
});
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/money.test.ts`. Expected: FAIL, module not found.
- [x] **Step 3: Implement** `types.ts` exactly as above and `money.ts`. `inflateToMonth` uses `amount * (1 + annualPct/100) ** (months/12)` with `months = max(0, diff)`.
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Commit**

```bash
git add src/features/planning/lib/engine/types.ts src/features/planning/lib/engine/money.ts src/features/planning/lib/engine/money.test.ts
git commit -m "feat(planning): tipos do motor e helpers de valor"
```

### Task 2: Horizon resolution

**Files:**
- Create: `src/features/planning/lib/engine/horizon.ts`
- Test: `src/features/planning/lib/engine/horizon.test.ts`

**Interfaces:**
- Consumes: `EngineInput`, `EnginePlan` (Task 1).
- Produces: `HORIZON_PADDING_MONTHS = 12`; `resolveHorizon(input: Pick<EngineInput, "startMonth" | "horizonEnd" | "plans">): { start: Period; end: Period }`. Default end = latest of each active plan's `window?.latest ?? targetMonth` and its events' `endMonth ?? startMonth`, plus 12; with no active plan, `start + 12`. A non-null `horizonEnd` wins.

Test: new, because distinct contract.

- [x] **Step 1: Write the failing test** with one table: plans at `2028-06` and window latest `2029-03` → end `"2030-03"`; same plans with `horizonEnd: "2031-01"` → `"2031-01"`; no plans → `"2028-01"` (start `2027-01`); a `draft` plan at `2035-01` is ignored.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/horizon.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** `resolveHorizon`.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit** `git add` both files; `git commit -m "feat(planning): horizonte da projecao"`.

### Task 3: Generic goal events

**Files:**
- Create: `src/features/planning/lib/engine/plan-types/goal.ts`
- Test: `src/features/planning/lib/engine/plan-types/goal.test.ts`

**Interfaces:**
- Consumes: `inflateToMonth`, `EnginePlan`, `GoalFields`, `ExpandedEvent`.
- Produces: `type ExpandContext = { start: Period; end: Period; indexForecastPct: Record<PriceIndex, number>; stress: StressToggles }` (exported from `plan-types/context.ts`, create it here); `expandGoalEvents(plan: EnginePlan & { fields: GoalFields }, ctx: ExpandContext): ExpandedEvent[]`.
- Rules: one outflow at `targetMonth` with `target` inflated (if `basis === "today"`) by `indexForecastPct[plan.index]` from `ctx.start`. If `mappedMonthlyOutflow > 0`: one outflow of that amount per month from `ctx.start` to the month before `targetMonth` (label `"mapped"`), and the target event is reduced by the sum of those payments on each end of the range, floored at 0.

Test: new, because distinct contract.

- [x] **Step 1: Write the failing test**

```ts
const ctx = { start: "2027-01", end: "2029-01", indexForecastPct: { IPCA: 12, INCC: 0 }, stress: {} };
it("inflates a today's-money target to its month", () => {
  const events = expandGoalEvents(goal({ target: { min: 90_000, base: 100_000, max: 120_000 }, targetMonth: "2028-01" }), ctx);
  expect(events).toEqual([{ planId: "g", month: "2028-01", direction: "outflow", amount: { min: 100_800, base: 112_000, max: 134_400 }, label: "g" }]);
});
it("pays mapped outflows toward the target", () => {
  const events = expandGoalEvents(goal({ target: { min: 90_000, base: 100_000, max: 120_000 }, targetMonth: "2028-01", mappedMonthlyOutflow: 1_000 }), ctx);
  expect(events.filter((e) => e.label === "mapped")).toHaveLength(12);
  expect(events.at(-1)?.amount).toEqual({ min: 88_800, base: 100_000, max: 122_400 });
});
```

(`goal(...)` is a local fixture builder returning an `EnginePlan` with id and name `"g"`, `basis: "today"`, `index: "IPCA"`.)
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/plan-types/goal.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** `context.ts` and `goal.ts`.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit** the three files; `git commit -m "feat(planning): eventos do objetivo generico"`.

### Task 4: Consórcio bid range and own cash

**Files:**
- Create: `src/features/planning/lib/engine/plan-types/consorcio.ts`
- Test: `src/features/planning/lib/engine/plan-types/consorcio.test.ts`

**Interfaces:**
- Consumes: `BidPoint`, `ConsorcioFields`, `AmountRange`.
- Produces: `BID_HISTORY_MONTHS = 6`; `bidPctRange(history: BidPoint[], marginPp: number): AmountRange | null` (percent values, not cents: min/max over the latest 6 points by month, base = latest point; all + margin; `null` when empty); `consorcioOwnCash(fields: ConsorcioFields, pct: AmountRange, letterAtBid: Cents): AmountRange`.
- Rules: base amount = `pct × base / 100`. `bidBase "letter"` uses `letterAtBid`; `"outstanding"` uses `outstandingBalance`; `"both"` uses the smaller base for `min` and the larger for `base` and `max`. Embedded bid enabled: subtract `letterAtBid × embeddedBid.pct / 100` from each end, floor 0.

Test: new, because distinct contract.

- [x] **Step 1: Write the failing test**

```ts
const history = [["2026-06", 50], ["2026-07", 30], ["2026-08", 32], ["2026-09", 35], ["2026-10", 33], ["2026-11", 34], ["2026-12", 36]]
  .map(([month, winningBidPct]) => ({ month, winningBidPct })) as BidPoint[];
it("builds the bid % range from the last six months plus margin", () => {
  expect(bidPctRange(history, 2)).toEqual({ min: 32, base: 38, max: 38 });
  expect(bidPctRange([], 2)).toBeNull();
});
const fields = (over: Partial<ConsorcioFields>): ConsorcioFields => ({ type: "consorcio", letterValue: 1_000_000, outstandingBalance: 800_000, bidBase: "letter", marginPp: 2, embeddedBid: { enabled: false, pct: 0 }, ...over });
it.each([
  ["letter", { min: 320_000, base: 380_000, max: 380_000 }],
  ["outstanding", { min: 256_000, base: 304_000, max: 304_000 }],
  ["both", { min: 256_000, base: 380_000, max: 380_000 }],
] as const)("own cash on base %s", (bidBase, expected) => {
  expect(consorcioOwnCash(fields({ bidBase }), { min: 32, base: 38, max: 38 }, 1_000_000)).toEqual(expected);
});
it("embedded bid reduces own cash and floors at zero", () => {
  expect(consorcioOwnCash(fields({ embeddedBid: { enabled: true, pct: 25 } }), { min: 32, base: 38, max: 38 }, 1_000_000)).toEqual({ min: 70_000, base: 130_000, max: 130_000 });
  expect(consorcioOwnCash(fields({ embeddedBid: { enabled: true, pct: 30 } }), { min: 20, base: 25, max: 40 }, 1_000_000).min).toBe(0);
});
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/plan-types/consorcio.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** both functions.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit** both files; `git commit -m "feat(planning): faixa de lance e caixa proprio do consorcio"`.

### Task 5: Consórcio events and the plan-type dispatcher

**Files:**
- Modify: `src/features/planning/lib/engine/plan-types/consorcio.ts`
- Create: `src/features/planning/lib/engine/plan-types/index.ts`
- Test: extend `plan-types/consorcio.test.ts`; create `src/features/planning/lib/engine/plan-types/index.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4.
- Produces: `expandConsorcioEvents(plan: EnginePlan & { fields: ConsorcioFields }, ctx: ExpandContext): ExpandedEvent[]`; `expandPlanEvents(plan: EnginePlan, ctx: ExpandContext): ExpandedEvent[]`.
- Consórcio rules: bid outflow at `targetMonth` = `consorcioOwnCash` with `letterAtBid = inflateToMonth(letterValue, indexForecastPct[plan.index], ctx.start, targetMonth)` (when `basis === "today"`); `ctx.stress.bidAtRangeMax` sets `min` and `base` of the pct range to its `max`; no history: no bid event. Mapped installments: outflow `mappedMonthlyOutflow` every month `ctx.start..ctx.end`.
- Dispatcher rules: `lifecycle !== "active"` → `[]`; type events plus manual `events` expanded one per month (one-off = single month; `endMonth: null` = through `ctx.end`), each clipped to `[ctx.start, ctx.end]`, `basis "today"` inflated by the plan index; `ctx.stress.planCostPct` scales every outflow by `1 + pct/100`.

Test: extends `consorcio.test.ts` (same fixtures); new `index.test.ts`, because the dispatcher is a distinct contract.

- [x] **Step 1: Write the failing tests**
  - `consorcio.test.ts` "expands the bid at the target month with INCC-inflated letter": INCC 10, start `2027-01`, target `2028-01`, `bidBase "letter"`, history above → bid event amount `{ min: 352_000, base: 418_000, max: 418_000 }`.
  - same file "bid at range max stress": `{ min: 418_000, base: 418_000, max: 418_000 }`.
  - same file "no bid history still projects mapped installments": `bidHistory: []`, `mappedMonthlyOutflow: 5_000`, end `2027-03` → three events of `5_000` and no bid event.
  - `index.test.ts` (one `it.each` over lifecycles): `draft`, `paused`, `done`, `abandoned` → `[]`.
  - `index.test.ts` "clips manual events to the horizon": recurring event `2026-10..null` with start `2027-01`, end `2027-03` → months `["2027-01","2027-02","2027-03"]`; one-off at `2026-05` → absent.
  - `index.test.ts` "plan cost stress scales outflows only": one outflow `{100_000 x3}` and one inflow `{50_000 x3}`, `planCostPct: 10` → outflow `110_000`, inflow `50_000`.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/plan-types`. Expected: FAIL.
- [x] **Step 3: Implement** `expandConsorcioEvents` and `index.ts`.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit** the four files; `git commit -m "feat(planning): eventos do consorcio e despacho por tipo de plano"`.

### Task 6: Position buckets

**Files:**
- Create: `src/features/planning/lib/engine/buckets.ts`
- Test: `src/features/planning/lib/engine/buckets.test.ts`

**Interfaces:**
- Consumes: `EnginePosition`, `LiquidityKind`.
- Produces:
  - `DEFAULT_REAL_RETURN_PCT: Record<LiquidityKind, number> = { daily: 2, maturity: 4, locked: 4 }`
  - `monthlyNominalRate(realPct: number, ipcaPct: number): number` = `((1 + real/100) * (1 + ipca/100)) ** (1/12) - 1`
  - `type Buckets = { general: Cents; pots: Record<string, Cents>; pending: { accountId: string; amount: Cents; maturityMonth: Period; rate: number }[]; locked: Cents; generalRate: number; lockedRate: number }` (`generalRate` = amount-weighted `annualRealReturnPct ?? DEFAULT_REAL_RETURN_PCT.daily` of the daily and already-matured positions in `general`; each pot grows at the same weighted rate of its own positions; `lockedRate` = amount-weighted rate of locked positions; an empty bucket has rate 0. With all fixtures at `annualRealReturnPct: 0`, every rate is 0)
  - `openBuckets(positions: EnginePosition[], potAccountIds: string[], start: Period, ipcaPct: number): Buckets`: daily and already-matured (`maturityMonth <= start`) go to `general`, or to `pots[accountId]` when the account is a pot; future maturities go to `pending`; locked to `locked`.
  - `advanceMonth(b: Buckets, month: Period): Buckets`: grow every bucket by its rate, then release `pending` with `maturityMonth === month` into `general` or the pot.
  - `bucketsTotal(b: Buckets): Cents`; `liquidToday(positions: EnginePosition[], potAccountIds: string[], start: Period): Cents` = `general` of `openBuckets` (pots excluded).

Test: new, because distinct contract.

- [x] **Step 1: Write the failing test**: `monthlyNominalRate(2, 10)` `toBeCloseTo(0.00964, 4)` and `monthlyNominalRate(0, 0) === 0`; positions (all `annualRealReturnPct: 0`, ipca 0): daily `10_000` in A, maturity `2027-03` `20_000` in A, maturity `2026-12` `3_000` in A, locked `50_000`, daily `5_000` in pot P. `openBuckets(..., ["P"], "2027-01", 0)` → general `13_000`, pots `{ P: 5_000 }`, one pending, locked `50_000`; `liquidToday` → `13_000`; advancing `2027-02` then `2027-03` → general `33_000`, `bucketsTotal` still `88_000`.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/buckets.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** `buckets.ts`.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planning): baldes de liquidez das posicoes"`.

### Task 7: Scenario cash flow, reserve floor and breach

**Files:**
- Create: `src/features/planning/lib/engine/project.ts`
- Test: `src/features/planning/lib/engine/project.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 6.
- Produces: `projectScenario(input: EngineInput, scenario: Scenario, events: ExpandedEvent[], range: { start: Period; end: Period }): ScenarioResult`.
- Month loop for `m` in `range` (this task: no plan claims yet, `events` may be empty):
  1. `b = advanceMonth(b, m)` (skip growth on `start`: `openBuckets` already reflects it).
  2. `income = m within first stress.incomeLossMonths months ? 0 : incomeBaseline`.
  3. `regular = income - costOfLiving + extraMonthlySaving`; if `stress.contributionCap` is set, `regular = min(regular, cap)`.
  4. `free = regular - sum(irregularExpenses where calendarMonth === month of m) + sum(inflow events of m, scenario amount)`; `general += free`.
  5. `reserveFloor = reserveMonths × costOfLiving`; `reserveBreached = general < reserveFloor`.
  6. Row: `liquid = general + sum(pots)`, `totalPatrimony = bucketsTotal(b)`, `slack = general - reserveFloor` (after claims, Task 8).

Test: new, because distinct contract.

- [x] **Step 1: Write the failing test** "cash flow without plans": daily position `100_000`, income `50_000`, cost `40_000`, irregular `{ calendarMonth: 3, amount: 30_000 }`, `reserveMonths: 3`, returns 0, ipca 0, start `2027-01`, `horizonEnd: "2027-04"`. Expect `months.map((r) => r.liquid)` `[110_000, 120_000, 100_000, 110_000]`, `slack` `[-10_000, 0, -20_000, -10_000]`, `reserveBreached` `[true, false, true, true]`, `firstUnfunded` `null`.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/project.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** `projectScenario` steps 1 to 6.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planning): fluxo mensal do cenario com piso da reserva"`.

### Task 8: Priority waterfall with earmarked pots

**Files:**
- Modify: `src/features/planning/lib/engine/project.ts`
- Test: extend `src/features/planning/lib/engine/project.test.ts`

**Interfaces:**
- Consumes: Task 7.
- Produces: same `projectScenario` signature, now filling `required`, `paid`, `unfundedPlanIds`, `firstUnfunded`, `requiredByPlan`, `shortfallByPlan`.
- Rule after step 4, for active plans by ascending `priority`: `claim` = sum of the plan's outflow events of `m` (scenario amount). `available = max(0, general - reserveFloor)` plus the plan's own pots. If `claim <= available`, pay from the plan's pots first (in `potAccountIds` order) then from `general`; else pay nothing, add to `unfundedPlanIds` and `shortfallByPlan`, set `firstUnfunded` if still null, and continue with the next plan.

Test: extends `project.test.ts` (same builder), because the waterfall shares the scenario setup.

- [x] **Step 1: Write the failing tests**: general `300_000`, pot P `50_000`, income = cost = `10_000` (floor `30_000`), claims at `2027-02`: A prio 1 `200_000`, B prio 2 `100_000` with `potAccountIds: ["P"]`, C prio 3 `50_000`.
  - "lower priority gives way": `firstUnfunded` `{ month: "2027-02", planId: "C" }`, `shortfallByPlan` `{ C: 50_000 }`, Feb row `slack 20_000`, `paid 300_000`, `required 350_000`.
  - "failed claim does not block lower priorities": A claims `290_000` → `firstUnfunded.planId "A"`, `unfundedPlanIds` `["A"]`, C paid.
  - "pot money is not available to plans that do not name it": only C claims `280_000` (available `270_000` general, pot ignored) → C unfunded.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/project.test.ts`. Expected: the three new tests FAIL.
- [x] **Step 3: Implement** the waterfall.
- [x] **Step 4: Run** again. Expected: PASS (Task 7 test still passes).
- [x] **Step 5: Commit**; `git commit -m "feat(planning): cascata de prioridade com potes reservados"`.

### Task 9: Three scenarios, plan health and first unfunded month

**Files:**
- Create: `src/features/planning/lib/engine/projection.ts`
- Test: `src/features/planning/lib/engine/projection.test.ts`

**Interfaces:**
- Consumes: `resolveHorizon`, `expandPlanEvents`, `projectScenario`.
- Produces: `runProjection(input: EngineInput): Projection`; `planHealth(results: Record<Scenario, ScenarioResult>, planIds: string[]): Record<string, PlanHealth>` (on-track: funded in base and pessimistic; at-risk: base funded, pessimistic not; off-track: base not funded; "funded" = no shortfall).

Test: new, because `runProjection` is the public entry point (distinct contract).

- [x] **Step 1: Write the failing test**

```ts
it.each([
  [250_000, "on-track", null],
  [180_000, "at-risk", { month: "2027-02", planId: "p" }],
  [120_000, "off-track", { month: "2027-02", planId: "p" }],
] as const)("general %i gives %s", (general, health, firstPess) => {
  const result = runProjection(input({ general, plan: outflowAt("2027-02", { min: 100_000, base: 150_000, max: 200_000 }) }));
  expect(result.health.p).toBe(health);
  expect(result.scenarios.pessimistic.firstUnfunded).toEqual(firstPess);
});
it("ignores draft plans and reports the default horizon", () => {
  const result = runProjection(input({ general: 0, plan: { ...outflowAt("2027-02", { min: 1, base: 1, max: 1 }), lifecycle: "draft" } }));
  expect(result.health).toEqual({});
  expect(result.end).toBe("2028-01");
});
```

(Fixture: income = cost = 0, reserve 0, returns 0, start `2027-01`; `outflowAt` builds a goal plan `"p"` with `basis "nominal"`.)
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/projection.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** `runProjection` (expand events once per plan, run `SCENARIOS`) and `planHealth`.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planning): projecao em tres cenarios e status dos planos"`.

### Task 10: Stress toggles

**Files:**
- Create: `src/features/planning/lib/engine/stress.ts`
- Test: `src/features/planning/lib/engine/stress.test.ts`

**Interfaces:**
- Consumes: `runProjection`.
- Produces: `applyStress(input: EngineInput, toggles: StressToggles): EngineInput` (merges into `input.stress`, returns a new object); `type StressEffect = { toggle: keyof StressToggles; minSlackDelta: Cents; firstUnfundedBefore: UnfundedAt | null; firstUnfundedAfter: UnfundedAt | null }`; `stressEffects(input: EngineInput, toggles: StressToggles): StressEffect[]`: one entry per defined key, in the key order `contributionCap, incomeLossMonths, bidAtRangeMax, planCostPct`, each run alone against the unstressed base scenario; `minSlackDelta` = min base slack after minus before.

Test: new, because distinct contract (uses the Task 7 fixture values).

- [x] **Step 1: Write the failing test**: Task 7 fixture, `stressEffects(input, { contributionCap: 5_000, incomeLossMonths: 2 })` → `[{ toggle: "contributionCap", minSlackDelta: -15_000, ... }, { toggle: "incomeLossMonths", minSlackDelta: -100_000, ... }]`; `applyStress` does not mutate its argument (`input.stress` still `{}`).
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/stress.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** `stress.ts`.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planning): cenarios de estresse"`.

### Task 11: Funding levers

**Files:**
- Create: `src/features/planning/lib/engine/levers.ts`
- Test: `src/features/planning/lib/engine/levers.test.ts`

**Interfaces:**
- Consumes: `runProjection`, Task 8 fixture shape.
- Produces:

```ts
export type Lever =
  | { kind: "cut"; monthlyAmount: Cents; categoryIds: string[] }
  | { kind: "redirect-pot"; accountId: string; toPlanId: string }
  | { kind: "contribution"; deltaMonthly: Cents }
  | { kind: "shift-plan"; planId: string; month: Period };
export class LeverError extends Error {}
export type LeverCoverage = { planId: string; shortfallBefore: Cents; shortfallAfter: Cents; coveredPct: number };
export type LeverResult = { lever: Lever; firstUnfundedBefore: UnfundedAt | null; firstUnfundedAfter: UnfundedAt | null; coverage: LeverCoverage[] };
export function applyLever(input: EngineInput, lever: Lever): EngineInput;
export function simulateLever(input: EngineInput, lever: Lever): LeverResult;
```

- Rules: `cut` and `contribution` add to `extraMonthlySaving`; `redirect-pot` removes the account from every plan's `potAccountIds` and adds it to `toPlanId`; `shift-plan` sets `targetMonth` and requires a `window` containing `month`, else `LeverError`. Coverage is computed on the base scenario for every plan with a shortfall before or after; `coveredPct = round(100 × (before - after) / before)`, 0 when `before` is 0.

Test: new, because distinct contract (reuses the Task 8 numbers: C short `50_000`).

- [x] **Step 1: Write the failing test** (one `it.each` for coverage):
  - `contribution deltaMonthly 30_000` → C `coveredPct 100`, `firstUnfundedAfter null`.
  - `cut monthlyAmount 5_000` → C still unfunded: `shortfallAfter 50_000`, `coveredPct 0` (claims are all-or-nothing), `firstUnfundedAfter.planId "C"`.
  - `redirect-pot P → C` → C covered 100, B `shortfallAfter 100_000` (trade-off visible).
  - "shift outside window throws": C with window `2027-02..2027-06`, month `2027-08` → `toThrow(LeverError)`; plan without window → throws; in both cases assert the input object is deep-equal to a `structuredClone` taken before the call (input untouched).
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/levers.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** `levers.ts`.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planning): simulacao de alavancas"`.

### Task 12: Drift signals

**Files:**
- Create: `src/features/planning/lib/engine/drift.ts`
- Test: `src/features/planning/lib/engine/drift.test.ts`

**Interfaces:**
- Consumes: `PlanHealth`.
- Produces:

```ts
export type DriftSignal =
  | { kind: "plan-at-risk"; planId: string }
  | { kind: "plan-off-track"; planId: string }
  | { kind: "reserve-below-floor"; shortfall: Cents }
  | { kind: "contribution-below-plan"; months: Period[] };
export type DriftInput = {
  health: Record<string, PlanHealth>; liquidNow: Cents; reserveFloor: Cents;
  contributionsByMonth: { month: Period; amount: Cents }[]; // last complete months, ascending
  plannedContribution: Cents;
};
export function detectDrift(input: DriftInput): DriftSignal[];
```

- Rule for contributions: signal when the last two entries are both below `plannedContribution`; none when `plannedContribution === 0`.

Test: new, because distinct contract.

- [x] **Step 1: Write the failing test**: health `{ a: "on-track", b: "at-risk", c: "off-track" }`, liquid `100_000`, floor `120_000`, contributions `2027-01: 4_000`, `2027-02: 3_000`, planned `5_000` → exactly `[{plan-at-risk b}, {plan-off-track c}, {reserve-below-floor 20_000}, {contribution-below-plan ["2027-01","2027-02"]}]`; second case with `2027-01: 6_000` → no contribution signal.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine/drift.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** `detectDrift`.
- [x] **Step 4: Run** again. Expected: PASS.
- [x] **Step 5: Commit**; `git commit -m "feat(planning): sinais de desvio"`.

### Task 13: Barrel and closing checks

**Files:**
- Create: `src/features/planning/lib/engine/index.ts` (re-exports every public name above; no logic)

Test: none, because no behaviour change (re-exports only).

- [ ] **Step 1:** Write `index.ts`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/engine`. Expected: all PASS.
- [ ] **Step 3: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 4: Run** `pnpm exec biome check --formatter-enabled=false src/features/planning`. Expected: no errors.
- [ ] **Step 5: Check** `git grep -nE "import .*(@/db|@/shared/lib/db|next/|react)" src/features/planning/lib/engine` returns nothing.
- [ ] **Step 6: Commit** `git add src/features/planning/lib/engine/index.ts`; `git commit -m "feat(planning): ponto de entrada do motor"`.
