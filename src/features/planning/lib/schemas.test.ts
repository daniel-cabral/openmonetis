import { describe, expect, it } from "vitest";
import { centsToDecimal, toCents } from "./cents";
import {
	planEventInputSchema,
	planInputSchema,
	replacePositionsSchema,
} from "./schemas";

const PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const ACCOUNT_ID = "223e4567-e89b-12d3-a456-426614174000";

const goalPlan = {
	name: "Plano sintetico",
	nonNegotiable: false,
	lifecycle: "draft",
	basis: "today",
	index: "IPCA",
	targetMonth: "2027-06",
	window: { earliest: "2027-01", latest: "2027-12" },
	potAccountIds: [ACCOUNT_ID],
	fields: {
		type: "goal",
		target: { min: 500_000, base: 600_000, max: 700_000 },
	},
};

const consorcioPlan = {
	...goalPlan,
	name: "Consorcio sintetico",
	window: null,
	fields: {
		type: "consorcio",
		letterValue: 5_000_000,
		outstandingBalance: 4_000_000,
		bidBase: "both",
		marginPp: 2,
		embeddedBid: { enabled: true, pct: 10 },
	},
};

describe("toCents and centsToDecimal", () => {
	it("converts db decimals to integer cents and back, treating null as zero", () => {
		expect(toCents("1234.56")).toBe(123_456);
		expect(toCents(null)).toBe(0);
		expect(centsToDecimal(123_450)).toBe("1234.50");
	});
});

describe("planInputSchema", () => {
	it.each([
		[
			"window ends before it starts",
			{ ...goalPlan, window: { earliest: "2027-06", latest: "2027-01" } },
			"A janela termina antes de começar.",
		],
		[
			"target month outside the window",
			{ ...goalPlan, targetMonth: "2028-01" },
			"O mês alvo deve estar dentro da janela.",
		],
		[
			"embedded bid above 30%",
			{
				...consorcioPlan,
				fields: {
					...consorcioPlan.fields,
					embeddedBid: { enabled: true, pct: 31 },
				},
			},
			"O lance embutido vai até 30%.",
		],
		[
			"installment without the last installment month",
			{
				...consorcioPlan,
				fields: { ...consorcioPlan.fields, monthlyInstallment: 200_000 },
			},
			"Informe o mês da última parcela.",
		],
		[
			"last installment month equal to the target month",
			{
				...consorcioPlan,
				fields: {
					...consorcioPlan.fields,
					monthlyInstallment: 200_000,
					lastInstallmentMonth: "2027-06",
				},
			},
			"A última parcela deve ser depois do mês alvo.",
		],
	])("rejects %s", (_label, input, message) => {
		const result = planInputSchema.safeParse(input);
		expect(result.error?.issues.map((issue) => issue.message)).toContain(
			message,
		);
	});

	it("accepts a goal plan and a consorcio plan", () => {
		expect(planInputSchema.safeParse(goalPlan).success).toBe(true);
		expect(planInputSchema.safeParse(consorcioPlan).success).toBe(true);
		expect(
			planInputSchema.safeParse({
				...consorcioPlan,
				fields: {
					...consorcioPlan.fields,
					monthlyInstallment: 200_000,
					lastInstallmentMonth: "2028-12",
					postBidMode: "reduce-term",
				},
			}).success,
		).toBe(true);
	});
});

describe("replacePositionsSchema", () => {
	it.each([
		[
			"maturity liquidity without a month",
			{
				description: "Titulo sintetico",
				amount: 150_000,
				liquidity: "maturity",
				maturityMonth: null,
				annualRealReturnPct: null,
			},
			"Informe o mês de vencimento.",
		],
		[
			"maturity month on daily liquidity",
			{
				description: "Conta sintetica",
				amount: 150_000,
				liquidity: "daily",
				maturityMonth: "2030-01",
				annualRealReturnPct: null,
			},
			"Vencimento só vale para liquidez no vencimento.",
		],
	])("rejects %s", (_label, line, message) => {
		const result = replacePositionsSchema.safeParse({
			accountId: ACCOUNT_ID,
			asOf: "2026-11-30",
			positions: [line],
		});
		expect(result.error?.issues.map((issue) => issue.message)).toContain(
			message,
		);
	});
});

describe("planEventInputSchema", () => {
	it("rejects an event that ends before it starts", () => {
		const result = planEventInputSchema.safeParse({
			planId: PLAN_ID,
			label: "Parcela sintetica",
			direction: "outflow",
			basis: "today",
			amount: { min: 10_000, base: 10_000, max: 10_000 },
			startMonth: "2027-05",
			endMonth: "2027-02",
		});
		expect(result.error?.issues.map((issue) => issue.message)).toContain(
			"O fim do evento não pode ser antes do início.",
		);
	});
});
