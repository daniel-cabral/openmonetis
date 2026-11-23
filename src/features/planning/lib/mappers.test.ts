import { describe, expect, it } from "vitest";
import type {
	BidRecord,
	InvestmentPosition,
	Plan,
	PlanEventRow,
	PlanningSettings,
} from "@/db/schema";
import {
	latestPositionSet,
	toEnginePlan,
	toEnginePosition,
	toSettingsInput,
} from "./mappers";
import { planningSettingsFieldsSchema } from "./schemas";

const USER_ID = "user-sintetico";
const PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const OTHER_PLAN_ID = "323e4567-e89b-12d3-a456-426614174000";
const ACCOUNT_A = "223e4567-e89b-12d3-a456-426614174000";
const ACCOUNT_B = "423e4567-e89b-12d3-a456-426614174000";
const NOW = new Date("2026-01-01T00:00:00Z");

function positionRow(over: Partial<InvestmentPosition>): InvestmentPosition {
	return {
		id: "pos-1",
		userId: USER_ID,
		accountId: ACCOUNT_A,
		description: "Tesouro sintetico",
		amount: "1500.00",
		liquidity: "daily",
		maturityMonth: null,
		annualRealReturnPct: "5.25",
		asOf: new Date("2026-11-30T00:00:00Z"),
		createdAt: NOW,
		...over,
	};
}

function planRow(over: Partial<Plan>): Plan {
	return {
		id: PLAN_ID,
		userId: USER_ID,
		name: "Plano sintetico",
		type: "goal",
		priority: 1,
		nonNegotiable: false,
		lifecycle: "active",
		basis: "nominal",
		priceIndex: "IPCA",
		targetMonth: "2027-06",
		windowEarliest: null,
		windowLatest: null,
		potAccountIds: [],
		targetMin: null,
		targetBase: null,
		targetMax: null,
		letterValue: null,
		outstandingBalance: null,
		bidBase: null,
		bidMarginPp: null,
		embeddedBidEnabled: false,
		embeddedBidPct: "0.00",
		createdAt: NOW,
		updatedAt: NOW,
		...over,
	};
}

function eventRow(over: Partial<PlanEventRow>): PlanEventRow {
	return {
		id: "event-1",
		userId: USER_ID,
		planId: PLAN_ID,
		label: "Evento sintetico",
		direction: "outflow",
		basis: "nominal",
		amountMin: "100.00",
		amountBase: "120.00",
		amountMax: "150.00",
		startMonth: "2027-02",
		endMonth: null,
		createdAt: NOW,
		...over,
	};
}

function bidRow(over: Partial<BidRecord>): BidRecord {
	return {
		id: "bid-1",
		userId: USER_ID,
		planId: PLAN_ID,
		month: "2027-01",
		winningBidPct: "40.00",
		createdAt: NOW,
		...over,
	};
}

function settingsRow(over: Partial<PlanningSettings>): PlanningSettings {
	return {
		userId: USER_ID,
		plannedContribution: "1500.00",
		reserveMonths: 3,
		baselineMonths: 6,
		ipcaForecastPct: "4.50",
		inccForecastPct: "5.00",
		horizonEnd: null,
		stressContributionCap: null,
		stressIncomeLossMonths: 3,
		stressPlanCostPct: "10.00",
		plannerModelId: null,
		updatedAt: NOW,
		...over,
	};
}

describe("latestPositionSet", () => {
	it("keeps only the rows of each account's most recent as-of date", () => {
		const rows = [
			positionRow({
				id: "old",
				accountId: ACCOUNT_A,
				asOf: new Date("2026-10-31T00:00:00Z"),
			}),
			positionRow({
				id: "new",
				accountId: ACCOUNT_A,
				asOf: new Date("2026-11-30T00:00:00Z"),
			}),
			positionRow({
				id: "b1",
				accountId: ACCOUNT_B,
				asOf: new Date("2026-10-31T00:00:00Z"),
			}),
			positionRow({
				id: "b2",
				accountId: ACCOUNT_B,
				asOf: new Date("2026-10-31T00:00:00Z"),
			}),
		];

		expect(
			latestPositionSet(rows)
				.map((row) => row.id)
				.sort(),
		).toEqual(["b1", "b2", "new"]);
	});
});

