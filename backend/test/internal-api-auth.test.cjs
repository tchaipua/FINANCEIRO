const assert = require("node:assert/strict");
const { createHmac, randomBytes } = require("node:crypto");

process.env.FINANCEIRO_HMAC_ESCOLA_SECRET =
  "test-escola-secret-with-more-than-thirty-two-characters";
process.env.FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET =
  "test-projeto-secret-different-and-longer-than-thirty-two";
process.env.FINANCEIRO_HMAC_TIMESTAMP_WINDOW_MS = "60000";
process.env.FINANCEIRO_HMAC_REPLAY_CACHE_MAX_ENTRIES = "100";

const {
  InternalApiAuthGuard,
} = require("../dist/common/internal-api-auth.guard.js");
const {
  InternalReplayCacheService,
} = require("../dist/common/internal-replay-cache.service.js");
const {
  buildInternalSignaturePayload,
  canonicalizePathAndQuery,
  hashInternalRequestBody,
  INTERNAL_API_HEADERS,
} = require("../dist/common/internal-api-signature.js");
const {
  financeContext,
  getFinanceContext,
} = require("../dist/common/finance-context.js");
const {
  branchMiddleware,
} = require("../dist/prisma/prisma.middleware.js");

const COMPANY = {
  id: "company-authenticated",
  sourceSystem: "ESCOLA",
  sourceTenantId: "TENANT-1",
  status: "ACTIVE",
  canceledAt: null,
};
const BRANCH = {
  id: "branch-authenticated",
  companyId: COMPANY.id,
  branchCode: 1,
  isActive: true,
  canceledAt: null,
};

function createPrisma(overrides = {}) {
  return {
    company: {
      findUnique: async () => COMPANY,
      ...(overrides.company || {}),
    },
    companyBranch: {
      findUnique: async () => BRANCH,
      ...(overrides.companyBranch || {}),
    },
  };
}

function executionContextFor(request) {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

function buildSignedRequest(options = {}) {
  const systemId = options.systemId || "ESCOLA";
  const tenantId = options.tenantId || "TENANT-1";
  const branchCode = options.branchCode || 1;
  const userId = options.userId || "user-1";
  const scopes = options.scopes || ["MANAGE_FINANCIAL"];
  const method = options.method || "POST";
  const originalUrl =
    options.originalUrl || "/api/v1/receivables/existing-business-keys";
  const body =
    options.body === undefined
      ? {
          sourceSystem: systemId,
          sourceTenantId: tenantId,
          sourceBranchCode: branchCode,
          requestedBy: userId,
          companyId: COMPANY.id,
        }
      : options.body;
  const rawBody =
    options.rawBody ||
    (body === undefined
      ? Buffer.alloc(0)
      : Buffer.from(JSON.stringify(body), "utf8"));
  const timestamp = String(options.timestamp || Date.now());
  const nonce =
    options.nonce || randomBytes(24).toString("base64url");
  const bodyHash = hashInternalRequestBody(rawBody);
  const normalizedScopes = [...scopes].map(String).sort();
  const headers = {
    "content-type": "application/json",
    "content-length": String(rawBody.length),
    [INTERNAL_API_HEADERS.version]: "v1",
    [INTERNAL_API_HEADERS.systemId]: systemId,
    [INTERNAL_API_HEADERS.tenantId]: tenantId,
    [INTERNAL_API_HEADERS.branchCode]: String(branchCode),
    [INTERNAL_API_HEADERS.userId]: userId,
    [INTERNAL_API_HEADERS.scopes]: normalizedScopes.join(","),
    [INTERNAL_API_HEADERS.timestamp]: timestamp,
    [INTERNAL_API_HEADERS.nonce]: nonce,
    [INTERNAL_API_HEADERS.contentSha256]: bodyHash,
  };
  const canonicalPayload = buildInternalSignaturePayload({
    version: "v1",
    systemId,
    method,
    canonicalTarget: canonicalizePathAndQuery(originalUrl),
    timestamp,
    nonce,
    bodySha256: bodyHash,
    tenantId,
    branchCode: String(branchCode),
    userId,
    scopes: normalizedScopes,
  });
  const secret =
    systemId === "ESCOLA"
      ? process.env.FINANCEIRO_HMAC_ESCOLA_SECRET
      : process.env.FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET;
  headers[INTERNAL_API_HEADERS.signature] = createHmac("sha256", secret)
    .update(canonicalPayload)
    .digest("hex");

  return {
    method,
    originalUrl,
    path: originalUrl.split("?")[0],
    headers,
    rawBody,
    body,
    query: options.query || {},
    params: options.params || {},
  };
}

async function invokeGuard(request, options = {}) {
  const guard = new InternalApiAuthGuard(
    {
      getAllAndOverride: () => Boolean(options.publicEndpoint),
    },
    options.prisma || createPrisma(),
    options.replayCache || new InternalReplayCacheService(),
  );
  return financeContext.run(
    { authenticated: false, branchCode: 1 },
    async () => {
      const result = await guard.canActivate(executionContextFor(request));
      return {
        result,
        context: getFinanceContext(),
      };
    },
  );
}

async function expectHttpStatus(operation, expectedStatus) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.getStatus?.(), expectedStatus);
    return true;
  });
}

