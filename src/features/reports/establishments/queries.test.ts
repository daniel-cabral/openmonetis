import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, dbMock } = vi.hoisted(() => {
	const whereMock = vi.fn();
	const builder = (): Promise<unknown[]> =>
		Object.assign(Promise.resolve([] as unknown[]), {
			from: () => builder(),
			innerJoin: () => builder(),
			leftJoin: () => builder(),
			where: (condition: unknown) => {
				whereMock(condition);
				return builder();
			},
			groupBy: () => builder(),
			orderBy: () => builder(),
			limit: () => builder(),
		});
	return { whereMock, dbMock: { select: () => builder() } };
});

vi.mock("@/shared/lib/db", () => ({ db: dbMock }));
vi.mock("@/shared/lib/payers/get-admin-id", () => ({
	getAdminPayerId: vi.fn(async () => "admin-1"),
}));

import { fetchTopEstablishmentsData } from "./queries";

const dialect = new PgDialect();
const firstWhere = () => dialect.sqlToQuery(whereMock.mock.calls[0][0]);

describe("Estabelecimentos: recorte por viagem", () => {
	beforeEach(() => whereMock.mockReset());

	it("viagem específica ignora a janela de meses e mantém usuário e admin", async () => {
		const data = await fetchTopEstablishmentsData("user-1", "2026-10", "3", {
			kind: "trip",
			tripId: "lisboa-id",
			name: "Lisboa",
		});

		const query = firstWhere();
		expect(query.sql).not.toMatch(/"periodo" >=/);
		expect(query.sql).not.toMatch(/"periodo" <=/);
		expect(query.sql).toMatch(/"viagem_id" = \$\d+/);
		expect(query.params).toEqual(
			expect.arrayContaining(["user-1", "admin-1", "Despesa", "lisboa-id"]),
		);
		expect(data.periodLabel).toBe("Viagem: Lisboa");
	});

	it("Sem viagens mantém a janela e exclui vinculados", async () => {
		const data = await fetchTopEstablishmentsData("user-1", "2026-10", "3", {
			kind: "none",
		});

		const query = firstWhere();
		expect(query.sql).toMatch(/"periodo" >= \$\d+/);
		expect(query.sql).toMatch(/"viagem_id" is null/);
		expect(query.params).toEqual(
			expect.arrayContaining(["2026-08", "2026-10"]),
		);
		expect(data.periodLabel).toBe("Últimos 3 meses");
	});

	it("sem filtro de viagem fica como antes", async () => {
		await fetchTopEstablishmentsData("user-1", "2026-10", "6");
		expect(firstWhere().sql).toMatch(/"periodo" >= \$\d+/);
		expect(firstWhere().sql).not.toMatch(/viagem_id/);
	});
});
