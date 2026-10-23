"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { importCategoryMappings } from "@/db/schema";
import {
	type CategoryMapping,
	normalizeDescriptionKey,
} from "@/features/transactions/lib/import-utils";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

// Retorna um map de descriptionKey → categoria e subcategoria para as descrições fornecidas
export async function fetchCategoryMappings(
	descriptions: string[],
): Promise<Record<string, CategoryMapping>> {
	const userId = await getUserId();
	const keys = descriptions.map(normalizeDescriptionKey).filter(Boolean);
	if (keys.length === 0) return {};

	const rows = await db
		.select({
			descriptionKey: importCategoryMappings.descriptionKey,
			categoryId: importCategoryMappings.categoryId,
			subcategoryId: importCategoryMappings.subcategoryId,
		})
		.from(importCategoryMappings)
		.where(
			and(
				eq(importCategoryMappings.userId, userId),
				inArray(importCategoryMappings.descriptionKey, keys),
			),
		);

	return Object.fromEntries(
		rows.map((r) => [
			r.descriptionKey,
			{ categoryId: r.categoryId, subcategoryId: r.subcategoryId },
		]),
	);
}

// Salva/atualiza mapeamentos description → category e subcategory após uma importação
export async function saveCategoryMappings(
	rows: {
		description: string;
		categoryId: string | null;
		subcategoryId: string | null;
	}[],
): Promise<void> {
	const userId = await getUserId();

	const toUpsert = rows
		.filter((r) => r.categoryId !== null)
		.map((r) => ({
			userId,
			descriptionKey: normalizeDescriptionKey(r.description),
			categoryId: r.categoryId as string,
			subcategoryId: r.subcategoryId,
			updatedAt: new Date(),
		}))
		.filter((r) => r.descriptionKey.length > 0);

	if (toUpsert.length === 0) return;

	await db
		.insert(importCategoryMappings)
		.values(toUpsert)
		.onConflictDoUpdate({
			target: [
				importCategoryMappings.userId,
				importCategoryMappings.descriptionKey,
			],
			set: {
				categoryId: sql`excluded.category_id`,
				subcategoryId: sql`excluded.subcategory_id`,
				updatedAt: sql`excluded.updated_at`,
			},
		});
}
