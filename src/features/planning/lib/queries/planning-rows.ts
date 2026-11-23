import { and, asc, desc, eq } from "drizzle-orm";
import {
	assumptionLog,
	bidRecords,
	financialAccounts,
	investmentPositions,
	planCategoryMappings,
	planEvents,
	planningSettings,
	plans,
} from "@/db/schema";
import { INVESTMENT_ACCOUNT_TYPE } from "@/features/planning/lib/baseline";
import { db } from "@/shared/lib/db";

const ASSUMPTION_LIMIT = 50;

export async function fetchPlanningSettingsRow(userId: string) {
	const [row] = await db
		.select()
		.from(planningSettings)
		.where(eq(planningSettings.userId, userId))
		.limit(1);
	return row;
}

export async function fetchInvestmentAccounts(userId: string) {
	return db
		.select({
			id: financialAccounts.id,
			name: financialAccounts.name,
			logo: financialAccounts.logo,
			isEarmarkedPot: financialAccounts.isEarmarkedPot,
		})
		.from(financialAccounts)
		.where(
			and(
				eq(financialAccounts.userId, userId),
				eq(financialAccounts.accountType, INVESTMENT_ACCOUNT_TYPE),
			),
		)
		.orderBy(asc(financialAccounts.name));
}

export async function fetchInvestmentPositions(userId: string) {
	return db
		.select()
		.from(investmentPositions)
		.where(eq(investmentPositions.userId, userId));
}

export async function fetchPlanRows(userId: string) {
	return db
		.select()
		.from(plans)
		.where(eq(plans.userId, userId))
		.orderBy(asc(plans.priority));
}

export async function fetchPlanEventRows(userId: string) {
	return db.select().from(planEvents).where(eq(planEvents.userId, userId));
}

export async function fetchBidRows(userId: string) {
	return db.select().from(bidRecords).where(eq(bidRecords.userId, userId));
}

export async function fetchCategoryMappings(userId: string) {
	return db
		.select({
			planId: planCategoryMappings.planId,
			categoryId: planCategoryMappings.categoryId,
		})
		.from(planCategoryMappings)
		.where(eq(planCategoryMappings.userId, userId));
}

export async function fetchAssumptionRows(userId: string) {
	return db
		.select()
		.from(assumptionLog)
		.where(eq(assumptionLog.userId, userId))
		.orderBy(desc(assumptionLog.createdAt))
		.limit(ASSUMPTION_LIMIT);
}
