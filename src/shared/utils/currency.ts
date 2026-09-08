/**
 * Utility functions for currency/decimal formatting and parsing
 */

type CurrencyFormatOptions = {
	maximumFractionDigits?: number;
	minimumFractionDigits?: number;
	notation?: Intl.NumberFormatOptions["notation"];
};

export const currencyFormatter = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export const formatCurrency = (
	value: number,
	options: CurrencyFormatOptions = {},
) =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: options.minimumFractionDigits ?? 2,
		maximumFractionDigits: options.maximumFractionDigits ?? 2,
		...(options.notation ? { notation: options.notation } : {}),
	}).format(value);

export const formatCurrencyCompact = (
	value: number,
	options: CurrencyFormatOptions = {},
) =>
	formatCurrency(value, {
		minimumFractionDigits: options.minimumFractionDigits ?? 0,
		maximumFractionDigits: options.maximumFractionDigits ?? 0,
		notation: options.notation ?? "compact",
	});

/**
 * Formats a decimal number for database storage (2 decimal places)
 * @param value - The number to format
 * @returns Formatted string with 2 decimal places
 */
export function formatDecimalForDbRequired(value: number): string {
	return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Normalizes decimal input by replacing comma with period
 * @param value - Input string
 * @returns Normalized string with period as decimal separator
 */
export function normalizeDecimalInput(value: string): string {
	const compact = value.replace(/\s/g, "");

	// No formato pt-BR o ponto é separador de milhar sempre que existe uma
	// vírgula decimal: "12.164,10" precisa virar "12164.10". Antes o ponto era
	// preservado e o resultado ("12.164.10") virava NaN em todo campo que usa
	// esta função — total da fatura, limite do cartão, saldo inicial e orçamento.
	//
	// Sem vírgula não dá para distinguir milhar de decimal ("1.5" é um e meio,
	// "1.500" é ambíguo), então o ponto continua valendo como decimal.
	return compact.includes(",")
		? compact.replace(/\./g, "").replace(",", ".")
		: compact;
}

/**
 * Formats a limit/balance input for display
 * @param value - The number to format
 * @returns Formatted string or empty string
 */
export function formatLimitInput(value?: number | null): string {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return "";
	}

	return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Formats an initial balance input for display (defaults to "0.00")
 * @param value - The number to format
 * @returns Formatted string with default "0.00"
 */
export function formatInitialBalanceInput(value?: number | null): string {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return "0.00";
	}

	return (Math.round(value * 100) / 100).toFixed(2);
}
