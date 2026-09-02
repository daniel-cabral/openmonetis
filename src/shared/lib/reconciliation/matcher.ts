import type { ImportedTransaction } from "@/shared/lib/import/types";

// Folga de data aplicada tanto à Data Lançamento quanto à Data Contábil,
// coerente com a defasagem medida entre as duas colunas do extrato.
const DATE_WINDOW_DAYS = 1;

// Tolerância de arredondamento de parcela, em centavos.
const CENTS_TOLERANCE = 5;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type MatchRule = "fingerprint" | "installment" | "exact" | "cents";

/** Lançamento do app, reduzido ao que o matcher precisa comparar. */
export type AppTransaction = {
	id: string;
	date: string; // YYYY-MM-DD, data da compra
	amount: number; // sempre positivo; o sinal vem de transactionType
	transactionType: "income" | "expense";
	installmentCount: number | null;
	currentInstallment: number | null;
	fingerprint: string | null; // ofx_import_fingerprint já gravado
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
		| { status: "matched"; rule: MatchRule; transactionId: string }
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

const MATCH_RULES: { rule: MatchRule; find: typeof findExactCandidates }[] = [
	{ rule: "fingerprint", find: findFingerprintCandidates },
	{ rule: "installment", find: findInstallmentCandidates },
	{ rule: "exact", find: findExactCandidates },
	{ rule: "cents", find: findCentsCandidates },
];

type Decision = { rule: MatchRule; transactionId: string };

/**
 * Classifica cada linha do arquivo e devolve, do outro lado, os lançamentos do
 * período que nenhuma linha reivindicou. Regras são avaliadas na ordem da spec
 * e a primeira que produz candidato único vence; 2+ candidatos param a linha
 * como ambígua, nunca resolvida automaticamente.
 */
export function matchReconciliationRows(input: {
	rows: ReconciliationRow[];
	transactions: AppTransaction[];
}): ReconciliationMatch {
	const decisions = new Map<number, Decision>();
	const consumed = new Set<string>();

	const available = () =>
		input.transactions.filter((candidate) => !consumed.has(candidate.id));

	// Uma linha que casa libera candidatos disputados por outra, então as regras
	// rodam até o resultado estabilizar. Sem isso, uma linha ambígua poderia
	// sobrar com um candidato só, que a regra 3 já resolveria.
	let changed = true;
	while (changed) {
		changed = false;

		for (const { rule, find } of MATCH_RULES) {
			input.rows.forEach((entry, index) => {
				if (decisions.has(index)) return;

				const candidates = find(entry, available());
				if (candidates.length !== 1) return;

				decisions.set(index, { rule, transactionId: candidates[0].id });
				consumed.add(candidates[0].id);
				changed = true;
			});
		}
	}

	const ambiguousCandidateIds = new Set<string>();

	const rows: RowClassification[] = input.rows.map((entry, index) => {
		const base = { index, fingerprint: entry.fingerprint, row: entry.row };
		const decision = decisions.get(index);

		if (decision) {
			return {
				...base,
				status: "matched",
				rule: decision.rule,
				transactionId: decision.transactionId,
			};
		}

		const remaining = available();
		const candidates = MATCH_RULES.map(({ find }) => find(entry, remaining)).find(
			(found) => found.length > 0,
		);

		if (!candidates) return { ...base, status: "bank-only" };

		for (const candidate of candidates) ambiguousCandidateIds.add(candidate.id);

		return {
			...base,
			status: "ambiguous",
			candidateIds: candidates.map((candidate) => candidate.id),
		};
	});

	const appOnlyIds = input.transactions
		.filter(
			(candidate) =>
				!consumed.has(candidate.id) && !ambiguousCandidateIds.has(candidate.id),
		)
		.map((candidate) => candidate.id);

	return { rows, appOnlyIds };
}
