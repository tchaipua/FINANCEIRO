const assert = require("node:assert/strict");

const {
  NfeController,
} = require("../dist/modules/fiscal-documents/infrastructure/nfe.controller.js");
const {
  NfseController,
} = require("../dist/modules/fiscal-documents/infrastructure/nfse.controller.js");

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
  };
}

async function assertDownload(operation, expectedContentType, expectedName) {
  const response = responseRecorder();
  const download = await operation(response);

  assert.equal(
    response.headers.get("content-type"),
    expectedContentType,
  );
  assert.equal(
    response.headers.get("content-disposition"),
    `attachment; filename="${expectedName}"`,
  );
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.ok(download?.getStream(), "A resposta deve permanecer binária.");
}

async function run() {
  const nfeController = new NfeController({
    getArtifact: async (_id, _query, kind) => ({
      body: Buffer.from([0, 1, 2, 3]),
      contentType:
        kind === "danfe"
          ? "application/pdf"
          : "application/xml; charset=utf-8",
      fileName: kind === "danfe" ? "NFE-1.pdf" : "NFE-1.xml",
    }),
  });
  const nfseController = new NfseController({
    getArtifact: async (_id, _query, kind) => ({
      body: Buffer.from([0, 1, 2, 3]),
      contentType:
        kind === "danfse"
          ? "application/pdf"
          : "application/xml; charset=utf-8",
      fileName: kind === "danfse" ? "NFSE-1.pdf" : "NFSE-1.xml",
    }),
  });

  await assertDownload(
    (response) => nfeController.downloadDanfe("1", {}, response),
    "application/pdf",
    "NFE-1.pdf",
  );
  await assertDownload(
    (response) => nfeController.downloadXml("1", {}, response),
    "application/xml; charset=utf-8",
    "NFE-1.xml",
  );
  await assertDownload(
    (response) => nfseController.danfse("1", {}, response),
    "application/pdf",
    "NFSE-1.pdf",
  );
  await assertDownload(
    (response) => nfseController.xml("1", {}, response),
    "application/xml; charset=utf-8",
    "NFSE-1.xml",
  );
}

run()
  .then(() => {
    process.stdout.write("Respostas binárias fiscais validadas.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
