"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
	importCategoryMappings,
	importNameMappings,
	reconciliationIgnores,
	transactions,
} from "@/db/schema";
import {
	fetchOwnedCategoryIds,
	fetchOwnedPayerIds,
	validateCartaoOwnership,
	validateContaOwnership,
} from "@/features/transactions/actions/core";
import { buildReconciliationPlan } from "@/features/transactions/lib/reconciliation-plan";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";

const destinationSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("account"), id: uuidSchema("Conta") }),
	z.object({ type: z.literal("card"), id: uuidSchema("Cartão") }),
]);

const confirmationSchema = z.object({
	fingerprint: z.string().min(1),
	transactionId: uuidSchema("Lançamento"),
	descriptor: z.string(),
});

const creationSchema = z.object({
	fingerprint: z.string().min(1),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
	amount: z.number().positive(),
	transactionType: z.enum(["income", "expense"]),
	descriptor: z.string(),
	name: z.string().min(1, "Nome obrigatório."),
	categoryId: uuidSchema("Categoria").nullable().optional(),
	payerId: uuidSchema("Pessoa").nullable().optional(),
});

const manualLinkSchema = z.object({
	fingerprint: z.string().min(1),
	transactionId: uuidSchema("Lançamento"),
	descriptor: z.string(),
	name: z.string().min(1, "Nome obrigatório."),
});

// `isDivided` não vem do cliente: sai do próprio banco junto do valor anterior.
const amountUpdateSchema = z.object({
	transactionId: uuidSchema("Lançamento"),
	amount: z.number().positive(),
	transactionType: z.enum(["income", "expense"]),
});

const ignoreSchema = z.object({
	fingerprint: z.string().min(1),
	reason: z.string().min(1, "Motivo obrigatório."),
});

const applySchema = z.object({
	destination: destinationSchema,
	paymentMethod: z.string().min(1),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/, "Período inválido.")
		.nullable()
		.optional(),
	payerId: uuidSchema("Pessoa"),
	confirmations: z.array(confirmationSchema),
	creations: z.array(creationSchema),
	ignores: z.array(ignoreSchema),
	manualLinks: z.array(manualLinkSchema).optional(),
	amountUpdates: z.array(amountUpdateSchema).optional(),
});

const undoSchema = z.object({
	importBatchId: z.string().min(1),
	reconciled: z.array(
		z.object({
			transactionId: uuidSchema("Lançamento"),
			fingerprint: z.string().min(1),
		}),
	),
	amountUpdates: z
		.array(
			z.object({
				transactionId: uuidSchema("Lançamento"),
				previousAmount: z.string().min(1),
			}),
		)
		.optional(),
});

export type ApplyReconciliationInput = z.input<typeof applySchema>;
export type UndoReconciliationInput = z.input<typeof undoSchema>;

export type ApplyReconciliationResult =
	| {
			success: true;
			importBatchId: string;
			created: number;
			reconciled: { transactionId: string; fingerprint: string }[];
			ignored: number;
			amountUpdates: { transactionId: string; previousAmount: string }[];
	  }
	| { success: false; error: string };

/**
 * Única escrita da conciliação: cria os lançamentos decididos, grava o
 * fingerprint nos lançamentos preexistentes que casaram, registra os ignorados
 * e alimenta o de-para de categoria. Tudo numa transação — ou o lote inteiro
 * entra, ou nada entra.
 */
