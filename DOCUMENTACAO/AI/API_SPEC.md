# API SPEC

## Convencoes gerais

- Base URL: `/api/v1`
- Formato: JSON
- Autenticacao: `x-api-key` de integracao
- Escopo: cada chamada deve ser resolvida para uma `companyId`
- Idempotencia: obrigatoria nos endpoints de importacao

## Health

### GET `/health`

Uso:

- validar que a API esta viva

## Companies

### POST `/companies`

Uso:

- cadastrar empresa dona da operacao financeira

## Integration clients

### POST `/integration-clients`

Uso:

- registrar um sistema externo autorizado

### POST `/integration-clients/:id/rotate-key`

Uso:

- girar chave tecnica de integracao

## Products

### GET `/products`

Uso:

- listar produtos da empresa financeira do tenant informado

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode` opcional; quando informado, o backend aplica o escopo da filial atual
- `status` opcional: `ACTIVE | INACTIVE | ALL`
- `search` opcional

### GET `/products/:productId`

Uso:

- carregar o cadastro completo do produto informado

### POST `/products`

Uso:

- criar o cadastro base de produto compartilhado no `Financeiro`
- respeitar os parametros de estoque da filial atual via `x-source-branch-code`

### PATCH `/products/:productId`

Uso:

- atualizar o cadastro do produto informado
- manter grade, lote e quantidade conforme configuracao da filial

### POST `/products/:productId/activate`

Uso:

- reativar produto inativo

### POST `/products/:productId/inactivate`

Uso:

- inativar produto com soft delete

Campos de estoque aceitos no produto:

- `tracksInventory`
- `allowFraction`
- `usesColorSize`
- `usesLotControl`
- `currentStock`
- `minimumStock`

Regras:

- `internalCode` e numerico e deve conter somente digitos
- produto com `internalCode = 1` e reservado como produto generico para venda avulsa; na venda exige descricao, custo e preco de venda informados no item
- `internalCode`, `sku` e `barcode` nao podem repetir valor entre si no mesmo produto
- um valor usado em `internalCode`, `sku` ou `barcode` de um produto nao pode ser reutilizado em nenhum desses tres campos de outro produto da mesma empresa
- filial `TRADITIONAL` ignora `usesColorSize` e `usesLotControl`
- filial `COLOR_SIZE` permite `usesColorSize` por produto
- filial `LOT` permite `usesLotControl` por produto
- filial `INTEGER_ONLY` rejeita quantidade decimal
- filial `DECIMAL_ALLOWED` grava produto com quantidade fracionada permitida
- filial `PRODUCT_DEFINED` usa `allowFraction` do produto

### GET `/products/stock-movements`

Uso:

- listar o historico de movimentacoes de estoque da empresa financeira do tenant informado
- alimentar a tela `Histórico Movimentação do Estoque`
- a tela e somente consulta, sem cadastro direto de movimentacao

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode` opcional
- `movementType` opcional: `ENTRY | EXIT | ALL`
- `search` opcional

Regras:

- consultar `stock_movements`
- retornar movimentacoes mais recentes primeiro
- nao alterar saldo e nao criar registros
- correcoes futuras devem ocorrer por novas movimentacoes de ajuste/estorno

## Sales

### GET `/sales`

Uso:

- listar vendas confirmadas da empresa financeira do tenant informado
- filtrar por canal de venda, situacao e busca textual

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode` opcional
- `saleChannel` opcional: `GENERAL | SCHOOL_STORE | CANTEEN | SERVICE | ALL`
- `status` opcional
- `search` opcional
- `saleNumber` opcional: busca direta pelo número/documento da venda; quando informado, não depende do período selecionado
- `productSearch` opcional: busca por nome ou código do produto vendido
- `customerSearch` opcional: busca por nome ou CPF/CNPJ do cliente quando existir snapshot na venda

### GET `/sales/:saleId`

Uso:

- carregar detalhes da venda, itens e pagamentos

### POST `/sales`

Uso:

- confirmar venda de produtos com validacao de estoque, caixa e contas a receber
- gerar `sales`, `sale_items` e `sale_payments`
- gerar `stock_movements` de saida para produtos com controle de estoque
- registrar `cash_movements` para pagamentos imediatos
- gerar `receivable_titles` e `receivable_installments` quando houver boleto, prazo ou parcelado

Formas de pagamento aceitas:

- `CASH`
- `PIX`
- `DEBIT_CARD`
- `CREDIT_CARD`
- `BOLETO`
- `TERM`
- `INSTALLMENT`

Regras:

- pagamentos imediatos exigem caixa aberto para o operador
- boleto, prazo e parcelado exigem cliente/pagador informado
- soma dos pagamentos deve bater com o total da venda
- filial com quantidade inteira rejeita quantidade fracionada
- produto com cor/numero exige cor e numero na venda
- produto com lote exige lote na venda
- produto generico (`internalCode = 1`) usa a descricao enviada no item como snapshot do item vendido e grava `unitCost`
- estoque negativo so e permitido quando a regra efetiva da filial/produto permitir
- filial com `allowSaleUnitPriceEdit = false` rejeita preco unitario diferente do produto, exceto produto generico
- filial com `allowSaleItemDiscount = false` rejeita desconto por item
- venda confirmada nao apaga historico; cancelamento futuro deve gerar estorno operacional

### POST `/sales/:saleId/cancel`

Uso:

- cancelar uma venda confirmada sem apagar historico fisico
- cancelar movimentos de caixa vinculados a venda
- devolver produtos ao estoque com nova movimentacao `SALE_CANCEL`
- cancelar recebiveis gerados pela venda quando existirem

Regras:

- exige `sourceSystem` e `sourceTenantId`
- registra `canceledAt/canceledBy` nos registros originais
- o historico de estoque recebe nova entrada de retorno, preservando a saida original
- quando houver recebiveis/baixas vinculadas, os registros financeiros ficam cancelados logicamente para preservar trilha

Body resumido:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "tenant_uuid",
  "cashierUserId": "user_123",
  "requestedBy": "CAIXA 01",
  "reason": "CANCELAMENTO AUTORIZADO"
}
```

