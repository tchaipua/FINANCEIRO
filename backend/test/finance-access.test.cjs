const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const sourceDbPath = path.resolve(__dirname, "../dev.db");
const testDbPath = path.resolve(__dirname, "./finance-access.test.db");
if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
fs.copyFileSync(sourceDbPath, testDbPath);
process.env.DATABASE_URL = "file:../test/finance-access.test.db";

const { PrismaService } = require("../dist/prisma/prisma.service.js");
const { financeContext } = require("../dist/common/finance-context.js");
const {
  getRequiredFinancePermissions,
} = require("../dist/common/finance-access-policy.js");
const {
  FinanceAccessService,
} = require("../dist/modules/finance-access/application/finance-access.service.js");
const {
  resolveSourceSystemPerson,
  confirmSourceSystemOperationCredential,
  updateSourceSystemUserConfirmationPin,
  updateSourceSystemUserPassword,
  upsertSourceSystemUser,
} = require("../dist/common/source-system-users.client.js");

async function runAs(context, operation) {
  return financeContext.run(
    {
      authenticated: true,
      branchCode: context.sourceBranchCode,
      scopes: ["FINANCE_ACCESS", "MANAGE_FINANCIAL", "FINANCE_ADMIN"],
      ...context,
    },
    operation,
  );
}

async function testSourceSystemUserCallback() {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SOURCE_SYSTEM_ESCOLA_API_URL;
  const originalSecret = process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET;
  const secret = "s".repeat(48);
  process.env.SOURCE_SYSTEM_ESCOLA_API_URL = "http://escola.internal:3001/api/v1";
  process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = secret;
  let call;
  global.fetch = async (url, init) => {
    call = { url: String(url), init };
    const responseBody = String(url).endsWith(
      "/integrations/financeiro/system-users/confirm-operation-credential",
    )
      ? { authenticated: true, authorizedBy: "ADMIN-CALLBACK" }
      : { found: true, name: "PESSOA TESTE" };
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await runAs(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-CALLBACK",
        sourceBranchCode: 3,
        sourceUserId: "ADMIN-CALLBACK",
        companyId: "COMPANY-CALLBACK",
      },
      () => resolveSourceSystemPerson("52998224725"),
    );
    assert.equal(result.found, true);
    assert.equal(
      call.url,
      "http://escola.internal:3001/api/v1/integrations/financeiro/system-users/resolve",
    );
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.redirect, "manual");
    assert.equal(call.init.headers["x-msinfor-scopes"], "SYSTEM_USERS_WRITE");
    const body = Buffer.from(call.init.body);
    const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
    assert.equal(call.init.headers["x-msinfor-content-sha256"], bodyHash);
    const payload = [
      "v1",
      "FINANCEIRO",
      "POST",
      "/api/v1/integrations/financeiro/system-users/resolve",
      call.init.headers["x-msinfor-timestamp"],
      call.init.headers["x-msinfor-nonce"],
      bodyHash,
      "TENANT-CALLBACK",
      "3",
      "ADMIN-CALLBACK",
      "SYSTEM_USERS_WRITE",
    ].join("\n");
    assert.equal(
      call.init.headers["x-msinfor-signature"],
      crypto.createHmac("sha256", secret).update(payload).digest("hex"),
    );
    assert.deepEqual(JSON.parse(body.toString("utf8")), {
      document: "52998224725",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-CALLBACK",
      sourceBranchCode: 3,
      requestedBy: "ADMIN-CALLBACK",
    });
    await runAs(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-CALLBACK",
        sourceBranchCode: 3,
        sourceUserId: "ADMIN-CALLBACK",
        companyId: "COMPANY-CALLBACK",
      },
      () => upsertSourceSystemUser({
        document: "52998224725",
        name: "PESSOA TESTE",
        email: "PESSOA@TESTE.LOCAL",
        login: "PESSOA.TESTE",
        password: "SenhaForte123!",
        confirmationPin: "1234",
        sourceRole: "ADMIN",
        sourceAccessProfile: "ADMIN_TOTAL",
        zipCode: "14020000",
        street: "RUA TESTE",
        number: "100",
        neighborhood: "CENTRO",
        complement: "SALA 2",
        city: "RIBEIRAO PRETO",
        state: "SP",
        branchCodes: [3],
      }),
    );
    assert.equal(
      call.url,
      "http://escola.internal:3001/api/v1/integrations/financeiro/system-users/upsert",
    );
    const upsertBody = JSON.parse(Buffer.from(call.init.body).toString("utf8"));
    assert.deepEqual(
      {
        zipCode: upsertBody.zipCode,
        street: upsertBody.street,
        number: upsertBody.number,
        neighborhood: upsertBody.neighborhood,
        complement: upsertBody.complement,
        city: upsertBody.city,
        state: upsertBody.state,
      },
      {
        zipCode: "14020000",
        street: "RUA TESTE",
        number: "100",
        neighborhood: "CENTRO",
        complement: "SALA 2",
        city: "RIBEIRAO PRETO",
        state: "SP",
      },
    );
    await runAs(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-CALLBACK",
        sourceBranchCode: 3,
        sourceUserId: "ADMIN-CALLBACK",
        companyId: "COMPANY-CALLBACK",
      },
      () => updateSourceSystemUserConfirmationPin("USER-9", "1234"),
    );
    assert.equal(
      call.url,
      "http://escola.internal:3001/api/v1/integrations/financeiro/system-users/confirmation-pin",
    );
    assert.deepEqual(JSON.parse(Buffer.from(call.init.body).toString("utf8")), {
      sourceUserId: "USER-9",
      confirmationPin: "1234",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-CALLBACK",
      sourceBranchCode: 3,
      requestedBy: "ADMIN-CALLBACK",
    });
    await runAs(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-CALLBACK",
        sourceBranchCode: 3,
        sourceUserId: "ADMIN-CALLBACK",
        companyId: "COMPANY-CALLBACK",
      },
      () => updateSourceSystemUserPassword("USER-9", "NovaSenha123!"),
    );
    assert.equal(
      call.url,
      "http://escola.internal:3001/api/v1/integrations/financeiro/system-users/password",
    );
    assert.deepEqual(JSON.parse(Buffer.from(call.init.body).toString("utf8")), {
      sourceUserId: "USER-9",
      password: "NovaSenha123!",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-CALLBACK",
      sourceBranchCode: 3,
      requestedBy: "ADMIN-CALLBACK",
    });
    await runAs(
      {
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-CALLBACK",
        sourceBranchCode: 3,
        sourceUserId: "ADMIN-CALLBACK",
        companyId: "COMPANY-CALLBACK",
      },
      () => confirmSourceSystemOperationCredential("1234"),
    );
    assert.equal(
      call.url,
      "http://escola.internal:3001/api/v1/integrations/financeiro/system-users/confirm-operation-credential",
    );
    assert.deepEqual(JSON.parse(Buffer.from(call.init.body).toString("utf8")), {
      credential: "1234",
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-CALLBACK",
      sourceBranchCode: 3,
      requestedBy: "ADMIN-CALLBACK",
    });
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SOURCE_SYSTEM_ESCOLA_API_URL;
    else process.env.SOURCE_SYSTEM_ESCOLA_API_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET;
    else process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = originalSecret;
  }
}

