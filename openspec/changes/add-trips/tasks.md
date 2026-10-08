# Viagens (add-trips) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execução padrão neste repo: skill `executar-plano` (sdd.js).

**Goal:** Cadastrar viagens, vincular lançamentos a elas (diálogo, sugestões em lote, parcelas e divisão inteiras ao vincular, desvínculo por linha) e mostrar o custo líquido da viagem com quebras.

**Architecture:** Nova tabela `viagens` e coluna `lancamentos.viagem_id`. Tudo que `transactions` e `reports` precisam (lista de viagens, elegibilidade, propagação do vínculo) mora em `src/shared/lib/trips/`; a feature `src/features/trips/` tem CRUD, queries de lista/detalhe, resumo e as páginas. O diálogo de lançamento busca as viagens sozinho por server action, sem prop drilling nos seis chamadores.

**Tech Stack:** Next.js 16.3 (App Router, `params` é `Promise`), React 19, Drizzle 0.45 + Postgres, Zod 4, Vitest 4, Biome 2, pnpm.

**Spec:** `openspec/changes/add-trips/specs/trips/spec.md` (com `proposal.md` e `design.md` da mesma pasta; decisões D1 a D8 são citadas pelo número).

## Global Constraints

- Contrato fixo (o plano `add-trip-report-filter` depende destes nomes, não renomear): `trips = pgTable("viagens", { id, userId "user_id", name "nome", startDate "data_inicio" (date, mode date), endDate "data_fim" (date, mode date), note "anotacao", createdAt "created_at" })`; `transactions.tripId = uuid("viagem_id").references(() => trips.id, { onDelete: "set null" })`; índice `(user_id, viagem_id)`; tipo `Trip`.
- Contrato fixo: `src/shared/lib/trips/queries.ts` exporta `fetchUserTrips(userId: string): Promise<TripOption[]>`, `TripOption = { id: string; name: string; startDate: string; endDate: string }` (datas `YYYY-MM-DD`), ordem `startDate desc`.
- Contrato fixo: feature em `src/features/trips/`, rotas `src/app/(dashboard)/trips/page.tsx` e `src/app/(dashboard)/trips/[tripId]/page.tsx`, entidade de revalidação `"trips"`.
- Toda query filtra por `userId` (AGENTS.md regra 1). Admin via `getAdminPayerId(userId)` de `src/shared/lib/payers/get-admin-id.ts`, nunca JOIN em `payers` para descobrir o admin.
- Features não importam outras features: `transactions` e `trips` só se encontram via `src/shared/lib/trips/`.
- Elegível para viagem (D5): `transactionType !== "Transferência"`, `transfer_id IS NULL` e nota não começando com `AUTO_FATURA:` (`ACCOUNT_AUTO_INVOICE_NOTE_PREFIX`). Nota nula é elegível.
- Valores: `numeric(12,2)`, sinal no banco (Despesa negativa, Receita positiva). Somas em centavos inteiros.
- Datas: gravar com `parseLocalDateString` (padrão dos lançamentos), ler com `toDateOnlyString`, ambos de `src/shared/utils/date.ts`. Intervalos inclusivos nas duas pontas.
- Copy de UI em PT-BR; identificadores e comentários em inglês. Mensagens de erro do servidor: genéricas, sem stack.
- Não há harness de banco nos testes: o padrão do repo (`reconciliation-action.test.ts`) é `vi.mock("@/shared/lib/db")`. Condições SQL são verificadas renderizando com `new PgDialect().sqlToQuery(...)` de `drizzle-orm/pg-core`. Não há React Testing Library: componentes são verificados por `tsc` e lint; a lógica deles fica em funções puras testadas.
- Lint local: `biome check .` falha em tudo por CRLF. Rodar por arquivo: `pnpm exec biome check --formatter-enabled=false <arquivos>`.
- Commits em PT-BR, estilo `feat(trips): ...`, por pathspec (só os arquivos da task).

## Review Focus

1. `tripId` de viagem de outro usuário enviado ao criar/editar lançamento ou ao vincular em lote: deve ser rejeitado com "Viagem não encontrada." e nada gravado. Testes nas Tasks 4, 9, 13 e 14.
2. Data de fim anterior à de início, ou data inválida (`2026-02-31`): rejeitada com mensagem clara. Teste na Task 7.
3. Limites inclusivos: compra no último dia da viagem pré-preenche a viagem; nova viagem começando no dia em que outra termina é sobreposição. Testes nas Tasks 3 e 7.
4. Lançamento do tipo Transferência (criado ou editado pelo diálogo) com `tripId` no payload: nunca fica vinculado. Testes nas Tasks 3, 5 e 12.
5. Usuário sem pessoa admin (`getAdminPayerId` nulo): página da viagem abre com total zero em vez de quebrar. Teste na Task 10.

---

### Task 1: Schema da viagem e coluna viagem_id

**Depends:** nenhuma.

**Files:**
- Modify: `src/db/schema.ts` (nova tabela antes de `// ===================== TRANSACTIONS =====================` ~linha 630; coluna e índice em `transactions` ~linhas 632-745; relations em `userRelations` ~linha 747 e `transactionsRelations` ~linha 892; tipo `Trip` junto dos tipos ~linha 1060)
- Test: `src/db/schema.trips.test.ts`

**Interfaces:**
- Produces: `trips` (pgTable `viagens`), `Trip = typeof trips.$inferSelect`, `transactions.tripId`, índices `viagens_user_id_data_inicio_idx` e `lancamentos_user_id_viagem_id_idx`, relation `transactionsRelations.trip`.

- [x] **Step 1: Escrever o teste que falha**

```ts
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { transactions, trips } from "./schema";

describe("trips schema", () => {
	it("mapeia a tabela viagens com as colunas do contrato", () => {
		const config = getTableConfig(trips);
		expect(config.name).toBe("viagens");

		const byName = new Map(config.columns.map((column) => [column.name, column]));
		expect([...byName.keys()]).toEqual(
			expect.arrayContaining([
				"id",
				"user_id",
				"nome",
				"data_inicio",
				"data_fim",
				"anotacao",
				"created_at",
			]),
		);
		for (const required of ["user_id", "nome", "data_inicio", "data_fim"]) {
			expect(byName.get(required)?.notNull).toBe(true);
		}
		expect(byName.get("anotacao")?.notNull).toBe(false);

		const userFk = config.foreignKeys.find(
			(fk) => fk.reference().columns[0]?.name === "user_id",
		);
		expect(userFk?.onDelete).toBe("cascade");
	});

	it("lancamentos.viagem_id solta o lançamento quando a viagem é excluída", () => {
		const config = getTableConfig(transactions);

		const tripColumn = config.columns.find((column) => column.name === "viagem_id");
		expect(tripColumn).toBeDefined();
		expect(tripColumn?.notNull).toBe(false);

		const tripFk = config.foreignKeys.find(
			(fk) => fk.reference().columns[0]?.name === "viagem_id",
		);
		expect(tripFk?.onDelete).toBe("set null");
		const foreignTable = tripFk?.reference().foreignTable;
		expect(foreignTable ? getTableConfig(foreignTable).name : null).toBe("viagens");

		const index = config.indexes.find(
			(idx) => idx.config.name === "lancamentos_user_id_viagem_id_idx",
		);
		expect(
			index?.config.columns.map((column) => ("name" in column ? column.name : "")),
		).toEqual(["user_id", "viagem_id"]);
	});
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/db/schema.trips.test.ts`
Expected: FAIL (`trips` não exportado / `viagem_id` ausente).

- [x] **Step 3: Implementar**

Antes do bloco de `transactions`:

```ts
// ===================== TRIPS =====================

export const trips = pgTable(
	"viagens",
	{
		id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("nome").notNull(),
		startDate: date("data_inicio", { mode: "date" }).notNull(),
		endDate: date("data_fim", { mode: "date" }).notNull(),
		note: text("anotacao"),
		createdAt: timestamp("created_at", {
			mode: "date",
			withTimezone: true,
		})
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		userIdStartDateIdx: index("viagens_user_id_data_inicio_idx").on(
			table.userId,
			table.startDate,
		),
	}),
);
```

Em `transactions`, depois de `importBatchId`:

```ts
		tripId: uuid("viagem_id").references(() => trips.id, {
			onDelete: "set null",
		}),
```

No callback de índices de `transactions`, depois de `userIdSplitGroupIdIdx`:

```ts
		// Índice para o recorte por viagem (userId + tripId)
		userIdTripIdIdx: index("lancamentos_user_id_viagem_id_idx").on(
			table.userId,
			table.tripId,
		),
```

Relations: em `userRelations` acrescentar `trips: many(trips),`. Em `transactionsRelations` acrescentar:

```ts
		trip: one(trips, {
			fields: [transactions.tripId],
			references: [trips.id],
		}),
```

Nova relation logo após `transactionsRelations`:

```ts
export const tripsRelations = relations(trips, ({ one, many }) => ({
	user: one(user, {
		fields: [trips.userId],
		references: [user.id],
	}),
	transactions: many(transactions),
}));
```

Tipo, junto de `export type Transaction`:

```ts
export type Trip = typeof trips.$inferSelect;
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/db/schema.trips.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc sem erros.

- [x] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/schema.trips.test.ts
git commit -m "feat(trips): tabela viagens e coluna viagem_id em lancamentos" -- src/db/schema.ts src/db/schema.trips.test.ts
```

---

### Task 2: Migração Drizzle

**Depends:** Task 1.

**Files:**
- Create: `drizzle/0037_<nome-gerado>.sql`, `drizzle/meta/0037_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: schema da Task 1.
- Produces: migração aplicável por `pnpm run db:migrate` (o deploy roda as migrações).

- [x] **Step 1: Gerar**

Run: `pnpm run db:generate`
Se o drizzle-kit reclamar da URL ausente: `DATABASE_URL=postgres://x:x@localhost:5432/x pnpm run db:generate` (generate não conecta).

- [x] **Step 2: Conferir o SQL gerado**

Run: `grep -E 'CREATE TABLE "viagens"|ADD COLUMN "viagem_id" uuid|ON DELETE set null|lancamentos_user_id_viagem_id_idx|viagens_user_id_data_inicio_idx' drizzle/0037_*.sql`
Expected: as cinco ocorrências presentes. Se o arquivo trouxer qualquer statement além de `viagens`, `viagem_id`, suas FKs e os dois índices, PARE e reporte (drift de snapshot, não corrigir aqui).

- [x] **Step 3: Commit**

```bash
git add drizzle/
git commit -m "feat(trips): migracao da tabela viagens" -- drizzle/
```

---

### Task 3: Elegibilidade e viagem da data (shared, puro)

**Depends:** Task 1.

**Files:**
- Create: `src/shared/lib/trips/types.ts`
- Create: `src/shared/lib/trips/find-trip-for-date.ts`
- Create: `src/shared/lib/trips/eligibility.ts`
- Test: `src/shared/lib/trips/eligibility.test.ts`

**Interfaces:**
- Produces:
  - `type TripOption = { id: string; name: string; startDate: string; endDate: string }`
  - `findTripForDate(trips: TripOption[], date: string): TripOption | undefined`
  - `isTripEligible(row: { transactionType: string; note: string | null | undefined }): boolean`
  - `tripEligibleCondition(): SQL` (condição Drizzle sobre `transactions`)

- [x] **Step 1: Escrever o teste que falha**

```ts
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { isTripEligible, tripEligibleCondition } from "./eligibility";
import { findTripForDate } from "./find-trip-for-date";
import type { TripOption } from "./types";

const lisboa: TripOption = {
	id: "trip-lisboa",
	name: "Lisboa",
	startDate: "2026-05-12",
	endDate: "2026-05-22",
};
const santiago: TripOption = {
	id: "trip-santiago",
	name: "Santiago",
	startDate: "2026-09-01",
	endDate: "2026-09-01",
};

describe("findTripForDate", () => {
	it.each([
		["2026-05-14", "trip-lisboa"],
		["2026-05-12", "trip-lisboa"],
		["2026-05-22", "trip-lisboa"],
		["2026-09-01", "trip-santiago"],
		["2026-05-11", undefined],
		["2026-05-23", undefined],
		["", undefined],
		["14/05/2026", undefined],
	])("data %s cai na viagem %s", (date, expected) => {
		expect(findTripForDate([lisboa, santiago], date)?.id).toBe(expected);
	});
});

describe("isTripEligible", () => {
	it.each([
		[{ transactionType: "Despesa", note: null }, true],
		[{ transactionType: "Receita", note: "reembolso" }, true],
		[{ transactionType: "Transferência", note: null }, false],
		[{ transactionType: "Despesa", note: "AUTO_FATURA:card:2026-06" }, false],
		[{ transactionType: "Receita", note: "AUTO_FATURA:card:2026-06:ab12" }, false],
	])("%o -> %s", (row, expected) => {
		expect(isTripEligible(row)).toBe(expected);
	});
});

describe("tripEligibleCondition", () => {
	it("exclui transferências e AUTO_FATURA sem descartar nota nula", () => {
		const query = new PgDialect().sqlToQuery(tripEligibleCondition());
		expect(query.sql).toContain('"transfer_id" is null');
		expect(query.sql).toContain('"tipo_transacao" <>');
		expect(query.sql).toContain('"anotacao" is null');
		expect(query.sql).toContain('"anotacao" not like');
		expect(query.params).toEqual(
			expect.arrayContaining(["Transferência", "AUTO_FATURA:%"]),
		);
	});
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/shared/lib/trips/eligibility.test.ts`
Expected: FAIL (módulos inexistentes).

- [x] **Step 3: Implementar**

`src/shared/lib/trips/types.ts`:

```ts
export type TripOption = {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
};
```

`src/shared/lib/trips/find-trip-for-date.ts` (puro, importável no cliente):

```ts
import type { TripOption } from "./types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Trips never overlap (D2), so at most one trip contains a given date.
export function findTripForDate(
	trips: TripOption[],
	date: string,
): TripOption | undefined {
	if (!DATE_ONLY.test(date)) return undefined;
	return trips.find((trip) => trip.startDate <= date && date <= trip.endDate);
}
```

`src/shared/lib/trips/eligibility.ts`:

```ts
import { and, isNull, ne, notLike, or, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";

const TRANSFER_TRANSACTION_TYPE = "Transferência";

// Transfers and invoice payment/credit lines would double count card purchases (D5).
export function isTripEligible(row: {
	transactionType: string;
	note: string | null | undefined;
}): boolean {
	if (row.transactionType === TRANSFER_TRANSACTION_TYPE) return false;
	return !(row.note ?? "").startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX);
}

export function tripEligibleCondition(): SQL {
	return and(
		isNull(transactions.transferId),
		ne(transactions.transactionType, TRANSFER_TRANSACTION_TYPE),
		or(
			isNull(transactions.note),
			notLike(transactions.note, `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`),
		),
	) as SQL;
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/shared/lib/trips/eligibility.test.ts`
Expected: PASS. Se o texto renderizado diferir só em aspas/qualificação (`"lancamentos"."transfer_id" is null`), os `toContain` acima continuam valendo; não afrouxar as asserções.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(trips): elegibilidade e viagem da data em shared" -- src/shared/lib/trips/
```

---

### Task 4: Queries compartilhadas de viagem e action do diálogo

**Depends:** Task 3.

**Files:**
- Create: `src/shared/lib/trips/queries.ts`
- Create: `src/shared/lib/trips/actions.ts`
- Test: `src/shared/lib/trips/queries.test.ts`

**Interfaces:**
- Consumes: `TripOption` (Task 3), `trips` (Task 1).
- Produces:
  - `fetchUserTrips(userId: string): Promise<TripOption[]>` (contrato)
  - `isTripOwnedByUser(userId: string, tripId: string): Promise<boolean>`
  - `TRIP_NOT_FOUND_MESSAGE = "Viagem não encontrada."`
  - `validateTripOwnership(userId: string, tripId: string | null | undefined): Promise<string | null>` (null = ok)
  - `fetchTripOptionsAction(): Promise<TripOption[]>` (`"use server"`, em `actions.ts`)
  - `queries.ts` reexporta `type TripOption`.

- [x] **Step 1: Escrever o teste que falha**

```ts
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	type Chain = Promise<unknown[]> & {
		from: () => Chain;
		where: (condition: unknown) => Chain;
		orderBy: () => Chain;
		limit: () => Chain;
	};
	const queue: unknown[][] = [];
	const wheres: unknown[] = [];
	const select = () => {
		const chain: Chain = Object.assign(Promise.resolve(queue.shift() ?? []), {
			from: () => chain,
			where: (condition: unknown) => {
				wheres.push(condition);
				return chain;
			},
			orderBy: () => chain,
			limit: () => chain,
		});
		return chain;
	};
	return { queue, wheres, dbMock: { select }, getUserIdMock: vi.fn() };
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/auth/server", () => ({ getUserId: mocks.getUserIdMock }));

