import { eq } from "drizzle-orm";
import { planningSettings, plans } from "@/db/schema";
import { db } from "@/shared/lib/db";

const MAX_PLAN_NAME = 80;
const DEFAULT_RESERVE_MONTHS = 3;

export type PlanningSummary = {
	plans: {
		name: string;
		type: string;
		targetMonth: string;
		lifecycle: string;
		nonNegotiable: boolean;
	}[];
	plannedContribution: number;
	reserveMonths: number;
};

function capName(name: string) {
	// Plan names are user-entered text that reaches the model prompt.
	const clean = name.replace(/\p{Cc}/gu, " ").trim();
	return clean.length > MAX_PLAN_NAME
		? `${clean.slice(0, MAX_PLAN_NAME - 1)}…`
		: clean;
}

export async function summarizePlanning(
	userId: string,
	deps: { database?: typeof db } = {},
): Promise<PlanningSummary | null> {
	const database = deps.database ?? db;

	const planRows = await database
		.select({
			name: plans.name,
			type: plans.type,
			targetMonth: plans.targetMonth,
			lifecycle: plans.lifecycle,
			nonNegotiable: plans.nonNegotiable,
			priority: plans.priority,
		})
		.from(plans)
		.where(eq(plans.userId, userId));

	if (planRows.length === 0) {
		return null;
	}

	const [settings] = await database
		.select({
			plannedContribution: planningSettings.plannedContribution,
			reserveMonths: planningSettings.reserveMonths,
		})
		.from(planningSettings)
		.where(eq(planningSettings.userId, userId));

	return {
		plans: [...planRows]
			.sort((a, b) => a.priority - b.priority)
			.map(({ priority: _priority, name, ...plan }) => ({
				name: capName(name),
				...plan,
			})),
		plannedContribution: Number(settings?.plannedContribution ?? 0),
		reserveMonths: settings?.reserveMonths ?? DEFAULT_RESERVE_MONTHS,
	};
}
