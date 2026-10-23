import { and, eq, inArray } from "drizzle-orm";
import { categories, subcategories } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	type SubcategoryResolution,
	resolveSubcategoryId,
} from "@/shared/lib/subcategories/rules";

export async function fetchSubcategoryParents(
	userId: string,
	ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
	const uniqueIds = [
		...new Set(ids.filter((id): id is string => typeof id === "string")),
	];
	if (uniqueIds.length === 0) return new Map();

	const rows = await db
		.select({ id: subcategories.id, categoryId: subcategories.categoryId })
		.from(subcategories)
		.where(
			and(
				eq(subcategories.userId, userId),
				inArray(subcategories.id, uniqueIds),
			),
		);
	return new Map(rows.map((row) => [row.id, row.categoryId]));
}

export async function resolveSubcategoryForWrite(
	userId: string,
	input: Omit<Parameters<typeof resolveSubcategoryId>[0], "parents">,
): Promise<SubcategoryResolution> {
	const parents = await fetchSubcategoryParents(userId, [input.requested]);
	return resolveSubcategoryId({ ...input, parents });
}

export async function fetchSubcategoryWithCategory(
	userId: string,
	id: string,
): Promise<{
	id: string;
	name: string;
	categoryId: string;
	categoryName: string;
} | null> {
	const rows = await db
		.select({
			id: subcategories.id,
			name: subcategories.name,
			categoryId: categories.id,
			categoryName: categories.name,
		})
		.from(subcategories)
		.innerJoin(categories, eq(categories.id, subcategories.categoryId))
		.where(and(eq(subcategories.id, id), eq(subcategories.userId, userId)));
	return rows[0] ?? null;
}
