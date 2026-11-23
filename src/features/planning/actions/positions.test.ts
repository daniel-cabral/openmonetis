import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getUserIdMock,
	revalidatePathMock,
	revalidateTagMock,
	accountRows,
	writes,
	dbMock,
} = vi.hoisted(() => {
	const accountRows: { id: string; userId: string; accountType: string }[] = [];
	const writes: {
		kind: string;
		table: unknown;
		payload?: unknown;
		condition?: SQL;
	}[] = [];

	const tx = {
		select: () => ({
			from: () => ({
				where: (condition: SQL) => ({
					limit: () =>
						Promise.resolve(
							accountRows.filter((row) => matchesCondition(condition, row)),
						),
				}),
			}),
		}),
		delete: (table: unknown) => ({
			where: (condition: SQL) => {
				writes.push({ kind: "delete", table, condition });
				return Promise.resolve();
			},
		}),
		insert: (table: unknown) => ({
			values: (payload: unknown) => {
				writes.push({ kind: "insert", table, payload });
				return Promise.resolve();
			},
		}),
		update: (table: unknown) => ({
			set: (payload: unknown) => ({
				where: (condition: SQL) => {
					writes.push({ kind: "update", table, payload, condition });
					return Promise.resolve();
				},
			}),
		}),
	};

	return {
		getUserIdMock: vi.fn(),
		revalidatePathMock: vi.fn(),
		revalidateTagMock: vi.fn(),
		accountRows,
		writes,
		dbMock: {
			transaction: (callback: (t: typeof tx) => unknown) => callback(tx),
		},
	};
});

// Fake of the account table: a row matches when the query filters for its id,
// its owner and its type.
function sqlParams(condition: SQL): unknown[] {
	return new PgDialect().sqlToQuery(condition).params;
}

function matchesCondition(
	condition: SQL,
	row: { id: string; userId: string; accountType: string },
): boolean {
	const params = sqlParams(condition);
	return (
		params.includes(row.id) &&
		params.includes(row.userId) &&
		params.includes(row.accountType)
	);
}

vi.mock("@/shared/lib/auth/server", () => ({ getUserId: getUserIdMock }));
vi.mock("@/shared/lib/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({
	revalidatePath: revalidatePathMock,
	revalidateTag: revalidateTagMock,
}));

import { financialAccounts, investmentPositions } from "@/db/schema";
import {
	replaceAccountPositionsAction,
	setAccountEarmarkedAction,
} from "./positions";

const USER_ID = "user-1";
const FOREIGN_USER_ID = "user-2";
const INVESTMENT_ID = "3f1c2a9e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const CHECKING_ID = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const FOREIGN_ID = "c0ffee00-1111-4222-8333-444455556666";

const NOT_FOUND = { success: false, error: "Registro não encontrado." };

const POSITION = {
	description: "Tesouro Selic",
	amount: 150_000,
	liquidity: "daily" as const,
	maturityMonth: null,
	annualRealReturnPct: 5.5,
};

describe("planning positions and earmark actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writes.length = 0;
		accountRows.length = 0;
		accountRows.push(
			{ id: INVESTMENT_ID, userId: USER_ID, accountType: "Conta Investimento" },
			{ id: CHECKING_ID, userId: USER_ID, accountType: "Conta Corrente" },
			{
				id: FOREIGN_ID,
				userId: FOREIGN_USER_ID,
				accountType: "Conta Investimento",
			},
		);
		getUserIdMock.mockResolvedValue(USER_ID);
	});

	describe("replaceAccountPositionsAction", () => {
		it.each([
			["another user's investment account", FOREIGN_ID],
			["own checking account", CHECKING_ID],
		])("rejects %s without writing", async (_label, accountId) => {
			const result = await replaceAccountPositionsAction({
				accountId,
				asOf: "2026-11-30",
				positions: [POSITION],
			});

			expect(result).toEqual(NOT_FOUND);
			expect(writes).toEqual([]);
		});

		it("replaces the as-of set of an owned investment account", async () => {
			const result = await replaceAccountPositionsAction({
				accountId: INVESTMENT_ID,
				asOf: "2026-11-30",
				positions: [POSITION],
			});

			expect(result.success).toBe(true);
			expect(writes).toEqual([
				expect.objectContaining({
					kind: "delete",
					table: investmentPositions,
					condition: expect.anything(),
				}),
				expect.objectContaining({
					kind: "insert",
					table: investmentPositions,
					payload: [
						expect.objectContaining({
							accountId: INVESTMENT_ID,
							description: "Tesouro Selic",
							amount: "1500.00",
						}),
					],
				}),
			]);
			expect(sqlParams(writes[0].condition as SQL)).toEqual(
				expect.arrayContaining([
					USER_ID,
					INVESTMENT_ID,
					new Date(2026, 10, 30).toISOString(),
				]),
			);
		});
	});

	describe("setAccountEarmarkedAction", () => {
		it.each([
			["another user's investment account", FOREIGN_ID],
			["own checking account", CHECKING_ID],
		])("rejects %s without writing", async (_label, accountId) => {
			const result = await setAccountEarmarkedAction({
				accountId,
				earmarked: true,
			});

			expect(result).toEqual(NOT_FOUND);
			expect(writes).toEqual([]);
		});

		it("flags an owned investment account as earmarked pot", async () => {
			const result = await setAccountEarmarkedAction({
				accountId: INVESTMENT_ID,
				earmarked: true,
			});

			expect(result.success).toBe(true);
			expect(writes).toEqual([
				expect.objectContaining({
					kind: "update",
					table: financialAccounts,
					payload: { isEarmarkedPot: true },
				}),
			]);
		});
	});
});
