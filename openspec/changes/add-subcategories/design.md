# Subcategorias: design

Date: 2026-10-23

## Intent

Today categories are flat. Inside "Moradia" the user wants to know exactly how much went to each item (Aluguel, Condomínio, Faxina, IPTU, others) without losing "Moradia" as the unit used everywhere else (dashboard, budgets, reports).

Success: open the Moradia page for a month and see the split by subcategory; click one and see only its transactions.

## Goals

- A category can have zero or more subcategories (one level only).
- A transaction keeps its category and gains an **optional** subcategory, which must belong to that category.
- Manage subcategories inside the category dialog.
- Pick the subcategory in the transaction dialog, after the category.
- Category detail page shows the split by subcategory, with "Sem subcategoria" for the rest.
- Bulk action on the transactions list: "Definir subcategoria" for selected rows (retroactive reclassification).
- Import and reconciliation remember the subcategory together with the category (existing description memory).

## Non-goals

- Budgets per subcategory.
- Sub-subcategories (more than one level).
- Subcategory breakdown in dashboard, insights or reports (category-trends etc.). They keep summing by category.
- Subcategory in the inbox (pre-lançamentos) flow.
- Fixing the pre-existing `onDelete: cascade` from `transactions.categoryId` (deleting a category deletes its transactions). Out of scope; mention only.

## Anti-goals

- Any change to a category total anywhere. If a number on the dashboard, budgets or reports changes because of this feature, it is a bug.
- Deleting a subcategory must never delete transactions.

## Data model (decided)

"Optional extra field" model, chosen over category hierarchy (would force every aggregation by `categoryId`, ~30 files, to roll up) and free tags (no Moradia > Faxina structure).

- New table `subcategorias` (Drizzle export `subcategories`): `id uuid pk`, `nome text not null`, `categoria_id uuid not null` → `categories.id` `onDelete: cascade`, `user_id text not null` → `user.id` `onDelete: cascade`, `created_at`. Index on `(user_id, categoria_id)`. Name unique per category (case-insensitive) is the builder's call on how to enforce.
- `transactions` gains `subcategoria_id uuid null` → `subcategories.id` `onDelete: set null`.
- `import_category_mappings` gains `subcategory_id uuid null` → `subcategories.id` `onDelete: set null`.
- Invariant: if `transactions.subcategoria_id` is set, that subcategory's `categoria_id` equals the transaction's `categoria_id`. Enforced in server actions (ownership + parent check), not by DB constraint (builder may add one if cheap).
- Changing a transaction's category clears its subcategory unless the new value is a subcategory of the new category.
- Migration via `pnpm run db:generate` (Drizzle), no data backfill.
- Every write path that sets `categoryId` (core/single actions, series bulk edit, anticipation, refund, mass add, bulk import, invoices, import, reconciliation) goes through one server-side helper: copy the subcategory when the derived transaction keeps the source category (anticipation, duplicate, series copies), clear it when the category changes, validate parent + ownership when one is provided. *(my call)*

## Behaviour by surface

### Category dialog (edit and create)
Below Nome / Tipo / Ícone, a "Subcategorias (opcional)" section: one row per subcategory (editable name, transaction count, delete button), plus "Adicionar subcategoria". Helper text: "Excluir uma subcategoria não apaga lançamentos: eles ficam em Moradia, sem subcategoria." Saved together with the category on "Salvar"/"Atualizar", in one DB transaction: rows carry `id` (existing, rename) or no id (new); removed ids are deleted. A duplicate name in the same category fails the whole save with a field error. The count shown is all-time (it warns before deleting). *(my call)*

### Transaction dialog
After "Categoria", a full-width "Subcategoria (opcional)" Select. Shown only when the chosen category has subcategories. First option "Sem subcategoria". Applies to create, edit, and the series bulk edit (`updateTransactionBulkAction`) so installments/recurring copies carry it.

### Category detail page (`/categories/[categoryId]`)
Option A chosen: inside the existing `CategoryDetailHeader` card, below the three stat boxes, a "Por subcategoria" block. One row per subcategory with a transaction in the period: name, horizontal bar (share of the category total), amount, percent. Last row "Sem subcategoria" (muted, italic) when there are such transactions. Sorted by amount desc. Hidden entirely when the category has no subcategories. Clicking a row filters the transactions list on the same page to that subcategory; clicking again clears. "Sem subcategoria" is clickable too and filters `subcategoria_id IS NULL`. *(my call)* Totals use exactly the same filters the header total uses, so rows sum to "Total em {mês}".

### Transactions list bulk bar
New "Definir subcategoria" button (outline, before "Remover selecionados"). Opens a menu grouped by the categories of the selected rows, listing their subcategories, plus "Remover subcategoria". Applying sets the subcategory only on selected rows whose category matches; others are skipped. Toast: "N lançamentos atualizados para {sub}" and, if any skipped, "M ignorado(s): não é da categoria {cat}." Protected transactions follow the same rule the bulk delete uses.

Retroactive reclassification across months uses what the list already has: the date range filter (`dateStartFilter`/`dateEndFilter` replaces the period filter) plus category and description search, page size up to 100, select all, "Definir subcategoria". No new cross-period view.

### Import and reconciliation
`fetchCategoryMappings` / `saveCategoryMappings` (`src/features/transactions/actions/category-memory-action.ts`) also read/write the subcategory. When a mapping is applied, the subcategory is applied too; if the user changes the category on the row, the remembered subcategory is dropped. Saving a mapping always writes the row's current subcategory, null included (last choice wins, same as category). *(my call)* Mappings are only saved from these two flows, so their row UI needs a subcategory select (shown only when the row's category has subcategories), reusing the transaction dialog's select.

## UI decisions

- Preview (real app CSS/components, temporary): route `/preview-subcategorias`, files `src/app/preview-subcategorias/` (untracked, deleted in the release task). Approved again on the real-CSS preview on 2026-10-23.
- Chosen: **Option A + filter** (bars inside the header card; click filters the list).
- Category dialog, transaction dialog and bulk bar: as drawn in the second row of the mockup, approved without changes.
- Discarded: B (chips) lacked the proportion view; C (separate table card) took too much vertical space for the value it adds.

## Constraints

- Follow `AGENTS.md`: filter every query by `userId`, `revalidateForEntity` after mutations (categories and transactions), feature-first folders, PT-BR UI copy, English identifiers.
- Release: bump version in `package.json`, `CHANGELOG.md` (with intro paragraph) and README badge; README mention of subcategories.

## Left to the builder

- Exact component structure, query shape for the breakdown, how the list filter is passed (URL param vs state).
- Whether the subcategory shows as a column/badge in the transactions table (nice to have, not required).
- How to enforce unique names per category.
- Check whether any category merge/delete flow or data export/backup exists; if so, include subcategories there.
