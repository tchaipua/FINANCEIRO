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
