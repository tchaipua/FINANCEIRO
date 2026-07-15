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
const {
  CompaniesService,
} = require("../dist/modules/companies/application/companies.service.js");
const {
  ProductsService,
} = require("../dist/modules/products/application/products.service.js");
const {
  SalesService,
} = require("../dist/modules/sales/application/sales.service.js");
const {
  evaluateBankReturnForInstallment,
} = require("../dist/modules/receivables/application/bank-return.utils.js");

async function resetDatabase(prisma) {
  await prisma.fiscalDocumentAttempt.deleteMany();
  await prisma.fiscalDocument.deleteMany();
  await prisma.nfceProfile.deleteMany();
  await prisma.salePayment.deleteMany();
  await prisma.saleReturnItem.deleteMany();
  await prisma.saleReturn.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.payableInstallment.deleteMany();
  await prisma.payableTitle.deleteMany();
  await prisma.payableInvoiceImportInstallment.deleteMany();
  await prisma.payableInvoiceImportItem.deleteMany();
  await prisma.payableInvoiceImport.deleteMany();
  await prisma.fiscalCertificate.deleteMany();
  await prisma.productStockBalance.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.bankStatementMovement.deleteMany();
  await prisma.bankStatementImport.deleteMany();
  await prisma.bankReturnImportItem.deleteMany();
  await prisma.bankReturnImport.deleteMany();
  await prisma.installmentSettlement.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.customerCreditMovement.deleteMany();
  await prisma.customerCredit.deleteMany();
  await prisma.receivableInstallment.deleteMany();
  await prisma.receivableTitle.deleteMany();
  await prisma.receivableBatch.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.party.deleteMany();
  await prisma.screenParameter.deleteMany();
  await prisma.companyBranch.deleteMany();
  await prisma.company.deleteMany();
}

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const nfceTables = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nfce_profiles'",
  );
  if (!nfceTables.length) {
    const migrationSql = fs.readFileSync(
      path.resolve(__dirname, "../prisma/migrations/20260714121000_add_nfce_sale_flow/migration.sql"),
      "utf8",
    );
    for (const statement of migrationSql.split(";").map((item) => item.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }

  try {
    await resetDatabase(prisma);

    const liquidatedOpenInstallment = evaluateBankReturnForInstallment({
      movementStatus: "LIQUIDATED",
      installment: {
        id: "INST_001",
        sourceInstallmentKey: "MENSALIDADE:ALUNO_001:2026-04:1",
        status: "OPEN",
        openAmount: 850,
        paidAmount: 0,
        settledAt: null,
      },
    });

    assert.equal(liquidatedOpenInstallment.canApply, true);
    assert.equal(
      liquidatedOpenInstallment.noteText,
      "VAI BAIXAR BOLETO.",
    );

    const writeOffInstallment = evaluateBankReturnForInstallment({
      movementStatus: "WRITE_OFF",
      installment: {
        id: "INST_001",
        sourceInstallmentKey: "MENSALIDADE:ALUNO_001:2026-04:1",
        status: "OPEN",
        openAmount: 850,
        paidAmount: 0,
        settledAt: null,
      },
    });

    assert.equal(writeOffInstallment.canApply, false);
    assert.equal(
      writeOffInstallment.noteText,
      "BOLETO BAIXADO NO BANCO - NÃO BAIXA PARCELA.",
    );

    const receivablesService = new ReceivablesService(prisma);
    const cashSessionsService = new CashSessionsService(prisma);
    const banksService = new BanksService(prisma);
    const companiesService = new CompaniesService(prisma);
    const productsService = new ProductsService(prisma);
    const salesService = new SalesService(prisma, {}, {
      issueForSaleAfterConfirmation: async () => ({ status: "NOT_CONFIGURED" }),
    });

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

    const statementBanksService = new BanksService(prisma, {
      downloadStatement: async () => ({
        accountNumber: 987651,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-02",
        balance: 1250.25,
        months: [{ month: 5, year: 2026, statusCode: 200 }],
        transactions: [
          {
            tipo: "CREDITO",
            valor: 1500.5,
            data: "2026-05-01",
            descricao: "CRED.LIQUIDACAO COBRANCA",
            numeroDocumento: "1001",
          },
          {
            tipo: "DEBITO",
            valor: 250.25,
            data: "2026-05-02",
            descricao: "TARIFA BANCARIA",
            numeroDocumento: "2001",
          },
        ],
      }),
    });

    const statementBank = await statementBanksService.create({
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
      companyName: "ESCOLA BANCOS",
      companyDocument: "11222333000144",
      bankCode: "756",
      bankName: "SICOOB EXTRATO",
      branchNumber: "4321",
      branchDigit: "4",
      accountNumber: "964",
      accountDigit: "4",
      beneficiaryName: "ESCOLA BANCOS",
      beneficiaryDocument: "11222333000144",
      billingProvider: "SICOOB",
      billingApiClientId: "CLIENT_ID_TESTE",
      billingCertificateBase64: Buffer.from("CERTIFICADO TESTE").toString("base64"),
      billingCertificatePassword: "SENHA_TESTE",
    });

    const firstStatement = await statementBanksService.getStatement(statementBank.id, {
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-02",
      requestedBy: "CODEX",
    });

    assert.equal(firstStatement.movementCount, 2);
    assert.equal(firstStatement.persistedMovementCount, 2);
    assert.equal(firstStatement.createdMovementCount, 2);
    assert.equal(firstStatement.duplicateMovementCount, 0);
    assert.equal(firstStatement.creditAmount, 1500.5);
    assert.equal(firstStatement.debitAmount, 250.25);
    assert.equal(firstStatement.movements[0].balanceAfter, 1500.5);
    assert.equal(firstStatement.movements[1].balanceAfter, 1250.25);

    const storedStatementMovements = await prisma.bankStatementMovement.count({
      where: {
        bankAccountId: statementBank.id,
      },
    });

    assert.equal(storedStatementMovements, 2);

    const secondStatement = await statementBanksService.getStatement(statementBank.id, {
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-02",
      requestedBy: "CODEX",
    });

    assert.equal(secondStatement.persistedMovementCount, 2);
    assert.equal(secondStatement.createdMovementCount, 0);
    assert.equal(secondStatement.duplicateMovementCount, 2);

    const savedStatement = await statementBanksService.getSavedStatement(statementBank.id, {
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_BANCOS",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-02",
    });

    assert.equal(savedStatement.movementCount, 2);
    assert.equal(savedStatement.persistedMovementCount, 2);
    assert.equal(savedStatement.creditAmount, 1500.5);
    assert.equal(savedStatement.debitAmount, 250.25);
    assert.equal(savedStatement.movements[0].balanceAfter, 1500.5);
    assert.equal(savedStatement.movements[1].balanceAfter, 1250.25);
    assert.equal(
      await prisma.bankStatementMovement.count({
        where: {
          bankAccountId: statementBank.id,
        },
      }),
      2,
    );
    assert.equal(
      await prisma.bankStatementImport.count({
        where: {
          bankAccountId: statementBank.id,
        },
      }),
      2,
    );

    const importResult = await receivablesService.import({
      requestedBy: "CODEX",
      companyName: "ESCOLA TESTE",
      companyDocument: "12345678000199",
      financialSettings: {
        interestRate: 5,
        penaltyRate: 2,
        penaltyValue: 0,
        interestGracePeriod: 5,
        penaltyGracePeriod: 5,
      },
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
              installmentCount: 2,
              dueDate: "2026-04-10",
              amount: 850,
              sourceInstallmentKey: "MENSALIDADE:ALUNO_001:2026-04:1",
            },
            {
              installmentNumber: 2,
              installmentCount: 2,
              dueDate: "2026-05-10",
              amount: 150,
              sourceInstallmentKey: "MENSALIDADE:ALUNO_001:2026-04:2",
            },
          ],
        },
      ],
    });

    assert.equal(importResult.importedTitles, 1);
    assert.equal(importResult.importedInstallments, 2);

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

    assert.equal(installmentsBeforeSettlement.length, 2);
    const firstInstallment = installmentsBeforeSettlement.find(
      (item) => item.sourceInstallmentKey === "MENSALIDADE:ALUNO_001:2026-04:1",
    );
    const secondInstallment = installmentsBeforeSettlement.find(
      (item) => item.sourceInstallmentKey === "MENSALIDADE:ALUNO_001:2026-04:2",
    );

    assert.ok(firstInstallment);
    assert.ok(secondInstallment);
    assert.equal(firstInstallment.openAmount, 850);
    assert.equal(secondInstallment.openAmount, 150);
    assert.equal(firstInstallment.interestRate, 5);
    assert.equal(firstInstallment.penaltyRate, 2);
    assert.equal(firstInstallment.penaltyGracePeriod, 5);

    const importedWithoutFinancialSettings = await receivablesService.import({
      requestedBy: "CODEX",
      companyName: "ESCOLA TESTE",
      companyDocument: "12345678000199",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      sourceBatchType: "MENSALIDADE",
      sourceBatchId: "LOTE_TESTE_002",
      referenceDate: "2026-06-01",
      metadata: {
        scope: "ALL",
      },
      skippedItems: [],
      items: [
        {
          sourceEntityType: "ALUNO",
          sourceEntityId: "ALUNO_002",
          sourceEntityName: "ALUNO TESTE 2",
          classLabel: "6 ANO A",
          businessKey:
            "ESCOLA:TENANT_ESCOLA_TESTE:ALUNO:ALUNO_002:MENSALIDADE:2026-06",
          description: "MENSALIDADE 06/2026",
          categoryCode: "MENSALIDADE",
          issueDate: "2026-06-01",
          payer: {
            externalEntityType: "RESPONSAVEL",
            externalEntityId: "RESP_002",
            name: "MARIA TESTE 2",
            document: "12345678901",
            email: "maria2@teste.com",
            phone: "11999999998",
          },
          installments: [
            {
              installmentNumber: 1,
              installmentCount: 1,
              dueDate: "2026-06-10",
              amount: 200,
              sourceInstallmentKey: "MENSALIDADE:ALUNO_002:2026-06:1",
            },
          ],
        },
      ],
    });

    assert.equal(importedWithoutFinancialSettings.importedInstallments, 1);

    const preservedCompanySettings = await companiesService.list({
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
    });
    assert.equal(preservedCompanySettings.length, 1);
    assert.equal(preservedCompanySettings[0].interestRate, 5);
    assert.equal(preservedCompanySettings[0].penaltyRate, 2);

    const thirdInstallment = (
      await receivablesService.listInstallments({
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        batchId: importedWithoutFinancialSettings.batchId,
        status: "OPEN",
      })
    )[0];

    assert.ok(thirdInstallment);
    assert.equal(thirdInstallment.interestRate, 5);
    assert.equal(thirdInstallment.penaltyRate, 2);
    assert.equal(thirdInstallment.penaltyGracePeriod, 5);

    const bankAssignment = await receivablesService.assignBankToInstallments(
      importResult.batchId,
      {
        requestedBy: "CODEX",
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        bankAccountId: boletoBank.id,
        installmentIds: [firstInstallment.id, secondInstallment.id],
      },
    );

    assert.equal(bankAssignment.updatedCount, 2);
    assert.equal(bankAssignment.bankAccountId, boletoBank.id);

    const installmentsAfterAssignment = await receivablesService.listInstallments(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        batchId: importResult.batchId,
        status: "OPEN",
      },
    );

    assert.equal(installmentsAfterAssignment.length, 2);

    for (const installment of installmentsAfterAssignment) {
      assert.equal(installment.bankAccountId, boletoBank.id);
      assert.match(installment.bankAccountLabel, /ITAU/i);
    }

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
      firstInstallment.id,
      {
        requestedBy: "CODEX",
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        cashierUserId: "USR_CAIXA_001",
        cashierDisplayName: "CAIXA TESTE",
        receivedAt: "2026-04-23T10:00:00.000Z",
        notes: "RECEBIMENTO TESTE",
      },
    );

    assert.equal(settlement.status, "PAID");
    assert.equal(settlement.interestAmount, 11.33);
    assert.equal(settlement.penaltyAmount, 17);
    assert.equal(settlement.receivedAmount, 878.33);

    const pixSettlement = await cashSessionsService.settleManualInstallment(
      secondInstallment.id,
      {
        requestedBy: "CODEX",
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        cashierUserId: "USR_CAIXA_001",
        cashierDisplayName: "CAIXA TESTE",
        paymentMethod: "PIX",
        bankAccountId: boletoBank.id,
        receivedAt: "2026-05-10T10:00:00.000Z",
        notes: "RECEBIMENTO PIX",
      },
    );

    assert.equal(pixSettlement.status, "PAID");
    assert.equal(pixSettlement.receivedAmount, 150);
    assert.equal(pixSettlement.paymentMethod, "PIX");

    const currentSession = await cashSessionsService.getCurrent({
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      cashierUserId: "USR_CAIXA_001",
    });

    assert.equal(currentSession.totalReceivedAmount, 1028.33);
    assert.equal(currentSession.expectedClosingAmount, 978.33);
    assert.equal(currentSession.receivedByPaymentMethod.cash, 878.33);
    assert.equal(currentSession.receivedByPaymentMethod.pix, 150);
    assert.equal(currentSession.receivedByPaymentMethod.creditCard, 0);
    assert.equal(currentSession.receivedByPaymentMethod.debitCard, 0);
    assert.equal(currentSession.receivedByPaymentMethod.check, 0);

    const salesCompany = await prisma.company.findFirst({
      where: {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
      },
    });

    assert.ok(salesCompany);

    await prisma.companyBranch.upsert({
      where: {
        companyId_branchCode: {
          companyId: salesCompany.id,
          branchCode: 1,
        },
      },
      create: {
        companyId: salesCompany.id,
        branchCode: 1,
        name: "FILIAL TESTE",
        isActive: true,
        isDefault: true,
        inventoryControlType: "COLOR_SIZE",
        quantityPrecision: "INTEGER_ONLY",
        stockControlMode: "BY_PRODUCT",
        stockIntegerQuantityMode: "BY_PRODUCT",
        stockLotControlMode: "BY_PRODUCT",
        stockExpirationControlMode: "BY_PRODUCT",
        stockGridControlMode: "BY_PRODUCT",
        stockNegativeControlMode: "BY_PRODUCT",
        createdBy: "CODEX",
        updatedBy: "CODEX",
      },
      update: {
        inventoryControlType: "COLOR_SIZE",
        stockControlMode: "BY_PRODUCT",
        stockGridControlMode: "BY_PRODUCT",
        stockNegativeControlMode: "BY_PRODUCT",
        updatedBy: "CODEX",
      },
    });

    const productWithCodes = await productsService.create({
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      name: "PRODUTO TESTE CODIGOS",
      internalCode: "9001",
      sku: "SKU-CROSS-001",
      barcode: "789000000001",
      unitCode: "UN",
      productType: "GOODS",
      tracksInventory: true,
      allowFraction: false,
      usesColorSize: false,
      usesLotControl: false,
      usesExpirationControl: false,
      allowsNegativeStock: false,
      currentStock: 5,
      minimumStock: 1,
      salePrice: 15,
    });

    assert.equal(productWithCodes.internalCode, "9001");

    await assert.rejects(
      () =>
        productsService.create({
          requestedBy: "CODEX",
          sourceSystem: "ESCOLA",
          sourceTenantId: "TENANT_ESCOLA_TESTE",
          name: "PRODUTO TESTE CODIGO NAO NUMERICO",
          internalCode: "INT-CROSS-002",
          sku: "SKU-CROSS-003",
          barcode: "789000000004",
          unitCode: "UN",
          productType: "GOODS",
          tracksInventory: true,
          currentStock: 1,
          salePrice: 20,
        }),
      /código interno deve conter somente números/,
    );

    await assert.rejects(
      () =>
        productsService.create({
          requestedBy: "CODEX",
          sourceSystem: "ESCOLA",
          sourceTenantId: "TENANT_ESCOLA_TESTE",
          name: "PRODUTO TESTE CODIGO CRUZADO",
          internalCode: "789000000001",
          sku: "SKU-CROSS-002",
          barcode: "789000000002",
          unitCode: "UN",
          productType: "GOODS",
          tracksInventory: true,
          currentStock: 1,
          salePrice: 20,
        }),
      /já está usado como código de barras/,
    );

    await assert.rejects(
      () =>
        productsService.create({
          requestedBy: "CODEX",
          sourceSystem: "ESCOLA",
          sourceTenantId: "TENANT_ESCOLA_TESTE",
          name: "PRODUTO TESTE CODIGO REPETIDO NO CADASTRO",
          internalCode: "9002",
          sku: "9002",
          barcode: "789000000003",
          unitCode: "UN",
          productType: "GOODS",
          tracksInventory: true,
          currentStock: 1,
          salePrice: 20,
        }),
      /já foi informado em código interno/,
    );

    const genericProduct = await productsService.create({
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      name: "PRODUTO GENERICO",
      internalCode: "1",
      unitCode: "UN",
      productType: "GENERIC",
      tracksInventory: false,
      allowFraction: false,
      currentStock: 0,
      minimumStock: 0,
      purchasePrice: 0,
      salePrice: 1,
    });

    const genericSale = await salesService.create({
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      sourceBranchCode: 1,
      saleChannel: "TEST",
      cashierUserId: "USR_CAIXA_001",
      cashierDisplayName: "CAIXA TESTE",
      items: [
        {
          productId: genericProduct.id,
          description: "TAXA AVULSA TESTE",
          quantity: 1,
          unitCost: 12.3,
          unitPrice: 35.5,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 35.5,
        },
      ],
    });

    const genericSaleItem = await prisma.saleItem.findFirst({
      where: {
        saleId: genericSale.id,
      },
    });

    assert.equal(genericSale.totalAmount, 35.5);
    assert.equal(genericSaleItem.productNameSnapshot, "TAXA AVULSA TESTE");
    assert.equal(genericSaleItem.unitCost, 12.3);

    const gridProduct = await prisma.product.create({
      data: {
        companyId: salesCompany.id,
        branchCode: 1,
        name: "CAMISETA TESTE GRADE",
        unitCode: "UN",
        productType: "GOODS",
        tracksInventory: true,
        allowFraction: false,
        usesColorSize: true,
        usesLotControl: false,
        usesExpirationControl: false,
        allowsNegativeStock: false,
        currentStock: 10,
        minimumStock: 0,
        salePrice: 10,
        createdBy: "CODEX",
        updatedBy: "CODEX",
      },
    });

    await prisma.productStockBalance.create({
      data: {
        companyId: salesCompany.id,
        branchCode: 1,
        productId: gridProduct.id,
        variantKey: "COR:AMARELO|NUM:10|LOTE:GERAL",
        colorCode: "AMARELO",
        colorName: "AMARELO",
        sizeCode: "10",
        quantity: 2,
        reservedQuantity: 0,
        createdBy: "CODEX",
        updatedBy: "CODEX",
      },
    });

    await assert.rejects(
      () =>
        salesService.create({
          requestedBy: "CODEX",
          sourceSystem: "ESCOLA",
          sourceTenantId: "TENANT_ESCOLA_TESTE",
          sourceBranchCode: 1,
          saleChannel: "TEST",
          cashierUserId: "USR_CAIXA_001",
          cashierDisplayName: "CAIXA TESTE",
          items: [
            {
              productId: gridProduct.id,
              quantity: 1,
              unitPrice: 10,
              colorCode: "AZUL",
              colorName: "AZUL",
              sizeCode: "10",
            },
          ],
          payments: [
            {
              paymentMethod: "CASH",
              amount: 10,
            },
          ],
        }),
      /Saldo atual desta variação\/lote: 0/,
    );

    const approvedGridSale = await salesService.create({
      requestedBy: "CODEX",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT_ESCOLA_TESTE",
      sourceBranchCode: 1,
      saleChannel: "TEST",
      cashierUserId: "USR_CAIXA_001",
      cashierDisplayName: "CAIXA TESTE",
      items: [
        {
          productId: gridProduct.id,
          quantity: 1,
          unitPrice: 10,
          colorCode: "AMARELO",
          colorName: "AMARELO",
          sizeCode: "10",
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 10,
        },
      ],
    });

    assert.equal(approvedGridSale.totalAmount, 10);

    const gridBalanceAfterSale = await prisma.productStockBalance.findFirst({
      where: {
        companyId: salesCompany.id,
        branchCode: 1,
        productId: gridProduct.id,
        variantKey: "COR:AMARELO|NUM:10|LOTE:GERAL",
      },
    });
    const gridProductAfterSale = await prisma.product.findUnique({
      where: { id: gridProduct.id },
    });

    assert.equal(gridBalanceAfterSale.quantity, 1);
    assert.equal(gridProductAfterSale.currentStock, 9);

    const paidUnpreparedSettlement =
      await cashSessionsService.settleManualInstallment(thirdInstallment.id, {
        requestedBy: "CODEX",
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        cashierUserId: "USR_CAIXA_001",
        cashierDisplayName: "CAIXA TESTE",
        paymentMethod: "CASH",
        receivedAt: "2026-06-10T10:00:00.000Z",
        notes: "RECEBIMENTO SEM PREPARACAO",
      });

    assert.equal(paidUnpreparedSettlement.status, "PAID");

    const excludedFromBatch =
      await receivablesService.excludeInstallmentsFromBatch(
        importedWithoutFinancialSettings.batchId,
        {
          requestedBy: "CODEX",
          sourceSystem: "ESCOLA",
          sourceTenantId: "TENANT_ESCOLA_TESTE",
          installmentIds: [thirdInstallment.id],
        },
      );

    assert.equal(excludedFromBatch.updatedCount, 1);

    const installmentsAfterBatchExclusion =
      await receivablesService.listInstallments({
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        batchId: importedWithoutFinancialSettings.batchId,
        status: "ALL",
      });

    assert.equal(installmentsAfterBatchExclusion.length, 0);

    const excludedInstallment = await prisma.receivableInstallment.findUnique({
      where: { id: thirdInstallment.id },
      select: {
        batchId: true,
        batchRemovedAt: true,
        batchRemovedBy: true,
        canceledAt: true,
        status: true,
      },
    });

    assert.ok(excludedInstallment);
    assert.equal(excludedInstallment.batchId, importedWithoutFinancialSettings.batchId);
    assert.ok(excludedInstallment.batchRemovedAt);
    assert.equal(excludedInstallment.batchRemovedBy, "CODEX");
    assert.equal(excludedInstallment.canceledAt, null);
    assert.equal(excludedInstallment.status, "PAID");

    const installmentsAfterSettlement = await receivablesService.listInstallments(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_ESCOLA_TESTE",
        status: "PAID",
      },
    );

    assert.equal(installmentsAfterSettlement.length, 3);
    assert.ok(
      installmentsAfterSettlement.every((installment) => installment.status === "PAID"),
    );

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
