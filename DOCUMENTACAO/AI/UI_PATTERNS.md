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
- em telas operacionais com grid embutido que precisam maximizar area util, pode existir variante compacta aprovada do cabecalho:
  - altura menor que o cabecalho padrao completo
  - mesmos elementos obrigatorios: botoes laterais, logotipo, `eyebrow`, titulo, descricao curta, card do usuario e `VOLTAR`
  - o card do usuario e o botao `VOLTAR` devem continuar totalmente dentro da faixa azul, sem ultrapassar o bloco
  - referencia aprovada: `PRINCIPAL_FINANCEIRO_PARCELAS`
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
  - esquerda: botao iconico de colunas seguido do botao de `EXPORTACAO/IMPRESSAO`
  - centro: controles operacionais visuais da listagem, como semaforo horizontal, toggles ou filtros de status
  - direita: contador institucional de registros exibidos
- o contador da direita deve manter leitura forte em uppercase, no estilo `REGISTROS EXIBIDOS (N)`
- o botao de colunas deve ser somente iconico, sem texto visivel, com tooltip e `aria-label` exatamente `ALTERAR COLUNAS GRID`
- o icone do botao de colunas deve representar colunas verticais dentro de um retangulo, mantendo botao compacto quadrado/arredondado
- a exportacao e a impressao da tela com grid devem ficar concentradas apenas no botao ao lado do botao de colunas
- quando a toolbar padrao estiver presente, o botao textual separado `EXPORTAR` no topo da tela deixa de ser necessario e deve ser removido para evitar duplicidade funcional
- telas com grid/lista nao devem exibir faixa explicativa contextual entre o cabecalho principal e a area da listagem
- telas com grid/lista nao devem criar uma segunda faixa azul interna repetindo `eyebrow`, titulo, descricao ou botao de voltar/menu logo abaixo do cabecalho principal
- a tela deve abrir direto na barra operacional da listagem e no grid; qualquer explicacao adicional sobre a finalidade da tela deve aguardar o local especifico aprovado pelo usuario
- quando a tela tiver acao de incluir/cadastrar novo registro, esse botao deve ficar no canto esquerdo da area da listagem/grid
- a posicao aprovada para essa acao e como primeira informacao visual da linha de acoes acima do grid, antes de titulo, contador, busca ou qualquer acao secundaria
- o botao de incluir deve preferir formato compacto, mostrando apenas o icone `+`, com tooltip explicando a acao de cadastro
- a barra deve funcionar como segundo padrao oficial compartilhado entre Escola e Financeiro
- o uso continua manual, tela por tela, e nunca deve ser aplicado em paginas sem listagem
- a toolbar pode variar nas acoes especificas da tela, mas deve preservar a distribuicao visual esquerda/centro/direita aprovada

### PAT-015.1 - Filtros diretos nas colunas do grid

- quando o usuario pedir "filtros direto nas colunas do grid", aplicar este padrao apenas nas colunas informadas no pedido
- o filtro deve aparecer no proprio cabecalho da coluna, ao lado do nome da coluna, preferencialmente como icone de lupa com tooltip `Filtrar <coluna>`
- ao clicar na lupa, abrir um painel compacto proximo ao cabecalho da coluna, sem criar faixa adicional acima do grid
- o painel nao deve sobrepor incoerentemente a primeira linha do grid nem a toolbar/rodape; quando necessario, reservar espaco interno temporario no grid enquanto o painel estiver aberto
- tipos de filtro aprovados:
  - data/periodo: campos `De` e `Ate`
  - texto, historico, documento ou nome: campo de busca textual
  - status, tipo ou categoria fechada: seletor com `TODOS` e opcoes da coluna
  - valor numerico/monetario: campos de valor minimo e valor maximo
- sempre que a coluna filtrada representar uma data, o filtro deve obrigatoriamente ser por periodo, exibindo os campos `De` e `Ate`, mesmo que o pedido do usuario diga apenas "filtrar a data"
- filtros textuais em coluna devem usar rascunho local: digitar no campo nao aplica automaticamente
- filtros textuais em coluna devem ter botao `Filtrar`; ao clicar, aplicar o valor, atualizar o grid e fechar o painel
- pressionar `Enter` dentro do campo textual equivale a clicar em `Filtrar`
- para filtros fechados com poucas opcoes, preferir botoes/pills em vez de select quando o usuario aprovar esse modelo visual
- os botoes/pills do mesmo painel devem ter exatamente a mesma largura, texto centralizado e alinhamento central no popup
- o botao/pill equivalente a `TODOS` deve usar o texto `AMBOS` quando o usuario pedir essa linguagem para o contexto da tela
- cores aprovadas para botoes/pills de filtro:
  - debito: vermelho/rose
  - credito: verde/emerald
  - pendente/nao conferido: amarelo/amber ou vermelho/rose quando o usuario pedir destaque de nao conferido
  - conciliado/conferido: verde/emerald
  - ambos/todos: azul/blue
