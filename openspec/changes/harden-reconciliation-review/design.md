# Harden reconciliation review: design

Date: 2026-11-11

## Intent

The user reconciles the C6 checking-account statement once or twice a month and the closed credit
card invoice once a month, between days 11 and 16. In the last two months the app balance ended
different from the bank, and every error was born at the month boundary. The user wants to apply a
reconciliation and trust the result, with a human in the loop for doubtful matches: the app warns,
the user decides during the review.

Success: after Apply, the account balance equals the statement's final balance, previous months stay
intact, and any doubtful match was shown to the user before Apply, not discovered afterwards.

## Evidence (2026-11-11 session, statement 12/10 to 11/11)

| Case | What happened | Root cause |
|---|---|---|
| Fernanda R$ 275 | Debit of 26/10 matched "Terapia" of 11/10, whose real debit was 05/10. One debit left without a transaction, balance off by R$ 275 | name-period rule accepts a candidate dated before the file start; it ignores date and amount |
| Danielle R$ 210 x4 | Debits of 16-27/10 got candidates of 01/10 and 09/10 (paid, never reconciled) | same rule, candidates fetched by whole month |
| Colégio | Row 15/10 R$ 1.560,85 matched the R$ 1.643 monthly fee via a fingerprint written by an earlier import; Apply would overwrite 1.643 with 1.560,85; the row had no checkbox | stale fingerprint; matched rows with amount divergence cannot be unchecked; fixed by SQL |
| Mensalidade 22/11 | Marked paid by mistake, balance off by R$ 1.643 | not a code bug, but nothing in the review showed the app balance would diverge |

Code facts (recon, file:line as of 2026-11-11):

- Candidates: date range of the file ±3 days **OR** `period IN` the calendar months of the rows
  (`reconciliation-candidates-action.ts:84-108`). Settled status and existing fingerprint do not
  filter. Card invoices use `period` only.
- Rule order: fingerprint, installment, exact (±2 days, `DATE_WINDOW_DAYS`), cents, name-period
  (`matcher.ts:219-228`). name-period compares learned name + row's calendar month + type, never
  amount or date (`matcher.ts:198-217`).
- `checkStatementClosure` only checks day-balance deltas inside the file (`closure.ts:49-104`).
  Nothing compares with the app balance.
- Matched rows without divergence have a checkbox; unchecking sends `skip`. Rows with divergence
  have no control and always send `confirm` + `amountUpdate` (`reconciliation-review.tsx:205-237`).
- Undo deletes the batch's created rows, restores amounts and clears fingerprints of the batch; it
  does not revert `isSettled` set on confirm (`reconciliation-action.ts:454-521`).
- Category memory learns only from confirmations (`reconciliation-plan.ts:185-197`); created rows
  never teach it. Ambiguous "Criar" has no category/subcategory controls.
- The bank-only bucket already has category + subcategory selects with memory prefill.

## Goals

