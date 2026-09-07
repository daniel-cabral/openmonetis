import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import { derivePeriodFromDate } from "@/shared/utils/period";

// Folga de data aplicada tanto à Data Lançamento quanto à Data Contábil,
// coerente com a defasagem medida entre as duas colunas do extrato.
const DATE_WINDOW_DAYS = 1;

// Tolerância de arredondamento de parcela, em centavos.
const CENTS_TOLERANCE = 5;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type MatchRule =
	| "fingerprint"
	| "installment"
	| "exact"
	| "cents"
	| "name-period";

/** Destino da conciliação; a regra name-period só vale para conta. */
export type DestinationKind = "account" | "card";

/** Contexto que só a regra name-period consome. */
export type MatchContext = {
	// chave normalizada do descriptor → nome aprendido do lançamento
	nameMappings: Record<string, string>;
	destinationKind: DestinationKind | null;
};

/** Lançamento do app, reduzido ao que o matcher precisa comparar. */
export type AppTransaction = {
	id: string;
	name: string; // descrição do lançamento, exibida na revisão manual
	date: string; // YYYY-MM-DD, data da compra
	amount: number; // sempre positivo; o sinal vem de transactionType
	transactionType: "income" | "expense";
	installmentCount: number | null;
	currentInstallment: number | null;
	fingerprint: string | null; // ofx_import_fingerprint já gravado
	period: string; // YYYY-MM, usado pela regra name-period
	isDivided: boolean; // lançamento dividido, restringe a regra name-period
};

export type ReconciliationRow = {
	fingerprint: string;
	row: ImportedTransaction;
};

type ClassifiedRow = {
	index: number;
	fingerprint: string;
	row: ImportedTransaction;
};

export type RowClassification = ClassifiedRow &
	(
		| {
				status: "matched";
				rule: MatchRule;
				transactionId: string;
				// Só a regra name-period preenche, e só quando os valores diferem.
				amountDivergence: { appAmount: number; rowAmount: number } | null;
		  }
		| { status: "ambiguous"; candidateIds: string[] }
		| { status: "bank-only" }
	);

export type ReconciliationMatch = {
	rows: RowClassification[];
	appOnlyIds: string[];
};

function toCents(value: number): number {
	return Math.round(value * 100);
}

function signedCentsOfRow(row: ImportedTransaction): number {
	const cents = toCents(row.amount);
	return row.transactionType === "expense" ? -cents : cents;
}

function signedCentsOfTransaction(candidate: AppTransaction): number {
	const cents = toCents(candidate.amount);
	return candidate.transactionType === "expense" ? -cents : cents;
}

