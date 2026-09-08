import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { buildInvoiceCreditNote } from "@/shared/lib/accounts/constants";
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
	/** Texto bruto do arquivo. Imutável: é sempre ele que chaveia o de-para. */
	descriptor: string;
	/** Nome do lançamento, editável pelo usuário na revisão. */
	name: string;
	categoryId: string | null;
	payerId: string;
	/**
	 * Linha de crédito da fatura (adiantamento, estorno). Recebe nota própria
	 * para ficar fora de renda e despesa nos relatórios: crédito de fatura é
	 * movimento entre conta e cartão, não receita.
	 */
	isInvoiceCredit?: boolean;
};

/**
 * Linha do arquivo que o usuário apontou à mão para um lançamento existente.
 * Concilia como uma confirmação e, diferente dela, ensina o de-para de nome:
 * a decisão é humana e explícita.
 */
export type ReconciliationManualLink = {
	fingerprint: string;
	transactionId: string;
	/** Texto bruto do arquivo, chave do de-para. */
	descriptor: string;
	/** Nome do lançamento vinculado. */
	name: string;
};

/** Escolha explícita de alinhar o valor do lançamento ao do arquivo. */
export type ReconciliationAmountUpdateDecision = {
	transactionId: string;
	amount: number; // sempre positivo; o sinal vem de transactionType
	transactionType: "income" | "expense";
	isDivided: boolean;
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
	manualLinks?: ReconciliationManualLink[];
	amountUpdates?: ReconciliationAmountUpdateDecision[];
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
		/** Só para crédito de fatura; ver `buildInvoiceCreditNote`. */
		note?: string;
	}[];
	fingerprintUpdates: { transactionId: string; fingerprint: string }[];
	ignores: { userId: string; fingerprint: string; reason: string }[];
	categoryMappings: {
		userId: string;
		descriptionKey: string;
		categoryId: string;
	}[];
	nameMappings: {
		userId: string;
		descriptionKey: string;
		name: string;
	}[];
	amountUpdates: { transactionId: string; amount: string }[];
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

	const manualLinks = input.manualLinks ?? [];

	const inserts = input.creations.map((creation) => ({
		name: creation.name,
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
		note:
			creation.isInvoiceCredit && isCard && input.invoicePeriod
				? buildInvoiceCreditNote(
						input.destination.id,
						input.invoicePeriod,
						creation.fingerprint,
					)
				: undefined,
		ofxImportFingerprint: creation.fingerprint,
		importBatchId: input.importBatchId,
	}));

	// Vínculo manual concilia igual à confirmação: o que muda é só a origem
	// da decisão, que o de-para de nome usa mais abaixo.
	const fingerprintUpdates = [...input.confirmations, ...manualLinks].map(
		(entry) => ({
			transactionId: entry.transactionId,
			fingerprint: entry.fingerprint,
		}),
	);

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

	// De-para de nome: só decisão humana explícita alimenta (D6). O vínculo
	// manual vale nos dois destinos; o nome digitado numa criação vale só em
	// conta, porque na fatura o nome tende a ser específico da compra.
	const nameMappingByKey = new Map<
		string,
		{ userId: string; descriptionKey: string; name: string }
	>();

	const nameSources: { descriptor: string; name: string }[] = [
		...(isCard ? [] : input.creations),
		...manualLinks,
	];

	for (const source of nameSources) {
		const name = source.name.trim();
		if (!name) continue;

		const descriptionKey = normalizeDescriptionKey(source.descriptor);
		if (!descriptionKey) continue;

		nameMappingByKey.set(descriptionKey, {
			userId: input.userId,
			descriptionKey,
			name,
		});
	}

	const nameMappings = [...nameMappingByKey.values()];

	// Lançamento dividido fica de fora: o valor vive distribuído entre as
	// partes por pagador, e alterar só o total deixaria a soma inconsistente.
	const amountUpdates = (input.amountUpdates ?? [])
		.filter((update) => !update.isDivided)
		.map((update) => ({
			transactionId: update.transactionId,
			amount: formatDecimalForDbRequired(
				update.transactionType === "expense" ? -update.amount : update.amount,
			),
		}));

	const ignores = input.ignores.map((ignore) => ({
		userId: input.userId,
		fingerprint: ignore.fingerprint,
		reason: ignore.reason,
	}));

	return {
		inserts,
		fingerprintUpdates,
		ignores,
		categoryMappings,
		nameMappings,
		amountUpdates,
	};
}
