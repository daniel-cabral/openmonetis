# Planning planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Default execution in this repo: skill `executar-plano` (sdd.js).

**Goal:** A docked, persisted, streaming planner chat whose tools read app data and the deterministic engine, and whose proposals are previewed and applied only on the user's click.

**Architecture:** Server: `POST /api/planning/chat` loads the conversation and the `PlanningSnapshot`, builds tools around the pure engine, streams with `streamText` and persists on finish. Pure planner logic (proposal schema, applying changes to `EngineInput`, summaries, context pack, cut ranking, drift diagnosis) lives in `src/features/planning/lib/planner/` and is unit-tested. Client: `PlannerPanel` with `useChat` and `DefaultChatTransport`; `PlanningPage` owns the preview state and re-runs `runProjection` on `applyChangesToInput`.

**Tech Stack:** AI SDK `ai@6` (`streamText`, `tool`, `stepCountIs`, `convertToModelMessages`, `validateUIMessages`, `createIdGenerator`, `MockLanguageModelV3` from `ai/test`), `@ai-sdk/react@3`, provider packages already installed, Zod 4, Next.js 16.3 route handlers, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-23-financial-planning-design.md` (sections "5. LLM planner", "Anti-goals", "UI decisions"). Read `node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx`, `03-chatbot-message-persistence.mdx`, `03-chatbot-tool-usage.mdx`, `node_modules/ai/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx` and `55-testing.mdx`, and `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` before Tasks 9 and 10.

## Global Constraints

- Depends on `planning-engine`, `planning-data` and `planning-page` merged. Names used: `EngineInput`, `EnginePlan`, `runProjection`, `simulateLever`, `Lever`, `stressEffects`, `DriftSignal` (engine); `planInputSchema`, `planFieldsSchema`, `planEventFieldsSchema`, `planningSettingsFieldsSchema`, `assumptionInputSchema`, `PlanningSnapshot`, `PlanView`, `fetchPlanningSnapshot`, `writes.ts` helpers, tables `plannerConversations`, `plannerMessages`, `assumptionLog` (data); `PlanningPage`, `LiquidityChart` `previewLabel`, `buildPlanRows`, `DriftBanner`, `driftMessages` (page).
- Anti-goal: the LLM never produces figures. Every number shown in a card comes from engine output computed server-side in the tool; the system prompt forbids computing figures and requires tools.
- Nothing changes data without the user's click on "Aplicar". Tools are read-only; `propose_change` has no side effects.
- LLM-facing amounts are reais, never cents: the context pack and tool outputs format money with `formatCurrency` (e.g. "R$ 100.000,00"); tool inputs take reais as decimal numbers (max 2 decimals) and convert with `toCents` at the boundary. Internal engine/data values stay `Cents`. Percentages are plain numbers.
- Route security (AGENTS.md): `getOptionalUserSession()` first, 401 if absent; conversation ownership by `userId` (404 otherwise); generic error messages, details only in `console.error`.
- No recommendation of specific assets or products (spec non-goal): stated in the system prompt.
- Web search degrades gracefully: unsupported provider → tool absent, chat still works.
- UI copy PT-BR; identifiers English. Public repo: no personal figures.
- Iterate with `pnpm exec vitest run <file>`; lint per file; `tsc` once at the end. One heavy process at a time.
- Commits PT-BR `feat(planning): ...` / `refactor(ai): ...`, explicit paths only.

## Review Focus

1. Malformed or hallucinated proposal (unknown `planId`, window violation, amount with more than 2 decimals or negative where not allowed): `propose_change` returns `{ error }` to the model instead of throwing, and no card offers "Aplicar". Test in Task 5.
2. Double click on "Aplicar" or applying the same proposal from a reloaded thread: second call returns `"Proposta já aplicada."` and writes nothing. Test in Task 11.
3. Conversation id of another user, or none at all: 404 / 401 and nothing persisted. Test in Task 10.
4. Provider without web search (Ollama, MiniMax, OpenRouter): no search tool, no error. Test in Task 2.
5. Client disconnects mid-stream: messages are still persisted (`consumeStream`). Test in Task 9.

---

### Task 1: Move the model catalogue and resolver to shared

**Files:**
- Create: `src/shared/lib/ai/models.ts` (move `AIProvider`, `PROVIDERS`, `AVAILABLE_MODELS`, `DEFAULT_MODEL`, `DEFAULT_PROVIDER` from `src/features/insights/constants.ts`)
- Create: `src/shared/lib/ai/model-provider.ts` (move of `src/features/insights/lib/model-provider.ts`; export renamed `resolveLanguageModel`, same body)
- Modify: `src/features/insights/constants.ts` (`export { ... } from "@/shared/lib/ai/models"` for the moved names, insights prompt stays), `src/features/insights/actions/generate.ts` (import `resolveLanguageModel`)
- Delete: `src/features/insights/lib/model-provider.ts`

Test: none, because no behaviour change (move and rename; `tsc` proves the imports).

- [ ] **Step 1:** Move the code with `git mv src/features/insights/lib/model-provider.ts src/shared/lib/ai/model-provider.ts`, then edit.
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Run** `pnpm exec knip --reporter compact`. Expected: no new unused export from the moved files.
- [ ] **Step 4: Commit** the five paths; `git commit -m "refactor(ai): provedores de modelo em shared para reuso pelo planejamento"`.

### Task 2: Web search tool resolution

**Files:**
- Create: `src/shared/lib/ai/web-search.ts`
- Test: `src/shared/lib/ai/web-search.test.ts`

**Interfaces:**
- Consumes: `AVAILABLE_MODELS`.
- Produces: `resolveWebSearchTools(modelId: string): ToolSet`: Anthropic → `{ web_search: anthropic.tools.webSearch_20250305({ maxUses: 3 }) }`; OpenAI → `{ web_search: openai.tools.webSearch({}) }`; Google → `{ google_search: google.tools.googleSearch({}) }`; `ollama:`, `openrouter:` / slash ids, MiniMax, unknown → `{}`.

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: one `it.each` over one model id per provider taken from `AVAILABLE_MODELS` (by `provider` field, not hard-coded ids) plus `"ollama:llama3"` and `"meta/llama-3"` → expected key list (`["web_search"]`, `["google_search"]` or `[]`).
- [ ] **Step 2: Run** `pnpm exec vitest run src/shared/lib/ai/web-search.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(ai): busca na web conforme o provedor"`.

