# Filtro de viagem nos relatórios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seletor "Viagem" (Todos / Sem viagens / viagem X) em Relatórios › Tendências por categoria e Relatórios › Estabelecimentos, com estado no URL (`viagem=<id>` ou `viagem=sem`).

**Architecture:** O contrato entre `reports` e `trips` mora em `src/shared/lib/trips/` (parser do URL, predicado Drizzle, intervalos de período por viagem), porque features não se importam. As queries de `reports` recebem um `TripFilter` opcional e somam o predicado às exclusões existentes. Em Tendências o cliente, ao escolher a viagem, navega com `viagem` + `inicio`/`fim` cobrindo os períodos da viagem (limitado a 24 meses); em Estabelecimentos a viagem específica remove a janela de meses.

**Tech Stack:** Next.js 16 (App Router, `searchParams` como Promise, `useRouter`/`useSearchParams` de `next/navigation`), React 19, Drizzle ORM 0.45 (`drizzle-orm/pg-core` `PgDialect` para renderizar SQL nos testes), vitest (environment node, `src/**/*.test.ts`), Biome 2, shadcn/ui `Select`.

**Spec:** `openspec/changes/add-trip-report-filter/specs/trip-report-filter/spec.md` (+ `design.md` e `proposal.md` da mesma pasta).

**Pré-requisito:** change `add-trips` aplicada. Antes da Task 1, confirme que existem: `trips` e `transactions.tripId` em `src/db/schema.ts`, e `fetchUserTrips` + `TripOption` em `src/shared/lib/trips/queries.ts`. Se faltar algum, pare (circuit breaker): este plano não cria nada de `add-trips`.

## Global Constraints

- Toda query filtra por `userId` (`eq(transactions.userId, userId)`); viagem que não pertence ao usuário vira `{ kind: "all" }` sem vazar existência.
- `src/features/reports/` NÃO importa `src/features/trips/`; tudo de viagem vem de `@/shared/lib/trips/*`.
- Parâmetro de URL: `viagem`. Valor `sem` = "Sem viagens"; UUID = viagem; ausente/inválido = "Todos os lançamentos".
- Copy de UI em PT-BR, exatamente: `Viagem`, `Todos os lançamentos`, `Sem viagens`, `Viagem: <nome>`, aria-label `Filtrar por viagem`.
- Identificadores, comentários e nomes de arquivo em inglês, `kebab-case`.
- Exclusões existentes (`AUTO_FATURA:%`, contas excluídas, saldo inicial) continuam; o predicado de viagem só se soma (design D5).
- Uso de cartões e Análise de parcelas não mudam (nenhum arquivo deles é tocado). Exportação de Tendências fica fora do escopo.
- "Limpar" em Tendências também volta a viagem para "Todos os lançamentos" (remove `viagem` do URL).
- O intervalo de uma viagem considera lançamentos de todas as pessoas, não só do admin.
- Intervalo de Tendências nunca passa de 24 meses (`validateDateRange` em `src/features/reports/lib/utils.ts` redireciona acima disso).
- Lint por arquivo: `pnpm exec biome check <arquivos>` (o `biome check .` local falha por CRLF em tudo; CI passa).
- Commits em PT-BR, prefixo `feat(reports): ...` / `feat(trips): ...` / `chore: ...`, sempre por pathspec (`git commit -m "..." -- <arquivos>`).
- Biome proíbe `then` solto em objeto (`noThenProperty`): mocks aguardáveis usam `Object.assign(Promise.resolve(rows), { ...métodos })`, como em `src/features/transactions/actions/reconciliation-action.test.ts`.

## Review Focus

- Viagem cujas parcelas cobrem mais de 24 meses: De/Até fica `inicio = menor período`, `fim = inicio + 23 meses`, sem redirecionar para o padrão (teste na Task 5).
- `viagem=<uuid de outro usuário>`, `viagem=lixo`, `viagem=` vazio: relatório igual a "Todos os lançamentos" (teste na Task 1).
- Viagem sem nenhum lançamento: De/Até continuam os atuais (teste na Task 5).
- Escolher a viagem preserva `categorias` e `aba` do URL; trocar De/Até depois preserva `viagem` (teste na Task 5 para o primeiro; o segundo já vale porque `handleFiltersChange` parte de `searchParams.toString()`).
- "Limpar" com viagem escolhida: viagem, categorias e De/Até voltam ao padrão, `aba` fica (teste na Task 5).
- Modo viagem em Estabelecimentos tira só o corte de período: `userId`, pessoa admin e tipo Despesa continuam no `where` (teste na Task 4).

---

## 1. Parser do URL e predicado de viagem (shared)

**Files:**
- Create: `src/shared/lib/trips/trip-filter-param.ts`
- Create: `src/shared/lib/trips/trip-filter-condition.ts`
- Test: `src/shared/lib/trips/trip-filter.test.ts`

**Interfaces:**
- Consumes: `type TripOption = { id: string; name: string; startDate: string; endDate: string }` de `@/shared/lib/trips/queries` (add-trips); `transactions.tripId` de `@/db/schema`.
- Produces:
  - `trip-filter-param.ts` (sem import de runtime, seguro no cliente): `TRIP_FILTER_PARAM = "viagem"`, `TRIP_FILTER_NONE_VALUE = "sem"`, `type TripFilter = { kind: "all" } | { kind: "none" } | { kind: "trip"; tripId: string; name: string }`, `parseTripFilterParam(value: string | null, userTrips: TripOption[]): TripFilter`, `tripFilterToParam(filter: TripFilter): string | null`.
  - `trip-filter-condition.ts` (servidor): `tripFilterCondition(filter: TripFilter): SQL | undefined`.

