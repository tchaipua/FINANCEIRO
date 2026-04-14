# SCHOOL INTEGRATION

## Objetivo

Definir como a `Escola` vai conversar com o `Financeiro`.

## Regra principal

O banco da `Escola` e o banco do `Financeiro` serao separados.

## O que isso significa na pratica

As parcelas historicas da `Escola` precisaram ser importadas uma unica vez para o `Financeiro`.

## Estrategia recomendada

### Etapa 1

A `Escola` continua gerando seus lancamentos de teste normalmente.

### Etapa 2

Criar no `Financeiro` um importador que receba:

- lote
- origem
- aluno ou referente
- pagador resolvido
- descricao
- valor
- vencimento
- numero da parcela

### Etapa 3

Ler do banco da escola os dados de:

- `student_financial_launch_batches`
- `student_financial_launch_items`

### Etapa 4

Transformar esses dados no contrato canonico financeiro e gravar no banco proprio do `Financeiro`.

Implementacao inicial realizada:

- script: `backend/scripts/import-school-sqlite.ts`
- comando: `npm run import:school`

## Regra de seguranca

- a importacao deve ser idempotente
- o financeiro nao pode depender da tabela original da escola para continuar funcionando

## Resultado esperado

Depois da importacao:

- o financeiro passa a ter seu proprio historico
- os proximos lancamentos podem ser enviados direto para o `Financeiro`

## Estado atual

Em 2026-04-04, a integracao evoluiu para o modo online no fluxo de mensalidades da `Escola`.

O que ja acontece agora:

- os lotes antigos da `Escola` podem ser importados por `npm run import:school`
- os novos lancamentos de `student-financial-launches` sao enviados direto para `POST /api/v1/receivables/import`
- a `Escola` consulta duplicidade por `POST /api/v1/receivables/existing-business-keys`
- a `Escola` carrega historico e detalhes por `GET /api/v1/receivables/batches` e `GET /api/v1/receivables/batches/:batchId`

Garantias mantidas:

- o `Financeiro` vira a fonte oficial dos novos titulos
- a trilha de auditoria da importacao online recebe `requestedBy` com o usuario de origem

## Estado consolidado

Em 2026-04-05, o importador historico da `Escola` passou a enviar tambem:

- `metadata` do lote
- `skippedItems`
- `sourceEntityName`
- `classLabel`
- `businessKey` alinhado ao fluxo online atual

Resultado:

- a `Escola` nao precisa mais consultar lotes/parcela locais para montar historico ou detalhes
- o `Financeiro` consegue responder sozinho pelos lotes antigos importados e pelos novos lancamentos

## Estado final da `Escola`

Em 2026-04-05, as tabelas `student_financial_launch_batches` e `student_financial_launch_items` foram removidas do schema e do SQLite da `Escola`.

Consequencia pratica:

- o importador historico deixa de ser reexecutavel contra a base atual da `Escola`
- todo o historico operacional de mensalidades passa a existir somente no `Financeiro`

## Caixa e baixa

Em 2026-04-05, a integracao evoluiu tambem para:

- abertura de caixa por usuario
- consulta de parcelas da escola por situacao, aluno e pagador
- baixa em dinheiro direto no `Financeiro`
- fechamento de caixa com total esperado

Regra obrigatoria da `Escola`:

- para dar baixa em dinheiro, o usuario precisa operar com permissao de `CAIXA`
- a baixa so acontece se existir caixa aberto para aquele usuario na escola atual
- a tela operacional da `Escola` abre filtrando parcelas `ABERTAS` por padrao
