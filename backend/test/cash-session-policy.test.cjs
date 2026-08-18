const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./cash-session-policy.test.db");

if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/cash-session-policy.test.db";

const { PrismaService } = require("../dist/prisma/prisma.service.js");
const {
  ensureOpenCashSessionReady,
} = require("../dist/common/cash-session-policy.js");

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const sourceSystem = "PROJETO_INICIAL";
  const sourceTenantId = `TENANT_CASH_POLICY_${Date.now()}`;
  const cashierUserId = "OPERADOR_POLICY_TESTE";
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const company = await prisma.company.create({
      data: {
        sourceSystem,
        sourceTenantId,
        name: "TESTE POLÍTICA DE CAIXA",
        status: "ACTIVE",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });

    const oldSession = await prisma.cashSession.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        sourceSystem,
        sourceTenantId,
        cashierUserId,
        cashierDisplayName: "OPERADOR TESTE",
        openingAmount: 100,
        expectedClosingAmount: 125,
        openedAt: yesterday,
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });

    await prisma.cashOperatorPolicy.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        cashierUserId,
        cashierDisplayName: "OPERADOR TESTE",
        closingMode: "DAILY_REQUIRED",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });

    await assert.rejects(
      () => ensureOpenCashSessionReady(prisma, {
        companyId: company.id,
        branchCode: 1,
        sourceSystem,
        sourceTenantId,
        cashierUserId,
      }),
      (error) => error?.response?.code === "CASH_SESSION_CLOSE_REQUIRED",
    );

    const requiredState = await ensureOpenCashSessionReady(prisma, {
      companyId: company.id,
      branchCode: 1,
      sourceSystem,
      sourceTenantId,
      cashierUserId,
      allowDailyRequiredClose: true,
    });
    assert.equal(requiredState.session.id, oldSession.id);
    assert.equal(requiredState.closeRequired, true);

    await prisma.cashOperatorPolicy.update({
      where: {
        companyId_branchCode_cashierUserId: {
          companyId: company.id,
          branchCode: 1,
          cashierUserId,
        },
      },
      data: { closingMode: "DAILY_AUTOMATIC" },
    });

    const automaticState = await ensureOpenCashSessionReady(prisma, {
      companyId: company.id,
      branchCode: 1,
      sourceSystem,
      sourceTenantId,
      cashierUserId,
    });
    assert.equal(automaticState.rolledOver, true);
    assert.equal(automaticState.session.openingAmount, 125);

    const closedOldSession = await prisma.cashSession.findUnique({ where: { id: oldSession.id } });
    assert.equal(closedOldSession.status, "CLOSED");
    assert.equal(closedOldSession.declaredClosingAmount, 125);
    assert.equal(closedOldSession.closeReason, "DAILY_AUTOMATIC");
    assert.equal(closedOldSession.closedBy, "SISTEMA");

    console.log("CASH_POLICY_TEST_PASSING");
  } finally {
    await prisma.cashOperatorPolicy.deleteMany({ where: { cashierUserId } });
    await prisma.cashSession.deleteMany({ where: { cashierUserId } });
    await prisma.company.deleteMany({ where: { sourceTenantId } });
    await prisma.onModuleDestroy();
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
  }
}

main().catch((error) => {
  console.error("CASH_POLICY_TEST_FAILURE", error);
  process.exitCode = 1;
});
