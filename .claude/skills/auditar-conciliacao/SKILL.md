---
name: auditar-conciliacao
description: Use quando o saldo do openmonetis não bater com o do banco, ao investigar lançamento duplicado, fantasma ou faltante, ao refazer a conciliação de um extrato ou fatura do C6, ou ao decidir se um número da tela está errado ou apenas projetado.
---

# Auditar conciliação (openmonetis + C6)

## Overview

Achar por que o saldo do app diverge do banco. O princípio: **o extrato do banco é a autoridade, e a
divergência se localiza por aritmética antes de se explicar por lançamento.** Comparar totais dos
dois lados isola o mês; só então vale olhar linha a linha — e aí sempre por **nome e valor juntos**.

## A regra que não se negocia

**Casar por nome E valor. Nunca concluir nada por coincidência de valor.**

Num mês real havia três lançamentos de R$ 2.000,00 e o extrato tinha dois débitos de R$ 2.000,00 no
mesmo dia — um para uma pessoa, outro para uma instituição de pagamento. Um diagnóstico feito só
pelo valor apontou o lançamento errado como duplicata; seguir com ele teria apagado uma despesa
real. O valor sozinho não distingue nada num extrato com recorrentes.

Corolário: uma coincidência entre o valor da divergência e algum lançamento **não é evidência de
causa**. Divergência de R$ 2.000 com um lançamento de R$ 2.000 à vista é exatamente onde o erro
acontece.

## Método, na ordem

### 1. Localizar o mês pela aritmética

Nunca comece pelos lançamentos. Compare saldos de fim de mês:

```
Extrato: saldo da última linha de cada mês (coluna Saldo do Dia)
App:     Contas → extrato da conta → navegar mês a mês → card "Saldo ao final do período"
```

A divergência aparece num mês e se propaga para os seguintes. Encontre onde ela **nasce** — o mês em
que o delta muda de tamanho. Corrigir um mês antigo conserta todos os posteriores de uma vez.

Atenção ao efeito de erros que se compensam: um saldo inicial R$ 7.544,62 alto somado a R$ 9.544,62
de despesas a mais aparece como uma divergência de apenas R$ 2.000. **Compare entradas e saídas
separadamente**, nunca só o líquido.

### 2. Confrontar totais do mês

```
App:   card do mês → Entradas / Saídas
Banco: somar créditos e débitos por Data Contábil daquele mês
```

Se as entradas batem e as saídas não, o problema é só de despesa — metade do espaço de busca
sumiu. Confira se o arquivo cobre o mês inteiro: um extrato que começa dia 05 não fecha o mês.

### 3. Só então, linha a linha

Exporte do app (botão **Exportar → CSV** na tela de contas ou da fatura) e cruze com o extrato
usando `confronto.py` deste diretório, que casa por valor e mostra os nomes dos dois lados.

## Formatos dos arquivos

| Arquivo | Separador | Decimal | Colunas relevantes |
|---|---|---|---|
| Extrato C6 | `,` | ponto (`550.72`) | `Data Lançamento, Data Contábil, Descrição, Tipo, Crédito, Débito, Saldo do Dia` |
| Fatura C6 | `;` | ponto (`-12164.10`) | `Data de Compra, Descrição, Parcela, Valor (em R$)` |
| Export do app | `,` | vírgula, com `R$` e **`\xa0`** | `Data, Nome, Tipo, Condição, Pagamento, Valor, ...` |

**Armadilha do export:** o valor vem como `-R$\xa0600,00` — espaço não-quebrável. `strip()` remove o
`\xa0` das receitas (onde ele fica na ponta) mas não das despesas (onde fica entre o sinal e o
número), então um parse ingênuo **zera as saídas e mantém as entradas**, dando a falsa impressão de
que só as despesas divergem. Limpe com `re.sub(r'[^0-9,.\-]', '', valor)`.

As duas primeiras linhas do extrato e da fatura são cabeçalho do banco, não dados — pule linhas que
não parseiam em vez de assumir posição fixa.

## Como o C6 monta a fatura

