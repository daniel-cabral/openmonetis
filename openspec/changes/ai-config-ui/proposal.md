## Why

AI keys live only in server env vars (`src/shared/lib/ai/model-provider.ts`), so users cannot find
where to configure Insights and the Planner, and a self-hosted instance shares one key across all
users. The user also wants to use a ChatGPT subscription (no API key) as a provider.

## What Changes

- New settings tab "IA" (per user), master-detail layout (option C): provider list on the left with
  logo, name and status badge; the selected provider's panel on the right; stacks on mobile.
- API-key providers stored per user: OpenAI, Anthropic, Google Gemini, MiniMax, OpenRouter, and
  Ollama (base URL + optional key). Keys are encrypted at rest (AES-256-GCM, key derived from
  `BETTER_AUTH_SECRET` via HKDF) and never sent back to the client; the UI shows only a mask
  (`sk-…a3F9`) with "Alterar" and "Remover".
- "ChatGPT (assinatura)": OAuth device-code flow of the Codex CLI, ported from
  avvale-agent-cockpit; inference against `https://chatgpt.com/backend-api/codex` (streaming only,
  `store: false`), refresh-token rotation serialized with `SELECT ... FOR UPDATE`, expired
  sessions surface as "Sessão expirada". The model list is fetched from the Codex backend
  (server-side, cached briefly per user, with a static fallback of GPT-5.5 and GPT-5.4).
- A credential that no longer decrypts (rotated `BETTER_AUTH_SECRET`) shows "Credencial inválida"
  with the action "Cadastre de novo", distinct from the ChatGPT "Sessão expirada".
- Provider names: the API-key provider is shown as "OpenAI (API)", the subscription as
  "ChatGPT (assinatura)".
- **BREAKING (self-hosters):** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, `MINIMAX_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL` and
  `OLLAMA_API_KEY` are no longer read. Each user registers keys in Ajustes > IA.
- Insights and Planner model selectors list only connected providers (plus a "ChatGPT (assinatura)"
  group); with none connected they show "Nenhum provedor de IA configurado." linking to the IA tab.
- Prompt polish for Planner and Insights ships in the same version: fix the ignored
  `plannedContribution` in proposals, glossary and rules in the system prompt, richer context
  (index forecast, positions `asOf`, stale flag), web-search rules, prompt-injection hardening,
  and Insights (server-set month/generatedAt, planning summary, no rule duplication).
- Version 2.18.0.

## Capabilities

### New Capabilities

- `ai-providers`: per-user AI provider credentials, ChatGPT subscription connection, and model
  resolution/selection restricted to connected providers.

### Modified Capabilities

<!-- None at spec level: planning-planner and insights keep their requirements; only the source of
credentials and the selector contents change. -->

## Impact

- DB: new tables `ia_credenciais` and `ia_conexoes_pendentes` (migration `0040_*` via
  `pnpm run db:generate`).
- New: `src/shared/lib/ai/credentials/*`, `src/shared/lib/ai/chatgpt/*` (incl. model list fetch),
  `src/shared/lib/ai/model-groups.ts`, `src/features/settings/actions/ai.ts`,
  `src/features/settings/components/ai/*`.
- Modified: `src/shared/lib/ai/{models,model-provider}.ts` (async, per user, no env),
  `src/features/insights/actions/generate.ts`, `src/app/api/planning/chat/route.ts`,
  insights selector components, `planner-panel.tsx`, `src/app/(dashboard)/settings/page.tsx`,
  `src/app/(dashboard)/planning/page.tsx`, `src/app/(dashboard)/insights/page.tsx`.
- Removed: `src/app/preview/` (temporary preview), AI env vars from `.env.example` and README.
- Out of scope:
  - Antigravity subscription (deferred: active bans, spoofed UA, localhost redirect).
  - Explicit bid stress override (`bidPctOverride`): separate future change. Until then the prompt
    documents using `marginPp` to stress a higher consórcio bid.
  - Asset class on positions: separate future change.
- `CHANGELOG.md`, `package.json`, README badge: 2.18.0.
