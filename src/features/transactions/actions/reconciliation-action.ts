"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
import { fetchSubcategoryParents } from "@/shared/lib/subcategories/queries";
import { validateSubcategoryPairs } from "@/shared/lib/subcategories/rules";

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
	subcategoryId: z
		.string()
		.uuid("Subcategoria inválida.")
		.nullable()
		.optional(),
	payerId: uuidSchema("Pessoa").nullable().optional(),
	// Linha de crédito da fatura: o lançamento criado recebe nota própria para
	// ficar fora de renda e despesa nos relatórios.
	isInvoiceCredit: z.boolean().optional(),
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
	unmatches: z
		.array(
			z.object({
				fingerprint: z.string().min(1),
				transactionId: uuidSchema("Lançamento"),
			}),
		)
		.optional(),
});

const undoSchema = z.object({
	importBatchId: z.string().min(1),
	reconciled: z.array(
		z.object({
			transactionId: uuidSchema("Lançamento"),
			fingerprint: z.string().min(1),
		}),
	),
	released: z
		.array(
			z.object({
				transactionId: uuidSchema("Lançamento"),
				fingerprint: z.string().min(1),
			}),
		)
		.optional(),
	settledByApply: z.array(uuidSchema("Lançamento")).optional(),
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
			// Criações recusadas pelo índice único: o fingerprint já está em outro
			// lançamento, fora do que a revisão mostrou.
			skipped: number;
			reconciled: { transactionId: string; fingerprint: string }[];
			ignored: number;
			amountUpdates: { transactionId: string; previousAmount: string }[];
			// Fingerprints liberados pelos casamentos desfeitos, para o desfazer devolver.
			released: { transactionId: string; fingerprint: string }[];
			// Lançamentos que a confirmação marcou como pagos, para o desfazer reverter.
			settledByApply: string[];
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
	const unmatches = parsed.data.unmatches ?? [];

	if (
		confirmations.length === 0 &&
		creations.length === 0 &&
		ignores.length === 0 &&
		manualLinks.length === 0 &&
		amountUpdates.length === 0 &&
		unmatches.length === 0
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

	const subcategoryParents = await fetchSubcategoryParents(
		userId,
		creations.map((creation) => creation.subcategoryId),
	);
	const subcategoryError = validateSubcategoryPairs(
		creations.map((creation) => ({
			categoryId: creation.categoryId ?? null,
			subcategoryId: creation.subcategoryId,
		})),
		subcategoryParents,
	);
	if (subcategoryError) return { success: false, error: subcategoryError };

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
						subcategoryId: transactions.subcategoryId,
						isSettled: transactions.isSettled,
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
	const subcategoryIdByTransaction = new Map(
		matchedTransactions.map((row) => [row.id, row.subcategoryId]),
	);
	const isSettledByTransaction = new Map(
		matchedTransactions.map((row) => [row.id, row.isSettled]),
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
			subcategoryId:
				subcategoryIdByTransaction.get(confirmation.transactionId) ?? null,
		})),
		creations: creations.map((creation, index) => ({
			fingerprint: creation.fingerprint,
			date: creation.date,
			amount: creation.amount,
			transactionType: creation.transactionType,
			descriptor: creation.descriptor,
			name: creation.name,
			categoryId: creation.categoryId ?? null,
			subcategoryId: creation.subcategoryId ?? null,
			payerId: payerIdsByCreation[index],
			isInvoiceCredit: creation.isInvoiceCredit,
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
			// Libera antes de qualquer insert: o fingerprint do casamento desfeito ainda
			// está no lançamento antigo e o índice único recusaria a criação.
			const released: { transactionId: string; fingerprint: string }[] = [];
			for (const unmatch of unmatches) {
				const [releasedRow] = await tx
					.update(transactions)
					.set({ ofxImportFingerprint: null })
					.where(
						and(
							eq(transactions.userId, userId),
							eq(transactions.id, unmatch.transactionId),
							eq(transactions.ofxImportFingerprint, unmatch.fingerprint),
						),
					)
					.returning({ id: transactions.id });

				if (releasedRow) {
					released.push({
						transactionId: unmatch.transactionId,
						fingerprint: unmatch.fingerprint,
					});
				}
			}

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
			const settledByApply: string[] = [];

			// Casou com uma linha do extrato: o dinheiro já saiu da conta, então o
			// lançamento pendente vira pago. No cartão isSettled fica null.
			const settledOnMatch =
				destination.type === "account" ? { isSettled: true } : {};

			for (const update of plan.fingerprintUpdates) {
				const [updated] = await tx
					.update(transactions)
					.set({ ofxImportFingerprint: update.fingerprint, ...settledOnMatch })
					.where(
						and(
							eq(transactions.userId, userId),
							eq(transactions.id, update.transactionId),
						),
					)
					.returning({ id: transactions.id });

				if (updated) reconciled.push(update);
				// Só o que estava pendente volta a pendente no desfazer.
				if (
					updated &&
					destination.type === "account" &&
					isSettledByTransaction.get(update.transactionId) !== true
				) {
					settledByApply.push(update.transactionId);
				}
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
							subcategoryId: sql`excluded.subcategory_id`,
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
				skipped: plan.inserts.length - inserted.length,
				reconciled,
				ignored: plan.ignores.length,
				amountUpdates: appliedAmountUpdates,
				released,
				settledByApply,
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
 * Also reverts what the apply settled (back to pending) and restores the
 * fingerprints it released from undone matches.
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
	const released = parsed.data.released ?? [];
	const settledByApply = parsed.data.settledByApply ?? [];

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

			// Limpa só os fingerprints deste lote: o par id + fingerprint evita
			// apagar uma conciliação posterior do mesmo lançamento.
			if (reconciled.length > 0) {
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
			}

			// Runs after the batch fingerprints are cleared, so the released fingerprints
			// below can take their place under the unique index.
			if (settledByApply.length > 0) {
				await tx
					.update(transactions)
					.set({ isSettled: false })
					.where(
						and(
							eq(transactions.userId, userId),
							inArray(transactions.id, settledByApply),
						),
					);
			}

			// Restores only where the column is still free: a later match may own it.
			for (const entry of released) {
				await tx
					.update(transactions)
					.set({ ofxImportFingerprint: entry.fingerprint })
					.where(
						and(
							eq(transactions.userId, userId),
							eq(transactions.id, entry.transactionId),
							isNull(transactions.ofxImportFingerprint),
						),
					);
			}
		});
	} catch (error) {
		console.error("[undoReconciliationAction]", error);
		return { success: false, error: "Algo deu errado." };
	}

	revalidateForEntity("transactions", userId);

	return { success: true };
}