O total da fatura **não** é a soma das compras:

```
Total = todas as linhas − pagamentos da fatura anterior
```

Linhas negativas são de dois tipos, e confundi-los produz erro do tamanho do pagamento:

- `Pag Fatura Boleto` — quitação da fatura **anterior**. Sai da conta corrente. **Não entra** na soma.
- `Inclusao de Pagamento`, `Estorno ...` — crédito **desta** fatura (adiantamento, estorno). **Entra** na soma.

Conferido num caso real: compras R$ 19.484,72 − estorno R$ 98,00 − adiantamentos R$ 7.222,62 =
**R$ 12.164,10**, exatamente o boleto pago.

## Armadilhas do app

| Sintoma | Causa | O que fazer |
|---|---|---|
| Saldo da conta nunca bate com o banco | O card é **projetado até o fim do mês**, inclui lançamentos futuros; o banco só tem o realizado | Some as saídas ainda não realizadas do mês antes de comparar |
| Lançamento com "remover" cinza | Nota começa com `AUTO_FATURA:` — foi gerado pela quitação da fatura (`page-helpers.ts`, campo `readonly`) | Cartões → fatura → **período correto** → "Desfazer pagamento" |
| Pagamento de fatura não aparece na tela do cartão | A tela abre no período atual | Navegar até o período em que o pagamento foi registrado |
| Recorrente cai sempre em "só no banco" | Data fixa (dia 15) distante do débito real (dia 10) | Ensinar o de-para com **Vincular a lançamento existente**; casa por nome+período e ignora data |
| Balde "só no app" cheio de lixo | Candidatos trazidos pela folga de busca, fora do período do arquivo | Corrigido na 2.10.0; se voltar, é regressão do filtro por escopo |
| Upload do CSV não reage | `file_upload` programático não dispara o `onChange` do React | Pedir ao usuário para arrastar o arquivo; não insistir |
| `get_page_text` devolve só uma linha da tabela | A página tem um `<article>` por linha | Usar o Exportar, não raspar a tela |

## Lições

**Erros que se compensam escondem o tamanho do problema.** Uma divergência pequena pode ser a
diferença entre dois erros grandes. Sempre decomponha entradas e saídas.

**Ajuste manual de saldo mascara a causa.** Lançamentos chamados `Conciliaçao Conta` são ajustes
feitos pelo botão "Ajustar saldo". Eles fecham o número e apagam a pista. Trate-os como sintoma,
não como dado — e só os remova depois de corrigir a causa real.

**Lançamento de R$ 0,00 é placeholder esquecido**, não lançamento sem valor. A conciliação preenche
o valor real quando a linha casa.

**Antes de recomendar exclusão, procure a contrapartida.** Um lançamento órfão no app pode ser o par
legítimo de uma linha que casou errado com outro lançamento. Verifique quem casou com quem.

**Medir antes de calibrar.** Ao mexer na janela de data do matcher, meça: em dados reais, ±2
manteve os mesmos casamentos automáticos de ±1 e zerou os órfãos de borda, enquanto ±3 em diante
piorou nos dois sentidos ao mesmo tempo. A tabela está no comentário de `DATE_WINDOW_DAYS`.

## Onde ficam as coisas

- Arquivos reais do usuário: `.examples/` — **gitignorado, dados financeiros, nunca commitar**
- Matcher e regras: `src/shared/lib/reconciliation/matcher.ts`
- Fechamento aritmético: `src/shared/lib/reconciliation/closure.ts`
- Quitação de fatura: `src/features/invoices/actions.ts`
- Histórico das decisões: `openspec/changes/archive/*reconciliation*/design.md` — as seções
  "Achados da validação com dados reais" trazem números verificados que contradizem decisões
  escritas antes deles

## Verificação do projeto

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=4
pnpm exec biome check --formatter-enabled=false .
```

**Nunca** `pnpm run lint` nem `biome check .` sem a flag: o repositório tem ruído de CRLF que faz
662 de 666 arquivos falharem em regra de formatação. Se você vir centenas de erros de formato, usou
o comando errado.
