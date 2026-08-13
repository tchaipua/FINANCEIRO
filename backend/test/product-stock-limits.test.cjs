const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./product-stock-limits.test.db");

if (fs.existsSync(testDbPath)) {
  fs.rmSync(testDbPath, { force: true });
}
fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/product-stock-limits.test.db";

const { PrismaService } = require("../dist/prisma/prisma.service.js");
const {
  ProductsService,
} = require("../dist/modules/products/application/products.service.js");
const { financeContext } = require("../dist/common/finance-context.js");

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    const sourceTenantId = `TEST_STOCK_LIMITS_${Date.now()}`;
    const company = await prisma.company.create({
      data: {
        sourceSystem: "TEST",
        sourceTenantId,
        name: "TESTE LIMITES DE ESTOQUE",
        status: "ACTIVE",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    const branch = await prisma.companyBranch.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        name: "MATRIZ",
        isActive: true,
        isDefault: true,
        stockControlMode: "BY_PRODUCT",
        stockIntegerQuantityMode: "BY_PRODUCT",
        stockNegativeControlMode: "BY_PRODUCT",
        notifyMinimumStockOnMovement: true,
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    const products = new ProductsService(prisma);
    const context = {
      authenticated: true,
      branchCode: 1,
      sourceSystem: "TEST",
      sourceTenantId,
      sourceBranchCode: 1,
      sourceUserId: "TEST",
      companyId: company.id,
      branchId: branch.id,
      scopes: ["FINANCE_ACCESS", "MANAGE_FINANCIAL", "FINANCE_ADMIN"],
    };

    const product = await financeContext.run(context, () =>
      products.create({
        requestedBy: "TEST",
        sourceSystem: "TEST",
        sourceTenantId,
        name: "PRODUTO COM LIMITES",
        internalCode: "990001",
        unitCode: "UN",
        productType: "GOODS",
        tracksInventory: true,
        allowFraction: false,
        currentStock: 6,
        minimumStock: 5,
        maximumStock: 10,
      }),
    );

    assert.equal(product.minimumStock, 5);
    assert.equal(product.maximumStock, 10);

    const movement = await financeContext.run(context, () =>
      products.createManualStockMovement(product.id, {
        requestedBy: "TEST",
        sourceSystem: "TEST",
        sourceTenantId,
        operationId: "LIMITES-EXIT-001",
        movementType: "EXIT",
        quantity: 1,
        notes: "TESTE DO AVISO DE ESTOQUE MÍNIMO",
      }),
    );

    assert.equal(movement.resultingStock, 5);
    assert.equal(movement.minimumStockReached, true);
    assert.match(movement.minimumStockWarning, /estoque mínimo/i);

    await assert.rejects(
      () =>
        financeContext.run(context, () =>
          products.create({
            requestedBy: "TEST",
            sourceSystem: "TEST",
            sourceTenantId,
            name: "PRODUTO COM LIMITE INVÁLIDO",
            internalCode: "990002",
            tracksInventory: true,
            currentStock: 1,
            minimumStock: 8,
            maximumStock: 7,
          }),
        ),
      /estoque máximo deve ser maior ou igual ao estoque mínimo/i,
    );

    console.log("Financeiro: limites e aviso de estoque mínimo aprovados.");
  } finally {
    await prisma.onModuleDestroy();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
