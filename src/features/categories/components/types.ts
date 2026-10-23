import type { CategoryType } from "@/shared/lib/categories/constants";

export type CategorySubcategory = {
	id: string;
	name: string;
	transactionCount: number;
};

export type Category = {
	id: string;
	name: string;
	type: CategoryType;
	icon: string | null;
	subcategories: CategorySubcategory[];
};

export type CategoryFormValues = {
	name: string;
	type: CategoryType;
	icon: string;
	subcategories: Array<{
		key: string;
		id?: string;
		name: string;
		transactionCount: number;
	}>;
};