### GET `/sales/:saleId/return-context`

Uso:

- carregar uma venda confirmada com os itens e as quantidades ainda disponíveis para devolução
- alimentar a tela `PRINCIPAL_FINANCEIRO_DEVOLUCAO_MERCADORIAS`

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode` opcional

Resposta:

- dados da venda
- itens da venda com `returnedQuantity` e `availableReturnQuantity`

### POST `/sales/:saleId/returns`

Uso:

- registrar devolução parcial ou total de mercadorias de uma venda confirmada
- devolver os produtos ao estoque com movimento `SALE_RETURN`
- gerar crédito do cliente para uso futuro em baixa de parcelas

Regras:

- não cancela a venda original
- exige motivo da devolução
- bloqueia quantidade maior que a quantidade vendida ainda disponível para devolução
- produto com controle de estoque volta ao saldo por filial/variação e gera `stock_movements.movementType = ENTRY`
- crédito gerado usa `customer_credits.sourceType = SALE_RETURN`
- não lança dinheiro no caixa, pois crédito de devolução não é entrada nova de caixa
- quando a venda original não possui CPF/CNPJ de cliente válido, a devolução deve receber `customer.name` e `customer.document` válidos para gerar o crédito identificado

Body resumido:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "tenant_uuid",
  "sourceBranchCode": 1,
  "requestedBy": "OPERADOR",
  "reason": "DEVOLUÇÃO AUTORIZADA",
  "customer": {
    "name": "CLIENTE DEVOLUÇÃO",
    "document": "52998224725"
  },
  "items": [
    {
      "saleItemId": "uuid_do_item_da_venda",
      "quantity": 1
    }
  ]
}
```

## Company branches

### GET `/companies/:id/branches`

Uso:

- listar filiais e seus parametros de estoque e venda

### POST `/companies/:id/branches`

Uso:

- criar filial com parametros operacionais

Body resumido:

```json
{
  "branchCode": 2,
  "name": "FILIAL CENTRO",
  "inventoryControlType": "COLOR_SIZE",
  "quantityPrecision": "PRODUCT_DEFINED",
  "allowSaleUnitPriceEdit": true,
  "allowSaleItemDiscount": true
}
```

### PATCH `/companies/:id/branches/:branchId`

Uso:

- atualizar nome, regras de estoque, regra de quantidade e parametros comerciais da filial

## Fiscal Certificates

### GET `/fiscal-certificates`

Uso:

- listar os certificados fiscais da empresa financeira informada

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `status` opcional: `ACTIVE | INACTIVE | ALL`

### POST `/fiscal-certificates`

Uso:

- cadastrar um certificado fiscal A1
- gravar PFX e senha criptografados no Financeiro

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "companyName": "ESCOLA MODELO",
  "requestedBy": "CAIXA 01",
  "aliasName": "CERTIFICADO PRINCIPAL",
  "authorStateCode": "35",
  "environment": "PRODUCTION",
  "purpose": "NFE_DFE",
  "isDefault": true,
  "pfxBase64": "BASE64_DO_PFX",
  "certificatePassword": "SENHA_DO_PFX"
}
```

### PATCH `/fiscal-certificates/:certificateId`

Uso:

- atualizar metadados do certificado
- opcionalmente substituir o PFX e a senha

### POST `/fiscal-certificates/:certificateId/set-default`

Uso:

- definir o certificado padrão por ambiente e finalidade

### POST `/fiscal-certificates/:certificateId/sync-dfe`

Uso:

- consultar a SEFAZ no serviço de distribuição DF-e
- importar notas completas no contas a pagar quando o XML integral estiver disponível

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "requestedBy": "CAIXA 01",
  "maxBatches": 5
}
```

## Payables

### GET `/payables/invoice-imports`

Uso:

- listar as notas de entrada importadas no contas a pagar

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `status` opcional: `PENDING_APPROVAL | APPROVED | ALL`
- `search` opcional

### GET `/payables/invoice-imports/:importId`

Uso:

- carregar a nota importada para conferencia e aprovacao

