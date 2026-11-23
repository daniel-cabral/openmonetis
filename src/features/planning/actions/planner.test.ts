import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredRow = Record<string, unknown>;

type Write = {
	kind: "insert" | "update" | "delete";
	table: unknown;
	payload?: unknown;
	condition?: SQL;
};

function sqlParams(condition: SQL): unknown[] {
	return new PgDialect().sqlToQuery(condition).params;
}

// A stored row matches when every bound parameter of the condition is one of its values.
function matchingRows(
	stored: Map<unknown, StoredRow[]>,
	table: unknown,
	condition: SQL,
): StoredRow[] {
	const params = sqlParams(condition);
	return (stored.get(table) ?? []).filter((row) => {
		const values = Object.values(row);
		return params.every((param) => values.includes(param));
	});
}

const {
	getUserIdMock,
	revalidatePathMock,
	revalidateTagMock,
	stored,
	writes,
	dbMock,
	NEW_PLAN_ID,
} = vi.hoisted(() => {
	const stored = new Map<unknown, StoredRow[]>();
	const writes: Write[] = [];
	const NEW_PLAN_ID = "9d2e4c1a-0b3f-4e5d-8a6b-7c8d9e0f1a2b";

	function resultOf(rows: StoredRow[]) {
		const result = Object.assign(Promise.resolve(rows), {
			orderBy: () => result,
			limit: (count: number) => Promise.resolve(rows.slice(0, count)),
			returning: () => Promise.resolve(rows),
		});
		return result;
	}

	const tx = {
		select: () => ({
			from: (table: unknown) => ({
				where: (condition: SQL) =>
					resultOf(matchingRows(stored, table, condition)),
			}),
		}),
		insert: (table: unknown) => ({
			values: (payload: unknown) => {
				writes.push({ kind: "insert", table, payload });
				return Object.assign(Promise.resolve(), {
					onConflictDoUpdate: () => Promise.resolve(),
					returning: () => Promise.resolve([{ id: NEW_PLAN_ID }]),
				});
			},
		}),
		update: (table: unknown) => ({
			set: (payload: unknown) => ({
				where: (condition: SQL) => {
					const rows = matchingRows(stored, table, condition);
					if (rows.length > 0) {
						writes.push({ kind: "update", table, payload, condition });
					}
					return resultOf(rows);
				},
			}),
		}),
		delete: (table: unknown) => ({
			where: (condition: SQL) => {
				const rows = matchingRows(stored, table, condition);
				if (rows.length > 0) {
					writes.push({ kind: "delete", table, condition });
				}
				return resultOf(rows);
			},
		}),
	};

	return {
		getUserIdMock: vi.fn(),
		revalidatePathMock: vi.fn(),
		revalidateTagMock: vi.fn(),
		stored,
		writes,
		NEW_PLAN_ID,
		dbMock: {
			transaction: (callback: (t: typeof tx) => unknown) => callback(tx),
		},
	};
});

vi.mock("@/shared/lib/auth/server", () => ({ getUserId: getUserIdMock }));
vi.mock("@/shared/lib/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({
	revalidatePath: revalidatePathMock,
	revalidateTag: revalidateTagMock,
}));

import {
	assumptionLog,
	financialAccounts,
	planEvents,
	planningSettings,
	plans,
} from "@/db/schema";
import type { Proposal } from "@/features/planning/lib/planner/proposal";
import type { PlanInput } from "@/features/planning/lib/schemas";
import { applyProposalAction } from "./planner";

const USER_ID = "user-1";
const FOREIGN_USER_ID = "user-2";
const PLAN_ID = "5b1e6f2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const FOREIGN_PLAN_ID = "7d3a8b4c-5e6f-4a71-8c1d-2e3f4a5b6c7d";
const PROPOSAL_ID = "call_7Hq2";
const POT_ID = "3f1c2a9e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const UNEARMARKED_ID = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const FOREIGN_POT_ID = "c0ffee00-1111-4222-8333-444455556666";