async function testPrismaScope() {
  const middleware = branchMiddleware();
  const context = {
    authenticated: true,
    branchCode: 1,
    sourceSystem: "ESCOLA",
    sourceTenantId: "TENANT-1",
    sourceBranchCode: 1,
    sourceUserId: "user-1",
    companyId: COMPANY.id,
    branchId: BRANCH.id,
    scopes: [],
  };

  const scopedRead = await financeContext.run(context, () =>
    middleware(
      {
        model: "BankAccount",
        action: "findMany",
        args: { where: { status: "ACTIVE" } },
        dataPath: [],
        runInTransaction: false,
      },
      async (params) => params,
    ),
  );
  const serializedRead = JSON.stringify(scopedRead.args.where);
  assert.match(serializedRead, /company-authenticated/);
  assert.match(serializedRead, /branchCode/);

  const scopedCompany = await financeContext.run(context, () =>
    middleware(
      {
        model: "Company",
        action: "findMany",
        args: {},
        dataPath: [],
        runInTransaction: false,
      },
      async (params) => params,
    ),
  );
  assert.match(JSON.stringify(scopedCompany.args.where), /TENANT-1/);

  const scopedCompoundUnique = await financeContext.run(context, () =>
    middleware(
      {
        model: "Company",
        action: "findUnique",
        args: {
          where: {
            sourceSystem_sourceTenantId: {
              sourceSystem: "ESCOLA",
              sourceTenantId: "TENANT-1",
            },
          },
        },
        dataPath: [],
        runInTransaction: false,
      },
      async (params) => params,
    ),
  );
  assert.equal(scopedCompoundUnique.action, "findUnique");
  assert.equal(scopedCompoundUnique.args.where.id, COMPANY.id);
  assert.deepEqual(
    scopedCompoundUnique.args.where.sourceSystem_sourceTenantId,
    {
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-1",
    },
  );

  await expectHttpStatus(
    () =>
      financeContext.run(context, () =>
        middleware(
          {
            model: "Company",
            action: "findUnique",
            args: { where: { id: "other-company" } },
            dataPath: [],
            runInTransaction: false,
          },
          async (params) => params,
        ),
      ),
    403,
  );

  const scopedChild = await financeContext.run(context, () =>
    middleware(
      {
        model: "PayableInvoiceImportItem",
        action: "findMany",
        args: {},
        dataPath: [],
        runInTransaction: false,
      },
      async (params) => params,
    ),
  );
  assert.match(JSON.stringify(scopedChild.args.where), /invoiceImport/);

  const scopedMutation = await financeContext.run(context, () =>
    middleware(
      {
        model: "BankAccount",
        action: "update",
        args: {
          where: { id: "bank-1" },
          data: { status: "INACTIVE" },
        },
        dataPath: [],
        runInTransaction: false,
      },
      async (params) => params,
    ),
  );
  assert.equal(scopedMutation.args.where.branchCode, 1);

  await expectHttpStatus(
    () =>
      financeContext.run(context, () =>
        middleware(
          {
            model: "Company",
            action: "update",
            args: {
              where: { id: COMPANY.id },
              data: { name: "Alteração indevida" },
            },
            dataPath: [],
            runInTransaction: false,
          },
          async (params) => params,
        ),
      ),
    403,
  );

  await expectHttpStatus(
    () =>
      financeContext.run(context, () =>
        middleware(
          {
            model: "NfseServiceItem",
            action: "create",
            args: {
              data: {
                companyId: COMPANY.id,
                branchCode: 0,
              },
            },
            dataPath: [],
            runInTransaction: false,
          },
          async (params) => params,
        ),
      ),
    403,
  );

  const adminContext = {
    ...context,
    scopes: ["FINANCE_ADMIN"],
  };
  const sharedAdminCreate = await financeContext.run(adminContext, () =>
    middleware(
      {
        model: "NfseServiceItem",
        action: "create",
        args: {
          data: {
            companyId: COMPANY.id,
            branchCode: 0,
          },
        },
        dataPath: [],
        runInTransaction: false,
      },
      async (params) => params,
    ),
  );
  assert.equal(sharedAdminCreate.args.data.branchCode, 0);

  const sourceSyncContext = {
    ...context,
    scopes: ["SOURCE_SETTINGS_SYNC"],
  };
  const scopedCompanyUpdate = await financeContext.run(sourceSyncContext, () =>
    middleware(
      {
        model: "Company",
        action: "update",
        args: {
          where: { id: COMPANY.id },
          data: { name: "Empresa sincronizada" },
        },
        dataPath: [],
        runInTransaction: false,
      },
      async (params) => params,
    ),
  );
  assert.equal(scopedCompanyUpdate.args.where.id, COMPANY.id);

  await expectHttpStatus(
    () =>
      financeContext.run(context, () =>
        middleware(
          {
            model: "BankAccount",
            action: "create",
            args: {
              data: {
                companyId: "other-company",
                branchCode: 1,
              },
            },
            dataPath: [],
            runInTransaction: false,
          },
          async (params) => params,
        ),
      ),
    403,
  );
}

