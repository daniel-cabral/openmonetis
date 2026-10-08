## Context

Os relatórios agregam por `periodo` (`YYYY-MM`). Tendências usa intervalo De/Até; Estabelecimentos
usa "últimos N meses" a partir do mês corrente. A viagem é um conjunto de lançamentos via
`lancamentos.viagem_id` (change `add-trips`).

## Decisions

### D1: Um predicado compartilhado

`src/shared/lib/trips/` expõe `tripFilterCondition(filter)` que devolve a condição Drizzle:
`all` → nenhuma; `none` → `viagem_id is null`; `{ tripId }` → `viagem_id = tripId`. Vive em
`shared/` porque `reports` não pode importar `trips`. A lista de viagens do seletor também sai de lá
(query simples por `userId`).

### D2: Parsing do URL

`viagem` ausente ou inválido → `all`. `viagem=sem` → `none`. UUID de viagem que não pertence ao
usuário → tratado como `all` (sem vazar existência). Sempre filtrado por `userId`.

### D3: Ajuste de intervalo em Tendências

Ao escolher uma viagem no seletor, o cliente navega com `viagem=<id>` e De/Até = menor e maior
`periodo` entre os lançamentos da viagem (todas as pessoas, não só o admin). Se o usuário depois mudar
De/Até, o URL manda. Viagem sem lançamentos mantém o intervalo atual. "Limpar" também volta a viagem
para "Todos os lançamentos".

### D4: Janela em Estabelecimentos

Com viagem específica, a query não aplica `gte/lte` de período; o rótulo de período vira
"Viagem: <nome>". Com `none` ou `all`, a janela de N meses continua.

### D5: Exclusões inalteradas

Os relatórios já excluem transferências e `AUTO_FATURA:%`; o predicado só se soma a elas.

## Testing

Integração das queries: os três modos em Tendências e Estabelecimentos com um conjunto que tem
lançamentos com e sem viagem; viagem de outro usuário no URL tratada como `all`; ajuste de intervalo
cobrindo parcela em período posterior.
