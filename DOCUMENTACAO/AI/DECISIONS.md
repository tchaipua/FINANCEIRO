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
- para telas operacionais com grid embutido e necessidade de maximizar area util, fica aprovada a variante compacta validada em `PRINCIPAL_FINANCEIRO_PARCELAS`, preservando botoes laterais, logotipo, texto principal, card do usuario e `VOLTAR` totalmente dentro da faixa azul.

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

## D012 - Modelo compartilhado de tela com grid paginado

O `Financeiro` adota como referencia aprovada a tela `PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS` para telas com grid paginado.

Decisao:

- a rolagem vertical dos registros deve ficar dentro do grid;
- o cabecalho das colunas deve ficar fixo enquanto os registros rolam;
- as linhas do corpo do grid devem ser zebradas com contraste perceptivel;
- a linha clicada deve ficar destacada ate outra linha ser selecionada;
- filtros por coluna ficam no proprio cabecalho, com `Limpar todos os filtros` como primeiro botao a esquerda;
- quando a tela possuir acao de incluir/cadastrar, esse botao fica no canto esquerdo da area da listagem, como primeira informacao visual acima do grid;
- o final do grid possui dois modelos oficiais: sem totais agregados por coluna nao ha faixa azul e o rodape exibe botao iconico de colunas com tooltip `CONFIGURAR COLUNAS DO GRID`, impressao/exportacao, semaforo/status, contador de registros, combobox compacto de quantidade por pagina iniciado em `10` e navegacao compacta `<< < pagina/total > >>`;
- quando houver totais agregados por coluna, a faixa azul fica acima do rodape com `Total registros: N` em pill branco e valores alinhados nas colunas; o contador nao deve ser duplicado no rodape;
- contar registros sozinho nao justifica a faixa azul de totais;
- o rodape nao deve exibir texto de intervalo como `1-10 de 100 registro(s)`;
- o rodape final do grid deve permanecer sempre visivel, sem exigir rolagem da pagina externa ou da casca hospedeira; a barra lateral vertical deve ficar apenas dentro da area de registros do grid;
- a estrutura aprovada para manter o rodape visivel e: card do grid em coluna flexivel, toolbar superior e rodape com `shrink-0`, area de registros com `min-h-0` e `overflow-auto`, e casca hospedeira/iframe sem rolagem vertical externa;
- o detalhamento completo fica em `DOCUMENTACAO/AI/UI_PATTERNS.md`, `PAT-015.2`.

Motivo:

- aumentar a area util do grid;
- reduzir rolagem duplicada;
- manter Escola e Financeiro com o mesmo padrao operacional para telas de listagem.

## D013 - Logotipo obrigatorio em popup/modal

O `Financeiro` adota o mesmo reforco aprovado na Escola para identidade visual de popups.

Decisao:

- todo popup/modal do `Financeiro` deve manter logotipo institucional no cabecalho quando houver contexto de escola/empresa;
- foto, avatar ou icone do registro nao substitui o logotipo institucional;
- quando houver avatar do registro, ele deve aparecer como elemento adicional ao logotipo;
- a regra vale tambem para popups internos de telas financeiras embutidas na Escola.

Motivo:

- manter consistencia visual entre Escola e Financeiro;
- garantir que o usuario sempre reconheca a origem institucional do popup;
- evitar regressao em novos popups criados a partir de detalhes de registros.

## D014 - Ativacao segura da NFC-e por empresa

Decisao:

- a emissao fiscal pertence exclusivamente ao sistema `Financeiro`;
- o CNPJ do certificado A1 deve ser igual ao CNPJ da empresa emitente;
- a emissao automatica no fechamento da venda fica desativada ate existir NFC-e autorizada em homologacao para a mesma empresa;
- rejeicoes da SEFAZ devem ser preservadas como evidencia tecnica, sem simular autorizacao, DANFE ou envio ao consumidor;
- producao exige credenciamento, perfil fiscal completo, numeracao controlada e teste homologado anterior.

Motivo:

- impedir uso cruzado de certificado entre empresas e tenants;
- preservar validade fiscal, auditoria e idempotencia da venda;
- evitar que uma venda seja apresentada como fiscalmente autorizada quando houve rejeicao externa.

Complemento operacional:

- a venda é persistida antes da chamada à SEFAZ e recebe o resultado fiscal separadamente;
- a mesma venda nunca recebe outra numeração em uma repetição; documento assinado é consultado antes de nova autorização;
- PIX somente dispara a emissão depois da confirmação bancária;
- venda com NFC-e autorizada não pode ser cancelada localmente antes do cancelamento fiscal;
- todas as formas de pagamento da venda são convertidas para os códigos `tPag` do leiaute NFC-e 4.00.

## D015 - Cadastro híbrido de clientes

Decisao:

