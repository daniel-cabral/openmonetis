import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, getUserIdMock, insertWrites } = vi.hoisted(() => ({
	whereMock: vi.fn(),
	getUserIdMock: vi.fn(),
	insertWrites: [] as { values: unknown; config: unknown }[],
}));

vi.mock("@/shared/lib/auth/server", () => ({
	getUserId: getUserIdMock,
}));

vi.mock("@/shared/lib/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: whereMock,
			}),
		}),
		insert: () => ({
			values: (values: unknown) => ({
				onConflictDoUpdate: (config: unknown) => {
					insertWrites.push({ values, config });
					return Promise.resolve();
				},
			}),
		}),
	},
}));

import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import {
	fetchCategoryMappings,
	saveCategoryMappings,
} from "./category-memory-action";

const MORADIA = "11111111-1111-4111-8111-111111111111";
const FAXINA = "22222222-2222-4222-8222-222222222222";
const DESCRIPTION = "FAXINA MARIA";

describe("category memory", () => {
	beforeEach(() => {
		whereMock.mockReset();
		getUserIdMock.mockReset();
		getUserIdMock.mockResolvedValue("user-1");
		insertWrites.length = 0;
	});

	it("devolve categoria e subcategoria por descrição normalizada", async () => {
		const key = normalizeDescriptionKey(DESCRIPTION);
		whereMock.mockResolvedValue([
			{ descriptionKey: key, categoryId: MORADIA, subcategoryId: FAXINA },
		]);

		const result = await fetchCategoryMappings([DESCRIPTION]);

		expect(result).toEqual({
			[key]: { categoryId: MORADIA, subcategoryId: FAXINA },
		});
	});

	it("salva a subcategoria da linha, inclusive vazia, e a troca no conflito", async () => {
		await saveCategoryMappings([
			{ description: DESCRIPTION, categoryId: MORADIA, subcategoryId: null },
		]);

		expect(insertWrites).toHaveLength(1);
		expect(insertWrites[0]?.values).toEqual([
			expect.objectContaining({ categoryId: MORADIA, subcategoryId: null }),
		]);
		expect(insertWrites[0]?.config).toEqual(
			expect.objectContaining({
				set: expect.objectContaining({ subcategoryId: expect.anything() }),
			}),
		);
	});
});
