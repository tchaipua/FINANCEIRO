# CHECKLIST NF-e MODELO 55

## Escopo desta entrega

- emitente do Simples Nacional;
- venda interna em São Paulo;
- NF-e modelo 55, leiaute 4.00;
- ambiente de homologação;
- venda de mercadoria adquirida de terceiros;
- CFOP 5102;
- CSOSN 102 sem benefício fiscal;
- pagamento a prazo com uma duplicata;
- emissão manual e automática pelo sistema Financeiro.

## 1. Arquitetura e isolamento

- [x] Motor fiscal implementado no sistema `Financeiro`.
- [x] Escola atua somente como sistema de origem/consumidor da API.
- [x] Contexto obrigatório por `sourceSystem + sourceTenantId +
  sourceBranchCode`.
- [x] Persistência isolada por `companyId + branchCode`.
- [x] Filial `4 - MSINFOR` criada na Escola e vinculada à mesma filial no
  Financeiro.
- [x] Nenhuma exclusão física em parâmetros ou documentos fiscais.
- [x] Auditoria append-only em toda mutação fiscal.

## 2. Emitente por filial

- [x] Razão social.
- [x] Nome fantasia.
- [x] CNPJ.
- [x] Inscrição estadual.
- [x] CRT 1 - Simples Nacional.
- [x] Logradouro, número, bairro, município, UF e CEP.
- [x] Código IBGE do município.
- [x] Código da UF e código do país.
- [x] Checklist automático de completude do emitente.

## 3. Certificado digital

- [x] Certificado A1 `.pfx`.
- [x] Chave privada conferida.
- [x] Validade conferida.
- [x] CNPJ do certificado comparado com o CNPJ da filial.
- [x] Certificado isolado por empresa, filial e ambiente.
- [x] Senha não exposta em API, frontend, logs, documentação ou auditoria.
- [x] Assinatura XMLDSig verificada.

## 4. Perfil de emissão

- [x] Ambiente `HOMOLOGATION`.
- [x] Modelo 55.
- [x] Série 1.
- [x] Próxima numeração controlada transacionalmente.
- [x] Natureza de operação padrão.
- [x] Layout DANFE retrato.
- [x] Schema `PL_010E_V1.02 + PL_010D_V1.03`.
- [x] Catálogo `cBenef` `20260626`.
- [x] Emissão automática habilitada.
- [x] Emissão manual disponível na venda.

## 5. Natureza da operação e CFOP

- [x] Cadastro persistente de natureza de operação.
- [x] Tipo de operação de saída.
- [x] Destino interno.
- [x] Finalidade normal.
- [x] CFOP 5102.
- [x] Consumidor final.
- [x] Indicador de presença.
- [x] Modalidade de frete sem ocorrência.
- [x] Regra padrão selecionada no perfil.

## 6. Tributação

- [x] Origem nacional, código 0.
- [x] CSOSN 102.
- [x] PIS e COFINS configuráveis.
- [x] IPI configurável quando aplicável.
- [x] Regra tributária geral por natureza.
- [x] Regra tributária específica opcional por produto.
- [x] Prioridade entre regras.
- [x] Vigência e status.
- [x] Snapshot da tributação gravado no documento.

## 7. cBenef de São Paulo

- [x] Tela/catálogo local por filial e versão.
- [x] Validação de UF e vigência.
- [x] Vínculo opcional à regra tributária.
- [x] Vínculo opcional ao produto.
- [x] `SEM CBENEF` bloqueado na API, regra, produto e montagem do XML.
- [x] CSOSN 102 sem benefício emite sem a tag `<cBenef>`.
- [x] XML autorizado conferido sem `<cBenef>`.

Regra aplicada: o código é informado somente quando existe benefício fiscal
válido. A ausência de benefício é campo vazio/`NULL`, nunca um código
artificial.

## 8. CNPJ alfanumérico

- [x] Armazenamento como texto.
- [x] Normalização aceita `A-Z` e `0-9`.
- [x] As 12 posições-base podem ser alfanuméricas.
- [x] Os dois dígitos verificadores permanecem numéricos.
- [x] Algoritmo oficial ASCII menos 48, módulo 11.
- [x] Backend, frontend e buscas atualizados.
- [x] Vetores de teste automatizados.
- [x] CNPJ numérico atual continua compatível.

## 9. Cadastro fiscal do produto

- [x] Descrição fiscal.
- [x] NCM.
- [x] CEST opcional.
- [x] GTIN comercial e tributável ou `SEM GTIN`.
- [x] Unidade comercial e tributável.
- [x] Fator de conversão.
- [x] EX TIPI opcional.
- [x] Origem.
- [x] CFOP padrão.
- [x] CSOSN/CST ICMS.
- [x] CST e alíquotas PIS/COFINS.
- [x] CST, enquadramento e alíquota IPI.
- [x] `cBenef` opcional.
- [x] Campos IBS/CBS preparados.
- [x] Observações fiscais.
- [x] Produto de homologação cadastrado com NCM válido.