- usar `parties` como cadastro único e genérico de clientes/pagadores do Financeiro
- empresas da vertical `ESCOLA` recebem clientes exclusivamente por sincronização da fonte escolar e não permitem cadastro local
- as demais empresas mantêm clientes diretamente no Financeiro
- a sincronização escolar acontece antes de existir parcela e é refeita ao consultar a tela de clientes
- registros integrados e locais são isolados por empresa e filial, com auditoria e inativação lógica

Motivo:

- permitir que o mesmo Financeiro atenda Escola, petshop, oficina e outras operações sem duplicar o domínio de clientes
- preservar a Escola como fonte oficial dos responsáveis e alunos pagadores
- disponibilizar cadastro local para operações sem sistema externo de clientes

## D016 - Movimentação manual de estoque append-only

Decisão:

- entrada e saída manual são programas operacionais vinculados ao produto e à filial
- cada confirmação atualiza o saldo e cria um novo `stock_movements` na mesma transação
- cada operação usa identificador idempotente para impedir duplicidade por duplo clique
- a consulta do produto abre o histórico filtrado e ordenado da movimentação mais recente para a mais antiga
- a coluna redundante de situação sai do grid; o estado ativo/inativo continua indicado junto ao nome e pelo filtro padrão do rodapé

Motivo:

- permitir acertos operacionais rastreáveis sem editar ou apagar o histórico de estoque

## D017 - Configuração e roteamento SuperTEF no Financeiro

Decisão:

- a integração SuperTEF pertence ao sistema `Financeiro`, para ser reutilizada por qualquer vertical
- configuração, POS, checkouts e auditoria ficam em uma única tela com abas
- o token da Software House é criptografado por empresa/filial e nunca retorna ao navegador
- a URL oficial da API é fixa no backend para impedir alteração indevida e SSRF
- cada checkout possui POS preferencial e alternativas ordenadas
- POS fora de serviço permanece no histórico e pode ser compartilhada por vários checkouts quando voltar a operar
- todas as mutações geram evento append-only sem dados secretos

Motivo:

- desacoplar meios de pagamento da Escola
- permitir contingência entre vários checkouts e máquinas
- preservar isolamento de tenant, segurança da credencial e rastreabilidade

## D018 - Pagamento SuperTEF homologável e exclusão mútua por POS

Decisão:

- a primeira emissão operacional aceita débito e crédito somente no ambiente `HOMOLOGATION`
- cada solicitação possui `operationId` idempotente
- uma POS fica bloqueada enquanto o pagamento estiver em andamento
- checkout escolhe a primeira POS ativa e livre conforme a prioridade
- a situação é consultada pelo `payment_uniqueid` no intervalo configurado
- pagamento pago ou rejeitado libera a POS; o registro original e a auditoria permanecem

Motivo:

- permitir homologação segura antes de liberar produção
- impedir cobranças concorrentes na mesma SmartPOS
- preservar rastreabilidade e evitar duplicidade por repetição de requisição

## D019 - Cartão somente após aprovação SuperTEF

Decisão:

- vendas e baixas com cartão solicitam autorização antes da mutação financeira
- durante a homologação operacional, o roteamento é fixo no `EMULADOR 3120`
- somente `PAID` pode gerar venda, estoque, caixa ou liquidação
- empresa, filial, modalidade e valor são revalidados no backend
- a autorização é vinculada e não pode ser reutilizada

Motivo:

- impedir baixa fictícia por simples escolha da forma cartão
- preservar atomicidade, isolamento de tenant e rastreabilidade
- evitar venda ou recebimento quando o cliente rejeitar ou abandonar o cartão

## D020 - PIX antes do cartão em venda mista

- uma cobrança PIX pré-venda é emitida e persistida sem movimentar estoque, caixa ou venda
- somente `PAID`, confirmado pelo Sicoob, libera a solicitação de crédito/débito no SuperTEF
- a venda é confirmada apenas após PIX e cartão estarem aprovados
- o PIX é aplicado à venda na mesma transação e não pode ser reutilizado
- falha ou rejeição do cartão mantém o PIX pago disponível para nova tentativa da mesma venda, sem duplicar a cobrança

## D021 - PIX confirmado antes da baixa de recebíveis

- a baixa manual por PIX deixa de aceitar confirmação meramente operacional
- o Financeiro emite cobrança dinâmica pelo Sicoob e consulta o status
- somente `PAID` libera a liquidação das parcelas
- a intenção limita tenant, filial, conta, grupo, parcelas e valor
- falha após pagamento permite retomar as parcelas restantes com a mesma intenção, sem nova cobrança

## D022 - DDA persistente com encerramento exclusivamente local

- a consulta Sicoob passa a sincronizar um espelho local por empresa, filial e conta
- a situação bancária fica separada da situação local
- baixa e cancelamento alteram somente o Financeiro e nunca enviam comando ao banco
- nova sincronização preserva registros fechados e cancelados
- toda sincronização e mudança de situação gera auditoria append-only
- títulos ausentes numa consulta posterior não são apagados nem encerrados automaticamente
