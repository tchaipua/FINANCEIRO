const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const routesManifest = JSON.parse(
  fs.readFileSync(
    path.resolve(process.cwd(), ".next", "routes-manifest.json"),
    "utf8",
  ),
);
assert.equal(routesManifest.basePath, "/financeiro-app");

const port = 4099;
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = path.resolve(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const frontend = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "ignore", "pipe"],
  windowsHide: true,
});

let startupError = "";
frontend.stderr.on("data", (chunk) => {
  startupError += String(chunk);
});

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (frontend.exitCode !== null) {
      throw new Error(
        `O frontend encerrou durante o teste: ${startupError || frontend.exitCode}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/financeiro-app/`);
      if (response.status === 200) return response;
    } catch {
      // A porta ainda não está pronta.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("O frontend com basePath não iniciou.");
}

async function run() {
  const response = await waitUntilReady();
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(
    response.headers.get("content-security-policy") || "",
    /frame-ancestors 'self'/,
  );
  assert.doesNotMatch(
    response.headers.get("content-security-policy") || "",
    /frame-ancestors 'none'/,
  );

  const html = await response.text();
  assert.match(html, /\/financeiro-app\/_next\/static\//);
  assert.match(html, /\/financeiro-app\/principal-financeiro\//);

  const assetPath =
    html.match(/(?:src|href)="(\/financeiro-app\/_next\/static\/[^"]+)"/)?.[1];
  assert.ok(assetPath, "Nenhum asset do Next foi encontrado com basePath.");
  const assetResponse = await fetch(`${baseUrl}${assetPath}`);
  assert.equal(assetResponse.status, 200);

  const publicAssetResponse = await fetch(
    `${baseUrl}/financeiro-app/logo-msinfor.jpg`,
  );
  assert.equal(publicAssetResponse.status, 200);

  const unprefixedResponse = await fetch(`${baseUrl}/`, {
    redirect: "manual",
  });
  assert.notEqual(
    unprefixedResponse.status,
    200,
    "O frontend não deve ser publicado também na raiz sem basePath.",
  );
}

run()
  .then(() => {
    process.stdout.write(
      "Frontend validado em /financeiro-app com framing same-origin.\n",
    );
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (frontend.exitCode === null) {
      frontend.kill("SIGTERM");
    }
  });
