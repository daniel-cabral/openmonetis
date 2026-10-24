# Subcategorias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional one-level subcategories under a category, assigned to transactions, shown as a breakdown on the category page, bulk-assignable from the transactions list, and remembered by import and reconciliation.

**Architecture:** New table `subcategorias` plus nullable `subcategoria_id` on `lancamentos` and `subcategory_id` on `import_category_mappings`, both `onDelete: set null`. One shared module (`src/shared/lib/subcategories/`) owns the rule "validate parent and owner when an id is given, keep when the category is unchanged, clear when it changes"; every write path that takes a user-chosen category calls it. Subcategory options travel on the existing category `SelectOption` (`subcategories?: SubcategoryOption[]`), so dialog, bulk bar, import and reconciliation read them without new props. The category page breakdown is a pure function over the same rows that already produce "Total em {mês}", so the rows sum to it by construction. Refund, invoices, accounts and mass add set a fixed or different category and insert without `subcategoryId`, so they default to null and need no change. No aggregation query (dashboard, budgets, insights, reports) changes.

**Tech Stack:** Next.js 16, React 19, Drizzle ORM + drizzle-kit, PostgreSQL, Zod, Vitest (node env, `src/**/*.test.ts`, db and auth faked with `vi.mock`), Biome 2, pnpm.

**Spec:** `openspec/changes/add-subcategories/design.md` and `openspec/changes/add-subcategories/specs/subcategories/spec.md` (scenarios referenced as `[S: name]`). UI preview (Option A + filter, approved): `src/app/preview-subcategorias/` (temporary, untracked). In Task 11 the block goes INSIDE the header Card, unlike the preview.

## Global Constraints

- Every query filters by `userId`; ownership of subcategory ids is checked server-side (AGENTS.md rule 1).
- After mutations call `revalidateForEntity("categories" | "transactions", userId)` from `src/shared/lib/actions/helpers.ts`.
- Feature-first: features never import other features; cross-domain code lives in `src/shared/`. `src/app/` pages may import from several features.
- Identifiers, comments and docs in English; UI copy in PT-BR, exactly as written in this plan.
- One level only. No subcategory in budgets, dashboard, insights, reports, inbox. No category total may change anywhere.
- Deleting a subcategory never deletes transactions (FK `set null`).
- Do not touch the pre-existing `onDelete: cascade` of `lancamentos.categoria_id`.
- Payload semantics for `subcategoryId` on any write: `undefined` keeps the stored value when the category is unchanged and clears it when the category changed; `null` clears; an id is validated (owner + parent) and a mismatch fails the whole write with nothing written.
- Error copy: `"Subcategoria não encontrada."`, `"A subcategoria não pertence à categoria escolhida."`, `"Subcategoria inválida."` (uuid parse).
- Tests: follow the `test-slop-guard` declaration per task; fake only `@/shared/lib/db`, auth and modules the repo already fakes; never mock the new `src/shared/lib/subcategories/*` modules. Run only the touched test file while iterating: `pnpm exec vitest run <path>`. Full suite once, in the last task.
- Lint per touched file: `pnpm exec biome check <files>` (local `biome check .` fails on CRLF noise; a line-ending-only format diff is not a failure). Typecheck: `pnpm exec tsc --noEmit` once at the end of each task.
- Commits in PT-BR, conventional style as in `git log` (e.g. `feat(categorias): ...`), no accents in the subject like existing history. Stage explicit paths only; never `git add -A` or `git add .`; show `git status --short` before committing.
- Execute on a feature branch or worktree cut from `e1ad635` (current `main`); never commit on `main`.
- Next.js 16 differs from training data: before writing page, `Link` or `searchParams` code, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md).
- No git tag. Release = version 2.14.0 in `package.json`, `CHANGELOG.md` (PT-BR intro paragraph) and README badge (AGENTS.md rule 6).

## Review Focus

1. Category-mapping upserts (`saveCategoryMappings` and the separate upsert inside `applyReconciliationAction`) that update `category_id` but not `subcategory_id` on conflict: a later category change would keep a subcategory from another category. Expected: both `set` clauses write `subcategoryId` from `excluded`. Test in Task 14.
2. Category save payloads with names that differ only by case or surrounding spaces, blank rows, or an `id` from another category or user. Expected: duplicate fails the whole save, blank fails with a message, foreign id fails with `"Subcategoria não encontrada."` and nothing is written. Tests in Task 3.
3. Update payloads that omit `subcategoryId` (any caller that does not know the field). Expected: same category keeps the subcategory, changed category clears it. Tests in Task 2 (rule) and Task 5 (wiring).
4. Import row whose bank `categoryRaw` overrides the remembered category. Expected: the remembered subcategory is dropped because it belongs to the other category. Test in Task 15.
5. Category page with subcategories but none used in the period, and a stale `subcategoria` URL param (deleted subcategory). Expected: a single "Sem subcategoria" row at 100%; a stale filter shows the full list. Tests in Task 10.

---

### Task 1: Schema and migration

**Files:**
- Modify: `src/db/schema.ts` (new table after `categories` ~L212-235; `transactions` columns ~L701-704 and indexes ~L771; `categoriesRelations` ~L828; `transactionsRelations` ~L929; `importCategoryMappings` ~L1052-1074; type exports ~L1102)
- Create: `drizzle/0038_*.sql`, `drizzle/meta/0038_snapshot.json` (generated), Modify: `drizzle/meta/_journal.json` (generated)
- Test: `src/db/schema.subcategories.test.ts`

**Interfaces:**
- Produces: `subcategories` (pgTable `"subcategorias"`): `id uuid pk default gen_random_uuid()`, `name: text("nome").notNull()`, `categoryId: uuid("categoria_id").notNull()` FK `categories.id` `onDelete: "cascade"`, `userId: text("user_id").notNull()` FK `user.id` `onDelete: "cascade"`, `createdAt` (same shape as `categories.createdAt`); index `subcategorias_user_id_categoria_id_idx` on `(user_id, categoria_id)`.
- Produces: `transactions.subcategoryId: uuid("subcategoria_id")` FK `subcategories.id` `onDelete: "set null"` (use `(): AnyPgColumn => subcategories.id` if declaration order requires it); index `lancamentos_subcategoria_id_idx`.
- Produces: `importCategoryMappings.subcategoryId: uuid("subcategory_id")` FK `subcategories.id` `onDelete: "set null"`.
- Produces: relations `categoriesRelations.subcategories: many(subcategories)`, `subcategoriesRelations` (`category: one(categories)`, `user: one(user)`), `transactionsRelations.subcategory: one(subcategories)`; type `export type Subcategory = typeof subcategories.$inferSelect`.
- Name uniqueness is enforced in the save action (Task 3), not by a DB index (an index on `lower(nome)` would break a rename swap inside one transaction).

Test declaration: `Test: new, because distinct contract (FK delete behaviour of a new table; only lock on "excluir subcategoria preserva lançamentos")`, same style as `src/db/schema.trips.test.ts`.

- [x] **Step 1: Write the failing test** `src/db/schema.subcategories.test.ts`

```ts
it("subcategorias pertence a categoria e ao usuario, com cascade", () => {
  const config = getTableConfig(subcategories);
  expect(config.name).toBe("subcategorias");
  // columns id, nome, categoria_id, user_id, created_at; nome/categoria_id/user_id notNull
  // FK categoria_id -> categorias onDelete "cascade"; FK user_id onDelete "cascade"
});
it.each([
  [transactions, "subcategoria_id"],
  [importCategoryMappings, "subcategory_id"],
])("%s solta a subcategoria excluida (set null)", (table, column) => {
  // column exists, notNull false, FK onDelete "set null", foreign table name "subcategorias"
}); // [S: Excluir subcategoria preserva lançamentos]
```

