Você está trabalhando diretamente no repositório do sistema Financeiro.

O usuário autorizou editar todos os arquivos necessários deste projeto.

OBJETIVO

Completar as notificações financeiras para que cada evento enviado pelo Financeiro carregue detalhes suficientes para a notificação interna, e-mail e Telegram:

- cliente ou fornecedor;
- venda ou nota fiscal;
- título financeiro;
- parcela;
- valor anterior e novo valor;
- vencimento anterior e novo vencimento;
- valor estornado;
- motivo do cancelamento ou estorno.

A Escola já possui um callback que encaminha a mesma mensagem para PRINCIPAL_NOTIFICACOES, e-mail e Telegram. Portanto, o Financeiro precisa enviar o metadata completo e também persistir uma mensagem detalhada no outbox.

LEITURA OBRIGATÓRIA

Antes de alterar código, leia:

- AGENTS.md
- DOCUMENTACAO/AI/SYSTEM_IDENTITY.md
- DOCUMENTACAO/AI/PROJECT_CONTEXT.md
- DOCUMENTACAO/AI/ARCHITECTURE.md
- DOCUMENTACAO/AI/DATABASE.md
- DOCUMENTACAO/AI/API_SPEC.md
- DOCUMENTACAO/AI/CODING_RULES.md
- DOCUMENTACAO/AI/DECISIONS.md
- DOCUMENTACAO/AI/TASKS.md
- DOCUMENTACAO/AI/ROADMAP.md

REGRAS

- Não cadastrar nem alterar clientes diretamente no Financeiro.
- Cliente/pagador continua pertencendo ao sistema de origem.
- Manter isolamento por companyId, sourceTenantId e branchCode.
- Não criar exclusão física.
- Manter auditoria e outbox.
- Não alterar layout aprovado.
- Não criar destinatários para alunos, professores, responsáveis ou clientes.
- Manter textos das mensagens em uppercase.
- Não incluir CPF, tokens, senhas ou segredos nas notificações.
- Não alterar eventKey nem quebrar idempotência.
- Não reenviar notificações históricas já entregues.
- Não enviar novos e-mails reais durante os testes.

EVENTOS OBRIGATÓRIOS

Garantir o detalhamento para:

RECEIVABLE_INSTALLMENT_CANCELED
RECEIVABLE_MOVEMENT_CANCELED
RECEIVABLE_INSTALLMENT_AMOUNT_CHANGED
RECEIVABLE_INSTALLMENT_DUE_DATE_CHANGED
RECEIVABLE_SETTLEMENT_REVERSED
PAYABLE_INSTALLMENT_CANCELED
PAYABLE_MOVEMENT_CANCELED
PAYABLE_INSTALLMENT_AMOUNT_CHANGED
PAYABLE_INSTALLMENT_DUE_DATE_CHANGED
PAYABLE_SETTLEMENT_REVERSED
CASH_MOVEMENT_CANCELED

METADATA PADRÃO

Usar nomes canônicos e preservar também os IDs existentes:

{
  sourceEntityType,
  sourceEntityId,
  sourceEntityName,
  businessKey,

  customerName,
  payerNameSnapshot,
  saleNumber,
  saleId,

  supplierName,
  invoiceNumber,
  invoiceSeries,
  invoiceImportId,

  titleId,
  titleName,
  receivableTitleId,
  payableTitleId,

  installmentId,
  installmentNumber,
  installmentCount,

  amount,
  currentAmount,
  previousAmount,
  nextAmount,

  dueDate,
  currentDueDate,
  previousDueDate,
  nextDueDate,

  reversedAmount,
  reversedCount,

  reason,
  cancellationReason,
  cancellationNote,
  requestedBy
}

Não é obrigatório preencher todos os campos em todos os eventos, mas cada evento deve enviar tudo que estiver disponível.

PONTOS A ALTERAR

1. RECEBÍVEIS

Arquivo:

backend/src/modules/receivables/application/receivables.service.ts

No updateInstallment:

- incluir payerNameSnapshot como customerName;
- incluir titleId, sourceEntityType, sourceEntityId, sourceEntityName e businessKey;
- quando sourceEntityType for SALE, preencher saleNumber com sourceEntityName;
- incluir installmentNumber, installmentCount, amount e dueDate;
- em alteração de valor, enviar:
  - previousAmount;
  - nextAmount;
  - currentAmount;
- em alteração de vencimento, enviar:
  - previousDueDate;
  - nextDueDate;
  - currentDueDate;
- a mensagem deve mostrar claramente valor anterior/novo ou vencimento anterior/novo.

Exemplo de mensagem:

ALTERAÇÃO DE VALOR DE PARCELA DO CONTAS A RECEBER. CLIENTE: NOME. VENDA: V-0001. PARCELA: 2/3. VALOR ANTERIOR: R$ 100,00. NOVO VALOR: R$ 125,00.

2. CANCELAMENTO DE VENDA

Arquivo:

backend/src/modules/sales/application/sales.service.ts

No cancelamento da venda:

- incluir saleId;
- saleNumber;
- customerNameSnapshot;
- totalAmount;
- paidAmount;
- receivableAmount;
- receivableTitleId;
- cancellationNote;
- requestedBy;
- incluir as parcelas canceladas, com número, quantidade, valor e cliente/pagador;
- preservar o motivo do cancelamento.

A mensagem deve informar:

CANCELAMENTO DO MOVIMENTO DO CONTAS A RECEBER. CLIENTE: NOME. VENDA: V-0001. VALOR DA VENDA: R$ 500,00. MOTIVO: MOTIVO INFORMADO.

