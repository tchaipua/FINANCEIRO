const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./company-branches-directory.test.db");

if (fs.existsSync(testDbPath)) {
  fs.rmSync(testDbPath, { force: true });
}
fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/company-branches-directory.test.db";

const { PrismaService } = require("../dist/prisma/prisma.service.js");
const {
  CompaniesService,
} = require("../dist/modules/companies/application/companies.service.js");
const { financeContext } = require("../dist/common/finance-context.js");

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    const sourceTenantId = `TEST_BRANCH_DIRECTORY_${Date.now()}`;
    const company = await prisma.company.create({
      data: {
        sourceSystem: "TEST",
        sourceTenantId,
        name: "EMPRESA TESTE FILIAIS",
        status: "ACTIVE",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    const firstBranch = await prisma.companyBranch.create({
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
    const legacyProducts = await Promise.all([
      prisma.product.create({
        data: {
          companyId: company.id,
          branchCode: 1,
          name: "PRODUTO LEGADO 1",
          createdBy: "TEST",
          updatedBy: "TEST",
        },
      }),
      prisma.product.create({
        data: {
          companyId: company.id,
          branchCode: 1,
          name: "PRODUTO LEGADO 2",
          createdBy: "TEST",
          updatedBy: "TEST",
        },
      }),
    ]);
    await prisma.companyBranch.create({
      data: {
        companyId: company.id,
        branchCode: 2,
        name: "FILIAL 2",
        isActive: true,
        isDefault: false,
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    const otherCompany = await prisma.company.create({
      data: {
        sourceSystem: "TEST",
        sourceTenantId: `${sourceTenantId}_OUTRA`,
        name: "OUTRA EMPRESA",
        status: "ACTIVE",
        createdBy: "TEST",
        updatedBy: "TEST",
      },
    });
    await prisma.companyBranch.create({
      data: {
        companyId: otherCompany.id,
        branchCode: 1,
        name: "FILIAL DE OUTRA EMPRESA",
        isActive: true,
        isDefault: true,
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
      branchId: firstBranch.id,
      scopes: ["FINANCE_ACCESS", "MANAGE_FINANCIAL", "FINANCE_ADMIN"],
    };

    const regularBranchRead = await financeContext.run(context, async () =>
      await prisma.companyBranch.findMany({ where: { companyId: company.id } }),
    );
    assert.equal(regularBranchRead.length, 1);
    assert.equal(regularBranchRead[0].branchCode, 1);

    const companies = new CompaniesService(prisma);
    const directory = await financeContext.run(context, async () =>
      await companies.listBranches(company.id, {
        sourceSystem: "TEST",
        sourceTenantId,
      }),
    );

    assert.deepEqual(
      directory.map((branch) => branch.branchCode),
      [1, 2],
    );
    assert.equal(
      directory.some((branch) => branch.name === "FILIAL DE OUTRA EMPRESA"),
      false,
    );

    let centralLaunchRequest;
    const companiesWithCentralEditor = new CompaniesService(prisma, {
      createLaunch: async (request) => {
        centralLaunchRequest = request;
        return { editorUrl: "https://central.test/branch-editor" };
      },
    });
    await financeContext.run(context, async () =>
      companiesWithCentralEditor.createCentralBranchEditorLaunch(
        company.id,
        firstBranch.id,
        { sourceSystem: "TEST", sourceTenantId },
        { centralTenantId: "A0115F07-4562-4363-9D7D-AF749FA79BED" },
      ),
    );
    assert.equal(
      centralLaunchRequest.tenantId,
      "a0115f07-4562-4363-9d7d-af749fa79bed",
    );
    assert.equal(centralLaunchRequest.branchCode, 1);

    let centralConfigurationRequest;
    const companiesWithCentralSynchronization = new CompaniesService(prisma, {
      findConfiguration: async (tenantId, branchCode) => {
        centralConfigurationRequest = { tenantId, branchCode };
        return {
          tenant: {
            id: tenantId,
            displayName: "EMPRESA CENTRAL",
            company: {
              legalName: "EMPRESA CENTRAL LTDA",
              tradeName: "EMPRESA CENTRAL",
              documentNumber: "11222333000144",
            },
          },
          branch: {
            id: "central-branch-1",
            tenantId,
            branchCode,
            displayName: "MATRIZ CENTRAL",
            status: "ACTIVE",
            company: {},
          },
          effective: {
            commerce: {
              stockControlMode: "BY_PRODUCT",
              stockIntegerQuantityMode: "YES",
              stockLotControlMode: "NO",
              stockExpirationControlMode: "NO",
              stockGridControlMode: "NO",
              stockNegativeControlMode: "NO",
              stockClassificationMode: "GROUP_AND_SUBGROUP",
              notifyMinimumStockOnMovement: true,
              allowSaleUnitPriceEdit: false,
              allowSaleItemDiscount: false,
              groupSameProduct: true,
              allowProductImageEdit: true,
              requirePasswordToRemoveSaleItems: true,
              businessType: "ESCOLA",
            },
          },
        };
      },
    });
    const centralTenantId = "a0115f07-4562-4363-9d7d-af749fa79bed";
    const refreshedBranch = await financeContext.run(context, async () =>
      companiesWithCentralSynchronization.refreshCentralBranchConfiguration(
        company.id,
        firstBranch.id,
        { sourceSystem: "TEST", sourceTenantId, centralTenantId },
      ),
    );
    assert.deepEqual(centralConfigurationRequest, {
      tenantId: centralTenantId,
      branchCode: 1,
    });
    assert.equal(refreshedBranch.name, "MATRIZ CENTRAL");
    assert.equal(
      refreshedBranch.stockClassificationMode,
      "GROUP_AND_SUBGROUP",
    );
    const defaultGroup = await prisma.productGroup.findFirst({
      where: {
        companyId: company.id,
        branchCode: 1,
        name: "PADRÃO",
        canceledAt: null,
      },
    });
    assert.ok(defaultGroup);
    const defaultSubgroup = await prisma.productSubgroup.findFirst({
      where: {
        companyId: company.id,
        branchCode: 1,
        groupId: defaultGroup.id,
        name: "PADRÃO",
        canceledAt: null,
      },
    });
    assert.ok(defaultSubgroup);
    const backfilledProducts = await prisma.product.findMany({
      where: { id: { in: legacyProducts.map((product) => product.id) } },
    });
    assert.equal(backfilledProducts.every((product) => product.groupId === defaultGroup.id), true);
    assert.equal(backfilledProducts.every((product) => product.subgroupId === defaultSubgroup.id), true);
    const synchronizationAudit = await prisma.sourceIntegrationAuditEvent.findFirst({
      where: {
        companyId: company.id,
        branchCode: 1,
        action: "CENTRAL_BRANCH_CONFIGURATION_SYNCHRONIZED",
      },
      orderBy: { occurredAt: "desc" },
    });
    assert.ok(synchronizationAudit);
    assert.match(
      synchronizationAudit.metadataJson || "",
      /"centralTenantId":"a0115f07-4562-4363-9d7d-af749fa79bed"/,
    );
    console.log("Financeiro: diretório de filiais da empresa aprovado.");
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
