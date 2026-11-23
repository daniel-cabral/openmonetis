import { parsePeriod } from "@/shared/utils/period";
import type { AmountRange, Cents, Direction, Period, Scenario } from "./types";

export function pickAmount(
	range: AmountRange,
	direction: Direction,
	scenario: Scenario,
): Cents {
	if (direction === "outflow") {
		if (scenario === "pessimistic") {
			return range.max;
		}
		if (scenario === "optimistic") {
			return range.min;
		}
		return range.base;
	}
	if (scenario === "pessimistic") {
		return range.min;
	}
	if (scenario === "optimistic") {
		return range.max;
	}
	return range.base;
}

export function inflateToMonth(
	amount: Cents,
	annualPct: number,
	from: Period,
	to: Period,
): Cents {
	const start = parsePeriod(from);
	const end = parsePeriod(to);
	const months = Math.max(
		0,
		(end.year - start.year) * 12 + (end.month - start.month),
	);
	return Math.round(amount * (1 + annualPct / 100) ** (months / 12));
}

export function scaleRange(range: AmountRange, factor: number): AmountRange {
	return {
		min: Math.round(range.min * factor),
		base: Math.round(range.base * factor),
		max: Math.round(range.max * factor),
	};
}
