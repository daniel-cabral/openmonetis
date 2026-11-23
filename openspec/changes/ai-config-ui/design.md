## Context

Today `resolveLanguageModel(modelId)` (`src/shared/lib/ai/model-provider.ts`) builds providers from
global env vars; Insights (`generateObject` in `src/features/insights/actions/generate.ts`) and the
Planner (`streamText` in `src/features/planning/lib/planner/stream.ts`, called from
`src/app/api/planning/chat/route.ts`) call it. Accepted decision: credentials move to the UI, per
user, env keys stop being read, and a ChatGPT subscription connects through the Codex device-code
flow ported from `D:\Repos\Avvale\avvale-agent-cockpit\src\lib\llm\{codex-oauth,codex-provider,credentials,token-cipher,stream-to-generate}.ts`.

Version gap: the cockpit runs `ai@7` / `@ai-sdk/openai@4` (middleware `specificationVersion: "v4"`);
this repo runs `ai@6` / `@ai-sdk/openai@3` (middleware `"v3"`, as in `web-search.ts`). The port
is a rewrite against v3 types, not a copy.

## Goals / Non-Goals

**Goals:** per-user credentials for 7 providers; ChatGPT subscription usable by both Planner and
Insights; selectors limited to connected providers; no secret ever reaches the client.

**Non-Goals:** Antigravity (deferred); admin/global keys; key validation against the provider on save (a wrong key fails at
first use with a generic error).

## Decisions

### D1. Storage: two tables, secrets as base64 text
`aiCredentials` (`ia_credenciais`): `id uuid`, `userId` (FK `user.id`, cascade), `provider`
(`chatgpt | openai | anthropic | google | minimax | openrouter | ollama`, check constraint),
`status` (`connected | needs_reconnect | invalid_secret`), `encryptedSecret text` (base64 of iv|tag|ciphertext),
`secretMask text` (null for ChatGPT and keyless Ollama), `baseUrl text` (Ollama only),
`accountId`, `accountEmail`, `planType`, `accessExpiresAt` (ChatGPT only), `createdAt`,
`updatedAt`, `refreshedAt`; unique `(userId, provider)`.
`aiPendingConnections` (`ia_conexoes_pendentes`): `userId` PK (FK cascade), `deviceAuthId`,
`userCode`, `verificationUrl`, `pollIntervalSeconds`, `expiresAt` (now + 15 min, cockpit
`PENDING_CONNECTION_TTL_MS`).
drizzle-orm 0.45 `pg-core` has no `bytea` column, hence base64 `text`. Encrypted payload is JSON:
`{ apiKey }` for key providers, `{ apiKey? }` for Ollama, `{ accessToken, refreshToken }` for
ChatGPT. Account deletion cascades.

### D2. Encryption key derived from BETTER_AUTH_SECRET
`hkdfSync("sha256", BETTER_AUTH_SECRET, salt "openmonetis", info "openmonetis:ai-credentials:v1", 32)`,
AES-256-GCM, 12-byte IV, 16-byte tag (cockpit `token-cipher.ts` layout). No new env var.
Consequence: rotating `BETTER_AUTH_SECRET` makes every stored credential undecryptable; a decrypt
failure marks the row `invalid_secret` (error `AiCredentialInvalidError`), shown as "Credencial
inválida" with the action "Cadastre de novo" (ChatGPT: the same badge, re-entered through "Entrar
com ChatGPT"). `needs_reconnect` is reserved for a ChatGPT session the server refused (refresh
400/401 or inference 401), shown as "Sessão expirada". Documented in README.

### D3. Mask stored at save time
`maskApiKey(key)`: the prefix up to and including the last `-` within the first 7 chars, then `…`,
then the last 4 chars (`sk-proj-abc…a3F9` -> `sk-…a3F9`; `AIzaSy…x2Kd` -> `AIza…x2Kd` uses the
first 4 when there is no `-`). Keys shorter than 12 chars mask as `…` + last 2. The settings page
reads only `secretMask` and `baseUrl`; nothing decrypts for display.

