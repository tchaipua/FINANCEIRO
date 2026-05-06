# SYSTEM IDENTITY

## Nome do produto

`Financeiro`

## Missao

Ser um nucleo financeiro reutilizavel por varias verticais, como:

- escola
- petshop
- loja
- oficina
- outras operacoes futuras

## Identidade arquitetural

O `Financeiro` nao e uma extensao visual da escola.
O `Financeiro` e um backend independente, sem login humano proprio, consumido por outros sistemas via API.

## Regra soberana de dominio

O core financeiro de recebiveis/pagamentos nao pode depender de entidades especificas como:

- aluno
- professor
- pet
- tutor
- ordem de servico
- produto
- venda

O core deve conhecer somente conceitos financeiros genericos, como:

- empresa
- origem integradora
- pagador
- favorecido
- titulo
- parcela
- vencimento
- recebimento
- conta bancaria
- cobranca
- documento fiscal

## Evolucao controlada do mesmo produto

O produto `Financeiro` pode hospedar, no mesmo repositorio e no mesmo deploy, modulos compartilhados de apoio operacional, como:

- produtos
- estoque
- vendas
- notas de entrada
- certificados fiscais

Condicao obrigatoria:

- esses modulos nao podem contaminar o core financeiro com regras especificas de uma vertical;
- o cadastro compartilhado pode existir no mesmo sistema, mas o dominio de recebiveis/pagamentos deve continuar desacoplado.

## Principios obrigatorios

- multiempresa obrigatorio
- banco proprio e separado das verticais
- auditoria obrigatoria em toda mutacao
- soft delete em dados de negocio
- snapshot obrigatorio nos titulos financeiros
- API idempotente para integracoes

## Regra de acesso

- nao existe usuario humano autenticando diretamente no `Financeiro`
- o acesso acontece por chaves de integracao entre sistemas
- toda chamada deve carregar a identificacao da empresa e do sistema de origem
