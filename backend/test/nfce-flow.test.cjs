const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./nfce-flow.test.db");
if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/nfce-flow.test.db";

const { PrismaService } = require("../dist/prisma/prisma.service.js");
const { NfceService } = require("../dist/modules/fiscal-documents/application/nfce/nfce.service.js");

async function ensureSchema(prisma) {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nfce_profiles'",
  );
  if (tables.length) return;
  const migrationSql = fs.readFileSync(
    path.resolve(__dirname, "../prisma/migrations/20260714121000_add_nfce_sale_flow/migration.sql"),
    "utf8",
  );
  for (const statement of migrationSql.split(";").map((item) => item.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  try {
    await ensureSchema(prisma);
    const company = await prisma.company.create({
      data: {
        sourceSystem: "TEST",
        sourceTenantId: `NFCE-${Date.now()}`,
        name: "EMPRESA TESTE NFC-E",
        document: "45364981000194",
      },
    });
    await prisma.companyBranch.create({
      data: { companyId: company.id, branchCode: 99, name: "FILIAL NFC-E", isActive: true },
    });
    const certificate = await prisma.fiscalCertificate.create({
      data: {
        companyId: company.id,
        branchCode: 99,
        environment: "HOMOLOGATION",
        purpose: "NFCE",
        aliasName: "CERTIFICADO TESTE",
        authorStateCode: "35",
        holderName: "EMPRESA TESTE NFC-E",
        holderDocument: "45364981000194",
        pfxEncryptedBase64: "INVALID",
        passwordEncrypted: "INVALID",
      },
    });
    const profile = await prisma.nfceProfile.create({
      data: {
        companyId: company.id,
        branchCode: 99,
        certificateId: certificate.id,
        environment: "HOMOLOGATION",
        autoIssueOnSale: true,
        series: 1,
        nextNumber: 1,
        stateCode: "35",
        cityCode: "3521309",
        stateRegistration: "361001792116",
        legalName: "EMPRESA TESTE NFC-E",
        taxRegimeCode: "3",
        street: "RUA TESTE",
        number: "1",
        neighborhood: "CENTRO",
        city: "IPUA",
        state: "SP",
        postalCode: "14610000",
      },
    });
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        branchCode: 99,
        name: "PRODUTO NFC-E",
        internalCode: `NFCE-${Date.now()}`,
        ncmCode: "61091000",
      },
    });
    const sale = await prisma.sale.create({
      data: {
        companyId: company.id,
        branchCode: 99,
        sourceSystem: "TEST",
        sourceTenantId: company.sourceTenantId,
        saleNumber: `VENDA-NFCE-${Date.now()}`,
        customerNameSnapshot: "CONSUMIDOR FINAL",
        subtotalAmount: 7,
        totalAmount: 7,
        paidAmount: 3,
        receivableAmount: 4,
      },
    });
    await prisma.saleItem.create({
      data: {
        companyId: company.id,
        branchCode: 99,
        saleId: sale.id,
        productId: product.id,
        lineNumber: 1,
        productNameSnapshot: product.name,
        productCodeSnapshot: product.internalCode,
        unitCodeSnapshot: "UN",
        quantity: 1,
        unitPrice: 7,
        totalAmount: 7,
      },
    });
    for (const method of ["CASH", "CREDIT_CARD", "DEBIT_CARD", "TERM", "INSTALLMENT", "BOLETO", "PIX"]) {
      await prisma.salePayment.create({
        data: {
          companyId: company.id,
          branchCode: 99,
          saleId: sale.id,
          paymentMethod: method,
          amount: 1,
          status: method === "PIX" ? "PAID" : "OPEN",
        },
      });
    }

    const service = new NfceService(prisma);
    const first = await service.issueForSaleAfterConfirmation(company.id, sale.id, "TESTE");
    const second = await service.issueForSaleAfterConfirmation(company.id, sale.id, "TESTE");
    const documents = await prisma.fiscalDocument.findMany({ where: { saleId: sale.id } });
    const attempts = await prisma.fiscalDocumentAttempt.findMany({
      where: { fiscalDocumentId: documents[0].id },
    });
    const updatedProfile = await prisma.nfceProfile.findUnique({ where: { id: profile.id } });

    assert.equal(first.status, "ERROR");
    assert.equal(second.status, "ERROR");
    assert.equal(documents.length, 1);
    assert.equal(documents[0].number, 1);
    assert.equal(updatedProfile.nextNumber, 2);
    assert.equal(attempts.length, 2);
    process.stdout.write("NFC-e flow idempotency: OK\n");
  } finally {
    await prisma.onModuleDestroy();
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`NFC_E_FLOW_FAILURE ${error?.stack || error}\n`);
  process.exitCode = 1;
});
