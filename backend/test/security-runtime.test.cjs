const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
require("reflect-metadata");

const {
  METHOD_METADATA,
  PATH_METADATA,
} = require("@nestjs/common/constants");
const {
  PUBLIC_ENDPOINT_METADATA,
} = require("../dist/common/public-endpoint.decorator.js");

const port = 3999;
const baseUrl = `http://127.0.0.1:${port}`;
const backend = spawn(process.execPath, ["dist/main.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(port),
    FINANCEIRO_BIND_HOST: "127.0.0.1",
    FINANCEIRO_ALLOWED_ORIGINS:
      "http://localhost:3000,http://localhost:3100,http://localhost:3003",
    FINANCEIRO_RATE_LIMIT_REQUESTS: "10000",
    FINANCEIRO_RATE_LIMIT_TTL_MS: "60000",
    FINANCEIRO_SWAGGER_ENABLED: "false",
    FINANCEIRO_HMAC_ESCOLA_SECRET:
      "school-runtime-secret-with-at-least-thirty-two-characters",
    FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET:
      "project-runtime-secret-with-at-least-thirty-two-characters",
  },
  stdio: ["ignore", "ignore", "pipe"],
  windowsHide: true,
});

let startupError = "";
backend.stderr.on("data", (chunk) => {
  startupError += String(chunk);
});

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (backend.exitCode !== null) {
      throw new Error(
        `O backend encerrou durante o teste: ${startupError || backend.exitCode}`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.status === 200) {
        return response;
      }
    } catch {
      // A porta ainda não está pronta.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("O backend não iniciou na porta de teste.");
}

function listControllerFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listControllerFiles(fullPath);
    return entry.name.endsWith(".controller.js") ? [fullPath] : [];
  });
}

function asPaths(value) {
  if (Array.isArray(value)) return value;
  return value === undefined ? [""] : [value];
}

function joinRoutePath(controllerPath, methodPath) {
  const pathParts = [controllerPath, methodPath]
    .map((value) => String(value || "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  const routePath = `/${pathParts.join("/")}`
    .replace(/:([A-Za-z0-9_]+)(\([^)]*\))?\??/g, "test")
    .replace(/\*/g, "test");
  return `/api/v1${routePath === "/" ? "" : routePath}`;
}

function requestMethodName(methodCode) {
  const methods = {
    0: "GET",
    1: "POST",
    2: "PUT",
    3: "DELETE",
    4: "PATCH",
    5: "GET",
    6: "OPTIONS",
    7: "HEAD",
    8: "SEARCH",
  };
  return methods[methodCode];
}

function discoverRoutes() {
  const controllerRoot = path.resolve(process.cwd(), "dist");
  const routes = [];
  const publicRoutes = [];

  for (const filePath of listControllerFiles(controllerRoot)) {
    const moduleExports = require(filePath);
    for (const controller of Object.values(moduleExports)) {
      if (
        typeof controller !== "function" ||
        Reflect.getMetadata(PATH_METADATA, controller) === undefined
      ) {
        continue;
      }

      const classIsPublic =
        Reflect.getMetadata(PUBLIC_ENDPOINT_METADATA, controller) === true;
      const controllerPaths = asPaths(
        Reflect.getMetadata(PATH_METADATA, controller),
      );
      for (const propertyName of Object.getOwnPropertyNames(
        controller.prototype,
      )) {
        const handler = controller.prototype[propertyName];
        if (
          propertyName === "constructor" ||
          typeof handler !== "function"
        ) {
          continue;
        }
        const methodCode = Reflect.getMetadata(METHOD_METADATA, handler);
        const methodPaths = asPaths(Reflect.getMetadata(PATH_METADATA, handler));
        const method = requestMethodName(methodCode);
        if (methodCode === undefined || !method) continue;

        const handlerIsPublic =
          Reflect.getMetadata(PUBLIC_ENDPOINT_METADATA, handler) === true;
        for (const controllerPath of controllerPaths) {
          for (const methodPath of methodPaths) {
            const route = {
              controller: controller.name,
              handler: propertyName,
              method,
              path: joinRoutePath(controllerPath, methodPath),
              isPublic: classIsPublic || handlerIsPublic,
            };
            routes.push(route);
            if (route.isPublic) publicRoutes.push(route);
          }
        }
      }
    }
  }

  assert.ok(routes.length >= 180, `Inventário incompleto: ${routes.length} rotas.`);
  assert.deepEqual(
    publicRoutes.map(({ method, path }) => ({ method, path })),
    [
      { method: "GET", path: "/api/v1/health" },
      { method: "GET", path: "/api/v1/health/ready" },
    ],
    "Somente liveness e readiness podem ser públicos.",
  );
  return routes;
}

async function run() {
  const healthResponse = await waitUntilReady();
  assert.equal(healthResponse.headers.get("x-powered-by"), null);
  assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await healthResponse.json(), { status: "ok" });

  const readinessResponse = await fetch(`${baseUrl}/api/v1/health/ready`);
  assert.equal(readinessResponse.status, 200);
  assert.deepEqual(await readinessResponse.json(), {
    status: "ready",
    database: "ok",
  });

  const { HealthController } = require("../dist/common/health.controller.js");
  const unavailableController = new HealthController({
    $queryRaw: async () => {
      throw new Error("database unavailable");
    },
  });
  await assert.rejects(
    () => unavailableController.getReadiness(),
    (error) => error.getStatus?.() === 503,
  );

  const docsResponse = await fetch(`${baseUrl}/api/docs`);
  assert.equal(docsResponse.status, 404);

  const allowedResponse = await fetch(`${baseUrl}/api/v1/companies`, {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:3003",
      "access-control-request-method": "GET",
    },
  });
  assert.equal(allowedResponse.status, 204);
  assert.equal(
    allowedResponse.headers.get("access-control-allow-origin"),
    "http://localhost:3003",
  );

  const blockedResponse = await fetch(`${baseUrl}/api/v1/companies`, {
    method: "OPTIONS",
    headers: {
      origin: "https://origem-invasora.example",
      "access-control-request-method": "GET",
    },
  });
  assert.equal(
    blockedResponse.headers.get("access-control-allow-origin"),
    null,
  );

  const unsignedResponse = await fetch(`${baseUrl}/api/v1/companies`);
  assert.equal(unsignedResponse.status, 401);

  const routes = discoverRoutes();
  for (const route of routes) {
    if (route.isPublic) continue;
    const response = await fetch(`${baseUrl}${route.path}`, {
      method: route.method,
      redirect: "manual",
    });
    assert.equal(
      response.status,
      401,
      `${route.method} ${route.path} (${route.controller}.${route.handler}) não falhou fechado.`,
    );
  }
}

run()
  .then(() => {
    process.stdout.write(
      "Teste runtime e inventário deny-by-default concluídos.\n",
    );
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (backend.exitCode === null) {
      backend.kill("SIGTERM");
    }
  });
