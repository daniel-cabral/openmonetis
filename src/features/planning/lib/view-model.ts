import { liquidToday, type Period, type Projection } from "@/features/planning/lib/engine";
import type { PlanningSnapshot } from "@/features/planning/lib/snapshot-types";

export const STALE_AFTER_DAYS = 45;

const DAY_MS = 86_400_000;

export type PlanningKpis = {
	totalPatrimony: number;
	stalestDays: number | null;
	isStale: boolean;
	liquidToday: number;
	reserveFloor: number;
	firstUnfunded: { month: Period; planName: string } | null;
};

function ageInDays(asOf: string, today: Date): number {
	const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
	return Math.round((todayUtc - Date.parse(`${asOf}T00:00:00Z`)) / DAY_MS);
}

export function buildKpis(snapshot: PlanningSnapshot, projection: Projection, today: Date): PlanningKpis {
	const ages = snapshot.accounts.flatMap((account) =>
		account.lastAsOf === null ? [] : [ageInDays(account.lastAsOf, today)],
	);
	const stalestDays = ages.length > 0 ? Math.max(...ages) : null;

	const base = projection.scenarios.base;
	const unfunded = base.firstUnfunded;

	return {
		totalPatrimony: snapshot.accounts.reduce(
			(total, account) => total + account.positions.reduce((sum, position) => sum + position.amount, 0),
			0,
		),
		stalestDays,
		isStale: stalestDays !== null && stalestDays > STALE_AFTER_DAYS,
		liquidToday: liquidToday(snapshot.input.positions, snapshot.input.potAccountIds, projection.start),
		reserveFloor: base.months[0]?.reserveFloor ?? 0,
		firstUnfunded: unfunded
			? {
					month: unfunded.month,
					planName: snapshot.plans.find((plan) => plan.id === unfunded.planId)?.name ?? unfunded.planId,
				}
			: null,
	};
}
