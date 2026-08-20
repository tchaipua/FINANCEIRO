const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./financial-notifications.test.db");
if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/financial-notifications.test.db";
process.env.NODE_ENV = "test";
process.env.SOURCE_SYSTEM_ESCOLA_API_URL = "http://escola.internal:3001/api/v1";
process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = "n".repeat(48);

const { PrismaService } = require("../dist/prisma/prisma.service.js");
const { financeContext } = require("../dist/common/finance-context.js");
const { FINANCIAL_NOTIFICATION_EVENTS } = require("../dist/modules/financial-notifications/domain/financial-notification-events.js");
const { FinancialNotificationsService } = require("../dist/modules/financial-notifications/application/financial-notifications.service.js");
const {
  formatFinancialNotificationMessage,
  sanitizeFinancialNotificationMetadata,
} = require("../dist/modules/financial-notifications/application/financial-notification-message.js");

function runAs(context, operation) {
  return financeContext.run({ authenticated: true, branchCode: context.sourceBranchCode, scopes: ["FINANCE_ADMIN"], ...context }, operation);
}

async function main() {
  assert.equal(FINANCIAL_NOTIFICATION_EVENTS.length, 11);
  assert.equal(new Set(FINANCIAL_NOTIFICATION_EVENTS.map((item) => item.code)).size, 11);
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const service = new FinancialNotificationsService(prisma);
  const suffix = Date.now();
  const sourceTenantId = `TENANT_NOTIFICATION_${suffix}`;
  const actor = `ADMIN_${suffix}`;
  const company = await prisma.company.create({ data: { sourceSystem: "ESCOLA", sourceTenantId, name: "EMPRESA NOTIFICAÇÃO", status: "ACTIVE", createdBy: actor, updatedBy: actor } });
  const branch = await prisma.companyBranch.create({ data: { companyId: company.id, branchCode: 1, name: "FILIAL 1", isActive: true, isDefault: true, createdBy: actor, updatedBy: actor } });
  const context = { sourceSystem: "ESCOLA", sourceTenantId, sourceBranchCode: 1, sourceUserId: actor, companyId: company.id, branchId: branch.id };
  try {
    const subject = await prisma.financeAccessSubject.create({ data: { companyId: company.id, sourceSystem: "ESCOLA", sourceTenantId, sourceUserId: `USER_${suffix}`, displayName: "USUÁRIO TESTE", email: "TCHAIPUA@GMAIL.COM", sourceBranchCodesJson: "[1]", sourceActive: true, createdBy: actor, updatedBy: actor } });
    await prisma.financeAccessAssignment.create({ data: { companyId: company.id, subjectId: subject.id, branchCode: 1, profileCode: "CONSULTA", permissionCodesJson: "[\"VIEW_FINANCIAL\"]", active: true, createdBy: actor, updatedBy: actor } });
    await runAs(context, () => service.savePreferences(subject.id, { preferences: FINANCIAL_NOTIFICATION_EVENTS.map((event) => ({ eventType: event.code, enabled: true, sendInternal: true, sendEmail: true, sendTelegram: false })) }));
    const configured = await runAs(context, () => service.getPreferences(subject.id));
    assert.equal(configured.preferences.every((item) => item.enabled && item.sendInternal && item.sendEmail), true);
    let callbacks = 0;
    const callbackPayloads = [];
    const originalFetch = global.fetch;
    global.fetch = async (_url, init) => {
      callbacks += 1;
      const callbackPayload = JSON.parse(Buffer.from(init.body).toString("utf8"));
      callbackPayloads.push(callbackPayload);
      assert.equal(init.headers["x-msinfor-scopes"], "FINANCIAL_NOTIFICATIONS_WRITE");
      return new Response(JSON.stringify({ deliveryId: callbackPayload.deliveryId, internalStatus: "SENT", emailStatus: "SENT", telegramStatus: "SKIPPED", processedAt: new Date().toISOString() }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const event = {
        eventType: "RECEIVABLE_INSTALLMENT_AMOUNT_CHANGED",
        eventKey: `TEST:${suffix}`,
        title: "VALOR ALTERADO",
        message: "VALOR DA PARCELA ALTERADO.",
        targetSubjectId: subject.id,
        metadata: {
          customerName: "CLIENTE TESTE",
          payerNameSnapshot: "CLIENTE TESTE",
          saleNumber: "V-0001",
          saleId: "SALE-1",
          titleId: "TITLE-1",
          receivableTitleId: "TITLE-1",
          installmentId: "INSTALLMENT-1",
          installmentNumber: 2,
          installmentCount: 3,
          amount: 125,
          currentAmount: 125,
          previousAmount: 100,
          nextAmount: 125,
          dueDate: "2026-08-20",
          currentDueDate: "2026-08-20",
          previousDueDate: "2026-08-10",
          nextDueDate: "2026-08-20",
          requestedBy: actor,
        },
      };
      const first = await runAs(context, () => service.dispatch(event));
      const repeated = await runAs(context, () => service.dispatch(event));
      assert.equal(first.recipients, 1);
      assert.equal(repeated.recipients, 1);
      assert.equal(callbacks, 1, "A ENTREGA REPETIDA DEVE SER IDEMPOTENTE");
      assert.match(first.deliveries[0].message, /VALOR ANTERIOR/);
      assert.match(first.deliveries[0].message, /NOVO VALOR/);
      assert.match(first.deliveries[0].message, /R\$\s*100,00/);
      assert.match(first.deliveries[0].message, /R\$\s*125,00/);
      assert.equal(callbackPayloads[0].message, first.deliveries[0].message);
      assert.deepEqual(JSON.parse(first.deliveries[0].metadataJson), event.metadata);

      const delivery = await prisma.financialNotificationDelivery.findFirst({ where: { eventKey: event.eventKey } });
      assert.ok(delivery);
      assert.equal(JSON.parse(delivery.metadataJson).installmentNumber, 2);
      assert.equal(JSON.parse(delivery.metadataJson).previousAmount, 100);

      let retryAttempts = 0;
      global.fetch = async (_url, init) => {
        retryAttempts += 1;
        const callbackPayload = JSON.parse(Buffer.from(init.body).toString("utf8"));
        callbackPayloads.push(callbackPayload);
        if (retryAttempts === 1) {
          return new Response(JSON.stringify({ message: "CALLBACK TEMPORARIAMENTE INDISPONÍVEL" }), { status: 503 });
        }
        return new Response(JSON.stringify({ deliveryId: callbackPayload.deliveryId, internalStatus: "SENT", emailStatus: "SENT", telegramStatus: "SKIPPED", processedAt: new Date().toISOString() }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const retryEvent = {
        ...event,
        eventKey: `RETRY:${suffix}`,
        metadata: { ...event.metadata, customerName: "CLIENTE PERSISTIDO" },
      };
      const failed = await runAs(context, () => service.dispatch(retryEvent));
      const retried = await runAs(context, () => service.dispatch({
        ...retryEvent,
        metadata: { ...retryEvent.metadata, customerName: "CLIENTE ALTERADO NA TENTATIVA" },
      }));
      assert.equal(retryAttempts, 2);
      assert.equal(failed.deliveries[0].deliveredAt, null);
      assert.ok(retried.deliveries[0].deliveredAt);
      assert.equal(callbackPayloads.at(-1).metadata.customerName, "CLIENTE PERSISTIDO");
      assert.match(callbackPayloads.at(-1).message, /CLIENTE PERSISTIDO/);
    } finally {
      global.fetch = originalFetch;
    }
    const dueDateMessage = formatFinancialNotificationMessage(
      "RECEIVABLE_INSTALLMENT_DUE_DATE_CHANGED",
      { customerName: "CLIENTE TESTE", saleNumber: "V-0001", installmentNumber: 1, installmentCount: 2, previousDueDate: "2026-08-10", nextDueDate: "2026-08-20" },
      "FALLBACK",
    );
    assert.match(dueDateMessage, /10\/08\/2026/);
    assert.match(dueDateMessage, /20\/08\/2026/);

    const cancellationMessage = formatFinancialNotificationMessage(
      "PAYABLE_MOVEMENT_CANCELED",
      { supplierName: "EMPRESA EXEMPLO", invoiceNumber: "12345", invoiceSeries: "1", totalAmount: 500, cancellationReason: "NOTA DUPLICADA" },
      "FALLBACK",
    );
    assert.match(cancellationMessage, /FORNECEDOR/);
    assert.match(cancellationMessage, /NOTA/);
    assert.match(cancellationMessage, /MOTIVO/);

    const receivableCancellationMessage = formatFinancialNotificationMessage(
      "RECEIVABLE_MOVEMENT_CANCELED",
      { customerNameSnapshot: "CLIENTE PETSHOP", saleNumber: "V-0001", totalAmount: 500, cancellationReason: "SOLICITAÇÃO DO CLIENTE" },
      "FALLBACK",
    );
    assert.match(receivableCancellationMessage, /CLIENTE PETSHOP/);
    assert.match(receivableCancellationMessage, /V-0001/);
    assert.match(receivableCancellationMessage, /R\$\s*500,00/);
    assert.match(receivableCancellationMessage, /MOTIVO/);

    const payableDueDateMessage = formatFinancialNotificationMessage(
      "PAYABLE_INSTALLMENT_DUE_DATE_CHANGED",
      { supplierName: "EMPRESA EXEMPLO", invoiceNumber: "12345", installmentNumber: 1, installmentCount: 3, previousDueDate: "2026-08-10", nextDueDate: "2026-08-25" },
      "FALLBACK",
    );
    assert.match(payableDueDateMessage, /10\/08\/2026/);
    assert.match(payableDueDateMessage, /25\/08\/2026/);

    const reversalMessage = formatFinancialNotificationMessage(
      "RECEIVABLE_SETTLEMENT_REVERSED",
      { customerName: "CLIENTE PETSHOP", saleNumber: "V-0001", installmentNumber: 2, installmentCount: 3, reversedAmount: 125, reversedCount: 1, reason: "ESTORNO SOLICITADO" },
      "FALLBACK",
    );
    assert.match(reversalMessage, /PARCELA: 2\/3/);
    assert.match(reversalMessage, /VALOR ESTORNADO/);
    assert.match(reversalMessage, /R\$\s*125,00/);

    const cashMessage = formatFinancialNotificationMessage(
      "CASH_MOVEMENT_CANCELED",
      { movementType: "ENTRY", description: "SUPRIMENTO", amount: 75, paymentMethod: "CASH", referenceType: "SALE", saleNumber: "V-0001", reason: "LANÇAMENTO INCORRETO" },
      "FALLBACK",
    );
    assert.match(cashMessage, /SUPRIMENTO/);
    assert.match(cashMessage, /R\$\s*75,00/);
    assert.match(cashMessage, /VENDA: V-0001/);

    const safeMetadata = sanitizeFinancialNotificationMetadata({ customerName: "CLIENTE", token: "SEGREDO", payerDocumentSnapshot: "CPF" });
    assert.deepEqual(safeMetadata, { customerName: "CLIENTE" });
    const auditCount = await prisma.financialNotificationAuditEvent.count({ where: { companyId: company.id, subjectId: subject.id } });
    assert.equal(auditCount >= 1, true);
    console.log("financial notifications tests: ok");
  } finally {
    await prisma.onModuleDestroy();
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