export async function applyReconciliationAction(
	input: ApplyReconciliationInput,
): Promise<ApplyReconciliationResult> {
	const userId = await getUserId();
	const parsed = applySchema.safeParse(input);

	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
		};
	}

	const { destination, paymentMethod, invoicePeriod, payerId } = parsed.data;
	const { confirmations, creations, ignores } = parsed.data;
	const manualLinks = parsed.data.manualLinks ?? [];
	const amountUpdates = parsed.data.amountUpdates ?? [];

	if (
		confirmations.length === 0 &&
		creations.length === 0 &&
		ignores.length === 0 &&
		manualLinks.length === 0 &&
		amountUpdates.length === 0
	) {
		return { success: false, error: "Nenhuma decisão para aplicar." };
	}

	const payerIdsByCreation = creations.map(
		(creation) => creation.payerId ?? payerId,
	);

	const [ownedPayerIds, ownedCategoryIds, destinationOk] = await Promise.all([
		fetchOwnedPayerIds(userId, payerIdsByCreation),
		fetchOwnedCategoryIds(
			userId,
			creations.map((creation) => creation.categoryId),
		),
		destination.type === "card"
			? validateCartaoOwnership(userId, destination.id)
			: validateContaOwnership(userId, destination.id),
	]);

	if (!destinationOk) {
		return { success: false, error: "Conta ou cartão não encontrado." };
	}

	if (payerIdsByCreation.some((id) => !ownedPayerIds.has(id))) {
		return { success: false, error: "Pessoa não encontrada." };
	}

	if (
		creations.some(
			(creation) =>
				creation.categoryId && !ownedCategoryIds.has(creation.categoryId),
		)
	) {
		return { success: false, error: "Categoria não encontrada." };
	}

	// A categoria do de-para sai do lançamento casado, no banco, e não do
	// cliente: o mesmo select já serve de guard de ownership.
	const confirmationIds = [
		...new Set([
			...confirmations.map((confirmation) => confirmation.transactionId),
			...manualLinks.map((link) => link.transactionId),
		]),
	];
	const matchedTransactions =
		confirmationIds.length > 0
			? await db
					.select({
						id: transactions.id,
						categoryId: transactions.categoryId,
					})
					.from(transactions)
					.where(
						and(
							eq(transactions.userId, userId),
							inArray(transactions.id, confirmationIds),
						),
					)
			: [];

	if (matchedTransactions.length !== confirmationIds.length) {
		return { success: false, error: "Lançamento não encontrado." };
	}

	const categoryIdByTransaction = new Map(
		matchedTransactions.map((row) => [row.id, row.categoryId]),
	);

	// Valor anterior e `dividido` saem do banco, no mesmo select que serve de
	// guard de ownership: o desfazer precisa do valor real, e confiar no
	// cliente para o `dividido` deixaria a regra de D5 do lado errado.
	const amountUpdateIds = [
		...new Set(amountUpdates.map((update) => update.transactionId)),
	];
	const amountUpdateTargets =
		amountUpdateIds.length > 0
			? await db
					.select({
						id: transactions.id,
						amount: transactions.amount,
						isDivided: transactions.isDivided,
					})
					.from(transactions)
					.where(
						and(
							eq(transactions.userId, userId),
							inArray(transactions.id, amountUpdateIds),
						),
					)
			: [];

	if (amountUpdateTargets.length !== amountUpdateIds.length) {
		return { success: false, error: "Lançamento não encontrado." };
	}

	const amountUpdateTargetById = new Map(
		amountUpdateTargets.map((row) => [row.id, row]),
	);

	const importBatchId = crypto.randomUUID();
	const plan = buildReconciliationPlan({
		userId,
		importBatchId,
		destination,
		paymentMethod,
		invoicePeriod: invoicePeriod ?? null,
		confirmations: confirmations.map((confirmation) => ({
			...confirmation,
			categoryId:
				categoryIdByTransaction.get(confirmation.transactionId) ?? null,
		})),
		creations: creations.map((creation, index) => ({
			fingerprint: creation.fingerprint,
			date: creation.date,
			amount: creation.amount,
			transactionType: creation.transactionType,
			descriptor: creation.descriptor,
			name: creation.name,
			categoryId: creation.categoryId ?? null,
			payerId: payerIdsByCreation[index],
		})),
		ignores,
		manualLinks,
		amountUpdates: amountUpdates.map((update) => ({
			...update,
			isDivided:
				amountUpdateTargetById.get(update.transactionId)?.isDivided ?? false,
		})),
	});

	try {
		const applied = await db.transaction(async (tx: typeof db) => {
			// O índice único de fingerprint protege contra aplicar o mesmo lote duas vezes.
			const inserted =
				plan.inserts.length > 0
					? await tx
							.insert(transactions)
							.values(plan.inserts)
							.onConflictDoNothing({
								target: [
									transactions.userId,
									transactions.ofxImportFingerprint,
								],
								where: sql`ofx_import_fingerprint IS NOT NULL`,
							})
							.returning({ id: transactions.id })
					: [];

			const reconciled: { transactionId: string; fingerprint: string }[] = [];

			for (const update of plan.fingerprintUpdates) {
				const [updated] = await tx
					.update(transactions)
					.set({ ofxImportFingerprint: update.fingerprint })
					.where(
						and(
							eq(transactions.userId, userId),
							eq(transactions.id, update.transactionId),
						),
					)
					.returning({ id: transactions.id });

				if (updated) reconciled.push(update);
			}

			if (plan.ignores.length > 0) {
				await tx
					.insert(reconciliationIgnores)
					.values(plan.ignores)
					.onConflictDoNothing({
						target: [
							reconciliationIgnores.userId,
							reconciliationIgnores.fingerprint,
						],
					});
			}

			if (plan.categoryMappings.length > 0) {
				await tx
					.insert(importCategoryMappings)
					.values(
						plan.categoryMappings.map((mapping) => ({
							...mapping,
							updatedAt: new Date(),
						})),
					)
					.onConflictDoUpdate({
						target: [
							importCategoryMappings.userId,
							importCategoryMappings.descriptionKey,
						],
						set: {
							categoryId: sql`excluded.category_id`,
							updatedAt: sql`excluded.updated_at`,
						},
					});
			}

			if (plan.nameMappings.length > 0) {
				await tx
					.insert(importNameMappings)
					.values(
						plan.nameMappings.map((mapping) => ({
							...mapping,
							updatedAt: new Date(),
						})),
					)
					.onConflictDoUpdate({
						target: [
							importNameMappings.userId,
							importNameMappings.descriptionKey,
						],
						set: {
							name: sql`excluded.name`,
							updatedAt: sql`excluded.updated_at`,
						},
					});
			}

			const appliedAmountUpdates: {
				transactionId: string;
				previousAmount: string;
			}[] = [];

			for (const update of plan.amountUpdates) {
				const target = amountUpdateTargetById.get(update.transactionId);
				if (!target) continue;

				const [updated] = await tx
					.update(transactions)
					.set({ amount: update.amount })
					.where(
						and(
							eq(transactions.userId, userId),
							eq(transactions.id, update.transactionId),
						),
					)
					.returning({ id: transactions.id });

				if (updated) {
					appliedAmountUpdates.push({
						transactionId: update.transactionId,
						previousAmount: target.amount,
					});
				}
			}

			return {
				success: true as const,
				importBatchId,
				created: inserted.length,
				reconciled,
				ignored: plan.ignores.length,
				amountUpdates: appliedAmountUpdates,
			};
		});

		revalidateForEntity("transactions", userId);

		return applied;
	} catch (error) {
		console.error("[applyReconciliationAction]", error);
		return { success: false, error: "Algo deu errado." };
	}
}