### POST `/payables/invoice-imports/from-xml`

Uso:

- importar uma NF-e de entrada a partir do XML

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "companyName": "ESCOLA MODELO",
  "requestedBy": "CAIXA 01",
  "xmlContent": "<nfeProc>...</nfeProc>"
}
```

### POST `/payables/invoice-imports/:importId/approve`

Uso:

- aprovar a nota importada
- gerar duplicatas do contas a pagar
- gerar entrada de estoque quando houver item controlado

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "requestedBy": "CAIXA 01",
  "approvalNotes": "ENTRADA CONFERIDA",
  "items": [
    {
      "itemId": "uuid-do-item",
      "action": "LINK_EXISTING",
      "productId": "uuid-do-produto"
    },
    {
      "itemId": "uuid-do-item-2",
      "action": "CREATE_PRODUCT",
      "productName": "CANETA AZUL",
      "internalCode": "00045",
      "barcode": "7890000000001",
      "unitCode": "UN",
      "tracksInventory": true,
      "minimumStock": 5
    }
  ]
}
```

Regra atual:

- o XML da nota importada fica gravado em campo `blob` no proprio registro da nota dentro do `Financeiro`
- quando a nota vem da SEFAZ, o sistema guarda o `certificateId` e o `NSU` da distribuicao

## Receivables

### POST `/receivables/import`

Uso:

- receber cargas de contas a receber vindas das verticais

Body inicial esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "sourceBatchType": "MENSALIDADE",
  "sourceBatchId": "batch_123",
  "items": [
    {
      "sourceEntityType": "ALUNO",
      "sourceEntityId": "student_123",
      "businessKey": "ESCOLA:TENANT_001:ALUNO:student_123:MENSALIDADE:2026-04",
      "payer": {
        "externalEntityType": "RESPONSAVEL",
        "externalEntityId": "guardian_456",
        "name": "MARIA SILVA",
        "document": "12345678900",
        "email": "maria@teste.com"
      },
      "description": "MENSALIDADE 04/2026",
      "issueDate": "2026-04-01",
      "installments": [
        {
          "installmentNumber": 1,
          "installmentCount": 3,
          "dueDate": "2026-04-10",
          "amount": 850.0,
          "sourceInstallmentKey": "ESCOLA:student_123:2026-04:1"
        }
      ]
    }
  ]
}
```

## Resposta esperada

```json
{
  "batchId": "uuid",
  "importedTitles": 1,
  "importedInstallments": 1,
  "duplicates": 0,
  "errors": 0
}
```

## Regra de integracao com Escola

- a `Escola` continua dona da regra de quem paga
- o `Financeiro` recebe o pagador ja resolvido
- o `Financeiro` persiste o snapshot do pagador

### GET `/receivables/installments`

Uso:

- listar parcelas de uma vertical para operacao de caixa e baixa

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `status` opcional: `OPEN | PAID | OVERDUE | ALL`
- `studentName` opcional
- `payerName` opcional
- `search` opcional

### GET `/receivables/installments/open`

Uso:

- alias legado para listar somente parcelas em aberto

### POST `/receivables/installments/:installmentId/settle-cash`

Uso:

- registrar baixa em dinheiro de uma parcela

Regra obrigatoria:

- so pode executar se existir `cash_session` aberta para `sourceSystem + sourceTenantId + cashierUserId`

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "cashierUserId": "user_123",
  "cashierDisplayName": "CAIXA 01",
  "discountAmount": 0,
  "interestAmount": 0,
  "penaltyAmount": 0,
  "notes": "RECEBIMENTO NO BALCAO"
}
```

## Cash sessions

### POST `/cash-sessions/open`

Uso:

- abrir caixa por usuario operacional

### GET `/cash-sessions/current`

Uso:

- consultar o caixa aberto do usuario operacional

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `cashierUserId`

### POST `/cash-sessions/close-current`

Uso:

- fechar o caixa aberto do usuario operacional

Regra obrigatoria:

- o fechamento devolve o resumo esperado do caixa com base em abertura e recebimentos em dinheiro

### POST `/cash-sessions/movements/:movementId/cancel`

Uso:

- cancelar movimento manual de caixa ou estornar baixa/recebimento exibido no detalhe do caixa

Regras:

- exige `sourceSystem` e `sourceTenantId`
- venda deve ser cancelada pelo endpoint `/sales/:saleId/cancel`
- recebimento de parcela chama a regra de estorno de baixa, reabrindo saldo do cliente
- movimento manual de entrada/saida/ajuste permanece ativo e gera novo lançamento oposto vinculado ao original por `referenceType = CASH_MOVEMENT_CANCEL`
- entrada manual cancelada gera uma saida manual de cancelamento
- saida manual cancelada gera uma entrada manual de cancelamento
- ajuste manual cancelado gera ajuste inverso
- o fechamento esperado do caixa e ajustado pelo lançamento oposto, preservando a trilha dos dois movimentos

Body resumido:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "tenant_uuid",
  "cashierUserId": "user_123",
  "requestedBy": "SUPERVISOR",
  "reason": "LANÇAMENTO INCORRETO"
}
```