async function run() {
  const publicResult = await invokeGuard(
    {
      method: "GET",
      originalUrl: "/api/v1/health",
      path: "/api/v1/health",
      headers: {},
      query: {},
      params: {},
    },
    { publicEndpoint: true },
  );
  assert.equal(publicResult.result, true);

  await expectHttpStatus(
    () =>
      invokeGuard({
        method: "GET",
        originalUrl: "/api/v1/companies",
        path: "/api/v1/companies",
        headers: {},
        query: {},
        params: {},
      }),
    401,
  );

  const changedSignature = buildSignedRequest();
  const originalSignature =
    changedSignature.headers[INTERNAL_API_HEADERS.signature];
  changedSignature.headers[INTERNAL_API_HEADERS.signature] =
    `${originalSignature.slice(0, -1)}${originalSignature.endsWith("0") ? "1" : "0"}`;
  await expectHttpStatus(() => invokeGuard(changedSignature), 401);

  const changedBody = buildSignedRequest();
  changedBody.rawBody = Buffer.from(
    `${changedBody.rawBody.toString("utf8")} `,
    "utf8",
  );
  changedBody.headers["content-length"] = String(changedBody.rawBody.length);
  await expectHttpStatus(() => invokeGuard(changedBody), 401);

  const oldRequest = buildSignedRequest({
    timestamp: Date.now() - 120_000,
  });
  await expectHttpStatus(() => invokeGuard(oldRequest), 401);

  const replayCache = new InternalReplayCacheService();
  const replayNonce = randomBytes(24).toString("base64url");
  const firstReplayRequest = buildSignedRequest({ nonce: replayNonce });
  const secondReplayRequest = buildSignedRequest({ nonce: replayNonce });
  assert.equal(
    (await invokeGuard(firstReplayRequest, { replayCache })).result,
    true,
  );
  await expectHttpStatus(
    () => invokeGuard(secondReplayRequest, { replayCache }),
    401,
  );

  const unknownSystem = buildSignedRequest();
  unknownSystem.headers[INTERNAL_API_HEADERS.systemId] = "DESCONHECIDO";
  await expectHttpStatus(() => invokeGuard(unknownSystem), 401);

  const unknownTenant = buildSignedRequest({ tenantId: "TENANT-INEXISTENTE" });
  await expectHttpStatus(
    () =>
      invokeGuard(unknownTenant, {
        prisma: createPrisma({
          company: { findUnique: async () => null },
        }),
      }),
    403,
  );

  const swappedUserHeader = buildSignedRequest();
  swappedUserHeader.headers[INTERNAL_API_HEADERS.userId] = "attacker";
  await expectHttpStatus(() => invokeGuard(swappedUserHeader), 401);

  await expectHttpStatus(
    () => invokeGuard(buildSignedRequest({ scopes: [] })),
    403,
  );
  await expectHttpStatus(
    () =>
      invokeGuard(
        buildSignedRequest({ scopes: ["SOURCE_SETTINGS_SYNC"] }),
      ),
    403,
  );
  await expectHttpStatus(
    () =>
      invokeGuard(
        buildSignedRequest({ scopes: ["FINANCE_ACCESS"] }),
      ),
    403,
  );
  assert.equal(
    (
      await invokeGuard(
        buildSignedRequest({
          method: "GET",
          originalUrl: "/api/v1/companies",
          rawBody: Buffer.alloc(0),
          body: undefined,
          scopes: ["FINANCE_ACCESS"],
        }),
      )
    ).result,
    true,
  );
  await expectHttpStatus(
    () =>
      invokeGuard(
        buildSignedRequest({
          originalUrl:
            "/api/v1/companies/sync-source-integration-settings",
          scopes: ["MANAGE_FINANCIAL"],
        }),
      ),
    403,
  );
  assert.equal(
    (
      await invokeGuard(
        buildSignedRequest({
          originalUrl:
            "/api/v1/companies/sync-source-integration-settings",
          scopes: ["SOURCE_SETTINGS_SYNC"],
        }),
      )
    ).result,
    true,
  );

  for (const divergentBody of [
    {
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-1",
      sourceBranchCode: 1,
      requestedBy: "other-user",
    },
    {
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-1",
      sourceBranchCode: 2,
      requestedBy: "user-1",
    },
    {
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-1",
      sourceBranchCode: 1,
      requestedBy: "user-1",
      companyId: "other-company",
    },
    {
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-1",
      sourceBranchCode: 1,
      requestedBy: "user-1",
      userRole: "ADMIN",
    },
  ]) {
    await expectHttpStatus(
      () => invokeGuard(buildSignedRequest({ body: divergentBody })),
      403,
    );
  }

  const validRequest = buildSignedRequest();
  const validResult = await invokeGuard(validRequest);
  assert.equal(validResult.result, true);
  assert.equal(validRequest.sourceSystem, "ESCOLA");
  assert.equal(validRequest.sourceTenantId, "TENANT-1");
  assert.equal(validRequest.sourceBranchCode, 1);
  assert.equal(validRequest.sourceUserId, "user-1");
  assert.equal(validRequest.companyId, COMPANY.id);
  assert.equal(validRequest.branchId, BRANCH.id);
  assert.equal(
    Object.getOwnPropertyDescriptor(validRequest, "companyId").writable,
    false,
  );
  assert.equal(Object.isFrozen(validRequest.financeAuth), true);
  assert.equal(Object.isFrozen(validResult.context), true);

  await testPrismaScope();
}

run()
  .then(() => {
    process.stdout.write("Testes da API interna autenticada concluídos.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
