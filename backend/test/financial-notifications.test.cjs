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
    const originalFetch = global.fetch;
    global.fetch = async (_url, init) => {
      callbacks += 1;
      assert.equal(init.headers["x-msinfor-scopes"], "FINANCIAL_NOTIFICATIONS_WRITE");
      return new Response(JSON.stringify({ deliveryId: JSON.parse(Buffer.from(init.body).toString("utf8")).deliveryId, internalStatus: "SENT", emailStatus: "SENT", telegramStatus: "SKIPPED", processedAt: new Date().toISOString() }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const event = { eventType: "RECEIVABLE_INSTALLMENT_AMOUNT_CHANGED", eventKey: `TEST:${suffix}`, title: "VALOR ALTERADO", message: "VALOR DA PARCELA ALTERADO.", targetSubjectId: subject.id };
      const first = await runAs(context, () => service.dispatch(event));
      const repeated = await runAs(context, () => service.dispatch(event));
      assert.equal(first.recipients, 1);
      assert.equal(repeated.recipients, 1);
      assert.equal(callbacks, 1, "A ENTREGA REPETIDA DEVE SER IDEMPOTENTE");
    } finally {
      global.fetch = originalFetch;
    }
    const auditCount = await prisma.financialNotificationAuditEvent.count({ where: { companyId: company.id, subjectId: subject.id } });
    assert.equal(auditCount >= 1, true);
    console.log("financial notifications tests: ok");
  } finally {
    await prisma.onModuleDestroy();
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
