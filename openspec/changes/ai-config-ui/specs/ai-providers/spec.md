## ADDED Requirements

### Requirement: Per-user provider credentials
Each user SHALL configure their own AI providers in Ajustes > IA: OpenAI, Anthropic, Google Gemini,
MiniMax and OpenRouter by API key, and Ollama by base URL with an optional key. Credentials SHALL be
scoped by `userId` in every read and write and SHALL be deleted with the account.

#### Scenario: Save an API key
- **WHEN** the user saves an Anthropic key `sk-ant-api03-...q8Lw`
- **THEN** the panel shows status "Conectado" and the mask `sk-ant-…q8Lw` with "Alterar" and "Remover"

#### Scenario: Remove a key
- **WHEN** the user clicks "Remover" on a connected provider
- **THEN** the credential is deleted and the status becomes "Não configurado"

#### Scenario: Invalid Ollama URL
- **WHEN** the user saves Ollama with base URL `ftp://host` or `not a url`
- **THEN** nothing is saved and the form shows "Informe uma URL http(s) válida."

### Requirement: Secrets never leave the server
Stored secrets SHALL be encrypted with AES-256-GCM using a key derived from `BETTER_AUTH_SECRET` via
HKDF. No server action, page or API response SHALL return a decrypted key or token; the client
receives only the mask, Ollama's base URL, status and ChatGPT account e-mail and plan.

#### Scenario: Secret rotated
- **WHEN** `BETTER_AUTH_SECRET` changed after a credential was saved and the user runs Insights with it
- **THEN** the credential is marked invalid, the user sees "Credencial inválida. Cadastre de novo em Ajustes > IA." and the IA tab shows the provider as "Credencial inválida" with the action "Cadastre de novo"

#### Scenario: Invalid credential is not an expired session
- **WHEN** a ChatGPT credential fails to decrypt, and separately another ChatGPT credential is refused by the backend with 401
- **THEN** the first shows "Credencial inválida" and the second shows "Sessão expirada"; the two statuses are never shown interchangeably

### Requirement: ChatGPT subscription connection
The user SHALL connect a ChatGPT subscription through the device-code flow: the panel shows the user
code with "Copiar", the link `https://auth.openai.com/codex/device`, "aguardando confirmação..." and
"Cancelar"; after approval it shows the account e-mail, the plan badge when known, and
"Desconectar". A pending code SHALL expire after 15 minutes.

#### Scenario: Approve
- **WHEN** the user approves the code on the OpenAI page
- **THEN** the next poll stores the tokens and the panel shows "Conectado" with the account e-mail

#### Scenario: Code expires
- **WHEN** 15 minutes pass without approval
- **THEN** the pending connection is discarded and the panel returns to "Entrar com ChatGPT"

### Requirement: ChatGPT session lifecycle
Access tokens SHALL be refreshed when less than 24 hours from expiry, at most once concurrently per
user (row lock), persisting the rotated refresh token. A refused refresh or a 401 from the inference
backend SHALL mark the connection expired; the IA tab SHALL show "Sessão expirada" and "Sessão
expirada, reconecte." with "Entrar com ChatGPT".

#### Scenario: Concurrent refresh
- **WHEN** two requests of the same user need a refresh at the same time
- **THEN** the token endpoint is called once and both requests use the new access token

#### Scenario: Token rejected
- **WHEN** the backend answers 401 `token_expired` during a Planner message
- **THEN** the chat shows a generic error and the IA tab shows "Sessão expirada"