import { fetchTripOptionsAction } from "./actions";
import {
	fetchUserTrips,
	TRIP_NOT_FOUND_MESSAGE,
	validateTripOwnership,
} from "./queries";

const USER_ID = "user-1";
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);

beforeEach(() => {
	mocks.queue.length = 0;
	mocks.wheres.length = 0;
	mocks.getUserIdMock.mockResolvedValue(USER_ID);
});

describe("fetchUserTrips", () => {
	it("devolve datas YYYY-MM-DD e filtra por userId", async () => {
		mocks.queue.push([
			{
				id: "t1",
				name: "Lisboa",
				startDate: new Date(Date.UTC(2026, 4, 12)),
				endDate: new Date(Date.UTC(2026, 4, 22)),
			},
		]);

		const result = await fetchUserTrips(USER_ID);

		expect(result).toEqual([
			{ id: "t1", name: "Lisboa", startDate: "2026-05-12", endDate: "2026-05-22" },
		]);
		const where = render(mocks.wheres[0]);
		expect(where.sql).toContain('"user_id" = $1');
		expect(where.params).toEqual([USER_ID]);
	});
});

describe("validateTripOwnership", () => {
	it("aceita ausência de viagem sem consultar o banco", async () => {
		expect(await validateTripOwnership(USER_ID, null)).toBeNull();
		expect(await validateTripOwnership(USER_ID, undefined)).toBeNull();
		expect(mocks.wheres).toHaveLength(0);
	});

	it("rejeita viagem que não é do usuário", async () => {
		mocks.queue.push([]);
		expect(await validateTripOwnership(USER_ID, "t-outro")).toBe(
			TRIP_NOT_FOUND_MESSAGE,
		);
		const where = render(mocks.wheres[0]);
		expect(where.params).toEqual(expect.arrayContaining([USER_ID, "t-outro"]));
	});

	it("aceita viagem do usuário", async () => {
		mocks.queue.push([{ id: "t1" }]);
		expect(await validateTripOwnership(USER_ID, "t1")).toBeNull();
	});
});

describe("fetchTripOptionsAction", () => {
	it("usa o usuário da sessão", async () => {
		mocks.queue.push([]);
		await fetchTripOptionsAction();
		expect(render(mocks.wheres[0]).params).toEqual([USER_ID]);
	});
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/shared/lib/trips/queries.test.ts`
Expected: FAIL (módulos inexistentes).

- [x] **Step 3: Implementar**

`src/shared/lib/trips/queries.ts`:

```ts
import { and, desc, eq } from "drizzle-orm";
import { trips } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { toDateOnlyString } from "@/shared/utils/date";
import type { TripOption } from "./types";

export type { TripOption } from "./types";

export const TRIP_NOT_FOUND_MESSAGE = "Viagem não encontrada.";

export async function fetchUserTrips(userId: string): Promise<TripOption[]> {
	const rows = await db
		.select({
			id: trips.id,
			name: trips.name,
			startDate: trips.startDate,
			endDate: trips.endDate,
		})
		.from(trips)
		.where(eq(trips.userId, userId))
		.orderBy(desc(trips.startDate));

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		startDate: toDateOnlyString(row.startDate) ?? "",
		endDate: toDateOnlyString(row.endDate) ?? "",
	}));
}

export async function isTripOwnedByUser(
	userId: string,
	tripId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: trips.id })
		.from(trips)
		.where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
		.limit(1);
	return Boolean(row);
}

export async function validateTripOwnership(
	userId: string,
	tripId: string | null | undefined,
): Promise<string | null> {
	if (!tripId) return null;
	return (await isTripOwnedByUser(userId, tripId))
		? null
		: TRIP_NOT_FOUND_MESSAGE;
}
```

`src/shared/lib/trips/actions.ts`:

```ts
"use server";

import { getUserId } from "@/shared/lib/auth/server";
import { fetchUserTrips } from "./queries";
import type { TripOption } from "./types";

export async function fetchTripOptionsAction(): Promise<TripOption[]> {
	const userId = await getUserId();
	return fetchUserTrips(userId);
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/shared/lib/trips/queries.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(trips): queries compartilhadas de viagem" -- src/shared/lib/trips/queries.ts src/shared/lib/trips/actions.ts src/shared/lib/trips/queries.test.ts
```

---

### Task 5: Vincular propaga para parcelas e divisão; desvincular é por linha

**Depends:** Task 3.

**Files:**
- Create: `src/shared/lib/trips/link.ts`
- Test: `src/shared/lib/trips/link.test.ts`

**Interfaces:**
- Consumes: `tripEligibleCondition()` (Task 3).
- Produces:
  - `type TripLinkRow = { id: string; condition: string; seriesId: string | null; splitGroupId: string | null }`
  - `type TripLinkScope = { ids: string[]; seriesIds: string[]; splitGroupIds: string[] }`
  - `expandTripLinkScope(rows: TripLinkRow[]): TripLinkScope` (série só de `condition === "Parcelado"`; recorrente fica só na linha)
  - `setTripForTransactions(executor: TripLinkExecutor, userId: string, transactionIds: string[], tripId: string | null): Promise<number>` (devolve quantas linhas mudaram; `executor` é `db` ou o `tx` de `db.transaction`). Com `tripId` string: vincula expandindo para parcelas e grupo de divisão (D4). Com `tripId` null: desvincula **só** os ids recebidos. Não valida posse da viagem: quem chama usa `validateTripOwnership` antes.

- [x] **Step 1: Escrever o teste que falha**

```ts
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import { expandTripLinkScope, setTripForTransactions, type TripLinkRow } from "./link";

const USER_ID = "user-1";
const TRIP_ID = "trip-lisboa";
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);

describe("expandTripLinkScope", () => {
	it("série só de parcelado; recorrente fica na ocorrência; grupos deduplicados", () => {
		expect(
			expandTripLinkScope([
				{ id: "a", condition: "Parcelado", seriesId: "s1", splitGroupId: "g1" },
				{ id: "b", condition: "Parcelado", seriesId: "s1", splitGroupId: null },
				{ id: "c", condition: "À vista", seriesId: null, splitGroupId: "g2" },
				{ id: "n", condition: "Recorrente", seriesId: "netflix", splitGroupId: null },
			]),
		).toEqual({
			ids: ["a", "b", "c", "n"],
			seriesIds: ["s1"],
			splitGroupIds: ["g1", "g2"],
		});
	});
});

