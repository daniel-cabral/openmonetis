## Why

Na conciliação real do extrato do C6, despesas fixas que o usuário já lança como recorrentes no
orçamento (Aluguel, Condomínio, Energia, Consórcio) caíram no balde "só no banco" porque ele lança
no dia do vencimento nominal e o banco debita alguns dias antes, com valor que varia levemente mês
a mês. O matcher compara data e valor, então não alcança o lançamento que já existe. O usuário vê
apenas o descriptor cru (`CASA NOVA LOCADORA LTDA - EPP - Boleto`), que não diz do que se trata, e
a única saída oferecida é criar um lançamento novo — duplicando o recorrente que ele já tinha.

A conciliação da fatura, feita em seguida, expôs quatro defeitos independentes que vivem nos mesmos
arquivos: o fechamento da fatura soma o conjunto errado de linhas e acusa divergência numa fatura
que fecha exata; o total digitado depois de avançar não recalcula nada; o balde "só no app" da
fatura vem com 267 linhas, 96% delas de faturas anteriores; e o pagamento da fatura anterior aparece
oferecendo "criar lançamento", a um clique de inserir uma receita de doze mil reais no cartão.
Corrigi-los em changes separadas criaria conflito entre elas sem ganho de revisão.

## What Changes

**De-para de nome (o pedido original):**

- De-para aprendido de **descriptor do banco → nome de lançamento**, no mesmo modelo do aprendizado
  de categoria: o usuário aponta `CASA NOVA` → `Aluguel` uma vez e os meses seguintes são
  reconhecidos sozinhos.
- Regra de matcher nova, **por nome + período**, avaliada depois das regras exata e de centavos e
  antes de ambíguo. Vale apenas para descriptor com de-para conhecido e **apenas para destino do
  tipo conta**; ignora data e valor e exige o mesmo sinal.
- Ação nova **"Vincular a lançamento existente"** no balde "só no banco", nos dois tipos de destino.
  Sem ela não há como ensinar o primeiro de-para: no primeiro mês o lançamento recorrente não é
  candidato de nada.
- Campo de **nome** no balde "só no banco", pré-preenchido com o nome aprendido quando houver e com
  o descriptor quando não.
- Estado novo **"casada com divergência de valor"**, com decisão por linha entre manter o valor
  lançado e atualizá-lo para o do extrato. Bloqueado quando o lançamento é dividido.

**Correções apuradas na validação da fatura:**

- Fechamento da fatura passa a somar **todas as linhas menos os pagamentos de fatura**, em vez de
  somar apenas as de valor positivo. **BREAKING** em relação ao comportamento atual, que reporta
  divergência falsa.
- Classificação de linha em três estados no parser da fatura (`purchase`, `credit`,
  `invoice-payment`), como campo aditivo novo — `isPurchase` permanece intacto.
- Balde próprio, informativo e sem ação de criação, para linhas que não são compra.
- Escopo do balde "só no app": intervalo do arquivo quando o destino é conta,
  `period = invoicePeriod` quando é cartão.
- O total da fatura recalcula o fechamento sem refazer o upload.

## Capabilities

### New Capabilities

- `reconciliation-name-mapping`: aprendizado do de-para descriptor→nome, vínculo manual a lançamento
  existente, regra de casamento por nome + período e resolução de divergência de valor.
- `invoice-closure-correction`: classificação de linha da fatura em três estados, fechamento por
  soma líquida, balde informativo de linhas que não são compra e escopo do balde "só no app".

### Modified Capabilities

<!-- Nenhuma. A capability `statement-reconciliation` vive na change
     `add-statement-reconciliation`, ainda não arquivada em `openspec/specs/`. Esta change corrige e
     estende aquele comportamento; quando as duas forem arquivadas, os requisitos aqui prevalecem. -->

## Impact

- **Banco**: tabela nova `import_name_mappings` (`user_id`, `description_key`, `name`, `updated_at`;
  PK `user_id + description_key`), puramente aditiva. Tabela própria em vez de coluna em
  `import_category_mappings`, que é do upstream — mesma razão que motivou `reconciliation_ignores`.
- **Matcher**: `src/shared/lib/reconciliation/matcher.ts` ganha uma regra; `AppTransaction` passa a
  expor `period` e `isDivided`.
- **Candidatos**: `reconciliation-candidates-action.ts` passa a buscar por intervalo de datas **ou**
  período, e o balde exibido ganha filtro por escopo.
- **Fechamento**: `src/shared/lib/reconciliation/closure.ts` e o parser
  `src/shared/lib/import/parsers/c6-invoice-csv.ts`.
- **Upstream**: `src/shared/lib/import/types.ts` ganha um campo opcional novo (`lineKind`), sem
  alterar `isPurchase` — mudar o campo existente quebraria o import de OFX e ampliaria a superfície
  de merge.
- **Plano e aplicação**: `reconciliation-plan.ts` e `reconciliation-action.ts` ganham o upsert do
  de-para e o update de valor, dentro da mesma `db.transaction()`.
- **UI**: `src/features/transactions/components/reconciliation/`.
- **Depende de** `add-statement-reconciliation` estar em produção (está, na 2.9.0).
- **Não cobre** o achado A1 daquela change (sugerir par próximo por valor idêntico em janela larga),
  que segue sem change alocada: o de-para cobre o recorrente conhecido, o A1 cobre o eventual.