- [x] 1.1 Escrever o teste que falha

```ts
// src/shared/lib/trips/trip-filter.test.ts
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { tripFilterCondition } from "./trip-filter-condition";
import {
	parseTripFilterParam,
	type TripFilter,
	tripFilterToParam,
} from "./trip-filter-param";
import type { TripOption } from "./queries";

const userTrips: TripOption[] = [
	{
		id: "11111111-1111-4111-8111-111111111111",
		name: "Lisboa",
		startDate: "2026-05-12",
		endDate: "2026-05-22",
	},
];

const dialect = new PgDialect();

describe("parseTripFilterParam", () => {
	it.each<[string, string | null, TripFilter]>([
		["ausente", null, { kind: "all" }],
		["vazio", "", { kind: "all" }],
		["sem", "sem", { kind: "none" }],
		[
			"viagem do usuário",
			"11111111-1111-4111-8111-111111111111",
			{
				kind: "trip",
				tripId: "11111111-1111-4111-8111-111111111111",
				name: "Lisboa",
			},
		],
		[
			"viagem de outro usuário",
			"22222222-2222-4222-8222-222222222222",
			{ kind: "all" },
		],
		["valor inválido", "lixo", { kind: "all" }],
	])("%s", (_label, value, expected) => {
		expect(parseTripFilterParam(value, userTrips)).toEqual(expected);
	});
});

describe("tripFilterToParam", () => {
	it("serializa os três modos", () => {
		expect(tripFilterToParam({ kind: "all" })).toBeNull();
		expect(tripFilterToParam({ kind: "none" })).toBe("sem");
		expect(
			tripFilterToParam({ kind: "trip", tripId: "abc", name: "Lisboa" }),
		).toBe("abc");
	});
});

describe("tripFilterCondition", () => {
	it("all não restringe", () => {
		expect(tripFilterCondition({ kind: "all" })).toBeUndefined();
	});

	it("none exige viagem_id nulo", () => {
		const condition = tripFilterCondition({ kind: "none" });
		expect(condition).toBeDefined();
		const query = dialect.sqlToQuery(condition!);
		expect(query.sql).toMatch(/"viagem_id" is null/);
	});

	it("trip exige viagem_id igual ao id", () => {
		const condition = tripFilterCondition({
			kind: "trip",
			tripId: "abc",
			name: "Lisboa",
		});
		const query = dialect.sqlToQuery(condition!);
		expect(query.sql).toMatch(/"viagem_id" = \$1/);
		expect(query.params).toEqual(["abc"]);
	});
});
```

- [x] 1.2 Rodar e ver falhar: `pnpm exec vitest run src/shared/lib/trips/trip-filter.test.ts` (esperado: FAIL, módulos `./trip-filter-param` e `./trip-filter-condition` não existem)

- [x] 1.3 Implementar

```ts
// src/shared/lib/trips/trip-filter-param.ts
import type { TripOption } from "./queries";

export const TRIP_FILTER_PARAM = "viagem";
export const TRIP_FILTER_NONE_VALUE = "sem";

export type TripFilter =
	| { kind: "all" }
	| { kind: "none" }
	| { kind: "trip"; tripId: string; name: string };

/**
 * Reads the `viagem` URL param. Only trips owned by the user are accepted;
 * anything else falls back to "all" so foreign ids leak nothing.
 */
export function parseTripFilterParam(
	value: string | null,
	userTrips: TripOption[],
): TripFilter {
	if (!value) return { kind: "all" };
	if (value === TRIP_FILTER_NONE_VALUE) return { kind: "none" };
	const trip = userTrips.find((item) => item.id === value);
	return trip
		? { kind: "trip", tripId: trip.id, name: trip.name }
		: { kind: "all" };
}

export function tripFilterToParam(filter: TripFilter): string | null {
	if (filter.kind === "none") return TRIP_FILTER_NONE_VALUE;
	if (filter.kind === "trip") return filter.tripId;
	return null;
}
```

```ts
// src/shared/lib/trips/trip-filter-condition.ts
import { eq, isNull, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";
import type { TripFilter } from "./trip-filter-param";

export function tripFilterCondition(filter: TripFilter): SQL | undefined {
	if (filter.kind === "none") return isNull(transactions.tripId);
	if (filter.kind === "trip") return eq(transactions.tripId, filter.tripId);
	return undefined;
}
```

- [x] 1.4 Rodar e ver passar: `pnpm exec vitest run src/shared/lib/trips/trip-filter.test.ts` (PASS). Se o Biome reclamar do `!` (noNonNullAssertion) no teste, troque por `as SQL` importando `type SQL` de `drizzle-orm`.

- [x] 1.5 Lint e commit

```bash
pnpm exec biome check src/shared/lib/trips/trip-filter-param.ts src/shared/lib/trips/trip-filter-condition.ts src/shared/lib/trips/trip-filter.test.ts
git add src/shared/lib/trips/trip-filter-param.ts src/shared/lib/trips/trip-filter-condition.ts src/shared/lib/trips/trip-filter.test.ts
git commit -m "feat(trips): filtro de viagem compartilhado para relatorios" -- src/shared/lib/trips/trip-filter-param.ts src/shared/lib/trips/trip-filter-condition.ts src/shared/lib/trips/trip-filter.test.ts
```

## 2. Intervalo de períodos por viagem (shared)

**Files:**
- Create: `src/shared/lib/trips/period-ranges.ts`
- Test: `src/shared/lib/trips/period-ranges.test.ts`

