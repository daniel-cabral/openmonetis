import type { ImportedTransaction, ImportStatement } from "../types";

// Converte data BR "dd/mm/aaaa" para "YYYY-MM-DD"
function parseBrDate(raw: string): string {
	const [day, month, year] = raw.trim().split("/");
	return `${year}-${month}-${day}`;
}

function parseInstallment(raw: string): { number: number; total: number } | undefined {
	const match = raw.trim().match(/^(\d+)\/(\d+)$/);
	if (!match) return undefined;
	return { number: Number(match[1]), total: Number(match[2]) };
}

function parseNumber(raw: string): number {
	return Number.parseFloat(raw.replace(",", "."));
}

export function parseC6InvoiceCsv(rawContent: string): ImportStatement {
	// Remove BOM, se houver
	const content =
		rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;

	const lines = content.split(/\r\n|\n/).filter((line) => line.trim() !== "");
	const dataLines = lines.slice(1); // pula o cabeçalho

	const transactions: ImportedTransaction[] = dataLines.map((line) => {
		const [
			dataCompra,
			nomeNoCartao,
			finalDoCartao,
			categoria,
			descricao,
			parcela,
			valorUsd,
			_cotacao,
			valorBrl,
		] = line.split(";");

		const valor = parseNumber(valorBrl);
		const amount = Math.abs(valor);
		const transactionType: ImportedTransaction["transactionType"] =
			valor < 0 ? "income" : "expense";
		const isPurchase = valor >= 0;
		const usdValue = parseNumber(valorUsd);
		const fx = usdValue > 0 ? { currency: "USD", amount: usdValue } : undefined;

		return {
			externalId: null,
			externalIdOccurrence: 0,
			date: parseBrDate(dataCompra),
			amount,
			description: descricao,
			sourceDescription: descricao,
			transactionType,
			categoryRaw: categoria,
			installment: parseInstallment(parcela),
			cardLast4: finalDoCartao,
			holderName: nomeNoCartao,
			fx,
			isPurchase,
		};
	});

	return {
		source: "C6 Bank",
		accountNumber: null,
		period: null,
		isCreditCard: true,
		transactions,
	};
}
