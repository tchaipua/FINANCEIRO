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
- `status` opcional: `ACTIVE | INACTIVE | ALL`
- `search` opcional

### GET `/products/:productId`

Uso:

- carregar o cadastro completo do produto informado

### POST `/products`

Uso:

- criar o cadastro base de produto compartilhado no `Financeiro`

### PATCH `/products/:productId`

Uso:

- atualizar o cadastro do produto informado

### POST `/products/:productId/activate`

Uso:

- reativar produto inativo

### POST `/products/:productId/inactivate`

Uso:

- inativar produto com soft delete

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
