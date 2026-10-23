import type { SelectOption } from "@/features/transactions/components/types";
import type { SubcategoryOption } from "@/shared/lib/subcategories/types";

export function getSubcategoryOptions(
	categoryOptions: SelectOption[],
	categoryId: string | null | undefined,
): SubcategoryOption[] {
	if (!categoryId) return [];
	return (
		categoryOptions.find((option) => option.value === categoryId)
			?.subcategories ?? []
	);
}
