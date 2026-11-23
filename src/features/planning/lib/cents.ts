import type { Cents } from "@/features/planning/lib/engine";

/** Converts a db numeric value (string or number) to integer cents. null means zero. */
export function toCents(value: string | number | null | undefined): Cents {
	if (value === null || value === undefined) {
		return 0;
	}
	return Math.round(Number(value) * 100);
}

/** Formats integer cents as a db numeric string with two decimals. */
export function centsToDecimal(cents: Cents): string {
	return (cents / 100).toFixed(2);
}
