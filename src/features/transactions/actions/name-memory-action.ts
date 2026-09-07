"use server";

import { and, eq, inArray } from "drizzle-orm";
import { importNameMappings } from "@/db/schema";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

// Retorna um map de descriptionKey → name para as descrições fornecidas
export async function fetchNameMappings(
	descriptions: string[],
): Promise<Record<string, string>> {
	const userId = await getUserId();
	const keys = descriptions.map(normalizeDescriptionKey).filter(Boolean);
	if (keys.length === 0) return {};

	const rows = await db
		.select({
			descriptionKey: importNameMappings.descriptionKey,
			name: importNameMappings.name,
		})
		.from(importNameMappings)
		.where(
			and(
				eq(importNameMappings.userId, userId),
				inArray(importNameMappings.descriptionKey, keys),
			),
		);

	return Object.fromEntries(rows.map((r) => [r.descriptionKey, r.name]));
}