## 10. Destinatário

- [x] Nome/razão social.
- [x] CPF ou CNPJ.
- [x] Indicador de inscrição estadual.
- [x] Inscrição estadual opcional.
- [x] Endereço completo.
- [x] Município, UF e código IBGE.
- [x] CEP.
- [x] País.
- [x] E-mail fiscal.
- [x] Nome de homologação gerado conforme regra da SEFAZ.
- [x] Dados pessoais não foram hardcoded no código-fonte.

## 11. Venda e pagamento

- [x] Venda confirmada antes da emissão.
- [x] Itens, quantidades, preços e desconto validados.
- [x] Total da NF-e conciliado com a venda.
- [x] Pagamento a prazo convertido para `tPag=14`.
- [x] Uma duplicata com vencimento e valor.
- [x] PIX convertido para `tPag=17`.
- [x] Crédito convertido para `tPag=03`.
- [x] Débito convertido para `tPag=04`.
- [x] Em venda mista, PIX é confirmado antes do cartão.
- [x] Cartão depende de aprovação SuperTEF.

## 12. XML e comunicação com a SEFAZ

- [x] Chave de acesso e dígito verificador.
- [x] XML NF-e 4.00.
- [x] Assinatura A1.
- [x] Validação nos XSD oficiais vigentes.
- [x] Autorização síncrona.
- [x] Consulta de situação pela chave.
- [x] Consulta de status do serviço.
- [x] Tratamento de timeout e falha de transporte.
- [x] Tratamento de rejeição.
- [x] Reconciliação de número previamente utilizado.
- [x] XML processado `nfeProc`.
- [x] Protocolo e `cStat=100` persistidos.

## 13. Idempotência e numeração

- [x] Uma venda possui no máximo um documento fiscal.
- [x] Repetição da emissão reutiliza o documento autorizado.
- [x] Tentativas preservadas.
- [x] Série/próximo número atualizados transacionalmente.
- [x] Número duplicado detectado e reconciliado.
- [x] Inutilização de faixa implementada.
- [x] Reexecução real confirmou reutilização da mesma NF-e.

## 14. DANFE e armazenamento

- [x] DANFE A4 gerado.
- [x] Código de barras da chave.
- [x] Identificação de homologação.
- [x] Emitente, destinatário, item, imposto, cobrança e protocolo.
- [x] DANFE conferido visualmente.
- [x] XML e PDF armazenados por empresa, filial, ano e mês.
- [x] Endpoints protegidos pelo contexto para download.

## 15. Eventos

- [x] Cancelamento de NF-e.
- [x] Carta de Correção Eletrônica.
- [x] Inutilização de numeração.
- [x] Assinatura e transmissão dos eventos.
- [x] Persistência do XML/retorno/protocolo.
- [x] Documento original preservado.

Os eventos foram implementados, mas não foram disparados na NF-e autorizada
desta entrega para que ela permaneça válida como evidência de homologação.

## 16. Interface

- [x] Card `PARÂMETROS FISCAIS` na central MSINFOR.
- [x] Central de cadastros fiscais.
- [x] Identidade fiscal da filial.
- [x] Natureza de operação/CFOP.
- [x] Regras tributárias.
- [x] Catálogo `cBenef`.
- [x] Perfil, série, ambiente e automação.
- [x] Checklist de prontidão.
- [x] Consulta de status SEFAZ.
- [x] Campos fiscais em Produtos, Clientes e Vendas.
- [x] Links de XML/DANFE na venda autorizada.
- [x] Identificação técnica das telas preservada no rodapé integrado.

## 17. Evidência de homologação

- [x] NF-e autorizada.
- [x] Ambiente 2 - homologação.
- [x] Série 1.
- [x] Número 2.
- [x] `cStat=100`.
- [x] Protocolo `135260006694946`.
- [x] Chave
  `35260769342038000149550010000000021032818568`.
- [x] XML autorizado disponível.
- [x] DANFE disponível.

## 18. Antes de produção

- [ ] Confirmar credenciamento do CNPJ no ambiente de produção.
- [ ] Definir série e número inicial reais sem conflito com outro emissor.
- [ ] Instalar/configurar certificado de produção por filial.
- [ ] Homologar regras para venda interestadual.
- [ ] Homologar ICMS-ST/CEST quando houver produtos sujeitos.
- [ ] Homologar benefícios fiscais quando aplicáveis.
- [ ] Homologar devolução, complemento e ajuste.
- [ ] Revisar IBS/CBS antes da obrigatoriedade aplicável ao CRT 1.
- [ ] Configurar contingência, monitoramento e backup operacional.
- [x] Implementar/configurar envio automático e reenvio manual de XML/DANFE
  por e-mail, com credencial SMTP criptografada e auditoria.

## Fontes oficiais consultadas

- Portal NF-e SP:
  `https://portal.fazenda.sp.gov.br/servicos/nfe`
- cBenef SP:
  `https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/cBenef.aspx`
- Portal Nacional da NF-e - documentos e esquemas:
  `https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w=`
