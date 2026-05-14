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