describe("toEnginePosition", () => {
	it("converts the amount to cents and the return to a number, keeping a missing return null", () => {
		expect(toEnginePosition(positionRow({}))).toEqual({
			id: "pos-1",
			accountId: ACCOUNT_A,
			amount: 150_000,
			liquidity: "daily",
			maturityMonth: null,
			annualRealReturnPct: 5.25,
		});
		expect(
			toEnginePosition(positionRow({ annualRealReturnPct: null }))
				.annualRealReturnPct,
		).toBeNull();
	});
});

describe("toEnginePlan", () => {
	it("maps a consorcio row to cents fields and a null window when both bounds are null", () => {
		const plan = toEnginePlan(
			planRow({
				type: "consorcio",
				letterValue: "10000.00",
				outstandingBalance: "6500.50",
				bidBase: "both",
				bidMarginPp: "2.00",
				embeddedBidEnabled: true,
				embeddedBidPct: "10.00",
			}),
			[],
			[],
			20_000,
		);

		expect(plan.window).toBeNull();
		expect(plan.mappedMonthlyOutflow).toBe(20_000);
		expect(plan.fields).toEqual({
			type: "consorcio",
			letterValue: 1_000_000,
			outstandingBalance: 650_050,
			bidBase: "both",
			marginPp: 2,
			embeddedBid: { enabled: true, pct: 10 },
		});
	});

	it("maps a goal row to a cents target range and its window", () => {
		const plan = toEnginePlan(
			planRow({
				targetMin: "5000.00",
				targetBase: "6000.00",
				targetMax: "7000.00",
				windowEarliest: "2027-01",
				windowLatest: "2027-12",
			}),
			[],
			[],
			0,
		);

		expect(plan.fields).toEqual({
			type: "goal",
			target: { min: 500_000, base: 600_000, max: 700_000 },
		});
		expect(plan.window).toEqual({ earliest: "2027-01", latest: "2027-12" });
	});

	it("keeps only this plan's events and bids, with bids in month order", () => {
		const plan = toEnginePlan(
			planRow({ id: PLAN_ID, type: "goal" }),
			[
				eventRow({ id: "event-own" }),
				eventRow({ id: "event-other", planId: OTHER_PLAN_ID }),
			],
			[
				bidRow({ id: "bid-mar", month: "2027-03", winningBidPct: "42.50" }),
				bidRow({ id: "bid-jan", month: "2027-01", winningBidPct: "40.00" }),
				bidRow({ id: "bid-other", planId: OTHER_PLAN_ID, month: "2027-02" }),
			],
			0,
		);

		expect(plan.events).toEqual([
			{
				id: "event-own",
				label: "Evento sintetico",
				direction: "outflow",
				amount: { min: 10_000, base: 12_000, max: 15_000 },
				basis: "nominal",
				startMonth: "2027-02",
				endMonth: null,
			},
		]);
		expect(plan.bidHistory).toEqual([
			{ month: "2027-01", winningBidPct: 40 },
			{ month: "2027-03", winningBidPct: 42.5 },
		]);
	});
});

describe("toSettingsInput", () => {
	it("converts the stored settings to input units", () => {
		expect(
			toSettingsInput(
				settingsRow({
					plannedContribution: "1500.00",
					ipcaForecastPct: "4.50",
				}),
			),
		).toMatchObject({
			plannedContribution: 150_000,
			indexForecastPct: { IPCA: 4.5, INCC: 5 },
			stressContributionCap: null,
		});
	});

	it("returns settings that pass the input schema when the user has no row", () => {
		expect(
			planningSettingsFieldsSchema.safeParse(toSettingsInput(undefined))
				.success,
		).toBe(true);
	});
});
