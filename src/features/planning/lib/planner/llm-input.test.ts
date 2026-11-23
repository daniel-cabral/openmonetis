import { describe, expect, it } from "vitest";
import {
	type LlmProposalChange,
	parseLlmProposal,
	toLever,
} from "./llm-input";

const PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";

const proposalWith = (change: LlmProposalChange) => ({
	title: "Teste",
	rationale: "",
	changes: [change],
});

const eventWith = (amount: number) => ({
	label: "Taxa",
	direction: "outflow" as const,
	basis: "nominal" as const,
	amount: { min: amount, base: amount, max: amount },
	startMonth: "2027-03",
	endMonth: "2027-03",
});

const rejectedCases: [string, LlmProposalChange, string][] = [
	[
		"event amount with three decimals",
		{ op: "add-event", planId: PLAN_ID, event: eventWith(10.005) },
		"Use valores em reais com no máximo 2 casas decimais.",
	],
	[
		"negative planned contribution",
		{ op: "update-settings", patch: { plannedContribution: -1 } },
		"Valor não pode ser negativo.",
	],
	[
		"negative consorcio letter value",
		{
			op: "create-plan",
			plan: {
				name: "Carta",
				nonNegotiable: false,
				lifecycle: "active",
				basis: "nominal",
				index: "INCC",
				targetMonth: "2027-06",
				window: null,
				potAccountIds: [],
				fields: {
					type: "consorcio",
					letterValue: -100,
					outstandingBalance: 0,
					bidBase: "letter",
					marginPp: 0,
					embeddedBid: { enabled: false, pct: 0 },
				},
			},
			events: [],
		},
		"Valor não pode ser negativo.",
	],
];

describe("parseLlmProposal", () => {
	it("converts reais amounts of a goal plan to integer cents", () => {
		const result = parseLlmProposal(
			proposalWith({
				op: "create-plan",
				plan: {
					name: "Reserva",
					nonNegotiable: false,
					lifecycle: "active",
					basis: "nominal",
					index: "IPCA",
					targetMonth: "2027-06",
					window: null,
					potAccountIds: [],
					fields: {
						type: "goal",
						target: { min: 1234.56, base: 1234.56, max: 1234.56 },
					},
				},
				events: [],
			}),
		);

		expect(result).toMatchObject({
			proposal: {
				changes: [
					{
						plan: {
							fields: {
								target: { min: 123_456, base: 123_456, max: 123_456 },
							},
						},
					},
				],
			},
		});
	});

	it.each(rejectedCases)("returns an error for %s", (_label, change, message) => {
		expect(parseLlmProposal(proposalWith(change))).toEqual({ error: message });
	});
});

describe("toLever", () => {
	it("keeps a negative monthly contribution change as negative cents", () => {
		expect(toLever({ kind: "contribution", deltaMonthly: -50 })).toEqual({
			kind: "contribution",
			deltaMonthly: -5_000,
		});
	});
});
