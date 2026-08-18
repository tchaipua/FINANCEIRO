const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./product-classification-flow.test.db");

if (fs.existsSync(testDbPath)) {
  fs.rmSync(testDbPath, { force: true });
}
fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/product-classification-flow.test.db";

const { PrismaService } = require("../dist/prisma/prisma.service.js");
const { ProductsService } = require("../dist/modules/products/application/products.service.js");
const { financeContext } = require("../dist/common/finance-context.js");
const {
  summarizeProductClassification,
} = require("../dist/common/product-classification.js");

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    const sourceTenantId = `TEST_PRODUCT_CLASSIFICATION_${Date.now()}`;
    const company = await prisma.company.create({
      data: {
        sourceSystem: "TEST",
        sourceTenantId,
        name: "EMPRESA TESTE CLASSIFICAÇÃO",
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
        stockClassificationMode: "GROUP_ONLY",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    const group = await prisma.productGroup.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        name: "MERCADORIAS",
        status: "ACTIVE",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    const legacyProduct = await prisma.product.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        name: "PRODUTO LEGADO",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    const classificationSummary = await summarizeProductClassification(prisma, {
      companyId: company.id,
      branchCode: 1,
      mode: "GROUP_ONLY",
    });
    assert.equal(classificationSummary.status, "PENDING_CLASSIFICATION");
    assert.equal(classificationSummary.productsAwaitingClassification, 1);
    const backfilledLegacyProduct = await prisma.product.findUnique({
      where: { id: legacyProduct.id },
    });
    assert.equal(backfilledLegacyProduct.groupId, null);
    assert.equal(backfilledLegacyProduct.subgroupId, null);
    const subgroup = await prisma.productSubgroup.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        groupId: group.id,
        name: "GERAL",
        status: "ACTIVE",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });

    const context = {
      authenticated: true,
      branchCode: 1,
      sourceSystem: "TEST",
      sourceTenantId,
      sourceBranchCode: 1,
      sourceUserId: "TEST",
      companyId: company.id,
      branchId: branch.id,
      scopes: ["FINANCE_ACCESS", "FINANCE_ADMIN"],
    };
    const products = new ProductsService(prisma);
    const basePayload = {
      sourceSystem: "TEST",
      sourceTenantId,
      requestedBy: "TEST",
    };
    assert.deepEqual(
      await prisma.productGroup.findFirst({
        where: {
          id: group.id,
          companyId: company.id,
          branchCode: 1,
          status: "ACTIVE",
          canceledAt: null,
        },
        select: { id: true },
      }),
      { id: group.id },
    );

    await assert.rejects(
      () => financeContext.run(context, () => products.create({ ...basePayload, name: "SEM GRUPO" })),
      /Informe o grupo do produto/,
    );

    const groupOnlyProduct = await financeContext.run(context, () =>
      products.create({ ...basePayload, name: "SOMENTE GRUPO", groupId: group.id }),
    );
    assert.equal(groupOnlyProduct.groupId, group.id);
    assert.equal(groupOnlyProduct.subgroupId, null);

    await prisma.companyBranch.update({
      where: { id: branch.id },
      data: { stockClassificationMode: "GROUP_AND_SUBGROUP" },
    });

    await assert.rejects(
      () =>
        financeContext.run(context, () =>
          products.create({ ...basePayload, name: "SEM SUBGRUPO", groupId: group.id }),
        ),
      /Informe o subgrupo do produto/,
    );

    const fullyClassifiedProduct = await financeContext.run(context, () =>
      products.create({
        ...basePayload,
        name: "GRUPO E SUBGRUPO",
        groupId: group.id,
        subgroupId: subgroup.id,
      }),
    );
    assert.equal(fullyClassifiedProduct.groupId, group.id);
    assert.equal(fullyClassifiedProduct.subgroupId, subgroup.id);

    console.log("Financeiro: obrigatoriedade de grupo e subgrupo aprovada.");
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
