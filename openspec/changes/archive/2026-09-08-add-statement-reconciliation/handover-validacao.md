# Handover — validação da conciliação com dados reais

Documento de passagem para continuar a validação (grupo 11 do `tasks.md`) numa sessão nova.
Escrito em 2026-09-02, logo após o deploy da 2.9.0.

## Onde a change parou

Implementação **completa e no ar**. 14/14 tasks, versão 2.9.0 deployada no Coolify
(`https://monetis.dcsconsult.com.br`), migration `0035` aplicada no boot.

Verificação verde no commit atual:

```bash
pnpm exec tsc --noEmit                              # limpo
pnpm run test                                       # 116 testes, 14 arquivos
pnpm exec biome check --formatter-enabled=false .   # limpo
```

**Nunca rode `pnpm run lint` nem `biome check .` sem a flag** — o repositório tem ruído
pré-existente de CRLF que faz 662 de 666 arquivos falharem em regra de `format`. A CI passa;
só o ambiente local reclama.

## O que falta: só o grupo 11

- [x] 11.0 Migrations aplicadas (o `docker-entrypoint.sh` roda no boot)
- [x] 11.1 **parcialmente** — extrato conciliado, resultado abaixo. Falta a fatura.
- [ ] 11.2 Calibrar a janela de data da fatura e fechar as questões em aberto do `design.md`

## Resultado do primeiro teste real (extrato, 04/07 a 02/09/2026)

| Balde | Linhas |
|---|---|
| Casadas | 71 |
| Só no banco | 35 |
| Só no app | 23 |
| Ambíguas | 7 |

**Fechamento aritmético: verde** — "Todos os dias contábeis batem com o saldo do extrato"
(34 de 34 dias, igual ao teste offline).

Integridade: `71 + 35 + 7 = 113`, exatamente a contagem de linhas do arquivo. Nenhuma linha
perdida ou duplicada na classificação.

Leitura: 63% casaram só por data+valor, o que confirma a decisão D3 de descartar matching por
texto (as descrições do usuário não têm sobreposição com os descriptors do banco). As 7 ambíguas
ficaram bem abaixo da estimativa offline de 18, porque a janela real (±1 dia em torno de
`Data Lançamento` **ou** `Data Contábil`) é mais apertada que a métrica de ±3 dias usada na
estimativa.

## A pergunta em aberto — é por aqui que a próxima sessão começa

**O balde "só no app" tem 23 lançamentos e ninguém olhou o conteúdo ainda.** São lançamentos do
usuário, dentro do período, sem contrapartida no extrato. Três causas possíveis, com ações
opostas:

1. **Duplicatas** criadas à mão — é a dor original que motivou a feature. Se for isso, é a
   validação de que ela funciona.
2. **Lançamentos de cartão** que foram parar na conta por engano — erro de cadastro, não de
   conciliação.
3. **Datas divergentes** — usuário lançou no dia da compra, banco processou fora de ±1 dia. Se
   for a maioria, a janela do matcher está apertada demais e precisa ser recalibrada.

A distribuição entre essas três causas decide se alguma regra do matcher muda. Pedir ao usuário
as primeiras linhas do balde, ou ler pela tela.

Depois: repetir tudo com `.examples/cartao-Fatura_2026-08-15.csv`, que exercita caminhos que o
extrato não toca — campo `Parcela N/M`, tolerância de centavos, linhas negativas
(`Pag Fatura Boleto`, `Estorno Tarifa`) e a verificação por total em vez de por saldo diário.

## Como retomar

Arquivos reais em `.examples/` (gitignorado, dados financeiros de verdade — nunca commitar).
Rota: `/transactions/reconciliation`.

**Nada é escrito no banco até o botão "Aplicar".** Upload, matching e verificação são puros, então
explorar a tela é seguro.

### Armadilhas encontradas nesta sessão

- **Upload programático não funciona.** `file_upload` do Claude in Chrome seta o arquivo no input
  mas não dispara o `onChange` do React. Sem erro no console — a tela simplesmente não reage.
  O usuário precisa arrastar o arquivo. Não perca tempo tentando outra via.
- **A extensão do Chrome caiu no meio da sessão** e não voltou (`list_connected_browsers`
  retornando `[]`). Só reiniciar o Chrome resolve. Plano B: pedir print ou texto da tela.

## Achado cosmético pendente

O cabeçalho da página de conciliação está errado: mostra "Lançamentos — Acompanhe todos os
lançamentos financeiros do mês selecionado", herdado da rota de transações. Devia dizer
"Conciliação". Não corrigido ainda.

## Contexto que não está no código

**A revisão final do workflow estava obsoleta** e reportou 2 críticos + 5 importantes. Seis dos
oito findings foram verificados um a um contra o HEAD e são **falsos** — o revisor leu o branch
num estado anterior à rodada de correção da task 9. Não reabra esses pontos sem verificar
primeiro:

- cast de `transactionType`: correto, `toAppTransaction` mapeia `"Receita" → income`, com testes;
- fixture da fatura: mascarada de verdade (só `86.59` e os rótulos genéricos `PAG FATURA BOLETO` /
  `ESTORNO TARIFA` sobrevivem, todos exigidos pelo plano; portadores são `Titular Teste 1/2`);
- `invoicePeriod`, pré-preenchimento do destino, `AppTransaction.name`: todos implementados.

O único desvio real é conhecido e documentado no `design.md`: `DM*hostingercomb SAO PAULO BRA`
normaliza para `hostingercomb sao`, não `hostingercomb`, porque a cidade tem duas palavras. A
chave continua determinística, então o aprendizado de de-para funciona; só não unifica o mesmo
lojista em cidades diferentes.

## Fora de escopo desta change (candidatos a próxima)

- **Inbox / pré-lançamentos**: 76 pendentes, 110 processados, 156 descartados. Tem duplicata do
  próprio banco (dois boletos `SANTANDER` de R$ 2.542,04 idênticos em 31/08) e ruído de marketing
  que o usuário vem descartando à mão. Causa diferente da conciliação de arquivo. Provavelmente o
  maior retorno depois desta change.
- **Separação por portador**: `cardLast4` e `holderName` já são persistidos como metadado, sem uso.
  A fatura do C6 tem 4 finais de cartão e 2 portadores (Daniel e Aline). Ligar isso é barato e não
  exige reimportar nada.