**Interfaces:**
- Consumes: `transactions.tripId`, `transactions.period`, `transactions.userId` de `@/db/schema`; `db` de `@/shared/lib/db`.
- Produces: `type TripPeriodRange = { startPeriod: string; endPeriod: string }`; `fetchTripPeriodRanges(userId: string): Promise<Record<string, TripPeriodRange>>` (chave = `tripId`; viagem sem lançamento não aparece). Uma query agrupada por viagem, para o cliente de Tendências ajustar De/Até sem ida ao servidor (design D3).

- [x] 2.1 Escrever o teste que falha

```ts
// src/shared/lib/trips/period-ranges.test.ts
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, rowsQueue } = vi.hoisted(() => ({
	whereMock: vi.fn(),
	rowsQueue: [] as unknown[][],
}));

vi.mock("@/shared/lib/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (condition: unknown) => {
					whereMock(condition);
					return {
						groupBy: () => Promise.resolve(rowsQueue.shift() ?? []),
					};
				},
			}),
		}),
	},
}));

import { fetchTripPeriodRanges } from "./period-ranges";

describe("fetchTripPeriodRanges", () => {
	beforeEach(() => {
		whereMock.mockReset();
		rowsQueue.length = 0;
	});

	it("devolve menor e maior período por viagem do usuário", async () => {
		rowsQueue.push([
			{ tripId: "lisboa", startPeriod: "2026-03", endPeriod: "2026-12" },
			{ tripId: null, startPeriod: "2026-01", endPeriod: "2026-01" },
		]);

		const ranges = await fetchTripPeriodRanges("user-1");

		expect(ranges).toEqual({
			lisboa: { startPeriod: "2026-03", endPeriod: "2026-12" },
		});
		const query = new PgDialect().sqlToQuery(whereMock.mock.calls[0][0]);
		expect(query.sql).toMatch(/"user_id" = \$1/);
		expect(query.sql).toMatch(/"viagem_id" is not null/);
		expect(query.params).toEqual(["user-1"]);
	});
});
```

- [x] 2.2 Rodar e ver falhar: `pnpm exec vitest run src/shared/lib/trips/period-ranges.test.ts` (FAIL, módulo não existe). Se a coluna de usuário em `transactions` não se chamar `user_id` no schema, ajuste só a regex.

- [x] 2.3 Implementar

```ts
// src/shared/lib/trips/period-ranges.ts
import { and, eq, isNotNull, max, min } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";

export type TripPeriodRange = { startPeriod: string; endPeriod: string };

/**
 * Smallest and largest `periodo` among each trip's transactions, keyed by trip id.
 * Trips without transactions are absent.
 */
export async function fetchTripPeriodRanges(
	userId: string,
): Promise<Record<string, TripPeriodRange>> {
	const rows = await db
		.select({
			tripId: transactions.tripId,
			startPeriod: min(transactions.period),
			endPeriod: max(transactions.period),
		})
		.from(transactions)
		.where(
			and(eq(transactions.userId, userId), isNotNull(transactions.tripId)),
		)
		.groupBy(transactions.tripId);

	const ranges: Record<string, TripPeriodRange> = {};
	for (const row of rows) {
		if (!row.tripId || !row.startPeriod || !row.endPeriod) continue;
		ranges[row.tripId] = {
			startPeriod: row.startPeriod,
			endPeriod: row.endPeriod,
		};
	}
	return ranges;
}
```

- [x] 2.4 Rodar e ver passar: `pnpm exec vitest run src/shared/lib/trips/period-ranges.test.ts` (PASS)

- [x] 2.5 Lint e commit

```bash
pnpm exec biome check src/shared/lib/trips/period-ranges.ts src/shared/lib/trips/period-ranges.test.ts
git add src/shared/lib/trips/period-ranges.ts src/shared/lib/trips/period-ranges.test.ts
git commit -m "feat(trips): intervalo de periodos por viagem" -- src/shared/lib/trips/period-ranges.ts src/shared/lib/trips/period-ranges.test.ts
```

## 3. Predicado de viagem nas queries de Tendências

**Files:**
- Modify: `src/shared/lib/types/reports.ts:40-44` (`CategoryReportFilters`)
- Modify: `src/features/reports/lib/category-report-queries.ts:26-48`
- Modify: `src/features/reports/lib/category-chart-queries.ts:31-57`
- Test: `src/features/reports/lib/category-report-queries.test.ts`

**Interfaces:**
- Consumes: `TripFilter` (Task 1, `@/shared/lib/trips/trip-filter-param`), `tripFilterCondition` (Task 1, `@/shared/lib/trips/trip-filter-condition`).
- Produces:
  - `CategoryReportFilters` ganha `tripFilter?: TripFilter`.
  - `fetchCategoryReport(userId: string, filters: CategoryReportFilters)` respeita `filters.tripFilter`.
  - `fetchCategoryChartData(userId: string, startPeriod: string, endPeriod: string, categoryIds?: string[], tripFilter?: TripFilter)`.

- [x] 3.1 Escrever o teste que falha

```ts
// src/features/reports/lib/category-report-queries.test.ts
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
		const lisboa = { kind: "trip" as const, tripId: "lisboa-id", name: "Lisboa" };

		await fetchCategoryReport("user-1", {
			startPeriod: "2026-03",
			endPeriod: "2026-12",
			tripFilter: lisboa,
		});
		expect(firstWhere().sql).toMatch(/"viagem_id" = \$\d+/);
		expect(firstWhere().params).toContain("lisboa-id");

		whereMock.mockReset();
		await fetchCategoryChartData("user-1", "2026-03", "2026-12", undefined, lisboa);
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
```

- [x] 3.2 Rodar e ver falhar: `pnpm exec vitest run src/features/reports/lib/category-report-queries.test.ts` (esperado: FAIL em `tsc`/asserção, `tripFilter` ignorado e `"viagem_id"` ausente do SQL)

