import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, dbMock } = vi.hoisted(() => {
	const whereMock = vi.fn();
	// Builder aguardável que também expõe os métodos encadeáveis do drizzle.
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
		});
	return { whereMock, dbMock: { select: () => builder() } };
});

vi.mock("@/shared/lib/db", () => ({ db: dbMock }));
vi.mock("@/shared/lib/payers/get-admin-id", () => ({
	getAdminPayerId: vi.fn(async () => "admin-1"),
}));

import { fetchCategoryChartData } from "./category-chart-queries";
import { fetchCategoryReport } from "./category-report-queries";

const dialect = new PgDialect();
const firstWhere = () => dialect.sqlToQuery(whereMock.mock.calls[0][0]);

describe("Tendências: recorte por viagem", () => {
	beforeEach(() => whereMock.mockReset());

	it("Sem viagens soma apenas lançamentos sem viagem (tabela e gráfico)", async () => {
		await fetchCategoryReport("user-1", {
			startPeriod: "2026-03",
			endPeriod: "2026-06",
			tripFilter: { kind: "none" },
		});
		expect(firstWhere().sql).toMatch(/"viagem_id" is null/);
		expect(firstWhere().params).toContain("user-1");

		whereMock.mockReset();
		await fetchCategoryChartData("user-1", "2026-03", "2026-06", undefined, {
			kind: "none",
		});
		expect(firstWhere().sql).toMatch(/"viagem_id" is null/);
	});

	it("viagem específica soma apenas os vinculados a ela (tabela e gráfico)", async () => {
		const lisboa = {
			kind: "trip" as const,
			tripId: "lisboa-id",
			name: "Lisboa",
		};

		await fetchCategoryReport("user-1", {
			startPeriod: "2026-03",
			endPeriod: "2026-12",
			tripFilter: lisboa,
		});
		expect(firstWhere().sql).toMatch(/"viagem_id" = \$\d+/);
		expect(firstWhere().params).toContain("lisboa-id");

		whereMock.mockReset();
		await fetchCategoryChartData(
			"user-1",
			"2026-03",
			"2026-12",
			undefined,
			lisboa,
		);
		expect(firstWhere().params).toContain("lisboa-id");
	});

	it("Todos os lançamentos (ou filtro ausente) não restringe viagem", async () => {
		await fetchCategoryReport("user-1", {
			startPeriod: "2026-03",
			endPeriod: "2026-06",
		});
		expect(firstWhere().sql).not.toMatch(/viagem_id/);

		whereMock.mockReset();
		await fetchCategoryChartData("user-1", "2026-03", "2026-06", undefined, {
			kind: "all",
		});
		expect(firstWhere().sql).not.toMatch(/viagem_id/);
	});
});
