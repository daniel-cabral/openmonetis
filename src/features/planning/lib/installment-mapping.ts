import type { PlanTypeFields } from "@/features/planning/lib/engine";

/** A consórcio installment with no mapped category may be counted twice (cost of living and plan). */
export function needsInstallmentMapping(
	fields: PlanTypeFields,
	categoryIds: string[],
): boolean {
	return (
		fields.type === "consorcio" &&
		(fields.monthlyInstallment ?? 0) > 0 &&
		categoryIds.length === 0
	);
}
