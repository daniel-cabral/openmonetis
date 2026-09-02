import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import type { ReconciliationDestination } from "@/shared/lib/reconciliation/fingerprint";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString } from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";

/** Linha do arquivo casada com um lançamento que já existia no app. */
export type ReconciliationConfirmation = {
	fingerprint: string;
	transactionId: string;
	descriptor: string;
	categoryId: string | null;
};

/** Linha do arquivo que vira lançamento novo. */
export type ReconciliationCreation = {
	fingerprint: string;
	date: string; // YYYY-MM-DD
	amount: number; // sempre positivo; o sinal vem de transactionType
	transactionType: "income" | "expense";
	description: string;
	categoryId: string | null;
	payerId: string;
};

/** Linha do arquivo marcada como deliberadamente não lançável. */
export type ReconciliationIgnoreDecision = {
	fingerprint: string;
	reason: string;
};

export type ReconciliationPlanInput = {
	userId: string;
	importBatchId: string;
	destination: ReconciliationDestination;
	paymentMethod: string;
	invoicePeriod: string | null;
	confirmations: ReconciliationConfirmation[];
	creations: ReconciliationCreation[];
	ignores: ReconciliationIgnoreDecision[];
};

export type ReconciliationPlan = {
	inserts: {
		name: string;
		transactionType: string;
		condition: "À vista";
		paymentMethod: string;
		amount: string;
		purchaseDate: Date;
		period: string;
		isSettled: boolean;
		userId: string;
		payerId: string;
		accountId: string | null;
		cardId: string | null;
		categoryId: string | null;
		ofxImportFingerprint: string;
		importBatchId: string;
	}[];
	fingerprintUpdates: { transactionId: string; fingerprint: string }[];
	ignores: { userId: string; fingerprint: string; reason: string }[];
	categoryMappings: {
		userId: string;
		descriptionKey: string;
		categoryId: string;
	}[];
};

/**
 * Traduz as decisões da revisão nas escritas que a aplicação vai executar.
 * Puro de propósito: nada aqui toca o banco, então o conjunto de escritas é
 * testável isoladamente e a action fica só com transação e ownership.
 */
export function buildReconciliationPlan(
	input: ReconciliationPlanInput,
): ReconciliationPlan {
	const isCard = input.destination.type === "card";
	// Fatura de cartão pode ainda não ter sido paga, como no import de OFX.
	const isSettled = input.paymentMethod !== "Cartão de crédito";

	const inserts = input.creations.map((creation) => ({
		name: creation.description,
		transactionType:
			creation.transactionType === "income" ? "Receita" : "Despesa",
		condition: "À vista" as const,
		paymentMethod: input.paymentMethod,
		amount: formatDecimalForDbRequired(
			creation.transactionType === "expense"
				? -creation.amount
				: creation.amount,
		),
		purchaseDate: parseLocalDateString(creation.date),
		period: input.invoicePeriod ?? derivePeriodFromDate(creation.date),
		isSettled,
		userId: input.userId,
		payerId: creation.payerId,
		accountId: isCard ? null : input.destination.id,
		cardId: isCard ? input.destination.id : null,
		categoryId: creation.categoryId,
		ofxImportFingerprint: creation.fingerprint,
		importBatchId: input.importBatchId,
	}));

	const fingerprintUpdates = input.confirmations.map((confirmation) => ({
		transactionId: confirmation.transactionId,
		fingerprint: confirmation.fingerprint,
	}));

	// De-para aprendido a partir dos matches: só entra quando o lançamento
	// casado já tem categoria escolhida à mão. Descriptors que normalizam para a
	// mesma chave colapsam num registro só — o upsert não pode tocar a mesma
	// linha duas vezes no mesmo comando.
	const categoryMappingByKey = new Map<
		string,
		{ userId: string; descriptionKey: string; categoryId: string }
	>();

	for (const confirmation of input.confirmations) {
		if (!confirmation.categoryId) continue;

		const descriptionKey = normalizeDescriptionKey(confirmation.descriptor);
		if (!descriptionKey) continue;

		categoryMappingByKey.set(descriptionKey, {
			userId: input.userId,
			descriptionKey,
			categoryId: confirmation.categoryId,
		});
	}

	const categoryMappings = [...categoryMappingByKey.values()];

	const ignores = input.ignores.map((ignore) => ({
		userId: input.userId,
		fingerprint: ignore.fingerprint,
		reason: ignore.reason,
	}));

	return { inserts, fingerprintUpdates, ignores, categoryMappings };
}
