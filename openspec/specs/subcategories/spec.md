# subcategories Specification

## Purpose
TBD - created by archiving change add-subcategories. Update Purpose after archive.

## Requirements

### Requirement: Categoria tem subcategorias opcionais

Uma categoria SHALL poder ter zero ou mais subcategorias, de um único nível, pertencentes ao mesmo
usuário. Nomes SHALL ser únicos por categoria, sem diferenciar maiúsculas. Excluir uma subcategoria
NÃO SHALL excluir lançamentos: eles ficam na categoria, sem subcategoria.

#### Scenario: Criar subcategorias no diálogo da categoria

- **WHEN** o usuário edita Moradia, adiciona "Faxina" e "IPTU" e clica em "Atualizar"
- **THEN** as duas subcategorias passam a existir em Moradia, gravadas junto com a categoria numa única transação

#### Scenario: Nome duplicado falha o salvamento inteiro

- **WHEN** o usuário adiciona "faxina" em Moradia, que já tem "Faxina"
- **THEN** nada é gravado e o campo mostra erro

#### Scenario: Excluir subcategoria preserva lançamentos

- **WHEN** o usuário exclui "Faxina", que tem 38 lançamentos
- **THEN** os 38 lançamentos continuam em Moradia com subcategoria vazia

### Requirement: Lançamento tem subcategoria opcional da sua categoria

Um lançamento SHALL poder ter uma subcategoria, e ela SHALL pertencer à categoria do lançamento.
Toda gravação que define a categoria SHALL validar dono e pertencimento, copiar a subcategoria
quando o lançamento derivado mantém a categoria de origem, e limpá-la quando a categoria muda.

#### Scenario: Escolher subcategoria no lançamento

- **WHEN** o usuário cria "Faxina Maria", R$ 120,00, categoria Moradia, subcategoria Faxina
- **THEN** o lançamento é gravado com Moradia e Faxina

#### Scenario: Seletor só aparece quando há subcategorias

- **WHEN** a categoria escolhida não tem subcategorias
- **THEN** o diálogo não mostra o campo "Subcategoria"

#### Scenario: Trocar categoria limpa subcategoria

- **WHEN** um lançamento Moradia/Faxina é editado para a categoria Transporte
- **THEN** o lançamento fica sem subcategoria

#### Scenario: Subcategoria de outra categoria é rejeitada

- **WHEN** uma action recebe categoria Transporte com a subcategoria Faxina de Moradia
- **THEN** a gravação falha e nada muda

### Requirement: Totais por categoria não mudam

Dashboard, orçamentos, insights e relatórios SHALL continuar somando por categoria, com os mesmos
valores de antes da mudança.

#### Scenario: Total de Moradia igual antes e depois

- **WHEN** lançamentos de Moradia recebem subcategorias
- **THEN** o total de Moradia no dashboard, no orçamento e nos relatórios não se altera

### Requirement: Página da categoria mostra o detalhamento por subcategoria

No card do cabeçalho da página da categoria, abaixo das estatísticas, SHALL existir o bloco
"Por subcategoria" para o período selecionado: uma linha por subcategoria com lançamento no
período (nome, barra proporcional, valor, percentual), ordenadas por valor decrescente, e a linha
"Sem subcategoria" quando houver. A soma das linhas SHALL ser igual ao "Total em {mês}". O bloco
NÃO SHALL aparecer quando a categoria não tem subcategorias. Clicar numa linha SHALL filtrar a
lista de lançamentos da página; clicar de novo SHALL limpar o filtro.

#### Scenario: Detalhamento de outubro

- **WHEN** Moradia em outubro/2026 tem Aluguel R$ 2.800,00, Condomínio R$ 650,00, Faxina R$ 480,00, IPTU R$ 312,40 e R$ 189,90 sem subcategoria
- **THEN** o bloco mostra as cinco linhas nessa ordem, com 63,2%, 14,7%, 10,8%, 7,0% e 4,3%, somando R$ 4.432,30

#### Scenario: Filtrar por subcategoria

- **WHEN** o usuário clica em "Faxina"
- **THEN** a lista abaixo mostra só os lançamentos de Faxina do período

#### Scenario: Filtrar sem subcategoria

- **WHEN** o usuário clica em "Sem subcategoria"
- **THEN** a lista mostra só os lançamentos de Moradia sem subcategoria

### Requirement: Definir subcategoria em massa

A barra de seleção da lista de lançamentos SHALL oferecer "Definir subcategoria", com as
subcategorias agrupadas pelas categorias dos itens selecionados e a opção "Remover subcategoria".
A ação SHALL atualizar só os selecionados cuja categoria é a da subcategoria escolhida, ignorar os
demais e informar as duas contagens. Lançamentos protegidos SHALL seguir a mesma regra da exclusão
em massa.

#### Scenario: Reclassificar com itens de outra categoria

- **WHEN** o usuário seleciona 4 faxinas de Moradia e 1 lançamento de Transporte e escolhe Faxina
- **THEN** 4 lançamentos passam a Faxina, 1 é ignorado, e o aviso diz "4 lançamentos atualizados para Faxina" e "1 ignorado: não é da categoria Moradia."

### Requirement: Importação e conciliação lembram a subcategoria

A memória por descrição da importação e da conciliação SHALL guardar e reaplicar a subcategoria
junto com a categoria. As linhas desses fluxos SHALL ter seletor de subcategoria quando a categoria
da linha tem subcategorias. Ao salvar, a memória SHALL gravar a subcategoria atual da linha,
inclusive vazia. Trocar a categoria de uma linha SHALL descartar a subcategoria lembrada.

#### Scenario: Importação reaplica Faxina

- **WHEN** uma importação anterior gravou "FAXINA MARIA" como Moradia/Faxina e chega nova linha "FAXINA MARIA"
- **THEN** a linha vem sugerida com Moradia e Faxina
