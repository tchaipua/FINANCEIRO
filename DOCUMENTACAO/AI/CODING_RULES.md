# CODING RULES

## Regras obrigatorias

- TypeScript obrigatorio
- NestJS no backend
- Prisma como ORM
- modelagem pensando primeiro em PostgreSQL
- codigo orientado a dominio financeiro generico
- nada de acoplamento a escola, petshop, loja ou oficina dentro do core

## Regras de implementacao

- usar modulos por dominio
- DTOs com validacao por `class-validator`
- auditoria em toda mutacao
- soft delete nos dados de negocio
- endpoints de importacao com idempotencia
- logs suficientes para rastrear integracoes

## Regras de nomenclatura

- nomes de entidades devem ser financeiros e genericos
- evitar nomes como `studentInvoice`, `petBill`, `workshopCharge`
- preferir nomes como `receivableTitle`, `receivableInstallment`, `financialParty`

## Regra de migracao

- toda migracao futura da escola para o financeiro deve ocorrer por API ou script de importacao controlado
- nao compartilhar tabelas fisicas entre produtos

## Padrao obrigatorio de identificacao e auditoria visual de telas

- Toda tela criada ou alterada deve manter no rodape o botao de copiar o nome tecnico da tela.
- Todo novo popup/modal criado deve nascer por padrao com logotipo institucional no cabecalho, nome tecnico exclusivo e bloco de auditoria visual no rodape.
- Quando o popup/modal tambem exibir foto, avatar ou icone do registro, esse elemento nao substitui o logotipo institucional; ambos devem ficar separados no cabecalho.
- O nome tecnico de popup/modal deve ser exclusivo, estavel e nao pode ser reaproveitado por outro fluxo visual.
- O nome tecnico deve seguir o contexto em que a tela aparece. Em telas embutidas em uma vertical, usar o identificador da tela principal da vertical quando aplicavel, como `PRINCIPAL_FINANCEIRO_CAIXA_DETALHE`.
- Em telas do `Financeiro` abertas dentro de outra vertical, como a `Escola`, a navegacao lateral, o cabecalho institucional e a moldura principal devem continuar sendo da vertical consumidora.
- Nesses casos, a tela interna do `Financeiro` deve renderizar somente o conteudo funcional da area central, sem abrir em modo pagina cheia por padrao.
- Em modo embutido, deve existir apenas um nome tecnico visivel para a tela: o identificador da vertical consumidora. O identificador interno do `Financeiro` pode existir para codigo e auditoria, mas nao deve aparecer duplicado na interface.
- Ao clicar no botao de copiar, alem de copiar o nome da tela, deve abrir um popup central de "Logica Usada nessa Tela".
- O popup deve seguir o padrao validado na tela `PRINCIPAL_PROFESSORES` da Escola e aplicado tambem no `Financeiro`:
  - overlay escuro com blur e modal central moderno;
  - card principal branco, bordas arredondadas grandes e sombra forte;
  - cabecalho escuro em degradê, com logotipo institucional no canto esquerdo, `Auditoria SQL` como etiqueta, identificador tecnico da tela logo abaixo e pill `ORIGEM: SISTEMA ...`;
  - seletor de abas dentro do cabecalho, ao centro, com `Outras informações` aberta por padrao e `SQL` como segunda aba;
  - botoes textuais no canto direito do cabecalho, com `Fechar` acima e `Copiar SQL` abaixo, ambos do mesmo tamanho;
  - o botao `Copiar SQL` deve aparecer somente quando a aba `SQL` estiver selecionada;
  - origem tecnica/path completo do arquivo logo abaixo do cabecalho, centralizada, em vermelho;
  - a aba `Outras informações` deve conter estrutura, tabelas principais, relacionamentos, metricas/campos exibidos, filtros aplicados, ordenacao, observacoes e identificadores humanos de apoio;
  - a aba `SQL` deve conter exclusivamente SQL/base logica copiavel, em card branco com borda, sombra interna, fonte monoespacada e scroll proprio;
  - a aba `SQL` deve refletir os filtros atuais da tela no momento da abertura, usando valores reais para parametros como `companyId`/`tenantId`, `branchCode`, status, periodo, busca digitada e demais filtros visiveis;
  - nomes humanos como nome da empresa, escola consumidora ou filial podem aparecer em `Outras informações` entre parenteses, mas nao devem ser inseridos no SQL quando isso quebrar a execucao direta;
  - nomes fisicos das tabelas destacados em negrito e com fonte um pouco maior;
  - tabelas principais exibidas com alias entre parenteses e descricao em portugues, exemplo `cash_sessions (CS) - sessoes de caixa abertas/fechadas por operador.`;
  - nao deve haver duplicidade dos botoes de acao no rodape do modal; `Copiar SQL` deve copiar somente o conteudo da aba `SQL`.
- Esse padrao deve ser considerado obrigatorio para novas telas do Financeiro e para telas embutidas em outros sistemas consumidores.
