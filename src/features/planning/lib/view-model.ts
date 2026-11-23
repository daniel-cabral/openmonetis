import { type Cents, liquidToday, type PlanHealth, type Period, type Projection } from "@/features/planning/lib/engine";
import type { PlanningSnapshot, PlanView } from "@/features/planning/lib/snapshot-types";
import { formatShortPeriodLabel } from "@/shared/utils/period";

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

export type ChartPoint = {
	month: Period;
	label: string;
	base: Cents;
	pessimistic: Cents;
	required: Cents;
};

export function buildChartSeries(projection: Projection): ChartPoint[] {
	const pessimistic = projection.scenarios.pessimistic.months;

	return projection.scenarios.base.months.map((row, index) => ({
		month: row.month,
		label: formatShortPeriodLabel(row.month),
		base: row.liquid,
		pessimistic: pessimistic[index].liquid,
		required: row.required,
	}));
}

export type PlanRow = {
	id: string;
	name: string;
	kind: "reserve" | "goal" | "consorcio";
	priority: number;
	nonNegotiable: boolean;
	month: Period | null;
	target: Cents;
	coveragePct: number;
	health: PlanHealth;
};

function coveragePct(covered: number, required: number): number {
	return required === 0 ? 100 : Math.round((100 * covered) / required);
}

export function buildPlanRows(plans: PlanView[], projection: Projection, kpis: PlanningKpis): PlanRow[] {
	const base = projection.scenarios.base;
	const reserveCoverage = kpis.reserveFloor === 0 ? 100 : Math.min(100, coveragePct(kpis.liquidToday, kpis.reserveFloor));

	const reserve: PlanRow = {
		id: "reserve",
		name: "Reserva de emergência",
		kind: "reserve",
		priority: 0,
		nonNegotiable: true,
		month: null,
		target: kpis.reserveFloor,
		coveragePct: reserveCoverage,
		health: kpis.liquidToday >= kpis.reserveFloor ? "on-track" : "off-track",
	};

	const planRows = plans
		.filter((plan) => plan.lifecycle === "active")
		.sort((a, b) => a.priority - b.priority)
		.map((plan): PlanRow => {
			const required = base.requiredByPlan[plan.id] ?? 0;
			const shortfall = base.shortfallByPlan[plan.id] ?? 0;
			return {
				id: plan.id,
				name: plan.name,
				kind: plan.type,
				priority: plan.priority,
				nonNegotiable: plan.nonNegotiable,
				month: plan.targetMonth,
				target: required,
				coveragePct: coveragePct(required - shortfall, required),
				health: projection.health[plan.id],
			};
		});

	return [reserve, ...planRows];
}
