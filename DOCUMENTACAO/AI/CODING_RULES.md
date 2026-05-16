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
- O nome tecnico de popup/modal deve ser exclusivo, estavel e nao pode ser reaproveitado por outro fluxo visual.
- O nome tecnico deve seguir o contexto em que a tela aparece. Em telas embutidas em uma vertical, usar o identificador da tela principal da vertical quando aplicavel, como `PRINCIPAL_FINANCEIRO_CAIXA_DETALHE`.
- Em telas do `Financeiro` abertas dentro de outra vertical, como a `Escola`, a navegacao lateral, o cabecalho institucional e a moldura principal devem continuar sendo da vertical consumidora.
- Nesses casos, a tela interna do `Financeiro` deve renderizar somente o conteudo funcional da area central, sem abrir em modo pagina cheia por padrao.
- Em modo embutido, deve existir apenas um nome tecnico visivel para a tela: o identificador da vertical consumidora. O identificador interno do `Financeiro` pode existir para codigo e auditoria, mas nao deve aparecer duplicado na interface.
- Ao clicar no botao de copiar, alem de copiar o nome da tela, deve abrir um popup central de "Logica Usada nessa Tela".
- O popup deve seguir o padrao validado na tela `PRINCIPAL_FINANCEIRO_CAIXA_DETALHE`:
  - overlay escuro com blur e modal central moderno;
  - card principal branco, bordas arredondadas grandes e sombra forte;
  - cabecalho escuro em degradê, com `Auditoria SQL` como etiqueta e o identificador tecnico da tela logo abaixo;
  - botao de fechar circular no canto superior direito do cabecalho;
  - titulo central em formato de pill/etiqueta com `Logica Usada nessa Tela`;
  - origem da tela logo abaixo do titulo, centralizada, em vermelho, contendo sistema dono e path completo do arquivo;
  - area rolavel com estrutura, tabelas principais, relacionamentos, metricas/campos exibidos, filtros, ordenacao e SQL base;
  - area do SQL em card branco com borda, sombra interna, fonte monoespacada e scroll proprio;
  - nomes fisicos das tabelas destacados em negrito e com fonte um pouco maior;
  - tabelas principais exibidas com alias entre parenteses e descricao em portugues, exemplo `cash_sessions (CS) - sessoes de caixa abertas/fechadas por operador.`;
  - botoes modernos `Copiar SQL` e `Fechar`, centralizados abaixo da area do SQL.
- Esse padrao deve ser considerado obrigatorio para novas telas do Financeiro e para telas embutidas em outros sistemas consumidores.