async function main() {
  await testSourceSystemUserCallback();
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const service = new FinanceAccessService(prisma);
  const suffix = Date.now();
  const sourceTenantId = `TENANT_ACCESS_${suffix}`;
  const actorId = `ADMIN_${suffix}`;

  try {
    const company = await prisma.company.create({
      data: {
        sourceSystem: "ESCOLA",
        sourceTenantId,
        name: "EMPRESA TESTE ACESSOS",
        status: "ACTIVE",
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    const branch = await prisma.companyBranch.create({
      data: {
        companyId: company.id,
        branchCode: 1,
        name: "FILIAL TESTE",
        isActive: true,
        isDefault: true,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    const context = {
      sourceSystem: "ESCOLA",
      sourceTenantId,
      sourceBranchCode: 1,
      sourceUserId: actorId,
      companyId: company.id,
      branchId: branch.id,
    };

    const syncResult = await runAs(context, () =>
      service.synchronize({
        subjects: [
          {
            externalUserId: actorId,
            document: "52998224725",
            displayName: "ADMINISTRADOR TESTE",
            email: "ADMIN@TESTE.LOCAL",
            sourceRole: "ADMIN",
            active: true,
            branchCodes: [1],
          },
          {
            externalUserId: `CAIXA_${suffix}`,
            registeredPersonId: `PERSON:CAIXA_${suffix}`,
            document: "11144477735",
            displayName: "OPERADOR TESTE",
            sourceRole: "SECRETARIA",
            active: true,
            branchCodes: [1],
          },
        ],
      }),
    );
    assert.deepEqual(syncResult, { synchronized: 2, deactivated: 0 });

    const subjects = await runAs(context, () => service.listSubjects());
    assert.equal(subjects.length, 2);
    const admin = subjects.find((subject) => subject.sourceUserId === actorId);
    const cashier = subjects.find((subject) => subject.sourceUserId.startsWith("CAIXA_"));
    assert.equal(admin.assignment.profileCode, "ADMIN_FINANCEIRO");
    assert.equal(admin.assignment.permissionCodes.includes("FINANCE_ADMIN"), true);
    assert.equal(cashier.assignment, null);
    assert.equal(cashier.document, "11144477735");

    const foreignCompany = await prisma.company.create({
      data: {
        sourceSystem: "ESCOLA",
        sourceTenantId: `OUTRO_${suffix}`,
        name: "OUTRA EMPRESA",
        status: "ACTIVE",
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await prisma.financeAccessSubject.create({
      data: {
        companyId: foreignCompany.id,
        sourceSystem: "ESCOLA",
        sourceTenantId: `OUTRO_${suffix}`,
        sourceUserId: "USUARIO_OUTRO_TENANT",
        displayName: "USUÁRIO OUTRO TENANT",
        sourceActive: true,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    const isolatedSubjects = await runAs(context, () => service.listSubjects());
    assert.equal(isolatedSubjects.length, 2);

    const cashierAssignment = await runAs(context, () =>
      service.saveAssignment(cashier.id, {
        profileCode: "CAIXA",
        permissionCodes: [
          "VIEW_FINANCIAL",
          "MANAGE_SALES",
          "OPERATE_CASHIER",
          "CLOSE_CASHIER",
          "SETTLE_RECEIVABLES",
        ],
        active: true,
      }),
    );
    assert.equal(cashierAssignment.profileCode, "CAIXA");
    assert.equal(cashierAssignment.permissionCodes.includes("OPERATE_CASHIER"), true);

    await runAs(context, () =>
      service.synchronize({
        subjects: [
          {
            externalUserId: actorId,
            document: "52998224725",
            displayName: "ADMINISTRADOR TESTE",
            sourceRole: "ADMIN",
            active: true,
            branchCodes: [1],
          },
          {
            externalUserId: `CAIXA_${suffix}`,
            document: "11144477735",
            displayName: "OPERADOR TESTE",
            sourceRole: "SECRETARIA",
            active: true,
            branchCodes: [2],
          },
        ],
      }),
    );
    const subjectsAfterBranchRemoval = await runAs(context, () => service.listSubjects());
    assert.equal(subjectsAfterBranchRemoval.some((subject) => subject.id === cashier.id), false);
    const inactiveCashierAssignment = await prisma.financeAccessAssignment.findUnique({
      where: {
        companyId_subjectId_branchCode: {
          companyId: company.id,
          subjectId: cashier.id,
          branchCode: 1,
        },
      },
    });
    assert.equal(inactiveCashierAssignment.active, false);

    await assert.rejects(
      () => runAs(context, () => service.saveAssignment(admin.id, {
        profileCode: "CONSULTA",
        permissionCodes: ["VIEW_FINANCIAL"],
        active: true,
      })),
      (error) => String(error?.message || "").includes("AO MENOS UM ADMINISTRADOR"),
    );

    assert.deepEqual(getRequiredFinancePermissions("POST", "/api/v1/sales"), ["MANAGE_SALES"]);
    assert.deepEqual(getRequiredFinancePermissions("PATCH", "/api/v1/finance-access/subjects/x/assignment"), ["FINANCE_ADMIN"]);
    assert.deepEqual(getRequiredFinancePermissions("GET", "/api/v1/payables"), ["VIEW_FINANCIAL"]);

    const auditCount = await prisma.financeAccessAuditEvent.count({
      where: { companyId: company.id },
    });
    assert.equal(auditCount, 3);
    console.log("FINANCE_ACCESS_TEST_PASSING");
  } finally {
    await prisma.onModuleDestroy();
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath, { force: true });
  }
}

main().catch((error) => {
  console.error("FINANCE_ACCESS_TEST_FAILURE", error);
  process.exitCode = 1;
});
