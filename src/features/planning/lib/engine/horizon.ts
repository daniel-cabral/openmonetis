import { addMonthsToPeriod, comparePeriods } from "@/shared/utils/period";
import type { EngineInput, Period } from "./types";

export const HORIZON_PADDING_MONTHS = 12;

export function resolveHorizon(
	input: Pick<EngineInput, "startMonth" | "horizonEnd" | "plans">,
): { start: Period; end: Period } {
	const start = input.startMonth;
	if (input.horizonEnd !== null) {
		return { start, end: input.horizonEnd };
	}

	let latest: Period = start;
	for (const plan of input.plans) {
		if (plan.lifecycle !== "active") {
			continue;
		}
		const candidates = [plan.window?.latest ?? plan.targetMonth];
		for (const event of plan.events) {
			candidates.push(event.endMonth ?? event.startMonth);
		}
		for (const candidate of candidates) {
			if (comparePeriods(candidate, latest) > 0) {
				latest = candidate;
			}
		}
	}

	return { start, end: addMonthsToPeriod(latest, HORIZON_PADDING_MONTHS) };
}
