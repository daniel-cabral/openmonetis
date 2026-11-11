# Harden Reconciliation Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reconciliation review flag doubtful matches, let the user undo any match without SQL, and show the projected app balance (or invoice total) against the file before Apply.

**Architecture:** Suspicion is a pure function next to the matcher (`detectMatchSuspicions`), evaluated in the review over data it already has. Undoing a match is a new optional `releaseFingerprint` on row decisions that becomes `payload.unmatches`; the apply action clears those fingerprints first inside the same DB transaction and returns what it cleared plus which confirmations it settled, so the client undo payload can restore both. The projection is a pure function over the apply payload (`reconciliation-projection.ts`) plus an account balance context the candidates action now returns (baseline with cutoff, per-candidate balance status, paid-after-end list); the invoice projection needs no server data. UI follows Option B: a "Precisa da sua decisão" bucket on top and a sticky apply bar.

**Tech Stack:** Next.js 16, React 19, Drizzle ORM, PostgreSQL, Zod, Vitest (node env, `src/**/*.test.ts`, db and auth faked with `vi.mock`), Tailwind 4 + shadcn/ui, Biome 2, pnpm.

**Spec:** `openspec/changes/harden-reconciliation-review/design.md` (binding: "UI decisions" and "Builder's calls") and delta specs `specs/statement-reconciliation/spec.md`, `specs/subcategories/spec.md` (scenarios cited as `[S: name]`). UI preview (Option B): `src/app/preview-conciliacao/page.tsx` (untracked, deleted in Task 11). Note: the preview's numbers (-R$ 524,56 vs R$ 843,44, "Diferença de R$ 1.368,00") ignore the cutoff; the spec scenarios with the cutoff (R$ 1.118,44 vs R$ 843,44, "Diferença de R$ 275,00") win.

## Global Constraints

- Every query filters by `userId`; ownership of every id coming from the client is enforced in the `where` (AGENTS.md rule 1). Admin payer via `getAdminPayerId(userId)` (`src/shared/lib/payers/get-admin-id.ts`), never a JOIN on `payers`.
- After mutations call `revalidateForEntity("transactions", userId)` (already in both actions; keep it).
- Feature-first: `src/features/transactions` must not import `src/features/accounts` and vice versa; `src/app/` pages may import both.
- Identifiers, comments and docs in English; UI copy in PT-BR exactly as written in this plan.
- Matching (candidate fetch, rule order, `DATE_WINDOW_DAYS`) does not change. No DB migration. Nothing is auto-fixed: every write comes from a decision the user saw.
- The projection never blocks Apply; the only Apply block stays `evaluateApplyBlock` (empty names).
- Undoing a match never changes the old transaction's amount or `isSettled`; it only loses the fingerprint, and only when the match rule was `fingerprint`.
- Money in cents for comparisons (`Math.round(value * 100)`), as `matcher.ts:90` and `closure.ts:32` do.
- Tests: follow `test-slop-guard`; each task carries its declaration lines. Fake only `@/shared/lib/db`, auth, `revalidateForEntity` and `actions/core`, as `reconciliation-action.test.ts` already does. No tests of markup.
- While iterating run only the touched test files: `pnpm exec vitest run <path>`. At the end of each task, once: `pnpm exec tsc --noEmit` and `pnpm exec biome check --formatter-enabled=false <touched paths>`. Never `pnpm run lint` or bare `biome check .` (CRLF noise). Full suite only in Task 11: `pnpm exec vitest run --maxWorkers=4`.
- Commits in PT-BR, conventional style as in `git log` (`feat(conciliacao): ...`), no accents in the subject. Stage explicit paths only; never `git add -A` or `git add .`; run `git status --short` before each commit.
- Work on a feature branch cut from current `main` (`1480129`); never commit on `main`. Never create or push a tag.
- Next.js 16 differs from training data: before touching page code read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md).

## Review Focus

1. Unique index `(user_id, ofx_import_fingerprint)`: "Criar" or "Vincular a outro" on a fingerprint-rule match reuses the row fingerprint that the old transaction still holds. Expected: the release runs before inserts and fingerprint updates, so the creation is not silently skipped by `onConflictDoNothing` and the link update does not throw. Test in Task 4.
2. A review whose only decision is an undone fingerprint match set to "Pular". Expected: Apply is enabled and the server does not answer "Nenhuma decisão para aplicar."; only the fingerprint is cleared. Test in Task 4 (server); `canApply` in Task 6.
3. Undo after "Vincular a outro" on a fingerprint match: the batch fingerprint now sits on the new transaction. Expected: undo clears batch fingerprints before restoring the released one (unique index), and restores only where the column is still null. Test in Task 4.
4. Projection inputs at the edges: a kept match whose app transaction is dated after the file end, a creation for a non-admin payer, an amount alignment on a divided transaction. Expected: the after-end one counts and leaves the "pagos depois" list; the other two do not move the balance. Tests in Task 2.
5. Suspicion noise (anti-goal): app date equal to the file start, card installments with old purchase dates, cents-rule rounding (86,59 vs 86,61), estimated bills matched by name-period with a different amount (Cemig 110 → 106,28). Expected: none of them is suspicious. Test in Task 1.

---

### Task 1: Suspicion rule

**Files:**
- Modify: `src/shared/lib/reconciliation/matcher.ts` (new exports after `MATCH_RULES`, ~L228; also fix the stale comment at L78, `amountDivergence` is filled by any rule since `matcher.ts:302-315`)
- Test: `src/shared/lib/reconciliation/matcher.test.ts`
- Add to git: `openspec/changes/harden-reconciliation-review/` (proposal, design, specs, tasks)

**Interfaces:**
- Produces:
  - `export type MatchSuspicion = { reason: "before-file-start"; transactionDate: string; fileStartDate: string } | { reason: "amount-divergence"; appAmount: number; rowAmount: number }`
  - `export function detectMatchSuspicions(params: { row: ImportedTransaction; rule: MatchRule; transaction: AppTransaction; fileStartDate: string; destinationKind: DestinationKind | null }): MatchSuspicion[]` (empty array = not suspicious; `before-file-start` first when both apply)
