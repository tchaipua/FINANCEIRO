# UI_PATTERN_CHANGELOG

## Objetivo

Registrar a evolucao dos padroes visuais e funcionais aprovados no projeto `Financeiro`.

### UIP-0001

- Data: 2026-05-07
- Padrao: base oficial de UI Financeiro
- Contexto: necessidade de espelhar no projeto Financeiro os padroes aprovados e ja consolidados no ecossistema integrado com a Escola
- Alteracao: criacao do documento mestre de padroes, do changelog de UI e do mapa tecnico compartilhado no frontend
- Componentes/Telas:
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0002

- Data: 2026-05-07
- Padrao: cabecalho padrao de programas Escola/Financeiro
- Contexto: necessidade de consolidar no Financeiro o mesmo cabecalho azul aprovado com botoes laterais, logotipo da escola e bloco do usuario para reaproveitamento controlado tela por tela
- Alteracao: registro oficial do padrao de cabecalho no mapa tecnico e na documentacao de UI do projeto Financeiro
- Componentes/Telas:
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0003

- Data: 2026-05-07
- Padrao: toolbar padrao de grid Escola/Financeiro
- Contexto: necessidade de oficializar no Financeiro o segundo padrao de tela para paginas com grid/lista, separado do cabecalho principal
- Alteracao: registro do padrao de toolbar de grid com botao `COLUNAS`, botao de exportacao/impressao, contador de registros, ausencia de faixa explicativa e posicao compacta do botao de incluir na linha da busca
- Componentes/Telas:
  - `frontend/src/app/lib/ui-standards.ts`
  - `frontend/src/app/lib/grid-page-standards.ts`
- `DOCUMENTACAO/AI/UI_PATTERNS.md`
- `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0004

- Data: 2026-05-13
- Padrao: consolidacao final do cabecalho do Financeiro com referencia soberana da Escola
- Contexto: durante a validacao cruzada entre `PRINCIPAL_PROFESSORES` da Escola e `PRINCIPAL_MENSALIDADES`, foi confirmado que o trecho final correto do cabecalho e o mesmo bloco direito com card branco do usuario e botao `VOLTAR` encaixados dentro da faixa azul
- Alteracao: o projeto `Financeiro` passa a registrar explicitamente a tela `PRINCIPAL_PROFESSORES` do sistema Escola como referencia soberana do lado direito do cabecalho, com rollout manual e nunca automatico nas telas existentes do Financeiro
- Componentes/Telas:
  - `frontend/src/app/layout.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `DOCUMENTACAO/AI/DECISIONS.md`
- Status: aprovado

### UIP-0005

- Data: 2026-05-14
- Padrao: tela do Financeiro embutida na vertical consumidora com identificacao unica
- Contexto: na validacao das telas `PRINCIPAL_FINANCEIRO_BANCOS` e `PRINCIPAL_FINANCEIRO_RESUMO`, foi aprovado que telas do `Financeiro` abertas dentro da `Escola` devem preservar a barra lateral azul e a moldura da vertical hospedeira, sem abrir pagina cheia e sem duplicar nome tecnico visivel
- Alteracao: registro oficial da regra de integracao visual embutida, com nome tecnico unico na interface e ocultacao do identificador interno do `Financeiro` quando a tela estiver em modo embutido
- Componentes/Telas:
  - `frontend/src/app/components/financeiro-resumo-page.tsx`
  - `frontend/src/app/bancos/page.tsx`
  - `frontend/src/app/lib/runtime-context.ts`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/CODING_RULES.md`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0006

- Data: 2026-05-15
- Padrao: popup/modal com logotipo, identificador exclusivo e auditoria SQL obrigatorios desde a criacao
- Contexto: necessidade de consolidar no `Financeiro` que todo novo popup ja nasca com o mesmo padrao aprovado de identidade visual e rastreabilidade tecnica
- Alteracao: registro oficial da obrigatoriedade de logotipo no cabecalho, nome tecnico exclusivo, bloco `Tela:` isolado no rodape e abertura da logica usada com SQL/base logica, tabelas, relacionamentos, filtros e ordenacao
- Componentes/Telas:
  - `frontend/src/app/components/screen-name-copy.tsx`
  - `frontend/src/app/components/screen-audit-modal.tsx`
  - `frontend/src/app/lib/ui-standards.ts`
  - `frontend/src/app/contas-a-pagar/importacao-notas/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/CODING_RULES.md`
- Status: aprovado

### UIP-0007

- Data: 2026-05-18
- Padrao: sem faixa azul interna duplicada em telas com grid/lista
- Contexto: foi aprovado que novas telas com grid/lista nao devem repetir abaixo do cabecalho principal uma segunda faixa com eyebrow, titulo, descricao e botao de voltar/menu, pois isso duplica a identificacao da tela
- Alteracao: reforco do PAT-015 para que telas com grid/lista abram direto na barra operacional da listagem e no grid; explicacoes adicionais devem aguardar o local especifico indicado pelo usuario
- Componentes/Telas:
  - `frontend/src/app/produtos/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-0008

