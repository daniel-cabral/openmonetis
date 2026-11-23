import type {
	Cents,
	LiquidityKind,
	Period,
} from "@/features/planning/lib/engine";
import type {
	ContributionRow,
	PositionView,
} from "@/features/planning/lib/snapshot-types";

export type ContributionAssignment = {
	contributionId: string;
	accountId: string;
	date: string; // YYYY-MM-DD, used in the description of new lines
	liquidity: LiquidityKind;
	maturityMonth: Period | null;
	amount: Cents;
};

export type PositionLineDraft = {
	description: string;
	amount: Cents;
	liquidity: LiquidityKind;
	maturityMonth: Period | null;
	annualRealReturnPct: number | null;
};

/** Unassigned contributions count as daily liquidity. */
export function defaultAssignment(
	row: ContributionRow,
	accountId: string,
): ContributionAssignment {
	return {
		contributionId: row.id,
		accountId,
		date: row.date,
		liquidity: "daily",
		maturityMonth: null,
		amount: row.amount,
	};
}

function formatDayMonth(date: string): string {
	return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Copies the account's current lines and folds this account's assignments into them. */
export function prefillPositionLines(
	current: PositionView[],
	assignments: ContributionAssignment[],
	accountId: string,
): PositionLineDraft[] {
	const lines: PositionLineDraft[] = current.map(
		({ description, amount, liquidity, maturityMonth, annualRealReturnPct }) => ({
			description,
			amount,
			liquidity,
			maturityMonth,
			annualRealReturnPct,
		}),
	);

	for (const assignment of assignments) {
		if (assignment.accountId !== accountId) continue;
		const line = lines.find(
			(item) =>
				item.liquidity === assignment.liquidity &&
				item.maturityMonth === assignment.maturityMonth,
		);
		if (line) {
			line.amount += assignment.amount;
			continue;
		}
		lines.push({
			description: `Aporte ${formatDayMonth(assignment.date)}`,
			amount: assignment.amount,
			liquidity: assignment.liquidity,
			maturityMonth: assignment.maturityMonth,
			annualRealReturnPct: null,
		});
	}

	return lines;
}
