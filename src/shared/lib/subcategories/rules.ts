export const SUBCATEGORY_NOT_FOUND_MESSAGE = "Subcategoria não encontrada.";
export const SUBCATEGORY_MISMATCH_MESSAGE =
	"A subcategoria não pertence à categoria escolhida.";

export type SubcategoryResolution =
	| { ok: true; subcategoryId: string | null }
	| { ok: false; error: string };

type ResolveSubcategoryInput = {
	requested: string | null | undefined;
	categoryId: string | null;
	parents: ReadonlyMap<string, string>;
	existing?: { categoryId: string | null; subcategoryId: string | null } | null;
};

export function resolveSubcategoryId({
	requested,
	categoryId,
	parents,
	existing,
}: ResolveSubcategoryInput): SubcategoryResolution {
	if (requested === null) {
		return { ok: true, subcategoryId: null };
	}

	if (requested === undefined) {
		const keep =
			existing?.categoryId === categoryId ? existing.subcategoryId : null;
		return { ok: true, subcategoryId: keep };
	}

	const parentId = parents.get(requested);
	if (parentId === undefined) {
		return { ok: false, error: SUBCATEGORY_NOT_FOUND_MESSAGE };
	}
	if (parentId !== categoryId) {
		return { ok: false, error: SUBCATEGORY_MISMATCH_MESSAGE };
	}
	return { ok: true, subcategoryId: requested };
}

export function validateSubcategoryPairs(
	pairs: Array<{
		categoryId: string | null;
		subcategoryId: string | null | undefined;
	}>,
	parents: ReadonlyMap<string, string>,
): string | null {
	for (const pair of pairs) {
		if (!pair.subcategoryId) continue;
		const result = resolveSubcategoryId({
			requested: pair.subcategoryId,
			categoryId: pair.categoryId,
			parents,
		});
		if (!result.ok) return result.error;
	}
	return null;
}