- Data: 2026-05-18
- Padrao: identificador unico e exclusivo por tela
- Contexto: na validacao da tela `PRINCIPAL_FINANCEIRO_ESTOQUE`, foi identificado que o grid interno de produtos exibia um segundo nome tecnico (`FINANCEIRO_PRODUTOS_LISTAGEM_GERAL`) alem do identificador da tela hospedeira
- Alteracao: telas novas devem ter apenas um nome tecnico visivel por vez; esse nome deve ser exclusivo da tela, e identificadores internos do Financeiro devem ficar ocultos quando a tela estiver embutida em uma vertical consumidora
- Componentes/Telas:
  - `frontend/src/app/produtos/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-0009

- Data: 2026-05-23
- Padrao: auditoria SQL em abas e com parametros reais
- Contexto: a validacao da `PRINCIPAL_PROFESSORES` no sistema Escola consolidou um padrao compartilhado para Escola e Financeiro: separar informacoes funcionais do SQL executavel e mostrar os filtros atuais da tela
- Alteracao: a auditoria visual deve abrir na aba `Outras informações` e manter uma aba `SQL` separada contendo somente a consulta copiavel; parametros como `companyId`/`tenantId`, `branchCode`, status, periodo, busca e demais filtros visiveis devem vir preenchidos com valores reais sempre que possivel
- Regra complementar: nomes humanos de apoio, como nome da empresa, escola consumidora ou filial, ficam apenas na aba de informacoes; o SQL deve permanecer executavel
- Componentes/Telas:
  - `frontend/src/app/components/screen-name-copy.tsx`
  - `frontend/src/app/components/screen-audit-modal.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/CODING_RULES.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0010

- Data: 2026-05-23
- Padrao: layout do modal de auditoria SQL com abas no cabecalho
- Contexto: o padrao aprovado na `PRINCIPAL_PROFESSORES` da Escola tambem passa a ser o modelo oficial do `Financeiro` para manter a auditoria SQL visualmente igual nos dois sistemas
- Alteracao: o cabecalho do modal passa a concentrar logotipo, etiqueta `Auditoria SQL`, identificador tecnico, origem do sistema, abas centrais e botoes `Fechar`/`Copiar SQL` a direita; `Copiar SQL` aparece somente na aba `SQL` e nao ha botoes duplicados no rodape
- Componentes/Telas:
  - `frontend/src/app/components/screen-audit-modal.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/CODING_RULES.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0011

- Data: 2026-05-28
- Padrao: filtros diretos nas colunas do grid com limpeza global
- Contexto: na validacao da tela `PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO`, foi aprovado o uso de filtros diretamente no cabecalho das colunas do grid
- Alteracao: quando o usuario pedir filtros direto nas colunas, cada coluna solicitada deve receber uma lupa no cabecalho e painel compacto de filtro; sempre deve existir tambem um botao iconico no lado esquerdo do cabecalho do grid para `Limpar todos os filtros`, zerando todos os filtros e fechando paineis abertos
- Componentes/Telas:
  - `frontend/src/app/bancos/extrato/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado
