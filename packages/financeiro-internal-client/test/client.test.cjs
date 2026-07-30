const assert = require("node:assert/strict");
const { createHash, createHmac } = require("node:crypto");
const {
  canonicalizeFinanceiroTarget,
  createFinanceiroInternalClient,
} = require("../dist/index.js");

const secret = "client-test-secret-with-at-least-thirty-two-characters";
let capturedUrl;
let capturedInit;
const client = createFinanceiroInternalClient({
  baseUrl: "http://financeiro.internal:3002/api/v1",
  systemId: "PROJETO_INICIAL",
  secret,
  fetchImplementation: async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      json: async () => ({ accepted: true }),
    };
  },
});

async function run() {
  const body = { amount: 12.5 };
  const result = await client.request({
    method: "POST",
    path: "/receivables?z=último&a=2&a=1",
    context: {
      tenantId: "tenant-001",
      branchCode: 1,
      userId: "user-9",
      scopes: ["MANAGE_FINANCIAL", "MANAGE_FINANCIAL"],
    },
    json: body,
    headers: {
      "x-msinfor-signature": "tentativa-de-sobrescrita",
      "x-correlation-id": "correlation-1",
    },
  });
  assert.deepEqual(result, { accepted: true });
  assert.equal(
    capturedUrl.toString(),
    "http://financeiro.internal:3002/api/v1/receivables?z=%C3%BAltimo&a=2&a=1",
  );

  const headers = capturedInit.headers;
  assert.equal(capturedInit.redirect, "manual");
  assert.ok(capturedInit.signal instanceof AbortSignal);
  assert.equal(headers["x-correlation-id"], "correlation-1");
  assert.equal(headers["x-msinfor-system-id"], "PROJETO_INICIAL");
  assert.equal(headers["x-msinfor-tenant-id"], "TENANT-001");
  assert.equal(headers["x-msinfor-branch-code"], "1");
  assert.equal(headers["x-msinfor-user-id"], "user-9");
  assert.equal(headers["x-msinfor-scopes"], "MANAGE_FINANCIAL");

  const exactBody = Buffer.from(JSON.stringify(body));
  assert.deepEqual(Buffer.from(capturedInit.body), exactBody);
  const bodyHash = createHash("sha256").update(exactBody).digest("hex");
  assert.equal(headers["x-msinfor-content-sha256"], bodyHash);
  const canonicalTarget = canonicalizeFinanceiroTarget(
    "/api/v1/receivables?z=%C3%BAltimo&a=2&a=1",
  );
  const canonicalPayload = [
    "v1",
    "PROJETO_INICIAL",
    "POST",
    canonicalTarget,
    headers["x-msinfor-timestamp"],
    headers["x-msinfor-nonce"],
    bodyHash,
    "TENANT-001",
    "1",
    "user-9",
    "MANAGE_FINANCIAL",
  ].join("\n");
  assert.equal(
    headers["x-msinfor-signature"],
    createHmac("sha256", secret).update(canonicalPayload).digest("hex"),
  );

  await assert.rejects(
    () =>
      client.request({
        path: "/../outside",
        context: {
          tenantId: "TENANT-001",
          branchCode: 1,
          userId: "user-9",
        },
      }),
    /permanecer no backend Financeiro/,
  );

  const binaryClient = createFinanceiroInternalClient({
    baseUrl: "http://financeiro.internal:3002/api/v1",
    systemId: "PROJETO_INICIAL",
    secret,
    fetchImplementation: async () =>
      new Response(Buffer.from([0, 1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="NFE-1.pdf"',
          "content-length": "4",
        },
      }),
  });
  const binaryResult = await binaryClient.requestBytes({
    path: "/fiscal-documents/nfe/documents/document-1/danfe",
    context: {
      tenantId: "TENANT-001",
      branchCode: 1,
      userId: "user-9",
      scopes: ["FINANCE_ACCESS"],
    },
  });
  assert.equal(binaryResult.contentType, "application/pdf");
  assert.equal(
    binaryResult.contentDisposition,
    'attachment; filename="NFE-1.pdf"',
  );
  assert.deepEqual(binaryResult.body, Buffer.from([0, 1, 2, 3]));

  await assert.rejects(
    () =>
      binaryClient.requestBytes(
        {
          path: "/fiscal-documents/nfe/documents/document-1/danfe",
          context: {
            tenantId: "TENANT-001",
            branchCode: 1,
            userId: "user-9",
            scopes: ["FINANCE_ACCESS"],
          },
        },
        { maxBytes: 3 },
      ),
    /excede o limite/,
  );
}

run()
  .then(() => {
    process.stdout.write("Cliente interno Financeiro validado.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
