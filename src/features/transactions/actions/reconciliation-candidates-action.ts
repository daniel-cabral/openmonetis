"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { reconciliationIgnores, transactions } from "@/db/schema";
import {
	validateCartaoOwnership,
	validateContaOwnership,
} from "@/features/transactions/actions/core";
import { toAppTransaction } from "@/features/transactions/lib/reconciliation-candidates";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { AppTransaction } from "@/shared/lib/reconciliation/matcher";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { parseUtcDateString } from "@/shared/utils/date";

const destinationSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("account"), id: uuidSchema("Conta") }),
	z.object({ type: z.literal("card"), id: uuidSchema("Cartão") }),
]);

const inputSchema = z.object({
	destination: destinationSchema,
	from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
	to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
	fingerprints: z.array(z.string().min(1)),
});

export type FetchReconciliationCandidatesInput = z.input<typeof inputSchema>;

export type FetchReconciliationCandidatesResult =
	| {
			success: true;
			transactions: AppTransaction[];
			ignoredFingerprints: string[];
	  }
	| { success: false; error: string };

// Folga além da janela de ±1 dia do matcher, para não cortar candidato na
// borda do intervalo do arquivo.
const RANGE_BUFFER_DAYS = 3;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Leitura pura para a revisão: lançamentos do app candidatos a casar com o
 * arquivo (mesmo destino, dentro do intervalo de datas do arquivo com folga)
 * e os fingerprints já marcados como ignorados. Nenhuma escrita — a única
 * escrita da conciliação é a aplicação em lote.
 */
export async function fetchReconciliationCandidatesAction(
	input: FetchReconciliationCandidatesInput,
): Promise<FetchReconciliationCandidatesResult> {
	const userId = await getUserId();
	const parsed = inputSchema.safeParse(input);

	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
		};
	}

	const { destination, from, to, fingerprints } = parsed.data;

	const destinationOk =
		destination.type === "card"
			? await validateCartaoOwnership(userId, destination.id)
			: await validateContaOwnership(userId, destination.id);

	if (!destinationOk) {
		return { success: false, error: "Conta ou cartão não encontrado." };
	}

	const parsedFrom = parseUtcDateString(from);
	const parsedTo = parseUtcDateString(to);

	if (!parsedFrom || !parsedTo) {
		return { success: false, error: "Data inválida." };
	}

	const rangeFrom = new Date(parsedFrom.getTime() - RANGE_BUFFER_DAYS * DAY_IN_MS);
	const rangeTo = new Date(parsedTo.getTime() + RANGE_BUFFER_DAYS * DAY_IN_MS);

	const [candidateRows, ignoredRows] = await Promise.all([
		db
			.select({
				id: transactions.id,
				name: transactions.name,
				purchaseDate: transactions.purchaseDate,
				amount: transactions.amount,
				transactionType: transactions.transactionType,
				installmentCount: transactions.installmentCount,
				currentInstallment: transactions.currentInstallment,
				ofxImportFingerprint: transactions.ofxImportFingerprint,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					destination.type === "card"
						? eq(transactions.cardId, destination.id)
						: eq(transactions.accountId, destination.id),
					gte(transactions.purchaseDate, rangeFrom),
					lte(transactions.purchaseDate, rangeTo),
				),
			),
		fingerprints.length > 0
			? db
					.select({ fingerprint: reconciliationIgnores.fingerprint })
					.from(reconciliationIgnores)
					.where(eq(reconciliationIgnores.userId, userId))
			: Promise.resolve([]),
	]);

	const ignoredSet = new Set(ignoredRows.map((row) => row.fingerprint));

	return {
		success: true,
		transactions: candidateRows.map(toAppTransaction),
		ignoredFingerprints: fingerprints.filter((fp) => ignoredSet.has(fp)),
	};
}
