# Integração Sicredi

## Escopo preparado

O Financeiro possui integração backend com a API oficial de Cobrança do Sicredi para:

- autenticação OAuth2 com renovação por `refresh_token`
- emissão de boleto
- geração de PDF do boleto
- consulta de boletos liquidados por dia
- consulta de movimentações financeiras diárias (francesinha)
- importação de liquidações para conferência e baixa posterior
- importação de movimentações para o extrato bancário

Nenhuma tela foi criada ou alterada.

## Configuração usando os campos bancários existentes

- `billingProvider`: `SICREDI`
- `billingEnvironment`: `SANDBOX` ou `PRODUCTION`
- `billingApiClientId`: `x-api-key` fornecida pelo portal do Sicredi
- `billingApiClientSecret`: código de acesso gerado no Internet Banking
- `billingBeneficiaryCode`: código do beneficiário/convênio
- `billingContractNumber`: código da cooperativa
- `branchNumber`: código do posto
- `billingNextBoletoNumber`: próximo nosso número

O certificado digital não é usado pela API de Cobrança do Sicredi.

## DDA

A documentação oficial consultada da API de Cobrança não apresenta endpoint de DDA. A consulta automática de DDA continua disponível somente para o Sicoob até que o Sicredi forneça uma API/contrato específico para esse produto.

## Fonte técnica

Manual oficial da API de Cobrança Sicredi, versão 3.9.1, publicado em 25/03/2026.
