## Why

Com viagens vinculadas (change `add-trips`), dá para ver o total de uma viagem, mas os relatórios
continuam misturando gasto de viagem com gasto do dia a dia. Duas perguntas ficam sem resposta: como
uma viagem evolui por categoria ao longo das faturas, e qual é o gasto mensal "normal" sem as
viagens distorcendo a média.

## What Changes

- Seletor **"Viagem"** em Relatórios › Tendências por categoria e Relatórios › Estabelecimentos, com
  três modos:
  - **Todos os lançamentos** (padrão, comportamento atual);
  - **Sem viagens**: exclui lançamentos com `viagem_id`;
  - **Viagem X**: só lançamentos vinculados a X.
- Estado no URL (`viagem=<id>` ou `viagem=sem`), preservado junto com os filtros existentes.
- Em Tendências, escolher uma viagem ajusta De/Até para cobrir os períodos de todos os lançamentos
  dela (ex.: passagem em 10x). O usuário pode alterar o intervalo depois.
- Em Estabelecimentos, escolher uma viagem ignora a janela de "últimos N meses" e mostra a viagem
  inteira; "Sem viagens" mantém a janela.
- Fora do escopo: Uso de cartões (mês único, com limite e status de fatura) e Análise de parcelas.

## Capabilities

### New Capabilities

- `trip-report-filter`: recorte por viagem nos relatórios de período.

### Modified Capabilities

<!-- Nenhuma. -->

## Impact

- `src/features/reports/lib/category-trends-queries.ts` e `category-report-queries.ts`: predicado de viagem.
- `src/features/reports/establishments/queries.ts`: predicado de viagem e janela ignorada.
- `src/features/reports/components/category-report-filters.tsx`: seletor.
- `src/app/(dashboard)/reports/category-trends/` e `establishments/`: ler `viagem` do URL.
- `src/shared/lib/trips/` (novo): predicado e lista de viagens para o seletor (contrato entre
  `reports` e `trips`; features não se importam).
- Depende de `add-trips` aplicada.