- [x] 3.3 Implementar. Em `src/shared/lib/types/reports.ts`, adicionar o import no topo e o campo:

```ts
import type { TripFilter } from "@/shared/lib/trips/trip-filter-param";

export type CategoryReportFilters = {
	startPeriod: string; // Format: "YYYY-MM"
	endPeriod: string; // Format: "YYYY-MM"
	categoryIds?: string[]; // Optional: filter by specific categories
	tripFilter?: TripFilter; // Optional: trip slice (all / none / one trip)
};
```

Em `category-report-queries.ts`: importar `import { tripFilterCondition } from "@/shared/lib/trips/trip-filter-condition";`, desestruturar `tripFilter` (`const { startPeriod, endPeriod, categoryIds, tripFilter } = filters;`) e, logo após o bloco `if (categoryIds && categoryIds.length > 0) { ... }`:

```ts
	const tripCondition = tripFilter ? tripFilterCondition(tripFilter) : undefined;
	if (tripCondition) {
		whereConditions.push(tripCondition);
	}
```

Em `category-chart-queries.ts`: importar `tripFilterCondition` e `type TripFilter` (de `@/shared/lib/trips/trip-filter-param`), acrescentar o 5º parâmetro `tripFilter?: TripFilter` em `fetchCategoryChartData` e, logo após o `if (categoryIds ...)`, o mesmo bloco `tripCondition` acima.

- [x] 3.4 Rodar e ver passar: `pnpm exec vitest run src/features/reports/lib/category-report-queries.test.ts` (PASS) e `pnpm exec tsc --noEmit` (sem erros)

- [x] 3.5 Lint e commit

```bash
pnpm exec biome check src/shared/lib/types/reports.ts src/features/reports/lib/category-report-queries.ts src/features/reports/lib/category-chart-queries.ts src/features/reports/lib/category-report-queries.test.ts
git add src/shared/lib/types/reports.ts src/features/reports/lib/category-report-queries.ts src/features/reports/lib/category-chart-queries.ts src/features/reports/lib/category-report-queries.test.ts
git commit -m "feat(reports): recorte por viagem nas queries de tendencias" -- src/shared/lib/types/reports.ts src/features/reports/lib/category-report-queries.ts src/features/reports/lib/category-chart-queries.ts src/features/reports/lib/category-report-queries.test.ts
```

## 4. Estabelecimentos: predicado de viagem e janela ignorada

**Files:**
- Modify: `src/features/reports/establishments/queries.ts:73-123`
- Test: `src/features/reports/establishments/queries.test.ts`

**Interfaces:**
- Consumes: `TripFilter`, `tripFilterCondition` (Task 1).
- Produces: `fetchTopEstablishmentsData(userId: string, currentPeriod: string, periodFilter: PeriodFilter = "6", tripFilter: TripFilter = { kind: "all" }): Promise<TopEstablishmentsData>`; com `kind: "trip"`, sem `gte/lte` de período e `periodLabel = "Viagem: <nome>"`.

- [x] 4.1 Escrever o teste que falha

```ts
// src/features/reports/establishments/queries.test.ts
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
		expect(query.params).toEqual(expect.arrayContaining(["2026-08", "2026-10"]));
		expect(data.periodLabel).toBe("Últimos 3 meses");
	});

	it("sem filtro de viagem fica como antes", async () => {
		await fetchTopEstablishmentsData("user-1", "2026-10", "6");
		expect(firstWhere().sql).toMatch(/"periodo" >= \$\d+/);
		expect(firstWhere().sql).not.toMatch(/viagem_id/);
	});
});
```

- [x] 4.2 Rodar e ver falhar: `pnpm exec vitest run src/features/reports/establishments/queries.test.ts` (FAIL: 4º argumento ignorado, `"periodo" >=` presente no modo viagem)

- [x] 4.3 Implementar em `queries.ts`. Imports novos:

```ts
import { tripFilterCondition } from "@/shared/lib/trips/trip-filter-condition";
import type { TripFilter } from "@/shared/lib/trips/trip-filter-param";
```

Assinatura e cálculo do rótulo:

```ts
export async function fetchTopEstablishmentsData(
	userId: string,
	currentPeriod: string,
	periodFilter: PeriodFilter = "6",
	tripFilter: TripFilter = { kind: "all" },
): Promise<TopEstablishmentsData> {
	const months = parseInt(periodFilter, 10);
	const periods = buildPeriodRange(currentPeriod, months);
	const startPeriod = periods[0];
	const adminPayerId = await getAdminPayerId(userId);
	const periodLabel =
		tripFilter.kind === "trip"
			? `Viagem: ${tripFilter.name}`
			: months === 3
				? "Últimos 3 meses"
				: months === 6
					? "Últimos 6 meses"
					: "Últimos 12 meses";
```

Substituir `baseExpenseConditions` (o `as const` sai porque o array passa a ter spreads condicionais):

```ts
	// A specific trip shows the whole trip: the month window does not apply.
	const periodConditions =
		tripFilter.kind === "trip"
			? []
			: [
					gte(transactions.period, startPeriod),
					lte(transactions.period, currentPeriod),
				];
	const tripCondition = tripFilterCondition(tripFilter);
	const baseExpenseConditions = [
		eq(transactions.userId, userId),
		...periodConditions,
		eq(transactions.payerId, adminPayerId),
		eq(transactions.transactionType, DESPESA),
		...(tripCondition ? [tripCondition] : []),
	];
```

O resto da função não muda.

- [x] 4.4 Rodar e ver passar: `pnpm exec vitest run src/features/reports/establishments/queries.test.ts` (PASS) e `pnpm exec tsc --noEmit`

- [x] 4.5 Lint e commit

