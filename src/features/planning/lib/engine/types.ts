export type Period = string; // "YYYY-MM"
export type Cents = number; // integer centavos
export type Scenario = "pessimistic" | "base" | "optimistic";
export const SCENARIOS: readonly Scenario[] = [
	"pessimistic",
	"base",
	"optimistic",
];
export type Direction = "outflow" | "inflow";
export type AmountRange = { min: Cents; base: Cents; max: Cents };
export type PriceIndex = "IPCA" | "INCC";
export type MoneyBasis = "today" | "nominal";
export type LiquidityKind = "daily" | "maturity" | "locked";
export type PlanLifecycle =
	| "draft"
	| "active"
	| "paused"
	| "done"
	| "abandoned";

export type EnginePosition = {
	id: string;
	accountId: string;
	amount: Cents;
	liquidity: LiquidityKind;
	maturityMonth: Period | null; // set iff liquidity === "maturity"
	annualRealReturnPct: number | null; // null => DEFAULT_REAL_RETURN_PCT[liquidity]
};
export type PlanEventInput = {
	id: string;
	label: string;
	direction: Direction;
	amount: AmountRange;
	basis: MoneyBasis;
	startMonth: Period;
	endMonth: Period | null; // one-off: endMonth === startMonth; null: open-ended
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
	id: string;
	name: string;
	priority: number; // 1 = first after the reserve
	nonNegotiable: boolean;
	lifecycle: PlanLifecycle;
	basis: MoneyBasis;
	index: PriceIndex;
	targetMonth: Period;
	window: { earliest: Period; latest: Period } | null;
	potAccountIds: string[];
	fields: PlanTypeFields;
	events: PlanEventInput[];
	bidHistory: BidPoint[];
	mappedMonthlyOutflow: Cents;
};
export type IrregularExpense = {
	calendarMonth: number;
	amount: Cents;
	label: string;
}; // 1..12
export type StressToggles = {
	contributionCap?: Cents;
	incomeLossMonths?: number;
	bidAtRangeMax?: boolean;
	planCostPct?: number;
};
export type EngineInput = {
	startMonth: Period;
	horizonEnd: Period | null;
	positions: EnginePosition[];
	potAccountIds: string[];
	incomeBaseline: Cents;
	costOfLiving: Cents;
	irregularExpenses: IrregularExpense[];
	reserveMonths: number;
	indexForecastPct: Record<PriceIndex, number>;
	plans: EnginePlan[];
	stress: StressToggles;
	extraMonthlySaving: Cents;
};
export type ExpandedEvent = {
	planId: string;
	month: Period;
	direction: Direction;
	amount: AmountRange;
	label: string;
};
export type MonthRow = {
	month: Period;
	totalPatrimony: Cents;
	liquid: Cents;
	required: Cents;
	paid: Cents;
	reserveFloor: Cents;
	slack: Cents;
	unfundedPlanIds: string[];
	reserveBreached: boolean;
};
export type UnfundedAt = { month: Period; planId: string };
export type ScenarioResult = {
	scenario: Scenario;
	months: MonthRow[];
	firstUnfunded: UnfundedAt | null;
	requiredByPlan: Record<string, Cents>;
	shortfallByPlan: Record<string, Cents>;
};
export type PlanHealth = "on-track" | "at-risk" | "off-track";
export type Projection = {
	start: Period;
	end: Period;
	scenarios: Record<Scenario, ScenarioResult>;
	health: Record<string, PlanHealth>;
};