### D4. ChatGPT subscription (port of the cockpit)
- Device flow: `POST {issuer}/api/accounts/deviceauth/usercode` with `client_id
  app_EMoamEEZ73f0CkXaXp7hrann`; poll `POST {issuer}/api/accounts/deviceauth/token` (403/404 =
  pending, 200 = `authorization_code` + `code_verifier`); exchange at `POST {issuer}/oauth/token`
  (`grant_type=authorization_code`, `redirect_uri={issuer}/deviceauth/callback`). Issuer
  `https://auth.openai.com`, verification URL `{issuer}/codex/device`, min poll interval 3 s.
  Constants in code, no env vars.
- Claims: `chatgpt_account_id` from `https://api.openai.com/auth`, email from
  `https://api.openai.com/profile`, `exp`; `chatgpt_plan_type` from the auth claim when present
  (feeds the "Plano Plus" badge; hidden when absent).
- Polling is client-driven: the panel calls `pollChatGptConnectionAction` every
  `pollIntervalSeconds`; the server keeps `deviceAuthId` (never sent to the client).
- Access token: read row; if `accessExpiresAt - now >= 24h` use it; else refresh inside a
  transaction with `SELECT ... FOR UPDATE` on `(userId, provider='chatgpt')`, re-check freshness
  after the lock (another request may have refreshed), persist the **rotated** refresh token.
  Refresh 400/401 -> `needs_reconnect`; 429/5xx -> temporary error, row untouched. No in-memory
  cache (cockpit's module cache is single-tenant; one indexed read per request is enough).
- Inference: `createOpenAI({ apiKey: "chatgpt-subscription", baseURL:
  "https://chatgpt.com/backend-api/codex", fetch })` + `.responses(modelId)`; the custom fetch sets
  `authorization: Bearer`, `chatgpt-account-id`, `originator: openmonetis`; middleware forces
  `providerOptions.openai.store = false`. A 401 response (`token_expired` or any 401) marks the row
  `needs_reconnect` and throws `AiReconnectRequiredError`.
- Streaming only: a ported `streamToGenerateMiddleware` (v3) implements `wrapGenerate` via
  `doStream`, so `generateObject` (Insights) and `streamText` (Planner) both hit the backend in
  streaming mode.
- Model ids: `chatgpt:<slug>`. The list shown in selectors is fetched, not hard-coded:
  `listChatGptModels(userId)` (server only) does `GET {CHATGPT_API_BASE}/models?client_version=0.0.0`
  with the user's access token (same headers as inference), maps `models[].slug`/`display_name` to
  `{ id: "chatgpt:" + slug, name }`, aborts after 3 s, caches the result per user in memory for
  5 min (success only), and on any failure (timeout, non-2xx, bad body, missing credential) returns
  the static `CHATGPT_FALLBACK_MODELS` (`chatgpt:gpt-5.5` "GPT-5.5", `chatgpt:gpt-5.4` "GPT-5.4")
  without caching it. Resolution of `chatgpt:<slug>` does not validate the slug against the list.
  No web search for `chatgpt:` models (`resolveWebSearchTools`
  returns `{}`, already the case for unknown ids).

### D5. Model resolution per user
`resolveLanguageModel(userId, modelId): Promise<ResolveLanguageModelResult>` reads the user's
credential for the model's provider and builds the provider with explicit settings
(`createOpenAI`, `createAnthropic`, `createGoogleGenerativeAI`, `createMinimax` from
`vercel-minimax-ai-provider`, `createOpenRouter`, `createOpenAICompatible` for Ollama with the
stored `baseUrl` and `apiKey ?? "ollama"`). No `process.env` read. Missing credential:
`"Provedor não configurado. Configure em Ajustes > IA."`; `needs_reconnect`:
`"Conexão expirada. Reconecte em Ajustes > IA."`. Both callers already return `error` to the UI.
Display names: `PROVIDERS.openai.name` stays "OpenAI" in the model data and the UI labels it
"OpenAI (API)" (provider list, selector groups, Insights cards) next to "ChatGPT (assinatura)".
Fixed message for `invalid_secret`: `"Credencial inválida. Cadastre de novo em Ajustes > IA."`

### D6. Selectors
Pure `buildModelGroups(connected: AiProviderId[], chatgptModels: ChatGptModel[])` in `src/shared/lib/ai/model-groups.ts` returns
`{ provider, label, models }[]`: "ChatGPT (assinatura)" first when connected, then catalogue order;
OpenRouter/Ollama keep their custom-model input. Pages fetch `fetchConnectedAiProviders(userId)`
(status `connected` only) and, when ChatGPT is connected, `listChatGptModels(userId)` server-side
and pass both down. A saved model whose provider is no longer
connected falls back to the first available model in the selector. Empty list -> empty state with
link `/settings?tab=ia`.

### D7. Settings tab
New `TabsTrigger value="ia"` "IA" after "Companion"; the page reads `searchParams.tab` (Promise in
Next 16) to pick `defaultValue`, so `/settings?tab=ia` deep-links. Layout and copy follow
`src/app/preview/ia/page.tsx` option C (see spec "UI decisions").

### D8. Server actions
`src/features/settings/actions/ai.ts` ("use server"): every action starts with `getUserId()`,
validates with Zod, filters by `userId`, returns `{ success, error? , data? }` with generic errors
(`"Algo deu errado"`) and `console.error` details, and calls `revalidatePath("/settings")`,
`"/insights"`, `"/planning"` after mutations. Responses carry only `secretMask`, `baseUrl`,
`status`, `accountEmail`, `planType`, `userCode`, `verificationUrl`, `pollIntervalSeconds`,
`expiresAt`.

### D9. Prompt polish (Planner and Insights)
- Proposal simulation: `applyChangesToInput` receives the stored `plannedContribution` and, for
  `update-settings`, adds `patch.plannedContribution - stored` to `EngineInput.extraMonthlySaving`
  (already consumed by `project.ts`), so a contribution change moves the projection.
- `buildSystemPrompt` gets a glossary, rules and a web-search policy (tests are string assertions);
  user-entered strings in the context JSON are length-capped and the JSON is wrapped in explicit
  untrusted-data delimiters with the instruction to never follow instructions found inside.
- Context adds `indexForecastPct`, positions `asOf` per account and `stale` (> 45 days since the
  account's `lastAsOf`).
- Insights: `month` and `generatedAt` are set by the server (model schema has `categories` only);
  the aggregate gets a planning summary read straight from the planning tables (features do not
  import other features, so no planning engine call); the system prompt owns category rules and
  the user prompt only carries data and user instructions.

## Risks / Trade-offs

- **Codex backend is not a published OpenAI API** and can change or block third-party originators.
  Mitigation: isolated in `src/shared/lib/ai/chatgpt/`; errors are generic; API-key providers keep
  working.
- **Insights uses `generateObject`** (non-streaming, structured output via `text.format`
  json_schema). The middleware solves streaming, but whether the Codex backend honours
  `text.format` is unverified. Fallback if the smoke test (Task 15) fails: for `chatgpt:` models,
  Insights switches to `generateText` with the JSON schema in the prompt and
  `InsightsResponseSchema.parse` on the output.
- **System prompt handling:** the cockpit fixture shows `instructions` populated; `@ai-sdk/openai@3`
  may send the system prompt as an input message instead. If the backend rejects it, the ChatGPT
  middleware moves system content into `providerOptions.openai.instructions` (supported by
  `@ai-sdk/openai@3`). Verified in Task 15.
- **Planner tool calls** over the Codex backend (multi-step `streamText` with tools) are unverified;
  same smoke test.
- **Ollama SSRF:** a user-supplied base URL makes the server issue requests to arbitrary hosts,
  including the internal network. Mitigation: `z.url()` with `http:`/`https:` only. Blocking
  private ranges would break the main Ollama use case (LAN/localhost); accepted for a self-hosted
  app, documented.
- **Breaking change for self-hosters:** env keys silently stop working. Mitigation: README
  "Atualizando para 2.18" note and CHANGELOG entry under "Removido".
- **Secret rotation** wipes access to stored credentials (D2).
- **Account-level ToS** risk of using a ChatGPT subscription outside official clients: user's
  choice, shown nowhere else; mention in README.

## Migration Plan

`pnpm run db:generate` -> `drizzle/0040_*.sql` committed; applied by `pnpm run db:migrate` on
deploy. Rollback: drop both tables; env-based resolution would need the 2.17 code.

## Open Questions

- Keep the static ChatGPT model list or fetch `/models`? Decided: fetch, with static fallback (D4).
- Should Ollama keep a default base URL prefilled (`http://localhost:11434/v1`) as placeholder only?
  Chosen: placeholder only.
