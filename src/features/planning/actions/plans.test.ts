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

import { financialAccounts, plans } from "@/db/schema";
import type { PlanInput } from "@/features/planning/lib/schemas";
import {
	createPlanAction,
	deletePlanAction,
	reorderPlansAction,
	updatePlanAction,
} from "./plans";

const USER_ID = "user-1";
const FOREIGN_USER_ID = "user-2";
const PLAN_ID = "5b1e6f2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const FIRST_PLAN_ID = "6c2f7a3b-4d5e-4f60-9b0c-1d2e3f4a5b6c";
const FOREIGN_PLAN_ID = "7d3a8b4c-5e6f-4a71-8c1d-2e3f4a5b6c7d";
const POT_ID = "3f1c2a9e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const UNEARMARKED_ID = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const FOREIGN_POT_ID = "c0ffee00-1111-4222-8333-444455556666";

const NOT_FOUND = { success: false, error: "Registro não encontrado." };
const INVALID_POT = { success: false, error: "Pote inválido." };
const INVALID_ORDER = { success: false, error: "Ordem inválida." };

const GOAL: PlanInput = {
	name: "Viagem",
	nonNegotiable: false,
	lifecycle: "draft",
	basis: "today",
	index: "IPCA",
	targetMonth: "2027-06",
	window: null,
	potAccountIds: [],
	fields: {
		type: "goal",
		target: { min: 100_000, base: 120_000, max: 150_000 },
	},
};

describe("planning plan actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writes.length = 0;
		stored.clear();
		getUserIdMock.mockResolvedValue(USER_ID);
		stored.set(plans, [
			{ id: FIRST_PLAN_ID, userId: USER_ID, priority: 1 },
			{ id: PLAN_ID, userId: USER_ID, priority: 2 },
			{ id: FOREIGN_PLAN_ID, userId: FOREIGN_USER_ID, priority: 1 },
		]);
		stored.set(financialAccounts, [
			{ id: POT_ID, userId: USER_ID, isEarmarkedPot: true },
			{ id: UNEARMARKED_ID, userId: USER_ID, isEarmarkedPot: false },
			{ id: FOREIGN_POT_ID, userId: FOREIGN_USER_ID, isEarmarkedPot: true },
		]);
	});

	describe("createPlanAction", () => {
		it("numbers a new plan after the user's last priority", async () => {
			stored.set(plans, [{ id: PLAN_ID, userId: USER_ID, priority: 2 }]);

			const result = await createPlanAction({
				...GOAL,
				potAccountIds: [POT_ID],
			});

			expect(result).toEqual({
				success: true,
				message: "Plano criado.",
				data: { planId: NEW_PLAN_ID },
			});
			expect(writes).toEqual([
				expect.objectContaining({
					kind: "insert",
					table: plans,
					payload: expect.objectContaining({ userId: USER_ID, priority: 3 }),
				}),
			]);
		});

		it.each([
			["an account that is not earmarked", UNEARMARKED_ID],
			["another user's earmarked account", FOREIGN_POT_ID],
		])("rejects a pot that is %s without writing", async (_label, potId) => {
			const result = await createPlanAction({
				...GOAL,
				potAccountIds: [potId],
			});

			expect(result).toEqual(INVALID_POT);
			expect(writes).toEqual([]);
		});
	});

	describe("updatePlanAction", () => {
		it("updates an owned plan", async () => {
			const result = await updatePlanAction({ ...GOAL, id: PLAN_ID });

			expect(result.success).toBe(true);
			expect(writes).toEqual([
				expect.objectContaining({ kind: "update", table: plans }),
			]);
		});

		it("does not update another user's plan", async () => {
			const result = await updatePlanAction({ ...GOAL, id: FOREIGN_PLAN_ID });

			expect(result).toEqual(NOT_FOUND);
			expect(writes).toEqual([]);
		});
	});

	describe("deletePlanAction", () => {
		it("deletes an owned plan", async () => {
			const result = await deletePlanAction({ id: PLAN_ID });

			expect(result.success).toBe(true);
			expect(writes).toEqual([
				expect.objectContaining({ kind: "delete", table: plans }),
			]);
		});

		it("does not delete another user's plan", async () => {
			const result = await deletePlanAction({ id: FOREIGN_PLAN_ID });

			expect(result).toEqual(NOT_FOUND);
			expect(writes).toEqual([]);
		});
	});

	describe("reorderPlansAction", () => {
		it("numbers the plans from 1 in the given order", async () => {
			const result = await reorderPlansAction({
				orderedIds: [PLAN_ID, FIRST_PLAN_ID],
			});

			expect(result.success).toBe(true);
			expect(writes).toEqual([
				expect.objectContaining({
					kind: "update",
					table: plans,
					payload: { priority: 1 },
				}),
				expect.objectContaining({
					kind: "update",
					table: plans,
					payload: { priority: 2 },
				}),
			]);
		});

		it.each([
			["leaves out one of the user's plans", [PLAN_ID]],
			["includes another user's plan", [PLAN_ID, FOREIGN_PLAN_ID]],
		])("rejects an order that %s without writing", async (_label, orderedIds) => {
			const result = await reorderPlansAction({ orderedIds });

			expect(result).toEqual(INVALID_ORDER);
			expect(writes).toEqual([]);
		});
	});
});
