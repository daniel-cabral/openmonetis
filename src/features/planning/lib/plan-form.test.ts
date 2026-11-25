import { describe, expect, it } from "vitest";
import type { PlanView } from "@/features/planning/lib/snapshot-types";
import {
	emptyEventForm,
	emptyPlanForm,
	eventFormToInput,
	formToPlanInput,
	planToForm,
} from "./plan-form";

describe("formToPlanInput", () => {
	it("collapses the target to the typed base when the range is off", () => {
		const form = {
			...emptyPlanForm("goal", "2027-01"),
			name: "Viagem",
			targetMonth: "2027-06",
			targetBase: "1.500,00",
			targetMin: "100",
			targetMax: "9999",
			hasRange: false,
		};

		expect(formToPlanInput(form).fields).toEqual({
			type: "goal",
			target: { min: 150_000, base: 150_000, max: 150_000 },
		});
	});
});

describe("formToPlanInput consorcio installment", () => {
	it("stores no installment when the field is empty", () => {
		const form = {
			...emptyPlanForm("consorcio", "2027-01"),
			monthlyInstallment: "",
			lastInstallmentMonth: "2028-12",
			postBidMode: "reduce-term" as const,
		};

		expect(formToPlanInput(form).fields).toMatchObject({
			type: "consorcio",
			monthlyInstallment: null,
			lastInstallmentMonth: null,
			postBidMode: "reduce-term",
		});
	});
});

describe("eventFormToInput", () => {
	it("pins a one-off event's end to its start month", () => {
		const form = {
			...emptyEventForm("2027-03"),
			kind: "one-off" as const,
			startMonth: "2027-03",
			hasEnd: true,
			endMonth: "2027-09",
		};

		expect(eventFormToInput(form, "plan-1").endMonth).toBe("2027-03");
	});

	it("leaves a recurring event open-ended when no end month is set", () => {
		const form = {
			...emptyEventForm("2027-03"),
			kind: "recurring" as const,
			startMonth: "2027-03",
			hasEnd: false,
		};

		expect(eventFormToInput(form, "plan-1").endMonth).toBeNull();
	});

	it("collapses the event amount to the typed base when the range is off", () => {
		const form = {
			...emptyEventForm("2027-03"),
			amountBase: "1500.00",
			amountMin: "100",
			amountMax: "9999",
			hasRange: false,
		};

		expect(eventFormToInput(form, "plan-1").amount).toEqual({
			min: 150_000,
			base: 150_000,
			max: 150_000,
		});
	});
});

describe("planToForm", () => {
	it("round-trips a goal and a consorcio back to the same plan input", () => {
		const goal: PlanView = {
			id: "goal",
			name: "Viagem",
			type: "goal",
			priority: 1,
			nonNegotiable: true,
			lifecycle: "active",
			basis: "today",
			index: "IPCA",
			targetMonth: "2027-06",
			window: null,
			potAccountIds: ["pot-1"],
			fields: {
				type: "goal",
				target: { min: 100_000, base: 150_000, max: 200_000 },
			},
			events: [],
			bidHistory: [],
			mappedMonthlyOutflow: 0,
			categoryIds: [],
		};
		const consorcio: PlanView = {
			id: "consorcio",
			name: "Carro",
			type: "consorcio",
			priority: 2,
			nonNegotiable: false,
			lifecycle: "paused",
			basis: "nominal",
			index: "INCC",
			targetMonth: "2028-01",
			window: { earliest: "2027-01", latest: "2028-12" },
			potAccountIds: [],
			fields: {
				type: "consorcio",
				letterValue: 40_000_000,
				outstandingBalance: 30_000_000,
				bidBase: "both",
				marginPp: 2.5,
				embeddedBid: { enabled: true, pct: 15 },
				monthlyInstallment: 200_000,
				lastInstallmentMonth: "2028-12",
				postBidMode: "reduce-term",
			},
			events: [],
			bidHistory: [],
			mappedMonthlyOutflow: 0,
			categoryIds: [],
		};

		expect(formToPlanInput(planToForm(goal))).toEqual({
			name: "Viagem",
			nonNegotiable: true,
			lifecycle: "active",
			basis: "today",
			index: "IPCA",
			targetMonth: "2027-06",
			window: null,
			potAccountIds: ["pot-1"],
			fields: {
				type: "goal",
				target: { min: 100_000, base: 150_000, max: 200_000 },
			},
		});
		expect(formToPlanInput(planToForm(consorcio))).toEqual({
			name: "Carro",
			nonNegotiable: false,
			lifecycle: "paused",
			basis: "nominal",
			index: "INCC",
			targetMonth: "2028-01",
			window: { earliest: "2027-01", latest: "2028-12" },
			potAccountIds: [],
			fields: {
				type: "consorcio",
				letterValue: 40_000_000,
				outstandingBalance: 30_000_000,
				bidBase: "both",
				marginPp: 2.5,
				embeddedBid: { enabled: true, pct: 15 },
				monthlyInstallment: 200_000,
				lastInstallmentMonth: "2028-12",
				postBidMode: "reduce-term",
			},
		});
	});
});
