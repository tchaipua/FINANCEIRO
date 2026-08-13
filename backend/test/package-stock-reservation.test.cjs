const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./package-stock-reservation.test.db");
if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/package-stock-reservation.test.db";

const { PrismaService } = require("../dist/prisma/prisma.service.js");
const { SalesService } = require("../dist/modules/sales/application/sales.service.js");
const { ProductsService } = require("../dist/modules/products/application/products.service.js");

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sourceSystem = "PROJETO_INICIAL";
  const sourceTenantId = `PETSHOP-${suffix}`.toUpperCase();
  const cashierUserId = `USER-${suffix}`.toUpperCase();
  const sales = new SalesService(
    prisma,
    {},
    { issueForSaleAfterConfirmation: async () => ({ status: "NOT_CONFIGURED" }) },
    { issueForSaleAfterConfirmation: async () => ({ status: "NOT_CONFIGURED" }) },
  );
  const products = new ProductsService(prisma);
  try {
    const company = await prisma.company.create({
      data: {
        sourceSystem,
        sourceTenantId,
        name: `PETSHOP ${suffix}`,
        status: "ACTIVE",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    await prisma.companyBranch.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        name: "MATRIZ",
        isActive: true,
        isDefault: true,
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        name: `VACINA ${suffix}`,
        unitCode: "UN",
        productType: "GOODS",
        tracksInventory: true,
        allowFraction: false,
        allowsNegativeStock: false,
        currentStock: 10,
        minimumStock: 0,
        salePrice: 25,
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    await prisma.productStockBalance.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        productId: product.id,
        variantKey: "COR:GERAL|NUM:GERAL|LOTE:GERAL",
        quantity: 10,
        reservedQuantity: 0,
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    await prisma.cashSession.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        sourceSystem,
        sourceTenantId,
        cashierUserId,
        cashierDisplayName: "OPERADOR TESTE",
        status: "OPEN",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });

    const sale = await sales.create({
      requestedBy: cashierUserId,
      sourceSystem,
      sourceTenantId,
      sourceBranchCode: 1,
      saleChannel: "PET_PACKAGE",
      cashierUserId,
      cashierDisplayName: "OPERADOR TESTE",
      items: [
        {
          productId: product.id,
          quantity: 4,
          unitPrice: 25,
          deferInventory: true,
        },
      ],
      payments: [{ paymentMethod: "CASH", amount: 100 }],
    });

    let balance = await prisma.productStockBalance.findFirstOrThrow({
      where: { companyId: company.id, branchCode: 1, productId: product.id },
    });
    assert.equal(balance.quantity, 10);
    assert.equal(balance.reservedQuantity, 4);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).currentStock, 10);

    const listed = await products.list({ sourceSystem, sourceTenantId, sourceBranchCode: 1 });
    const summary = listed.find((item) => item.id === product.id);
    assert.equal(summary.committedStock, 4);
    assert.equal(summary.availableStock, 6);

    const first = await sales.consumeReservedStock(sale.id, {
      requestedBy: cashierUserId,
      sourceSystem,
      sourceTenantId,
      sourceBranchCode: 1,
      sourceUsageId: "ATENDIMENTO-001",
      items: [{ productId: product.id, quantity: 1 }],
    });
    assert.equal(first.idempotent, false);
    const repeated = await sales.consumeReservedStock(sale.id, {
      requestedBy: cashierUserId,
      sourceSystem,
      sourceTenantId,
      sourceBranchCode: 1,
      sourceUsageId: "ATENDIMENTO-001",
      items: [{ productId: product.id, quantity: 1 }],
    });
    assert.equal(repeated.idempotent, true);

    balance = await prisma.productStockBalance.findFirstOrThrow({
      where: { companyId: company.id, branchCode: 1, productId: product.id },
    });
    assert.equal(balance.quantity, 9);
    assert.equal(balance.reservedQuantity, 3);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).currentStock, 9);
    assert.equal(
      await prisma.stockMovement.count({
        where: { companyId: company.id, sourceType: "PACKAGE_CONSUMPTION" },
      }),
      1,
    );
    console.log("Reserva, previsão e baixa idempotente de produtos de pacote validadas.");
  } finally {
    await prisma.$disconnect();
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
