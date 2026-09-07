import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getUserIdMock,
	revalidateMock,
	fetchOwnedPayerIdsMock,
	fetchOwnedCategoryIdsMock,
	validateContaMock,
	validateCartaoMock,
	selectQueue,
	writes,
	dbMock,
} = vi.hoisted(() => {
	const selectQueue: unknown[][] = [];
	const writes: { kind: string; table: unknown; payload: unknown }[] = [];

	// Os builders do drizzle são aguardáveis e ainda expõem métodos: uma
	// Promise resolvida com propriedades extras reproduz isso sem `then` solto.
	const awaitable = <T extends object>(extra: T) =>
		Object.assign(Promise.resolve(undefined), extra);

	const select = () => ({
		from: () => ({
			where: () => Promise.resolve(selectQueue.shift() ?? []),
		}),
	});

	const tx = {
		insert: (table: unknown) => ({
			values: (values: unknown[]) => ({
				onConflictDoNothing: () => {
					writes.push({ kind: "insert", table, payload: values });
					return awaitable({
						returning: () =>
							Promise.resolve(values.map((_, index) => ({ id: `new-${index}` }))),
					});
				},
				onConflictDoUpdate: () => {
					writes.push({ kind: "upsert", table, payload: values });
					return awaitable({});
				},
			}),
		}),
		update: (table: unknown) => ({
			set: (values: unknown) => {
				writes.push({ kind: "update", table, payload: values });
				return {
					where: () =>
						awaitable({
							returning: () => Promise.resolve([{ id: "updated" }]),
						}),
				};
			},
		}),
		delete: (table: unknown) => ({
			where: () => {
				writes.push({ kind: "delete", table, payload: null });
				return Promise.resolve(undefined);
			},
		}),
		select,
	};

	const dbMock = {
		select,
		transaction: (callback: (t: typeof tx) => unknown) => callback(tx),
	};

	return {
		getUserIdMock: vi.fn(),
		revalidateMock: vi.fn(),
		fetchOwnedPayerIdsMock: vi.fn(),
		fetchOwnedCategoryIdsMock: vi.fn(),
		validateContaMock: vi.fn(),
		validateCartaoMock: vi.fn(),
		selectQueue,
		writes,
		dbMock,
	};
});

vi.mock("@/shared/lib/auth/server", () => ({ getUserId: getUserIdMock }));
vi.mock("@/shared/lib/db", () => ({ db: dbMock }));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: revalidateMock,
}));
vi.mock("@/features/transactions/actions/core", () => ({
	fetchOwnedPayerIds: fetchOwnedPayerIdsMock,
	fetchOwnedCategoryIds: fetchOwnedCategoryIdsMock,
	validateContaOwnership: validateContaMock,
	validateCartaoOwnership: validateCartaoMock,
}));

import { importNameMappings, transactions } from "@/db/schema";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import {
	applyReconciliationAction,
	undoReconciliationAction,
} from "./reconciliation-action";

const USER_ID = "user-1";
const PAYER_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const TX_ID = "33333333-3333-4333-8333-333333333333";
const DESCRIPTOR = "CASA NOVA LOCADORA LTDA - EPP - Boleto";

const baseInput = {
	destination: { type: "account" as const, id: ACCOUNT_ID },
	paymentMethod: "Pix",
	invoicePeriod: null,
	payerId: PAYER_ID,
	confirmations: [],
	creations: [],
	ignores: [],
};

beforeEach(() => {
	selectQueue.length = 0;
	writes.length = 0;
	vi.clearAllMocks();
	getUserIdMock.mockResolvedValue(USER_ID);
	fetchOwnedPayerIdsMock.mockResolvedValue(new Set([PAYER_ID]));
	fetchOwnedCategoryIdsMock.mockResolvedValue(new Set<string>());
	validateContaMock.mockResolvedValue(true);
	validateCartaoMock.mockResolvedValue(true);
});

describe("applyReconciliationAction — de-para de nome e valor", () => {
	it("grava o de-para e atualiza o valor na mesma transação, devolvendo previousAmount", async () => {
		selectQueue.push([{ id: TX_ID, categoryId: null }]);
		selectQueue.push([{ id: TX_ID, amount: "-2000.00", isDivided: false }]);

		const result = await applyReconciliationAction({
			...baseInput,
			manualLinks: [
				{
					fingerprint: "fp-1",
					transactionId: TX_ID,
					descriptor: DESCRIPTOR,
					name: "Aluguel",
				},
			],
			amountUpdates: [
				{
					transactionId: TX_ID,
					amount: 2150.5,
					transactionType: "expense",
				},
			],
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.reconciled).toEqual([
			{ transactionId: TX_ID, fingerprint: "fp-1" },
		]);
		expect(result.amountUpdates).toEqual([
			{ transactionId: TX_ID, previousAmount: "-2000.00" },
		]);

		const upsert = writes.find(
			(write) => write.kind === "upsert" && write.table === importNameMappings,
		);
		expect(upsert).toBeDefined();
		expect(upsert?.payload).toEqual([
			expect.objectContaining({
				userId: USER_ID,
				descriptionKey: normalizeDescriptionKey(DESCRIPTOR),
				name: "Aluguel",
			}),
		]);

		const amountWrite = writes.find(
			(write) =>
				write.kind === "update" &&
				write.table === transactions &&
				(write.payload as { amount?: string }).amount !== undefined,
		);
		expect(amountWrite?.payload).toEqual({ amount: "-2150.50" });
	});

	it("recusa o lote quando o lançamento a atualizar não é do usuário", async () => {
		selectQueue.push([]);

		const result = await applyReconciliationAction({
			...baseInput,
			amountUpdates: [
				{ transactionId: TX_ID, amount: 10, transactionType: "expense" },
			],
		});

		expect(result).toEqual({
			success: false,
			error: "Lançamento não encontrado.",
		});
		expect(writes).toHaveLength(0);
	});

	it("não atualiza valor de lançamento dividido, segundo o banco", async () => {
		selectQueue.push([{ id: TX_ID, amount: "-2000.00", isDivided: true }]);

		const result = await applyReconciliationAction({
			...baseInput,
			ignores: [{ fingerprint: "fp-9", reason: "Transferência interna" }],
			amountUpdates: [
				{ transactionId: TX_ID, amount: 2150.5, transactionType: "expense" },
			],
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.amountUpdates).toEqual([]);
		expect(
			writes.some(
				(write) =>
					write.kind === "update" &&
					(write.payload as { amount?: string }).amount !== undefined,
			),
		).toBe(false);
	});
});

describe("undoReconciliationAction", () => {
	it("restaura o valor anterior dos lançamentos atualizados", async () => {
		const result = await undoReconciliationAction({
			importBatchId: "batch-1",
			reconciled: [],
			amountUpdates: [{ transactionId: TX_ID, previousAmount: "-2000.00" }],
		});

		expect(result.success).toBe(true);
		const restore = writes.find(
			(write) =>
				write.kind === "update" &&
				(write.payload as { amount?: string }).amount === "-2000.00",
		);
		expect(restore).toBeDefined();
	});
});