describe("setTripForTransactions", () => {
	let selectRows: TripLinkRow[];
	let captured: { selectWhere?: unknown; set?: unknown; updateWhere?: unknown };
	let selectCalls: number;

	const executor = {
		select: () => ({
			from: () => ({
				where: (condition: unknown) => {
					selectCalls += 1;
					captured.selectWhere = condition;
					return Promise.resolve(selectRows);
				},
			}),
		}),
		update: () => ({
			set: (values: unknown) => {
				captured.set = values;
				return {
					where: (condition: unknown) => {
						captured.updateWhere = condition;
						return {
							returning: () =>
								Promise.resolve(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` }))),
						};
					},
				};
			},
		}),
	} as unknown as Parameters<typeof setTripForTransactions>[0];

	beforeEach(() => {
		selectRows = [];
		captured = {};
		selectCalls = 0;
	});

	it("vincular a parcela 1/10 vincula a série inteira", async () => {
		selectRows = [
			{ id: "parcela-1", condition: "Parcelado", seriesId: "serie-tap", splitGroupId: null },
		];

		const count = await setTripForTransactions(executor, USER_ID, ["parcela-1"], TRIP_ID);

		expect(count).toBe(10);
		expect(captured.set).toEqual({ tripId: TRIP_ID });
		const where = render(captured.updateWhere);
		expect(where.sql).toContain('"series_id" in');
		expect(where.sql).toContain('"user_id" =');
		expect(where.sql).toContain('"transfer_id" is null');
		expect(where.params).toEqual(
			expect.arrayContaining([USER_ID, "parcela-1", "serie-tap"]),
		);
	});

	it("vincular a Netflix de maio (recorrente) vincula só a ocorrência", async () => {
		selectRows = [
			{ id: "netflix-maio", condition: "Recorrente", seriesId: "serie-netflix", splitGroupId: null },
		];

		await setTripForTransactions(executor, USER_ID, ["netflix-maio"], TRIP_ID);

		const where = render(captured.updateWhere);
		expect(where.sql).not.toContain('"series_id"');
		expect(where.params).not.toContain("serie-netflix");
		expect(where.params).toEqual(expect.arrayContaining(["netflix-maio"]));
	});

	it("vincular a parte do admin num jantar dividido vincula o grupo", async () => {
		selectRows = [
			{ id: "jantar-admin", condition: "À vista", seriesId: null, splitGroupId: "grupo-jantar" },
		];

		await setTripForTransactions(executor, USER_ID, ["jantar-admin"], TRIP_ID);

		const where = render(captured.updateWhere);
		expect(where.sql).toContain('"split_group_id" in');
		expect(where.params).toEqual(expect.arrayContaining(["grupo-jantar"]));
	});

	it("desvincular a parcela 7/10 solta só ela", async () => {
		selectRows = [
			{ id: "parcela-7", condition: "Parcelado", seriesId: "serie-tap", splitGroupId: "grupo-7" },
		];

		await setTripForTransactions(executor, USER_ID, ["parcela-7"], null);

		expect(captured.set).toEqual({ tripId: null });
		const where = render(captured.updateWhere);
		expect(where.sql).not.toContain('"series_id"');
		expect(where.sql).not.toContain('"split_group_id"');
		expect(where.sql).toContain('"user_id" =');
		expect(where.params).toEqual(expect.arrayContaining([USER_ID, "parcela-7"]));
		expect(where.params).not.toContain("serie-tap");
		expect(where.params).not.toContain("grupo-7");
	});

	it("a busca inicial filtra por userId e elegibilidade", async () => {
		selectRows = [{ id: "a", condition: "À vista", seriesId: null, splitGroupId: null }];
		await setTripForTransactions(executor, USER_ID, ["a"], TRIP_ID);
		const where = render(captured.selectWhere);
		expect(where.sql).toContain('"user_id" =');
		expect(where.sql).toContain('"anotacao" not like');
	});

	it("lista vazia não consulta o banco", async () => {
		expect(await setTripForTransactions(executor, USER_ID, [], TRIP_ID)).toBe(0);
		expect(selectCalls).toBe(0);
	});

	it("nenhuma linha elegível do usuário não atualiza nada", async () => {
		selectRows = [];
		expect(await setTripForTransactions(executor, USER_ID, ["x"], TRIP_ID)).toBe(0);
		expect(captured.set).toBeUndefined();
	});
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/shared/lib/trips/link.test.ts`
Expected: FAIL (módulo inexistente).

- [x] **Step 3: Implementar**

```ts
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";
import type { db } from "@/shared/lib/db";
import { tripEligibleCondition } from "./eligibility";

export type TripLinkExecutor = Pick<typeof db, "select" | "update">;

export type TripLinkRow = {
	id: string;
	condition: string;
	seriesId: string | null;
	splitGroupId: string | null;
};

export type TripLinkScope = {
	ids: string[];
	seriesIds: string[];
	splitGroupIds: string[];
};

const INSTALLMENT_CONDITION = "Parcelado";

const unique = (values: Array<string | null>) => [
	...new Set(values.filter((value): value is string => Boolean(value))),
];

// Installments link as a whole series; recurring rows (rent, subscriptions) link
// only the occurrence; split shares link as a whole group (D4).
export function expandTripLinkScope(rows: TripLinkRow[]): TripLinkScope {
	return {
		ids: unique(rows.map((row) => row.id)),
		seriesIds: unique(
			rows.map((row) => (row.condition === INSTALLMENT_CONDITION ? row.seriesId : null)),
		),
		splitGroupIds: unique(rows.map((row) => row.splitGroupId)),
	};
}

// Linking expands to installments and split groups; unlinking (tripId null)
// touches only the given rows, so a single installment can leave the trip (D4).
export async function setTripForTransactions(
	executor: TripLinkExecutor,
	userId: string,
	transactionIds: string[],
	tripId: string | null,
): Promise<number> {
	if (transactionIds.length === 0) return 0;

	const rows = await executor
		.select({
			id: transactions.id,
			condition: transactions.condition,
			seriesId: transactions.seriesId,
			splitGroupId: transactions.splitGroupId,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				inArray(transactions.id, transactionIds),
				tripEligibleCondition(),
			),
		);

	if (rows.length === 0) return 0;

	const scope = expandTripLinkScope(rows);
	const targets: SQL[] = [inArray(transactions.id, scope.ids)];
	if (tripId !== null) {
		if (scope.seriesIds.length > 0) {
			targets.push(inArray(transactions.seriesId, scope.seriesIds));
		}
		if (scope.splitGroupIds.length > 0) {
			targets.push(inArray(transactions.splitGroupId, scope.splitGroupIds));
		}
	}

	const updated = await executor
		.update(transactions)
		.set({ tripId })
		.where(
			and(eq(transactions.userId, userId), tripEligibleCondition(), or(...targets)),
		)
		.returning({ id: transactions.id });

	return updated.length;
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/shared/lib/trips/link.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc limpo.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(trips): vinculo propaga para parcelas e divisao, desvinculo por linha" -- src/shared/lib/trips/link.ts src/shared/lib/trips/link.test.ts
```

---

### Task 6: Revalidação da entidade trips e item no menu

**Depends:** nenhuma.

**Files:**
- Modify: `src/shared/lib/actions/helpers.ts` (`revalidateConfig`, ~linhas 26-38)
- Modify: `src/shared/components/navigation/navbar/nav-items.tsx` (import de ícone e seção "Organização")
- Test: `src/shared/lib/actions/helpers.trips.test.ts`

**Interfaces:**
- Produces: `revalidateForEntity("trips", userId)` revalida `/trips` e `/transactions`; `transactions` passa a revalidar também `/trips`. Item de menu `/trips` "Viagens".

- [x] **Step 1: Escrever o teste que falha**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/cache", () => mocks);

import { NAV_SECTIONS } from "@/shared/components/navigation/navbar/nav-items";
import { revalidateForEntity } from "./helpers";

beforeEach(() => vi.clearAllMocks());

describe("revalidateForEntity trips", () => {
	it("revalida a lista de viagens e os lançamentos", () => {
		revalidateForEntity("trips", "user-1");
		const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
		expect(paths).toEqual(expect.arrayContaining(["/trips", "/transactions"]));
	});

	it("editar lançamento também revalida viagens", () => {
		revalidateForEntity("transactions", "user-1");
		const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
		expect(paths).toContain("/trips");
	});
});

describe("menu", () => {
	it("tem o item Viagens em Organização", () => {
		const organizacao = NAV_SECTIONS.find((section) => section.label === "Organização");
		expect(organizacao?.items.map((item) => item.href)).toContain("/trips");
	});
});
```

Se importar `nav-items.tsx` (JSX) no vitest falhar por transformação, mova o terceiro bloco para fora do teste e verifique o menu só por `tsc`; não altere `vitest.config.mts`.

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/shared/lib/actions/helpers.trips.test.ts`
Expected: FAIL (`"trips"` não é chave de `revalidateConfig`).

- [x] **Step 3: Implementar**

Em `revalidateConfig`:

```ts
	transactions: ["/transactions", "/accounts", "/attachments", "/trips"],
	inbox: ["/inbox", "/transactions", "/dashboard"],
	attachments: ["/attachments"],
	trips: ["/trips", "/transactions"],
```

Em `nav-items.tsx`, importar `RiPlaneLine` (ordem alfabética do bloco de imports) e acrescentar em "Organização", depois de "Anotações":

```tsx
			{
				href: "/trips",
				label: "Viagens",
				description: "Gastos agrupados por viagem",
				icon: <RiPlaneLine className="size-4" />,
				iconClass: "text-primary",
			},
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/shared/lib/actions/helpers.trips.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(trips): revalidacao e item Viagens no menu" -- src/shared/lib/actions/helpers.ts src/shared/components/navigation/navbar/nav-items.tsx src/shared/lib/actions/helpers.trips.test.ts
```

---

### Task 7: Validação de viagem e sobreposição (puro)

**Depends:** Task 3.

**Files:**
- Create: `src/features/trips/lib/schemas.ts`
- Create: `src/features/trips/lib/overlap.ts`
- Test: `src/features/trips/lib/overlap.test.ts`

**Interfaces:**
- Consumes: `TripOption` (Task 3).
- Produces:
  - `createTripSchema`, `updateTripSchema` (com `id`), `deleteTripSchema` (`{ id }`)
  - `type CreateTripInput = z.input<typeof createTripSchema>`, `UpdateTripInput`, `DeleteTripInput`
  - `findOverlappingTrip(candidate: { id?: string; startDate: string; endDate: string }, trips: TripOption[]): TripOption | undefined`
  - `buildOverlapMessage(trip: TripOption): string`

- [x] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { TripOption } from "@/shared/lib/trips/types";
import { buildOverlapMessage, findOverlappingTrip } from "./overlap";
import { createTripSchema, updateTripSchema } from "./schemas";

const lisboa: TripOption = {
	id: "11111111-1111-4111-8111-111111111111",
	name: "Lisboa",
	startDate: "2026-05-12",
	endDate: "2026-05-22",
};

describe("findOverlappingTrip", () => {
	it.each([
		["Porto cruza Lisboa", "2026-05-20", "2026-05-25", "Lisboa"],
		["começa no dia em que Lisboa termina", "2026-05-22", "2026-05-24", "Lisboa"],
		["termina no dia em que Lisboa começa", "2026-05-01", "2026-05-12", "Lisboa"],
		["contém Lisboa inteira", "2026-05-01", "2026-05-30", "Lisboa"],
		["começa no dia seguinte", "2026-05-23", "2026-05-25", undefined],
		["termina na véspera", "2026-05-01", "2026-05-11", undefined],
	])("%s", (_, startDate, endDate, expected) => {
		expect(findOverlappingTrip({ startDate, endDate }, [lisboa])?.name).toBe(expected);
	});

	it("editar a própria viagem não conflita com ela mesma", () => {
		expect(
			findOverlappingTrip(
				{ id: lisboa.id, startDate: "2026-05-10", endDate: "2026-05-22" },
				[lisboa],
			),
		).toBeUndefined();
	});

	it("mensagem cita a viagem em conflito", () => {
		const message = buildOverlapMessage(lisboa);
		expect(message).toContain('"Lisboa"');
		expect(message).toContain("12/05/2026");
		expect(message).toContain("22/05/2026");
	});
});

describe("createTripSchema", () => {
	const valid = { name: " Lisboa ", startDate: "2026-05-12", endDate: "2026-05-22" };

	it("aceita viagem de um dia e normaliza nome e anotação vazia", () => {
		const parsed = createTripSchema.parse({ ...valid, endDate: "2026-05-12", note: "  " });
		expect(parsed.name).toBe("Lisboa");
		expect(parsed.note).toBeNull();
	});

	it.each([
		[{ ...valid, endDate: "2026-05-11" }, "A data de fim deve ser igual ou posterior à data de início."],
		[{ ...valid, startDate: "2026-02-31" }, "Informe uma data de início válida."],
		[{ ...valid, endDate: "22/05/2026" }, "Informe uma data de fim válida."],
		[{ ...valid, name: "   " }, "Informe o nome da viagem."],
	])("rejeita %o", (input, message) => {
		const result = createTripSchema.safeParse(input);
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(message);
	});

	it("update exige id válido", () => {
		expect(updateTripSchema.safeParse({ ...valid, id: "x" }).success).toBe(false);
	});
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/trips/lib/overlap.test.ts`
Expected: FAIL (módulos inexistentes).

- [x] **Step 3: Implementar**

`src/features/trips/lib/schemas.ts`:

```ts
import { z } from "zod";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { parseLocalDateString, toLocalDateString } from "@/shared/utils/date";

// Rejects malformed strings and impossible dates such as 2026-02-31.
const isRealDate = (value: string) =>
	/^\d{4}-\d{2}-\d{2}$/.test(value) &&
	toLocalDateString(parseLocalDateString(value)) === value;

const dateOnly = (message: string) =>
	z.string({ message }).trim().refine(isRealDate, { message });

const tripFields = z
	.object({
		name: z
			.string({ message: "Informe o nome da viagem." })
			.trim()
			.min(1, "Informe o nome da viagem.")
			.max(60, "O nome deve ter no máximo 60 caracteres."),
		startDate: dateOnly("Informe uma data de início válida."),
		endDate: dateOnly("Informe uma data de fim válida."),
		note: z
			.string()
			.trim()
			.max(500, "A anotação deve ter no máximo 500 caracteres.")
			.nullish()
			.transform((value) => (value ? value : null)),
	})
	.refine((data) => data.startDate <= data.endDate, {
		message: "A data de fim deve ser igual ou posterior à data de início.",
		path: ["endDate"],
	});

export const createTripSchema = tripFields;
export const updateTripSchema = tripFields.and(
	z.object({ id: uuidSchema("Viagem") }),
);
export const deleteTripSchema = z.object({ id: uuidSchema("Viagem") });

export type CreateTripInput = z.input<typeof createTripSchema>;
export type UpdateTripInput = z.input<typeof updateTripSchema>;
export type DeleteTripInput = z.input<typeof deleteTripSchema>;
```

Se o `refine` de datas rodar mesmo com campo inválido e a primeira issue vier trocada, ajuste com `.superRefine` checando validade antes de comparar; a mensagem esperada de cada caso do teste não muda.

`src/features/trips/lib/overlap.ts`:

```ts
import type { TripOption } from "@/shared/lib/trips/types";
import { formatDateOnly } from "@/shared/utils/date";

const NUMERIC_DATE = { day: "2-digit", month: "2-digit", year: "numeric" } as const;

// Inclusive ranges: sharing a single day is already an overlap (D2).
export function findOverlappingTrip(
	candidate: { id?: string; startDate: string; endDate: string },
	trips: TripOption[],
): TripOption | undefined {
	return trips.find(
		(trip) =>
			trip.id !== candidate.id &&
			trip.startDate <= candidate.endDate &&
			candidate.startDate <= trip.endDate,
	);
}

export function buildOverlapMessage(trip: TripOption): string {
	const start = formatDateOnly(trip.startDate, NUMERIC_DATE);
	const end = formatDateOnly(trip.endDate, NUMERIC_DATE);
	return `As datas se sobrepõem à viagem "${trip.name}" (${start} a ${end}).`;
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/trips/lib/overlap.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(trips): validacao de datas e sobreposicao de viagens" -- src/features/trips/lib/
```

---

### Task 8: Actions de criar, editar e excluir viagem

**Depends:** Tasks 4, 6, 7.

**Files:**
- Create: `src/features/trips/actions.ts`
- Test: `src/features/trips/actions.test.ts`

**Interfaces:**
- Consumes: `fetchUserTrips` (Task 4), `findOverlappingTrip`, `buildOverlapMessage`, schemas (Task 7), `revalidateForEntity("trips")` (Task 6).
- Produces:
  - `createTripAction(input: CreateTripInput): Promise<ActionResult<{ tripId: string }>>`
  - `updateTripAction(input: UpdateTripInput): Promise<ActionResult>`
  - `deleteTripAction(input: DeleteTripInput): Promise<ActionResult>`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const writes: { kind: string; payload?: unknown; where?: unknown }[] = [];
	const returningQueue: unknown[][] = [];
	const dbMock = {
		insert: () => ({
			values: (payload: unknown) => {
				writes.push({ kind: "insert", payload });
				return { returning: () => Promise.resolve(returningQueue.shift() ?? []) };
			},
		}),
		update: () => ({
			set: (payload: unknown) => ({
				where: (where: unknown) => {
					writes.push({ kind: "update", payload, where });
					return { returning: () => Promise.resolve(returningQueue.shift() ?? []) };
				},
			}),
		}),
		delete: () => ({
			where: (where: unknown) => {
				writes.push({ kind: "delete", where });
				return { returning: () => Promise.resolve(returningQueue.shift() ?? []) };
			},
		}),
	};
	return {
		writes,
		returningQueue,
		dbMock,
		getUserMock: vi.fn(),
		fetchUserTripsMock: vi.fn(),
		revalidateMock: vi.fn(),
	};
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/auth/server", () => ({ getUser: mocks.getUserMock }));
vi.mock("@/shared/lib/trips/queries", () => ({ fetchUserTrips: mocks.fetchUserTripsMock }));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: mocks.revalidateMock,
	handleActionError: (error: unknown) => ({
		success: false,
		error:
			error && typeof error === "object" && "issues" in error
				? (error as { issues: { message: string }[] }).issues[0]?.message
				: "Ocorreu um erro inesperado. Tente novamente.",
	}),
}));

import { createTripAction, deleteTripAction, updateTripAction } from "./actions";

const USER_ID = "user-1";
const LISBOA_ID = "11111111-1111-4111-8111-111111111111";
const lisboa = { id: LISBOA_ID, name: "Lisboa", startDate: "2026-05-12", endDate: "2026-05-22" };
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);

beforeEach(() => {
	mocks.writes.length = 0;
	mocks.returningQueue.length = 0;
	vi.clearAllMocks();
	mocks.getUserMock.mockResolvedValue({ id: USER_ID });
	mocks.fetchUserTripsMock.mockResolvedValue([lisboa]);
});

describe("createTripAction", () => {
	it("rejeita Porto que cruza Lisboa e não grava", async () => {
		const result = await createTripAction({
			name: "Porto",
			startDate: "2026-05-20",
			endDate: "2026-05-25",
		});

		expect(result.success).toBe(false);
		expect(!result.success && result.error).toContain('"Lisboa"');
		expect(mocks.writes).toHaveLength(0);
		expect(mocks.fetchUserTripsMock).toHaveBeenCalledWith(USER_ID);
	});

	it("cria viagem sem conflito com o userId da sessão", async () => {
		mocks.returningQueue.push([{ id: "nova" }]);

		const result = await createTripAction({
			name: "Santiago",
			startDate: "2026-09-01",
			endDate: "2026-09-05",
			note: "férias",
		});

		expect(result).toMatchObject({ success: true, data: { tripId: "nova" } });
		expect(mocks.writes[0]).toMatchObject({
			kind: "insert",
			payload: { userId: USER_ID, name: "Santiago", note: "férias" },
		});
		expect(mocks.revalidateMock).toHaveBeenCalledWith("trips", USER_ID);
	});

	it("fim antes do início volta a mensagem do schema", async () => {
		const result = await createTripAction({
			name: "X",
			startDate: "2026-09-05",
			endDate: "2026-09-01",
		});
		expect(result).toEqual({
			success: false,
			error: "A data de fim deve ser igual ou posterior à data de início.",
		});
	});
});

describe("updateTripAction", () => {
	it("pode estender a própria viagem", async () => {
		mocks.returningQueue.push([{ id: LISBOA_ID }]);
		const result = await updateTripAction({ ...lisboa, endDate: "2026-05-24" });
		expect(result.success).toBe(true);
		const where = render(mocks.writes[0]?.where);
		expect(where.params).toEqual(expect.arrayContaining([LISBOA_ID, USER_ID]));
	});

	it("viagem de outro usuário volta não encontrada", async () => {
		mocks.fetchUserTripsMock.mockResolvedValue([]);
		mocks.returningQueue.push([]);
		const result = await updateTripAction({ ...lisboa, name: "Lisboa 2" });
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
	});
});

describe("deleteTripAction", () => {
	it("exclui só a viagem do usuário", async () => {
		mocks.returningQueue.push([{ id: LISBOA_ID }]);
		const result = await deleteTripAction({ id: LISBOA_ID });
		expect(result.success).toBe(true);
		const where = render(mocks.writes[0]?.where);
		expect(where.sql).toContain('"user_id" =');
		expect(where.params).toEqual(expect.arrayContaining([LISBOA_ID, USER_ID]));
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/trips/actions.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { trips } from "@/db/schema";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { fetchUserTrips } from "@/shared/lib/trips/queries";
import type { ActionResult } from "@/shared/lib/types/actions";
import { parseLocalDateString } from "@/shared/utils/date";
import { buildOverlapMessage, findOverlappingTrip } from "./lib/overlap";
import {
	type CreateTripInput,
	createTripSchema,
	type DeleteTripInput,
	deleteTripSchema,
	type UpdateTripInput,
	updateTripSchema,
} from "./lib/schemas";

const NOT_FOUND = "Viagem não encontrada.";

export async function createTripAction(
	input: CreateTripInput,
): Promise<ActionResult<{ tripId: string }>> {
	try {
		const user = await getUser();
		const data = createTripSchema.parse(input);

		const overlap = findOverlappingTrip(data, await fetchUserTrips(user.id));
		if (overlap) return { success: false, error: buildOverlapMessage(overlap) };

		const [created] = await db
			.insert(trips)
			.values({
				userId: user.id,
				name: data.name,
				startDate: parseLocalDateString(data.startDate),
				endDate: parseLocalDateString(data.endDate),
				note: data.note,
			})
			.returning({ id: trips.id });

		revalidateForEntity("trips", user.id);
		return { success: true, message: "Viagem criada.", data: { tripId: created.id } };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function updateTripAction(input: UpdateTripInput): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateTripSchema.parse(input);

		const overlap = findOverlappingTrip(data, await fetchUserTrips(user.id));
		if (overlap) return { success: false, error: buildOverlapMessage(overlap) };

		// Changing dates never unlinks anything (D7).
		const updated = await db
			.update(trips)
			.set({
				name: data.name,
				startDate: parseLocalDateString(data.startDate),
				endDate: parseLocalDateString(data.endDate),
				note: data.note,
			})
			.where(and(eq(trips.id, data.id), eq(trips.userId, user.id)))
			.returning({ id: trips.id });

		if (updated.length === 0) return { success: false, error: NOT_FOUND };

		revalidateForEntity("trips", user.id);
		return { success: true, message: "Viagem atualizada." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteTripAction(input: DeleteTripInput): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deleteTripSchema.parse(input);

		// FK "on delete set null" keeps the transactions, just without a trip (D8).
		const deleted = await db
			.delete(trips)
			.where(and(eq(trips.id, data.id), eq(trips.userId, user.id)))
			.returning({ id: trips.id });

		if (deleted.length === 0) return { success: false, error: NOT_FOUND };

		revalidateForEntity("trips", user.id);
		return {
			success: true,
			message: "Viagem excluída. Os lançamentos continuam existindo, sem viagem.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/trips/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(trips): criar, editar e excluir viagem" -- src/features/trips/actions.ts src/features/trips/actions.test.ts
```

---

### Task 9: Actions de vincular e desvincular lançamentos

**Depends:** Tasks 4, 5, 8.

**Files:**
- Modify: `src/features/trips/actions.ts` (acrescentar ao final)
- Test: `src/features/trips/link-actions.test.ts`

**Interfaces:**
- Consumes: `validateTripOwnership` (Task 4), `setTripForTransactions` (Task 5).
- Produces:
  - `linkTransactionsToTripAction(input: { tripId: string; transactionIds: string[] }): Promise<ActionResult<{ count: number }>>`
  - `unlinkTransactionsFromTripAction(input: { transactionIds: string[] }): Promise<ActionResult<{ count: number }>>`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dbMock: { marker: "db" },
	getUserMock: vi.fn(),
	validateTripOwnershipMock: vi.fn(),
	setTripMock: vi.fn(),
	revalidateMock: vi.fn(),
}));

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/auth/server", () => ({ getUser: mocks.getUserMock }));
vi.mock("@/shared/lib/trips/queries", () => ({
	fetchUserTrips: vi.fn(),
	validateTripOwnership: mocks.validateTripOwnershipMock,
}));
vi.mock("@/shared/lib/trips/link", () => ({ setTripForTransactions: mocks.setTripMock }));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: mocks.revalidateMock,
	handleActionError: (error: unknown) => ({
		success: false,
		error:
			error && typeof error === "object" && "issues" in error
				? (error as { issues: { message: string }[] }).issues[0]?.message
				: "Ocorreu um erro inesperado. Tente novamente.",
	}),
}));

import {
	linkTransactionsToTripAction,
	unlinkTransactionsFromTripAction,
} from "./actions";

const USER_ID = "user-1";
const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const UBER = "22222222-2222-4222-8222-222222222222";
const PINGO_DOCE = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getUserMock.mockResolvedValue({ id: USER_ID });
	mocks.validateTripOwnershipMock.mockResolvedValue(null);
	mocks.setTripMock.mockResolvedValue(2);
});

describe("linkTransactionsToTripAction", () => {
	it("vincula Uber e Pingo Doce em lote", async () => {
		const result = await linkTransactionsToTripAction({
			tripId: TRIP_ID,
			transactionIds: [UBER, PINGO_DOCE],
		});

		expect(result).toMatchObject({ success: true, data: { count: 2 } });
		expect(mocks.validateTripOwnershipMock).toHaveBeenCalledWith(USER_ID, TRIP_ID);
		expect(mocks.setTripMock).toHaveBeenCalledWith(
			mocks.dbMock,
			USER_ID,
			[UBER, PINGO_DOCE],
			TRIP_ID,
		);
		expect(mocks.revalidateMock).toHaveBeenCalledWith("trips", USER_ID);
	});

	it("viagem de outro usuário não vincula nada", async () => {
		mocks.validateTripOwnershipMock.mockResolvedValue("Viagem não encontrada.");
		const result = await linkTransactionsToTripAction({
			tripId: TRIP_ID,
			transactionIds: [UBER],
		});
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
		expect(mocks.setTripMock).not.toHaveBeenCalled();
	});

	it("seleção vazia é rejeitada", async () => {
		const result = await linkTransactionsToTripAction({ tripId: TRIP_ID, transactionIds: [] });
		expect(result).toEqual({ success: false, error: "Selecione ao menos um lançamento." });
	});
});

describe("unlinkTransactionsFromTripAction", () => {
	it("grava viagem nula (o helper solta só as linhas recebidas)", async () => {
		mocks.setTripMock.mockResolvedValue(1);
		const result = await unlinkTransactionsFromTripAction({ transactionIds: [UBER] });
		expect(result.success).toBe(true);
		expect(mocks.setTripMock).toHaveBeenCalledWith(mocks.dbMock, USER_ID, [UBER], null);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/trips/link-actions.test.ts`
Expected: FAIL (exports inexistentes).

- [ ] **Step 3: Implementar**

Acrescentar imports em `src/features/trips/actions.ts`:

```ts
import { z } from "zod";
import { setTripForTransactions } from "@/shared/lib/trips/link";
import { fetchUserTrips, validateTripOwnership } from "@/shared/lib/trips/queries";
import { uuidSchema } from "@/shared/lib/schemas/common";
```

(unificar com o import existente de `@/shared/lib/trips/queries`). Ao final do arquivo:

```ts
const transactionIdsSchema = z
	.array(uuidSchema("Lançamento"))
	.min(1, "Selecione ao menos um lançamento.");

const linkSchema = z.object({
	tripId: uuidSchema("Viagem"),
	transactionIds: transactionIdsSchema,
});
const unlinkSchema = z.object({ transactionIds: transactionIdsSchema });

export async function linkTransactionsToTripAction(
	input: z.input<typeof linkSchema>,
): Promise<ActionResult<{ count: number }>> {
	try {
		const user = await getUser();
		const data = linkSchema.parse(input);

		const ownershipError = await validateTripOwnership(user.id, data.tripId);
		if (ownershipError) return { success: false, error: ownershipError };

		const count = await setTripForTransactions(db, user.id, data.transactionIds, data.tripId);

		revalidateForEntity("trips", user.id);
		return { success: true, message: "Lançamentos vinculados à viagem.", data: { count } };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function unlinkTransactionsFromTripAction(
	input: z.input<typeof unlinkSchema>,
): Promise<ActionResult<{ count: number }>> {
	try {
		const user = await getUser();
		const data = unlinkSchema.parse(input);

		const count = await setTripForTransactions(db, user.id, data.transactionIds, null);

		revalidateForEntity("trips", user.id);
		return { success: true, message: "Lançamento desvinculado da viagem.", data: { count } };
	} catch (error) {
		return handleActionError(error);
	}
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/trips/link-actions.test.ts src/features/trips/actions.test.ts`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(trips): vincular e desvincular lancamentos em lote" -- src/features/trips/actions.ts src/features/trips/link-actions.test.ts
```

---

### Task 10: Resumo da viagem: custo líquido e quebras (puro)

**Depends:** nenhuma.

**Files:**
- Create: `src/features/trips/lib/summary.ts`
- Test: `src/features/trips/lib/summary.test.ts`

**Interfaces:**
- Produces:
  - `type TripTransactionRow = { id: string; name: string; purchaseDate: string; amount: number; transactionType: string; payerId: string | null; payerName: string | null; categoryName: string | null; cardName: string | null; accountName: string | null; currentInstallment: number | null; installmentCount: number | null; seriesId: string | null; splitGroupId: string | null }`
  - `type TripBreakdownItem = { label: string; amount: number }`
  - `type TripSummary = { netCost: number; expenses: number; reimbursements: number; byCategory: TripBreakdownItem[]; bySource: TripBreakdownItem[]; byPayer: TripBreakdownItem[] }`
  - `summarizeTrip(rows: TripTransactionRow[], adminPayerId: string | null): TripSummary`
- Regra (D6): total e quebras por categoria e por cartão/conta usam só o admin; quebra por pessoa mostra a despesa de todas as pessoas.

- [x] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { summarizeTrip, type TripTransactionRow } from "./summary";

const ADMIN = "admin";
const ANA = "ana";

const row = (overrides: Partial<TripTransactionRow>): TripTransactionRow => ({
	id: overrides.id ?? "r",
	name: "x",
	purchaseDate: "2026-05-14",
	amount: -10,
	transactionType: "Despesa",
	payerId: ADMIN,
	payerName: "Eu",
	categoryName: "Restaurantes",
	cardName: "C6",
	accountName: null,
	currentInstallment: null,
	installmentCount: null,
	seriesId: null,
	splitGroupId: null,
	...overrides,
});

describe("summarizeTrip", () => {
	it("reembolso abate o total (9.212,30 - 800,00)", () => {
		const summary = summarizeTrip(
			[
				row({ id: "a", amount: -9000 }),
				row({ id: "b", amount: -212.3, categoryName: "Transporte", cardName: null, accountName: "Itaú" }),
				row({ id: "c", amount: 800, transactionType: "Receita", categoryName: "Reembolso" }),
			],
			ADMIN,
		);

		expect(summary.expenses).toBe(9212.3);
		expect(summary.reimbursements).toBe(800);
		expect(summary.netCost).toBe(8412.3);
		expect(summary.byCategory).toEqual([
			{ label: "Restaurantes", amount: 9000 },
			{ label: "Transporte", amount: 212.3 },
		]);
		expect(summary.bySource).toEqual([
			{ label: "C6", amount: 9000 },
			{ label: "Itaú", amount: 212.3 },
		]);
	});

	it("parte de outra pessoa fica fora do total e aparece na quebra por pessoa", () => {
		const summary = summarizeTrip(
			[
				row({ id: "j1", amount: -150, splitGroupId: "g" }),
				row({ id: "j2", amount: -150, splitGroupId: "g", payerId: ANA, payerName: "Ana" }),
			],
			ADMIN,
		);

		expect(summary.netCost).toBe(150);
		expect(summary.byPayer).toEqual([
			{ label: "Ana", amount: 150 },
			{ label: "Eu", amount: 150 },
		]);
	});

	it("soma em centavos sem erro de ponto flutuante", () => {
		const summary = summarizeTrip(
			[row({ id: "1", amount: -0.1 }), row({ id: "2", amount: -0.2 })],
			ADMIN,
		);
		expect(summary.netCost).toBe(0.3);
	});

	it("sem pessoa admin, total zero e nada quebra", () => {
		const summary = summarizeTrip([row({ amount: -50 })], null);
		expect(summary).toMatchObject({ netCost: 0, expenses: 0, reimbursements: 0, byCategory: [] });
		expect(summary.byPayer).toEqual([{ label: "Eu", amount: 50 }]);
	});

	it("rótulos ausentes viram texto padrão", () => {
		const summary = summarizeTrip(
			[row({ categoryName: null, cardName: null, accountName: null, payerName: null })],
			ADMIN,
		);
		expect(summary.byCategory[0]?.label).toBe("Sem categoria");
		expect(summary.bySource[0]?.label).toBe("Sem cartão ou conta");
		expect(summary.byPayer[0]?.label).toBe("Sem pessoa");
	});
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/trips/lib/summary.test.ts`
Expected: FAIL (módulo inexistente).

- [x] **Step 3: Implementar**

```ts
export type TripTransactionRow = {
	id: string;
	name: string;
	purchaseDate: string;
	amount: number;
	transactionType: string;
	payerId: string | null;
	payerName: string | null;
	categoryName: string | null;
	cardName: string | null;
	accountName: string | null;
	currentInstallment: number | null;
	installmentCount: number | null;
	seriesId: string | null;
	splitGroupId: string | null;
};

export type TripBreakdownItem = { label: string; amount: number };

export type TripSummary = {
	netCost: number;
	expenses: number;
	reimbursements: number;
	byCategory: TripBreakdownItem[];
	bySource: TripBreakdownItem[];
	byPayer: TripBreakdownItem[];
};

const toCents = (value: number) => Math.round(value * 100);

const addTo = (map: Map<string, number>, key: string, cents: number) => {
	map.set(key, (map.get(key) ?? 0) + cents);
};

const toItems = (map: Map<string, number>): TripBreakdownItem[] =>
	[...map]
		.map(([label, cents]) => ({ label, amount: cents / 100 }))
		.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR"));

// Net cost of the admin: expenses minus linked income (refunds), paid or not (D6).
export function summarizeTrip(
	rows: TripTransactionRow[],
	adminPayerId: string | null,
): TripSummary {
	let expenseCents = 0;
	let reimbursementCents = 0;
	const byCategory = new Map<string, number>();
	const bySource = new Map<string, number>();
	const byPayer = new Map<string, number>();

	for (const row of rows) {
		const cents = toCents(row.amount);
		const isExpense = row.transactionType === "Despesa";

		if (isExpense) addTo(byPayer, row.payerName ?? "Sem pessoa", -cents);
		if (!adminPayerId || row.payerId !== adminPayerId) continue;

		if (isExpense) {
			expenseCents += -cents;
			addTo(byCategory, row.categoryName ?? "Sem categoria", -cents);
			addTo(bySource, row.cardName ?? row.accountName ?? "Sem cartão ou conta", -cents);
		} else if (row.transactionType === "Receita") {
			reimbursementCents += cents;
		}
	}

	return {
		netCost: (expenseCents - reimbursementCents) / 100,
		expenses: expenseCents / 100,
		reimbursements: reimbursementCents / 100,
		byCategory: toItems(byCategory),
		bySource: toItems(bySource),
		byPayer: toItems(byPayer),
	};
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/trips/lib/summary.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(trips): custo liquido e quebras da viagem" -- src/features/trips/lib/summary.ts src/features/trips/lib/summary.test.ts
```

---

### Task 11: Query do detalhe da viagem com sugestões

**Depends:** Tasks 3, 10.

**Files:**
- Create: `src/features/trips/lib/suggestions.ts`
- Create: `src/features/trips/queries.ts`
- Test: `src/features/trips/queries.test.ts`

**Interfaces:**
- Consumes: `tripEligibleCondition` (Task 3), `summarizeTrip`, `TripTransactionRow`, `TripSummary` (Task 10), `getAdminPayerId`.
- Produces:
  - `dedupeSuggestions<T extends { id: string; installmentCount: number | null; seriesId: string | null; splitGroupId: string | null }>(rows: T[]): T[]` (parcelas e divisão colapsam; recorrente não, porque vincula por ocorrência)
  - `type TripDetail = { trip: { id: string; name: string; startDate: string; endDate: string; note: string | null }; summary: TripSummary; linked: TripTransactionRow[]; suggestions: TripTransactionRow[] }`
  - `fetchTripDetail(userId: string, tripId: string): Promise<TripDetail | null>` (null quando a viagem não existe ou é de outro usuário)

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	type Chain = Promise<unknown[]> & {
		from: () => Chain;
		leftJoin: () => Chain;
		where: (condition: unknown) => Chain;
		groupBy: () => Chain;
		orderBy: () => Chain;
		limit: () => Chain;
	};
	const queue: unknown[][] = [];
	const wheres: unknown[] = [];
	const select = () => {
		const chain: Chain = Object.assign(Promise.resolve(queue.shift() ?? []), {
			from: () => chain,
			leftJoin: () => chain,
			where: (condition: unknown) => {
				wheres.push(condition);
				return chain;
			},
			groupBy: () => chain,
			orderBy: () => chain,
			limit: () => chain,
		});
		return chain;
	};
	return { queue, wheres, dbMock: { select }, getAdminPayerIdMock: vi.fn() };
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/payers/get-admin-id", () => ({
	getAdminPayerId: mocks.getAdminPayerIdMock,
}));

import { dedupeSuggestions } from "./lib/suggestions";
import { fetchTripDetail } from "./queries";

const USER_ID = "user-1";
const TRIP_ID = "trip-lisboa";
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);

const dbRow = (overrides: Record<string, unknown>) => ({
	id: "r",
	name: "Uber",
	purchaseDate: new Date(Date.UTC(2026, 4, 13)),
	amount: "-42.50",
	transactionType: "Despesa",
	payerId: "admin",
	payerName: "Eu",
	categoryName: "Transporte",
	cardName: "C6",
	accountName: null,
	currentInstallment: null,
	installmentCount: null,
	seriesId: null,
	splitGroupId: null,
	...overrides,
});

beforeEach(() => {
	mocks.queue.length = 0;
	mocks.wheres.length = 0;
	mocks.getAdminPayerIdMock.mockResolvedValue("admin");
});

describe("dedupeSuggestions", () => {
	it("parcelas e divisão aparecem uma vez; recorrente aparece por ocorrência", () => {
		const rows = [
			{ id: "p1", installmentCount: 10, seriesId: "tap", splitGroupId: null },
			{ id: "p2", installmentCount: 10, seriesId: "tap", splitGroupId: null },
			{ id: "j1", installmentCount: null, seriesId: null, splitGroupId: "jantar" },
			{ id: "j2", installmentCount: null, seriesId: null, splitGroupId: "jantar" },
			{ id: "r1", installmentCount: null, seriesId: "netflix", splitGroupId: null },
			{ id: "r2", installmentCount: null, seriesId: "netflix", splitGroupId: null },
			{ id: "u", installmentCount: null, seriesId: null, splitGroupId: null },
		];
		expect(dedupeSuggestions(rows).map((r) => r.id)).toEqual(["p1", "j1", "r1", "r2", "u"]);
	});
});

describe("fetchTripDetail", () => {
	it("viagem de outro usuário volta null", async () => {
		mocks.queue.push([]);
		expect(await fetchTripDetail(USER_ID, TRIP_ID)).toBeNull();
		expect(render(mocks.wheres[0]).params).toEqual(
			expect.arrayContaining([TRIP_ID, USER_ID]),
		);
	});

	it("monta resumo, vinculados e sugestões filtrados por userId", async () => {
		mocks.queue.push([
			{
				id: TRIP_ID,
				name: "Lisboa",
				startDate: new Date(Date.UTC(2026, 4, 12)),
				endDate: new Date(Date.UTC(2026, 4, 22)),
				note: null,
			},
		]);
		mocks.queue.push([dbRow({ id: "uber" })]);
		mocks.queue.push([
			dbRow({ id: "p1", seriesId: "tap", installmentCount: 10 }),
			dbRow({ id: "p2", seriesId: "tap", installmentCount: 10 }),
		]);

		const detail = await fetchTripDetail(USER_ID, TRIP_ID);

		expect(detail?.trip).toEqual({
			id: TRIP_ID,
			name: "Lisboa",
			startDate: "2026-05-12",
			endDate: "2026-05-22",
			note: null,
		});
		expect(detail?.linked[0]).toMatchObject({ id: "uber", amount: -42.5, purchaseDate: "2026-05-13" });
		expect(detail?.summary.netCost).toBe(42.5);
		expect(detail?.suggestions.map((s) => s.id)).toEqual(["p1"]);

		const linkedWhere = render(mocks.wheres[1]);
		expect(linkedWhere.sql).toContain('"user_id" =');
		expect(linkedWhere.sql).toContain('"viagem_id" =');

		const suggestionsWhere = render(mocks.wheres[2]);
		expect(suggestionsWhere.sql).toContain('"user_id" =');
		expect(suggestionsWhere.sql).toContain('"viagem_id" is null');
		expect(suggestionsWhere.sql).toContain('"data_compra" >=');
		expect(suggestionsWhere.sql).toContain('"data_compra" <=');
		expect(suggestionsWhere.sql).toContain('"transfer_id" is null');
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/trips/queries.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`src/features/trips/lib/suggestions.ts`:

```ts
// Installments share purchase date and split shares share everything but the payer:
// show each installment series or split group once (D7). Recurring rows link per
// occurrence (D4), so each occurrence stays its own suggestion.
export function dedupeSuggestions<
	T extends {
		id: string;
		installmentCount: number | null;
		seriesId: string | null;
		splitGroupId: string | null;
	},
>(rows: T[]): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const row of rows) {
		const installmentSeries = row.installmentCount ? row.seriesId : null;
		const key = installmentSeries ?? row.splitGroupId ?? row.id;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(row);
	}
	return result;
}
```

`src/features/trips/queries.ts`:

```ts
import { and, asc, eq, gte, isNull, lte, type SQL } from "drizzle-orm";
import {
	cards,
	categories,
	financialAccounts,
	payers,
	transactions,
	trips,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { tripEligibleCondition } from "@/shared/lib/trips/eligibility";
import { toDateOnlyString } from "@/shared/utils/date";
import { dedupeSuggestions } from "./lib/suggestions";
import {
	summarizeTrip,
	type TripSummary,
	type TripTransactionRow,
} from "./lib/summary";

export type TripDetail = {
	trip: { id: string; name: string; startDate: string; endDate: string; note: string | null };
	summary: TripSummary;
	linked: TripTransactionRow[];
	suggestions: TripTransactionRow[];
};

async function fetchTripRows(where: SQL): Promise<TripTransactionRow[]> {
	const rows = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			purchaseDate: transactions.purchaseDate,
			amount: transactions.amount,
			transactionType: transactions.transactionType,
			payerId: transactions.payerId,
			payerName: payers.name,
			categoryName: categories.name,
			cardName: cards.name,
			accountName: financialAccounts.name,
			currentInstallment: transactions.currentInstallment,
			installmentCount: transactions.installmentCount,
			seriesId: transactions.seriesId,
			splitGroupId: transactions.splitGroupId,
		})
		.from(transactions)
		.leftJoin(payers, eq(payers.id, transactions.payerId))
		.leftJoin(categories, eq(categories.id, transactions.categoryId))
		.leftJoin(cards, eq(cards.id, transactions.cardId))
		.leftJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
		.where(where)
		.orderBy(
			asc(transactions.purchaseDate),
			asc(transactions.currentInstallment),
			asc(transactions.createdAt),
		);

	return rows.map((row) => ({
		...row,
		purchaseDate: toDateOnlyString(row.purchaseDate) ?? "",
		amount: Number(row.amount),
	}));
}

export async function fetchTripDetail(
	userId: string,
	tripId: string,
): Promise<TripDetail | null> {
	const [trip] = await db
		.select({
			id: trips.id,
			name: trips.name,
			startDate: trips.startDate,
			endDate: trips.endDate,
			note: trips.note,
		})
		.from(trips)
		.where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
		.limit(1);

	if (!trip) return null;

	const adminPayerId = await getAdminPayerId(userId);

	const [linked, candidates] = await Promise.all([
		fetchTripRows(
			and(eq(transactions.userId, userId), eq(transactions.tripId, trip.id)) as SQL,
		),
		fetchTripRows(
			and(
				eq(transactions.userId, userId),
				isNull(transactions.tripId),
				gte(transactions.purchaseDate, trip.startDate),
				lte(transactions.purchaseDate, trip.endDate),
				tripEligibleCondition(),
			) as SQL,
		),
	]);

	return {
		trip: {
			id: trip.id,
			name: trip.name,
			startDate: toDateOnlyString(trip.startDate) ?? "",
			endDate: toDateOnlyString(trip.endDate) ?? "",
			note: trip.note,
		},
		summary: summarizeTrip(linked, adminPayerId),
		linked,
		suggestions: dedupeSuggestions(candidates),
	};
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/trips/queries.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(trips): detalhe da viagem com sugestoes" -- src/features/trips/lib/suggestions.ts src/features/trips/queries.ts src/features/trips/queries.test.ts
```

---

### Task 12: Query da lista de viagens com totais

**Depends:** Task 11.

**Files:**
- Modify: `src/features/trips/queries.ts` (acrescentar)
- Test: `src/features/trips/overview.test.ts`

**Interfaces:**
- Produces:
  - `type TripListItem = { id: string; name: string; startDate: string; endDate: string; note: string | null; linkedCount: number; netCost: number }`
  - `fetchTripsOverview(userId: string): Promise<TripListItem[]>` (ordem `startDate desc`; `netCost` com a mesma regra de D6, calculado no SQL)

- [ ] **Step 1: Escrever o teste que falha**

Mesmo bloco `vi.hoisted`/`vi.mock` da Task 11 (copiar inteiro, com `Chain`, `queue`, `wheres`, `dbMock`, `getAdminPayerIdMock` e os dois `vi.mock`), depois:

```ts
import { fetchTripsOverview } from "./queries";

const USER_ID = "user-1";
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);

beforeEach(() => {
	mocks.queue.length = 0;
	mocks.wheres.length = 0;
	mocks.getAdminPayerIdMock.mockResolvedValue("admin");
});

describe("fetchTripsOverview", () => {
	it("converte totais e datas e filtra por userId", async () => {
		mocks.queue.push([
			{
				id: "t1",
				name: "Lisboa",
				startDate: new Date(Date.UTC(2026, 4, 12)),
				endDate: new Date(Date.UTC(2026, 4, 22)),
				note: null,
				linkedCount: 24,
				netCost: "8412.30",
			},
		]);

		expect(await fetchTripsOverview(USER_ID)).toEqual([
			{
				id: "t1",
				name: "Lisboa",
				startDate: "2026-05-12",
				endDate: "2026-05-22",
				note: null,
				linkedCount: 24,
				netCost: 8412.3,
			},
		]);
		const where = render(mocks.wheres[0]);
		expect(where.sql).toContain('"user_id" = $1');
		expect(where.params).toEqual([USER_ID]);
	});

	it("sem admin, custo zero", async () => {
		mocks.getAdminPayerIdMock.mockResolvedValue(null);
		mocks.queue.push([
			{
				id: "t1",
				name: "Lisboa",
				startDate: new Date(Date.UTC(2026, 4, 12)),
				endDate: new Date(Date.UTC(2026, 4, 22)),
				note: null,
				linkedCount: 3,
				netCost: "0",
			},
		]);
		expect((await fetchTripsOverview(USER_ID))[0]?.netCost).toBe(0);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/trips/overview.test.ts`
Expected: FAIL (`fetchTripsOverview` inexistente).

- [ ] **Step 3: Implementar**

Acrescentar `desc`, `inArray`, `sql` ao import de `drizzle-orm` em `queries.ts` e:

```ts
export type TripListItem = {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
	note: string | null;
	linkedCount: number;
	netCost: number;
};

export async function fetchTripsOverview(userId: string): Promise<TripListItem[]> {
	const adminPayerId = await getAdminPayerId(userId);

	// Despesa is stored negative and Receita positive, so -sum(amount) is the net cost (D6).
	const netCost = adminPayerId
		? sql<string>`coalesce(sum(-${transactions.amount}) filter (where ${and(
				eq(transactions.payerId, adminPayerId),
				inArray(transactions.transactionType, ["Despesa", "Receita"]),
			)}), 0)`
		: sql<string>`0`;

	const rows = await db
		.select({
			id: trips.id,
			name: trips.name,
			startDate: trips.startDate,
			endDate: trips.endDate,
			note: trips.note,
			linkedCount: sql<number>`count(${transactions.id})::int`,
			netCost,
		})
		.from(trips)
		.leftJoin(
			transactions,
			and(eq(transactions.tripId, trips.id), eq(transactions.userId, userId)),
		)
		.where(eq(trips.userId, userId))
		.groupBy(trips.id)
		.orderBy(desc(trips.startDate));

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		startDate: toDateOnlyString(row.startDate) ?? "",
		endDate: toDateOnlyString(row.endDate) ?? "",
		note: row.note,
		linkedCount: Number(row.linkedCount),
		netCost: Number(row.netCost),
	}));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/trips/overview.test.ts src/features/trips/queries.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(trips): lista de viagens com custo liquido" -- src/features/trips/queries.ts src/features/trips/overview.test.ts
```

---

### Task 13: Lançamentos gravam a viagem ao criar (schemas e registros)

**Depends:** Task 1.

**Files:**
- Modify: `src/features/transactions/actions/core.ts` (`baseFields` ~linha 286, `updateBulkSchema` ~linha 887, `basePayload` em `buildTransactionRecords` ~linha 709)
- Test: `src/features/transactions/actions/core-trip.test.ts`

**Interfaces:**
- Produces: `CreateInput`, `UpdateInput` e `UpdateBulkInput` ganham `tripId?: string | null` (mensagem "Viagem inválida."). `buildTransactionRecords` grava `tripId` em todas as parcelas e partes da divisão; em recorrente, só na primeira ocorrência (e nas partes da divisão dela), as demais saem `null` (D4); `Transferência` grava sempre `null`.

- [x] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/actions/helpers", () => ({ revalidateForEntity: vi.fn() }));

import { buildTransactionRecords, updateBulkSchema, updateSchema } from "./core";

const TRIP_ID = "44444444-4444-4444-8444-444444444444";
const PAYER_A = "11111111-1111-4111-8111-111111111111";
const PAYER_B = "22222222-2222-4222-8222-222222222222";

type Params = Parameters<typeof buildTransactionRecords>[0];

const params = (data: Record<string, unknown>, shares: Params["shares"]): Params => ({
	data: {
		purchaseDate: "2026-03-02",
		name: "TAP",
		transactionType: "Despesa",
		amount: 1000,
		condition: "Parcelado",
		paymentMethod: "Pix",
		installmentCount: 10,
		startInstallment: 1,
		isSplit: shares.length > 1,
		tripId: TRIP_ID,
		...data,
	} as Params["data"],
	userId: "user-1",
	period: "2026-03",
	purchaseDate: new Date(2026, 2, 2),
	dueDate: null,
	boletoPaymentDate: null,
	shares,
	amountSign: -1,
	shouldNullifySettled: false,
	seriesId: "serie-tap",
});

describe("tripId nos registros", () => {
	it("as 10 parcelas divididas entre duas pessoas herdam a viagem", () => {
		const records = buildTransactionRecords(
			params({}, [
				{ payerId: PAYER_A, amountCents: 50000 },
				{ payerId: PAYER_B, amountCents: 50000 },
			]),
		);
		expect(records).toHaveLength(20);
		expect(new Set(records.map((record) => record.tripId))).toEqual(new Set([TRIP_ID]));
	});

	it("recorrente criado com viagem vincula só a primeira ocorrência", () => {
		const records = buildTransactionRecords(
			params({ condition: "Recorrente", recurrenceCount: 12, installmentCount: undefined }, [
				{ payerId: PAYER_A, amountCents: 5590 },
			]),
		);
		expect(records).toHaveLength(12);
		expect(records[0]?.tripId).toBe(TRIP_ID);
		expect(records.slice(1).every((record) => record.tripId === null)).toBe(true);
	});

	it("transferência nunca grava viagem", () => {
		const records = buildTransactionRecords(
			params({ transactionType: "Transferência", condition: "À vista" }, [
				{ payerId: PAYER_A, amountCents: 100000 },
			]),
		);
		expect(records.every((record) => record.tripId === null)).toBe(true);
	});

	it("sem viagem grava null", () => {
		const records = buildTransactionRecords(
			params({ tripId: undefined, condition: "À vista" }, [
				{ payerId: PAYER_A, amountCents: 100000 },
			]),
		);
		expect(records[0]?.tripId).toBeNull();
	});
});

describe("schemas", () => {
	it("aceitam uuid, null e ausência; rejeitam lixo", () => {
		const field = updateSchema.shape.tripId;
		expect(field.safeParse(TRIP_ID).success).toBe(true);
		expect(field.safeParse(null).success).toBe(true);
		expect(field.safeParse(undefined).success).toBe(true);
		expect(field.safeParse("abc").error?.issues[0]?.message).toBe("Viagem inválida.");

		const bulk = updateBulkSchema.parse({
			id: PAYER_A,
			scope: "all",
			name: "TAP",
			tripId: TRIP_ID,
		});
		expect(bulk.tripId).toBe(TRIP_ID);
	});
});
```

Se `updateSchema.shape` não existir (zod devolvendo wrapper após `superRefine`), troque por `updateBulkSchema.shape.tripId` e teste `updateSchema` com um `safeParse` completo de um lançamento válido; não exporte `baseFields` só para o teste.

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/transactions/actions/core-trip.test.ts`
Expected: FAIL (`tripId` undefined nos registros / campo ausente no schema).

- [x] **Step 3: Implementar**

Em `core.ts`, constante perto de `baseFields`:

```ts
const tripIdSchema = z.string().uuid("Viagem inválida.").nullable().optional();
```

Em `baseFields`, depois de `categoryId`: `tripId: tripIdSchema,`. Em `updateBulkSchema`, depois de `categoryId`: `tripId: tripIdSchema,`.

Em `buildTransactionRecords`, no `basePayload`, depois de `categoryId`:

```ts
		// Transfers never belong to a trip (D5).
		tripId:
			data.transactionType === "Transferência" ? null : (data.tripId ?? null),
```

No ramo `if (data.condition === "Recorrente")`, no objeto de `records.push({...basePayload, ...})`, acrescentar (recorrente vincula por ocorrência, D4):

```ts
					tripId: index === 0 ? basePayload.tripId : null,
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/transactions/ && pnpm exec tsc --noEmit`
Expected: PASS (inclui os testes existentes de transactions), tsc limpo.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(transactions): gravar viagem ao criar lancamento" -- src/features/transactions/actions/core.ts src/features/transactions/actions/core-trip.test.ts
```

---

### Task 14: Actions de lançamento validam e propagam a viagem

**Depends:** Tasks 4, 5, 13.

**Files:**
- Modify: `src/features/transactions/actions/single-actions.ts` (`createTransactionAction` ~linha 54, `updateTransactionAction` ~linha 207, `updateTransactionSplitPairAction` ~linha 830)
- Modify: `src/features/transactions/actions/bulk-actions.ts` (`updateTransactionBulkAction` ~linha 170, final de `applyUpdates` ~linha 447)
- Test: `src/features/transactions/actions/trip-link-wiring.test.ts`

**Interfaces:**
- Consumes: `validateTripOwnership` (Task 4), `setTripForTransactions` (Task 5), `tripId` nos schemas (Task 13).
- Produces: em create, update, split pair e bulk update: viagem de outro usuário devolve `{ success: false, error: "Viagem não encontrada." }` antes de qualquer escrita; em update/split/bulk, quando `tripId !== undefined` **e** difere de `existing.tripId`, depois da escrita principal, `setTripForTransactions(db, user.id, [data.id], tripId)`. Vincular expande para parcelas e grupo de divisão independente do escopo escolhido; desvincular (`null`) solta só esta linha (D4, regra no helper da Task 5). `tripId` ausente ou igual ao gravado não mexe no vínculo, para não revincular uma parcela desvinculada antes.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const updateWrites: unknown[] = [];
	const dbMock = {
		query: { transactions: { findFirst: vi.fn() } },
		update: () => ({
			set: (values: unknown) => {
				updateWrites.push(values);
				return { where: () => Promise.resolve(undefined) };
			},
		}),
		transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> =>
			callback(dbMock),
	};
	return {
		updateWrites,
		dbMock,
		getUserMock: vi.fn(),
		validateTripOwnershipMock: vi.fn(),
		setTripMock: vi.fn(),
	};
});

vi.mock("@/shared/lib/auth/server", () => ({ getUser: mocks.getUserMock }));
vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: vi.fn(),
	handleActionError: (error: unknown) => ({
		success: false,
		error: error instanceof Error ? error.message : "erro",
	}),
}));
vi.mock("@/shared/lib/payers/notifications", () => ({
	buildEntriesByPayer: vi.fn(() => []),
	sendPayerAutoEmails: vi.fn(),
}));
vi.mock("./attachments", () => ({ cleanupAttachmentsAfterTransactionDelete: vi.fn() }));
vi.mock("../lib/attachment-copy", () => ({ copyAttachmentsForImport: vi.fn() }));
vi.mock("@/shared/lib/trips/queries", () => ({
	validateTripOwnership: mocks.validateTripOwnershipMock,
}));
vi.mock("@/shared/lib/trips/link", () => ({ setTripForTransactions: mocks.setTripMock }));
vi.mock("./core", async (importOriginal) => ({
	...(await importOriginal<typeof import("./core")>()),
	validateAllOwnership: vi.fn().mockResolvedValue(null),
	validateCardLimit: vi.fn().mockResolvedValue({ ok: true }),
	getPaidInvoicePeriods: vi.fn().mockResolvedValue([]),
}));

import { updateTransactionBulkAction } from "./bulk-actions";
import {
	createTransactionAction,
	updateTransactionAction,
	updateTransactionSplitPairAction,
} from "./single-actions";

const USER_ID = "user-1";
const TX_ID = "33333333-3333-4333-8333-333333333333";
const TRIP_ID = "44444444-4444-4444-8444-444444444444";
const PAYER_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

const fields = {
	purchaseDate: "2026-05-14",
	name: "Uber",
	transactionType: "Despesa" as const,
	amount: 42.5,
	condition: "À vista" as const,
	paymentMethod: "Pix" as const,
	payerId: PAYER_ID,
	accountId: ACCOUNT_ID,
	isSettled: true,
};

const existing = {
	id: TX_ID,
	name: "Uber",
	note: null,
	period: "2026-05",
	purchaseDate: new Date(2026, 4, 14),
	transactionType: "Despesa",
	condition: "À vista",
	paymentMethod: "Pix",
	payerId: PAYER_ID,
	accountId: ACCOUNT_ID,
	cardId: null,
	categoryId: null,
	seriesId: null as string | null,
	splitGroupId: null as string | null,
	tripId: null as string | null,
};

beforeEach(() => {
	mocks.updateWrites.length = 0;
	vi.clearAllMocks();
	mocks.getUserMock.mockResolvedValue({ id: USER_ID, name: "Eu", email: "eu@x" });
	mocks.validateTripOwnershipMock.mockResolvedValue(null);
	mocks.setTripMock.mockResolvedValue(1);
	mocks.dbMock.query.transactions.findFirst.mockResolvedValue(existing);
});

describe("updateTransactionAction", () => {
	it("propaga a viagem escolhida", async () => {
		const result = await updateTransactionAction({ id: TX_ID, ...fields, tripId: TRIP_ID });
		expect(result.success).toBe(true);
		expect(mocks.validateTripOwnershipMock).toHaveBeenCalledWith(USER_ID, TRIP_ID);
		expect(mocks.setTripMock).toHaveBeenCalledWith(mocks.dbMock, USER_ID, [TX_ID], TRIP_ID);
	});

	it("limpar o campo desvincula esta linha", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({ ...existing, tripId: TRIP_ID });
		await updateTransactionAction({ id: TX_ID, ...fields, tripId: null });
		expect(mocks.setTripMock).toHaveBeenCalledWith(mocks.dbMock, USER_ID, [TX_ID], null);
	});

	it("salvar com a mesma viagem gravada não repropaga", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({ ...existing, tripId: TRIP_ID });
		await updateTransactionAction({ id: TX_ID, ...fields, tripId: TRIP_ID });
		expect(mocks.setTripMock).not.toHaveBeenCalled();
	});

	it("sem tripId no payload não mexe no vínculo", async () => {
		await updateTransactionAction({ id: TX_ID, ...fields });
		expect(mocks.setTripMock).not.toHaveBeenCalled();
	});

	it("viagem de outro usuário não grava nada", async () => {
		mocks.validateTripOwnershipMock.mockResolvedValue("Viagem não encontrada.");
		const result = await updateTransactionAction({ id: TX_ID, ...fields, tripId: TRIP_ID });
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
		expect(mocks.updateWrites).toHaveLength(0);
		expect(mocks.setTripMock).not.toHaveBeenCalled();
	});
});

describe("updateTransactionSplitPairAction", () => {
	it("propaga para o grupo de divisão", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			splitGroupId: "grupo-jantar",
		});
		await updateTransactionSplitPairAction({ id: TX_ID, ...fields, tripId: TRIP_ID });
		expect(mocks.setTripMock).toHaveBeenCalledWith(mocks.dbMock, USER_ID, [TX_ID], TRIP_ID);
	});
});

describe("updateTransactionBulkAction", () => {
	it("escopo 'só esta' ainda vincula (o helper expande as parcelas)", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			condition: "Parcelado",
			seriesId: "serie-tap",
		});
		const result = await updateTransactionBulkAction({
			id: TX_ID,
			scope: "current",
			name: "TAP",
			tripId: TRIP_ID,
		});
		expect(result.success).toBe(true);
		expect(mocks.setTripMock).toHaveBeenCalledWith(mocks.dbMock, USER_ID, [TX_ID], TRIP_ID);
	});

	it("viagem de outro usuário é rejeitada", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			seriesId: "serie-tap",
		});
		mocks.validateTripOwnershipMock.mockResolvedValue("Viagem não encontrada.");
		const result = await updateTransactionBulkAction({
			id: TX_ID,
			scope: "all",
			name: "TAP",
			tripId: TRIP_ID,
		});
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
		expect(mocks.updateWrites).toHaveLength(0);
	});
});