- quando houver acoes em lote dentro do painel de filtro, como `Marcar todos como conferidos` ou `Marcar todos como nao conferidos`, elas devem respeitar somente os registros exibidos no grid naquele momento, incluindo filtros ativos
- cada painel deve ter acao local `Limpar` para zerar somente o filtro daquela coluna e fechar o painel
- sempre que houver filtro direto em coluna, deve existir tambem um botao iconico para limpar todos os filtros de uma vez
- a posicao aprovada para `Limpar todos os filtros` e no lado esquerdo do cabecalho do grid, obrigatoriamente como a primeira informacao visual do cabecalho, antes da primeira coluna filtravel
- o botao de limpar todos deve ser iconico, ter tooltip/aria-label `Limpar todos os filtros`, zerar todos os filtros do grid e fechar qualquer painel aberto
- o botao de limpar todos deve ter estado visual discreto quando nenhum filtro estiver ativo e ganhar destaque vermelho/rose quando existir um ou mais filtros/ordenacoes ativos
- os filtros devem responder na hora quando forem filtros locais; se a tela exigir consulta no backend, preservar tenant/RBAC e atualizar tambem a auditoria SQL da tela
- nao adicionar filtros em colunas nao solicitadas pelo usuario no prompt atual
- nao alterar layout aprovado da tela alem do menor ajuste necessario no cabecalho do grid

Referencia aprovada:

- `PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO`
- filtros `Conf.`, `Tipo` e `Situacao` da tela `PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO`
- `PRINCIPAL_FINANCEIRO_ESTOQUE`
- filtros `Produto` e `Código interno` da tela `PRINCIPAL_FINANCEIRO_ESTOQUE`

### PAT-015.2 - Grid com rolagem interna, cabecalho fixo e rodape paginado

- este modelo deve ser usado quando a tela possuir grid/listagem operacional com paginacao e volume suficiente para rolagem interna
- referencias aprovadas:
  - `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS`
  - `PRINCIPAL_FINANCEIRO_RETORNOS`
  - `PRINCIPAL_FINANCEIRO_PARCELAS`
- a barra de rolagem vertical deve ficar dentro do grid; a pagina/tela externa nao deve ganhar uma segunda rolagem para percorrer os registros
- a rolagem deve mover apenas os registros do corpo da tabela
- o cabecalho das colunas deve permanecer fixo no topo do grid durante a rolagem dos registros
- o cabecalho fixo deve manter fundo solido e camada acima das linhas para nao misturar texto de coluna com conteudo rolado
- as linhas do corpo do grid devem ser zebradas com contraste perceptivel:
  - linhas pares ativas: fundo branco
  - linhas impares ativas: fundo `slate-200/70` ou contraste visual equivalente
  - linhas pares inativas: fundo `rose-100/80`
  - linhas impares inativas: fundo `rose-200/70`
  - o hover pode intensificar um nivel, sem remover a leitura do zebrado
- ao clicar em uma linha do grid, ela deve ficar destacada ate outra linha ser selecionada:
  - o destaque deve sobrepor temporariamente o zebrado
  - usar fundo azul claro e contorno azul perceptivel, como `bg-blue-100` com `outline-blue-400`
  - marcar a linha com `aria-selected` quando houver suporte na implementacao
- quando houver filtros por coluna, o filtro deve ficar no proprio cabecalho da coluna, seguindo `PAT-015.1`
- o botao iconico `Limpar todos os filtros` deve ser sempre a primeira informacao visual do cabecalho do grid, no canto esquerdo, antes da primeira coluna filtravel
- quando houver acao de incluir/cadastrar registro, o botao de incluir deve ficar na faixa de acoes acima do grid, no canto esquerdo, como primeira informacao visual da tela com grid; o cabecalho interno da tabela continua preservando `Limpar todos os filtros` como primeiro item quando existirem filtros por coluna
- o titulo acima do grid deve ser compacto; quando houver total importante para a operacao, mostrar esse total em pill ao lado do titulo, sem texto descritivo longo abaixo
- existem dois modelos oficiais para o final do grid:
  - modelo sem totais agregados: nao exibir faixa azul final; usar somente o rodape em linha unica com `Colunas`, impressao/exportacao, semaforo/status, `Total registros: N`, quantidade por pagina e navegacao
  - modelo com totais agregados: exibir uma faixa azul fixa no fim do grid, acima do rodape, somente quando pelo menos uma coluna precisar de somatorio/totalizacao operacional
