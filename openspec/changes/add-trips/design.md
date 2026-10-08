## Context

Lançamentos têm `data_compra` (quando o gasto aconteceu) e `periodo` (mês da fatura ou extrato).
Compra no cartão em maio cai em `periodo = 2026-06`. Um recorte de viagem precisa ignorar o
`periodo` e olhar para o vínculo explícito.

Mockups aprovados em `.superpowers/brainstorm/` (fora do git): detalhe layout B, diálogo, lista.

## Decisions

### D1: Vínculo por coluna, não por tag N:N

`lancamentos.viagem_id uuid null references viagens(id) on delete set null`, com índice
`(user_id, viagem_id)`. Um lançamento pertence a no máximo uma viagem: soma sem dupla contagem e
filtro direto. Tags genéricas (reforma, casamento) ficam fora até haver demanda.

### D2: Intervalos de viagem não se sobrepõem

Criar ou editar uma viagem cujo intervalo `[inicio, fim]` (inclusivo) cruza outra viagem do mesmo
usuário é rejeitado com mensagem. Isso torna o pré-preenchimento do diálogo inequívoco: no máximo uma
viagem contém uma data.

### D3: Pré-preenchimento no diálogo é só sugestão de UI

Ao criar lançamento, o campo "Viagem" recebe a viagem que contém a `data_compra` e acompanha mudanças
na data enquanto o usuário não mexer no campo. Ao editar, mostra o valor gravado e não recalcula. O
servidor grava exatamente o que vier do formulário: não há vínculo automático no backend. Isso vale
igual para lançamentos que vêm do inbox, porque a revisão usa o mesmo diálogo.

### D4: Vínculo se propaga para série e divisão

Gravar `viagem_id` num lançamento com `series_id` atualiza todas as linhas da série. Com
`split_group_id`, atualiza todas as linhas do grupo. Mesma regra para vincular, desvincular e vincular
em lote pelas sugestões.

### D5: O que entra na viagem

Exclusões, iguais às dos relatórios: transferências (`transfer_id` não nulo) e notas
`AUTO_FATURA:%` (pagamento e crédito de fatura, que duplicariam as compras do cartão). Essas linhas
nunca aparecem em sugestões e o diálogo não oferece o campo "Viagem" para elas.

### D6: Total = custo líquido do admin

`total = Σ despesas(admin) − Σ receitas(admin)` dos lançamentos vinculados, usando
`getAdminPayerId(userId)`. Pago e não pago contam. Cards: custo líquido, despesas, reembolsos.
A quebra por pessoa mostra todas as pessoas (despesa de cada uma), e só o admin entra no total.

### D7: Sugestões

Lançamentos do usuário com `data_compra` dentro do intervalo, `viagem_id` nulo, fora de D5.
Séries aparecem uma vez (pela parcela cuja data cai no intervalo). Ação: checkbox e "Vincular
selecionados". Não há "dispensar sugestão": um lançamento que não pertence à viagem continua
aparecendo enquanto estiver sem vínculo. Mudar datas da viagem não desvincula nada.

### D8: Excluir viagem

Confirmação; `on delete set null` solta os lançamentos, que continuam existindo.

## Risks / Trade-offs

- **Sugestão persistente (D7)**: sem "dispensar", a lista de sugestões nunca zera numa viagem com
  contas fixas no meio. Aceito: aparece numa caixa lateral, não bloqueia nada. Revisitar se incomodar.
- **D2 pode irritar** em viagem dentro de viagem (ex.: bate-volta no meio de uma viagem longa).
  Aceito: raro, e o vínculo manual continua possível.

## Testing

Integração das queries e actions contra Postgres (padrão `*.test.ts` existente):
custo líquido com reembolso; parcelado vinculado na série; dividido com admin e outra pessoa;
transferência e `AUTO_FATURA` excluídas do total e das sugestões; sobreposição rejeitada;
`userId` isolando viagens de outro usuário.