### Task 3: Proposal schema and applying changes to the engine input

**Files:**
- Create: `src/features/planning/lib/planner/proposal.ts`
- Test: `src/features/planning/lib/planner/proposal.test.ts`

**Interfaces:**
- Produces:

```ts
export const proposalChangeSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create-plan"), plan: planInputSchema, events: z.array(planEventFieldsSchema).max(10).default([]) }),
  z.object({ op: z.literal("update-plan"), planId: z.uuid(), patch: planFieldsSchema.partial() }),
  z.object({ op: z.literal("add-event"), planId: z.uuid(), event: planEventFieldsSchema }),
  z.object({ op: z.literal("update-settings"), patch: planningSettingsFieldsSchema.pick({ plannedContribution: true, reserveMonths: true, indexForecastPct: true }).partial() }),
  z.object({ op: z.literal("record-assumption"), assumption: assumptionInputSchema }),
]);
export const proposalSchema = z.object({ title: z.string().min(1).max(120), rationale: z.string().max(1000), changes: z.array(proposalChangeSchema).min(1).max(10) });
export type ProposalChange = z.infer<typeof proposalChangeSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export class ProposalError extends Error {}
export function applyChangesToInput(input: EngineInput, changes: ProposalChange[], newId?: (index: number) => string): EngineInput;
```

- Rules: `create-plan` appends an `EnginePlan` (priority = max + 1, `bidHistory: []`, `mappedMonthlyOutflow: 0`, events with generated ids); `update-plan` merges then re-validates with `planInputSchema` (`ProposalError` with the Zod message on failure); unknown `planId` → `ProposalError("Plano não encontrado.")`; `update-settings` changes `reserveMonths` and `indexForecastPct` (`plannedContribution` does not affect the engine); `record-assumption` is a no-op. Never mutates `input`.

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing tests**: create-plan appends with priority 3 after plans 1 and 2; update-plan moving `targetMonth` out of its window throws `ProposalError`; unknown planId throws; `update-settings { reserveMonths: 6 }` changes only that field; input object unchanged (deep equal to a copy taken before).
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/proposal.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): schema de proposta e aplicacao na entrada do motor"`.

### Task 4: Projection summary and diff

**Files:**
- Create: `src/features/planning/lib/planner/summary.ts`
- Test: `src/features/planning/lib/planner/summary.test.ts`