- [x] **Step 2: Run** `pnpm exec vitest run src/db/schema.subcategories.test.ts`. Expected: FAIL (`subcategories` not exported).
- [x] **Step 3: Implement the schema changes listed in Interfaces.**
- [x] **Step 4: Run** the same test. Expected: PASS.
- [x] **Step 5: Generate the migration** `pnpm run db:generate`. Expected: one new `drizzle/0038_*.sql` with `CREATE TABLE "subcategorias"`, two `ALTER TABLE ... ADD COLUMN` (`lancamentos.subcategoria_id`, `import_category_mappings.subcategory_id`), FKs with `ON DELETE set null`, and no other table touched. These are pure additions, so drizzle-kit should not prompt; if it does, stop and report.
- [x] **Step 6: Typecheck** `pnpm exec tsc --noEmit`. Expected: no errors.
- [x] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/schema.subcategories.test.ts drizzle/0038_*.sql drizzle/meta/0038_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(categorias): tabela de subcategorias e coluna opcional em lancamentos"
```

---

### Task 2: Shared subcategory rule and queries

**Files:**
- Create: `src/shared/lib/subcategories/types.ts`, `src/shared/lib/subcategories/rules.ts`, `src/shared/lib/subcategories/queries.ts`
- Test: `src/shared/lib/subcategories/rules.test.ts`

**Interfaces:**
- Consumes: `subcategories`, `categories` from Task 1.
- Produces (`types.ts`): `export type SubcategoryOption = { id: string; name: string }`.
- Produces (`rules.ts`, pure):
  - `export const SUBCATEGORY_NOT_FOUND_MESSAGE = "Subcategoria não encontrada."`
  - `export const SUBCATEGORY_MISMATCH_MESSAGE = "A subcategoria não pertence à categoria escolhida."`
  - `export type SubcategoryResolution = { ok: true; subcategoryId: string | null } | { ok: false; error: string }`
  - `export function resolveSubcategoryId(input: { requested: string | null | undefined; categoryId: string | null; parents: ReadonlyMap<string, string>; existing?: { categoryId: string | null; subcategoryId: string | null } | null }): SubcategoryResolution`
  - `export function validateSubcategoryPairs(pairs: Array<{ categoryId: string | null; subcategoryId: string | null | undefined }>, parents: ReadonlyMap<string, string>): string | null` (first error, or null; pairs without subcategory are valid)
- Produces (`queries.ts`, server only):
  - `export async function fetchSubcategoryParents(userId: string, ids: Array<string | null | undefined>): Promise<Map<string, string>>` (subcategoryId to categoryId). Implement as `db.select({ id, categoryId }).from(subcategories).where(and(eq(userId), inArray(id, uniqueIds)))`, no join, return empty map without querying when no ids. Task 5 tests fake exactly this `select().from().where()` chain.
  - `export async function resolveSubcategoryForWrite(userId: string, input: Omit<Parameters<typeof resolveSubcategoryId>[0], "parents">): Promise<SubcategoryResolution>` (fetches parents for `requested` when it is a string, then calls the pure rule).
  - `export async function fetchSubcategoryWithCategory(userId: string, id: string): Promise<{ id: string; name: string; categoryId: string; categoryName: string } | null>` (chain `db.select({...}).from(subcategories).innerJoin(categories, eq(...)).where(and(eq(subcategories.id, id), eq(subcategories.userId, userId)))`, no `.limit()`, return `rows[0] ?? null`; Task 12's fake depends on this chain).

Test declaration: `Test: new, because distinct contract (the single write rule every path relies on)`. Queries: `none, because exercised through the action wiring tests in Tasks 5, 6 and 12 with the real module over a faked db`.

- [x] **Step 1: Write the failing test** `rules.test.ts` with ids `MORADIA`, `TRANSPORTE`, `FAXINA` (uuid literals) and `parents = new Map([[FAXINA, MORADIA]])`:

```ts
it.each([
  ["id valido", FAXINA, MORADIA, parents, null, { ok: true, subcategoryId: FAXINA }],
  ["id de outra categoria", FAXINA, TRANSPORTE, parents, null, { ok: false, error: "A subcategoria não pertence à categoria escolhida." }],
  ["id desconhecido", FAXINA, MORADIA, new Map(), null, { ok: false, error: "Subcategoria não encontrada." }],
  ["null limpa", null, MORADIA, new Map(), { categoryId: MORADIA, subcategoryId: FAXINA }, { ok: true, subcategoryId: null }],
  ["ausente e mesma categoria mantem", undefined, MORADIA, new Map(), { categoryId: MORADIA, subcategoryId: FAXINA }, { ok: true, subcategoryId: FAXINA }],
  ["ausente e categoria trocada limpa", undefined, TRANSPORTE, new Map(), { categoryId: MORADIA, subcategoryId: FAXINA }, { ok: true, subcategoryId: null }],
  ["ausente sem registro anterior", undefined, MORADIA, new Map(), null, { ok: true, subcategoryId: null }],
])("%s", (_, requested, categoryId, parentsMap, existing, expected) => {
  expect(resolveSubcategoryId({ requested, categoryId, parents: parentsMap, existing })).toEqual(expected);
}); // [S: Trocar categoria limpa subcategoria] [S: Subcategoria de outra categoria é rejeitada]

it("validateSubcategoryPairs devolve o primeiro erro do lote", () => {
  expect(validateSubcategoryPairs([{ categoryId: MORADIA, subcategoryId: FAXINA }, { categoryId: TRANSPORTE, subcategoryId: null }], parents)).toBeNull();
  expect(validateSubcategoryPairs([{ categoryId: MORADIA, subcategoryId: FAXINA }, { categoryId: TRANSPORTE, subcategoryId: FAXINA }], parents)).toBe("A subcategoria não pertence à categoria escolhida.");
});
```

- [x] **Step 2: Run** `pnpm exec vitest run src/shared/lib/subcategories/rules.test.ts`. Expected: FAIL (module missing).
- [x] **Step 3: Implement** `types.ts`, `rules.ts`, `queries.ts` per Interfaces.
- [x] **Step 4: Run** the same test. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check src/shared/lib/subcategories`.
- [x] **Step 6: Commit**

```bash
git add src/shared/lib/subcategories/types.ts src/shared/lib/subcategories/rules.ts src/shared/lib/subcategories/queries.ts src/shared/lib/subcategories/rules.test.ts
git commit -m "feat(categorias): regra unica de validacao de subcategoria"
```

---

### Task 3: Category save with subcategories (atomic)

**Files:**
- Modify: `src/features/categories/actions.ts` (schemas L17-43, `createCategoryAction` L45-67, `updateCategoryAction` L69-127)
- Test: `src/features/categories/actions.test.ts`

**Interfaces:**
- Consumes: `subcategories` table (Task 1).
- Produces: `categoryBaseSchema` gains `subcategories: z.array(subcategoryInputSchema).default([])` where `subcategoryInputSchema = z.object({ id: uuidSchema("Subcategoria").optional(), name: z.string().trim().min(1, "Informe o nome da subcategoria.").max(60, "O nome da subcategoria deve ter no máximo 60 caracteres.") })`, plus a `superRefine` that flags the second occurrence of `name.toLocaleLowerCase("pt-BR")` with message ``Já existe a subcategoria "${name}" nesta categoria.`` at path `["subcategories", index, "name"]`.
- Produces: input types `{ name; type; icon; subcategories?: Array<{ id?: string; name: string }> }` for create, plus `id` for update. Signatures of `createCategoryAction` / `updateCategoryAction` unchanged otherwise.
- Behaviour: both actions run in one `db.transaction`. Update order: update category; delete subcategories of this category and user whose id is not in the payload; update each payload row with `id` (where `id`, `categoryId`, `userId`; zero rows returned throws `"Subcategoria não encontrada."` which rolls back); insert rows without `id`. Create inserts the category with `.returning({ id })` then the rows. Internal helper `syncSubcategories(tx, userId, categoryId, rows)` shared by both. Revalidate `"categories"` and `"transactions"`. Protected-category guard unchanged.

