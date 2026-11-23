import type {
	Cents,
	EngineInput,
	EnginePlan,
	LiquidityKind,
	Period,
} from "@/features/planning/lib/engine";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";

export type PositionView = {
	id: string;
	description: string;
	amount: Cents;
	liquidity: LiquidityKind;
	maturityMonth: Period | null;
	annualRealReturnPct: number | null;
	asOf: string;
};

export type InvestmentAccountView = {
	id: string;
	name: string;
	logo: string;
	isEarmarkedPot: boolean;
	lastAsOf: string | null;
	positions: PositionView[];
};

export type PlanView = EnginePlan & {
	type: "goal" | "consorcio";
	categoryIds: string[];
};

export type ContributionRow = {
	id: string;
	name: string;
	date: string;
	amount: Cents;
};

export type AssumptionView = {
	id: string;
	kind: string;
	summary: string;
	source: "user" | "planner";
	proposalId: string | null;
	reviewByMonth: Period | null;
	createdAt: string;
};

export type PlanningSnapshot = {
	currentMonth: Period;
	input: EngineInput;
	settings: PlanningSettingsInput;
	plans: PlanView[];
	accounts: InvestmentAccountView[];
	contributionsByMonth: { month: Period; amount: Cents }[];
	currentMonthContributions: ContributionRow[];
	assumptions: AssumptionView[];
};
