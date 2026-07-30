import assert from "node:assert/strict";
import { pushSourceCompanyBranchParameters } from "../src/common/source-system-parameters.client";
import { financeContext } from "../src/common/finance-context";
import { INTERNAL_API_HEADERS } from "../src/common/internal-api-signature";

async function run() {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SOURCE_SYSTEM_ESCOLA_API_URL;
  const originalSecret = process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET;
  let requestedUrl = "";
  let requestedBody: Record<string, unknown> = {};

  process.env.SOURCE_SYSTEM_ESCOLA_API_URL = "http://source.example/api/v1/";
  process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = "test-integration-secret-at-least-32-bytes";

  global.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body || "{}"));
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers[INTERNAL_API_HEADERS.systemId], "FINANCEIRO");
    assert.equal(headers[INTERNAL_API_HEADERS.tenantId], "TENANT-1");
    assert.ok(headers[INTERNAL_API_HEADERS.signature]);

    return new Response(JSON.stringify({ synchronized: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await financeContext.run(
      {
        authenticated: true,
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-1",
        branchCode: 2,
        sourceBranchCode: 2,
        sourceUserId: "USER-1",
        companyId: "COMPANY-1",
        branchId: "BRANCH-2",
        scopes: ["FINANCE_ADMIN"],
      },
      () => pushSourceCompanyBranchParameters({
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-1",
        sourceBranchCode: 2,
        entityType: "BRANCH",
        requestedBy: "USER-1",
        parameters: { stockControlMode: "YES", allowProductImageEdit: true },
      }),
    );

  assert.equal(
    requestedUrl,
    "http://source.example/api/v1/integrations/financeiro/company-branch-parameters",
  );
  assert.equal(requestedBody.sourceTenantId, "TENANT-1");
  assert.equal(requestedBody.sourceBranchCode, 2);
  assert.deepEqual(requestedBody.parameters, {
    stockControlMode: "YES",
    allowProductImageEdit: true,
  });
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SOURCE_SYSTEM_ESCOLA_API_URL;
    else process.env.SOURCE_SYSTEM_ESCOLA_API_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET;
    else process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET = originalSecret;
  }
}

void run()
  .then(() => console.log("source-system-parameters-client.test.ts: OK"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
