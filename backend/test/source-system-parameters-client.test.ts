import assert from "node:assert/strict";
import { pushSourceCompanyBranchParameters } from "../src/common/source-system-parameters.client";

async function run() {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SOURCE_SYSTEM_TESTE_API_URL;
  const originalKey = process.env.SOURCE_SYSTEM_TESTE_API_KEY;
  let requestedUrl = "";
  let requestedBody: Record<string, unknown> = {};

  process.env.SOURCE_SYSTEM_TESTE_API_URL = "http://source.example/api/v1/";
  process.env.SOURCE_SYSTEM_TESTE_API_KEY = "test-integration-key";

  global.fetch = (async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body || "{}"));
    assert.equal(
      (init?.headers as Record<string, string>)["x-api-key"],
      "test-integration-key",
    );

    return new Response(JSON.stringify({ synchronized: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await pushSourceCompanyBranchParameters({
    sourceSystem: "TESTE",
    sourceTenantId: "TENANT-1",
    sourceBranchCode: 2,
    entityType: "BRANCH",
    requestedBy: "USER-1",
    parameters: { stockControlMode: "YES" },
    });

  assert.equal(
    requestedUrl,
    "http://source.example/api/v1/integrations/financeiro/company-branch-parameters",
  );
  assert.equal(requestedBody.sourceTenantId, "TENANT-1");
  assert.equal(requestedBody.sourceBranchCode, 2);
  assert.deepEqual(requestedBody.parameters, { stockControlMode: "YES" });
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SOURCE_SYSTEM_TESTE_API_URL;
    else process.env.SOURCE_SYSTEM_TESTE_API_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SOURCE_SYSTEM_TESTE_API_KEY;
    else process.env.SOURCE_SYSTEM_TESTE_API_KEY = originalKey;
  }
}

void run()
  .then(() => console.log("source-system-parameters-client.test.ts: OK"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