```bash
pnpm exec biome check src/features/reports/establishments/queries.ts src/features/reports/establishments/queries.test.ts
git add src/features/reports/establishments/queries.ts src/features/reports/establishments/queries.test.ts
git commit -m "feat(reports): recorte por viagem em estabelecimentos" -- src/features/reports/establishments/queries.ts src/features/reports/establishments/queries.test.ts
```

## 5. Intervalo da viagem em Tendências (regra pura)

**Files:**
- Create: `src/features/reports/lib/trip-range.ts`
- Test: `src/features/reports/lib/trip-range.test.ts`

**Interfaces:**
- Consumes: `type TripPeriodRange` (Task 2, `@/shared/lib/trips/period-ranges`, import só de tipo); `TRIP_FILTER_PARAM` (Task 1); `addMonthsToPeriod`, `comparePeriods` de `@/shared/utils/period`; `validateDateRange` de `./utils` (só no teste).
- Produces (seguro no cliente):
  - `MAX_REPORT_MONTHS = 24`
  - `resolveTripRange(range: TripPeriodRange | undefined, current: TripPeriodRange): TripPeriodRange`
  - `buildTripSearchParams(currentSearch: string, tripParam: string | null, range: TripPeriodRange): string`
  - `buildResetSearchParams(currentSearch: string, range: TripPeriodRange): string` (Limpar: remove `viagem` e `categorias`, grava `inicio`/`fim`, preserva o resto)

- [x] 5.1 Escrever o teste que falha

```ts
// src/features/reports/lib/trip-range.test.ts
import { describe, expect, it } from "vitest";
import {
	buildResetSearchParams,
	buildTripSearchParams,
	resolveTripRange,
} from "./trip-range";
import { validateDateRange } from "./utils";

const current = { startPeriod: "2026-05", endPeriod: "2026-10" };

describe("resolveTripRange", () => {
	it.each([
		[
			"passagem parcelada estende o intervalo",
			{ startPeriod: "2026-03", endPeriod: "2026-12" },
			{ startPeriod: "2026-03", endPeriod: "2026-12" },
		],
		["viagem sem lançamentos mantém o intervalo atual", undefined, current],
		[
			"acima de 24 meses corta o fim",
			{ startPeriod: "2025-01", endPeriod: "2027-06" },
			{ startPeriod: "2025-01", endPeriod: "2026-12" },
		],
		[
			"viagem num único mês",
			{ startPeriod: "2025-09", endPeriod: "2025-09" },
			{ startPeriod: "2025-09", endPeriod: "2025-09" },
		],
	])("%s", (_label, range, expected) => {
		const result = resolveTripRange(range, current);
		expect(result).toEqual(expected);
		expect(validateDateRange(result.startPeriod, result.endPeriod).isValid).toBe(
			true,
		);
	});
});

describe("buildTripSearchParams", () => {
	const range = { startPeriod: "2026-03", endPeriod: "2026-12" };

	it("grava viagem e intervalo preservando categorias e aba", () => {
		const params = new URLSearchParams(
			buildTripSearchParams(
				"inicio=2026-05&fim=2026-10&categorias=a,b&aba=chart",
				"lisboa-id",
				range,
			),
		);
		expect(params.get("viagem")).toBe("lisboa-id");
		expect(params.get("inicio")).toBe("2026-03");
		expect(params.get("fim")).toBe("2026-12");
		expect(params.get("categorias")).toBe("a,b");
		expect(params.get("aba")).toBe("chart");
	});

	it("Todos os lançamentos remove o parâmetro viagem", () => {
		const params = new URLSearchParams(
			buildTripSearchParams("viagem=sem&inicio=2026-05&fim=2026-10", null, current),
		);
		expect(params.has("viagem")).toBe(false);
		expect(params.get("inicio")).toBe("2026-05");
	});
});

describe("buildResetSearchParams", () => {
	it("Limpar volta viagem para Todos, limpa categorias e preserva aba", () => {
		const params = new URLSearchParams(
			buildResetSearchParams(
				"viagem=lisboa-id&inicio=2026-03&fim=2026-12&categorias=a&aba=chart",
				{ startPeriod: "2026-05", endPeriod: "2026-10" },
			),
		);
		expect(params.has("viagem")).toBe(false);
		expect(params.has("categorias")).toBe(false);
		expect(params.get("inicio")).toBe("2026-05");
		expect(params.get("fim")).toBe("2026-10");
		expect(params.get("aba")).toBe("chart");
	});
});
```

- [x] 5.2 Rodar e ver falhar: `pnpm exec vitest run src/features/reports/lib/trip-range.test.ts` (FAIL, módulo não existe)

- [x] 5.3 Implementar

```ts
// src/features/reports/lib/trip-range.ts
import type { TripPeriodRange } from "@/shared/lib/trips/period-ranges";
import { TRIP_FILTER_PARAM } from "@/shared/lib/trips/trip-filter-param";
import { addMonthsToPeriod, comparePeriods } from "@/shared/utils/period";

/** Same ceiling enforced by `validateDateRange`. */
export const MAX_REPORT_MONTHS = 24;

/**
 * Range the trends report jumps to when a trip is chosen: every period with a
 * transaction of the trip, capped at MAX_REPORT_MONTHS from the first one.
 * A trip without transactions keeps the current range.
 */
export function resolveTripRange(
	range: TripPeriodRange | undefined,
	current: TripPeriodRange,
): TripPeriodRange {
	if (!range) return current;
	const maxEnd = addMonthsToPeriod(range.startPeriod, MAX_REPORT_MONTHS - 1);
	const endPeriod =
		comparePeriods(range.endPeriod, maxEnd) > 0 ? maxEnd : range.endPeriod;
	return { startPeriod: range.startPeriod, endPeriod };
}

export function buildTripSearchParams(
	currentSearch: string,
	tripParam: string | null,
	range: TripPeriodRange,
): string {
	const params = new URLSearchParams(currentSearch);
	if (tripParam) {
		params.set(TRIP_FILTER_PARAM, tripParam);
	} else {
		params.delete(TRIP_FILTER_PARAM);
	}
	params.set("inicio", range.startPeriod);
	params.set("fim", range.endPeriod);
	return params.toString();
}

/** "Limpar": back to all transactions, no categories, given range. */
export function buildResetSearchParams(
	currentSearch: string,
	range: TripPeriodRange,
): string {
	const params = new URLSearchParams(
		buildTripSearchParams(currentSearch, null, range),
	);
	params.delete("categorias");
	return params.toString();
}
```