describe("createTransactionAction", () => {
	it("viagem de outro usuário é rejeitada antes de inserir", async () => {
		mocks.validateTripOwnershipMock.mockResolvedValue("Viagem não encontrada.");
		const result = await createTransactionAction({ ...fields, tripId: TRIP_ID });
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
	});
});
```

Se algum `refine` de `refineLancamento` exigir campo extra para Pix e o update falhar por validação, acrescente o campo ao objeto `fields` (não afrouxe o schema).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/transactions/actions/trip-link-wiring.test.ts`
Expected: FAIL (`setTripMock` nunca chamado; ownership não validado).

- [ ] **Step 3: Implementar**

Nos dois arquivos, importar:

```ts
import { setTripForTransactions } from "@/shared/lib/trips/link";
import { validateTripOwnership } from "@/shared/lib/trips/queries";
```

Em `createTransactionAction`, `updateTransactionAction`, `updateTransactionSplitPairAction` e `updateTransactionBulkAction`, logo após o bloco `if (ownershipError) { ... }`:

```ts
		const tripError = await validateTripOwnership(user.id, data.tripId);
		if (tripError) {
			return { success: false, error: tripError };
		}
```

Nos `findFirst` de `existing` de `updateTransactionAction`, `updateTransactionSplitPairAction` e `updateTransactionBulkAction`, acrescentar `tripId: true` em `columns` (e `tripId: string | null` no cast de tipo de `updateTransactionAction`).

