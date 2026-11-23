import type { EngineInput, EnginePosition } from "./types";

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
