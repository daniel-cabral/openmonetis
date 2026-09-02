import type { ImportedTransaction, ImportStatement } from "../types";

const HEADER_PREFIX = "Data Lançamento,Data Contábil";

// Converte data BR "dd/mm/aaaa" para "YYYY-MM-DD"
function parseBrDate(raw: string): string {
	const [day, month, year] = raw.trim().split("/");
	return `${year}-${month}-${day}`;
}

/**
 * Lê só a identificação de conta do preâmbulo. Exportada para a confirmação de
 * origem pré-preencher o destino sem fazer o parse definitivo do arquivo, que
 * só acontece depois da confirmação.
 */
export function readC6StatementAccountNumber(content: string): string | null {
	const match = content.match(/Agência:\s*(\S+)\s*\/\s*Conta:\s*(\S+)/);
	return match ? `${match[1]}/${match[2]}` : null;
}

function parsePeriod(content: string): ImportStatement["period"] {
	const match = content.match(
		/Extrato de\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/,
	);
	return match ? { from: parseBrDate(match[1]), to: parseBrDate(match[2]) } : null;
}

function buildDescription(titulo: string, descricao: string): string {
	if (!descricao) return titulo;
	if (titulo === descricao) return titulo;
	return `${titulo} - ${descricao}`;
}

export function parseC6StatementCsv(rawContent: string): ImportStatement {
	// Remove BOM, se houver
	const content =
		rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;

	const accountNumber = readC6StatementAccountNumber(content);
	const period = parsePeriod(content);

	const lines = content.split(/\r\n|\n/);
	const headerIndex = lines.findIndex((line) => line.startsWith(HEADER_PREFIX));
	const dataLines =
		headerIndex >= 0
			? lines.slice(headerIndex + 1).filter((line) => line.trim() !== "")
			: [];

	const transactions: ImportedTransaction[] = dataLines.map((line) => {
		const [dataLancamento, dataContabil, titulo, descricao, entrada, saida, saldo] =
			line.split(",");

		const entradaValue = Number.parseFloat(entrada);
		const saidaValue = Number.parseFloat(saida);
		const transactionType: ImportedTransaction["transactionType"] =
			entradaValue > 0 ? "income" : "expense";
		const amount = entradaValue > 0 ? entradaValue : saidaValue;
		const description = buildDescription(titulo, descricao);

		return {
			externalId: null,
			externalIdOccurrence: 0,
			date: parseBrDate(dataLancamento),
			postedDate: parseBrDate(dataContabil),
			amount,
			description,
			sourceDescription: description,
			transactionType,
			dayBalance: Number.parseFloat(saldo),
		};
	});

	return {
		source: "C6 Bank",
		accountNumber,
		period,
		isCreditCard: false,
		transactions,
	};
}
