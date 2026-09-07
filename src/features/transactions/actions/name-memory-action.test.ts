import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, getUserIdMock } = vi.hoisted(() => ({
	whereMock: vi.fn(),
	getUserIdMock: vi.fn(),
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
	},
}));

import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { fetchNameMappings } from "./name-memory-action";

describe("fetchNameMappings", () => {
	beforeEach(() => {
		whereMock.mockReset();
		getUserIdMock.mockReset();
		getUserIdMock.mockResolvedValue("user-1");
	});

	it("retorna mapa vazio quando nenhuma descrição é fornecida", async () => {
		const result = await fetchNameMappings([]);

		expect(result).toEqual({});
		expect(whereMock).not.toHaveBeenCalled();
	});

	it("normaliza as descrições e devolve mapa chave -> nome filtrado por userId", async () => {
		const description = "CASA NOVA LOCADORA LTDA - Boleto";
		const key = normalizeDescriptionKey(description);
		whereMock.mockResolvedValue([{ descriptionKey: key, name: "Aluguel" }]);

		const result = await fetchNameMappings([description]);

		expect(result).toEqual({ [key]: "Aluguel" });
	});
});
