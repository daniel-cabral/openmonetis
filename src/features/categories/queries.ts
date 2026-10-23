import { and, asc, eq, sql } from "drizzle-orm";
import {
	type Category,
	categories,
	subcategories,
	transactions,
} from "@/db/schema";
import type { CategoryType } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import type { SubcategoryOption } from "@/shared/lib/subcategories/types";
import type { CategorySubcategory } from "./components/types";

type CategoryData = {
	id: string;
	name: string;
	type: CategoryType;
	icon: string | null;
	subcategories: CategorySubcategory[];
};

export async function fetchCategoriesForUser(
	userId: string,
): Promise<CategoryData[]> {
	const categoryRows = await db.query.categories.findMany({
		where: eq(categories.userId, userId),
	});

	const subcategoryRows = await db
		.select({
			id: subcategories.id,
			name: subcategories.name,
			categoryId: subcategories.categoryId,
			transactionCount: sql<number>`count(${transactions.id})::int`,
		})
		.from(subcategories)
		.leftJoin(
			transactions,
			and(
				eq(transactions.subcategoryId, subcategories.id),
				eq(transactions.userId, userId),
			),
		)
		.where(eq(subcategories.userId, userId))
		.groupBy(subcategories.id)
		.orderBy(asc(subcategories.name));

	const subcategoriesByCategory = new Map<string, CategorySubcategory[]>();
	for (const { categoryId, ...subcategory } of subcategoryRows) {
		const list = subcategoriesByCategory.get(categoryId) ?? [];
		list.push(subcategory);
		subcategoriesByCategory.set(categoryId, list);
	}

	return categoryRows.map((category: Category) => ({
		id: category.id,
		name: category.name,
		type: category.type as CategoryType,
		icon: category.icon,
		subcategories: subcategoriesByCategory.get(category.id) ?? [],
	}));
}

export async function fetchSubcategoriesForCategory(
	userId: string,
	categoryId: string,
): Promise<SubcategoryOption[]> {
	return db
		.select({ id: subcategories.id, name: subcategories.name })
		.from(subcategories)
		.where(
			and(
				eq(subcategories.userId, userId),
				eq(subcategories.categoryId, categoryId),
			),
		)
		.orderBy(asc(subcategories.name));
}
