# UI_PATTERNS

## Objetivo

Centralizar os padroes visuais e funcionais aprovados no projeto `Financeiro`.

## Regra de manutencao

Todo padrao novo aprovado deve atualizar, no mesmo ciclo:

1. este arquivo
2. `UI_PATTERN_CHANGELOG.md`
3. o componente compartilhado correspondente, quando existir
4. `frontend/src/app/lib/ui-standards.ts`, quando o padrao entrar no mapa tecnico

## Padroes oficiais atuais

### PAT-014 - Cabecalho padrao de programas Escola e Financeiro

- faixa principal em degrade azul com cantos arredondados
- cabecalho rola junto com a pagina e nao deve ficar fixo no topo
- coluna lateral esquerda com:
  - botao de menu
  - botao secundario da tela, normalmente notificacoes
- logotipo da escola imediatamente ao lado da coluna de botoes
- bloco textual com:
  - `eyebrow` em uppercase
  - titulo forte
  - descricao curta
- lado direito reservado para:
  - card branco do usuario
  - botao `VOLTAR`
- o lado direito deve ficar encaixado dentro da faixa azul, sem ultrapassar o bloco
- a reserva horizontal padrao do cabecalho deve proteger o lado direito antes da area textual, evitando sobreposicao com titulo e descricao
- a posicao vertical do bloco da direita deve ficar mais baixa que o topo do header, respeitando o encaixe visual aprovado
- o componente compartilhado deve permitir reaproveitamento manual tela por tela, sem rollout automatico
- o mesmo padrao base pode ser usado na Escola e no Financeiro, mudando apenas os textos e o estado dos botoes
- o card branco do usuario no lado direito e obrigatorio nas telas que usam esse padrao, com:
  - nome do usuario em destaque
  - perfil logo abaixo em texto menor
  - avatar circular com iniciais
  - seta de menu no extremo direito
- o botao `VOLTAR` deve ficar abaixo do card do usuario, alinhado a direita e dentro da mesma faixa azul
- o conjunto `card do usuario + VOLTAR` deve repetir o encaixe visual aprovado na `PRINCIPAL_PROFESSORES` do sistema Escola
- esse mesmo encaixe passa a ser a referencia soberana do lado direito para o projeto `Financeiro`
- nenhuma tela existente do `Financeiro` deve ser alterada em lote por causa desse padrao:
  - a aplicacao deve acontecer manualmente
  - tela por tela
  - somente apos validacao explicita do usuario
- sempre que houver divergencia entre implementacao local e esse padrao, a referencia soberana passa a ser:
  - `C:\Sistemas\IA\Escola\frontend\src\app\components\principal-program-header.tsx`
  - `C:\Sistemas\IA\Escola\frontend\src\app\principal\layout.tsx`
  - validacao visual aprovada em `PRINCIPAL_PROFESSORES`

Arquivos de referencia tecnica no Financeiro:

- `frontend/src/app/layout.tsx`
- `frontend/src/app/lib/ui-standards.ts`

### PAT-015 - Toolbar padrao de grid Escola e Financeiro

- este padrao nao substitui o cabecalho principal azul da tela
- ele so pode ser usado em telas que possuem grid, lista ou tabela operacional
- deve ser tratado como barra operacional da listagem
- estrutura aprovada:
  - esquerda: botao `COLUNAS` seguido do botao de `EXPORTACAO/IMPRESSAO`
  - centro: controles operacionais visuais da listagem, como semaforo horizontal, toggles ou filtros de status
  - direita: contador institucional de registros exibidos
