# Financeiro Backend

Core financeiro multiempresa desacoplado dos sistemas de origem.

## Objetivo

- receber contas a receber geradas por sistemas como `Escola` e `Petshop`
- centralizar títulos, parcelas, baixas e caixa
- manter contrato genérico por `sourceSystem` + `sourceTenantId`

## Como rodar

1. Copie `.env.example` para `.env`
2. Rode `npm install`
3. Rode `npx prisma migrate dev --name init_finance_core`
4. Rode `npm run start:dev`

Base padrão da API: `http://localhost:3002/api/v1`