1. **Suspicious match warning.** A matched row is suspicious when the matched app transaction is
   dated before the file's first date (min of `date`/`postedDate`), or when it was matched by
   fingerprint and its amount differs from the row (user decision 2026-11-11: divergence on other
   rules, typical of estimated recurring bills like Cemig, is not flagged). The row shows a badge with the reason in plain PT-BR (e.g. "Este
   lançamento é de 11/10, antes do início do arquivo (12/10)") and a decision control.
   Applies to any rule, including fingerprint.
2. **Undo a match in the review.** Every matched row, suspicious or not, has a decision control:
   Manter (confirm) / Criar lançamento / Vincular a outro / Pular. Choosing anything but Manter on a
   fingerprint match clears that fingerprint from the old transaction on Apply (and Undo restores
   it). No more SQL.
3. **Projected balance before Apply.**
   - Statement: "Saldo do app após aplicar" vs "Saldo final do extrato" with the difference. App
     balance uses the same rule as the account card (sum of settled, admin payer), with a cutoff at
     the file end date (see Builder's calls); the projection
     adds the effect of the current decisions (creations, amount alignments, confirmations that turn
     an unsettled transaction into settled). File final balance = `dayBalance` of the last posted
     day.
   - Invoice: "Total da fatura no app após aplicar" vs the informed total.
   - Recomputed live as the user changes decisions. Shows green when the difference is zero, amber
     otherwise. Informative: it never blocks Apply.
4. **Bulk create.** "Só no banco" header gets "Marcar todas como Criar" (affects rows currently in
   Pular).
5. **Not-reconciled indicator.** On the account statement screen, a settled transaction without
   `ofx_import_fingerprint` shows a discreet indicator with a tooltip ("Pago, mas não conciliado
   com o extrato"). Accounts only.
6. **Subcategory and memory.** Ambiguous rows set to "Criar" get category + subcategory selects with
   the same memory prefill as bank-only. Created rows (bank-only and ambiguous) whose category was
   set feed `import_category_mappings` (category + subcategory), same as confirmations.

## Non-goals

- Changing how candidates are fetched or the rule order. The user chose warn-and-decide over
  blocking; matching stays as is, the review gets smarter.
- Auto-fixing data. No silent change to existing transactions.
- Card-statement indicator, mapping management screen, reverting name/category memory on Undo.

## Anti-goals

- Blocking Apply or forcing the user through extra steps when nothing is suspicious.
- A warning that fires on most rows (noise kills trust). Expected volume: a handful per month.
- Any change that alters an already-reconciled month without the user choosing it.

## Constraints

- Feature-first layout, `userId` filter in every query, Zod on action inputs, PT-BR UI copy.
- Matcher stays a pure function; suspicion is computed from data already in the review input.
- No DB migration expected.
- UI changes need the mockup-ui step (2-3 HTML previews with the app's real CSS) and a choice
  before the plan.
- Tests follow test-slop-guard; matcher and plan changes get unit tests from the evidence table.

## Decisions taken with the user

- Warn and let the user decide during the import (not block).
- Scope: the six goals above.
- The suspicion rule (before file start or different amount) covers the known cases.

## UI decisions

Chosen: **Option B** (2026-11-11). Preview: `src/app/preview-conciliacao/page.tsx` (route
`/preview-conciliacao`, untracked, delete before merge).

- Suspicious matches live in their own bucket at the top, "Precisa da sua decisão (N)", above
  Casadas; Casadas count excludes them. Each row: warning-tone `RowCard` (`border-warning/60
  bg-warning/5`), `Badge` "Suspeito" (`bg-warning`), meta line, reason sentence, and a `Select`
  Manter casamento / Criar lançamento novo / Vincular a outro lançamento / Pular (default Manter).
- Regular matched rows keep the checkbox and gain a ghost "Desfazer casamento" button that opens the
  same decision options.
- Projected balance lives in a sticky bottom bar next to Aplicar: badge (warning when the
  difference is non-zero, emerald "Bate" when zero), app-after-apply vs file final balance, and a
  link line to the "pagos depois do fim do arquivo" list; plus the counter "N casamentos suspeitos".
- "Só no banco" header: outline small `Button` "Marcar todas como Criar" on the right.
- Account statement: warning-tone icon `RiLinkUnlinkM` next to the settled check, tooltip "Pago, mas
  não conciliado com o extrato".
- Discarded: A (projection at the top scrolls out of view while deciding), C (suspicious rows mixed
  into a long Casadas list are easy to miss).

## Builder's calls (mine, to be checked)

- Suspicious rows default to Manter, highlighted, with a counter near Apply ("N casamentos
  suspeitos"). Rationale: no extra clicks when the match is right; the projected balance is the
  safety net.
- The projected balance ignores rows the user set to Pular/Ignorar (they write nothing).
- "Vincular a outro" on a matched row reuses the existing link-candidate list, which already hides
  candidates consumed by other rows.
- Projected balance has a cutoff at the file's last posted date: sum of settled transactions dated
  up to that day, plus the effect of the decisions. Settled transactions dated after the file end
  are listed separately ("Pagos depois do fim do arquivo: N, R$ X", with names), because the file
  runs until the export day and such items are paid in the app but not in the bank. This is what
  would have caught the Mensalidade 22/11.
- Undoing a match (Criar / Vincular a outro / Pular on a matched row) leaves the previously matched
  transaction intact (still settled, same amount); it only loses the fingerprint. Both real cases
  (Fernanda 11/10, Colégio 22/10) were legitimate transactions linked to the wrong debit. If that
  doubles an expense, the projected balance shows it before Apply.
- "Before the file start" applies to account statements only. Card invoices use the invoice period
  and installments legitimately carry old purchase dates; on invoices only amount divergence flags.
- The not-reconciled indicator only marks settled transactions dated on or after the account's
  first reconciled transaction (earliest date with a fingerprint), so pre-reconciliation history
  stays clean.
- Undo restores fingerprints removed by undone matches, carried in the client undo payload like
  today's `reconciled`/`amountUpdates`. Undo stays available only in the session toast, as today.

- Undo also reverts `isSettled` for confirmations that turned an unsettled transaction into settled
  (user decision, 2026-11-11). The undo payload carries which ones were unsettled before Apply.
