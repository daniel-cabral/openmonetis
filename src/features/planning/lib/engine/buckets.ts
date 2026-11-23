import { comparePeriods } from "@/shared/utils/period";
import type { Cents, EnginePosition, LiquidityKind, Period } from "./types";

export const DEFAULT_REAL_RETURN_PCT: Record<LiquidityKind, number> = {
	daily: 2,
	maturity: 4,
	locked: 4,
};

export function monthlyNominalRate(realPct: number, ipcaPct: number): number {
	return ((1 + realPct / 100) * (1 + ipcaPct / 100)) ** (1 / 12) - 1;
}

export type Buckets = {
	general: Cents;
	pots: Record<string, Cents>;
	potRates: Record<string, number>;
	pending: {
		accountId: string;
		amount: Cents;
		maturityMonth: Period;
		rate: number;
	}[];
	locked: Cents;
	generalRate: number;
	lockedRate: number;
};

function realPctOf(position: EnginePosition): number {
	return (
		position.annualRealReturnPct ?? DEFAULT_REAL_RETURN_PCT[position.liquidity]
	);
}

function sumAmounts(positions: EnginePosition[]): Cents {
	return positions.reduce((total, position) => total + position.amount, 0);
}

function rateOf(positions: EnginePosition[], ipcaPct: number): number {
	const total = sumAmounts(positions);
	if (total === 0) {
		return 0;
	}
	const weightedRealPct =
		positions.reduce(
			(sum, position) => sum + position.amount * realPctOf(position),
			0,
		) / total;
	return monthlyNominalRate(weightedRealPct, ipcaPct);
}

export function openBuckets(
	positions: EnginePosition[],
	potAccountIds: string[],
	start: Period,
	ipcaPct: number,
): Buckets {
	const generalPositions: EnginePosition[] = [];
	const lockedPositions: EnginePosition[] = [];
	const potPositions: Record<string, EnginePosition[]> = {};
	for (const accountId of potAccountIds) {
		potPositions[accountId] = [];
	}
	const pending: Buckets["pending"] = [];

	for (const position of positions) {
		if (position.liquidity === "locked") {
			lockedPositions.push(position);
		} else if (
			position.liquidity === "maturity" &&
			position.maturityMonth !== null &&
			comparePeriods(position.maturityMonth, start) > 0
		) {
			pending.push({
				accountId: position.accountId,
				amount: position.amount,
				maturityMonth: position.maturityMonth,
				rate: monthlyNominalRate(realPctOf(position), ipcaPct),
			});
		} else if (position.accountId in potPositions) {
			potPositions[position.accountId].push(position);
		} else {
			generalPositions.push(position);
		}
	}

	const pots: Record<string, Cents> = {};
	const potRates: Record<string, number> = {};
	for (const [accountId, lots] of Object.entries(potPositions)) {
		pots[accountId] = sumAmounts(lots);
		potRates[accountId] = rateOf(lots, ipcaPct);
	}

	return {
		general: sumAmounts(generalPositions),
		pots,
		potRates,
		pending,
		locked: sumAmounts(lockedPositions),
		generalRate: rateOf(generalPositions, ipcaPct),
		lockedRate: rateOf(lockedPositions, ipcaPct),
	};
}

export function advanceMonth(b: Buckets, month: Period): Buckets {
	let general = Math.round(b.general * (1 + b.generalRate));
	const pots: Record<string, Cents> = {};
	for (const [accountId, amount] of Object.entries(b.pots)) {
		pots[accountId] = Math.round(amount * (1 + b.potRates[accountId]));
	}

	const pending: Buckets["pending"] = [];
	for (const item of b.pending) {
		const grown = {
			...item,
			amount: Math.round(item.amount * (1 + item.rate)),
		};
		if (grown.maturityMonth !== month) {
			pending.push(grown);
		} else if (grown.accountId in pots) {
			pots[grown.accountId] += grown.amount;
		} else {
			general += grown.amount;
		}
	}

	return {
		...b,
		general,
		pots,
		pending,
		locked: Math.round(b.locked * (1 + b.lockedRate)),
	};
}

export function bucketsTotal(b: Buckets): Cents {
	const potTotal = Object.values(b.pots).reduce(
		(total, amount) => total + amount,
		0,
	);
	const pendingTotal = b.pending.reduce(
		(total, item) => total + item.amount,
		0,
	);
	return b.general + potTotal + pendingTotal + b.locked;
}

export function liquidToday(
	positions: EnginePosition[],
	potAccountIds: string[],
	start: Period,
): Cents {
	return openBuckets(positions, potAccountIds, start, 0).general;
}