- [x] 5.4 Rodar e ver passar: `pnpm exec vitest run src/features/reports/lib/trip-range.test.ts` (PASS)

- [x] 5.5 Lint e commit

```bash
pnpm exec biome check src/features/reports/lib/trip-range.ts src/features/reports/lib/trip-range.test.ts
git add src/features/reports/lib/trip-range.ts src/features/reports/lib/trip-range.test.ts
git commit -m "feat(reports): intervalo de tendencias cobre a viagem" -- src/features/reports/lib/trip-range.ts src/features/reports/lib/trip-range.test.ts
```

## 6. Seletor de viagem em Tendências

**Files:**
- Create: `src/features/reports/components/trip-filter-select.tsx`
- Modify: `src/features/reports/components/category-report-filters.tsx:45-51` (props), `:116-125` (`handleReset`) e `:215` (antes do comentário `{/* Start Period Picker */}`)
- Modify: `src/features/reports/components/category-report-page.tsx` (props, handler, render do filtro)
- Modify: `src/app/(dashboard)/reports/category-trends/page.tsx`

**Interfaces:**
- Consumes: `TripOption`, `fetchUserTrips` (add-trips); `parseTripFilterParam`, `tripFilterToParam`, `TRIP_FILTER_PARAM`, `TRIP_FILTER_NONE_VALUE` (Task 1); `fetchTripPeriodRanges`, `TripPeriodRange` (Task 2); `fetchCategoryReport`/`fetchCategoryChartData` com `tripFilter` (Task 3); `resolveTripRange`, `buildTripSearchParams`, `buildResetSearchParams` (Task 5).
- Produces: `TripFilterSelect({ trips: TripOption[]; value: string | null; onChange: (value: string | null) => void; disabled?: boolean })` (reusado na Task 7); `CategoryReportFilters` aceita `tripFilter?: ReactNode` e `onReset?: (filters: FilterState) => void`; `CategoryReportPage` aceita `trips: TripOption[]`, `tripRanges: Record<string, TripPeriodRange>`, `tripParam: string | null`.

Gate desta task é `tsc` + testes existentes de `reports` (vitest roda em `node`, sem render de React; as regras ficaram nas Tasks 1, 3 e 5).

- [x] 6.1 Criar o seletor

```tsx
// src/features/reports/components/trip-filter-select.tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { TripOption } from "@/shared/lib/trips/queries";
import { TRIP_FILTER_NONE_VALUE } from "@/shared/lib/trips/trip-filter-param";

// Radix Select does not accept "" as an item value.
const ALL_VALUE = "todos";

type TripFilterSelectProps = {
	trips: TripOption[];
	value: string | null;
	onChange: (value: string | null) => void;
	disabled?: boolean;
};

export function TripFilterSelect({
	trips,
	value,
	onChange,
	disabled = false,
}: TripFilterSelectProps) {
	return (
		<Select
			value={value ?? ALL_VALUE}
			onValueChange={(next) => onChange(next === ALL_VALUE ? null : next)}
			disabled={disabled}
		>
			<SelectTrigger
				aria-label="Filtrar por viagem"
				className="w-full md:w-[200px] text-sm border-dashed"
			>
				<SelectValue placeholder="Viagem" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL_VALUE}>Todos os lançamentos</SelectItem>
				<SelectItem value={TRIP_FILTER_NONE_VALUE}>Sem viagens</SelectItem>
				{trips.length > 0 ? <SelectSeparator /> : null}
				{trips.map((trip) => (
					<SelectItem key={trip.id} value={trip.id}>
						{trip.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

- [x] 6.2 `category-report-filters.tsx`: aceitar o slot (renderizado depois do multi-select de categoria) e o `onReset`

```tsx
export function CategoryReportFilters({
	categories,
	filters,
	onFiltersChange,
	isLoading = false,
	exportButton,
	tripFilter,
	onReset,
}: CategoryReportFiltersProps & {
	exportButton?: ReactNode;
	tripFilter?: ReactNode;
	onReset?: (filters: FilterState) => void;
}) {
```

Acrescentar `FilterState` ao import de tipos (`import type { CategoryReportFiltersProps, FilterState } from "./types";`) e trocar o corpo de `handleReset`:

```tsx
	const handleReset = () => {
		const currentPeriod = getCurrentPeriod();
		const startPeriod = addMonthsToPeriod(currentPeriod, -5);
		const resetFilters: FilterState = {
			selectedCategories: [],
			startPeriod,
			endPeriod: currentPeriod,
		};

		if (onReset) {
			onReset(resetFilters);
		} else {
			onFiltersChange(resetFilters);
		}
	};
```

e, imediatamente antes de `{/* Start Period Picker */}`:

```tsx
					{tripFilter}
```

- [x] 6.3 `category-report-page.tsx`: imports, props e handler

```tsx
import {
	buildResetSearchParams,
	buildTripSearchParams,
	resolveTripRange,
} from "@/features/reports/lib/trip-range";
import type { TripPeriodRange } from "@/shared/lib/trips/period-ranges";
import type { TripOption } from "@/shared/lib/trips/queries";
import { TripFilterSelect } from "./trip-filter-select";
```

```tsx
interface CategoryReportPageProps {
	initialData: CategoryReportData;
	categories: CategoryOption[];
	initialFilters: FilterState;
	chartData: CategoryChartData;
	trips: TripOption[];
	tripRanges: Record<string, TripPeriodRange>;
	tripParam: string | null;
}
```

Desestruturar `trips, tripRanges, tripParam` e, depois de `handleTabChange`:

```tsx
	const handleTripChange = (nextTripParam: string | null) => {
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}
		const range = resolveTripRange(
			nextTripParam ? tripRanges[nextTripParam] : undefined,
			{ startPeriod: filters.startPeriod, endPeriod: filters.endPeriod },
		);
		setFilters({ ...filters, ...range });
		startTransition(() => {
			const search = buildTripSearchParams(
				searchParams.toString(),
				nextTripParam,
				range,
			);
			router.push(`?${search}`, { scroll: false });
		});
	};

	// "Limpar" also drops the trip: back to "Todos os lançamentos".
	const handleReset = (resetFilters: FilterState) => {
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}
		setFilters(resetFilters);
		startTransition(() => {
			const search = buildResetSearchParams(searchParams.toString(), {
				startPeriod: resetFilters.startPeriod,
				endPeriod: resetFilters.endPeriod,
			});
			router.push(`?${search}`, { scroll: false });
		});
	};
