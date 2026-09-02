import { normalizeOfxIdentityText } from "@/shared/lib/import/ofx-identity";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";

const FINGERPRINT_VERSION = "openmonetis-reconciliation-v1";

export type ReconciliationDestination = {
	type: "account" | "card";
	id: string;
};

export type ReconciliationKind = "statement" | "invoice";

export type ReconciliationFingerprintInput = {
	kind: ReconciliationKind;
	source: string;
	accountNumber: string | null;
	destination: ReconciliationDestination;
	rows: ImportedTransaction[];
};

function signedAmountOf(row: ImportedTransaction): string {
	const signed = row.transactionType === "expense" ? -row.amount : row.amount;
	return formatDecimalForDbRequired(signed);
}

function formatInstallment(row: ImportedTransaction): string {
	return row.installment
		? `${row.installment.number}/${row.installment.total}`
		: "";
}

// Campos que identificam a linha, sem a ocorrência. Linhas com a mesma chave
// são indistinguíveis dentro do arquivo e só se separam pela ocorrência.
function buildIdentityFields(
	input: Omit<ReconciliationFingerprintInput, "rows">,
	row: ImportedTransaction,
): unknown[] {
	const common = [
		FINGERPRINT_VERSION,
		input.kind,
		normalizeOfxIdentityText(input.source),
		input.destination.type,
		input.destination.id,
	];

	if (input.kind === "statement") {
		return [
			...common,
			normalizeOfxIdentityText(input.accountNumber ?? ""),
			row.date,
			row.postedDate ?? "",
			normalizeOfxIdentityText(row.description),
			signedAmountOf(row),
		];
	}

	return [
		...common,
		normalizeOfxIdentityText(row.cardLast4 ?? ""),
		row.date,
		normalizeOfxIdentityText(row.description),
		formatInstallment(row),
		signedAmountOf(row),
	];
}

// Fingerprint de linha de CSV, que não tem FITID: a ocorrência é posicional
// dentro do grupo de linhas idênticas, na ordem do arquivo. O resultado só
// depende do conteúdo do arquivo e do destino escolhido, então processar o
// mesmo arquivo duas vezes produz exatamente os mesmos fingerprints.
export function buildReconciliationFingerprintPayloads(
	input: ReconciliationFingerprintInput,
): string[] {
	const occurrenceCounts = new Map<string, number>();

	return input.rows.map((row) => {
		const fields = buildIdentityFields(input, row);
		const occurrenceKey = JSON.stringify(fields);
		const occurrence = occurrenceCounts.get(occurrenceKey) ?? 0;
		occurrenceCounts.set(occurrenceKey, occurrence + 1);

		return JSON.stringify([...fields, occurrence]);
	});
}
