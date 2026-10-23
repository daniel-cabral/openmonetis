"use server";

import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { categories, subcategories } from "@/db/schema";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { CATEGORY_TYPES } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { SUBCATEGORY_NOT_FOUND_MESSAGE } from "@/shared/lib/subcategories/rules";
import { normalizeIconInput } from "@/shared/utils/string";

const subcategoryInputSchema = z.object({
	id: z.string().uuid("Subcategoria inválida.").optional(),
	name: z
		.string()
		.trim()
		.min(1, "Informe o nome da subcategoria.")
		.max(60, "O nome da subcategoria deve ter no máximo 60 caracteres."),
});

const subcategoriesSchema = z
	.array(subcategoryInputSchema)
	.default([])
	.superRefine((items, ctx) => {
		const seen = new Set<string>();
		items.forEach((item, index) => {
			const key = item.name.toLocaleLowerCase("pt-BR");
			if (seen.has(key)) {
				ctx.addIssue({
					code: "custom",
					message: `Já existe a subcategoria "${item.name}" nesta categoria.`,
					path: [index, "name"],
				});
			}
			seen.add(key);
		});
	});

const categoryBaseSchema = z.object({
	name: z
		.string({ message: "Informe o nome da categoria." })
		.trim()
		.min(1, "Informe o nome da categoria."),
	type: z.enum(CATEGORY_TYPES, {
		message: "Tipo de categoria inválido.",
	}),
	icon: z
		.string()
		.trim()
		.max(100, "O ícone deve ter no máximo 100 caracteres.")
		.nullish()
		.transform((value) => normalizeIconInput(value)),
	subcategories: subcategoriesSchema,
});

const createCategorySchema = categoryBaseSchema;
const updateCategorySchema = categoryBaseSchema.extend({
	id: uuidSchema("Category"),
});
const deleteCategorySchema = z.object({
	id: uuidSchema("Category"),
});

type CategoryCreateInput = z.input<typeof createCategorySchema>;
type CategoryUpdateInput = z.input<typeof updateCategorySchema>;
type CategoryDeleteInput = z.infer<typeof deleteCategorySchema>;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Makes the stored subcategories of one category match the payload, inside
 * the caller's transaction. Rows without id are created, rows with id are
 * renamed (throws when the id is not one of this category's rows), and rows
 * missing from the payload are deleted (their transactions keep, set null).
 */
async function syncSubcategories(
	tx: DbTransaction,
	userId: string,
	categoryId: string,
	rows: Array<{ id?: string; name: string }>,
) {
	const keptIds = rows.flatMap((row) => (row.id ? [row.id] : []));
	await tx
		.delete(subcategories)
		.where(
			and(
				eq(subcategories.categoryId, categoryId),
				eq(subcategories.userId, userId),
				notInArray(subcategories.id, keptIds),
			),
		);

	for (const row of rows) {
		if (!row.id) continue;
		const [renamed] = await tx
			.update(subcategories)
			.set({ name: row.name })
			.where(
				and(
					eq(subcategories.id, row.id),
					eq(subcategories.categoryId, categoryId),
					eq(subcategories.userId, userId),
				),
			)
			.returning({ id: subcategories.id });
		if (!renamed) throw new Error(SUBCATEGORY_NOT_FOUND_MESSAGE);
	}

	const created = rows
		.filter((row) => !row.id)
		.map((row) => ({ name: row.name, categoryId, userId }));
	if (created.length > 0) {
		await tx.insert(subcategories).values(created);
	}
}

function handleSaveError(error: unknown): ActionResult {
	if (
		error instanceof Error &&
		error.message === SUBCATEGORY_NOT_FOUND_MESSAGE
	) {
		return { success: false, error: SUBCATEGORY_NOT_FOUND_MESSAGE };
	}
	return handleActionError(error);
}

export async function createCategoryAction(
	input: CategoryCreateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = createCategorySchema.parse(input);

		await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(categories)
				.values({
					name: data.name,
					type: data.type,
					icon: data.icon,
					userId: user.id,
				})
				.returning({ id: categories.id });
			await syncSubcategories(tx, user.id, created.id, data.subcategories);
		});

		revalidateForEntity("categories", user.id);

		return { success: true, message: "Category criada com sucesso." };
	} catch (error) {
		return handleSaveError(error);
	}
}

export async function updateCategoryAction(
	input: CategoryUpdateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateCategorySchema.parse(input);

		// Buscar categoria antes de atualizar para verificar restrições
		const categoria = await db.query.categories.findFirst({
			columns: { id: true, name: true },
			where: and(eq(categories.id, data.id), eq(categories.userId, user.id)),
		});

		if (!categoria) {
			return {
				success: false,
				error: "Category não encontrada.",
			};
		}

		// Bloquear edição das categories protegidas
		const categoriasProtegidas = [
			"Transferência interna",
			"Saldo inicial",
			"Pagamentos",
		];
		if (categoriasProtegidas.includes(categoria.name)) {
			return {
				success: false,
				error: `A categoria '${categoria.name}' é protegida e não pode ser editada.`,
			};
		}

		const updated = await db.transaction(async (tx) => {
			const [row] = await tx
				.update(categories)
				.set({
					name: data.name,
					type: data.type,
					icon: data.icon,
				})
				.where(and(eq(categories.id, data.id), eq(categories.userId, user.id)))
				.returning();

			if (!row) return false;

			await syncSubcategories(tx, user.id, data.id, data.subcategories);
			return true;
		});

		if (!updated) {
			return {
				success: false,
				error: "Category não encontrada.",
			};
		}

		revalidateForEntity("categories", user.id);

		return { success: true, message: "Categoria atualizada com sucesso." };
	} catch (error) {
		return handleSaveError(error);
	}
}

export async function deleteCategoryAction(
	input: CategoryDeleteInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deleteCategorySchema.parse(input);

		// Buscar categoria antes de deletar para verificar restrições
		const categoria = await db.query.categories.findFirst({
			columns: { id: true, name: true },
			where: and(eq(categories.id, data.id), eq(categories.userId, user.id)),
		});

		if (!categoria) {
			return {
				success: false,
				error: "Category não encontrada.",
			};
		}

		// Bloquear remoção das categories protegidas
		const categoriasProtegidas = [
			"Transferência interna",
			"Saldo inicial",
			"Pagamentos",
		];
		if (categoriasProtegidas.includes(categoria.name)) {
			return {
				success: false,
				error: `A categoria '${categoria.name}' é protegida e não pode ser removida.`,
			};
		}

		const [deleted] = await db
			.delete(categories)
			.where(and(eq(categories.id, data.id), eq(categories.userId, user.id)))
			.returning({ id: categories.id });

		if (!deleted) {
			return {
				success: false,
				error: "Category não encontrada.",
			};
		}

		revalidateForEntity("categories", user.id);

		return { success: true, message: "Category removida com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}
