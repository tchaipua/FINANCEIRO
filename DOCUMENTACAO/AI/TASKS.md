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
- concluido: barra compacta do cadastro de produtos com botão `+`, pesquisa rápida no grid e remoção do resumo redundante acima da listagem
- concluido: entrada e saída manual por produto com histórico append-only, saldo anterior/final, idempotência e consulta do histórico já filtrada pelo produto

## NFC-e

- concluido: primeira versao da tela `Vendas 2`, com novo layout de PDV e reutilizacao integral do fluxo operacional da tela de vendas atual
- concluido: estrutura visual inicial da central `MSINFOR` no Financeiro, com card `SUPERTEF` e tela unica organizada por abas
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
- pendente: enviar o DANFE/XML de homologacao por e-mail
