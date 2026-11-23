## Why

The planning page shows numbers but not the conversation the user actually plans with. The spec
asks for an LLM planning partner over the whole plan set that reads app data, researches external
context, simulates levers and proposes typed changes the user approves, without ever producing a
figure itself.

## What Changes

- Docked chat in the left 2/5 of `/planning` (replaces the placeholder), streaming with AI SDK v6
  (`streamText` + `useChat` from `@ai-sdk/react`, new dependency), persisted per conversation.
- Provider reuse: `resolveInsightsModel` and the model catalogue move to `src/shared/lib/ai/`
  (features must not import features); insights keeps working through re-exports.
- Tools: read-only category totals and cut candidates; projection with hypothetical changes;
  lever simulation; web search when the provider supports it (Anthropic, OpenAI, Google), silently
  absent otherwise; `propose_change` returning a Zod-typed proposal with deterministic before/after.
- Proposal cards in the thread; "Pré-visualizar" previews the change on the chart and table;
  "Aplicar" applies it in one transaction via a server action and records it in the assumption
  log (idempotent by proposal id); "Descartar" hides it.
- Drift banner gets "Discutir com o planejador", prefilling the composer with the diagnosis.
- UI notice that financial data is sent to the selected provider.

## Capabilities

### New Capabilities

- `planning-planner`: LLM planning partner with tools and approved proposals.

### Modified Capabilities

<!-- None at spec level. Insights changes only import paths. -->

## Impact

- New: `src/shared/lib/ai/{models,model-provider,web-search}.ts`,
  `src/features/planning/lib/planner/*`, `src/features/planning/actions/planner.ts`,
  `src/app/api/planning/chat/route.ts`, `src/features/planning/components/planner/*`.
- Modified: `src/features/insights/constants.ts` (re-exports), `src/features/insights/actions/generate.ts`
  (import path); `src/features/planning/components/{planning-page,drift-banner}.tsx`.
- Removed: `src/features/insights/lib/model-provider.ts` (moved), `planner-placeholder.tsx`.
- Dependency: `@ai-sdk/react` 3.x (official AI SDK package; peer `react ^19.2.1` satisfied).
- `CHANGELOG.md`, `package.json`, README badge and features list: next minor version.
- Depends on the three previous planning changes.
