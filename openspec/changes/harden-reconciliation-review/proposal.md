## Why

Nas duas últimas conciliações (setembro/outubro e outubro/novembro de 2026) o saldo do app terminou
diferente do banco, e cada erro nasceu na virada do mês: o extrato cobre uma janela (ex.: 12/10 a
11/11), mas o casador busca candidatos pelo mês inteiro e casa, por nome e período, lançamentos
cujo débito real foi anterior ao arquivo. A revisão não avisa, o "Fecha" só confere o arquivo
contra ele mesmo, e um casamento errado gravado por fingerprint só se desfaz por SQL no servidor.

O usuário concilia entre os dias 11 e 16, uma ou duas vezes por mês para o extrato e uma vez para a
fatura fechada. Ele quer aplicar e confiar no resultado, decidindo ele mesmo os casos duvidosos.

## What Changes

- Casamento suspeito ganha aviso com o motivo (lançamento anterior ao início do arquivo, ou valor
  diferente) e o usuário decide: manter, criar novo ou vincular a outro.
- Toda linha casada, inclusive por fingerprint e com valor divergente, pode ser desfeita na revisão.
- A revisão mostra o saldo previsto do app após aplicar contra o saldo final do extrato (e o total
  previsto da fatura contra o total informado), antes do Aplicar.
- "Só no banco" ganha "Marcar todas como Criar".
- O extrato da conta indica lançamentos pagos que não estão conciliados com o banco.
- Ambíguas com "Criar" ganham categoria e subcategoria; linhas criadas com categoria escolhida
  passam a alimentar a memória de categoria e subcategoria.

## Capabilities

### New Capabilities

<!-- Nenhuma. -->

### Modified Capabilities

- `statement-reconciliation`: aviso de casamento suspeito, desfazer casamento na revisão, saldo
  previsto, criação em lote, indicador de não conciliado e aprendizado a partir de criações.
- `subcategories`: subcategoria também em ambíguas criadas na conciliação.

## Impact

- `src/shared/lib/reconciliation/matcher.ts`, `closure.ts`: motivo de suspeita por linha casada.
- `src/features/transactions/components/reconciliation/*`, `lib/reconciliation-review.ts`,
  `lib/reconciliation-plan.ts`, `actions/reconciliation-action.ts`: decisões novas por linha
  casada, saldo previsto, lote, aprendizado.
- `src/features/accounts/`: indicador na tela de extrato da conta.
- Sem migração de banco prevista.

Design completo e decisões: `openspec/changes/harden-reconciliation-review/design.md`.
