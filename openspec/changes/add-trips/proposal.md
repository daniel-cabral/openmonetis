## Why

Não há como responder "quanto gastei na viagem X". Os gastos de uma viagem se espalham por cartões
e contas, e a compra no cartão cai na fatura do mês seguinte, então nenhum recorte por período
(`YYYY-MM`) isola a viagem. Um intervalo de datas sozinho também não serve: durante a viagem
continuam correndo aluguel, assinaturas e contas fixas, que não são gasto da viagem.

## What Changes

- Nova entidade **viagem**: nome, data de início, data de fim, anotação opcional.
- `lancamentos` ganha `viagem_id` nullable: um lançamento pertence a no máximo uma viagem.
- **Vínculo híbrido**:
  - no diálogo de lançamento, o campo "Viagem" vem pré-preenchido com a viagem cujo intervalo
    contém a `data_compra`; o usuário pode limpar ou escolher outra viagem (ex.: passagem comprada
    meses antes);
  - na página da viagem, lançamentos do intervalo ainda sem viagem aparecem como **sugestões**,
    vinculáveis em lote; lançamentos vinculados podem ser desvinculados.
- Vínculo em lançamento parcelado ou recorrente vale para a **série inteira** (`series_id`).
- Rota `/trips` (lista) e `/trips/[id]` (detalhe, layout "tudo visível": cards de total, grade com
  quebras por categoria, cartão/conta e pessoa, sugestões e lista de lançamentos).
- Total da viagem = **custo líquido do usuário**: despesas da pessoa admin menos receitas vinculadas
  (reembolsos). Transferências ficam fora. Conta pago e não pago.
- Item "Viagens" na sidebar.

## Capabilities

### New Capabilities

- `trips`: cadastro de viagens, vínculo de lançamentos e recorte de gastos por viagem.

### Modified Capabilities

<!-- Nenhuma. -->

## Impact

- `src/db/schema.ts`: tabela `viagens`, coluna `lancamentos.viagem_id` + índice, migração Drizzle.
- `src/features/trips/` (nova): `queries.ts`, `actions.ts`, `components/`, `lib/`.
- `src/app/(dashboard)/trips/` e `trips/[tripId]/`: rotas finas.
- `src/features/transactions/components/dialogs/transaction-dialog/`: campo "Viagem".
- `src/features/transactions/actions/`: gravar `viagem_id`, propagar para a série.
- `src/shared/lib/actions/helpers.ts`: entidade `trips` em `revalidateForEntity`.
- `src/shared/components/navigation/`: item na sidebar.
- `CHANGELOG.md`, `package.json`, badge do `README.md`: versão minor.