```

No `<CategoryReportFilters ... />`, acrescentar as props `onReset={handleReset}` e:

```tsx
				tripFilter={
					<TripFilterSelect
						trips={trips}
						value={tripParam}
						onChange={handleTripChange}
						disabled={isPending}
					/>
				}
```

- [x] 6.4 `src/app/(dashboard)/reports/category-trends/page.tsx`: imports

```ts
import { fetchTripPeriodRanges } from "@/shared/lib/trips/period-ranges";
import { fetchUserTrips } from "@/shared/lib/trips/queries";
import {
	parseTripFilterParam,
	TRIP_FILTER_PARAM,
	tripFilterToParam,
} from "@/shared/lib/trips/trip-filter-param";
```

Depois de `categoriasParam`: `const tripParamRaw = getSingleParam(resolvedSearchParams, TRIP_FILTER_PARAM);`. Trocar `const categoryRows = await fetchUserCategories(userId);` por:

```ts
	const [categoryRows, trips, tripRanges] = await Promise.all([
		fetchUserCategories(userId),
		fetchUserTrips(userId),
		fetchTripPeriodRanges(userId),
	]);
	const tripFilter = parseTripFilterParam(tripParamRaw, trips);
```

Em `filters`, acrescentar `tripFilter,`. Em `fetchCategoryChartData(...)`, passar `tripFilter` como 5º argumento. Em `<CategoryReportPage ... />`, acrescentar `trips={trips}`, `tripRanges={tripRanges}`, `tripParam={tripFilterToParam(tripFilter)}`.

- [x] 6.5 Verificar: `pnpm exec tsc --noEmit` (sem erros) e `pnpm exec vitest run src/features/reports src/shared/lib/trips` (PASS)

- [x] 6.6 Lint e commit

```bash
pnpm exec biome check src/features/reports/components/trip-filter-select.tsx src/features/reports/components/category-report-filters.tsx src/features/reports/components/category-report-page.tsx "src/app/(dashboard)/reports/category-trends/page.tsx"
git add src/features/reports/components/trip-filter-select.tsx src/features/reports/components/category-report-filters.tsx src/features/reports/components/category-report-page.tsx "src/app/(dashboard)/reports/category-trends/page.tsx"
git commit -m "feat(reports): seletor de viagem em tendencias por categoria" -- src/features/reports/components/trip-filter-select.tsx src/features/reports/components/category-report-filters.tsx src/features/reports/components/category-report-page.tsx "src/app/(dashboard)/reports/category-trends/page.tsx"
```

## 7. Seletor de viagem e rótulo em Estabelecimentos

**Files:**
- Create: `src/features/reports/components/establishments/trip-filter.tsx`
- Modify: `src/app/(dashboard)/reports/establishments/page.tsx`

**Interfaces:**
- Consumes: `TripFilterSelect` (Task 6); `fetchTopEstablishmentsData(..., tripFilter)` (Task 4); `parseTripFilterParam`, `tripFilterToParam`, `TRIP_FILTER_PARAM` (Task 1); `fetchUserTrips` (add-trips).
- Produces: `EstablishmentsTripFilter({ trips: TripOption[]; value: string | null })`.

Decisão de UI: com viagem específica, o card mostra `data.periodLabel` ("Viagem: Lisboa") no lugar de "Selecione o intervalo de meses" e esconde os botões 3/6/12 meses (não têm efeito). `PeriodFilterButtons` já preserva `viagem` porque parte de `searchParams.toString()`.

- [ ] 7.1 Criar o wrapper cliente

```tsx
// src/features/reports/components/establishments/trip-filter.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TripFilterSelect } from "@/features/reports/components/trip-filter-select";
import type { TripOption } from "@/shared/lib/trips/queries";
import { TRIP_FILTER_PARAM } from "@/shared/lib/trips/trip-filter-param";

type EstablishmentsTripFilterProps = {
	trips: TripOption[];
	value: string | null;
};

