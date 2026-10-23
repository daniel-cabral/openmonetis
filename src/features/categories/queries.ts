import { and, asc, eq } from "drizzle-orm";
import { type Category, categories, subcategories } from "@/db/schema";
import type { CategoryType } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import type { SubcategoryOption } from "@/shared/lib/subcategories/types";

type CategoryData = {
	id: string;
	name: string;
	type: CategoryType;
	icon: string | null;
};

export async function fetchCategoriesForUser(
	userId: string,
): Promise<CategoryData[]> {
	const categoryRows = await db.query.categories.findMany({
		where: eq(categories.userId, userId),
	});

	return categoryRows.map((category: Category) => ({
		id: category.id,
		name: category.name,
		type: category.type as CategoryType,
		icon: category.icon,
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
