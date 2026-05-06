# TASKS

## Fase atual

Base funcional do projeto `Financeiro`, com recebiveis, produtos, contas a pagar por XML e primeira camada de importacao automatica DF-e por certificado fiscal.

## Tarefas prioritarias

- criar a documentacao oficial do projeto
- subir backend NestJS
- configurar Prisma
- criar schema inicial generico
- criar endpoint `POST /receivables/import`
- definir estrategia de autenticacao por `x-api-key`
- definir fluxo de importacao da escola
- consolidar fluxo de aprovacao de notas de entrada com estoque e duplicatas
- consolidar cadastro multi-certificado por empresa para automacao fiscal

## Tarefas seguintes

- evoluir modulo de produtos compartilhados para estoque, notas de entrada e vendas
- expandir modulo de contas a pagar para fornecedores e lancamento manual
- criar modulo de contas bancarias
- criar modulo de extrato
- criar modulo de cobranca
- ampliar importacao automatica com manifestacao do destinatario e tratamento de resumos DF-e