### Requirement: Model resolution uses only the user's credentials
Insights and the Planner SHALL build the model from the requesting user's stored credential.
Environment variables `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
`MINIMAX_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL` and `OLLAMA_API_KEY` SHALL NOT be read.
ChatGPT subscription models SHALL be called in streaming mode with `store: false`, for both
Planner (streamed) and Insights (structured object).

#### Scenario: Provider not configured
- **WHEN** a request names `claude-sonnet-4-6` and the user has no Anthropic credential, even with `ANTHROPIC_API_KEY` set in the server env
- **THEN** it fails with "Provedor não configurado. Configure em Ajustes > IA."

### Requirement: ChatGPT model list is fetched
The models offered for the ChatGPT subscription SHALL be fetched server-side from the Codex backend
with the user's token, with a 3 s timeout and a per-user cache of 5 minutes. When the call fails or
returns no models, the list SHALL fall back to GPT-5.5 and GPT-5.4 and the failure SHALL NOT be
cached or shown to the user.

#### Scenario: Backend lists models
- **WHEN** the backend answers with models `gpt-5.5`, `gpt-5.4-mini`
- **THEN** the selector offers exactly those two under "ChatGPT (assinatura)"

#### Scenario: Backend fails
- **WHEN** the models call times out or answers 500
- **THEN** the selector offers GPT-5.5 and GPT-5.4 and the next request calls the backend again

#### Scenario: Cached
- **WHEN** the same user opens a selector twice within 5 minutes after a successful call
- **THEN** the backend is called once

### Requirement: Selectors list only connected providers
The Insights and Planner model selectors SHALL list only models of providers whose status is
connected, with a "ChatGPT (assinatura)" group first when connected. With none connected they SHALL
show "Nenhum provedor de IA configurado." and a link to `/settings?tab=ia`. A saved model whose
provider is no longer connected SHALL be replaced in the selector by the first available model.

#### Scenario: Only ChatGPT connected
- **WHEN** only the ChatGPT subscription is connected
- **THEN** the Planner selector shows one group "ChatGPT (assinatura)" with the models returned by the Codex backend (fallback GPT-5.5 and GPT-5.4)

#### Scenario: OpenAI by API key
- **WHEN** an OpenAI API key is connected
- **THEN** its provider entry and selector group are labelled "OpenAI (API)"

#### Scenario: Nothing connected
- **WHEN** the user opens Insights with no provider connected
- **THEN** the empty state links to Ajustes > IA and analysis cannot start

## UI decisions

- **Chosen: option C, master-detail.** Reference preview `src/app/preview/ia/page.tsx` (`OptionC`,
  `ChatGptFlow`, `KeyForm`, `FilteredSelectors`); temporary, deleted before merge.
- New tab "IA" in Ajustes, right after "Companion"; deep link `/settings?tab=ia`.
- Header: "Inteligência artificial" + badge with sparkle icon; subtitle "Conecte seus provedores de
  IA para usar o planejador e os insights."
- Left column (260px on md+, full width stacked on mobile): one button per provider with logo
  (`/providers/*.svg`), name and status dot (success = conectado, muted = não configurado, info =
  aguardando, destructive = expirado ou inválido). Order: ChatGPT (assinatura), OpenAI (API), Claude AI, Gemini,
  MiniMax, OpenRouter, Ollama. ChatGPT selected by default.
- Right panel: logo, name, status badge ("Conectado" success, "Aguardando" info, "Sessão expirada"
  and "Credencial inválida" destructive, "Não configurado" outline), separator, provider form, footer note with lock icon "As
  chaves ficam criptografadas e só são usadas por você."
- ChatGPT states: not connected "Use sua assinatura do ChatGPT, sem precisar de chave de API." +
  "Entrar com ChatGPT"; pending (code in mono, "Copiar"/"Copiado", link, "aguardando
  confirmação...", "Cancelar"); connected (e-mail, plan badge, "Desconectar"); expired ("Sessão
  expirada, reconecte." + "Entrar com ChatGPT").
- API-key form: label "Chave de API", placeholder "Cole a chave de API", "Salvar"/"Cancelar"; saved
  state shows the mask in a code chip with "Alterar" and "Remover". Ollama: "URL base" field plus
  "Chave (opcional)"; saved state shows the base URL instead of a mask.
- Invalid credential (secret rotated, any provider): destructive badge "Credencial inválida", note
  "Cadastre de novo", form open to re-register the key (ChatGPT: "Entrar com ChatGPT"). "Sessão
  expirada" is used only for a ChatGPT session refused by the backend.
- Naming: API-key OpenAI is "OpenAI (API)"; the subscription is "ChatGPT (assinatura)".
- Selectors: grouped `Select` (`SelectGroup` + `SelectLabel`) in the Planner; Insights provider
  cards filtered to connected providers plus a ChatGPT (assinatura) card. Empty state: dashed box
  "Nenhum provedor de IA configurado." + link "Configurar em Ajustes > IA".
- **Discarded:** A (compact list + dialog per provider): denser, but one extra click to configure each
  provider. B (all forms on one page): everything visible, but a long page with seven forms.