const NOT_FOUND = { success: false, error: "Registro não encontrado." };
const ALREADY_APPLIED = { success: false, error: "Proposta já aplicada." };
const INVALID_POT = { success: false, error: "Pote inválido." };

const OWNED_GOAL_ROW = {
	id: PLAN_ID,
	userId: USER_ID,
	priority: 2,
	name: "Viagem",
	nonNegotiable: false,
	lifecycle: "draft",
	basis: "today",
	priceIndex: "IPCA",
	targetMonth: "2027-06",
	windowEarliest: null,
	windowLatest: null,
	potAccountIds: [],
	type: "goal",
	targetMin: "1000.00",
	targetBase: "1200.00",
	targetMax: "1500.00",
	letterValue: null,
	outstandingBalance: null,
	bidBase: null,
	bidMarginPp: null,
	embeddedBidEnabled: false,
	embeddedBidPct: "0.00",
};

function proposalWith(changes: Proposal["changes"]): Proposal {
	return { title: "Nova meta", rationale: "Teste.", changes };
}

const NEW_GOAL_PLAN: PlanInput = {
	name: "Reserva",
	nonNegotiable: true,
	lifecycle: "draft",
	basis: "today",
	index: "IPCA",
	targetMonth: "2028-01",
	window: null,
	potAccountIds: [],
	fields: {
		type: "goal",
		target: { min: 500_000, base: 500_000, max: 500_000 },
	},
};

