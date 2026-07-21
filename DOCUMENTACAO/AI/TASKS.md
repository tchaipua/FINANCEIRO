# TASKS

## Fase atual

Base funcional do projeto `Financeiro`, com recebiveis, produtos, contas a pagar por XML e primeira camada de importacao automatica DF-e por certificado fiscal.

## Tarefas prioritarias

- criar a documentacao oficial do projeto
- subir backend NestJS
- configurar Prisma
- criar schema inicial generico
- criar endpoint `POST /receivables/import`
- definir estrategia de autenticacao por `x-api-key`
- definir fluxo de importacao da escola
- consolidar fluxo de aprovacao de notas de entrada com estoque e duplicatas
- consolidar cadastro multi-certificado por empresa para automacao fiscal
- parametrizar estoque por filial com suporte a grade cor/numero, lote e quantidade inteira/fracionada
- criar historico de movimentacao de estoque em grid/lista somente consulta

## Tarefas seguintes

- evoluir modulo de produtos compartilhados para estoque, notas de entrada e vendas
- expandir modulo de contas a pagar para fornecedores e lancamento manual
- criar modulo de contas bancarias
- criar modulo de extrato
- criar modulo de cobranca
- ampliar importacao automatica com manifestacao do destinatario e tratamento de resumos DF-e
- acompanhar patch oficial do Next moderno para remover alerta residual de `postcss` interno sem downgrade para Next 9
- concluido: cadastro híbrido de clientes com consulta/sincronização exclusiva para Escola e cadastro local para as demais empresas
- concluido: cadastro mestre único por CPF/CNPJ com papéis por filial para cliente, pagador, fornecedor, destinatário e tomador, consolidação lógica de duplicidades e auditoria
- concluido: barra compacta do cadastro de produtos com botão `+`, pesquisa rápida no grid e remoção do resumo redundante acima da listagem
- concluido: entrada e saída manual por produto com histórico append-only, saldo anterior/final, idempotência e consulta do histórico já filtrada pelo produto

## NFC-e

- concluido: primeira versao da tela `Vendas 2`, com novo layout de PDV e reutilizacao integral do fluxo operacional da tela de vendas atual
- concluido: estrutura visual inicial da central `MSINFOR` no Financeiro, com card `SUPERTEF` e tela unica organizada por abas
- concluido: card `PARÂMETROS FISCAIS` na central `MSINFOR`, com central própria e rotas preparadas para os cadastros fiscais por filial
- concluido: configuração persistente SuperTEF por empresa/filial com token AES-256-GCM, teste de conexão, sincronização de POS, checkouts, prioridades, soft delete e auditoria append-only
- concluido: credencial homologada, conexão testada e POS emulador 3120 sincronizada
- concluido: solicitação/consulta de pagamento de débito e crédito em homologação, com idempotência, exclusão mútua por POS, polling e auditoria
- concluido: vendas e recebimentos de parcelas por crédito/débito exigem aprovação SuperTEF antes de estoque, caixa e baixa
- concluido: venda mista executa PIX primeiro, cartão depois e somente então confirma estoque, caixa e venda; PIX possui intenção idempotente e uso único
- concluido: grid de recebimentos por cliente possui ação direta para abrir a baixa manual com todas as parcelas abertas do cliente
- concluido: baixa manual por PIX emite QR Code Sicoob, aguarda confirmação bancária e só então liquida as parcelas
- concluido: detalhe do caixa lista os movimentos do grid do mais recente para o mais antigo
- concluido: DDAs Sicoob ficam persistidos e auditados, com filtros de abertos, fechados e cancelados e ações de baixa/cancelamento exclusivamente locais
- pendente: integrar solicitação e confirmação de estorno SuperTEF aos cancelamentos de venda e reversões de baixa
- concluido: geracao, assinatura A1, QR Code v3, IBS/CBS 2026 e comunicacao com homologacao da SEFAZ-SP
- concluido: bloqueio quando o CNPJ do certificado difere do emitente
- concluido: NFC-e de homologacao autorizada para `A MONTANHER & CIA LTDA`, chave `35260745364981000194650012607140011061046523`, protocolo `13526000008317897`
- concluido: segunda NFC-e de homologacao autorizada após integração do fluxo, chave `35260745364981000194650012607140021807000407`, protocolo `13526000008318783`
- concluido: DANFE de homologacao gerado e verificado visualmente
- concluido: emissão automática idempotente integrada ao fechamento da venda para dinheiro, cartões, prazo, parcelado, boleto e PIX confirmado
- concluido: perfil fiscal isolado por empresa/filial/ambiente, tentativas auditadas e trava de cancelamento para venda autorizada
- pendente externo: o CNPJ `51007652000199` da SACCARDO continua sem credenciamento NFC-e; retorno `245 - CNPJ Emitente não cadastrado`
- pendente: cadastrar certificado e perfil fiscal do mesmo CNPJ da empresa usada pela tela de vendas e preencher NCM dos produtos
- concluido: envio do DANFE/XML de homologacao por e-mail

