# PROJECT CONTEXT

## Cenario

Hoje o sistema `Escola` ja gera lancamentos financeiros de teste no proprio banco local.
O objetivo do projeto `Financeiro` e retirar a responsabilidade financeira pesada das verticais e centralizar isso em uma plataforma propria.

## Problema que o projeto resolve

Sem um nucleo financeiro separado, cada vertical tende a criar sua propria regra de:

- contas a receber
- contas a pagar
- baixa
- cobranca
- extrato
- emissao bancaria
- documentos fiscais

Isso gera duplicidade, acoplamento e retrabalho.

## Premissas atuais

- o `Financeiro` nascera primeiro como backend sem frontend proprio
- a `Escola` sera a primeira vertical integradora
- o banco de producao desejado e `PostgreSQL`
- o desenvolvimento local pode comecar em `SQLite` se o ambiente de PostgreSQL ainda nao estiver disponivel
- em ambiente local, a `Escola` pode continuar em `3001` e o `Financeiro` deve usar porta separada, como `3002`

## Resultado esperado da primeira fase

Entregar uma base que permita:

- receber titulos a receber da escola
- persistir parcelas no banco do `Financeiro`
- manter vinculo com a origem externa
- permitir evolucao futura para petshop, lojas e oficinas

## Restricoes

- nao acoplar nomenclaturas de escola no core
- nao misturar bancos da vertical e do financeiro
- nao depender de login humano
- nao transformar o projeto em microservicos agora