**Interfaces:**
- Produces: `type ProjectionSummary = { horizonEnd: Period; firstUnfunded: Record<"base" | "pessimistic", { month: Period; planName: string } | null>; minSlack: Record<"base" | "pessimistic", Cents>; plans: { id: string; name: string; health: PlanHealth; shortfallBase: Cents }[] }`; `summarizeProjection(projection: Projection, plans: Pick<EnginePlan, "id" | "name">[]): ProjectionSummary`; `type ProposalDiff = { healthChanges: { name: string; from: PlanHealth | null; to: PlanHealth }[]; firstUnfundedBase: { from: Period | null; to: Period | null }; minSlackBaseDelta: Cents }`; `diffSummaries(before: ProjectionSummary, after: ProjectionSummary): ProposalDiff` (new plans have `from: null`).

Test: new, because distinct contract.

- [ ] **Step 1: Write the failing test**: two hand-built `Projection` objects (literal months and BRL-formatted amounts) → summary fields literal; diff of at-risk → on-track and a new plan → `healthChanges` with both entries, `minSlackBaseDelta` literal.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/summary.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): resumo e diferenca de projecoes"`.

### Task 5: Planner tools

**Files:**
- Create: `src/features/planning/lib/planner/cut-candidates.ts`, `src/features/planning/lib/planner/tools.ts`, `src/features/planning/lib/queries/category-totals.ts`
- Test: `src/features/planning/lib/planner/tools.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4, `runProjection`, `applyStress`, `simulateLever`.
- Produces:
  - `type CategoryTotal = { categoryId: string; categoryName: string; month: Period; amount: Cents }`; `fetchCategoryTotals(userId: string, adminPayerId: string, from: Period, to: Period): Promise<CategoryTotal[]>` (Despesa, admin payer, grouped by category and period, userId filter).
  - `rankCutCandidates(totals: CategoryTotal[], months: number, excludedCategoryIds: Set<string>): { categoryName: string; monthlyAverage: Cents; lastMonth: Cents }[]` (top 5 by average; excludes mapped and contribution categories).
  - `type PlannerToolDeps = { input: EngineInput; plans: PlanView[]; excludedCategoryIds: Set<string>; loadCategoryTotals: (from: Period, to: Period) => Promise<CategoryTotal[]>; webSearch: ToolSet }`
  - `buildPlannerTools(deps: PlannerToolDeps): ToolSet` with exactly: `get_category_totals { from, to }`, `list_cut_candidates { months (1..12) }`, `run_projection { changes?: ProposalChange[], stress?: StressToggles }` → `ProjectionSummary`, `simulate_lever { lever: Lever }` → `LeverResult` (or `{ error }` on `LeverError`), `propose_change: proposalSchema` → `{ proposalId: toolCallId, proposal, before: ProjectionSummary, after: ProjectionSummary, diff: ProposalDiff }` or `{ error }` on `ProposalError`; plus `...deps.webSearch`.

Test: new, because distinct contract (calls each tool's `execute` directly with in-memory deps; the loader is a plain function argument, not a module mock).

- [ ] **Step 1: Write the failing tests**: `rankCutCandidates` literal top list with an excluded category absent; `propose_change.execute` with a valid create-plan returns `proposalId` equal to the given `toolCallId` and a `diff` with the new plan; with an unknown planId returns `{ error: "Plano não encontrado." }`; `simulate_lever` shift outside window returns `{ error }`; with `webSearch: {}` the tool keys are exactly the five planner tools.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/tools.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `tool({ description, inputSchema, execute })`; descriptions state "valores em reais".
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): ferramentas do planejador"`.

### Task 6: Context pack and system prompt

**Files:**
- Create: `src/features/planning/lib/planner/context.ts`, `src/features/planning/lib/planner/system-prompt.ts`
- Test: `src/features/planning/lib/planner/context.test.ts`

**Interfaces:**
- Produces: `type PlannerContext = { today: Period; cashFlow: { incomeBaseline: Cents; costOfLiving: Cents; plannedContribution: Cents; contributionsByMonth: { month: Period; amount: Cents }[] }; patrimony: { total: Cents; daily: Cents; maturities: { month: Period; amount: Cents }[]; locked: Cents; pots: { accountName: string; amount: Cents }[] }; reserve: { months: number; floor: Cents }; plans: { id: string; name: string; type: string; priority: number; nonNegotiable: boolean; targetMonth: Period; window: { earliest: Period; latest: Period } | null; health: PlanHealth | null }[]; projection: ProjectionSummary; latestBids: { planName: string; month: Period; winningBidPct: number }[]; assumptions: { date: string; kind: string; summary: string; source: string }[] }`; `buildPlannerContext(snapshot: PlanningSnapshot, projection: Projection): PlannerContext` (assumptions capped at 20, newest first); `buildSystemPrompt(context: PlannerContext, opts: { webSearch: boolean }): string` (PT-BR; rules: never compute figures, always use tools for numbers; propose only via `propose_change`; amounts in centavos; no specific assets; mention web search only when available; context appended as JSON).

