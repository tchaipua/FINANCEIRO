const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

const callbackSecret =
  "directional-callback-test-secret-with-at-least-thirty-two";
process.env.SOURCE_SYSTEM_PROJETO_INICIAL_API_URL =
  "http://projeto.internal:3101/api/v1";
process.env.SOURCE_SYSTEM_PROJETO_INICIAL_HMAC_SECRET = callbackSecret;

const {
  financeContext,
} = require("../dist/common/finance-context.js");
const {
  buildInternalSignaturePayload,
  canonicalizePathAndQuery,
  INTERNAL_API_HEADERS,
} = require("../dist/common/internal-api-signature.js");
const {
  pushSourceCompanyBranchParameters,
} = require("../dist/common/source-system-parameters.client.js");

const authenticatedContext = Object.freeze({
  authenticated: true,
  branchCode: 3,
  sourceSystem: "PROJETO_INICIAL",
  sourceTenantId: "TENANT-001",
  sourceBranchCode: 3,
  sourceUserId: "user-9",
  companyId: "company-1",
  branchId: "branch-3",
  scopes: Object.freeze([]),
});

async function run() {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ synchronized: true }),
    };
  };

  try {
    const input = {
      sourceSystem: "PROJETO_INICIAL",
      sourceTenantId: "TENANT-001",
      sourceBranchCode: 3,
      entityType: "BRANCH",
      requestedBy: "user-9",
      parameters: { stockControlMode: "YES" },
    };
    const result = await financeContext.run(authenticatedContext, () =>
      pushSourceCompanyBranchParameters(input),
    );
    assert.deepEqual(result, { synchronized: true });
    assert.equal(requests.length, 1);

    const { url, init } = requests[0];
    assert.equal(
      url.toString(),
      "http://projeto.internal:3101/api/v1/integrations/financeiro/company-branch-parameters",
    );
    assert.equal(init.method, "PATCH");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers["x-api-key"], undefined);
    assert.equal(
      init.headers[INTERNAL_API_HEADERS.systemId],
      "FINANCEIRO",
    );
    assert.equal(
      init.headers[INTERNAL_API_HEADERS.tenantId],
      "TENANT-001",
    );
    assert.equal(init.headers[INTERNAL_API_HEADERS.branchCode], "3");
    assert.equal(init.headers[INTERNAL_API_HEADERS.userId], "user-9");
    assert.equal(
      init.headers[INTERNAL_API_HEADERS.scopes],
      "SOURCE_PARAMETERS_WRITE",
    );

    const exactBody = Buffer.from(init.body);
    assert.deepEqual(JSON.parse(exactBody.toString("utf8")), input);
    const headers = init.headers;
    const canonicalPayload = buildInternalSignaturePayload({
      version: headers[INTERNAL_API_HEADERS.version],
      systemId: "FINANCEIRO",
      method: "PATCH",
      canonicalTarget: canonicalizePathAndQuery(
        "/api/v1/integrations/financeiro/company-branch-parameters",
      ),
      timestamp: headers[INTERNAL_API_HEADERS.timestamp],
      nonce: headers[INTERNAL_API_HEADERS.nonce],
      bodySha256: headers[INTERNAL_API_HEADERS.contentSha256],
      tenantId: "TENANT-001",
      branchCode: "3",
      userId: "user-9",
      scopes: ["SOURCE_PARAMETERS_WRITE"],
    });
    assert.equal(
      headers[INTERNAL_API_HEADERS.signature],
      createHmac("sha256", callbackSecret)
        .update(canonicalPayload)
        .digest("hex"),
    );

    await assert.rejects(
      () =>
        pushSourceCompanyBranchParameters(input),
      /CONTEXTO DO CALLBACK FINANCEIRO DIVERGENTE/,
    );
    await assert.rejects(
      () =>
        financeContext.run(authenticatedContext, () =>
          pushSourceCompanyBranchParameters({
            ...input,
            sourceBranchCode: 4,
          }),
        ),
      /CONTEXTO DO CALLBACK FINANCEIRO DIVERGENTE/,
    );
    assert.equal(requests.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
}

run()
  .then(() => {
    process.stdout.write("Callback HMAC do Financeiro validado.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
