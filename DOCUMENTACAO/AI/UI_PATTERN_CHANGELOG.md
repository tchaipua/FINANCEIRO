# UI_PATTERN_CHANGELOG

## Objetivo

Registrar a evolucao dos padroes visuais e funcionais aprovados no projeto `Financeiro`.

### UIP-2026-06-05-01

- Data: 2026-06-05
- Padrao: botao iconico de colunas no rodape do grid
- Contexto: padronizacao solicitada para todas as telas da Escola e do Financeiro com botao de colunas no rodape/grid
- Alteracao: o botao de colunas passa a ser somente iconico, sem texto visivel, com tooltip e `aria-label` `ALTERAR COLUNAS GRID`
- Componentes/Telas:
  - `frontend/src/app/components/grid-standard-footer.tsx`
  - telas com botao manual de colunas
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
- Status: aprovado

### UIP-2026-06-03-01

- Data: 2026-06-03
- Padrao: filtro de coluna de data sempre por periodo
- Contexto: manutencao da tela `PRINCIPAL_FINANCEIRO_PARCELAS` e padronizacao dos filtros diretos em colunas de grid
- Alteracao: toda coluna que represente data deve abrir filtro por periodo, com campos `De` e `Ate`, mesmo quando o pedido mencionar apenas filtro de data
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `frontend/src/app/recebiveis/parcelas/page.tsx`
- Status: aprovado

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

### UIP-0012

- Data: 2026-05-29
- Padrao: filtros de coluna com botoes/pills centralizados e largura uniforme
- Contexto: na tela `PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO`, foi aprovado que filtros fechados no cabecalho do grid, como `Conf.`, `Tipo` e `Situacao`, devem usar botoes/pills coloridos em vez de select quando esse modelo for solicitado
- Alteracao: os botoes/pills do painel devem ficar centralizados, com o mesmo tamanho, texto centralizado e cores por semantica; `AMBOS` deve ser azul quando usado como opcao geral; acoes em lote no painel devem atuar somente sobre os registros exibidos no grid no momento
- Componentes/Telas:
  - `frontend/src/app/bancos/extrato/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0013

- Data: 2026-06-01
- Padrao: filtros textuais de coluna com botao `Filtrar` e fechamento automatico
- Contexto: na validacao da tela `PRINCIPAL_FINANCEIRO_ESTOQUE`, foi aprovado que filtros textuais por coluna nao devem aplicar enquanto o usuario digita; a telinha deve aplicar somente pelo botao `Filtrar` ou Enter e fechar em seguida
- Alteracao: o PAT-015.1 passa a exigir rascunho local para filtro textual, botao `Filtrar`, fechamento automatico apos aplicar, fechamento ao limpar a coluna, destaque vermelho/rose no limpar filtros global quando houver filtro/ordenacao ativa, reserva de espaco para o painel nao sobrepor grid ou toolbar e `Limpar todos os filtros` como primeira informacao visual do cabecalho do grid
- Componentes/Telas:
  - `frontend/src/app/produtos/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0014

- Data: 2026-06-02
- Padrao: grid com rolagem interna, cabecalho fixo e rodape paginado
- Contexto: na validacao da tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS`, foi aprovado um modelo completo para telas com grid paginado, mantendo a rolagem apenas nos registros e preservando cabecalho/rodape do grid sempre visiveis
- Alteracao: criado o `PAT-015.2` com barra de rolagem dentro do grid, cabecalho de colunas fixo, filtros por coluna com `Limpar todos os filtros` como primeiro botao do cabecalho, rodape em linha unica com `Colunas`, impressao/exportacao, semaforo/status, combobox `10/20/50/100` e navegacao `<< < pagina/total > >>`
- Componentes/Telas:
  - `frontend/src/app/contas-a-pagar/importacao-notas/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0015