Test: new, because `buildPlannerContext` is a distinct contract. The prompt text gets no test (copy, change detector).

- [ ] **Step 1: Write the failing test**: snapshot fixture with one maturity position, one pot, 25 assumptions → `patrimony.maturities` literal, `pots[0].accountName`, `assumptions.length 20`, plan health from the projection.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/context.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): contexto e instrucoes do planejador"`.

### Task 7: Conversation store

**Files:**
- Create: `src/features/planning/lib/planner/conversation-store.ts`
- Test: `src/features/planning/lib/planner/conversation-store.test.ts`

**Interfaces:**
- Produces: `createConversation(userId: string, title: string): Promise<string>`; `loadConversation(userId: string, conversationId: string): Promise<{ id: string; title: string; messages: UIMessage[] } | null>` (null when not owned); `fetchLatestConversation(userId: string): Promise<{ id: string; title: string; messages: UIMessage[] } | null>`; `saveMessages(userId: string, conversationId: string, messages: UIMessage[]): Promise<void>` (upsert by message id, `onConflictDoUpdate` on `parts`; touches `updatedAt`).

Test: new, because distinct contract (db mocked as in `src/features/trips/queries.test.ts`).

- [ ] **Step 1: Write the failing tests**: `loadConversation` where renders `user_id` and `id` params and returns null when the conversation select is empty (messages not queried); `saveMessages` issues one insert with two rows and `onConflictDoUpdate`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/conversation-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): persistencia das conversas do planejador"`.

### Task 8: Drift diagnosis prefill

**Files:**
- Create: `src/features/planning/lib/planner/drift-diagnosis.ts`
- Test: `src/features/planning/lib/planner/drift-diagnosis.test.ts`

**Interfaces:**
- Consumes: `driftMessages` (page), `DriftSignal`.
- Produces: `buildDriftDiagnosis(signals: DriftSignal[], planNames: Record<string, string>, month: Period): string` (PT-BR: one opening line with the month, the `driftMessages` bullets, closing question asking which lever to explore; empty string when no signal).

Test: new, because distinct contract (assert it contains each plan name and the month label, and is empty for no signals; no full-text snapshot).

- [ ] **Step 1: Write the failing test**.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/drift-diagnosis.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): diagnostico de desvio para o planejador"`.

### Task 9: Streaming core

**Files:**
- Create: `src/features/planning/lib/planner/stream.ts`
- Test: `src/features/planning/lib/planner/stream.test.ts`

**Interfaces:**
- Produces: `PLANNER_MAX_STEPS = 8`; `createPlannerResponse(args: { model: LanguageModel; system: string; history: UIMessage[]; tools: ToolSet; onFinish: (messages: UIMessage[]) => Promise<void> }): Promise<Response>`: `validateUIMessages({ messages: history, tools })`, `streamText({ model, system, messages: await convertToModelMessages(validated), tools, stopWhen: stepCountIs(PLANNER_MAX_STEPS) })`, `result.consumeStream()` (no await, so `onFinish` runs after a client disconnect), `result.toUIMessageStreamResponse({ originalMessages: validated, generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }), onFinish: ({ messages }) => args.onFinish(messages), onError: () => "Algo deu errado." })`.

Test: new, because distinct contract; the model is `MockLanguageModelV3` (external boundary fake from `ai/test`).

- [ ] **Step 1: Write the failing tests**: mock streaming `"Olá"` in two deltas; read the response body to the end; `onFinish` receives two messages, the second `role "assistant"` with a text part `"Olá"`. Second test: cancel the body reader after the first chunk; `onFinish` still resolves (await a promise resolved by the callback).
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/lib/planner/stream.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): streaming das respostas do planejador"`.

### Task 10: Chat route

**Files:**
- Create: `src/app/api/planning/chat/route.ts`
- Test: `src/app/api/planning/chat/route.test.ts`

**Interfaces:**
- Consumes: `getOptionalUserSession`, `loadConversation`, `saveMessages`, `resolveLanguageModel`, `resolveWebSearchTools`, `fetchPlanningSnapshot`, `runProjection`, `buildPlannerContext`, `buildSystemPrompt`, `buildPlannerTools`, `fetchCategoryTotals`, `getAdminPayerId`, `createPlannerResponse`.
- Produces: `export const maxDuration = 60`; `POST(request: Request): Promise<Response>` with body `{ conversationId: uuid, message: UIMessage, modelId: string }` (Zod for the envelope; the message is validated by `validateUIMessages` in Task 9). Order: session (401 `{ error: "Não autenticado" }`) → body (400) → conversation (404 `{ error: "Conversa não encontrada" }`) → model (400 with the resolver's message) → snapshot, projection, tools → `createPlannerResponse` with `history = [...stored, message]` and `onFinish = (m) => saveMessages(userId, conversationId, m)`. Errors: `console.error` and 500 `{ error: "Algo deu errado" }`.

Test: new, because distinct actor (HTTP boundary). Auth and db mocked as the repo does (`vi.mock("@/shared/lib/auth/server")`, `vi.mock("@/shared/lib/db")`).

- [ ] **Step 1: Write the failing tests**: no session → 401 and no db call; session with a conversation select returning `[]` → 404 and no insert.
- [ ] **Step 2: Run** `pnpm exec vitest run src/app/api/planning/chat/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): rota de chat do planejador"`.

### Task 11: Apply proposal and start conversation actions

**Files:**
- Create: `src/features/planning/actions/planner.ts`
- Modify: `src/features/planning/actions.ts` (barrel)
- Test: `src/features/planning/actions/planner.test.ts`

**Interfaces:**
- Consumes: `proposalSchema`, `writes.ts` helpers (`insertPlan`, `updatePlan`, `insertPlanEvent`, `upsertSettings`, `insertAssumption`, `assertOwnedPlan`), `createConversation`.
- Produces: `applyProposalAction(input: { proposalId: string; proposal: Proposal }): Promise<ActionResult>`: validate; if `assumptionLog` has `(userId, proposalId)` → `{ success: false, error: "Proposta já aplicada." }`; one `db.transaction` applying each change in order (update-plan merges the stored plan with the patch and validates with `planInputSchema`), then `insertAssumption({ kind: "plan-change", summary: proposal.title, source: "planner", proposalId })` plus one entry per `record-assumption` change; `revalidateForEntity("planning", userId)`; message `"Proposta aplicada."`. `startPlannerConversationAction(input: { title?: string }): Promise<ActionResult<{ conversationId: string }>>` (default title `"Conversa de <dd/mm/aaaa>"`).

Test: new, because distinct actor (approved writes).

- [ ] **Step 1: Write the failing tests**: second apply with the same `proposalId` → `"Proposta já aplicada."` and no transaction; update-plan on a foreign plan → `"Registro não encontrado."` and the transaction rolls back (no assumption insert); a create-plan + record-assumption proposal → plan insert, event inserts, two assumption inserts with `source "planner"`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/planning/actions/planner.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): aplicacao de propostas do planejador"`.

### Task 12: Planner panel (chat UI)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (`pnpm add @ai-sdk/react@^3`; confirm on npmjs.com it is the official Vercel package and its peer `react` range includes 19.2)
- Create: `src/features/planning/components/planner/planner-panel.tsx`, `message-bubble.tsx`, `composer.tsx`, `tool-activity.tsx`
- Modify: `src/app/(dashboard)/planning/page.tsx` (load `fetchLatestConversation(userId)`), `planning-page.tsx` (replace `PlannerPlaceholder`)
- Delete: `src/features/planning/components/planner-placeholder.tsx`

