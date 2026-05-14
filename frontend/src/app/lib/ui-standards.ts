export type UiPatternId =
  | 'program-header-school-finance'
  | 'grid-list-toolbar-school-finance'
  | 'embedded-consumer-shell-finance-screen';

export type UiPatternDefinition = {
  id: UiPatternId;
  name: string;
  summary: string;
  documentationPath: string;
  componentPaths: string[];
  referenceScreens: string[];
  status: 'approved' | 'evolving';
};

export const UI_PATTERNS: UiPatternDefinition[] = [
  {
    id: 'program-header-school-finance',
    name: 'CABECALHO PADRAO DE PROGRAMAS ESCOLA/FINANCEIRO',
    summary:
      'FAIXA AZUL COM BOTOES LATERAIS, LOGOTIPO DA ESCOLA, TITULO, DESCRICAO, CARD BRANCO DO USUARIO E BOTAO VOLTAR DENTRO DO BLOCO, SEM STICKY E COM `PRINCIPAL_PROFESSORES` DA ESCOLA COMO REFERENCIA VISUAL SOBERANA DO LADO DIREITO.',
    documentationPath:
      'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-014---cabecalho-padrao-de-programas-escola-e-financeiro',
    componentPaths: [
      'frontend/src/app/layout.tsx',
    ],
    referenceScreens: [
      'frontend/src/app/page.tsx',
      'frontend/src/app/contas-a-pagar/page.tsx',
      'frontend/src/app/estoque/page.tsx',
      'C:/Sistemas/IA/Escola/frontend/src/app/principal/professores/page.tsx',
    ],
    status: 'approved',
  },
  {
    id: 'grid-list-toolbar-school-finance',
    name: 'TOOLBAR PADRAO DE GRID ESCOLA/FINANCEIRO',
    summary:
      'BARRA OPERACIONAL DE LISTAGEM COM ACAO DE INCLUIR NO INICIO DA LINHA DA BUSCA QUANDO EXISTIR, BOTAO COLUNAS E BOTAO DE EXPORTACAO/IMPRESSAO A ESQUERDA, CONTROLES/TIPO SEMAFORO NO CENTRO E CONTADOR DE REGISTROS A DIREITA, USADA SOMENTE EM TELAS COM GRID.',
    documentationPath:
      'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-015---toolbar-padrao-de-grid-escola-e-financeiro',
    componentPaths: [
      'frontend/src/app/lib/grid-page-standards.ts',
      'frontend/src/app/components/grid-export-modal.tsx',
    ],
    referenceScreens: [
      'frontend/src/app/bancos/page.tsx',
      'frontend/src/app/empresas/page.tsx',
      'frontend/src/app/produtos/page.tsx',
      'frontend/src/app/recebiveis/page.tsx',
    ],
    status: 'approved',
  },
  {
    id: 'embedded-consumer-shell-finance-screen',
    name: 'TELA EMBUTIDA DO FINANCEIRO NA VERTICAL CONSUMIDORA',
    summary:
      'QUANDO O FINANCEIRO ABRIR DENTRO DE UMA VERTICAL COMO A ESCOLA, O MENU LATERAL AZUL, O CABECALHO E O NOME TECNICO VISIVEL DEVEM CONTINUAR NA VERTICAL HOSPEDEIRA. A TELA INTERNA DO FINANCEIRO DEVE MOSTRAR APENAS O CONTEUDO CENTRAL E NUNCA DUPLICAR O IDENTIFICADOR VISIVEL.',
    documentationPath:
      'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-016---tela-do-financeiro-embutida-na-vertical-consumidora',
    componentPaths: [
      'frontend/src/app/components/financeiro-resumo-page.tsx',
      'frontend/src/app/lib/runtime-context.ts',
    ],
    referenceScreens: [
      'frontend/src/app/bancos/page.tsx',
      'frontend/src/app/components/financeiro-resumo-page.tsx',
      'C:/Sistemas/IA/Escola/frontend/src/app/principal/financeiro/[section]/page.tsx',
    ],
    status: 'approved',
  },
];

export function getUiPatternById(patternId: UiPatternId) {
  return UI_PATTERNS.find((pattern) => pattern.id === patternId) ?? null;
}