/**
 * Desfaz o lote: remove os lançamentos criados e limpa o fingerprint gravado
 * nos lançamentos que já existiam. Os ignorados permanecem — a decisão de não
 * lançar uma linha é do usuário, não do lote.
 */
export async function undoReconciliationAction(
	input: UndoReconciliationInput,
): Promise<{ success: boolean; error?: string }> {
	const userId = await getUserId();
	const parsed = undoSchema.safeParse(input);

	if (!parsed.success) {
		return { success: false, error: "Lote inválido." };
	}

	const { importBatchId, reconciled } = parsed.data;
	const amountUpdates = parsed.data.amountUpdates ?? [];

	try {
		await db.transaction(async (tx: typeof db) => {
			await tx
				.delete(transactions)
				.where(
					and(
						eq(transactions.userId, userId),
						eq(transactions.importBatchId, importBatchId),
					),
				);

			// Restaura o valor que a aplicação sobrescreveu, antes de tratar os
			// fingerprints: são escritas independentes no mesmo lote.
			for (const update of amountUpdates) {
				await tx
					.update(transactions)
					.set({ amount: update.previousAmount })
					.where(
						and(
							eq(transactions.userId, userId),
							eq(transactions.id, update.transactionId),
						),
					);
			}

			if (reconciled.length === 0) return;

			// Limpa só os fingerprints deste lote: o par id + fingerprint evita
			// apagar uma conciliação posterior do mesmo lançamento.
			await tx
				.update(transactions)
				.set({ ofxImportFingerprint: null })
				.where(
					and(
						eq(transactions.userId, userId),
						inArray(
							transactions.id,
							reconciled.map((entry) => entry.transactionId),
						),
						inArray(
							transactions.ofxImportFingerprint,
							reconciled.map((entry) => entry.fingerprint),
						),
					),
				);
		});
	} catch (error) {
		console.error("[undoReconciliationAction]", error);
		return { success: false, error: "Algo deu errado." };
	}

	revalidateForEntity("transactions", userId);

	return { success: true };
}
