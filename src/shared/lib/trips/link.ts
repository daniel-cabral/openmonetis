import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";
import type { db } from "@/shared/lib/db";
import { tripEligibleCondition } from "./eligibility";

export type TripLinkExecutor = Pick<typeof db, "select" | "update">;

export type TripLinkRow = {
	id: string;
	condition: string;
	seriesId: string | null;
	splitGroupId: string | null;
};

export type TripLinkScope = {
	ids: string[];
	seriesIds: string[];
	splitGroupIds: string[];
};

const INSTALLMENT_CONDITION = "Parcelado";

const unique = (values: Array<string | null>) => [
	...new Set(values.filter((value): value is string => Boolean(value))),
];

// Installments link as a whole series; recurring rows (rent, subscriptions) link
// only the occurrence; split shares link as a whole group (D4).
export function expandTripLinkScope(rows: TripLinkRow[]): TripLinkScope {
	return {
		ids: unique(rows.map((row) => row.id)),
		seriesIds: unique(
			rows.map((row) =>
				row.condition === INSTALLMENT_CONDITION ? row.seriesId : null,
			),
		),
		splitGroupIds: unique(rows.map((row) => row.splitGroupId)),
	};
}

// Linking expands to installments and split groups; unlinking (tripId null)
// touches only the given rows, so a single installment can leave the trip (D4).
export async function setTripForTransactions(
	executor: TripLinkExecutor,
	userId: string,
	transactionIds: string[],
	tripId: string | null,
): Promise<number> {
	if (transactionIds.length === 0) return 0;

	const rows = await executor
		.select({
			id: transactions.id,
			condition: transactions.condition,
			seriesId: transactions.seriesId,
			splitGroupId: transactions.splitGroupId,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				inArray(transactions.id, transactionIds),
				tripEligibleCondition(),
			),
		);

	if (rows.length === 0) return 0;

	const scope = expandTripLinkScope(rows);
	const targets: SQL[] = [inArray(transactions.id, scope.ids)];
	if (tripId !== null) {
		if (scope.seriesIds.length > 0) {
			targets.push(inArray(transactions.seriesId, scope.seriesIds));
		}
		if (scope.splitGroupIds.length > 0) {
			targets.push(inArray(transactions.splitGroupId, scope.splitGroupIds));
		}
	}

	const updated = await executor
		.update(transactions)
		.set({ tripId })
		.where(
			and(
				eq(transactions.userId, userId),
				tripEligibleCondition(),
				or(...targets),
			),
		)
		.returning({ id: transactions.id });

	return updated.length;
}