## NF-e modelo 55

- concluído: motor NF-e centralizado no Financeiro e isolado por empresa/filial
- concluído: filial `4 - MSINFOR` vinculada entre Escola e Financeiro
- concluído: identidade fiscal do emitente, certificado A1, CRT 1, IE,
  endereço e código IBGE cadastrados por filial
- concluído: natureza de venda interna, CFOP 5102 e regra CSOSN 102 sem
  benefício fiscal
- concluído: cadastro fiscal de produtos com NCM, CEST, GTIN, unidades, origem,
  CFOP, ICMS/CSOSN, PIS, COFINS, IPI e `cBenef`
- concluído: dados fiscais completos de destinatário no cadastro de clientes
- concluído: suporte ao CNPJ alfanumérico oficial no backend e frontend
- concluído: catálogo paulista `cBenef` versão `20260626`, rejeição de
  `SEM CBENEF` e omissão correta quando não há benefício
- concluído: prévia, assinatura A1, validação XSD, autorização, consulta,
  cancelamento, CC-e, inutilização, armazenamento XML/DANFE e auditoria
- concluído: emissão manual e emissão automática ao finalizar a venda
- concluído: card próprio `Emissão NF-e` no portal, com emissão avulsa sem
  venda artificial e Contas a Receber opcional de 1 a 60 parcelas após
  autorização
- concluído: venda mista mantém PIX antes de crédito/débito
- concluído: NF-e homologação série 1 número 2 autorizada, chave
  `35260769342038000149550010000000021032818568`, protocolo
  `135260006694946`
- concluído: XML processado validado no XSD vigente, assinatura verificada e
  DANFE conferido visualmente
- concluído: envio automático e reenvio manual do DANFE/XML por e-mail, com
  SMTP por filial criptografado, histórico e auditoria; NF-e 1/2 enviada em
  homologação
- pendente para produção: confirmar credenciamento/ambiente de produção,
  revisar numeração inicial e homologar cenários tributários adicionais
  (interestadual, ST, benefício fiscal, devolução e complemento)

## NFS-e Nacional

- concluído: card `NOTA FISCAL DE SERVIÇO` na central de parâmetros fiscais
- concluído: tela única de prontidão, emitente, perfil, SMTP, catálogo de
  serviços, emissão manual, documentos e artefatos
- concluído: as seis seções da configuração NFS-e foram separadas em abas
- concluído: cada serviço fiscal aceita múltiplas descrições reutilizáveis,
  mantendo a primeira como padrão para integrações existentes
- concluído: card próprio `Emissão NFS (Serviço)` no portal, com Contas a
  Receber opcional e parcelado criado somente após autorização
- concluído: agregado NFS-e próprio, multi-tenant/filial, soft delete,
  idempotência, numeração transacional, tentativas e auditoria
- concluído: DPS XML 1.01, assinatura A1, GZip/Base64, SEFIN restrita,
  reconciliação, XML autorizado e DANFSe oficial
- concluído: DPS 1/2 e 1/3 validadas no XSD oficial de 09/02/2026 e assinaturas
  reais verificadas antes da transmissão
- concluído: envio automático/manual de XML + DANFSe somente após autorização
- concluído: tomador reutiliza o `Party` pagador da duplicata; NF-e também foi
  ajustada para priorizar esse mesmo pagador
- concluído: serviço de suporte técnico configurado com código nacional
  `010701`, CNAE `6209100`, NBS `115013000` e valor de teste R$ 10,00
- concluído: serviço fiscal pode ser exclusivo da filial ou compartilhado com
  todas as filiais da mesma empresa
- concluído: inscrição municipal `1299` obtida no CNC oficial de produção e
  gravada na filial MSINFOR com auditoria
- validado: ambiente nacional de produção informa o contribuinte ativo e
  habilitado no CNC de Ipuã
- pendente externo: o convênio de Ipuã/SP não está ativo no ambiente restrito;
  as transmissões das DPS 1/2 e 1/3 retornaram `E0037`, portanto ainda não
  existe XML autorizado/DANFSe e o e-mail não pode ser enviado
- pendente de acompanhamento: adotar CNPJ alfanumérico na DPS quando o Governo
  publicar XSD NFS-e que substitua a restrição numérica do leiaute 1.01