**Interfaces:**
- Produces: `PlannerPanel(props: { conversation: { id: string; messages: UIMessage[] } | null; modelId: string; prefill: string | null; onPrefillConsumed(): void; renderProposal(part: ProposalToolOutput, toolCallId: string): ReactNode })`; `useChat({ id, messages, transport: new DefaultChatTransport({ api: "/api/planning/chat", prepareSendMessagesRequest: ({ id, messages }) => ({ body: { conversationId: id, message: messages.at(-1), modelId } }) }) })`. Without a conversation, the first send calls `startPlannerConversationAction`, then `router.refresh()` and sends. Header: title `"Planejador"`, model `Select` over `AVAILABLE_MODELS` (default `settings.plannerModelId ?? DEFAULT_MODEL`; change saves via `savePlanningSettingsAction`), button `"Nova conversa"`. Parts: `text` → bubble; `tool-propose_change` in `output-available` → `renderProposal`; other `tool-*` → `ToolActivity` chip (`"Consultando projeção…"` etc.); `source-url` → link list. Notice under the composer: `"Os dados financeiros desta página são enviados ao provedor do modelo selecionado."` Composer: `Textarea` + `"Enviar"`, disabled while `status === "streaming"`, `"Parar"` calls `stop`.

Test: none, because UI wiring (the server contract is locked by Tasks 9 and 10).

- [ ] **Step 1:** Add the dependency; `git diff package.json` shows only `@ai-sdk/react`.
- [ ] **Step 2:** Implement the components and wire the page.
- [ ] **Step 3: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 4: Manual check** with a configured provider: send a question, see streaming text and a tool chip; reload and see the thread persisted.
- [ ] **Step 5: Commit**; `git commit -m "feat(planning): chat do planejador acoplado a pagina"`.

### Task 13: Proposal card with preview and apply

**Files:**
- Create: `src/features/planning/components/planner/proposal-card.tsx`
- Modify: `src/features/planning/components/planning-page.tsx` (state `preview: { proposalId: string; changes: ProposalChange[] } | null`; `projection = runProjection(applyStress(preview ? applyChangesToInput(input, preview.changes) : input, activeStress))`; `LiquidityChart previewLabel="Prévia"` while previewing; plans table shows new plans with a `"Novo"` tag)

**Interfaces:**
- Consumes: `ProposalToolOutput = { proposalId: string; proposal: Proposal; before: ProjectionSummary; after: ProjectionSummary; diff: ProposalDiff } | { error: string }` (Task 5), `applyProposalAction`, `snapshot.assumptions` (applied ids = `proposalId` values).
- Produces: `ProposalCard({ output, applied: boolean, previewing: boolean, onPreview(), onDiscard() })`: title, rationale, list of changes in PT-BR, before/after rows (status per plan, first unfunded month, min slack delta) formatted from the deterministic `diff`; buttons `"Pré-visualizar"` / `"Sair da prévia"`, `"Aplicar"` (disabled when applied or pending, label `"Aplicada"` after), `"Descartar"`. `{ error }` outputs render a muted line `"Proposta inválida: <erro>"` with no buttons.

Test: none, because the preview math is locked by Task 3 and apply by Task 11.

- [ ] **Step 1:** Implement the card and the preview state.
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Manual check**: ask for a new goal; preview changes chart and table; "Aplicar" toasts `"Proposta aplicada."`, the plan appears after refresh, the log shows a `"Planejador"` entry; clicking again is disabled.
- [ ] **Step 4: Commit**; `git commit -m "feat(planning): cartao de proposta com previa e aplicacao"`.

### Task 14: Drift button prefill

**Files:**
- Modify: `src/features/planning/components/drift-banner.tsx` (button `"Discutir com o planejador"`), `planning-page.tsx` (state `prefill` set from `buildDriftDiagnosis`, passed to `PlannerPanel`)

Test: none, because the diagnosis text is locked by Task 8; this is wiring.

- [ ] **Step 1:** Implement; the composer receives the text and focuses, nothing is sent automatically.
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Commit**; `git commit -m "feat(planning): desvio abre conversa com diagnostico"`.

### Task 15: Version and closing checks

**Files:**
- Modify: `CHANGELOG.md`, `package.json` (version), `README.md` (badge; "Planejamento" line mentions the planner and that data goes to the chosen provider)

Test: none, because no behaviour change in tested code.

- [ ] **Step 1:** Next minor version; changelog entry with the introductory paragraph and `### Adicionado` / `### Alterado` (insights import move).
- [ ] **Step 2: Run** `pnpm exec tsc --noEmit`. Expected: exit 0.
- [ ] **Step 3: Run** `pnpm exec biome check --formatter-enabled=false src/features/planning src/shared/lib/ai src/features/insights src/app/api/planning "src/app/(dashboard)/planning"`. Expected: clean.
- [ ] **Step 4: Run** the full suite once: `pnpm exec vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** the three files; `git commit -m "chore: versao X.Y.0 com planejador financeiro"`. Do not tag (AGENTS.md rule 6).
