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

## D008 - Cabecalho soberano integrado com a Escola

O `Financeiro` adota como referencia visual soberana do cabecalho de programas o mesmo encaixe aprovado em `PRINCIPAL_PROFESSORES` no sistema `Escola`.

Decisao:

- o bloco direito com card branco do usuario e botao `VOLTAR` deve seguir esse mesmo desenho base;
- o reaproveitamento no `Financeiro` fica registrado em documentacao e no mapa tecnico;
- a aplicacao em telas existentes nao deve acontecer em lote;
- qualquer ajuste futuro deve ser feito manualmente, tela por tela, somente apos validacao explicita do usuario.

Motivo:

- evitar divergencia visual entre `Escola` e `Financeiro`;
- preservar o padrao aprovado como patrimonio compartilhado entre os dois sistemas;
- reduzir regressao em futuras manutencoes de header.

## D009 - Estoque parametrizado por filial

O estoque do `Financeiro` passa a ser parametrizado por filial.

Decisao:

- cada filial define se o estoque e tradicional, por cor/numero ou por lote;
- cada filial define se as quantidades sao inteiras, decimais ou definidas por produto;
- o cadastro de produto so exibe e aceita as opcoes permitidas pela filial atual;
- os saldos sao preparados em `product_stock_balances` para estoque geral da empresa (`branchCode = 0`) e estoque separado por filial.

Motivo:

- permitir uso do mesmo `Financeiro` por escola, loja, petshop, oficina e outras verticais;
- evitar campos desnecessarios na tela quando a filial nao usa grade, lote ou decimal;
- preparar estoque por produto, filial, variacao e lote sem acoplar o core a uma vertical.

## D010 - Tratamento do alerta npm audit do Next/PostCSS

O `frontend` do `Financeiro` foi atualizado para `next@16.2.6` apos `npm audit fix --force`.

Decisao:

- manter `next@16.2.6`;
- nao aplicar a sugestao restante do `npm audit` que aponta downgrade para `next@9.3.3`;
- tratar o alerta residual de `postcss` interno do Next como risco conhecido temporario;
- revisar novamente quando houver patch oficial do Next moderno que resolva a dependencia interna sem downgrade incompatível.

Motivo:

- o projeto usa Next moderno com App Router;
- downgrade para Next 9 e incompatível com a arquitetura atual e tende a quebrar o frontend;
- `npm run build` e teste visual com Playwright passaram em `next@16.2.6`;
- a mitigacao segura e acompanhar nova versao compatível, nao forcar downgrade automatico.

## D011 - Modelo compartilhado do modal de auditoria SQL

O `Financeiro` adota o mesmo modelo visual aprovado na `PRINCIPAL_PROFESSORES` da Escola para o modal que mostra SQL.

Decisao:

- o cabecalho do modal concentra logotipo/origem/identificador a esquerda;
- as abas `Outras informações` e `SQL` ficam no centro do cabecalho;
- os botoes `Fechar` e `Copiar SQL` ficam a direita, com o mesmo tamanho;
- `Copiar SQL` aparece somente quando a aba `SQL` estiver ativa;
- o rodape do modal nao deve repetir os botoes de acao;
- a aba `SQL` deve manter consulta/base logica copiavel com parametros reais sempre que possivel.

Motivo:

- manter Escola e Financeiro com o mesmo padrao de suporte tecnico;
- evitar divergencia visual entre sistemas integrados;
- garantir que SQL copiado seja utilizavel diretamente para validacao e diagnostico.