- o rodape final do grid, com ou sem faixa azul de totais, deve permanecer sempre visivel na area util da tela; o usuario nao deve precisar rolar a pagina externa ou a casca hospedeira para enxergar botao de colunas, impressao/exportacao, semaforo/status, totais, quantidade por pagina, navegacao ou identificador tecnico
- a rolagem vertical deve ficar somente na area interna de registros do grid; em telas embutidas por iframe, a casca hospedeira deve ajustar a altura do iframe para caber na area disponivel e evitar uma segunda barra lateral fora do grid
- a estrutura aprovada para isso e: card do grid em coluna flexivel, toolbar superior e rodape com `shrink-0`, area de registros com `min-h-0` e `overflow-auto`, e casca hospedeira/iframe sem rolagem vertical externa
- contar registros sozinho nao caracteriza totalizacao de coluna e nao deve criar faixa azul
- em grids sem totais agregados, o contador `Total registros: N` deve ficar no rodape, ao lado do semaforo/status e antes dos controles de paginacao
- quando o grid tiver totais agregados no final da tabela, a linha final de totais deve ficar no fim do grid, fixa durante a rolagem interna dos registros e alinhada pelas mesmas colunas do grid
- a linha final de totais aprovada deve usar a mesma cor azul institucional do cabecalho financeiro:
  - fundo `#1d4f91`
  - borda superior `#153a6a`
  - celulas compactas com `px-4` e `py-1.5`
  - fonte compacta `text-[11px]`, `font-bold`, `uppercase` e `tracking-wider`
  - valores em branco (`text-white`)
  - sem criar rolagem externa na tela/pagina
- nessa linha final de totais, o contador `Total registros: N` deve aparecer no canto esquerdo em pill branco baixo:
  - `h-6`, `rounded-full`, `border-slate-200`, `bg-white`, `px-3`, `text-[9px]`, `font-black`, `uppercase`, `tracking-[0.12em]`, `text-slate-700` e `shadow-sm`
- em grids com totais agregados, nao duplicar `Total registros: N` no rodape; o contador fica somente na pill branca da linha azul
- o rodape do grid deve ficar em uma unica linha sempre que houver largura disponivel
- no lado esquerdo do rodape devem ficar, nesta ordem:
  - botao iconico de colunas, sem texto visivel, com tooltip/aria-label `ALTERAR COLUNAS GRID`
  - botao de impressao/exportacao
  - semaforo/status da listagem, como `ATIVOS`, `INATIVOS` e `AMBOS`, ou o equivalente aprovado para a tela
- o semaforo/status deve ficar ao lado do botao de impressao/exportacao, na mesma linha
- no canto direito do rodape devem ficar, na mesma linha:
  - combobox compacto de quantidade de registros por pagina, com opcoes como `10`, `20`, `50` e `100`
  - navegacao compacta de paginas com `<<`, `<`, indicador `pagina/total`, `>` e `>>`
- ao abrir qualquer tela com grid paginado, o combobox de quantidade por pagina deve iniciar obrigatoriamente em `10`
- `<<` volta para o inicio, `<` volta uma pagina, `>` avanca uma pagina e `>>` vai para o fim
- neste modelo nao exibir texto de intervalo como `1-10 de 100 registro(s)` no rodape; o rodape deve priorizar controles compactos
- acoes de linha no grid devem usar botoes iconicos, sem texto visivel dentro do botao; cada botao deve ter `title`/tooltip e `aria-label` explicando claramente a acao, como alterar, excluir, ativar, definir padrao, visualizar ou abrir detalhes
- quando a situacao ativa/inativa precisar aparecer na linha do grid, usar somente uma bolinha antes da descricao principal do registro, sem texto visivel de status:
  - bolinha verde = `ATIVO`
  - bolinha vermelha = `INATIVO`
  - a bolinha deve ter `title`/tooltip e `aria-label` com `ATIVO` ou `INATIVO`
  - nao criar coluna com titulo `Semaforo` nem pill textual `ATIVO`/`INATIVO` na linha
- preservar os botoes e controles ja aprovados da tela, alterando apenas a estrutura necessaria para cumprir este padrao

### PAT-016 - Tela do Financeiro embutida na vertical consumidora