- Rule: `before-file-start` iff `destinationKind === "account"` and `transaction.date < fileStartDate` (strict, string compare on `YYYY-MM-DD`). `amount-divergence` iff `rule === "fingerprint"` and cents of `transaction.amount` and `row.amount` differ (user decision 2026-11-11: estimated recurring bills matched by other rules, e.g. Cemig R$ 110 → 106,28 via name-period, must NOT be flagged; they keep today's "valor será alinhado" text).

Test declaration: `Test: new, because distinct contract (new pure function; the only lock on the suspicion rule and its noise exclusions)`.

- [x] **Step 1: Commit the change docs** (they are untracked today)

```bash
git add openspec/changes/harden-reconciliation-review/proposal.md openspec/changes/harden-reconciliation-review/design.md openspec/changes/harden-reconciliation-review/tasks.md openspec/changes/harden-reconciliation-review/.openspec.yaml openspec/changes/harden-reconciliation-review/specs/statement-reconciliation/spec.md openspec/changes/harden-reconciliation-review/specs/subcategories/spec.md
git commit -m "docs(openspec): proposta e plano para endurecer a revisao da conciliacao"
```

- [x] **Step 2: Write the failing test** in `matcher.test.ts`, new `describe("detectMatchSuspicions")` with one `it.each`, using the file's `row()` and `transaction()` helpers:

```ts
it.each([
  ["Fernanda 26/10 casada com Terapia de 11/10, arquivo desde 12/10",
    { date: "2026-10-26", amount: 275 }, "name-period", { date: "2026-10-11", amount: 275 }, "2026-10-12", "account",
    [{ reason: "before-file-start", transactionDate: "2026-10-11", fileStartDate: "2026-10-12" }]],
  ["Colégio 1.560,85 casado por fingerprint com 1.643", // [S: Colégio com valor divergente casado por fingerprint]
    { date: "2026-10-15", amount: 1560.85 }, "fingerprint", { date: "2026-10-22", amount: 1643 }, "2026-10-12", "account",
    [{ reason: "amount-divergence", appAmount: 1643, rowAmount: 1560.85 }]],
  ["os dois motivos juntos, data primeiro",
    { date: "2026-10-16", amount: 210 }, "fingerprint", { date: "2026-10-09", amount: 200 }, "2026-10-12", "account",
    [{ reason: "before-file-start", transactionDate: "2026-10-09", fileStartDate: "2026-10-12" },
     { reason: "amount-divergence", appAmount: 200, rowAmount: 210 }]],
  ["conta estimada casada por nome e período não é suspeita (Cemig)",
    { date: "2026-10-16", amount: 106.28 }, "name-period", { date: "2026-10-16", amount: 110 }, "2026-10-12", "account", []],
  ["casamento comum", { date: "2026-10-15", amount: 106.28 }, "exact", { date: "2026-10-15", amount: 106.28 }, "2026-10-12", "account", []],
  ["lançamento no próprio dia de início", { date: "2026-10-13", amount: 50 }, "exact", { date: "2026-10-12", amount: 50 }, "2026-10-12", "account", []],
  ["parcela antiga na fatura", { date: "2025-01-14", amount: 1800 }, "installment", { date: "2025-01-14", amount: 1800 }, "2026-09-20", "card", []],
  ["arredondamento da regra de centavos", { date: "2026-10-10", amount: 86.59 }, "cents", { date: "2026-10-10", amount: 86.61 }, "2026-10-01", "card", []],
])("%s", (_, rowOverrides, rule, txOverrides, fileStartDate, destinationKind, expected) => {
  expect(detectMatchSuspicions({ row: row(rowOverrides), rule, transaction: transaction(txOverrides), fileStartDate, destinationKind }))
    .toEqual(expected);
}); // [S: Fernanda casada com Terapia anterior ao arquivo] [S: Parcela antiga na fatura não é suspeita] [S: Casamento comum não gera aviso]
```

- [x] **Step 3: Run** `pnpm exec vitest run src/shared/lib/reconciliation/matcher.test.ts`. Expected: FAIL (`detectMatchSuspicions` is not exported).
- [x] **Step 4: Implement** `MatchSuspicion` and `detectMatchSuspicions` in `matcher.ts` per Interfaces (reuse the file's `toCents`).
- [x] **Step 5: Run** the same test. Expected: PASS.
- [x] **Step 6: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check --formatter-enabled=false src/shared/lib/reconciliation/matcher.ts src/shared/lib/reconciliation/matcher.test.ts`. Expected: no errors.
- [x] **Step 7: Commit**

```bash
git add src/shared/lib/reconciliation/matcher.ts src/shared/lib/reconciliation/matcher.test.ts
git commit -m "feat(conciliacao): regra de casamento suspeito por data anterior ao arquivo ou valor divergente"
```

---

### Task 2: Projection (pure)

**Files:**
- Modify: `src/shared/lib/reconciliation/closure.ts` (new export after `checkStatementClosure`, ~L104)
- Create: `src/features/transactions/lib/reconciliation-projection.ts`
- Test: `src/shared/lib/reconciliation/closure.test.ts`, Create: `src/features/transactions/lib/reconciliation-projection.test.ts`

**Interfaces:**
- Consumes: `ReconciliationApplyPayload` (`reconciliation-review.ts:86-117`; Task 3 adds `unmatches`, which the projection ignores), `AppTransaction`.
- Produces (`closure.ts`): `export function statementFinalBalance(transactions: ImportedTransaction[]): { day: string; balance: number } | null`. Day = max of `postedDate ?? date`; balance = that day's `dayBalance` (first row of the day that has one, as `checkStatementClosure` groups at `closure.ts:54-62`); `null` when the max day has no `dayBalance` (never fall back to an earlier day).
- Produces (`reconciliation-projection.ts`):
  - `export type BalanceStatus = "in-balance" | "unsettled" | "after-end"`
  - `export type PaidAfterEnd = { id: string; name: string; date: string; amount: number }` (amount signed, expense negative)
  - `export type AccountBalanceContext = { cutoff: string; baseline: number; adminPayerId: string | null; statusById: Record<string, BalanceStatus>; paidAfterEnd: PaidAfterEnd[] }` (`statusById` holds only admin-payer candidates; absent id = does not count in the account balance)
  - `export function projectAccountBalance(params: { payload: ReconciliationApplyPayload; context: AccountBalanceContext; appTransactionsById: Map<string, AppTransaction> }): { projected: number; paidAfterEnd: PaidAfterEnd[] }`
  - `export function projectInvoiceTotal(params: { payload: ReconciliationApplyPayload; transactions: AppTransaction[]; invoicePeriod: string }): number` (positive = amount owed)

Algorithm, `projectAccountBalance` (all in cents):

```
total = cents(context.baseline)
update = map of payload.amountUpdates by transactionId, excluding isDivided
kept = unique transactionIds of payload.confirmations + payload.manualLinks
for id in kept:
  status = context.statusById[id]; tx = appTransactionsById.get(id)
  if !status or !tx: continue
  old = signed cents of tx; next = update[id] ? signed cents of update[id] : old
  total += next - (status === "in-balance" ? old : 0)
for creation in payload.creations:
  if creation.payerId === context.adminPayerId: total += signed cents of creation
paidAfterEnd = context.paidAfterEnd without ids in kept
```

`projectInvoiceTotal`: over `transactions` with `period === invoicePeriod`, sum `+amount` for expense and `-amount` for income, using the non-divided `amountUpdates` amount when present; then add each creation (`+` expense, `-` income). Return cents / 100.

Test declarations:
- `Test: new, because distinct contract (statementFinalBalance is a new pure function over the file)` in `closure.test.ts`.
- `Test: new, because distinct contract (new module; the only lock on the projected balance rules)` in `reconciliation-projection.test.ts`.

- [x] **Step 1: Write the failing tests**

`closure.test.ts`, new `it.each` "saldo final do extrato":

```ts
// rows built with the file's helper: (postedDate, dayBalance)
[["último dia com saldo", [["2026-11-10", 1000], ["2026-11-11", 843.44], ["2026-11-11", 843.44]], { day: "2026-11-11", balance: 843.44 }],
 ["último dia sem saldo do dia", [["2026-11-10", 1000], ["2026-11-11", undefined]], null]]
```

`reconciliation-projection.test.ts`: helpers `tx(id, date, amount, type = "expense", period = "2026-10")` building a full `AppTransaction`, `payload(partial)` filling empty arrays, and a context with `baseline: 1118.44`, `adminPayerId: "payer-admin"`, `cutoff: "2026-11-11"`, `statusById: { terapia: "in-balance", danielle: "unsettled", colegio: "in-balance", mensalidade: "after-end" }`, transactions `terapia` (2026-10-11, 275), `danielle` (2026-10-16, 210), `colegio` (2026-10-22, 1643), `mensalidade` (2026-11-22, 1643), `outro` (2026-10-20, 90, absent from `statusById`), `dividido` (2026-10-21, 300, `isDivided: true`, `"in-balance"`).

```ts
it.each([
  ["manter Fernanda com Terapia não muda o saldo", { confirmations: [conf("terapia")] }, 1118.44], // [S: Fernanda mantida mostra a diferença antes do Aplicar]
  ["desfazer Fernanda e criar o débito fecha em 843,44", { creations: [creation(275, "expense", "payer-admin")] }, 843.44], // [S: Desfazer Fernanda fecha o saldo]
  ["criação para outra pessoa não entra", { creations: [creation(275, "expense", "payer-other")] }, 1118.44],
  ["confirmar Danielle pendente desconta 210", { confirmations: [conf("danielle")] }, 908.44],
  ["alinhar Colégio de 1.643 para 1.560,85 soma a diferença", { confirmations: [conf("colegio")], amountUpdates: [upd("colegio", 1560.85)] }, 1200.59],
  ["vínculo de lançamento de outra pessoa não entra", { manualLinks: [link("outro")] }, 1118.44],
  ["alinhamento em dividido é ignorado", { confirmations: [conf("dividido")], amountUpdates: [{ ...upd("dividido", 250), isDivided: true }] }, 1118.44],
  ["Pular e Ignorar não mexem", { ignores: [{ fingerprint: "fp-x", reason: "Não lançável" }] }, 1118.44],
])("%s", (_, partial, expected) => {
  expect(projectAccountBalance({ payload: payload(partial), context, appTransactionsById }).projected).toBe(expected);
});

it("lista a mensalidade de 22/11 à parte e a tira da lista quando casada", () => {
  // context.paidAfterEnd = [{ id: "mensalidade", name: "Mensalidade Colégio Santo Agostinho", date: "2026-11-22", amount: -1643 }]
  // empty payload: projected 1118.44, paidAfterEnd has the mensalidade entry
  // confirmations [conf("mensalidade")]: projected -524.56, paidAfterEnd []
}); // [S: Mensalidade paga depois do fim do arquivo]

it("projeta o total da fatura com criação e alinhamento", () => {
  // transactions (period 2026-11): A 100 expense, B 50 expense, C 20 income; D 999 expense in period 2026-10
  // payload: creations [30 expense], amountUpdates [B -> 55 expense]
  expect(projectInvoiceTotal({ payload, transactions, invoicePeriod: "2026-11" })).toBe(165);
}); // [S: Total da fatura previsto]
```

- [x] **Step 2: Run** `pnpm exec vitest run src/shared/lib/reconciliation/closure.test.ts src/features/transactions/lib/reconciliation-projection.test.ts`. Expected: FAIL (missing exports / module).
- [x] **Step 3: Implement** `statementFinalBalance` and `reconciliation-projection.ts` per Interfaces and the algorithm.
- [x] **Step 4: Run** the same tests. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check --formatter-enabled=false` on the four files. Expected: no errors.
- [x] **Step 6: Commit**

```bash
git add src/shared/lib/reconciliation/closure.ts src/shared/lib/reconciliation/closure.test.ts src/features/transactions/lib/reconciliation-projection.ts src/features/transactions/lib/reconciliation-projection.test.ts
git commit -m "feat(conciliacao): calculo do saldo previsto e do total da fatura apos aplicar"
```

---

### Task 3: Undo-match decisions, undo payload and learning from creations

**Files:**
- Modify: `src/features/transactions/lib/reconciliation-review.ts` (`ReconciliationRowDecision` L41-84, `ReconciliationApplyPayload` L86-117, `buildReconciliationApplyPayload` L124-185, `buildReconciliationUndoPayload` L192-206, `buildConsumedTransactionIds` L336-353)
- Modify: `src/features/transactions/lib/reconciliation-plan.ts` (category mapping loop L185-197)
- Test: `src/features/transactions/lib/reconciliation-review.test.ts`, `src/features/transactions/lib/reconciliation-plan.test.ts`

**Interfaces:**
- Produces:
  - `ReconciliationRowDecision`: the `create`, `link` and `skip` variants gain `releaseFingerprint?: { transactionId: string }` (set by the UI only when a `fingerprint`-rule match is undone).
  - `ReconciliationApplyPayload.unmatches: { fingerprint: string; transactionId: string }[]`; `buildReconciliationApplyPayload` pushes `{ fingerprint, transactionId: decision.releaseFingerprint.transactionId }` for any decision carrying it, in addition to what the decision already produces.
  - `buildConsumedTransactionIds(rows, linkedByFingerprint, releasedFingerprints: ReadonlySet<string> = new Set())`: matched rows whose fingerprint is in the set do not consume their transaction.
  - `buildReconciliationUndoPayload(result)`: input gains OPTIONAL `released?: { transactionId: string; fingerprint: string }[]` and `settledByApply?: string[]` (Task 4 adds them to `ApplyReconciliationResult`; until then the page call site must still compile); output always carries both, defaulting to `[]`.
  - `ReconciliationApplyPayload.unmatches` is OPTIONAL (`unmatches?: ...`), and `buildReconciliationApplyPayload` always sets it (possibly `[]`), so existing payload literals (e.g. Task 2's test helper, same wave) keep compiling untouched.
  - `buildReconciliationPlan`: `categoryMappings` also come from `input.creations` with `categoryId` (both destinations), with the creation's `subcategoryId`; same key collapse; creations are processed after confirmations, so a creation wins on the same key.

Test declarations:
- `Test: new, because distinct contract (release of a fingerprint is a new payload channel)` in `describe("buildReconciliationApplyPayload")`.
- `Test: extends reconciliation-review.test.ts::buildConsumedTransactionIds (existing test, add the released-set assertion)`.
- `Test: extends reconciliation-review.test.ts::buildReconciliationUndoPayload (existing test, add released and settledByApply)`.
- `Test: new, because distinct contract (creations now feed the category memory)` in `describe("buildReconciliationPlan")`.

- [x] **Step 1: Write the failing tests**

```ts
it("desfazer casamento por fingerprint leva o fingerprint para unmatches", () => {
  // entries: { fingerprint: "fp-colegio", decision: { action: "create", ...creationFields, releaseFingerprint: { transactionId: "tx-colegio" } } }
  //          { fingerprint: "fp-fernanda", decision: { action: "skip", releaseFingerprint: { transactionId: "tx-terapia" } } }
  const payload = buildReconciliationApplyPayload(entries, "payer-1");
  expect(payload.unmatches).toEqual([
    { fingerprint: "fp-colegio", transactionId: "tx-colegio" },
    { fingerprint: "fp-fernanda", transactionId: "tx-terapia" },
  ]);
  expect(payload.creations).toHaveLength(1);
  expect(payload.confirmations).toEqual([]);
}); // [S: Colégio desfeito vira lançamento novo] [S: Só desfazer já é uma decisão aplicável]
```

In the existing `buildConsumedTransactionIds` test add: called with `new Set([<matched row fingerprint>])`, the matched transaction id is not in the returned map.

In the existing `buildReconciliationUndoPayload` test add `released: [{ transactionId: "tx-colegio", fingerprint: "fp-colegio" }]` and `settledByApply: ["tx-danielle"]` to the input and the expected output.

Plan test:

```ts
it.each(["account", "card"] as const)("criação com categoria ensina o de-para com a subcategoria (%s)", (type) => {
  // creations: "Pix enviado para DOARE" with categoryId CATEGORY_ID and subcategoryId SUBCATEGORY_ID; a second creation "LOJA X" with categoryId null
  expect(plan.categoryMappings).toEqual([
    expect.objectContaining({ categoryId: CATEGORY_ID, subcategoryId: SUBCATEGORY_ID }),
  ]);
}); // [S: Criação com categoria alimenta o de-para] [S: Ambígua criada na conciliação reaplica Faxina]
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/lib/reconciliation-review.test.ts src/features/transactions/lib/reconciliation-plan.test.ts`. Expected: FAIL (no `unmatches`; extra args ignored; one mapping missing).
- [x] **Step 3: Implement** the Interfaces in both files.
- [x] **Step 4: Run** the same tests. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit` (expect no errors: `unmatches`, `released` and `settledByApply` are optional on the inputs; do not edit Task 2's files); `pnpm exec biome check --formatter-enabled=false` on the touched files.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/lib/reconciliation-review.ts src/features/transactions/lib/reconciliation-review.test.ts src/features/transactions/lib/reconciliation-plan.ts src/features/transactions/lib/reconciliation-plan.test.ts
git commit -m "feat(conciliacao): decisao de desfazer casamento e aprendizado de categoria nas criacoes"
```

---

### Task 4: Apply and undo actions

**Files:**
- Modify: `src/features/transactions/actions/reconciliation-action.ts` (`applySchema` L74-88, `undoSchema` L90-106, result type L111-123, empty guard L149-157, matched select L212-227, transaction body L307-438, undo body L464-512)
- Test: `src/features/transactions/actions/reconciliation-action.test.ts`

**Interfaces:**
- Consumes: `payload.unmatches` and `buildReconciliationUndoPayload` fields from Task 3.
- Produces:
  - `applySchema.unmatches: z.array(z.object({ fingerprint: z.string().min(1), transactionId: uuidSchema("Lançamento") })).optional()`; the "Nenhuma decisão para aplicar." guard also requires `unmatches` empty.
  - The matched select (L215-219) also reads `isSettled`.
  - Inside `db.transaction`, **first** (before the insert at L309): for each unmatch, `update(transactions).set({ ofxImportFingerprint: null }).where(and(eq(userId), eq(id), eq(ofxImportFingerprint, fingerprint))).returning({ id })`; returned ones go to `released`.
  - `settledByApply`: account destination only, ids from `plan.fingerprintUpdates` that were updated and whose selected `isSettled` was not `true`.
  - `ApplyReconciliationResult` success gains `released: { transactionId: string; fingerprint: string }[]` and `settledByApply: string[]`.
  - `undoSchema` gains `released` (same shape as `reconciled`, optional) and `settledByApply: z.array(uuidSchema("Lançamento")).optional()`.
  - Undo order: delete batch rows, restore amounts, clear batch fingerprints (as today), then `set({ isSettled: false })` where `userId` and `inArray(id, settledByApply)`, then per released entry `set({ ofxImportFingerprint: fingerprint })` where `userId`, `id` and `isNull(ofxImportFingerprint)`.
- Update the stale JSDoc at L449-453 to mention the two new reversals.

Test declarations:
- `Test: new, because distinct failure path (release must precede the insert under the unique index)` in `describe("applyReconciliationAction — liquidação do casado")`.
- `Test: new, because distinct failure path (empty-decision guard with only unmatches)` same describe.
- `Test: extends reconciliation-action.test.ts::"marca como pago o lançamento casado quando o destino é conta"` (select row gets `isSettled: false`; assert `result.settledByApply` equals `[TX_ID]`).
- `Test: new, because distinct contract (undo restores settled flag and released fingerprint, in order)` in `describe("undoReconciliationAction")`.

- [x] **Step 1: Write the failing tests**

```ts
it("libera o fingerprint do casamento desfeito antes de criar a linha", async () => {
  const result = await applyReconciliationAction({
    ...baseInput,
    unmatches: [{ fingerprint: "fp-colegio", transactionId: TX_ID }],
    creations: [{ fingerprint: "fp-colegio", date: "2026-10-15", amount: 1560.85, transactionType: "expense", descriptor: "COLEGIO SANTO AGOSTINHO DIVINO", name: "Colégio" }],
  });
  expect(result).toMatchObject({ success: true, created: 1, released: [{ transactionId: TX_ID, fingerprint: "fp-colegio" }] });
  const releaseIndex = writes.findIndex((w) => w.kind === "update" && (w.payload as object as { ofxImportFingerprint?: unknown }).ofxImportFingerprint === null);
  const insertIndex = writes.findIndex((w) => w.kind === "insert");
  expect(releaseIndex).toBeGreaterThanOrEqual(0);
  expect(releaseIndex).toBeLessThan(insertIndex);
}); // [S: Colégio desfeito vira lançamento novo]

it("aceita aplicar só um casamento desfeito", async () => {
  const result = await applyReconciliationAction({ ...baseInput, unmatches: [{ fingerprint: "fp-colegio", transactionId: TX_ID }] });
  expect(result).toMatchObject({ success: true, released: [{ transactionId: TX_ID, fingerprint: "fp-colegio" }] });
}); // [S: Só desfazer já é uma decisão aplicável]

it("volta a pendente o que a aplicação pagou e devolve o fingerprint liberado", async () => {
  await undoReconciliationAction({
    importBatchId: "batch-1",
    reconciled: [{ transactionId: TX_ID_2, fingerprint: "fp-colegio" }],
    settledByApply: [TX_ID_3],
    released: [{ transactionId: TX_ID, fingerprint: "fp-colegio" }],
  });
  expect(writes.filter((w) => w.kind === "update").map((w) => w.payload)).toEqual([
    { ofxImportFingerprint: null },
    { isSettled: false },
    { ofxImportFingerprint: "fp-colegio" },
  ]);
}); // [S: Desfazer devolve o fingerprint do casamento desfeito] [S: Desfazer volta a pendente o que a confirmação pagou]
```

(`TX_ID_2`, `TX_ID_3`: new uuid literals next to `TX_ID`.)

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/actions/reconciliation-action.test.ts`. Expected: FAIL (schema strips `unmatches`; "Nenhuma decisão para aplicar."; no `released`/`settledByApply`).
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the same test file. Expected: PASS, including the pre-existing tests.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check --formatter-enabled=false` on both files.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/actions/reconciliation-action.ts src/features/transactions/actions/reconciliation-action.test.ts
git commit -m "feat(conciliacao): aplicar libera fingerprint de casamento desfeito e desfazer reverte pagamento"
```

---

### Task 5: Account balance context in the candidates action

**Files:**
- Modify: `src/features/transactions/lib/reconciliation-candidates.ts` (new export after `toAppTransaction`)
- Modify: `src/features/transactions/actions/reconciliation-candidates-action.ts` (result type L32-40, select L112-123, `Promise.all` L110-146, return L150-155)
- Test: `src/features/transactions/lib/reconciliation-candidates.test.ts`

**Interfaces:**
- Consumes: `BalanceStatus`, `AccountBalanceContext`, `PaidAfterEnd` from Task 2.
- Produces:
  - `export function toBalanceStatus(row: { isSettled: boolean | null; payerId: string | null; purchaseDate: Date | string | null }, context: { adminPayerId: string | null; cutoff: string }): BalanceStatus | null`: `null` when `adminPayerId` is null or `payerId !== adminPayerId`; `"unsettled"` when not settled; `"after-end"` when the date-only string is after `cutoff`; else `"in-balance"`.
  - `FetchReconciliationCandidatesResult` success gains `accountBalance: AccountBalanceContext | null` (`null` for card destinations or when there is no admin payer).
- Server work, account destination only, `cutoff = to` (the client already sends the max of `date`/`postedDate`, `reconciliation-page.tsx:73-93`):
  - candidate select also reads `isSettled` and `payerId`; `statusById` = `toBalanceStatus` per candidate, keeping non-null.
  - `baseline` = `financialAccounts.initialBalance` (where `userId` and `id`) + `sum(case when note = INITIAL_BALANCE_NOTE then 0 else amount end)` over `transactions` where `userId`, `accountId`, `isSettled = true`, `payerId = adminPayerId`, `purchaseDate <= parsedTo`. Same rule as the account card, `src/features/accounts/queries.ts:40-60`, plus the cutoff; copy the SQL (no cross-feature import). `INITIAL_BALANCE_NOTE` comes from `src/shared/lib/accounts/constants.ts`.
  - `paidAfterEnd` = `id, name, purchaseDate, amount` with the same filters but `purchaseDate > parsedTo`, ordered by `purchaseDate`; amount as signed `Number(amount)`.

Test declarations:
- `Test: new, because distinct contract (DB row to balance status is a seam the projection depends on)` in `reconciliation-candidates.test.ts`.
- SQL wiring: `Test: none, because it mirrors accounts/queries.ts:40-60 and is checked manually in Task 8 Step 5 against the account card`.

- [x] **Step 1: Write the failing test**

```ts
it.each([
  ["pago do admin até o fim do arquivo", { isSettled: true, payerId: "admin", purchaseDate: "2026-11-11" }, "admin", "in-balance"],
  ["pago do admin depois do fim do arquivo", { isSettled: true, payerId: "admin", purchaseDate: "2026-11-22" }, "admin", "after-end"],
  ["pendente do admin", { isSettled: false, payerId: "admin", purchaseDate: "2026-10-16" }, "admin", "unsettled"],
  ["pago de outra pessoa", { isSettled: true, payerId: "outra", purchaseDate: "2026-10-16" }, "admin", null],
  ["sem pessoa administradora", { isSettled: true, payerId: "admin", purchaseDate: "2026-10-16" }, null, null],
])("%s", (_, row, adminPayerId, expected) => {
  expect(toBalanceStatus(row, { adminPayerId, cutoff: "2026-11-11" })).toBe(expected);
});
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/transactions/lib/reconciliation-candidates.test.ts`. Expected: FAIL (not exported).
- [x] **Step 3: Implement** `toBalanceStatus`, then the action changes per Interfaces.
- [x] **Step 4: Run** the same test. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check --formatter-enabled=false` on the three files. (Deferred to the final gate by the workflow; not run in this task.)
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/lib/reconciliation-candidates.ts src/features/transactions/lib/reconciliation-candidates.test.ts src/features/transactions/actions/reconciliation-candidates-action.ts
git commit -m "feat(conciliacao): candidatos trazem o saldo base da conta com corte no fim do arquivo"
```

---

### Task 6: Review UI, suspicious bucket and undo match

**Files:**
- Modify: `src/features/transactions/components/reconciliation/reconciliation-review.tsx` (props L48-63, state L91-119, `consumedBy` L162-173, matched decisions L202-243, `canApply` L331-334, Casadas render L338-414, bank-only controls L446-607, `RowCard` L794-796)
- Modify: `src/features/transactions/components/reconciliation/reconciliation-page.tsx` (pass `fileStartDate`, L446-459)

**Interfaces:**
- Consumes: `detectMatchSuspicions`, `MatchSuspicion` (Task 1); `releaseFingerprint`, `buildConsumedTransactionIds(..., releasedFingerprints)` (Task 3).
- Produces: `ReconciliationReviewProps.fileStartDate: string` (page passes `extendedDateRange(review.statement).from`).

Behavior (UI copy exact):
- For each matched row with its app transaction, `suspicions = detectMatchSuspicions({ row: row.row, rule: row.rule, transaction: app, fileStartDate, destinationKind })`. Rows with suspicions render in a section "Precisa da sua decisão ({n})" above Casadas (omitted when n = 0); "Casadas ({n})" counts only the rest. The summary card keeps the total, as in the preview.
- New state `matchedState: Record<fingerprint, { action: "keep" | "create" | "link" | "skip"; expanded: boolean; name; transactionId; categoryId; subcategoryId; payerId }>`, default `action: "keep"`, create fields prefilled exactly like bank-only (`getBankOnly` L121-144).
- `RowCard` (L794-796) gains `tone?: "default" | "warning"`; warning adds the classes below.
- Suspicious row: `RowCard tone="warning"` (`border-warning/60 bg-warning/5`), `Badge` "Suspeito" (`bg-warning text-warning-foreground gap-1`, `RiAlertLine size-3`), description, today's meta line (amount, or "app X → arquivo Y" when divergent, `· casada por {rule}`), one sentence per suspicion, and the decision `Select` (`w-64`): "Manter casamento" / "Criar lançamento novo" / "Vincular a outro lançamento" / "Pular".
  - `before-file-start`: `Casou com “{app.name}” de {dd/MM}, antes do início do arquivo ({dd/MM}). O débito desse lançamento pode ter sido outro.`
  - `amount-divergence`, not divided: `Valor diferente: o lançamento “{app.name}” tem {formatCurrency(appAmount)}. Manter alinha o valor ao do arquivo.`; divided: `Valor diferente: o lançamento “{app.name}” tem {formatCurrency(appAmount)}. Ele é dividido, então manter grava só a conciliação, sem mexer no valor.`
  - `dd/MM` via `formatDateOnly(date, { day: "2-digit", month: "2-digit", year: undefined })` (`src/shared/utils/date.ts:376`).
- Regular matched row (with or without divergence): keeps today's content (checkbox for non-divergent, explanatory text for divergent) plus a ghost `Button size="sm"` "Desfazer casamento" (`text-muted-foreground`) that sets `expanded: true` and shows the same `Select`.
- When the matched action is `create` or `link`, render the same fields as a bank-only row in that action. Extract the bank-only create/link field block (L471-590) into a local component in the same file and use it in both places; the matched select has no "Ignorar".
- Decisions for matched rows: `keep` = today's logic (L205-242, checkbox unchecked still means plain `skip` with no release); `create` = create decision (`isInvoiceCredit: isCreditLine(row.row)`); `link` with a chosen id = link decision with `linkAmountUpdate`; `link` without id or `skip` = `{ action: "skip" }`. Every non-keep matched decision carries `releaseFingerprint: { transactionId: row.transactionId }` iff `row.rule === "fingerprint"`.
- `consumedBy`: matched rows whose action is not `keep` go in `releasedFingerprints`; matched `link` choices go in `linkedByFingerprint` like bank-only links.
- `canApply`: `decisions.some((e) => e.decision.action !== "skip" || ("releaseFingerprint" in e.decision && e.decision.releaseFingerprint))`.

Test declaration: `Test: none, because the rules are locked by Task 1 (suspicion), Task 3 (payload release, consumed set) and Task 4 (server); the rest is markup`.

- [x] **Step 1: Implement** the behavior above.
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check --formatter-enabled=false src/features/transactions/components/reconciliation/reconciliation-review.tsx src/features/transactions/components/reconciliation/reconciliation-page.tsx`. Expected: no errors. (tsc passed; biome deferred to the final gate by the workflow, not run in this task.)
- [x] **Step 3: Run** the reconciliation lib tests once: `pnpm exec vitest run src/features/transactions/lib/reconciliation-review.test.ts`. Expected: PASS.
- [x] **Step 4: Commit**

```bash
git add src/features/transactions/components/reconciliation/reconciliation-review.tsx src/features/transactions/components/reconciliation/reconciliation-page.tsx
git commit -m "feat(conciliacao): balde de casamentos suspeitos e desfazer casamento na revisao"
```

---

### Task 7: Bulk create and category on ambiguous creations

**Files:**
- Modify: `src/features/transactions/components/reconciliation/reconciliation-review.tsx` (`BucketSection` L779-792, bank-only header L416, ambiguous state L108-119 and `getAmbiguous` L146-153, ambiguous decision L300-310, ambiguous render L670-745)

**Interfaces:**
- `BucketSection` gains `action?: React.ReactNode`, rendered right of the title (`flex items-center justify-between`).
- "Só no banco" action: `Button variant="outline" size="sm"` "Marcar todas como Criar"; sets `action: "create"` only on bank-only rows whose current state (`getBankOnly`) is `"skip"`, keeping their other fields; disabled when none is in `"skip"`. [S: Marcar todas como Criar]
- Ambiguous state gains `subcategoryId`; its default `categoryId`/`subcategoryId` use the same prefill as bank-only (learned mapping, then `matchCategoryByRawLabel`, then `pickRememberedSubcategory`). When the action is `create`, render the category `Select` + `SubcategorySelect` exactly as the bank-only row does (L487-527). The create decision passes `subcategoryId`. [S: Ambígua criada na conciliação reaplica Faxina]

Test declaration: `Test: none, because the memory write is locked by Task 3 (plan learns from creations) and the payload already carries subcategoryId (reconciliation-review.test.ts::buildReconciliationApplyPayload); the rest is markup`.

- [x] **Step 1: Implement** the behavior above.
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check --formatter-enabled=false src/features/transactions/components/reconciliation/reconciliation-review.tsx`. (tsc passed; biome deferred to the final gate by the workflow, not run in this task. No test file covers this tsx, so no scoped vitest run.)
- [x] **Step 3: Commit**

```bash
git add src/features/transactions/components/reconciliation/reconciliation-review.tsx
git commit -m "feat(conciliacao): marcar todas como criar e subcategoria nas ambiguas criadas"
```

---

### Task 8: Sticky apply bar with projected balance

**Files:**
- Create: `src/features/transactions/components/reconciliation/reconciliation-apply-bar.tsx`
- Modify: `src/features/transactions/components/reconciliation/reconciliation-review.tsx` (replace the apply block L754-761)
- Modify: `src/features/transactions/components/reconciliation/reconciliation-page.tsx` (`ReviewState` L64-71, `setReview` L228-235, review props L446-459)

**Interfaces:**
- Consumes: `projectAccountBalance`, `projectInvoiceTotal`, `AccountBalanceContext`, `PaidAfterEnd` (Task 2); `statementFinalBalance` (Task 2); `accountBalance` (Task 5).
- Produces:
  - `ReviewState.accountBalance: AccountBalanceContext | null` (from the candidates result).
  - `ReconciliationReviewProps.projectionTarget: { kind: "statement"; context: AccountBalanceContext; finalBalance: { day: string; balance: number } | null } | { kind: "invoice"; invoicePeriod: string; expectedTotal: number | null } | null`. The page builds it: statement when `accountBalance` is non-null, with `statementFinalBalance(review.statement.transactions)`; invoice when the destination is a card, with `expectedTotal = closure?.kind === "invoice" ? closure.result.expectedTotal : null`; else `null`.
  - In the review, `useMemo` over `buildReconciliationApplyPayload(decisions, defaultPayerId)` feeds the projection, so it recomputes on every decision change.
  - `export function ReconciliationApplyBar(props: { projection: { label: string; projected: number; targetLabel: string; target: number | null } | null; paidAfterEnd: PaidAfterEnd[]; suspiciousCount: number; blockReason: string | null; canApply: boolean; isApplying: boolean; onApply: () => void })`.

Bar layout and copy (exact, from the preview):
- Container: `bg-background/95 sticky bottom-0 flex flex-col gap-2 border-t py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between`.
- Statement: badge `Bate` (`Badge variant="success"`) when the cents of projected and target are equal, else `Diferença de {formatCurrency(Math.abs(target - projected))}` (`bg-warning text-warning-foreground`); text `Saldo do app após aplicar: <b>{formatCurrency(projected)}</b> · Saldo final do extrato ({dd/MM}): <b>{formatCurrency(target)}</b>`. With no `finalBalance`: no badge and `Saldo final do extrato indisponível`.
- Invoice: same badge rule; `Total da fatura no app após aplicar: <b>X</b> · Total informado: <b>Y</b>`; with no total: `Informe o total da fatura para comparar`.
- When `paidAfterEnd` is non-empty: `{n} lançamento(s) pago(s) depois do fim do arquivo · ver` where "ver" opens a `Popover` listing `{name} ({dd/MM}) {formatCurrency(amount)}` per item.
- Right side: `{n} casamento(s) suspeito(s)` in `text-warning text-sm` when n > 0, the block reason in `text-destructive text-xs` when blocked, and `Button` "Aplicar" / "Aplicando…".

Test declaration: `Test: none, because the numbers are locked by Task 2 and this task is wiring and markup`.

- [x] **Step 1: Implement** the bar, the review props and the page wiring.
- [x] **Step 2: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check --formatter-enabled=false` on the three files. (Deferred to the final gate by the workflow, not run in this task.)
- [x] **Step 3: Run** `pnpm exec vitest run src/features/transactions/lib/reconciliation-projection.test.ts`. Expected: PASS. (10/10 PASS.)
> Steps 4 and 5 are MANUAL (human, after the automated run, against the deployed app or a dev server with a real DB). The implementer does NOT run them and does NOT start any server; it marks them pending and moves on to Step 6.

- [ ] **Step 4 (manual, pending human): Visual check** (one dev server, nothing else heavy in parallel): `pnpm run dev`, open `/transactions/reconciliation`, upload a C6 statement, confirm the bar stays visible while scrolling, turns green/amber as decisions change, and the suspicious counter matches the top bucket.
- [ ] **Step 5 (manual, pending human): Baseline sanity check** (covers Task 5's SQL): in the same review, with no decision that writes (all bank-only in Pular, every match kept with equal amounts and already settled), projected + Σ `paidAfterEnd` amounts must equal the account card balance on `/accounts`. A mismatch means the baseline SQL drifted from `accounts/queries.ts:40-60`.
- [x] **Step 6: Commit**

```bash
git add src/features/transactions/components/reconciliation/reconciliation-apply-bar.tsx src/features/transactions/components/reconciliation/reconciliation-review.tsx src/features/transactions/components/reconciliation/reconciliation-page.tsx
git commit -m "feat(conciliacao): barra fixa com saldo previsto e casamentos suspeitos junto do aplicar"
```

---

### Task 9: Not-reconciled indicator on the account statement

**Files:**
- Create: `src/features/accounts/lib/unreconciled.ts`, Test: `src/features/accounts/lib/unreconciled.test.ts`
- Modify: `src/features/accounts/statement-queries.ts` (new export after `fetchAccountSummary`, ~L155)
- Modify: `src/features/transactions/components/types.ts` (`TransactionItem`, after `readonly?` ~L42)
- Modify: `src/features/transactions/components/table/transaction-settlement-button.tsx` (account branch L82-115)
- Modify: `src/app/(dashboard)/accounts/[accountId]/statement/page.tsx` (`Promise.all` L96-102, `transactionData` L121)

**Interfaces:**
- Produces:
  - `export function isUnreconciledSettled(tx: { isSettled: boolean | null; purchaseDate: string; ofxImportFingerprint: string | null }, firstReconciledDate: string | null): boolean`: true iff settled, no fingerprint, `firstReconciledDate` non-null and `purchaseDate >= firstReconciledDate`.
  - `export async function fetchFirstReconciledDate(userId: string, accountId: string): Promise<string | null>`: `min(purchaseDate)` over `transactions` where `userId`, `accountId`, `ofxImportFingerprint is not null`, as `YYYY-MM-DD` via `toDateOnlyString`.
  - `TransactionItem.isUnreconciled?: boolean`.
  - Statement page: `transactionData.map((item, index) => ({ ...item, isUnreconciled: isUnreconciledSettled({ ...item, ofxImportFingerprint: transactionsPage.rows[index]?.ofxImportFingerprint ?? null }, firstReconciledDate) }))` (rows come from `selectTransactionsWithRelations`, `transactions/queries.ts:90-131`; confirm the flattened field name there). Only this page sets the flag, so card invoices never show it.
  - `TransactionSettlementButton`: when `item.isUnreconciled`, render before the button a `Tooltip` with `RiLinkUnlinkM` (`size-4`, `text-warning`, `aria-hidden`) and content "Pago, mas não conciliado com o extrato", plus an `sr-only` span with the same text. Both the table (`transactions-columns.tsx:551`) and the mobile list (`transactions-mobile-list.tsx:320`) get it through this component.

Test declaration: `Test: new, because distinct contract (new pure rule from the builder's calls)`. Query: `Test: none, because a single min() select; covered by the visual check`.

- [x] **Step 1: Write the failing test**

```ts
it.each([
  ["mensalidade paga em 22/11 sem fingerprint", { isSettled: true, purchaseDate: "2026-11-22", ofxImportFingerprint: null }, "2026-09-01", true], // [S: Mensalidade marcada como paga por engano]
  ["conciliado", { isSettled: true, purchaseDate: "2026-11-22", ofxImportFingerprint: "fp" }, "2026-09-01", false],
  ["pendente", { isSettled: false, purchaseDate: "2026-11-22", ofxImportFingerprint: null }, "2026-09-01", false],
  ["anterior à primeira conciliação", { isSettled: true, purchaseDate: "2026-08-31", ofxImportFingerprint: null }, "2026-09-01", false], // [S: Histórico anterior à primeira conciliação fica limpo]
  ["conta nunca conciliada", { isSettled: true, purchaseDate: "2026-11-22", ofxImportFingerprint: null }, null, false],
])("%s", (_, tx, first, expected) => {
  expect(isUnreconciledSettled(tx, first)).toBe(expected);
});
```

- [x] **Step 2: Run** `pnpm exec vitest run src/features/accounts/lib/unreconciled.test.ts`. Expected: FAIL (module missing).
- [x] **Step 3: Implement** per Interfaces.
- [x] **Step 4: Run** the same test. Expected: PASS.
- [x] **Step 5: Typecheck and lint** `pnpm exec tsc --noEmit`; `pnpm exec biome check --formatter-enabled=false` on the six files.
- [x] **Step 6: Commit**

```bash
git add src/features/accounts/lib/unreconciled.ts src/features/accounts/lib/unreconciled.test.ts src/features/accounts/statement-queries.ts src/features/transactions/components/types.ts src/features/transactions/components/table/transaction-settlement-button.tsx "src/app/(dashboard)/accounts/[accountId]/statement/page.tsx"
git commit -m "feat(contas): indicador de lancamento pago sem conciliacao no extrato"
```

---

### Task 10: Update the auditar-conciliacao skill

**Files:**
- Modify: `.claude/skills/auditar-conciliacao/SKILL.md` ("Armadilhas do app" table, L96-111)

Changes (PT-BR, same table format):
- Row L100 ("Saldo da conta nunca bate"): keep the cause (card sums every settled transaction, no date filter); "O que fazer" becomes: on the review, read the sticky bar (saldo previsto com corte no fim do arquivo) and the list "pagos depois do fim do arquivo"; on the account statement, the `RiLinkUnlinkM` icon marks settled transactions not reconciled.
- Rows L105-106 (parcela antiga / "N linha(s) não foram criadas"): for a wrong fingerprint match, re-upload the file and use "Desfazer casamento" (or the suspicious bucket) choosing Criar/Vincular/Pular; Apply frees the old fingerprint and Undo restores it. Keep the SQL only for data affected before this version that does not show up in a review.
- Row L107: "fatura fecha"/"Fecha" checks the file against itself; the projected bar compares app vs file.
- New row: "Casamento em 'Precisa da sua decisão'" | lançamento do app anterior ao início do arquivo (conta) ou valor diferente | confira o débito real; Manter alinha o valor, Criar/Vincular desfaz.
- New row: "Desfazer depois de aplicar" | o toast desfaz criação, valores, fingerprints liberados e o pago que a confirmação marcou | só existe no toast da sessão.

Test declaration: `Test: none, because documentation only`.

- [x] **Step 1: Edit** the table as above.
- [x] **Step 2: Commit**

```bash
git add .claude/skills/auditar-conciliacao/SKILL.md
git commit -m "docs(skills): auditar-conciliacao com aviso de suspeito, desfazer casamento e saldo previsto"
```

---

### Task 11: Release 2.15.0 and cleanup

**Files:**
- Modify: `CHANGELOG.md` (new section above `## [2.14.0]`), `package.json` (`"version"`), `README.md` (badge L13)
- Delete: `src/app/preview-conciliacao/` (untracked: plain delete, nothing to stage)

- [x] **Step 1: Delete the preview route** `rm -r src/app/preview-conciliacao`. Expected: `git status --short` no longer lists it.
- [x] **Step 2: Full suite** `pnpm exec vitest run --maxWorkers=4`. Expected: all PASS. Then `pnpm exec tsc --noEmit`. Expected: no errors. (Deferred to the final gate by the workflow; not run in this task.)
- [x] **Step 3: Version 2.15.0** in `package.json` and the README badge (`version-2.15.0-blue`).
- [x] **Step 4: CHANGELOG** `## [2.15.0] - <date>`, a PT-BR intro paragraph (e.g. "Esta versão torna a conciliação confiável na virada do mês: a revisão avisa os casamentos duvidosos, deixa desfazer qualquer casamento sem SQL e mostra o saldo previsto do app contra o do extrato antes de aplicar."), then:
  - `### Adicionado`: balde "Precisa da sua decisão" com o motivo; "Desfazer casamento" em toda linha casada; barra fixa com saldo previsto (ou total da fatura) e lista de pagos depois do fim do arquivo; "Marcar todas como Criar"; categoria e subcategoria nas ambíguas criadas; indicador de pago não conciliado no extrato da conta.
  - `### Alterado`: linhas criadas com categoria passam a alimentar a memória de categoria e subcategoria; o desfazer devolve fingerprints liberados e volta a pendente o que a confirmação pagou.
- [x] **Step 5: Commit** (no tag; tags only with the user's explicit authorization, AGENTS.md rule 6)

```bash
git add CHANGELOG.md package.json README.md
git commit -m "chore: preparar versao 2.15.0"
```
