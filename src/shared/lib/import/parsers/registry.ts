import type { ImportStatement } from "../types";
import { parseC6InvoiceCsv } from "./c6-invoice-csv";
import {
	parseC6StatementCsv,
	readC6StatementAccountNumber,
} from "./c6-statement-csv";

export type ParserProfile = {
	id: string;
	label: string;
	kind: "statement" | "invoice";
	matches: (headerSample: string) => boolean;
	parse: (content: string) => ImportStatement;
	// Leitura barata do preâmbulo, para pré-preencher o destino antes do parse
	// definitivo. Nem todo perfil traz a informação no arquivo.
	peekAccountNumber?: (content: string) => string | null;
};

export const parserProfiles: ParserProfile[] = [
	{
		id: "c6-statement",
		label: "C6 Bank - Extrato de conta corrente",
		kind: "statement",
		matches: (headerSample) =>
			headerSample.includes("Data Lançamento") && headerSample.includes("Data Contábil"),
		parse: parseC6StatementCsv,
		peekAccountNumber: readC6StatementAccountNumber,
	},
	{
		id: "c6-invoice",
		label: "C6 Bank - Fatura de cartão",
		kind: "invoice",
		matches: (headerSample) =>
			headerSample.includes("Data de Compra") && headerSample.includes("Parcela"),
		parse: parseC6InvoiceCsv,
	},
];