Test declaration: `Test: new, because no test exists for categories actions (distinct setup: categories actions with faked db)`. Fake `@/shared/lib/auth/server` (`getUser`), `@/shared/lib/db` (record `insert`/`update`/`delete` calls; `transaction: (cb) => cb(tx)`), `@/shared/lib/actions/helpers` (`revalidateForEntity: vi.fn()`, real-looking `handleActionError` that maps `ZodError` to `issues[0].message`, as in `trip-link-wiring.test.ts`).

- [x] **Step 1: Write the failing tests**

```ts
it("grava Faxina e IPTU em Moradia junto com a categoria, numa transacao", async () => {
  // findFirst returns { id: MORADIA, name: "Moradia" }
  const result = await updateCategoryAction({ id: MORADIA, name: "Moradia", type: "despesa", icon: "RiHome4Line",
    subcategories: [{ id: ALUGUEL, name: "Aluguel" }, { name: "Faxina" }, { name: "IPTU" }] });
  expect(result.success).toBe(true);
  expect(transactionSpy).toHaveBeenCalledTimes(1);
  expect(inserts).toEqual([[{ name: "Faxina", categoryId: MORADIA, userId: USER_ID }, { name: "IPTU", categoryId: MORADIA, userId: USER_ID }]]);
  expect(deletes).toHaveLength(1); // removed ids
}); // [S: Criar subcategorias no diálogo da categoria]

it("nome repetido sem diferenciar maiusculas falha e nada e gravado", async () => {
  const result = await updateCategoryAction({ ...base, subcategories: [{ id: FAXINA, name: "Faxina" }, { name: " faxina " }] });
  expect(result).toEqual({ success: false, error: 'Já existe a subcategoria "faxina" nesta categoria.' });
  expect(transactionSpy).not.toHaveBeenCalled();
}); // [S: Nome duplicado falha o salvamento inteiro]

it("id de subcategoria de outra categoria falha sem gravar", async () => {
  // update(...).returning() resolves [] for FOREIGN_ID
  const result = await updateCategoryAction({ ...base, subcategories: [{ id: FOREIGN_ID, name: "Faxina" }] });
  expect(result).toEqual({ success: false, error: "Subcategoria não encontrada." });
});
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/categories/actions.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** schema, `syncSubcategories`, transaction wrapping in both actions. `handleActionError` must surface the thrown `"Subcategoria não encontrada."`: return it explicitly (catch that error inside the action and map to `{ success: false, error }`) since the shared handler hides non-Zod messages.
- [x] **Step 4: Run** the same test. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check src/features/categories/actions.ts src/features/categories/actions.test.ts`.
- [x] **Step 6: Commit**

```bash
git add src/features/categories/actions.ts src/features/categories/actions.test.ts
git commit -m "feat(categorias): salvar subcategorias junto com a categoria"
```

---

### Task 4: Categories page data and category dialog UI

**Files:**
- Modify: `src/features/categories/queries.ts` (`fetchCategoriesForUser`)
- Modify: `src/features/categories/components/types.ts`
- Create: `src/features/categories/components/category-subcategories-field.tsx`
- Modify: `src/features/categories/components/category-dialog.tsx` (initial values L37-54, payload L113-117, form L162)

**Interfaces:**
- Consumes: Task 3 action input `subcategories: Array<{ id?: string; name: string }>`.
- Produces: `export type CategorySubcategory = { id: string; name: string; transactionCount: number }`; `Category` gains `subcategories: CategorySubcategory[]`; `CategoryFormValues` gains `subcategories: Array<{ key: string; id?: string; name: string; transactionCount: number }>` (`key` is a client id for React lists).
- `fetchCategoriesForUser` adds one grouped query: `select({ id, name, categoryId, transactionCount: sql<number>\`count(${transactions.id})::int\` }).from(subcategories).leftJoin(transactions, and(eq(transactions.subcategoryId, subcategories.id), eq(transactions.userId, userId))).where(eq(subcategories.userId, userId)).groupBy(subcategories.id).orderBy(asc(subcategories.name))`, grouped into each category. Count is all-time.
- `CategorySubcategoriesField({ value, onChange, categoryName })`: one row per item (name `Input`, count text `"{n} lançamentos"` / `"1 lançamento"` / nothing for new rows, delete icon button with `aria-label="Remover subcategoria"`), button `"Adicionar subcategoria"`, section label `"Subcategorias (opcional)"`, helper text ``Excluir uma subcategoria não apaga lançamentos: eles ficam em ${categoryName || "a categoria"}, sem subcategoria.``. Layout as the approved mockup, second row.

Test declaration: `Test: none, because UI-only wiring; the save contract is locked by src/features/categories/actions.test.ts and the count is a single grouped select checked manually below`.