function daysBetween(left: string, right: string): number {
	const diff = Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`);
	return Math.abs(diff) / DAY_IN_MS;
}

// A linha traz as duas datas; a candidata pode bater com qualquer uma delas,
// com ±1 dia de folga.
function isWithinDateWindow(
	row: ImportedTransaction,
	candidate: AppTransaction,
): boolean {
	const dates = [row.date, row.postedDate].filter(
		(date): date is string => Boolean(date),
	);

	return dates.some(
		(date) => daysBetween(date, candidate.date) <= DATE_WINDOW_DAYS,
	);
}

/** Regra 1: a linha já foi conciliada antes e o fingerprint está gravado. */
export function findFingerprintCandidates(
	entry: ReconciliationRow,
	transactions: AppTransaction[],
): AppTransaction[] {
	return transactions.filter(
		(candidate) => candidate.fingerprint === entry.fingerprint,
	);
}

/**
 * Regra 2: parcela N/M da fatura contra a série do app. O total de parcelas
 * restringe o espaço de busca, então a data não entra aqui — a parcela do app
 * pode ter sido lançada em qualquer dia do período.
 */
export function findInstallmentCandidates(
	entry: ReconciliationRow,
	transactions: AppTransaction[],
): AppTransaction[] {
	const installment = entry.row.installment;
	if (!installment) return [];

	const rowCents = signedCentsOfRow(entry.row);

	return transactions.filter(
		(candidate) =>
			candidate.installmentCount === installment.total &&
			candidate.currentInstallment === installment.number &&
			signedCentsOfTransaction(candidate) === rowCents,
	);
}

/** Regra 3: valor com sinal idêntico dentro da janela de data. */
export function findExactCandidates(
	entry: ReconciliationRow,
	transactions: AppTransaction[],
): AppTransaction[] {
	const rowCents = signedCentsOfRow(entry.row);

	return transactions.filter(
		(candidate) =>
			signedCentsOfTransaction(candidate) === rowCents &&
			isWithinDateWindow(entry.row, candidate),
	);
}

/**
 * Regra 4: igual à regra 3, com tolerância de ±R$ 0,05. Só vale quando a linha
 * traz informação de parcela — é onde o arredondamento aparece; à vista a
 * tolerância só produziria falso-positivo.
 */
export function findCentsCandidates(
	entry: ReconciliationRow,
	transactions: AppTransaction[],
): AppTransaction[] {
	if (!entry.row.installment) return [];

	const rowCents = signedCentsOfRow(entry.row);

	return transactions.filter(
		(candidate) =>
			Math.abs(signedCentsOfTransaction(candidate) - rowCents) <=
				CENTS_TOLERANCE && isWithinDateWindow(entry.row, candidate),
	);
}

/**
 * Regra 5: o de-para aprendido decidiu o par uma vez, por decisão humana; o que
 * resta identificar é o mês. Data e valor não entram — é exatamente por
 * divergirem que as regras anteriores não alcançaram a linha. Só vale para
 * destino do tipo conta: na fatura a repetição de lojista no mesmo período é a
 * norma e a regra viraria ambiguidade quase sempre.
 */
export function findNamePeriodCandidates(
	entry: ReconciliationRow,
	transactions: AppTransaction[],
	context?: MatchContext,
): AppTransaction[] {
	if (context?.destinationKind !== "account") return [];

	const learnedName =
		context.nameMappings[normalizeDescriptionKey(entry.row.description)];
	if (!learnedName) return [];

	const period = derivePeriodFromDate(entry.row.date);

	return transactions.filter(
		(candidate) =>
			candidate.name === learnedName &&
			candidate.period === period &&
			candidate.transactionType === entry.row.transactionType,
	);
}

const MATCH_RULES: {
	rule: MatchRule;
	find: typeof findNamePeriodCandidates;
}[] = [
	{ rule: "fingerprint", find: findFingerprintCandidates },
	{ rule: "installment", find: findInstallmentCandidates },
	{ rule: "exact", find: findExactCandidates },
	{ rule: "cents", find: findCentsCandidates },
	{ rule: "name-period", find: findNamePeriodCandidates },
];

type Decision = { rule: MatchRule; transactionId: string };

/**
 * Classifica cada linha do arquivo e devolve, do outro lado, os lançamentos do
 * período que nenhuma linha reivindicou. Regras são avaliadas na ordem da spec
 * e a primeira que produz candidato decide a linha: candidato único vence, 2+
 * param a linha como ambígua, nunca resolvida automaticamente por uma regra
 * mais fraca.
 */
export function matchReconciliationRows(input: {
	rows: ReconciliationRow[];
	transactions: AppTransaction[];
	nameMappings?: Record<string, string>;
	destinationKind?: DestinationKind | null;
}): ReconciliationMatch {
	const context: MatchContext = {
		nameMappings: input.nameMappings ?? {},
		destinationKind: input.destinationKind ?? null,
	};
	const decisions = new Map<number, Decision>();
	const consumed = new Set<string>();
	// Ambiguidades da passada corrente: a linha parou na primeira regra que
	// achou candidato, e essa regra achou 2+.
	let ambiguities = new Map<number, string[]>();

	const available = () =>
		input.transactions.filter((candidate) => !consumed.has(candidate.id));

	// Uma linha que casa libera candidatos disputados por outra, então as regras
	// rodam até o resultado estabilizar. Sem isso, uma linha ambígua poderia
	// sobrar com um candidato só, que a regra 3 já resolveria. As ambiguidades
	// são recalculadas a cada passada, justamente por dependerem do que sobrou.
	let changed = true;
	while (changed) {
		changed = false;
		ambiguities = new Map();

		for (const { rule, find } of MATCH_RULES) {
			input.rows.forEach((entry, index) => {
				// Linha já decidida ou já parada numa regra mais forte não é
				// reavaliada pelas regras seguintes desta passada: deixar uma regra
				// mais fraca escolher sozinha esconderia a ambiguidade detectada
				// pela mais forte.
				if (decisions.has(index) || ambiguities.has(index)) return;

				const candidates = find(entry, available(), context);
				if (candidates.length === 0) return;

				if (candidates.length > 1) {
					ambiguities.set(
						index,
						candidates.map((candidate) => candidate.id),
					);
					return;
				}

				decisions.set(index, { rule, transactionId: candidates[0].id });
				consumed.add(candidates[0].id);
				changed = true;
			});
		}
	}

	const ambiguousCandidateIds = new Set<string>();
	for (const candidateIds of ambiguities.values()) {
		for (const id of candidateIds) ambiguousCandidateIds.add(id);
	}

	const transactionsById = new Map(
		input.transactions.map((candidate) => [candidate.id, candidate]),
	);

	// Casar por nome e período ignora o valor, então a discordância entre o
	// orçamento e o extrato precisa ficar visível em vez de sumir no casamento.
	const amountDivergenceOf = (
		decision: Decision,
		row: ImportedTransaction,
	): { appAmount: number; rowAmount: number } | null => {
		if (decision.rule !== "name-period") return null;

		const candidate = transactionsById.get(decision.transactionId);
		if (!candidate) return null;
		if (toCents(candidate.amount) === toCents(row.amount)) return null;

		return { appAmount: candidate.amount, rowAmount: row.amount };
	};

	const rows: RowClassification[] = input.rows.map((entry, index) => {
		const base = { index, fingerprint: entry.fingerprint, row: entry.row };
		const decision = decisions.get(index);

		if (decision) {
			return {
				...base,
				status: "matched",
				rule: decision.rule,
				transactionId: decision.transactionId,
				amountDivergence: amountDivergenceOf(decision, entry.row),
			};
		}

		const candidateIds = ambiguities.get(index);
		if (!candidateIds) return { ...base, status: "bank-only" };

		return { ...base, status: "ambiguous", candidateIds };
	});

	const appOnlyIds = input.transactions
		.filter(
			(candidate) =>
				!consumed.has(candidate.id) && !ambiguousCandidateIds.has(candidate.id),
		)
		.map((candidate) => candidate.id);

	return { rows, appOnlyIds };
}