describe("planner apply action", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writes.length = 0;
		stored.clear();
		getUserIdMock.mockResolvedValue(USER_ID);
		stored.set(plans, [
			{ ...OWNED_GOAL_ROW },
			{ id: FOREIGN_PLAN_ID, userId: FOREIGN_USER_ID, priority: 1 },
		]);
		stored.set(assumptionLog, []);
		stored.set(financialAccounts, [
			{ id: POT_ID, userId: USER_ID, isEarmarkedPot: true },
			{ id: UNEARMARKED_ID, userId: USER_ID, isEarmarkedPot: false },
			{ id: FOREIGN_POT_ID, userId: FOREIGN_USER_ID, isEarmarkedPot: true },
		]);
	});

	it("does not apply a proposal twice", async () => {
		stored.set(assumptionLog, [
			{ id: "a1", userId: USER_ID, proposalId: PROPOSAL_ID },
		]);

		const result = await applyProposalAction({
			proposalId: PROPOSAL_ID,
			proposal: proposalWith([
				{
					op: "record-assumption",
					assumption: { kind: "other", summary: "Premissa", reviewByMonth: null },
				},
			]),
		});

		expect(result).toEqual(ALREADY_APPLIED);
		expect(writes).toEqual([]);
	});

	it("rejects a plan change on another user's plan and writes nothing", async () => {
		const result = await applyProposalAction({
			proposalId: PROPOSAL_ID,
			proposal: proposalWith([
				{
					op: "update-plan",
					planId: FOREIGN_PLAN_ID,
					patch: { name: "Outro nome" },
				},
				{
					op: "record-assumption",
					assumption: { kind: "other", summary: "Premissa", reviewByMonth: null },
				},
			]),
		});

		expect(result).toEqual(NOT_FOUND);
		expect(writes).toEqual([]);
	});

	it("merges an owned plan patch into the stored plan", async () => {
		const result = await applyProposalAction({
			proposalId: PROPOSAL_ID,
			proposal: proposalWith([
				{
					op: "update-plan",
					planId: PLAN_ID,
					patch: { name: "Viagem Europa" },
				},
			]),
		});

		expect(result.success).toBe(true);
		expect(writes).toEqual([
			expect.objectContaining({
				kind: "update",
				table: plans,
				payload: expect.objectContaining({
					name: "Viagem Europa",
					targetMin: "1000.00",
					targetBase: "1200.00",
				}),
			}),
			expect.objectContaining({
				kind: "insert",
				table: assumptionLog,
				payload: expect.objectContaining({ kind: "plan-change" }),
			}),
		]);
	});

	it.each([
		["an account that is not earmarked", UNEARMARKED_ID],
		["another user's earmarked account", FOREIGN_POT_ID],
	])("rejects a new plan whose pot is %s, writing nothing", async (_label, potId) => {
		const result = await applyProposalAction({
			proposalId: PROPOSAL_ID,
			proposal: proposalWith([
				{
					op: "create-plan",
					plan: { ...NEW_GOAL_PLAN, potAccountIds: [potId] },
					events: [],
				},
			]),
		});

		expect(result).toEqual(INVALID_POT);
		expect(writes).toEqual([]);
	});

	it("accepts a new plan whose pot is an owned earmarked account", async () => {
		const result = await applyProposalAction({
			proposalId: PROPOSAL_ID,
			proposal: proposalWith([
				{
					op: "create-plan",
					plan: { ...NEW_GOAL_PLAN, potAccountIds: [POT_ID] },
					events: [],
				},
			]),
		});

		expect(result.success).toBe(true);
	});

	it("rejects a plan update that points the plan at a non-pot account, writing nothing", async () => {
		const result = await applyProposalAction({
			proposalId: PROPOSAL_ID,
			proposal: proposalWith([
				{
					op: "update-plan",
					planId: PLAN_ID,
					patch: { potAccountIds: [UNEARMARKED_ID] },
				},
			]),
		});

		expect(result).toEqual(INVALID_POT);
		expect(writes).toEqual([]);
	});

	it("logs per-field assumptions when a proposal updates settings", async () => {
		const result = await applyProposalAction({
			proposalId: PROPOSAL_ID,
			proposal: proposalWith([
				{
					op: "update-settings",
					patch: {
						plannedContribution: 200_000,
						indexForecastPct: { IPCA: 6, INCC: 5 },
					},
				},
			]),
		});

		expect(result).toEqual({ success: true, message: "Proposta aplicada." });
		const summaries = writes
			.filter((w) => w.table === assumptionLog)
			.map((w) => (w.payload as { kind: string }).kind);
		expect(summaries).toEqual(["contribution", "index", "plan-change"]);
		expect(writes.some((w) => w.table === planningSettings)).toBe(true);
	});

	it("creates a plan with its events and records the proposal as planner assumptions", async () => {
		stored.set(plans, [{ id: PLAN_ID, userId: USER_ID, priority: 2 }]);

		const result = await applyProposalAction({
			proposalId: PROPOSAL_ID,
			proposal: proposalWith([
				{
					op: "create-plan",
					plan: {
						name: "Reserva",
						nonNegotiable: true,
						lifecycle: "draft",
						basis: "today",
						index: "IPCA",
						targetMonth: "2028-01",
						window: null,
						potAccountIds: [],
						fields: {
							type: "goal",
							target: { min: 500_000, base: 500_000, max: 500_000 },
						},
					},
					events: [
						{
							label: "Aporte inicial",
							direction: "outflow",
							basis: "today",
							amount: { min: 10_000, base: 10_000, max: 10_000 },
							startMonth: "2026-12",
							endMonth: null,
						},
					],
				},
				{
					op: "record-assumption",
					assumption: {
						kind: "contribution",
						summary: "Aporte mensal estável",
						reviewByMonth: "2027-06",
					},
				},
			]),
		});

		expect(result.success).toBe(true);
		expect(writes).toEqual([
			expect.objectContaining({
				kind: "insert",
				table: plans,
				payload: expect.objectContaining({ userId: USER_ID, priority: 3 }),
			}),
			expect.objectContaining({
				kind: "insert",
				table: planEvents,
				payload: expect.objectContaining({
					planId: NEW_PLAN_ID,
					label: "Aporte inicial",
				}),
			}),
			expect.objectContaining({
				kind: "insert",
				table: assumptionLog,
				payload: expect.objectContaining({
					kind: "plan-change",
					source: "planner",
					proposalId: PROPOSAL_ID,
				}),
			}),
			expect.objectContaining({
				kind: "insert",
				table: assumptionLog,
				payload: expect.objectContaining({
					kind: "contribution",
					source: "planner",
					proposalId: PROPOSAL_ID,
				}),
			}),
		]);
	});
});
