"use server";

import { and, asc, eq, gt, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
	cards,
	financialAccounts,
	reconciliationIgnores,
	transactions,
} from "@/db/schema";
import {
	validateCartaoOwnership,
	validateContaOwnership,
} from "@/features/transactions/actions/core";
import {
	toAppTransaction,
	toBalanceStatus,
} from "@/features/transactions/lib/reconciliation-candidates";
import type {
	AccountBalanceContext,
	BalanceStatus,
} from "@/features/transactions/lib/reconciliation-projection";
import { INITIAL_BALANCE_NOTE } from "@/shared/lib/accounts/constants";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import type { AppTransaction } from "@/shared/lib/reconciliation/matcher";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { parseUtcDateString, toDateOnlyString } from "@/shared/utils/date";

const destinationSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("account"), id: uuidSchema("Conta") }),
	z.object({ type: z.literal("card"), id: uuidSchema("Cartão") }),
]);

const inputSchema = z.object({
	destination: destinationSchema,
	from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
	to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
	fingerprints: z.array(z.string().min(1)),
	periods: z.array(z.string().regex(/^\d{4}-\d{2}$/)).default([]),
});

export type FetchReconciliationCandidatesInput = z.input<typeof inputSchema>;

export type FetchReconciliationCandidatesResult =
	| {
			success: true;
			transactions: AppTransaction[];
			ignoredFingerprints: string[];
			// Dia de vencimento do cartão; nulo quando o destino é conta.
			cardDueDay: string | null;
			// Saldo base da conta; nulo para cartão ou sem pessoa administradora.
			accountBalance: AccountBalanceContext | null;
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

	const { destination, from, to, fingerprints, periods } = parsed.data;

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

	const rangeFrom = new Date(
		parsedFrom.getTime() - RANGE_BUFFER_DAYS * DAY_IN_MS,
	);
	const rangeTo = new Date(parsedTo.getTime() + RANGE_BUFFER_DAYS * DAY_IN_MS);

	// A data comprada pode cair fora do intervalo do arquivo (ex.: compra de
	// 28/07 pertence ao período 2026-08 da fatura), então o lançamento também
	// entra quando o período bate, mesmo com a data fora da folga. Na fatura o
	// período decide sozinho: a parcela traz a data da compra original, igual
	// todo mês, e casaria com a parcela já conciliada na fatura anterior.
	const dateOrPeriod =
		destination.type === "card" && periods.length > 0
			? inArray(transactions.period, periods)
			: periods.length > 0
				? or(
						and(
							gte(transactions.purchaseDate, rangeFrom),
							lte(transactions.purchaseDate, rangeTo),
						),
						inArray(transactions.period, periods),
					)
				: and(
						gte(transactions.purchaseDate, rangeFrom),
						lte(transactions.purchaseDate, rangeTo),
					);

	const [candidateRows, ignoredRows, cardRows, adminPayerId] = await Promise.all([
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
				period: transactions.period,
				isDivided: transactions.isDivided,
				isSettled: transactions.isSettled,
				payerId: transactions.payerId,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					destination.type === "card"
						? eq(transactions.cardId, destination.id)
						: eq(transactions.accountId, destination.id),
					dateOrPeriod,
				),
			),
		fingerprints.length > 0
			? db
					.select({ fingerprint: reconciliationIgnores.fingerprint })
					.from(reconciliationIgnores)
					.where(eq(reconciliationIgnores.userId, userId))
			: Promise.resolve([]),
		destination.type === "card"
			? db
					.select({ dueDay: cards.dueDay })
					.from(cards)
					.where(and(eq(cards.id, destination.id), eq(cards.userId, userId)))
			: Promise.resolve([]),
		destination.type === "account"
			? getAdminPayerId(userId)
			: Promise.resolve(null),
	]);

	const ignoredSet = new Set(ignoredRows.map((row) => row.fingerprint));

	const accountBalance =
		destination.type === "account" && adminPayerId
			? await loadAccountBalance({
					userId,
					accountId: destination.id,
					adminPayerId,
					cutoff: to,
					parsedTo,
					candidates: candidateRows,
				})
			: null;

	return {
		success: true,
		transactions: candidateRows.map(toAppTransaction),
		ignoredFingerprints: fingerprints.filter((fp) => ignoredSet.has(fp)),
		cardDueDay: cardRows[0]?.dueDay ?? null,
		accountBalance,
	};
}

/**
 * Saldo base da conta até `cutoff`, na mesma regra do card de saldo
 * (`accounts/queries.ts`): saldo inicial mais os liquidados do admin, sem o
 * lançamento de saldo inicial. Também lista os lançamentos do admin pagos
 * depois do corte, que ficam fora desse saldo.
 */
async function loadAccountBalance({
	userId,
	accountId,
	adminPayerId,
	cutoff,
	parsedTo,
	candidates,
}: {
	userId: string;
	accountId: string;
	adminPayerId: string;
	cutoff: string;
	parsedTo: Date;
	candidates: ReadonlyArray<{
		id: string;
		isSettled: boolean | null;
		payerId: string | null;
		purchaseDate: Date | string | null;
	}>;
}): Promise<AccountBalanceContext> {
	const adminSettled = and(
		eq(transactions.userId, userId),
		eq(transactions.accountId, accountId),
		eq(transactions.isSettled, true),
		eq(transactions.payerId, adminPayerId),
	);

	const [accountRows, movementRows, paidAfterEndRows] = await Promise.all([
		db
			.select({ initialBalance: financialAccounts.initialBalance })
			.from(financialAccounts)
			.where(
				and(
					eq(financialAccounts.userId, userId),
					eq(financialAccounts.id, accountId),
				),
			),
		db
			.select({
				movements: sql<number>`
          coalesce(
            sum(
              case
                when ${transactions.note} = ${INITIAL_BALANCE_NOTE} then 0
                else ${transactions.amount}
              end
            ),
            0
          )
        `,
			})
			.from(transactions)
			.where(and(adminSettled, lte(transactions.purchaseDate, parsedTo))),
		db
			.select({
				id: transactions.id,
				name: transactions.name,
				purchaseDate: transactions.purchaseDate,
				amount: transactions.amount,
			})
			.from(transactions)
			.where(and(adminSettled, gt(transactions.purchaseDate, parsedTo)))
			.orderBy(asc(transactions.purchaseDate)),
	]);

	const statusById: Record<string, BalanceStatus> = {};
	for (const candidate of candidates) {
		const status = toBalanceStatus(candidate, { adminPayerId, cutoff });
		if (status) {
			statusById[candidate.id] = status;
		}
	}

	const initialBalance = Number(accountRows[0]?.initialBalance ?? 0);
	const movements = Number(movementRows[0]?.movements ?? 0);

	return {
		cutoff,
		baseline: initialBalance + movements,
		adminPayerId,
		statusById,
		paidAfterEnd: paidAfterEndRows.map((row) => ({
			id: row.id,
			name: row.name,
			date: toDateOnlyString(row.purchaseDate) ?? "",
			amount: Number(row.amount),
		})),
	};
}
