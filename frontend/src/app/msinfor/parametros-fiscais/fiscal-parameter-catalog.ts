export type FiscalParameterCatalogItem = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  screenSuffix: string;
  plannedFields: string[];
  href?: string;
};

export const FISCAL_PARAMETER_CATALOG: FiscalParameterCatalogItem[] = [
  {
    slug: 'nfse-nacional',
    title: 'NOTA FISCAL DE SERVIÇO',
    description: 'Configuração, emissão, DANFSe, XML e e-mail da NFS-e no padrão nacional.',
    icon: '/principal-financeiro/nfse.svg',
    screenSuffix: 'NFSE_NACIONAL',
    href: '/msinfor/parametros-fiscais/nfse',
    plannedFields: [],
  },
  {
    slug: 'filial-emitente',
    title: 'FILIAL EMITENTE',
    description: 'CNPJ, IE, CRT, endereço fiscal e identificação da filial emissora.',
    icon: '/principal-financeiro/empresa.svg',
    screenSuffix: 'FILIAL_EMITENTE',
    plannedFields: [
      'CNPJ, inscrição estadual e regime tributário',
      'Razão social, nome fantasia e endereço fiscal',
      'Código IBGE, UF, CEP, telefone e e-mail',
      'Configuração isolada por empresa e filial',
    ],
  },
  {
    slug: 'naturezas-operacao',
    title: 'NATUREZAS DE OPERAÇÃO',
    description: 'Cadastros de venda, devolução, complemento, ajuste e demais operações.',
    icon: '/principal-financeiro/vendas.svg',
    screenSuffix: 'NATUREZAS_OPERACAO',
    plannedFields: [
      'Descrição e finalidade da operação',
      'Entrada ou saída e destino da operação',
      'Consumidor final e indicador de presença',
      'Vigência, situação e filial responsável',
    ],
  },
  {
    slug: 'cfops',
    title: 'CFOP',
    description: 'CFOP interno, interestadual, entrada, saída e vínculo com a natureza.',
    icon: '/principal-financeiro/resumo.svg',
    screenSuffix: 'CFOP',
    plannedFields: [
      'Código e descrição do CFOP',
      'Entrada ou saída',
      'Operação interna, interestadual ou exterior',
      'Vínculo com naturezas de operação',
    ],
  },
  {
    slug: 'regras-tributarias',
    title: 'REGRAS TRIBUTÁRIAS',
    description: 'ICMS/CSOSN, PIS, COFINS, IPI, IBS, CBS e Imposto Seletivo.',
    icon: '/principal-financeiro/creditos.svg',
    screenSuffix: 'REGRAS_TRIBUTARIAS',
    plannedFields: [
      'CST ou CSOSN e modalidade de cálculo',
      'ICMS, ST, FCP e DIFAL',
      'PIS, COFINS e IPI',
      'CST e classificação tributária de IBS/CBS/IS',
    ],
  },
  {
    slug: 'beneficios-fiscais',
    title: 'BENEFÍCIOS FISCAIS (cBenef)',
    description: 'Catálogo vigente da UF, base legal, CST/CSOSN e validação do código cBenef.',
    icon: '/principal-financeiro/contabilidade.svg',
    screenSuffix: 'BENEFICIOS_FISCAIS_CBENEF',
    plannedFields: [
      'Código cBenef e versão oficial do catálogo',
      'UF, vigência, CST/CSOSN e base legal',
      'Aplicabilidade ao Simples Nacional',
      'Bloqueio do código SEM CBENEF em São Paulo',
    ],
  },
  {
    slug: 'series-numeracao',
    title: 'SÉRIES E NUMERAÇÃO',
    description: 'Série, próximo número e ambiente por filial e modelo fiscal.',
    icon: '/principal-financeiro/lotes.svg',
    screenSuffix: 'SERIES_NUMERACAO',
    plannedFields: [
      'Modelo fiscal e ambiente',
      'Série e próximo número',
      'Controle transacional e idempotente',
      'Histórico de numeração e inutilizações',
    ],
  },
  {
    slug: 'certificados-digitais',
    title: 'CERTIFICADOS DIGITAIS',
    description: 'Certificados A1, validade, titular e vinculação à filial emissora.',
    icon: '/principal-financeiro/contas-a-pagar.svg',
    screenSuffix: 'CERTIFICADOS_DIGITAIS',
    href: '/contas-a-pagar/certificados-digitais',
    plannedFields: [],
  },
  {
    slug: 'produtos-fiscais',
    title: 'PRODUTOS FISCAIS',
    description: 'NCM, CEST, GTIN, origem, unidades e classificação fiscal dos produtos.',
    icon: '/principal-financeiro/estoque.svg',
    screenSuffix: 'PRODUTOS_FISCAIS',
    href: '/produtos',
    plannedFields: [],
  },
  {
    slug: 'formas-pagamento',
    title: 'FORMAS DE PAGAMENTO',
    description: 'Mapeamento financeiro para os códigos fiscais de pagamento.',
    icon: '/principal-financeiro/bancos.svg',
    screenSuffix: 'FORMAS_PAGAMENTO',
    plannedFields: [
      'Forma de pagamento do Financeiro',
      'Código fiscal do meio de pagamento',
      'Pagamento à vista ou a prazo',
      'Regras para cartão, PIX, boleto e outros',
    ],
  },
  {
    slug: 'ambientes-sefaz',
    title: 'AMBIENTES SEFAZ',
    description: 'Homologação, produção, autorizadores, contingência e serviços por UF.',
    icon: '/principal-financeiro/retornos.svg',
    screenSuffix: 'AMBIENTES_SEFAZ',
    plannedFields: [
      'Ambiente de homologação ou produção',
      'UF e autorizador responsável',
      'Serviços de autorização, consulta e eventos',
      'Contingência e consulta de disponibilidade',
    ],
  },
  {
    slug: 'automacao-emissao',
    title: 'AUTOMAÇÃO DA EMISSÃO',
    description: 'Emissão manual ou automática e comportamento em rejeições.',
    icon: '/principal-financeiro/supertef.svg',
    screenSuffix: 'AUTOMACAO_EMISSAO',
    plannedFields: [
      'Emissão manual por solicitação',
      'Emissão automática ao finalizar a venda',
      'Reprocessamento idempotente de rejeições',
      'Envio de XML e DANFE ao destinatário',
    ],
  },
];

export function findFiscalParameterCatalogItem(slug: string) {
  return FISCAL_PARAMETER_CATALOG.find((item) => item.slug === slug) || null;
}
