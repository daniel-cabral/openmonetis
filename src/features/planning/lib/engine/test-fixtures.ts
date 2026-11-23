import type {
	AmountRange,
	EngineInput,
	EnginePlan,
	EnginePosition,
	Period,
} from "./types";

export const goalPlan = (
	id: string,
	targetMonth: Period,
	target: AmountRange,
	over: Partial<EnginePlan> = {},
): EnginePlan => ({
	id,
	name: id,
	priority: 1,
	nonNegotiable: false,
	lifecycle: "active",
	basis: "nominal",
	index: "IPCA",
	targetMonth,
	window: null,
	potAccountIds: [],
	fields: { type: "goal", target },
	events: [],
	bidHistory: [],
	mappedMonthlyOutflow: 0,
	...over,
});

export const position = (over: Partial<EnginePosition>): EnginePosition => ({
	id: "position",
	accountId: "A",
	amount: 0,
	liquidity: "daily",
	maturityMonth: null,
	annualRealReturnPct: 0,
	...over,
});

export const engineInput = (over: Partial<EngineInput>): EngineInput => ({
	startMonth: "2027-01",
	horizonEnd: null,
	positions: [],
	potAccountIds: [],
	incomeBaseline: 0,
	costOfLiving: 0,
	irregularExpenses: [],
	reserveMonths: 0,
	indexForecastPct: { IPCA: 0, INCC: 0 },
	plans: [],
	stress: {},
	extraMonthlySaving: 0,
	...over,
});