- [x] **Step 1: Implement** query, types, field component, dialog wiring (payload sends `subcategories: formState.subcategories.map(({ id, name }) => ({ id, name: name.trim() }))`).
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check src/features/categories/queries.ts src/features/categories/components/types.ts src/features/categories/components/category-subcategories-field.tsx src/features/categories/components/category-dialog.tsx`. Expected: no errors.
- [x] **Step 3: Commit**

```bash
git add src/features/categories/queries.ts src/features/categories/components/types.ts src/features/categories/components/category-subcategories-field.tsx src/features/categories/components/category-dialog.tsx
git commit -m "feat(categorias): gerir subcategorias no dialogo da categoria"
```

---

### Task 5: Transaction create, update and split-pair write paths

**Files:**
- Modify: `src/features/transactions/actions/core.ts` (`baseFields` ~L288-336, `buildTransactionRecords` basePayload ~L713-725)
- Modify: `src/features/transactions/actions/single-actions.ts` (`createTransactionAction` L59-215, `updateTransactionAction` L217-394 incl. columns ~L251 and set ~L354, `updateTransactionSplitPairAction` L853-990 incl. columns ~L885 and set ~L945)
- Test: `src/features/transactions/actions/subcategory-wiring.test.ts`

**Interfaces:**
- Consumes: `resolveSubcategoryForWrite` (Task 2).
- Produces: `baseFields.subcategoryId: z.string().uuid("Subcategoria inválida.").nullable().optional()` (so `createSchema`, `updateSchema` and `CreateInput`/`UpdateInput` carry it); `buildTransactionRecords` writes `subcategoryId: data.subcategoryId ?? null` on every record (all installments, recurrences and split shares).
- Create: resolve with `{ requested: data.subcategoryId, categoryId: data.categoryId ?? null }` right after `validateTripOwnership`; on error return `{ success: false, error }`; pass the resolved id into `buildTransactionRecords` data.
- Update and split pair: add `subcategoryId: true` to the `existing` columns; resolve with `existing: { categoryId: existing.categoryId, subcategoryId: existing.subcategoryId }`; write `subcategoryId` in the update `set`. Resolve before any write.

Test declaration: `Test: new, because distinct contract (subcategory validation in write actions) and a db fake with a select chain that trip-link-wiring.test.ts does not have`. Copy the harness of `trip-link-wiring.test.ts` (same `vi.mock` list for auth, actions/helpers, payers/notifications, `./attachments`, `../lib/attachment-copy`, trips modules, partial `./core`), and extend `dbMock` with `select: () => ({ from: () => ({ where: () => Promise.resolve(selectQueue.shift() ?? []) }) })` and `insert: () => ({ values: (v) => { insertWrites.push(v); return { returning: () => Promise.resolve(v.map((_, i) => ({ id: \`new-${i}\` }))) }; } })`. Do not mock `@/shared/lib/subcategories/*`.

- [x] **Step 1: Write the failing tests**

```ts
it("cria Faxina Maria, R$ 120,00, Moradia/Faxina", async () => {
  selectQueue.push([{ id: FAXINA, categoryId: MORADIA }]);
  const result = await createTransactionAction({ ...fields, name: "Faxina Maria", amount: 120, categoryId: MORADIA, subcategoryId: FAXINA });
  expect(result.success).toBe(true);
  expect(insertWrites[0]).toEqual([expect.objectContaining({ categoryId: MORADIA, subcategoryId: FAXINA, amount: "-120.00" })]);
}); // [S: Escolher subcategoria no lançamento]

it("Transporte com a Faxina de Moradia e rejeitado e nada muda", async () => {
  selectQueue.push([{ id: FAXINA, categoryId: MORADIA }]);
  const result = await updateTransactionAction({ id: TX_ID, ...fields, categoryId: TRANSPORTE, subcategoryId: FAXINA });
  expect(result).toEqual({ success: false, error: "A subcategoria não pertence à categoria escolhida." });
  expect(updateWrites).toHaveLength(0);
}); // [S: Subcategoria de outra categoria é rejeitada]

it("trocar Moradia/Faxina para Transporte sem enviar subcategoria limpa", async () => {
  findFirst.mockResolvedValue({ ...existing, categoryId: MORADIA, subcategoryId: FAXINA });
  await updateTransactionAction({ id: TX_ID, ...fields, categoryId: TRANSPORTE });
  expect(updateWrites[0]).toEqual(expect.objectContaining({ categoryId: TRANSPORTE, subcategoryId: null }));
}); // [S: Trocar categoria limpa subcategoria]
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/actions/subcategory-wiring.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the new test and the neighbours that share `core.ts`: `pnpm exec vitest run src/features/transactions/actions/subcategory-wiring.test.ts src/features/transactions/actions/trip-link-wiring.test.ts src/features/transactions/actions/core-trip.test.ts`. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check src/features/transactions/actions/core.ts src/features/transactions/actions/single-actions.ts src/features/transactions/actions/subcategory-wiring.test.ts`.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/actions/core.ts src/features/transactions/actions/single-actions.ts src/features/transactions/actions/subcategory-wiring.test.ts
git commit -m "feat(lancamentos): gravar e validar subcategoria ao criar e editar"
```

---

### Task 6: Series edit, conversions and anticipation keep the subcategory

**Files:**
- Modify: `src/features/transactions/actions/core.ts` (`updateBulkSchema`)
- Modify: `src/features/transactions/actions/bulk-actions.ts` (`updateTransactionBulkAction` L172-~330: columns ~L196-208, payload ~L233)
- Modify: `src/features/transactions/actions/single-actions.ts` (`convertTransactionToInstallmentAction` ~L575, `convertTransactionToRecurringAction` ~L747)
- Modify: `src/features/transactions/actions/anticipation.ts` (insert ~L266)
- Test: `src/features/transactions/actions/subcategory-wiring.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveSubcategoryForWrite`, `resolveSubcategoryId` (Task 2).
- Produces: `updateBulkSchema.subcategoryId` with the same Zod shape as Task 5; `UpdateBulkInput` carries it.
- Series edit: select `categoryId` and `subcategoryId` in `existing`; resolve with that `existing` and `categoryId: data.categoryId ?? null`; put `subcategoryId` in `baseUpdatePayload` so every scope ("current", "future", "all", "period") carries it.
- Conversions: copies get `subcategoryId: existing.subcategoryId ?? null` (category is copied unchanged; `findFirst` already returns all columns).
- Anticipation: new transaction gets `resolveSubcategoryId({ requested: undefined, categoryId: data.categoryId ?? firstInstallment.categoryId, parents: new Map(), existing: { categoryId: firstInstallment.categoryId, subcategoryId: firstInstallment.subcategoryId } })` (always `ok`); the installments `findMany` already returns all columns.

Test declaration: `Test: extends subcategory-wiring.test.ts with "edicao em serie grava a subcategoria" (new it in the same file, same harness)`. Conversions and anticipation: `none, because they apply the "undefined keeps when category unchanged" rule locked by rules.test.ts::"ausente e mesma categoria mantem"; the wiring is one field`.

- [x] **Step 1: Write the failing test**

```ts
it("edicao em serie grava a subcategoria", async () => {
  findFirst.mockResolvedValue({ ...existing, condition: "Parcelado", seriesId: "serie-iptu", categoryId: MORADIA, subcategoryId: null });
  selectQueue.push([{ id: IPTU, categoryId: MORADIA }]);
  // scope "current": the path the trip harness already runs end to end; baseUpdatePayload is shared by all scopes
  const result = await updateTransactionBulkAction({ id: TX_ID, scope: "current", name: "IPTU", note: null, categoryId: MORADIA, subcategoryId: IPTU });
  expect(result.success).toBe(true);
  expect(updateWrites).toHaveLength(1);
  expect(updateWrites[0]).toEqual(expect.objectContaining({ subcategoryId: IPTU }));
});
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/actions/subcategory-wiring.test.ts`. Expected: the new test FAILS.
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** `pnpm exec vitest run src/features/transactions/actions/subcategory-wiring.test.ts src/features/transactions/actions/trip-link-wiring.test.ts`. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the four modified files.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/actions/core.ts src/features/transactions/actions/bulk-actions.ts src/features/transactions/actions/single-actions.ts src/features/transactions/actions/anticipation.ts src/features/transactions/actions/subcategory-wiring.test.ts
git commit -m "feat(lancamentos): series, conversoes e antecipacao mantem a subcategoria"
```

---

### Task 7: Subcategory options on category select options

**Files:**
- Modify: `src/features/transactions/components/types.ts` (`TransactionItem`, `SelectOption`)
- Modify: `src/features/transactions/queries.ts` (`fetchTransactionFilterSources` L134-154)
- Modify: `src/features/transactions/lib/page-helpers.ts` (`CategorySluggedOption` ~L87, `buildSluggedFilters` L277-345, `mapTransactionsData` L565, `buildOptionSets` categoryOptions ~L695)
- Create: `src/features/transactions/lib/subcategory-options.ts`
- Test: `src/features/transactions/lib/subcategory-options.test.ts`

**Interfaces:**
- Consumes: `SubcategoryOption` (Task 2), relation `categories.subcategories` (Task 1).
- Produces: `TransactionItem.subcategoryId?: string | null` (optional, like `tripId?`, so existing fixtures stay valid); `SelectOption.subcategories?: SubcategoryOption[]`; `mapTransactionsData` maps `subcategoryId: item.subcategoryId ?? null`.
- `fetchTransactionFilterSources` categories query adds `with: { subcategories: { columns: { id: true, name: true }, orderBy: (s, { asc }) => [asc(s.name)] } }`. `buildSluggedFilters` accepts `categoryRows: Array<CategoryRow & { subcategories?: SubcategoryOption[] }>` and keeps `subcategories ?? []`; `buildOptionSets` puts it on each category option.
- Produces: `export function getSubcategoryOptions(categoryOptions: SelectOption[], categoryId: string | null | undefined): SubcategoryOption[]` (empty when no category or none).

Test declaration: `Test: new, because distinct contract (options builder carrying subcategories); no test covers buildOptionSets today`.

- [x] **Step 1: Write the failing test**

```ts
it("Moradia oferece suas subcategorias e Transporte nenhuma", () => {
  const sets = buildOptionSets({ ...buildSluggedFilters({ payerRows: [], accountRows: [], cardRows: [],
    categoryRows: [moradiaRow /* subcategories: [Aluguel, Faxina] */, transporteRow /* no subcategories key */] }), payerRows: [] });
  expect(getSubcategoryOptions(sets.categoryOptions, MORADIA)).toEqual([{ id: ALUGUEL, name: "Aluguel" }, { id: FAXINA, name: "Faxina" }]);
  expect(getSubcategoryOptions(sets.categoryOptions, TRANSPORTE)).toEqual([]);
  expect(mapTransactionsData([{ id: "t1", subcategoryId: FAXINA }])[0]?.subcategoryId).toBe(FAXINA);
}); // [S: Seletor só aparece quando há subcategorias]
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/lib/subcategory-options.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the same test plus `src/features/transactions/lib/form-helpers-trip.test.ts`. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the five touched files.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/components/types.ts src/features/transactions/queries.ts src/features/transactions/lib/page-helpers.ts src/features/transactions/lib/subcategory-options.ts src/features/transactions/lib/subcategory-options.test.ts
git commit -m "feat(lancamentos): opcoes de categoria carregam suas subcategorias"
```

---

### Task 8: Transaction form state clears the subcategory on category change

**Files:**
- Modify: `src/features/transactions/lib/form-helpers.ts` (`TransactionFormState` L66-91, `buildTransactionInitialState` ~L195-213, `applyFieldDependencies` L225+)
- Test: `src/features/transactions/lib/form-helpers-subcategory.test.ts`

**Interfaces:**
- Consumes: `TransactionItem.subcategoryId` (Task 7).
- Produces: `TransactionFormState.subcategoryId: string | undefined`; initial value `isImporting ? undefined : (transaction?.subcategoryId ?? undefined)`; `applyFieldDependencies("categoryId", value, state)` returns `subcategoryId: undefined` whenever `value !== state.categoryId` (verified: no other branch of `applyFieldDependencies` writes `categoryId`).

Test declaration: `Test: new, because distinct contract (subcategory form rules); form-helpers-trip.test.ts is scoped to trips`. Reuse its `transaction` fixture shape and call `buildTransactionInitialState(transaction)` as it does.

- [x] **Step 1: Write the failing test**

```ts
it("edicao abre com a subcategoria gravada", () => {
  expect(buildTransactionInitialState({ ...transaction, categoryId: MORADIA, subcategoryId: FAXINA }).subcategoryId).toBe(FAXINA);
});
it("trocar a categoria limpa a subcategoria escolhida", () => {
  const state = { ...buildTransactionInitialState(transaction), categoryId: MORADIA, subcategoryId: FAXINA };
  expect(applyFieldDependencies("categoryId", TRANSPORTE, state)).toHaveProperty("subcategoryId", undefined);
  expect(applyFieldDependencies("categoryId", MORADIA, state)).not.toHaveProperty("subcategoryId");
}); // [S: Trocar categoria limpa subcategoria]
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/lib/form-helpers-subcategory.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the same test plus `src/features/transactions/lib/form-helpers-trip.test.ts`. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check src/features/transactions/lib/form-helpers.ts src/features/transactions/lib/form-helpers-subcategory.test.ts`.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/lib/form-helpers.ts src/features/transactions/lib/form-helpers-subcategory.test.ts
git commit -m "feat(lancamentos): formulario limpa subcategoria ao trocar categoria"
```

---

### Task 9: Subcategory select in the transaction dialog

**Files:**
- Create: `src/features/transactions/components/subcategory-select.tsx`
- Modify: `src/features/transactions/components/dialogs/transaction-dialog/category-section.tsx`
- Modify: `src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog.tsx` (create/update payloads ~L389, bulk request ~L482, split request ~L517)
- Modify: `src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog-types.ts` (`onBulkEditRequest` / `onSplitEditRequest` data ~L36-70)
- Modify: `src/features/transactions/components/page/transactions-page.tsx` (`handleBulkEditRequest` L312, `handleBulkEdit` L342-365, split edit call ~L495)

**Interfaces:**
- Consumes: `getSubcategoryOptions` (Task 7), `TransactionFormState.subcategoryId` (Task 8), action inputs from Tasks 5-6.
- Produces: `export function SubcategorySelect({ id, options, value, onChange, className }: { id?: string; options: SubcategoryOption[]; value: string | null | undefined; onChange: (value: string | null) => void; className?: string }): JSX.Element | null` (renders `null` when `options` is empty; first item label `"Sem subcategoria"` using the sentinel value `"__none__"` mapped to `null`, since Radix Select rejects `""`). Reused by Tasks 16 and 18.
- `CategorySection`: below the existing row, full width, `Label` `"Subcategoria (opcional)"` + `SubcategorySelect` for `formState.categoryId`; `onChange` calls `onFieldChange("subcategoryId", value ?? undefined)`.
- Every payload from the dialog sends `subcategoryId: formState.subcategoryId ?? null`; the bulk and split request data types gain `subcategoryId: string | null` and `transactions-page.tsx` forwards it to `updateTransactionBulkAction` / `updateTransactionSplitPairAction`.

Test declaration: `Test: none, because UI-only; the visibility rule is locked by subcategory-options.test.ts and the clear-on-change rule by form-helpers-subcategory.test.ts`.

- [x] **Step 1: Implement** per Interfaces (layout per the approved mockup, second row).
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the five files.
- [x] **Step 3: Commit**

```bash
git add src/features/transactions/components/subcategory-select.tsx src/features/transactions/components/dialogs/transaction-dialog/category-section.tsx src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog.tsx src/features/transactions/components/dialogs/transaction-dialog/transaction-dialog-types.ts src/features/transactions/components/page/transactions-page.tsx
git commit -m "feat(lancamentos): seletor de subcategoria no dialogo de lancamento"
```

---

### Task 10: Breakdown and list filter helpers for the category page

**Files:**
- Create: `src/features/categories/lib/subcategory-breakdown.ts`
- Modify: `src/features/categories/queries.ts` (add `fetchSubcategoriesForCategory`)
- Test: `src/features/categories/lib/subcategory-breakdown.test.ts`

**Interfaces:**
- Consumes: `SubcategoryOption` (Task 2), `TransactionItem.subcategoryId` (Task 7).
- Produces:
  - `export const SUBCATEGORY_FILTER_PARAM = "subcategoria"`; `export const NO_SUBCATEGORY_FILTER = "sem"`
  - `export type SubcategoryBreakdownRow = { subcategoryId: string | null; name: string; amount: number; percent: number }`
  - `export function buildSubcategoryBreakdown(transactions: Array<{ amount: number; subcategoryId?: string | null }>, subcategories: SubcategoryOption[]): SubcategoryBreakdownRow[]`: `[]` when `subcategories` is empty; sums `Math.round(Math.abs(amount) * 100)` cents per key (unknown ids count as no subcategory); one row per subcategory present in the input, sorted by amount desc; then a `{ subcategoryId: null, name: "Sem subcategoria" }` row last when any transaction has none; `amount = cents / 100`; `percent = Math.round((cents * 1000) / totalCents) / 10` (0 when total is 0).
  - `export function filterTransactionsBySubcategory<T extends { subcategoryId?: string | null }>(transactions: T[], filter: string | null, subcategories: SubcategoryOption[]): T[]`: `"sem"` keeps rows without subcategory; a known id keeps that id; `null` or an unknown id returns the input unchanged.
  - `fetchSubcategoriesForCategory(userId: string, categoryId: string): Promise<SubcategoryOption[]>` in `src/features/categories/queries.ts` (where `userId` and `categoryId`, order by name).

Test declaration: `Test: new, because distinct contract (breakdown math the spec pins with literal values)`. `fetchSubcategoriesForCategory`: `none, because single filtered select with no logic`.

- [x] **Step 1: Write the failing tests**

```ts
it("Moradia em outubro/2026: cinco linhas em ordem somando R$ 4.432,30", () => {
  const txs = [
    { amount: -2800, subcategoryId: ALUGUEL }, { amount: -650, subcategoryId: CONDOMINIO },
    { amount: -240, subcategoryId: FAXINA }, { amount: -240, subcategoryId: FAXINA },
    { amount: -312.4, subcategoryId: IPTU }, { amount: -189.9, subcategoryId: null },
  ];
  expect(buildSubcategoryBreakdown(txs, [aluguel, condominio, faxina, iptu])).toEqual([
    { subcategoryId: ALUGUEL, name: "Aluguel", amount: 2800, percent: 63.2 },
    { subcategoryId: CONDOMINIO, name: "Condomínio", amount: 650, percent: 14.7 },
    { subcategoryId: FAXINA, name: "Faxina", amount: 480, percent: 10.8 },
    { subcategoryId: IPTU, name: "IPTU", amount: 312.4, percent: 7 },
    { subcategoryId: null, name: "Sem subcategoria", amount: 189.9, percent: 4.3 },
  ]);
}); // [S: Detalhamento de outubro]

it("com subcategorias mas nenhuma usada no mes, uma linha Sem subcategoria a 100%", () => {
  expect(buildSubcategoryBreakdown([{ amount: -50, subcategoryId: null }], [faxina])).toEqual([{ subcategoryId: null, name: "Sem subcategoria", amount: 50, percent: 100 }]);
  expect(buildSubcategoryBreakdown([{ amount: -50, subcategoryId: null }], [])).toEqual([]);
});

it.each([
  ["Faxina", FAXINA, ["f1", "f2"]],
  ["Sem subcategoria", "sem", ["n1"]],
  ["id que nao existe mais", "11111111-1111-4111-8111-111111111111", ["f1", "f2", "a1", "n1"]],
  ["sem filtro", null, ["f1", "f2", "a1", "n1"]],
])("filtro %s", (_, filter, ids) => {
  expect(filterTransactionsBySubcategory(list, filter, [aluguel, faxina]).map((t) => t.id)).toEqual(ids);
}); // [S: Filtrar por subcategoria] [S: Filtrar sem subcategoria]
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/categories/lib/subcategory-breakdown.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the same test. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the three files.
- [x] **Step 6: Commit**

```bash
git add src/features/categories/lib/subcategory-breakdown.ts src/features/categories/lib/subcategory-breakdown.test.ts src/features/categories/queries.ts
git commit -m "feat(categorias): calculo do detalhamento por subcategoria"
```

---

### Task 11: "Por subcategoria" block and list filter on the category page

**Files:**
- Modify: `src/features/categories/components/category-detail-header.tsx` (props L17-35, below the stats grid ~L91-130)
- Modify: `src/app/(dashboard)/categories/[categoryId]/page.tsx`

**Interfaces:**
- Consumes: Task 10 helpers and `fetchSubcategoriesForCategory`.
- Produces: `CategoryDetailHeader` optional prop `subcategoryRows?: Array<SubcategoryBreakdownRow & { href: string; active: boolean }>`; block rendered only when the array is non-empty. Title `"Por subcategoria"`; each row is a `next/link` `Link` with name, horizontal bar (`style={{ width: \`${row.percent}%\` }}`), `currencyFormatter.format(row.amount)`, `formatPercentage(row.percent, { minimumFractionDigits: 1, maximumFractionDigits: 1 })`; the null row is muted and italic; the active row is highlighted.
- Page: fetch subcategories in the existing `Promise.all`; `breakdown = buildSubcategoryBreakdown(detail.transactions, subcategories)`; read `subcategoria` with the local `getSingleParam`; each row `href` keeps all current search params (e.g. `periodo`) and sets `subcategoria` to the row id or `"sem"`, or deletes it when the row is already active (toggle); pass `transactions={filterTransactionsBySubcategory(detail.transactions, filter, subcategories)}` to `TransactionsPage`. `currentTotal` and `transactionCount` stay on the unfiltered `detail.transactions`. `src/features/dashboard/**` is not modified.

Test declaration: `Test: none, because UI-only; math and filter locked by subcategory-breakdown.test.ts`.

- [x] **Step 1: Implement** per Interfaces (Option A layout from the mockup).
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check src/features/categories/components/category-detail-header.tsx "src/app/(dashboard)/categories/[categoryId]/page.tsx"`.
- [x] **Step 3: Commit**

```bash
git add src/features/categories/components/category-detail-header.tsx "src/app/(dashboard)/categories/[categoryId]/page.tsx"
git commit -m "feat(categorias): bloco por subcategoria com filtro da lista"
```

---

### Task 12: Bulk "Definir subcategoria" action

**Files:**
- Modify: `src/features/transactions/actions/core.ts` (add schema next to `deleteMultipleSchema` ~L989)
- Modify: `src/features/transactions/actions/bulk-actions.ts` (new action, uses module-private `isProtectedTransaction` L61)
- Modify: `src/features/transactions/actions.ts` (barrel export)
- Test: `src/features/transactions/actions/bulk-subcategory-action.test.ts`

**Interfaces:**
- Consumes: `fetchSubcategoryWithCategory` (Task 2).
- Produces: `setSubcategoryBulkSchema = z.object({ ids: z.array(uuidSchema("Lançamento")).min(1, "Selecione pelo menos um lançamento."), subcategoryId: z.string().uuid("Subcategoria inválida.").nullable() })`, `SetSubcategoryBulkInput`.
- Produces: `export async function setTransactionsSubcategoryAction(input: SetSubcategoryBulkInput): Promise<ActionResult<{ updated: number; skipped: number }>>`:
  - `findMany` by `inArray(ids)` + `userId`, columns `id, categoryId, note, transactionType, condition, paymentMethod`; none: `"Nenhum lançamento encontrado."`.
  - Any protected row rejects the whole batch with `"Lançamentos protegidos não podem ser atualizados em massa."` (same rule as `deleteMultipleTransactionsAction`).
  - With an id: unknown or foreign: `"Subcategoria não encontrada."`; targets = rows whose `categoryId` equals the subcategory's; zero targets: ``Nenhum lançamento selecionado é da categoria ${categoryName}.``; update `set({ subcategoryId })` where `inArray(targetIds)` + `userId`.
  - With `null`: clears all selected rows.
  - Message (exact): updated part `"1 lançamento atualizado para Faxina"` / `"4 lançamentos atualizados para Faxina"`; when skipped > 0 append `". 1 ignorado: não é da categoria Moradia."` / `". 2 ignorados: não são da categoria Moradia."`, else append `"."`. Removal: `"1 lançamento ficou sem subcategoria."` / `"N lançamentos ficaram sem subcategoria."`.
  - `revalidate(user.id)`.

Test declaration: `Test: new, because distinct contract (new action) with its own db fake (query.transactions.findMany, select join, update capture)`. Fake auth, db, `@/shared/lib/actions/helpers`, `@/shared/lib/payers/notifications`, `./attachments` as `trip-link-wiring.test.ts` does; not the subcategories module.

- [x] **Step 1: Write the failing tests**

```ts
it("4 faxinas de Moradia e 1 de Transporte: 4 atualizados, 1 ignorado", async () => {
  findMany.mockResolvedValue([...fourMoradiaRows, transporteRow]);
  selectQueue.push([{ id: FAXINA, name: "Faxina", categoryId: MORADIA, categoryName: "Moradia" }]);
  const result = await setTransactionsSubcategoryAction({ ids: allFiveIds, subcategoryId: FAXINA });
  expect(result).toEqual({ success: true, message: "4 lançamentos atualizados para Faxina. 1 ignorado: não é da categoria Moradia.", data: { updated: 4, skipped: 1 } });
  expect(updateWrites).toEqual([{ subcategoryId: FAXINA }]);
}); // [S: Reclassificar com itens de outra categoria]

it("lancamento protegido na selecao recusa o lote inteiro", async () => {
  findMany.mockResolvedValue([moradiaRow, { ...moradiaRow, id: X, note: INITIAL_BALANCE_NOTE, transactionType: "Receita", condition: "À vista", paymentMethod: "Pix" /* use the constants from @/shared/lib/accounts/constants */ }]);
  const result = await setTransactionsSubcategoryAction({ ids: [A, X], subcategoryId: FAXINA });
  expect(result).toEqual({ success: false, error: "Lançamentos protegidos não podem ser atualizados em massa." });
  expect(updateWrites).toHaveLength(0);
});
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/actions/bulk-subcategory-action.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the same test. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the four files.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/actions/core.ts src/features/transactions/actions/bulk-actions.ts src/features/transactions/actions.ts src/features/transactions/actions/bulk-subcategory-action.test.ts
git commit -m "feat(lancamentos): definir subcategoria em massa"
```

---

### Task 13: "Definir subcategoria" in the bulk bar

**Files:**
- Modify: `src/features/transactions/components/table/transactions-bulk-bar.tsx`
- Modify: `src/features/transactions/components/table/transactions-table.tsx` (props ~L73, bulk bar render ~L409-425)
- Modify: `src/features/transactions/components/page/transactions-page.tsx` (handler + pass to table)

**Interfaces:**
- Consumes: `setTransactionsSubcategoryAction` (Task 12), `SelectOption.subcategories` (Task 7).
- Produces: `TransactionsBulkBar` optional props `subcategoryGroups?: Array<{ categoryId: string; categoryName: string; subcategories: SubcategoryOption[] }>` and `onSetSubcategory?: (subcategoryId: string | null) => void`. In `"delete"` mode, when `subcategoryGroups` is non-empty, render an outline `Button` `"Definir subcategoria"` before `"Remover selecionados"`, opening a `DropdownMenu` with one `DropdownMenuLabel` per category, its subcategories as items, a separator, and `"Remover subcategoria"`.
- Table: optional `onBulkSetSubcategory?: (items: TransactionItem[], subcategoryId: string | null) => void`; groups built from the selected rows' distinct `categoryId` matched against `categoryOptions` with subcategories.
- Page: handler calls the action with the selected ids, `toast.success(result.message)` or `toast.error(result.error)`, clears selection on success.

Test declaration: `Test: none, because UI-only; counts, skip rule and copy locked by bulk-subcategory-action.test.ts`.

- [x] **Step 1: Implement** per Interfaces (as drawn in the mockup, second row).
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the three files.
- [x] **Step 3: Commit**

```bash
git add src/features/transactions/components/table/transactions-bulk-bar.tsx src/features/transactions/components/table/transactions-table.tsx src/features/transactions/components/page/transactions-page.tsx
git commit -m "feat(lancamentos): acao definir subcategoria na barra de selecao"
```

---

### Task 14: Category memory stores the subcategory

**Files:**
- Modify: `src/features/transactions/actions/category-memory-action.ts`, `src/features/transactions/lib/import-utils.ts` (type only)
- Modify: `src/features/transactions/actions/reconciliation-action.ts` (matched select ~L193-200, `categoryIdByTransaction` ~L212, confirmations into plan ~L253-258, mappings upsert `set` ~L345-348)
- Modify: `src/features/transactions/lib/reconciliation-plan.ts` (`ReconciliationConfirmation`, `ReconciliationPlan.categoryMappings`, mapping loop ~L170-188)
- Modify: `src/features/transactions/components/import/import-page.tsx` (~L127-130), `src/features/transactions/components/reconciliation/reconciliation-page.tsx` (~L201-206): read `.categoryId` from the new mapping shape only
- Test: `src/features/transactions/actions/category-memory-action.test.ts` (new), `src/features/transactions/lib/reconciliation-plan.test.ts` (extend), `src/features/transactions/actions/reconciliation-action.test.ts` (extend)

**Interfaces:**
- Produces: `export type CategoryMapping = { categoryId: string; subcategoryId: string | null }` in `src/features/transactions/lib/import-utils.ts` (not in the `"use server"` file; the action imports it); `fetchCategoryMappings(descriptions: string[]): Promise<Record<string, CategoryMapping>>`; `saveCategoryMappings(rows: { description: string; categoryId: string | null; subcategoryId: string | null }[]): Promise<void>` writes `subcategoryId` (null included) and its conflict `set` adds `subcategoryId: sql\`excluded.subcategory_id\``.
- Produces: `ReconciliationConfirmation.subcategoryId: string | null`; `categoryMappings` entries gain `subcategoryId: string | null` (taken from the matched transaction in the DB, like `categoryId`); the action's upsert `set` adds `subcategoryId: sql\`excluded.subcategory_id\``.

Test declaration:
- `Test: new, because category-memory-action has no test (category-memory-action.test.ts, same fake style as name-memory-action.test.ts plus insert capture)`.
- `Test: extends reconciliation-plan.test.ts::"confirmação com categoria alimenta o de-para com o descriptor normalizado"`.
- `Test: extends reconciliation-action.test.ts::"grava o de-para e atualiza o valor na mesma transação, devolvendo previousAmount"` (record the `onConflictDoUpdate` config in the existing fake).

- [x] **Step 1: Write the failing assertions**

```ts
// category-memory-action.test.ts
it("devolve categoria e subcategoria por descricao normalizada", async () => {
  whereMock.mockResolvedValue([{ descriptionKey: key, categoryId: MORADIA, subcategoryId: FAXINA }]);
  expect(await fetchCategoryMappings(["FAXINA MARIA"])).toEqual({ [key]: { categoryId: MORADIA, subcategoryId: FAXINA } });
});
it("salva a subcategoria atual da linha, inclusive vazia, e a atualiza no conflito", async () => {
  await saveCategoryMappings([{ description: "FAXINA MARIA", categoryId: MORADIA, subcategoryId: null }]);
  expect(insertedValues).toEqual([expect.objectContaining({ categoryId: MORADIA, subcategoryId: null })]);
  expect(Object.keys(conflictConfig.set)).toEqual(expect.arrayContaining(["categoryId", "subcategoryId"]));
}); // Review Focus 1

// reconciliation-plan.test.ts, inside the existing it: confirmation gains subcategoryId: FAXINA
expect(plan.categoryMappings).toEqual([{ userId, descriptionKey, categoryId, subcategoryId: FAXINA }]);

// reconciliation-action.test.ts, inside the existing it
expect(Object.keys(upsertConfigFor(importCategoryMappings).set)).toEqual(expect.arrayContaining(["categoryId", "subcategoryId"]));
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/actions/category-memory-action.test.ts src/features/transactions/lib/reconciliation-plan.test.ts src/features/transactions/actions/reconciliation-action.test.ts`. Expected: the new assertions FAIL.
- [x] **Step 3: Implement** per Interfaces; adapt the two page consumers to `mapping?.categoryId` (subcategory application comes in Tasks 16 and 18).
- [x] **Step 4: Run** the same command. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the touched files.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/actions/category-memory-action.ts src/features/transactions/lib/import-utils.ts src/features/transactions/actions/category-memory-action.test.ts src/features/transactions/actions/reconciliation-action.ts src/features/transactions/actions/reconciliation-action.test.ts src/features/transactions/lib/reconciliation-plan.ts src/features/transactions/lib/reconciliation-plan.test.ts src/features/transactions/components/import/import-page.tsx src/features/transactions/components/reconciliation/reconciliation-page.tsx
git commit -m "feat(importacao): memoria de categoria guarda a subcategoria"
```

---

### Task 15: Import accepts and remembers the subcategory (server and rule)

**Files:**
- Modify: `src/features/transactions/actions/import-action.ts` (`importRowSchema` L46-50, ownership block ~L307-326, insert values ~L386)
- Modify: `src/features/transactions/lib/import-utils.ts`
- Test: `src/features/transactions/lib/import-utils.test.ts` (extend)

**Interfaces:**
- Consumes: `fetchSubcategoryParents`, `validateSubcategoryPairs` (Task 2), `CategoryMapping` (Task 14).
- Produces: `importRowSchema.subcategoryId: z.string().uuid("Subcategoria inválida.").nullable().optional()`; validation `validateSubcategoryPairs(rows.map(r => ({ categoryId: r.categoryId ?? null, subcategoryId: r.subcategoryId })), await fetchSubcategoryParents(userId, rows.map(r => r.subcategoryId)))` returning `{ success: false, error }` before any insert; insert writes `subcategoryId: row.subcategoryId ?? null`.
- Produces (`import-utils.ts`): `export function pickRememberedSubcategory(mapping: CategoryMapping | null | undefined, finalCategoryId: string | null): string | null` (mapping's subcategory only when `finalCategoryId === mapping.categoryId`).

Test declaration: `Test: new it in import-utils.test.ts, because distinct function in the same module`. Import action wiring: `none, because the pair rule is locked by rules.test.ts::"validateSubcategoryPairs devolve o primeiro erro do lote"`.

- [x] **Step 1: Write the failing test**

```ts
it("FAXINA MARIA lembrada como Moradia/Faxina volta com Faxina, e categoria do banco diferente descarta", () => {
  const mapping = { categoryId: MORADIA, subcategoryId: FAXINA };
  expect(pickRememberedSubcategory(mapping, MORADIA)).toBe(FAXINA);
  expect(pickRememberedSubcategory(mapping, TRANSPORTE)).toBeNull();
  expect(pickRememberedSubcategory(undefined, MORADIA)).toBeNull();
}); // [S: Importação reaplica Faxina], Review Focus 4
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/lib/import-utils.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the same test. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the three files.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/actions/import-action.ts src/features/transactions/lib/import-utils.ts src/features/transactions/lib/import-utils.test.ts
git commit -m "feat(importacao): importar lancamentos com subcategoria"
```

---

### Task 16: Subcategory select in the import review table

**Files:**
- Modify: `src/features/transactions/components/import/review-table.tsx` (`ReviewRow` L45-52, props L55-62, category cell ~L220-245)
- Modify: `src/features/transactions/components/import/import-page.tsx` (row build ~L125-155, `handleCategoryChange` L230, `handleBulkCategoryChange` L277, import payload ~L342, `saveCategoryMappings` ~L358)

**Interfaces:**
- Consumes: `SubcategorySelect` (Task 9), `getSubcategoryOptions` (Task 7), `pickRememberedSubcategory` (Task 15), `CategoryMapping` and new `saveCategoryMappings` shape (Task 14).
- Produces: `ReviewRow.subcategoryId: string | null`; review-table prop `onSubcategoryChange: (index: number, subcategoryId: string | null) => void`; select rendered under/next to the category select only when the row's category has subcategories.
- Row build: `subcategoryId: pickRememberedSubcategory(mapping, finalCategoryId)` where `finalCategoryId` is the category after `categoryRaw` override and type compatibility. Any category change (single or bulk) sets `subcategoryId: null`. Payload and `saveCategoryMappings` send `subcategoryId: r.subcategoryId`.

Test declaration: `Test: none, because UI-only; remember/drop rule locked by import-utils.test.ts and memory write by category-memory-action.test.ts`.

- [x] **Step 1: Implement** per Interfaces.
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check src/features/transactions/components/import/review-table.tsx src/features/transactions/components/import/import-page.tsx`.
- [x] **Step 3: Commit**

```bash
git add src/features/transactions/components/import/review-table.tsx src/features/transactions/components/import/import-page.tsx
git commit -m "feat(importacao): seletor de subcategoria na revisao da importacao"
```

---

### Task 17: Reconciliation creations carry the subcategory (server and lib)

**Files:**
- Modify: `src/features/transactions/actions/reconciliation-action.ts` (`creationSchema` L34-46, ownership block ~L157-182, creations into plan ~L259-269)
- Modify: `src/features/transactions/lib/reconciliation-plan.ts` (`ReconciliationCreation`, `inserts` type and map ~L80-150)
- Modify: `src/features/transactions/lib/reconciliation-review.ts` (`ReconciliationRowDecision` create branch ~L53-66, `ReconciliationApplyPayload.creations` ~L91-101, `buildReconciliationApplyPayload` ~L148-158)
- Test: `src/features/transactions/lib/reconciliation-plan.test.ts`, `src/features/transactions/lib/reconciliation-review.test.ts` (extend)

**Interfaces:**
- Consumes: `fetchSubcategoryParents`, `validateSubcategoryPairs` (Task 2).
- Produces: `subcategoryId: string | null` on the create decision, on payload creations, on `ReconciliationCreation` and on each plan insert; `creationSchema.subcategoryId: z.string().uuid("Subcategoria inválida.").nullable().optional()`, validated as pairs before the transaction, passed as `creation.subcategoryId ?? null`.

Test declaration:
- `Test: extends reconciliation-plan.test.ts::"transforma linha a criar em lançamento do lote com valor assinado"` (creation with `subcategoryId: FAXINA`, assert `plan.inserts[0].subcategoryId === FAXINA`).
- `Test: extends reconciliation-review.test.ts::"mapeia confirm, create, ignore e ignora skip"` (create decision with `subcategoryId: FAXINA`, assert it in `payload.creations[0]`).
- Action validation: `none, because locked by rules.test.ts::"validateSubcategoryPairs devolve o primeiro erro do lote"`.

- [x] **Step 1: Add the failing assertions** to the two existing tests.
- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/lib/reconciliation-plan.test.ts src/features/transactions/lib/reconciliation-review.test.ts`. Expected: FAIL.
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the same command plus `src/features/transactions/actions/reconciliation-action.test.ts`. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the five files.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/actions/reconciliation-action.ts src/features/transactions/lib/reconciliation-plan.ts src/features/transactions/lib/reconciliation-plan.test.ts src/features/transactions/lib/reconciliation-review.ts src/features/transactions/lib/reconciliation-review.test.ts
git commit -m "feat(conciliacao): lancamentos criados na conciliacao com subcategoria"
```

---

### Task 18: Subcategory select in the reconciliation review

**Files:**
- Modify: `src/features/transactions/components/reconciliation/reconciliation-page.tsx` (learned mapping ~L199-206, props to review ~L450)
- Modify: `src/features/transactions/components/reconciliation/reconciliation-review.tsx` (row state type ~L90-140, create decisions ~L245-300, category select ~L470-500)

**Interfaces:**
- Consumes: `SubcategorySelect` (Task 9), `getSubcategoryOptions` (Task 7), `pickRememberedSubcategory` (Task 15), Task 17 decision field.
- Produces: page keeps `learnedMappingByFingerprint: Map<string, CategoryMapping>` (replacing the category-only map) and the review's initial row state gets `subcategoryId: pickRememberedSubcategory(learned, initialCategoryId)`; row state `subcategoryId: string | null`; changing the row category sets it to `null`; create decisions send `subcategoryId: state.subcategoryId`. Read only the cited line ranges of the 771-line review file.

Test declaration: `Test: none, because UI-only; rules locked by import-utils.test.ts and reconciliation-review.test.ts`.

- [x] **Step 1: Implement** per Interfaces.
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check` on the two files.
- [x] **Step 3: Commit**

```bash
git add src/features/transactions/components/reconciliation/reconciliation-page.tsx src/features/transactions/components/reconciliation/reconciliation-review.tsx
git commit -m "feat(conciliacao): seletor de subcategoria na revisao da conciliacao"
```

---

### Task 19: Release 2.14.0 and full verification

**Files:**
- Modify: `package.json` (`"version": "2.14.0"`), `CHANGELOG.md` (new `## [2.14.0] - YYYY-MM-DD` (release commit date) above 2.13.5), `README.md` (badge L13 to `version-2.14.0`; feature line L68 "Contas e transações" mentions subcategories)

**Interfaces:** none.

Test declaration: `Test: none, because no behaviour change`. Requirement "Totais por categoria não mudam": `none, because no aggregation query changes`, checked by Step 2.

- [x] **Step 1: Write the release notes.** CHANGELOG entry with a PT-BR intro paragraph in prose (what subcategories are and that category totals stay the same), then `### Adicionado`: subcategorias no diálogo da categoria; subcategoria opcional no lançamento; bloco "Por subcategoria" com filtro na página da categoria; "Definir subcategoria" em massa; importação e conciliação lembram a subcategoria. README L68: add "categorias com subcategorias opcionais" to the categorization clause.
- [x] **Step 2: Check the anti-goal.** Run `git diff --name-only e1ad635..HEAD -- src/features/dashboard src/features/budgets src/features/insights src/features/reports`. Expected: empty output.
- [x] **Step 3: Typecheck** `pnpm exec tsc --noEmit`. Expected: no errors.
- [x] **Step 4: Lint** `pnpm exec biome check` on every file changed in the branch (`git diff --name-only e1ad635..HEAD -- src`). Expected: no diagnostics besides line-ending noise.
- [x] **Step 5: Full suite, once** `pnpm exec vitest run`. Expected: all tests pass.
- [x] **Step 5b: Remove the temporary preview.** `rm -rf src/app/preview-subcategorias` (untracked, never committed). Expected: `git status --short` shows nothing under `src/app/preview-subcategorias`.
- [x] **Step 6: Version consistency.** `package.json`, `CHANGELOG.md` header and README badge all read `2.14.0`. Do not create or push a tag.
- [x] **Step 7: Commit**

```bash
git add package.json CHANGELOG.md README.md
git status --short
git commit -m "chore: preparar versao 2.14.0"
```
