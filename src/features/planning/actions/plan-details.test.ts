import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredRow = Record<string, unknown>;

type Write = {
	kind: "insert" | "update" | "delete";
	table: unknown;
	payload?: unknown;
	condition?: SQL;
	conflictTarget?: unknown;
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
	NEW_EVENT_ID,
} = vi.hoisted(() => {
	const stored = new Map<unknown, StoredRow[]>();
	const writes: Write[] = [];
	const NEW_EVENT_ID = "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b";

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
				const write: Write = { kind: "insert", table, payload };
				writes.push(write);
				return Object.assign(Promise.resolve(), {
					returning: () => Promise.resolve([{ id: NEW_EVENT_ID }]),
					onConflictDoUpdate: ({ target }: { target: unknown }) => {
						write.conflictTarget = target;
						return Promise.resolve();
					},
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
		NEW_EVENT_ID,
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
	bidRecords,
	categories,
	planEvents,
	plans,
} from "@/db/schema";
import type { PlanEventInputData } from "@/features/planning/lib/schemas";
import {
	deletePlanEventAction,
	recordWinningBidAction,
	savePlanEventAction,
	setPlanCategoryMappingsAction,
} from "./plan-details";

const USER_ID = "user-1";
const FOREIGN_USER_ID = "user-2";
const CONSORCIO_PLAN_ID = "5b1e6f2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const GOAL_PLAN_ID = "6c2f7a3b-4d5e-4f60-9b0c-1d2e3f4a5b6c";
const FOREIGN_PLAN_ID = "7d3a8b4c-5e6f-4a71-8c1d-2e3f4a5b6c7d";
const OWN_CATEGORY_ID = "8e4b9c5d-6f70-4b82-9d2e-3f4a5b6c7d8e";
const FOREIGN_CATEGORY_ID = "9f5c0d6e-7a81-4c93-8e3f-4a5b6c7d8e9f";
const FOREIGN_EVENT_ID = "a06d1e7f-8b92-4da4-9f40-5b6c7d8e9f0a";

const NOT_FOUND = { success: false, error: "Registro não encontrado." };

const EVENT: PlanEventInputData = {
	planId: CONSORCIO_PLAN_ID,
	label: "Contemplação",
	direction: "inflow",
	basis: "nominal",
	amount: { min: 100_000, base: 120_000, max: 150_000 },
	startMonth: "2027-03",
	endMonth: null,
};

describe("planning plan detail actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writes.length = 0;
		stored.clear();
		getUserIdMock.mockResolvedValue(USER_ID);
		stored.set(plans, [
			{ id: CONSORCIO_PLAN_ID, userId: USER_ID, type: "consorcio" },
			{ id: GOAL_PLAN_ID, userId: USER_ID, type: "goal" },
			{ id: FOREIGN_PLAN_ID, userId: FOREIGN_USER_ID, type: "consorcio" },
		]);
		stored.set(categories, [
			{ id: OWN_CATEGORY_ID, userId: USER_ID },
			{ id: FOREIGN_CATEGORY_ID, userId: FOREIGN_USER_ID },
		]);
		stored.set(planEvents, [
			{ id: FOREIGN_EVENT_ID, userId: FOREIGN_USER_ID, planId: FOREIGN_PLAN_ID },
		]);
	});

	describe("recordWinningBidAction", () => {
		it("rejects a winning bid on a goal plan without writing", async () => {
			const result = await recordWinningBidAction({
				planId: GOAL_PLAN_ID,
				month: "2027-03",
				winningBidPct: 35,
			});

			expect(result).toEqual({
				success: false,
				error: "Lance só vale para consórcio.",
			});
			expect(writes).toEqual([]);
		});

		it("upserts the winning bid by plan and month", async () => {
			const result = await recordWinningBidAction({
				planId: CONSORCIO_PLAN_ID,
				month: "2027-03",
				winningBidPct: 35.5,
			});

			expect(result.success).toBe(true);
			expect(writes).toEqual([
				expect.objectContaining({
					kind: "insert",
					table: bidRecords,
					payload: expect.objectContaining({
						userId: USER_ID,
						planId: CONSORCIO_PLAN_ID,
						month: "2027-03",
						winningBidPct: "35.50",
					}),
					conflictTarget: [bidRecords.planId, bidRecords.month],
				}),
			]);
		});

		it("does not record a bid on another user's plan", async () => {
			const result = await recordWinningBidAction({
				planId: FOREIGN_PLAN_ID,
				month: "2027-03",
				winningBidPct: 35,
			});

			expect(result).toEqual(NOT_FOUND);
			expect(writes).toEqual([]);
		});
	});

	describe("setPlanCategoryMappingsAction", () => {
		it("does not map another user's category", async () => {
			const result = await setPlanCategoryMappingsAction({
				planId: CONSORCIO_PLAN_ID,
				categoryIds: [FOREIGN_CATEGORY_ID],
			});

			expect(result).toEqual(NOT_FOUND);
			expect(writes).toEqual([]);
		});
	});

	describe("savePlanEventAction", () => {
		it("adds an event to an owned plan", async () => {
			const result = await savePlanEventAction(EVENT);

			expect(result).toEqual({
				success: true,
				message: "Evento salvo.",
				data: { eventId: NEW_EVENT_ID },
			});
			expect(writes).toEqual([
				expect.objectContaining({
					kind: "insert",
					table: planEvents,
					payload: expect.objectContaining({
						userId: USER_ID,
						planId: CONSORCIO_PLAN_ID,
						amountBase: "1200.00",
					}),
				}),
			]);
		});

		it("does not add an event to another user's plan", async () => {
			const result = await savePlanEventAction({
				...EVENT,
				planId: FOREIGN_PLAN_ID,
			});

			expect(result).toEqual(NOT_FOUND);
			expect(writes).toEqual([]);
		});
	});

	describe("deletePlanEventAction", () => {
		it("does not delete another user's event", async () => {
			const result = await deletePlanEventAction({ id: FOREIGN_EVENT_ID });

			expect(result).toEqual(NOT_FOUND);
			expect(writes).toEqual([]);
		});
	});
});
