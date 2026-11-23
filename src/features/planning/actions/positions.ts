"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { financialAccounts, investmentPositions } from "@/db/schema";
import { centsToDecimal } from "@/features/planning/lib/cents";
import {
	type ReplacePositionsInput,
	replacePositionsSchema,
} from "@/features/planning/lib/schemas";
import { assertOwnedInvestmentAccount } from "@/features/planning/lib/writes";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { errorResult } from "@/shared/lib/types/actions";
import { parseLocalDateString } from "@/shared/utils/date";

const NOT_FOUND_MESSAGE = "Registro não encontrado.";

const earmarkInputSchema = z.object({
	accountId: uuidSchema("Conta"),
	earmarked: z.boolean(),
});

export async function replaceAccountPositionsAction(
	input: ReplacePositionsInput,
): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const data = replacePositionsSchema.parse(input);
		const asOf = parseLocalDateString(data.asOf);

		const saved = await db.transaction(async (tx) => {
			if (!(await assertOwnedInvestmentAccount(tx, userId, data.accountId))) {
				return false;
			}

			await tx
				.delete(investmentPositions)
				.where(
					and(
						eq(investmentPositions.userId, userId),
						eq(investmentPositions.accountId, data.accountId),
						eq(investmentPositions.asOf, asOf),
					),
				);

			if (data.positions.length > 0) {
				await tx.insert(investmentPositions).values(
					data.positions.map((position) => ({
						userId,
						accountId: data.accountId,
						asOf,
						description: position.description,
						amount: centsToDecimal(position.amount),
						liquidity: position.liquidity,
						maturityMonth: position.maturityMonth,
						annualRealReturnPct:
							position.annualRealReturnPct === null
								? null
								: position.annualRealReturnPct.toFixed(2),
					})),
				);
			}

			return true;
		});

		if (!saved) return errorResult(NOT_FOUND_MESSAGE);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Posições salvas." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function setAccountEarmarkedAction(input: {
	accountId: string;
	earmarked: boolean;
}): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const data = earmarkInputSchema.parse(input);

		const saved = await db.transaction(async (tx) => {
			if (!(await assertOwnedInvestmentAccount(tx, userId, data.accountId))) {
				return false;
			}

			await tx
				.update(financialAccounts)
				.set({ isEarmarkedPot: data.earmarked })
				.where(
					and(
						eq(financialAccounts.id, data.accountId),
						eq(financialAccounts.userId, userId),
					),
				);

			return true;
		});

		if (!saved) return errorResult(NOT_FOUND_MESSAGE);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Pote atualizado." };
	} catch (error) {
		return handleActionError(error);
	}
}