export function EstablishmentsTripFilter({
	trips,
	value,
}: EstablishmentsTripFilterProps) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const handleChange = (next: string | null) => {
		const params = new URLSearchParams(searchParams.toString());
		if (next) {
			params.set(TRIP_FILTER_PARAM, next);
		} else {
			params.delete(TRIP_FILTER_PARAM);
		}
		router.push(`/reports/establishments?${params.toString()}`);
	};

	return <TripFilterSelect trips={trips} value={value} onChange={handleChange} />;
}
```

- [ ] 7.2 `establishments/page.tsx`: imports

```ts
import { EstablishmentsTripFilter } from "@/features/reports/components/establishments/trip-filter";
import { fetchUserTrips } from "@/shared/lib/trips/queries";
import {
	parseTripFilterParam,
	TRIP_FILTER_PARAM,
	tripFilterToParam,
} from "@/shared/lib/trips/trip-filter-param";
```

Em `EstablishmentsContent`, depois de `periodFilter`:

```ts
	const trips = await fetchUserTrips(user.id);
	const tripFilter = parseTripFilterParam(
		getSingleParam(resolvedSearchParams, TRIP_FILTER_PARAM),
		trips,
	);

	const data = await fetchTopEstablishmentsData(
		user.id,
		currentPeriod,
		periodFilter,
		tripFilter,
	);
```

(substitui a chamada atual de `fetchTopEstablishmentsData`). Trocar o primeiro `<Card>` por:

```tsx
			<Card className="flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
				<span className="text-sm text-muted-foreground">
					{tripFilter.kind === "trip"
						? data.periodLabel
						: "Selecione o intervalo de meses"}
				</span>
				<div className="flex flex-col gap-2 md:flex-row md:items-center">
					<EstablishmentsTripFilter
						trips={trips}
						value={tripFilterToParam(tripFilter)}
					/>
					{tripFilter.kind === "trip" ? null : (
						<PeriodFilterButtons currentFilter={periodFilter} />
					)}
				</div>
			</Card>
```

- [ ] 7.3 Verificar: `pnpm exec tsc --noEmit` e `pnpm exec vitest run src/features/reports` (PASS)

- [ ] 7.4 Lint e commit

```bash
pnpm exec biome check src/features/reports/components/establishments/trip-filter.tsx "src/app/(dashboard)/reports/establishments/page.tsx"
git add src/features/reports/components/establishments/trip-filter.tsx "src/app/(dashboard)/reports/establishments/page.tsx"
git commit -m "feat(reports): seletor de viagem em estabelecimentos" -- src/features/reports/components/establishments/trip-filter.tsx "src/app/(dashboard)/reports/establishments/page.tsx"
```

## 8. Versão e verificação final

**Files:**
- Modify: `CHANGELOG.md` (nova seção no topo, acima da versão de `add-trips`)
- Modify: `package.json` (`version`)
- Modify: `README.md:13` (badge)

**Interfaces:**
- Consumes: tudo acima.
- Produces: versão minor `2.13.0`.

Versão: hoje o repo está em `2.11.5`; `add-trips` sobe minor para `2.12.0`; esta change sobe para `2.13.0`. Leia `package.json` antes: se não estiver em `2.12.0`, pare e pergunte (AGENTS.md regra 6). Não criar nem enviar tag.

- [ ] 8.1 Garantir que Uso de cartões e Análise de parcelas não mudaram: `git diff --stat main...HEAD -- src/features/reports/lib/cards-report-queries.ts src/features/reports/components/cards "src/app/(dashboard)/reports/card-usage" "src/app/(dashboard)/reports/installment-analysis"` (esperado: saída vazia). Se a branch é a própria `main`, use o hash do commit anterior à Task 1 no lugar de `main`.

- [ ] 8.2 `package.json`: `"version": "2.13.0"`. `README.md`: badge `version-2.13.0-blue`. `CHANGELOG.md`, logo abaixo do parágrafo de formato, com a data do dia (`date +%F`):

```markdown
## [2.13.0] - <data do dia, YYYY-MM-DD>

Com as viagens vinculadas aos lançamentos, os relatórios passam a separar o gasto de viagem do gasto do dia a dia. Tendências por categoria e Estabelecimentos ganham o seletor "Viagem": dá para ver como uma viagem se espalhou pelas faturas, categoria por categoria, ou tirar todas as viagens da conta para enxergar o mês "normal". Escolher uma viagem em Tendências ajusta De/Até para cobrir todas as parcelas dela; em Estabelecimentos, mostra a viagem inteira, sem o corte de meses.

### Adicionado

- Seletor "Viagem" em Relatórios › Tendências por categoria e Relatórios › Estabelecimentos, com "Todos os lançamentos", "Sem viagens" e uma entrada por viagem
- Escolha de viagem guardada no endereço da página (`viagem=<id>` ou `viagem=sem`), junto com os demais filtros
- Em Tendências, escolher uma viagem ajusta De/Até para o primeiro e o último mês com lançamentos dela (até 24 meses)
- Em Estabelecimentos, uma viagem específica ignora a janela de meses e mostra "Viagem: <nome>"
- "Limpar" em Tendências também volta a viagem para "Todos os lançamentos"
```

- [ ] 8.3 Portão completo: `pnpm exec tsc --noEmit`, `pnpm exec vitest run --maxWorkers=4` e `pnpm exec biome check <todos os arquivos alterados nesta change>` (lista de `git diff --name-only <commit anterior à Task 1>..HEAD` + os três arquivos desta task). Todos verdes.

- [ ] 8.4 Commit

```bash
git add CHANGELOG.md package.json README.md
git commit -m "chore: preparar versao 2.13.0" -- CHANGELOG.md package.json README.md
```

- [ ] 8.5 `graphify update .` (AGENTS.md, seção graphify), se o comando existir no ambiente; não commitar `graphify-out/` se estiver no `.gitignore`.
