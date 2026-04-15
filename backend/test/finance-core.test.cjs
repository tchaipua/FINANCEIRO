const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./finance-core.test.db");

if (fs.existsSync(testDbPath)) {
  fs.rmSync(testDbPath, { force: true });
}

fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/finance-core.test.db";

const {
  PrismaService,
} = require("../dist/prisma/prisma.service.js");
const {
  ReceivablesService,
} = require("../dist/modules/receivables/application/receivables.service.js");
const {
  CashSessionsService,
} = require("../dist/modules/cash-sessions/application/cash-sessions.service.js");
const {
  BanksService,
} = require("../dist/modules/banks/application/banks.service.js");

async function resetDatabase(prisma) {
  await prisma.installmentSettlement.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.receivableInstallment.deleteMany();
  await prisma.receivableTitle.deleteMany();
  await prisma.receivableBatch.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.bankAccount.deleteMany();
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
    const banksService = new BanksService(prisma);

    const createdBank = await banksService.create({
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
      companyName: "ESCOLA BANCOS",
      companyDocument: "11222333000144",
      bankCode: "756",
      bankName: "SICOOB",
      branchNumber: "1234",
      branchDigit: "0",
      accountNumber: "98765",
      accountDigit: "1",
      walletCode: "1",
      agreementCode: "445566",
      pixKey: "financeiro@escola.com",
      beneficiaryName: "ESCOLA BANCOS",
      beneficiaryDocument: "11222333000144",
      notes: "CONTA PRINCIPAL",
    });

    assert.equal(createdBank.bankName, "SICOOB");
    assert.equal(createdBank.status, "ACTIVE");

    const listedBanks = await banksService.list({
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
      status: "ALL",
    });

    assert.equal(listedBanks.length, 1);

    const updatedBank = await banksService.update(createdBank.id, {
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
      bankCode: "756",
      bankName: "SICOOB CENTRAL",
      branchNumber: "1234",
      branchDigit: "0",
      accountNumber: "98765",
      accountDigit: "1",
      walletCode: "2",
      agreementCode: "778899",
      pixKey: "cobranca@escola.com",
      beneficiaryName: "ESCOLA BANCOS",
      beneficiaryDocument: "11222333000144",
      notes: "CONTA ATUALIZADA",
    });

    assert.equal(updatedBank.bankName, "SICOOB CENTRAL");
    assert.equal(updatedBank.walletCode, "2");

    const inactivatedBank = await banksService.inactivate(createdBank.id, {
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
    });

    assert.equal(inactivatedBank.status, "INACTIVE");
    assert.ok(inactivatedBank.canceledAt);

    const activatedBank = await banksService.activate(createdBank.id, {
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
    });

    assert.equal(activatedBank.status, "ACTIVE");
    assert.equal(activatedBank.canceledAt, null);

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

    const boletoBank = await banksService.create({
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      companyName: "ESCOLA TESTE",
      companyDocument: "12345678000199",
      bankCode: "341",
      bankName: "ITAU",
      branchNumber: "1234",
      branchDigit: "5",
      accountNumber: "45678",
      accountDigit: "9",
      walletCode: "109",
      agreementCode: "998877",
      pixKey: "boletos@escola.com",
      beneficiaryName: "ESCOLA TESTE",
      beneficiaryDocument: "12345678000199",
      notes: "BANCO DE BOLETOS",
    });

    const installmentsBeforeSettlement = await receivablesService.listInstallments(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        status: "OPEN",
      },
    );

    assert.equal(installmentsBeforeSettlement.length, 1);
    assert.equal(installmentsBeforeSettlement[0].openAmount, 850);

    const bankAssignment = await receivablesService.assignBankToInstallments(
      importResult.batchId,
      {
        requestedBy: "CODEX",
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        bankAccountId: boletoBank.id,
        installmentIds: [installmentsBeforeSettlement[0].id],
      },
    );

    assert.equal(bankAssignment.updatedCount, 1);
    assert.equal(bankAssignment.bankAccountId, boletoBank.id);

    const installmentsAfterAssignment = await receivablesService.listInstallments(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        batchId: importResult.batchId,
        status: "OPEN",
      },
    );

    assert.equal(installmentsAfterAssignment.length, 1);
    assert.equal(
      installmentsAfterAssignment[0].bankAccountId,
      boletoBank.id,
    );
    assert.match(
      installmentsAfterAssignment[0].bankAccountLabel,
      /ITAU/i,
    );

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
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { force: true });
    }
  }
}

main().catch((error) => {
  console.error("TEST_FAILURE", error);
  process.exitCode = 1;
});