- Data: 2026-06-02
- Padrao: botoes iconicos de acao em linhas de grid
- Contexto: na tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS`, foi aprovado que botoes de acao de linha nao devem usar texto visivel quando houver icone claro para a acao
- Alteracao: o `PAT-015.2` passa a registrar que acoes de linha em grid devem usar botoes iconicos, sem texto dentro do botao, sempre com `title`/tooltip e `aria-label` explicando a acao, como alterar, excluir, ativar, definir padrao, visualizar ou abrir detalhes
- Componentes/Telas:
  - `frontend/src/app/contas-a-pagar/certificados-digitais/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0016

- Data: 2026-06-02
- Padrao: status ativo/inativo por bolinha na linha do grid
- Contexto: na tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS`, foi aprovado que a situacao do registro nao deve aparecer como coluna `Semaforo` nem como pill textual `ATIVO`/`INATIVO`
- Alteracao: o `PAT-015.2` passa a registrar que status ativo/inativo em linhas de grid deve usar somente uma bolinha antes da descricao principal; verde representa `ATIVO`, vermelho representa `INATIVO`, sempre com `title`/tooltip e `aria-label`
- Componentes/Telas:
  - `frontend/src/app/contas-a-pagar/certificados-digitais/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0017

- Data: 2026-06-02
- Padrao: botao de incluir como primeira informacao em telas com grid
- Contexto: na tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS`, foi aprovado que a acao de incluir deve ficar sempre no canto esquerdo da area de grid
- Alteracao: o `PAT-015.2` passa a registrar que, quando houver acao de incluir/cadastrar em tela com grid, o botao deve ficar na faixa de acoes acima do grid, no canto esquerdo, como primeira informacao visual antes de titulo, contador, busca ou acoes secundarias
- Componentes/Telas:
  - `frontend/src/app/contas-a-pagar/certificados-digitais/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0018

- Data: 2026-06-02
- Padrao: grid zebrado com contraste perceptivel
- Contexto: na tela `PRINCIPAL_PROFESSORES`, foi aprovado que as linhas do grid precisam ter zebrado mais destacado
- Alteracao: o `PAT-015.2` passa a registrar zebrado com contraste perceptivel no corpo do grid: linhas pares ativas brancas, linhas impares ativas em `slate-200/70` ou equivalente, inativas em tons rose mais fortes e hover um nivel acima sem perder a leitura do zebrado
- Componentes/Telas:
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0019

- Data: 2026-06-02
- Padrao: destaque persistente da linha clicada no grid
- Contexto: na tela `PRINCIPAL_PROFESSORES`, foi aprovado que ao clicar em uma linha do grid ela deve ficar destacada
- Alteracao: o `PAT-015.2` passa a registrar que a linha clicada deve permanecer destacada ate outra linha ser selecionada, sobrepondo temporariamente o zebrado com fundo azul claro, contorno azul perceptivel e `aria-selected` quando houver suporte
- Componentes/Telas:
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0020

- Data: 2026-06-02
- Padrao: total de registros no rodape do grid
- Contexto: na tela `PRINCIPAL_PROFESSORES`, foi aprovado que o total de registros deve aparecer no rodape ao lado do semaforo/status
- Alteracao: o `PAT-015.2` passa a registrar que o rodape do grid deve exibir `Total registros: N` ao lado do semaforo/status, antes dos controles de quantidade por pagina e navegacao
- Componentes/Telas:
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/professores/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0021

- Data: 2026-06-02
- Padrao: quantidade padrao de 10 registros por pagina no grid
- Contexto: foi aprovado que toda tela com grid deve abrir com o combobox de quantidade por pagina marcado em `10`
- Alteracao: o `PAT-015.2` passa a registrar que grids paginados devem iniciar obrigatoriamente com `10` registros por pagina, mantendo as opcoes `10`, `20`, `50` e `100`
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0022

- Data: 2026-06-02
- Padrao: logotipo institucional obrigatorio em cabecalho de popup Escola/Financeiro
- Contexto: na tela `PRINCIPAL_ALUNOS` da Escola, foi reforcado que todo popup deve manter o logotipo institucional no cabecalho, inclusive quando houver foto/avatar do registro.
- Alteracao: o `PAT-017` passa a registrar que, no `Financeiro`, o logotipo institucional e obrigatorio e nao pode ser substituido por avatar/foto/icone do registro; quando existir avatar do registro, ele deve ser adicional ao logotipo.
- Componentes/Telas:
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
  - `C:/Sistemas/IA/Escola/frontend/src/app/components/grid-record-popover.tsx`