- o contador da direita deve manter leitura forte em uppercase, no estilo `REGISTROS EXIBIDOS (N)`
- a exportacao e a impressao da tela com grid devem ficar concentradas apenas no botao ao lado de `COLUNAS`
- quando a toolbar padrao estiver presente, o botao textual separado `EXPORTAR` no topo da tela deixa de ser necessario e deve ser removido para evitar duplicidade funcional
- telas com grid/lista nao devem exibir faixa explicativa contextual entre o cabecalho principal e a area da listagem
- quando a tela tiver acao de incluir/cadastrar novo registro, esse botao deve ficar na mesma linha da busca
- a posicao aprovada para essa acao e no lado esquerdo do campo de busca, como primeiro elemento da linha
- o botao de incluir deve preferir formato compacto, mostrando apenas o icone `+`, com tooltip explicando a acao de cadastro
- a barra deve funcionar como segundo padrao oficial compartilhado entre Escola e Financeiro
- o uso continua manual, tela por tela, e nunca deve ser aplicado em paginas sem listagem
- a toolbar pode variar nas acoes especificas da tela, mas deve preservar a distribuicao visual esquerda/centro/direita aprovada

### PAT-016 - Tela do Financeiro embutida na vertical consumidora

- quando uma tela do `Financeiro` for aberta dentro da `Escola` ou de outra vertical consumidora, o layout principal visivel deve continuar sendo da vertical consumidora
- a barra lateral azul, o cabecalho institucional e o rodape tecnico devem permanecer na casca da vertical hospedeira
- a tela interna do `Financeiro` deve ocupar apenas a area central embutida, sem promover redirecionamento para pagina cheia por padrao
- em modo embutido, o `Financeiro` nao deve repetir cabecalho principal proprio nem faixa contextual secundaria se isso gerar segunda camada visual concorrente
- em modo embutido, o `Financeiro` nao deve exibir um segundo nome tecnico visivel da tela
- o unico nome tecnico visivel deve ser o da vertical consumidora, por exemplo `PRINCIPAL_FINANCEIRO_RESUMO`
- o identificador interno do `Financeiro` pode continuar existindo no codigo, em auditoria e em integracoes, mas deve ficar oculto na interface embutida
- a tela `PRINCIPAL_FINANCEIRO_BANCOS` passa a ser a referencia funcional soberana desse comportamento de integracao visual
- a tela `PRINCIPAL_FINANCEIRO_RESUMO` alinhada ao mesmo comportamento passa a ser a referencia de regra para ocultacao do identificador interno em modo embutido

Arquivos de referencia tecnica no Financeiro:

- `frontend/src/app/components/financeiro-resumo-page.tsx`
- `frontend/src/app/bancos/page.tsx`
- `frontend/src/app/lib/runtime-context.ts`

### PAT-017 - Popup/modal com logotipo, identificador exclusivo e auditoria SQL

- todo novo popup/modal do `Financeiro` deve nascer por padrao com logotipo institucional no cabecalho
- o popup/modal deve ter um nome tecnico exclusivo, estavel e nao reutilizavel em outro fluxo visual
- o rodape deve reservar um bloco proprio para `Tela:` e para o identificador tecnico do popup
- o identificador deve reutilizar `ScreenNameCopy` ou o mesmo comportamento visual/funcional homologado
- ao acionar o bloco de copia/auditoria, deve abrir a logica usada na tela com:
  - origem do arquivo
  - tabelas envolvidas
  - relacionamentos
  - filtros
  - ordenacao
  - SQL/base logica correspondente
- o bloco do identificador nao deve disputar a mesma linha dos botoes principais do popup
- a regra vale tanto para popup aberto em tela cheia do `Financeiro` quanto para popup interno de uma tela embutida em outra vertical
- em tela embutida, continua valendo a regra de nao duplicar o identificador principal da vertical hospedeira no corpo da pagina; essa excecao nao impede o uso do identificador tecnico proprio dentro de popup interno do `Financeiro`

Arquivos de referencia tecnica no Financeiro:

- `frontend/src/app/components/screen-name-copy.tsx`
- `frontend/src/app/components/screen-audit-modal.tsx`
- `frontend/src/app/lib/grid-page-standards.ts`
- `frontend/src/app/contas-a-pagar/importacao-notas/page.tsx`