Para cancelamento individual de parcela, informar também o número e valor da parcela.

3. CONTAS A PAGAR

Arquivo:

backend/src/modules/payables/application/payables.service.ts

Nos eventos de alteração de parcelas:

- supplierName deve vir de supplier.legalName ou supplier.tradeName;
- incluir invoiceNumber, invoiceSeries e invoiceImportId;
- incluir installmentId, installmentNumber e installmentCount;
- incluir previousAmount e nextAmount;
- incluir previousDueDate e nextDueDate;
- incluir amount/currentAmount/dueDate;
- incluir cancellationReason ou reason quando aplicável.

Exemplo:

ALTERAÇÃO DE VENCIMENTO DE PARCELA DO CONTAS A PAGAR. FORNECEDOR: EMPRESA EXEMPLO. NOTA: 12345. PARCELA: 1/3. VENCIMENTO ANTERIOR: 10/08/2026. NOVO VENCIMENTO: 25/08/2026.

No cancelamento da NF, informar fornecedor, número da NF, valor total e motivo.

4. CAIXA E ESTORNOS

Arquivo:

backend/src/modules/cash-sessions/application/cash-sessions.service.ts

Nos cancelamentos de movimento:

- incluir movementId;
- movementType;
- description;
- amount;
- paymentMethod;
- referenceType;
- referenceId;
- reason;
- requestedBy;
- quando houver vínculo com venda ou parcela, incluir cliente, venda/título, parcela e valor.

Nos estornos de recebimento:

- incluir installmentId;
- payerNameSnapshot;
- titleId/titleName;
- saleNumber quando disponível;
- installmentNumber;
- receivedAmount;
- reversedAmount;
- reversedCount;
- restoredOpenAmount;
- reason.

Para estorno agrupado, informar quantidade de parcelas e total estornado. Quando possível, incluir uma lista resumida das parcelas envolvidas.

Verificar os includes Prisma atuais. Se necessário, carregar:

installment: {
  include: {
    title: true
  }
}

A consulta deve continuar limitada à companyId e filial atuais.

5. FORMATADOR CENTRAL

Arquivo sugerido:

backend/src/modules/financial-notifications/application/financial-notification-message.ts

Criar um formatador único para:

- produzir a mensagem detalhada;
- formatar dinheiro em pt-BR;
- formatar datas em dd/MM/yyyy;
- evitar valores undefined/null;
- limitar a mensagem a 2.000 caracteres;
- manter o texto em uppercase;
- não expor dados sensíveis.

Usar esse formatador:

- antes de gravar FinancialNotificationDelivery.message;
- antes de enviar o callback ao sistema de origem;
- nos testes de simulação.

O metadata original deve continuar preservado em metadataJson.

6. SERVIÇO DE ENTREGA

Arquivo:

backend/src/modules/financial-notifications/application/financial-notifications.service.ts

Confirmar que:

- a mensagem detalhada é persistida no outbox;
- metadata é encaminhado sem perda;
- callback recebe a mesma mensagem usada no outbox;
- sendInternal, sendEmail e sendTelegram usam a mesma mensagem;
- deliveries já entregues não são reenviadas;
- eventKey continua idempotente;
- falhas de um canal não duplicam os demais.

7. SIMULAÇÃO

Manter a simulação administrativa sem alterar dados de negócio.

Quando simular, usar metadata demonstrativo:

{
  simulation: true,
  customerName: "CLIENTE DE TESTE CEC",
  saleNumber: "SIMULAÇÃO V-0001",
  installmentNumber: 1,
  installmentCount: 3,
  previousAmount: 100,
  nextAmount: 125,
  previousDueDate: "2026-08-10",
  nextDueDate: "2026-08-20",
  reversedAmount: 125,
  reason: "SIMULAÇÃO CONTROLADA"
}

Não executar nova simulação real nem enviar e-mails para tchaipua@gmail.com durante esta tarefa.

TESTES OBRIGATÓRIOS

Criar ou atualizar testes para verificar:

- alteração de valor mostra valor anterior e novo;
- alteração de vencimento mostra as duas datas;
- cancelamento mostra cliente/venda/valor/motivo;
- cancelamento de NF mostra fornecedor/NF/valor/motivo;
- estorno mostra parcela e valor estornado;
- cash movement mostra valor e vínculo;
- metadataJson contém os campos canônicos;
- callback recebe mensagem detalhada;
- duplicação do mesmo eventKey não cria nova entrega;
- isolamento por companyId e filial permanece funcionando.

Executar:

npm run build
npm run test:financial-notifications
npm run test:finance-access
npm run test:security

Se houver impacto em caixa ou vendas, executar também:

npm run test:cash-policy
npm run test:core

CRITÉRIOS DE ACEITE

A entrega será considerada concluída quando:

1. Todo evento financeiro gerar mensagem contextualizada.
2. Alterações mostrarem sempre o valor/data anterior e o novo valor/data.
3. Cancelamentos mostrarem motivo, cliente/fornecedor e valor.
4. Estornos mostrarem parcela, cliente, venda/título e valor estornado.
5. A mesma mensagem detalhada chegar à notificação interna, e-mail e Telegram.
6. O outbox mantiver metadata completo.
7. Nenhum destinatário novo for criado.
8. Nenhuma regra de tenant, RBAC, auditoria ou idempotência for quebrada.
9. Build e testes passarem.
10. Não houver envio real de e-mails durante os testes.

Na resposta final, informe:

- contexto assumido;
- regra de negócio aplicada;
- arquivos alterados;
- testes executados;
- riscos ou pontos pendentes.
===> TERMINEI <===