Em `updateTransactionAction`, depois do `await db.update(transactions)...` principal e antes do bloco de saldo inicial:

```ts
		// Only a real change propagates: re-saving must not relink an installment
		// that was unlinked on its own (D4).
		if (data.tripId !== undefined && data.tripId !== existing.tripId) {
			await setTripForTransactions(db, user.id, [data.id], data.tripId);
		}
```

Em `updateTransactionSplitPairAction`, depois do `await db.transaction(...)` e antes de `revalidate(user.id)`: o mesmo bloco.

Em `bulk-actions.ts`, no final de `applyUpdates` (depois do `await db.transaction(...)` dela), que roda uma vez por escopo bem-sucedido:

```ts
			if (data.tripId !== undefined && data.tripId !== existing.tripId) {
				await setTripForTransactions(db, user.id, [data.id], data.tripId);
			}
```

`createTransactionAction` não chama `setTripForTransactions`: os registros já saem com `tripId` (Task 13).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/transactions/ && pnpm exec tsc --noEmit`
Expected: PASS em todo `src/features/transactions/`, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(transactions): validar e propagar viagem ao editar lancamento" -- src/features/transactions/actions/single-actions.ts src/features/transactions/actions/bulk-actions.ts src/features/transactions/actions/trip-link-wiring.test.ts
```

