# DECISIONS

## D001 - Produto separado

O `Financeiro` sera um projeto separado das verticais.

Motivo:

- reduz acoplamento
- permite reuso real entre ramos

## D002 - Sem login humano proprio

O `Financeiro` nao tera autenticacao humana no escopo inicial.

Motivo:

- o consumo sera sistemico por API

## D003 - Banco proprio

O `Financeiro` tera banco proprio, separado do banco da escola.

Motivo:

- evita mistura de contexto
- facilita evolucao independente

## D004 - SQLite local permitido

Enquanto o ambiente de PostgreSQL nao estiver pronto, o desenvolvimento local pode usar `SQLite`.

Motivo:

- destravar o inicio do projeto
- manter foco na modelagem e na API

## D005 - Migracao das parcelas da escola

As parcelas ja gravadas no banco da escola nao serao compartilhadas automaticamente pelo novo sistema financeiro.

Decisao:

- implementar importacao controlada da escola para o `Financeiro`
- preservar o banco da escola como origem historica do teste
- gravar novos registros no banco do `Financeiro`

## D006 - Escola como primeira integracao

A `Escola` sera a primeira vertical integradora e servira para validar o contrato canonico.

## D007 - Padrao de auditoria visual por tela

Toda tela do `Financeiro` deve ter no rodape o botao de copiar o nome tecnico da tela.

Decisao:

- ao clicar no botao, o sistema deve copiar o identificador tecnico da tela;
- no mesmo clique, deve abrir um popup central com a "Logica Usada nessa Tela";
- o popup deve apresentar tabelas fisicas, aliases, descricoes em portugues, relacionamentos, metricas/campos exibidos, filtros, ordenacao e SQL base;
- o padrao visual de referencia e o modal validado em `PRINCIPAL_FINANCEIRO_CAIXA_DETALHE`.

Motivo:

- facilitar auditoria tecnica e suporte;
- padronizar entendimento da origem dos dados;
- permitir que qualquer tela criada futuramente ja documente sua propria logica operacional.