- quando uma tela do `Financeiro` for aberta dentro da `Escola` ou de outra vertical consumidora, o layout principal visivel deve continuar sendo da vertical consumidora
- a barra lateral azul, o cabecalho institucional e o rodape tecnico devem permanecer na casca da vertical hospedeira
- a tela interna do `Financeiro` deve ocupar apenas a area central embutida, sem promover redirecionamento para pagina cheia por padrao
- em modo embutido, o `Financeiro` nao deve repetir cabecalho principal proprio nem faixa contextual secundaria se isso gerar segunda camada visual concorrente
- em modo embutido, o `Financeiro` nao deve exibir um segundo nome tecnico visivel da tela
- o unico nome tecnico visivel deve ser o da vertical consumidora, por exemplo `PRINCIPAL_FINANCEIRO_RESUMO`
- toda tela nova deve ter apenas um nome tecnico visivel por vez
- o nome tecnico de tela deve ser exclusivo, estavel e nao reutilizado em outra tela, rota, popup ou fluxo visual
- se uma tela interna do `Financeiro` for aberta dentro de uma tela da vertical consumidora, o identificador interno deve ficar oculto para nao duplicar o nome visivel
- o identificador interno do `Financeiro` pode continuar existindo no codigo, em auditoria e em integracoes, mas deve ficar oculto na interface embutida
- a tela `PRINCIPAL_FINANCEIRO_BANCOS` passa a ser a referencia funcional soberana desse comportamento de integracao visual
- a tela `PRINCIPAL_FINANCEIRO_RESUMO` alinhada ao mesmo comportamento passa a ser a referencia de regra para ocultacao do identificador interno em modo embutido

Arquivos de referencia tecnica no Financeiro:

- `frontend/src/app/components/financeiro-resumo-page.tsx`
- `frontend/src/app/bancos/page.tsx`
- `frontend/src/app/lib/runtime-context.ts`

### PAT-017 - Popup/modal com logotipo, identificador exclusivo e auditoria SQL

- todo novo popup/modal do `Financeiro` deve nascer por padrao com logotipo institucional no cabecalho
- o mesmo padrao e compartilhado com a `Escola`: o logotipo institucional no cabecalho e obrigatorio em todo popup/modal quando houver contexto de escola/empresa
- quando o popup tambem exibir foto, avatar ou icone do registro, o logotipo institucional continua obrigatorio e deve permanecer separado do avatar do registro
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
- a referencia visual aprovada para a auditoria SQL compartilhada com a Escola e a tela `PRINCIPAL_PROFESSORES`
- o cabecalho do modal de auditoria deve concentrar os controles principais:
  - esquerda: logotipo institucional, etiqueta `Auditoria SQL`, identificador tecnico e pill `ORIGEM: SISTEMA ...`
  - centro: seletor de abas `Outras informações` / `SQL`
  - direita: botoes textuais `Fechar` e `Copiar SQL` com o mesmo tamanho
- o botao `Copiar SQL` deve aparecer somente quando a aba `SQL` estiver ativa
- os botoes de acao nao devem ser repetidos no rodape do modal
- o path/origem tecnica do arquivo deve ficar abaixo do cabecalho em pill vermelha centralizada
- a auditoria SQL deve ser separada em duas abas:
  - `Outras informações`, aberta por padrao, com origem, tabelas, relacionamentos, metricas/campos exibidos, filtros aplicados, ordenacao e observacoes
  - `SQL`, contendo exclusivamente a consulta SQL/base logica copiavel
- o botao `Copiar SQL` deve copiar somente o conteudo da aba `SQL`
- a aba `SQL` deve refletir os filtros atuais da tela/listagem no momento da abertura, com valores reais para parametros como `companyId`/`tenantId`, `branchCode`, status, periodo, busca digitada e demais filtros visiveis
- nomes humanos de apoio, como nome da empresa, escola consumidora ou filial, devem aparecer apenas em `Outras informações`, entre parenteses ao lado do identificador tecnico, sem alterar a SQL executavel
- quando uma tela do `Financeiro` estiver embutida na `Escola`, a auditoria deve respeitar o contexto da vertical hospedeira e manter a consulta executavel para a origem real dos dados financeiros

Arquivos de referencia tecnica no Financeiro:

- `frontend/src/app/components/screen-name-copy.tsx`
- `frontend/src/app/components/screen-audit-modal.tsx`
- `frontend/src/app/lib/grid-page-standards.ts`
- `frontend/src/app/contas-a-pagar/importacao-notas/page.tsx`