---

### Task 15: Estado do formulário e TransactionItem carregam a viagem

**Depends:** Task 1.

**Files:**
- Modify: `src/features/transactions/components/types.ts` (`TransactionItem`, ~linha 36)
- Modify: `src/features/transactions/lib/page-helpers.ts` (`mapTransactionsData`, ~linha 603)
- Modify: `src/features/transactions/lib/form-helpers.ts` (`TransactionFormState` ~linha 66, `buildTransactionInitialState` ~linha 211)
- Test: `src/features/transactions/lib/form-helpers-trip.test.ts`

**Interfaces:**
- Produces: `TransactionItem.tripId?: string | null`; `mapTransactionsData` preenche `tripId`; `TransactionFormState.tripId: string | undefined` (edição mostra o gravado; importação começa vazia).

- [x] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { TransactionItem } from "../components/types";
import { buildTransactionInitialState } from "./form-helpers";
import { mapTransactionsData } from "./page-helpers";

const TRIP_ID = "44444444-4444-4444-8444-444444444444";

const transaction: TransactionItem = {
	id: "t1",
	userId: "user-1",
	name: "Uber",
	purchaseDate: "2026-05-14",
	period: "2026-05",
	transactionType: "Despesa",
	amount: -42.5,
	condition: "À vista",
	paymentMethod: "Pix",
	payerId: null,
	pagadorName: null,
	pagadorAvatar: null,
	pagadorRole: null,
	accountId: null,
	contaName: null,
	contaLogo: null,
	cardId: null,
	cartaoName: null,
	cartaoLogo: null,
	categoryId: null,
	categoriaName: null,
	categoriaType: null,
	categoriaIcon: null,
	installmentCount: null,
	recurrenceCount: null,
	currentInstallment: null,
	dueDate: null,
	boletoPaymentDate: null,
	note: null,
	isSettled: true,
	isDivided: false,
	isAnticipated: false,
	anticipationId: null,
	seriesId: null,
	splitGroupId: null,
	hasAttachments: false,
	tripId: TRIP_ID,
};

describe("tripId no formulário", () => {
	it("edição mostra a viagem gravada", () => {
		expect(buildTransactionInitialState(transaction).tripId).toBe(TRIP_ID);
	});

	it("criação começa sem viagem", () => {
		expect(buildTransactionInitialState(undefined).tripId).toBeUndefined();
	});

	it("importação de outro lançamento não copia a viagem", () => {
		expect(
			buildTransactionInitialState(transaction, null, undefined, { isImporting: true }).tripId,
		).toBeUndefined();
	});
});

