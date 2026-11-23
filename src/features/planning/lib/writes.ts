import { and, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import {
	assumptionLog,
	financialAccounts,
	planEvents,
	planningSettings,
	plans,
} from "@/db/schema";
import { INVESTMENT_ACCOUNT_TYPE } from "@/features/planning/lib/baseline";
import { centsToDecimal } from "@/features/planning/lib/cents";
import type {
	AssumptionInput,
	PlanInput,
	PlanningSettingsInput,
	planEventFieldsSchema,
} from "@/features/planning/lib/schemas";
import type { db } from "@/shared/lib/db";

export type PlanningTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type PlanEventFields = z.infer<typeof planEventFieldsSchema>;

function toSettingsColumns(patch: Partial<PlanningSettingsInput>) {
	const {
		plannedContribution,
		indexForecastPct,
		stressContributionCap,
		stressPlanCostPct,
		...rest
	} = patch;

	return {
		...rest,
		...(plannedContribution !== undefined && {
			plannedContribution: centsToDecimal(plannedContribution),
		}),
		...(indexForecastPct && {
			ipcaForecastPct: indexForecastPct.IPCA.toFixed(2),
			inccForecastPct: indexForecastPct.INCC.toFixed(2),
		}),
		...(stressContributionCap !== undefined && {
			stressContributionCap:
				stressContributionCap === null
					? null
					: centsToDecimal(stressContributionCap),
		}),
		...(stressPlanCostPct !== undefined && {
			stressPlanCostPct: stressPlanCostPct.toFixed(2),
		}),
	};
}

function toPlanColumns(input: PlanInput) {
	const base = {
		name: input.name,
		nonNegotiable: input.nonNegotiable,
		lifecycle: input.lifecycle,
		basis: input.basis,
		priceIndex: input.index,
		targetMonth: input.targetMonth,
		windowEarliest: input.window?.earliest ?? null,
		windowLatest: input.window?.latest ?? null,
		potAccountIds: input.potAccountIds,
	};

	if (input.fields.type === "goal") {
		const { target } = input.fields;
		return {
			...base,
			type: input.fields.type,
			targetMin: centsToDecimal(target.min),
			targetBase: centsToDecimal(target.base),
			targetMax: centsToDecimal(target.max),
			letterValue: null,
			outstandingBalance: null,
			bidBase: null,
			bidMarginPp: null,
			embeddedBidEnabled: false,
			embeddedBidPct: "0.00",
		};
	}

	const { fields } = input;
	return {
		...base,
		type: fields.type,
		targetMin: null,
		targetBase: null,
		targetMax: null,
		letterValue: centsToDecimal(fields.letterValue),
		outstandingBalance: centsToDecimal(fields.outstandingBalance),
		bidBase: fields.bidBase,
		bidMarginPp: fields.marginPp.toFixed(2),
		embeddedBidEnabled: fields.embeddedBid.enabled,
		embeddedBidPct: fields.embeddedBid.pct.toFixed(2),
	};
}

export async function upsertSettings(
	tx: PlanningTx,
	userId: string,
	patch: Partial<PlanningSettingsInput>,
): Promise<void> {
	const columns = toSettingsColumns(patch);
	await tx
		.insert(planningSettings)
		.values({ userId, ...columns })
		.onConflictDoUpdate({
			target: planningSettings.userId,
			set: { ...columns, updatedAt: new Date() },
		});
}

export async function insertAssumption(
	tx: PlanningTx,
	userId: string,
	entry: AssumptionInput & { source: "user" | "planner"; proposalId?: string },
): Promise<void> {
	await tx.insert(assumptionLog).values({
		userId,
		kind: entry.kind,
		summary: entry.summary,
		source: entry.source,
		proposalId: entry.proposalId ?? null,
		reviewByMonth: entry.reviewByMonth,
	});
}

export async function insertPlan(
	tx: PlanningTx,
	userId: string,
	input: PlanInput,
): Promise<string> {
	const [last] = await tx
		.select({ priority: plans.priority })
		.from(plans)
		.where(eq(plans.userId, userId))
		.orderBy(desc(plans.priority))
		.limit(1);

	const [row] = await tx
		.insert(plans)
		.values({
			userId,
			priority: (last?.priority ?? 0) + 1,
			...toPlanColumns(input),
		})
		.returning({ id: plans.id });
	return row.id;
}

export async function updatePlan(
	tx: PlanningTx,
	userId: string,
	planId: string,
	input: PlanInput,
): Promise<boolean> {
	const rows = await tx
		.update(plans)
		.set({ ...toPlanColumns(input), updatedAt: new Date() })
		.where(and(eq(plans.id, planId), eq(plans.userId, userId)))
		.returning({ id: plans.id });
	return rows.length > 0;
}

function toEventColumns(event: PlanEventFields) {
	return {
		label: event.label,
		direction: event.direction,
		basis: event.basis,
		amountMin: centsToDecimal(event.amount.min),
		amountBase: centsToDecimal(event.amount.base),
		amountMax: centsToDecimal(event.amount.max),
		startMonth: event.startMonth,
		endMonth: event.endMonth,
	};
}

export async function insertPlanEvent(
	tx: PlanningTx,
	userId: string,
	planId: string,
	event: PlanEventFields,
): Promise<string> {
	const [row] = await tx
		.insert(planEvents)
		.values({ userId, planId, ...toEventColumns(event) })
		.returning({ id: planEvents.id });
	return row.id;
}

export async function updatePlanEvent(
	tx: PlanningTx,
	userId: string,
	planId: string,
	eventId: string,
	event: PlanEventFields,
): Promise<boolean> {
	const rows = await tx
		.update(planEvents)
		.set(toEventColumns(event))
		.where(
			and(
				eq(planEvents.id, eventId),
				eq(planEvents.userId, userId),
				eq(planEvents.planId, planId),
			),
		)
		.returning({ id: planEvents.id });
	return rows.length > 0;
}

export async function assertOwnedPlan(
	tx: PlanningTx,
	userId: string,
	planId: string,
) {
	const [row] = await tx
		.select()
		.from(plans)
		.where(and(eq(plans.id, planId), eq(plans.userId, userId)))
		.limit(1);
	return row ?? null;
}

export async function arePotsEarmarked(
	tx: PlanningTx,
	userId: string,
	potAccountIds: string[],
): Promise<boolean> {
	if (potAccountIds.length === 0) return true;

	const rows = await tx
		.select({ id: financialAccounts.id })
		.from(financialAccounts)
		.where(
			and(
				eq(financialAccounts.userId, userId),
				eq(financialAccounts.isEarmarkedPot, true),
				inArray(financialAccounts.id, potAccountIds),
			),
		);

	return new Set(rows.map((row) => row.id)).size === new Set(potAccountIds).size;
}

export async function assertOwnedInvestmentAccount(
	tx: PlanningTx,
	userId: string,
	accountId: string,
): Promise<boolean> {
	const rows = await tx
		.select({ id: financialAccounts.id })
		.from(financialAccounts)
		.where(
			and(
				eq(financialAccounts.id, accountId),
				eq(financialAccounts.userId, userId),
				eq(financialAccounts.accountType, INVESTMENT_ACCOUNT_TYPE),
			),
		)
		.limit(1);
	return rows.length > 0;
}
