const assert = require("node:assert/strict");

const {
  PrismaService,
} = require("../dist/prisma/prisma.service.js");
const {
  ReceivablesService,
} = require("../dist/modules/receivables/application/receivables.service.js");
const {
  CashSessionsService,
} = require("../dist/modules/cash-sessions/application/cash-sessions.service.js");

async function resetDatabase(prisma) {
  await prisma.installmentSettlement.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.receivableInstallment.deleteMany();
  await prisma.receivableTitle.deleteMany();
  await prisma.receivableBatch.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.party.deleteMany();
  await prisma.company.deleteMany();
}

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    await resetDatabase(prisma);

    const receivablesService = new ReceivablesService(prisma);
    const cashSessionsService = new CashSessionsService(prisma);

    const importResult = await receivablesService.import({
      requestedBy: "CODEX",
      companyName: "ESCOLA TESTE",
      companyDocument: "12345678000199",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      sourceBatchType: "MENSALIDADE",
      sourceBatchId: "LOTE_TESTE_001",
      referenceDate: "2026-04-01",
      metadata: {
        scope: "ALL",
      },
      skippedItems: [],
      items: [
        {
          sourceEntityType: "ALUNO",
          sourceEntityId: "ALUNO_001",
          sourceEntityName: "ALUNO TESTE",
          classLabel: "6 ANO A",
          businessKey:
            "ESCOLA:TENANT_ESCOLA_TESTE:ALUNO:ALUNO_001:MENSALIDADE:2026-04",
          description: "MENSALIDADE 04/2026",
          categoryCode: "MENSALIDADE",
          issueDate: "2026-04-01",
          payer: {
            externalEntityType: "RESPONSAVEL",
            externalEntityId: "RESP_001",
            name: "MARIA TESTE",
            document: "12345678900",
            email: "maria@teste.com",
            phone: "11999999999",
          },
          installments: [
            {
              installmentNumber: 1,
              installmentCount: 1,
              dueDate: "2026-04-10",
              amount: 850,
              sourceInstallmentKey: "MENSALIDADE:ALUNO_001:2026-04:1",
            },
          ],
        },
      ],
    });

    assert.equal(importResult.importedTitles, 1);
    assert.equal(importResult.importedInstallments, 1);

    const installmentsBeforeSettlement = await receivablesService.listInstallments(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        status: "OPEN",
      },
    );

    assert.equal(installmentsBeforeSettlement.length, 1);
    assert.equal(installmentsBeforeSettlement[0].openAmount, 850);

    const openedCashSession = await cashSessionsService.open({
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      cashierUserId: "USR_CAIXA_001",
      cashierDisplayName: "CAIXA TESTE",
      openingAmount: 100,
      notes: "ABERTURA TESTE",
    });

    assert.equal(openedCashSession.status, "OPEN");

    const settlement = await cashSessionsService.settleInstallment(
      installmentsBeforeSettlement[0].id,
      {
        requestedBy: "CODEX",
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        cashierUserId: "USR_CAIXA_001",
        cashierDisplayName: "CAIXA TESTE",
        notes: "RECEBIMENTO TESTE",
      },
    );

    assert.equal(settlement.status, "PAID");
    assert.equal(settlement.receivedAmount, 850);

    const currentSession = await cashSessionsService.getCurrent({
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      cashierUserId: "USR_CAIXA_001",
    });

    assert.equal(currentSession.totalReceivedAmount, 850);
    assert.equal(currentSession.expectedClosingAmount, 950);

    const installmentsAfterSettlement = await receivablesService.listInstallments(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        status: "PAID",
      },
    );

    assert.equal(installmentsAfterSettlement.length, 1);
    assert.equal(installmentsAfterSettlement[0].status, "PAID");

    console.log("TOTAL 1 TEST PASSING");
  } finally {
    await resetDatabase(prisma);
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error("TEST_FAILURE", error);
  process.exitCode = 1;
});