describe("mapTransactionsData", () => {
	it("leva tripId da linha do banco", () => {
		const [mapped] = mapTransactionsData([{ id: "t1", tripId: TRIP_ID }]);
		expect(mapped?.tripId).toBe(TRIP_ID);
		const [withoutTrip] = mapTransactionsData([{ id: "t2" }]);
		expect(withoutTrip?.tripId).toBeNull();
	});
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/transactions/lib/form-helpers-trip.test.ts`
Expected: FAIL (`tripId` ausente).

- [x] **Step 3: Implementar**

`types.ts`, em `TransactionItem` depois de `splitGroupId`: `tripId?: string | null;`

`page-helpers.ts`, em `mapTransactionsData` depois de `splitGroupId`: `tripId: item.tripId ?? null,`

`form-helpers.ts`: em `TransactionFormState` depois de `note: string;`: `tripId: string | undefined;`. No retorno de `buildTransactionInitialState`, depois de `note`:

```ts
		tripId: isImporting ? undefined : (transaction?.tripId ?? undefined),
```

- [x] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/transactions/lib/form-helpers-trip.test.ts && pnpm exec tsc --noEmit`
Expected: PASS. Se o tsc acusar outro lugar que monta `TransactionFormState` literal, acrescente `tripId: undefined` lá e liste o arquivo no relatório.

- [x] **Step 5: Commit**

```bash
git commit -m "feat(transactions): formulario carrega a viagem do lancamento" -- src/features/transactions/components/types.ts src/features/transactions/lib/page-helpers.ts src/features/transactions/lib/form-helpers.ts src/features/transactions/lib/form-helpers-trip.test.ts
```

---

### Task 16: Pré-preenchimento e campo Viagem do diálogo

**Depends:** Tasks 3, 4, 15.

**Files:**
- Create: `src/features/transactions/lib/trip-prefill.ts`
- Create: `src/features/transactions/components/dialogs/transaction-dialog/trip-section.tsx`
- Modify: `src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog-types.ts` (nova interface `TripSectionProps`)
- Test: `src/features/transactions/lib/trip-prefill.test.ts`

**Interfaces:**
- Consumes: `findTripForDate`, `TripOption` (Task 3), `FormState.tripId` (Task 15).
- Produces:
  - `resolveAutoTripId(input: { mode: "create" | "update"; touched: boolean; trips: TripOption[]; purchaseDate: string; currentTripId: string | undefined }): string | undefined`
  - `TripSection({ formState, onFieldChange, tripOptions, onTouched }: TripSectionProps)`
  - `interface TripSectionProps extends BaseFieldSectionProps { tripOptions: TripOption[]; onTouched: () => void }`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { TripOption } from "@/shared/lib/trips/types";
import { resolveAutoTripId } from "./trip-prefill";

const lisboa: TripOption = {
	id: "trip-lisboa",
	name: "Lisboa",
	startDate: "2026-05-12",
	endDate: "2026-05-22",
};
const base = {
	mode: "create" as const,
	touched: false,
	trips: [lisboa],
	purchaseDate: "2026-05-14",
	currentTripId: undefined,
};

describe("resolveAutoTripId", () => {
	it("compra em 14/05 vem com Lisboa", () => {
		expect(resolveAutoTripId(base)).toBe("trip-lisboa");
	});

	it("mudar a data para fora do intervalo limpa enquanto o usuário não mexeu", () => {
		expect(
			resolveAutoTripId({ ...base, purchaseDate: "2026-03-02", currentTripId: "trip-lisboa" }),
		).toBeUndefined();
	});

	it("escolha manual (passagem em 02/03) não é sobrescrita", () => {
		expect(
			resolveAutoTripId({
				...base,
				touched: true,
				purchaseDate: "2026-03-02",
				currentTripId: "trip-lisboa",
			}),
		).toBe("trip-lisboa");
	});

	it("limpar manualmente dentro do intervalo continua limpo", () => {
		expect(resolveAutoTripId({ ...base, touched: true, currentTripId: undefined })).toBeUndefined();
	});

	it("edição mostra o gravado e não recalcula", () => {
		expect(
			resolveAutoTripId({ ...base, mode: "update", currentTripId: undefined }),
		).toBeUndefined();
	});

	it("viagens ainda não carregadas não apagam nada", () => {
		expect(resolveAutoTripId({ ...base, trips: [] })).toBeUndefined();
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run src/features/transactions/lib/trip-prefill.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/features/transactions/lib/trip-prefill.ts`:

```ts
import { findTripForDate } from "@/shared/lib/trips/find-trip-for-date";
import type { TripOption } from "@/shared/lib/trips/types";

// Prefill is only a UI suggestion (D3): it follows the purchase date on create
// until the user touches the field; update shows the stored value untouched.
export function resolveAutoTripId(input: {
	mode: "create" | "update";
	touched: boolean;
	trips: TripOption[];
	purchaseDate: string;
	currentTripId: string | undefined;
}): string | undefined {
	if (input.mode !== "create" || input.touched) return input.currentTripId;
	return findTripForDate(input.trips, input.purchaseDate)?.id;
}
```

Em `transaction-dialog-types.ts`, importar `import type { TripOption } from "@/shared/lib/trips/types";` e acrescentar:

```ts
export interface TripSectionProps extends BaseFieldSectionProps {
	tripOptions: TripOption[];
	onTouched: () => void;
}
```

`trip-section.tsx`:

```tsx
"use client";

import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { TripSectionProps } from "./transaction-dialog-types";

const NO_TRIP = "__none__";

export function TripSection({
	formState,
	onFieldChange,
	tripOptions,
	onTouched,
}: TripSectionProps) {
	return (
		<div className="space-y-1">
			<Label htmlFor="tripId">Viagem</Label>
			<Select
				value={formState.tripId ?? NO_TRIP}
				onValueChange={(value) => {
					onTouched();
					onFieldChange("tripId", value === NO_TRIP ? undefined : value);
				}}
			>
				<SelectTrigger id="tripId" className="w-full">
					<SelectValue placeholder="Nenhuma" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_TRIP}>Nenhuma</SelectItem>
					{tripOptions.map((trip) => (
						<SelectItem key={trip.id} value={trip.id}>
							{trip.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run src/features/transactions/lib/trip-prefill.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(transactions): campo Viagem com pre-preenchimento pela data" -- src/features/transactions/lib/trip-prefill.ts src/features/transactions/lib/trip-prefill.test.ts src/features/transactions/components/dialogs/transaction-dialog/trip-section.tsx src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog-types.ts
```

---

### Task 17: Ligar o campo Viagem no diálogo e na edição em série/divisão

**Depends:** Tasks 13, 14, 16.

**Files:**
- Modify: `src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog.tsx`
- Modify: `src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog-types.ts` (`onBulkEditRequest` e `onSplitEditRequest` ganham `tripId: string | null`)
- Modify: `src/features/transactions/components/page/transactions-page.tsx` (tipos de `pendingSplitEditData` ~linha 157 e `pendingEditData` ~linha 177, `handleBulkEditRequest` ~linha 310, `handleBulkEdit` ~linha 344, payload de `handleSplitEdit` ~linha 462)

**Interfaces:**
- Consumes: `fetchTripOptionsAction` (Task 4), `isTripEligible` (Task 3), `resolveAutoTripId`, `TripSection` (Task 16), `tripId` nos schemas e actions (Tasks 13 e 14).
- Produces: comportamento de UI do spec "Campo Viagem no lançamento". Sem teste automatizado (não há RTL no repo); a lógica está coberta pelas Tasks 3, 14 e 16. Portão: `tsc` + lint por arquivo.

- [ ] **Step 1: Estado e carregamento das viagens**

Em `transaction-dialog.tsx`, imports:

```ts
import { fetchTripOptionsAction } from "@/shared/lib/trips/actions";
import { isTripEligible } from "@/shared/lib/trips/eligibility";
import type { TripOption } from "@/shared/lib/trips/types";
import { resolveAutoTripId } from "@/features/transactions/lib/trip-prefill";
import { TripSection } from "./trip-section";
```

Depois de `const [extrasOpen, setExtrasOpen] = useState(false);`:

```ts
	const [tripOptions, setTripOptions] = useState<TripOption[]>([]);
	const [tripTouched, setTripTouched] = useState(false);
```

Depois do `useEffect` existente que reinicia o formulário quando `dialogOpen` muda (ordem importa: este roda depois do reset):

```ts
	useEffect(() => {
		if (!dialogOpen) return;
		setTripTouched(false);
		let cancelled = false;
		fetchTripOptionsAction()
			.then((options) => {
				if (!cancelled) setTripOptions(options);
			})
			.catch(() => {
				if (!cancelled) setTripOptions([]);
			});
		return () => {
			cancelled = true;
		};
	}, [dialogOpen]);

	const purchaseDate = formState.purchaseDate;
	useEffect(() => {
		if (!dialogOpen) return;
		setFormState((prev) => {
			const next = resolveAutoTripId({
				mode,
				touched: tripTouched,
				trips: tripOptions,
				purchaseDate,
				currentTripId: prev.tripId,
			});
			return next === prev.tripId ? prev : { ...prev, tripId: next };
		});
	}, [dialogOpen, mode, tripTouched, tripOptions, purchaseDate]);

	const showTripField = isTripEligible({
		transactionType: formState.transactionType,
		note: transaction?.note ?? null,
	});
	const tripIdForSubmit = showTripField ? (formState.tripId ?? null) : null;
```

- [ ] **Step 2: Payloads**

No `payload: CreateTransactionInput` (~linha 324), depois de `note`: `tripId: tripIdForSubmit,` (o `updatePayload` já espalha `payload`). Em `onBulkEditRequest({...})` e `onSplitEditRequest({...})`, depois de `note`: `tripId: tripIdForSubmit,`.

Em `transaction-dialog-types.ts`, nos tipos de `data` de `onBulkEditRequest` e `onSplitEditRequest`, depois de `note: string;`: `tripId: string | null;`.

Em `transactions-page.tsx`: acrescentar `tripId: string | null;` nos tipos de estado `pendingSplitEditData` e `pendingEditData` e no parâmetro de `handleBulkEditRequest`; em `handleBulkEdit`, no objeto de `updateTransactionBulkAction`, depois de `note`: `tripId: pendingEditData.tripId,`; no `payload` de `handleSplitEdit`, depois de `note`: `tripId: pendingSplitEditData.tripId,`.

- [ ] **Step 3: Renderizar a seção**

Nos dois ramos de extras (edição ~linha 655 e criação ~linha 708), imediatamente antes de cada `<NoteSection`:

```tsx
									{showTripField ? (
										<TripSection
											formState={formState}
											onFieldChange={handleFieldChange}
											tripOptions={tripOptions}
											onTouched={() => setTripTouched(true)}
										/>
									) : null}
```

- [ ] **Step 4: Verificar**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run src/features/transactions/ && pnpm exec biome check --formatter-enabled=false src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog.tsx src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog-types.ts src/features/transactions/components/page/transactions-page.tsx`
Expected: tudo verde. Se o Biome acusar `useExhaustiveDependencies`, ajuste as dependências sem suprimir a regra.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(transactions): campo Viagem no dialogo de lancamento" -- src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog.tsx src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog-types.ts src/features/transactions/components/page/transactions-page.tsx
```

---

### Task 18: Diálogo de criar/editar viagem

**Depends:** Task 8.

**Files:**
- Create: `src/features/trips/components/trip-dialog.tsx`

**Interfaces:**
- Consumes: `createTripAction`, `updateTripAction` (Task 8).
- Produces: `TripDialog({ mode, trip, trigger, open, onOpenChange }: { mode: "create" | "update"; trip?: { id: string; name: string; startDate: string; endDate: string; note: string | null }; trigger?: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void })`. Sem teste automatizado (sem RTL); validação e sobreposição já testadas nas Tasks 7 e 8.

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createTripAction, updateTripAction } from "@/features/trips/actions";
import { Button } from "@/shared/components/ui/button";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useControlledState } from "@/shared/hooks/use-controlled-state";

type TripDialogTrip = {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
	note: string | null;
};

type TripDialogProps = {
	mode: "create" | "update";
	trip?: TripDialogTrip;
	trigger?: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
};

const emptyForm = { name: "", startDate: "", endDate: "", note: "" };

export function TripDialog({ mode, trip, trigger, open, onOpenChange }: TripDialogProps) {
	const [dialogOpen, setDialogOpen] = useControlledState(open, false, onOpenChange);
	const [form, setForm] = useState(emptyForm);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!dialogOpen) return;
		setErrorMessage(null);
		setForm(
			trip
				? { name: trip.name, startDate: trip.startDate, endDate: trip.endDate, note: trip.note ?? "" }
				: emptyForm,
		);
	}, [dialogOpen, trip]);

	const update = (key: keyof typeof emptyForm) => (value: string) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		startTransition(async () => {
			const result =
				mode === "update" && trip
					? await updateTripAction({ ...form, id: trip.id })
					: await createTripAction(form);
			if (!result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			setDialogOpen(false);
		});
	};

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{mode === "update" ? "Editar viagem" : "Nova viagem"}</DialogTitle>
					<DialogDescription>
						Os lançamentos com data da compra no período passam a ser sugeridos para esta viagem.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-3">
					<div className="space-y-1">
						<Label htmlFor="trip-name">Nome</Label>
						<Input
							id="trip-name"
							value={form.name}
							maxLength={60}
							onChange={(event) => update("name")(event.target.value)}
							placeholder="Ex.: Lisboa"
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1">
							<Label htmlFor="trip-start">Início</Label>
							<DatePicker id="trip-start" value={form.startDate} onChange={update("startDate")} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="trip-end">Fim</Label>
							<DatePicker id="trip-end" value={form.endDate} onChange={update("endDate")} />
						</div>
					</div>
					<div className="space-y-1">
						<Label htmlFor="trip-note">Anotação</Label>
						<Textarea
							id="trip-note"
							value={form.note}
							maxLength={500}
							rows={2}
							onChange={(event) => update("note")(event.target.value)}
						/>
					</div>
					{errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
					<DialogFooter>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm exec tsc --noEmit && pnpm exec biome check --formatter-enabled=false src/features/trips/components/trip-dialog.tsx`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(trips): dialogo de criar e editar viagem" -- src/features/trips/components/trip-dialog.tsx
```

---

### Task 19: Página /trips (lista)

**Depends:** Tasks 6, 12, 18.

**Files:**
- Create: `src/app/(dashboard)/trips/layout.tsx`
- Create: `src/app/(dashboard)/trips/page.tsx`
- Create: `src/features/trips/components/trips-page.tsx`

**Interfaces:**
- Consumes: `fetchTripsOverview`, `TripListItem` (Task 12), `TripDialog` (Task 18).
- Produces: rota `/trips`. Sem teste automatizado (página fina; query testada na Task 12).

- [ ] **Step 1: Implementar**

`src/app/(dashboard)/trips/layout.tsx`:

```tsx
import { RiPlaneLine } from "@remixicon/react";
import PageDescription from "@/shared/components/page-description";

export const metadata = {
	title: "Viagens",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiPlaneLine />}
				title="Viagens"
				subtitle="Quanto cada viagem custou, somando cartões e contas, mesmo quando a fatura cai no mês seguinte."
			/>
			{children}
		</section>
	);
}
```

`src/app/(dashboard)/trips/page.tsx`:

```tsx
import { connection } from "next/server";
import { TripsPage } from "@/features/trips/components/trips-page";
import { fetchTripsOverview } from "@/features/trips/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const trips = await fetchTripsOverview(userId);

	return (
		<main className="flex flex-col gap-6">
			<TripsPage trips={trips} />
		</main>
	);
}
```

`src/features/trips/components/trips-page.tsx`:

```tsx
"use client";

import { RiAddLine, RiPlaneLine } from "@remixicon/react";
import Link from "next/link";
import type { TripListItem } from "@/features/trips/queries";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import { TripDialog } from "./trip-dialog";

const SHORT_DATE = { day: "2-digit", month: "short" } as const;

export function TripsPage({ trips }: { trips: TripListItem[] }) {
	const newTripButton = (
		<TripDialog
			mode="create"
			trigger={
				<Button>
					<RiAddLine className="size-4" />
					Nova viagem
				</Button>
			}
		/>
	);

	if (trips.length === 0) {
		return (
			<EmptyState
				media={<RiPlaneLine />}
				mediaVariant="icon"
				title="Nenhuma viagem ainda"
				description="Crie uma viagem para juntar os gastos dela em um só lugar."
				action={newTripButton}
			/>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex justify-end">{newTripButton}</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{trips.map((trip) => (
					<Link key={trip.id} href={`/trips/${trip.id}`} className="block">
						<Card className="h-full transition-colors hover:border-primary/50">
							<CardHeader>
								<CardTitle>{trip.name}</CardTitle>
								<p className="text-sm text-muted-foreground">
									{formatDateOnly(trip.startDate, SHORT_DATE)} a{" "}
									{formatDateOnly(trip.endDate)}
								</p>
							</CardHeader>
							<CardContent className="flex items-end justify-between">
								<span className="text-sm text-muted-foreground">
									{trip.linkedCount} lançamento(s)
								</span>
								<span className="text-lg font-semibold">{formatCurrency(trip.netCost)}</span>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
```

`trips-page.tsx` é client e importa o tipo `TripListItem` de `queries.ts` com `import type`, que não leva código de servidor ao bundle.

- [ ] **Step 2: Verificar**

Run: `pnpm exec next typegen && pnpm exec tsc --noEmit && pnpm exec biome check --formatter-enabled=false "src/app/(dashboard)/trips/layout.tsx" "src/app/(dashboard)/trips/page.tsx" src/features/trips/components/trips-page.tsx`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(trips): pagina de lista de viagens" -- "src/app/(dashboard)/trips/layout.tsx" "src/app/(dashboard)/trips/page.tsx" src/features/trips/components/trips-page.tsx
```

---

### Task 20: Página /trips/[tripId]: cabeçalho, totais e quebras

**Depends:** Tasks 8, 11, 18.

**Files:**
- Create: `src/app/(dashboard)/trips/[tripId]/page.tsx`
- Create: `src/features/trips/components/trip-detail-page.tsx`
- Create: `src/features/trips/components/trip-summary-cards.tsx`
- Create: `src/features/trips/components/trip-breakdowns.tsx`

**Interfaces:**
- Consumes: `fetchTripDetail`, `TripDetail` (Task 11), `TripDialog` (Task 18), `deleteTripAction` (Task 8).
- Produces: rota `/trips/[tripId]` com layout "tudo visível" (cards de total, grade de quebras); `TripDetailPage` reserva os slots `linkedSlot` e `suggestionsSlot` preenchidos na Task 21. Sem teste automatizado.

- [ ] **Step 1: Implementar**

`src/app/(dashboard)/trips/[tripId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TripDetailPage } from "@/features/trips/components/trip-detail-page";
import { fetchTripDetail } from "@/features/trips/queries";
import { getUserId } from "@/shared/lib/auth/server";

type PageProps = {
	params: Promise<{ tripId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: PageProps) {
	await connection();
	const { tripId } = await params;
	if (!UUID.test(tripId)) notFound();

	const userId = await getUserId();
	const detail = await fetchTripDetail(userId, tripId);
	if (!detail) notFound();

	return (
		<main className="flex flex-col gap-6">
			<TripDetailPage detail={detail} />
		</main>
	);
}
```

`src/features/trips/components/trip-summary-cards.tsx`:

```tsx
import type { TripSummary } from "@/features/trips/lib/summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";

export function TripSummaryCards({ summary }: { summary: TripSummary }) {
	const cards = [
		{ label: "Custo líquido", value: summary.netCost, emphasis: true },
		{ label: "Despesas", value: summary.expenses, emphasis: false },
		{ label: "Reembolsos", value: summary.reimbursements, emphasis: false },
	];
	return (
		<div className="grid gap-4 sm:grid-cols-3">
			{cards.map((card) => (
				<Card key={card.label}>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{card.label}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<span className={card.emphasis ? "text-2xl font-semibold" : "text-xl"}>
							{formatCurrency(card.value)}
						</span>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
```

`src/features/trips/components/trip-breakdowns.tsx`:

```tsx
import type { TripBreakdownItem, TripSummary } from "@/features/trips/lib/summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";

function BreakdownCard({ title, items }: { title: string; items: TripBreakdownItem[] }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
				) : (
					<ul className="space-y-1">
						{items.map((item) => (
							<li key={item.label} className="flex justify-between gap-2 text-sm">
								<span className="truncate">{item.label}</span>
								<span className="tabular-nums">{formatCurrency(item.amount)}</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

export function TripBreakdowns({ summary }: { summary: TripSummary }) {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			<BreakdownCard title="Por categoria" items={summary.byCategory} />
			<BreakdownCard title="Por cartão ou conta" items={summary.bySource} />
			<BreakdownCard title="Por pessoa" items={summary.byPayer} />
		</div>
	);
}
```

`src/features/trips/components/trip-detail-page.tsx`:

```tsx
"use client";

import { RiDeleteBinLine, RiPencilLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteTripAction } from "@/features/trips/actions";
import type { TripDetail } from "@/features/trips/queries";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { Button } from "@/shared/components/ui/button";
import { formatDateOnly } from "@/shared/utils/date";
import { TripBreakdowns } from "./trip-breakdowns";
import { TripDialog } from "./trip-dialog";
import { TripSummaryCards } from "./trip-summary-cards";

type TripDetailPageProps = {
	detail: TripDetail;
	linkedSlot?: React.ReactNode;
	suggestionsSlot?: React.ReactNode;
};

export function TripDetailPage({ detail, linkedSlot, suggestionsSlot }: TripDetailPageProps) {
	const router = useRouter();
	const { trip } = detail;

	const handleDelete = async () => {
		const result = await deleteTripAction({ id: trip.id });
		if (!result.success) {
			toast.error(result.error);
			return;
		}
		toast.success(result.message);
		router.push("/trips");
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">{trip.name}</h2>
					<p className="text-sm text-muted-foreground">
						{formatDateOnly(trip.startDate)} a {formatDateOnly(trip.endDate)}
					</p>
					{trip.note ? <p className="mt-1 text-sm">{trip.note}</p> : null}
				</div>
				<div className="flex gap-2">
					<TripDialog
						mode="update"
						trip={trip}
						trigger={
							<Button variant="outline" size="sm">
								<RiPencilLine className="size-4" />
								Editar
							</Button>
						}
					/>
					<ConfirmActionDialog
						title="Excluir viagem?"
						description="Os lançamentos continuam existindo, só deixam de pertencer a esta viagem."
						confirmLabel="Excluir"
						confirmVariant="destructive"
						onConfirm={handleDelete}
						trigger={
							<Button variant="outline" size="sm">
								<RiDeleteBinLine className="size-4" />
								Excluir
							</Button>
						}
					/>
				</div>
			</div>

			<TripSummaryCards summary={detail.summary} />
			<TripBreakdowns summary={detail.summary} />

			<div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
				<div>{linkedSlot}</div>
				<div>{suggestionsSlot}</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm exec next typegen && pnpm exec tsc --noEmit && pnpm exec biome check --formatter-enabled=false "src/app/(dashboard)/trips/[tripId]/page.tsx" src/features/trips/components/trip-detail-page.tsx src/features/trips/components/trip-summary-cards.tsx src/features/trips/components/trip-breakdowns.tsx`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(trips): pagina da viagem com totais e quebras" -- "src/app/(dashboard)/trips/[tripId]/page.tsx" src/features/trips/components/trip-detail-page.tsx src/features/trips/components/trip-summary-cards.tsx src/features/trips/components/trip-breakdowns.tsx
```

---

### Task 21: Lançamentos vinculados e sugestões na página da viagem

**Depends:** Tasks 9, 20.

**Files:**
- Create: `src/features/trips/components/trip-transactions-list.tsx`
- Create: `src/features/trips/components/trip-suggestions.tsx`
- Modify: `src/features/trips/components/trip-detail-page.tsx` (preencher os slots)

**Interfaces:**
- Consumes: `linkTransactionsToTripAction`, `unlinkTransactionsFromTripAction` (Task 9), `TripTransactionRow` (Task 10).
- Produces: lista de vinculados com "Desvincular" por linha; caixa lateral de sugestões com checkbox e "Vincular selecionados". Sem teste automatizado; as actions estão testadas na Task 9.

- [ ] **Step 1: Implementar**

Rótulo compartilhado de linha, no topo de cada componente (duplicado de propósito, 3 linhas):

```ts
const installmentLabel = (row: TripTransactionRow) =>
	row.currentInstallment && row.installmentCount
		? ` (${row.currentInstallment}/${row.installmentCount})`
		: "";
```

`trip-transactions-list.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { unlinkTransactionsFromTripAction } from "@/features/trips/actions";
import type { TripTransactionRow } from "@/features/trips/lib/summary";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

const installmentLabel = (row: TripTransactionRow) =>
	row.currentInstallment && row.installmentCount
		? ` (${row.currentInstallment}/${row.installmentCount})`
		: "";

export function TripTransactionsList({ rows }: { rows: TripTransactionRow[] }) {
	const [isPending, startTransition] = useTransition();

	const unlink = (id: string) =>
		startTransition(async () => {
			const result = await unlinkTransactionsFromTripAction({ transactionIds: [id] });
			if (result.success) toast.success(result.message);
			else toast.error(result.error);
		});

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">Lançamentos da viagem</CardTitle>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nenhum lançamento vinculado. Use as sugestões ou o campo Viagem no lançamento.
					</p>
				) : (
					<ul className="divide-y">
						{rows.map((row) => (
							<li key={row.id} className="flex items-center justify-between gap-2 py-2 text-sm">
								<div className="min-w-0">
									<p className="truncate">
										{row.name}
										{installmentLabel(row)}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatDateOnly(row.purchaseDate)} · {row.payerName ?? "Sem pessoa"}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<span className="tabular-nums">{formatCurrency(row.amount)}</span>
									<Button
										variant="ghost"
										size="sm"
										disabled={isPending}
										onClick={() => unlink(row.id)}
									>
										Desvincular
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
```

`trip-suggestions.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { linkTransactionsToTripAction } from "@/features/trips/actions";
import type { TripTransactionRow } from "@/features/trips/lib/summary";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

const installmentLabel = (row: TripTransactionRow) =>
	row.currentInstallment && row.installmentCount
		? ` (${row.currentInstallment}/${row.installmentCount})`
		: "";

export function TripSuggestions({ tripId, rows }: { tripId: string; rows: TripTransactionRow[] }) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isPending, startTransition] = useTransition();

	const toggle = (id: string, checked: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});

	const linkSelected = () =>
		startTransition(async () => {
			const result = await linkTransactionsToTripAction({
				tripId,
				transactionIds: [...selected],
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			setSelected(new Set());
		});

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">Sugestões</CardTitle>
				<p className="text-xs text-muted-foreground">
					Lançamentos sem viagem com data da compra no período.
				</p>
			</CardHeader>
			<CardContent className="space-y-3">
				{rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhuma sugestão.</p>
				) : (
					<ul className="space-y-2">
						{rows.map((row) => (
							<li key={row.id} className="flex items-start gap-2 text-sm">
								<Checkbox
									id={`suggestion-${row.id}`}
									checked={selected.has(row.id)}
									onCheckedChange={(checked) => toggle(row.id, checked === true)}
								/>
								<label htmlFor={`suggestion-${row.id}`} className="min-w-0 flex-1">
									<span className="block truncate">
										{row.name}
										{installmentLabel(row)}
									</span>
									<span className="text-xs text-muted-foreground">
										{formatDateOnly(row.purchaseDate)} · {formatCurrency(row.amount)}
									</span>
								</label>
							</li>
						))}
					</ul>
				)}
				<Button
					className="w-full"
					size="sm"
					disabled={selected.size === 0 || isPending}
					onClick={linkSelected}
				>
					Vincular selecionados
				</Button>
			</CardContent>
		</Card>
	);
}
```

Em `trip-detail-page.tsx`, importar os dois componentes e trocar `{linkedSlot}` e `{suggestionsSlot}` por:

```tsx
				<div>
					<TripTransactionsList rows={detail.linked} />
				</div>
				<div>
					<TripSuggestions tripId={trip.id} rows={detail.suggestions} />
				</div>
```

removendo as props `linkedSlot`/`suggestionsSlot` (órfãs desta task).

- [ ] **Step 2: Verificar**

Run: `pnpm exec tsc --noEmit && pnpm exec biome check --formatter-enabled=false src/features/trips/components/trip-transactions-list.tsx src/features/trips/components/trip-suggestions.tsx src/features/trips/components/trip-detail-page.tsx`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(trips): vinculados e sugestoes em lote na pagina da viagem" -- src/features/trips/components/trip-transactions-list.tsx src/features/trips/components/trip-suggestions.tsx src/features/trips/components/trip-detail-page.tsx
```

---

### Task 22: Versão 2.12.0, README e verificação completa

**Depends:** todas as anteriores.

**Files:**
- Modify: `CHANGELOG.md` (nova seção no topo, acima de `## [2.11.5]`)
- Modify: `package.json` (`"version": "2.12.0"`)
- Modify: `README.md` (badge na linha 13; bullet em "### Funcionalidades")

**Interfaces:**
- Produces: versão minor preparada, coerente nos três lugares (AGENTS.md regra 6). Não criar nem enviar tag.

- [ ] **Step 1: CHANGELOG**

```markdown
## [2.12.0] - <data do dia, YYYY-MM-DD>

Dava para saber quanto se gastou num mês, mas não numa viagem: a compra no cartão cai na fatura seguinte e, no meio da viagem, aluguel e assinaturas continuam correndo. Esta versão traz as viagens. Cada lançamento pode pertencer a uma viagem; o diálogo já sugere a viagem pela data da compra, a página da viagem lista os lançamentos do período ainda sem vínculo para vincular em lote, e parcelados e divididos entram inteiros. O total mostrado é o custo líquido da pessoa principal: despesas menos reembolsos, pagos ou não.

### Adicionado

- Viagens: cadastro com nome, período e anotação, sem sobreposição entre viagens
- Campo "Viagem" no lançamento, pré-preenchido pela data da compra
- Página da viagem com custo líquido, despesas, reembolsos e quebras por categoria, cartão ou conta e pessoa
- Sugestões de vínculo com vinculação em lote e desvinculação
- Item "Viagens" no menu
```

- [ ] **Step 2: package.json e README**

`package.json`: `"version": "2.12.0"`. `README.md` linha 13: `version-2.11.5-blue` vira `version-2.12.0-blue`. Em "### Funcionalidades", depois do bullet do Calendário:

```markdown
✈️ **Viagens**: agrupe os gastos de uma viagem, de qualquer cartão ou conta, mesmo quando a fatura cai no mês seguinte. Sugestão automática pela data, vínculo em lote e custo líquido com reembolsos.
```

(Não alterar os bullets existentes.)

- [ ] **Step 3: Verificação completa**

Run, um por vez:

```bash
pnpm exec next typegen
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=4
pnpm exec biome check --formatter-enabled=false $(git diff --name-only main...HEAD -- '*.ts' '*.tsx' '*.json')
graphify update .
```

Expected: typegen e tsc sem erros; vitest todo verde; biome sem erros nos arquivos alterados; graphify atualizado. Conferir que `package.json`, `CHANGELOG.md` e o badge dizem `2.12.0`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(trips): viagens com vinculo de lancamentos (2.12.0)" -- CHANGELOG.md package.json README.md graphify-out/
```

---

## Pendente humano (fora do sdd)

- [ ] Aplicar a migração na instância (deploy) e validar em monetis.dcsconsult.com.br: criar "Lisboa", lançar compra no período (campo vem preenchido), vincular parcela 1/N e conferir as N parcelas, vincular sugestões em lote, conferir custo líquido com um reembolso, tentar viagem sobreposta, excluir viagem e ver os lançamentos preservados.

## Self-review

- Cobertura do spec: Cadastro (Tasks 1, 7, 8, 18, 19, 20); Campo Viagem (Tasks 3, 13, 15, 16, 17); Série e divisão, incluindo recorrente por ocorrência, desvínculo por linha e salvar sem repropagar (Tasks 5, 11, 13, 14); Sugestões (Tasks 9, 11, 21); Custo líquido e quebras (Tasks 10, 11, 12, 20); menu e revalidação (Task 6); versão (Task 22).
- Nomes cruzados conferidos: `TripOption`, `fetchUserTrips`, `validateTripOwnership`, `setTripForTransactions`, `tripEligibleCondition`, `summarizeTrip`, `TripTransactionRow`, `TripDetail`, `TripListItem`, `resolveAutoTripId`, `TripSection`, `TripDialog`.
- Tasks 17 a 21 não têm teste automatizado: o repo não tem React Testing Library. A lógica que elas usam está em funções puras testadas; o portão delas é tsc + lint + validação humana.