- Status: aprovado

### UIP-0023

- Data: 2026-06-03
- Padrao: totais finais do grid em azul com contador em pill branco
- Contexto: na tela `PRINCIPAL_FINANCEIRO_RETORNOS`, foi aprovado que a linha final de totais do grid use o azul institucional `#1d4f91` e que `Total registros: N` apareca em pill branco no canto esquerdo.
- Alteracao: o `PAT-015.2` passa a registrar que grids com totais agregados devem manter a linha final fixa no fim do grid, alinhada pelas colunas, com borda `#153a6a`, valores em branco e contador `Total registros: N` no formato pill aprovado.
- Componentes/Telas:
  - `frontend/src/app/recebiveis/retornos/page.tsx`
  - `frontend/src/app/lib/grid-page-standards.ts`
  - `frontend/src/app/lib/ui-standards.ts`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0024

- Data: 2026-06-03
- Padrao: dois modelos de final de grid
- Contexto: foi aprovado que telas com grid podem ter final simples sem faixa azul quando nao houver coluna a totalizar, e final com faixa azul somente quando houver totais agregados por coluna.
- Alteracao: o `PAT-015.2` passa a registrar explicitamente que contar registros sozinho nao justifica a linha azul; grids sem totais agregados exibem `Total registros: N` apenas no rodape ao lado do semaforo/status, enquanto grids com totais por coluna exibem a faixa azul com contador em pill branco e valores alinhados, sem duplicar o contador no rodape.
- Componentes/Telas:
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/professores/page.tsx`
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/responsaveis/page.tsx`
  - `frontend/src/app/recebiveis/retornos/page.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0025

- Data: 2026-06-05
- Padrao: rodape do grid sempre visivel sem rolagem externa
- Contexto: na tela `PRINCIPAL_FINANCEIRO_PARCELAS`, foi aprovado que as informacoes finais do grid devem ficar sempre visiveis, sem exigir rolagem da pagina externa ou da casca hospedeira; a barra lateral vertical deve permanecer apenas dentro da area de registros do grid.
- Alteracao: o `PAT-015.2` passa a registrar que o rodape final do grid, com ou sem faixa azul de totais, deve permanecer visivel na area util da tela; em telas embutidas por iframe, a casca hospedeira deve ajustar a altura do iframe para evitar uma segunda barra lateral fora do grid.
- Componentes/Telas:
  - `frontend/src/app/recebiveis/parcelas/page.tsx`
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/financeiro/[section]/page.tsx`
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/layout.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado

### UIP-0026

- Data: 2026-06-05
- Padrao: cabecalho compacto e grid operacional sem rolagem externa
- Contexto: na tela `PRINCIPAL_FINANCEIRO_PARCELAS`, foi aprovado o conjunto visual compacto para telas operacionais com grid: cabecalho azul mais baixo, card do usuario e `VOLTAR` dentro da faixa azul, toolbar superior alinhada a esquerda, cabecalho do grid fixo, rodape sempre visivel e rolagem vertical apenas dentro da area de registros.
- Alteracao: `PAT-014` passa a registrar a variante compacta de cabecalho para telas com grid embutido; `PAT-015.2` passa a reforcar botao iconico de colunas com tooltip `CONFIGURAR COLUNAS DO GRID`, seletor/paginacao compactos, card do grid em coluna flexivel e ausencia de barra lateral externa.
- Componentes/Telas:
  - `frontend/src/app/recebiveis/parcelas/page.tsx`
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/financeiro/[section]/page.tsx`
  - `C:/Sistemas/IA/Escola/frontend/src/app/principal/layout.tsx`
  - `DOCUMENTACAO/AI/UI_PATTERNS.md`
  - `DOCUMENTACAO/AI/UI_PATTERN_CHANGELOG.md`
- Status: aprovado
