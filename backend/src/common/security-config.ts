import { validateSicoobPowerShellRuntime } from "./sicoob-powershell";

const DEVELOPMENT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3100",
  "http://localhost:3003",
] as const;

function readPositiveInteger(
  name: string,
  fallback: number,
  maximum: number,
) {
  const rawValue = String(process.env[name] || "").trim();
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue <= 0 ||
    parsedValue > maximum
  ) {
    throw new Error(
      `${name} deve ser um número inteiro entre 1 e ${maximum}.`,
    );
  }

  return parsedValue;
}

function normalizeOrigin(value: string) {
  const origin = value.trim();
  if (!origin || origin === "*") {
    throw new Error("Origens CORS vazias ou curingas não são permitidas.");
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error(`Origem CORS inválida: ${origin}`);
  }

  if (
    !["http:", "https:"].includes(parsedOrigin.protocol) ||
    parsedOrigin.origin !== origin ||
    parsedOrigin.username ||
    parsedOrigin.password
  ) {
    throw new Error(
      `A origem CORS deve conter somente protocolo, host e porta: ${origin}`,
    );
  }

  return parsedOrigin.origin;
}

export function isProductionEnvironment() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

export function getAllowedOrigins() {
  const configuredOrigins = String(
    process.env.FINANCEIRO_ALLOWED_ORIGINS || "",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (isProductionEnvironment()) {
    if (configuredOrigins.length > 0) {
      throw new Error(
        "FINANCEIRO_ALLOWED_ORIGINS deve permanecer vazio em produção; a API operacional não aceita navegadores.",
      );
    }
    return [];
  }

  if (configuredOrigins.length === 0) {
    return [...DEVELOPMENT_ORIGINS];
  }

  const normalizedOrigins = [...new Set(configuredOrigins.map(normalizeOrigin))];
  return normalizedOrigins;
}

export function getBodyLimit() {
  const configuredLimit = String(
    process.env.FINANCEIRO_BODY_LIMIT || "2mb",
  )
    .trim()
    .toLowerCase();

  if (!/^\d+(kb|mb)$/.test(configuredLimit)) {
    throw new Error(
      "FINANCEIRO_BODY_LIMIT deve usar o formato 512kb ou 2mb.",
    );
  }

  const [, amountText, unit] =
    configuredLimit.match(/^(\d+)(kb|mb)$/) || [];
  const amount = Number(amountText);
  const bytes = unit === "mb" ? amount * 1024 * 1024 : amount * 1024;
  if (bytes <= 0 || bytes > 10 * 1024 * 1024) {
    throw new Error(
      "FINANCEIRO_BODY_LIMIT deve ser maior que zero e no máximo 10mb.",
    );
  }

  return configuredLimit;
}

export function getUploadLimitBytes() {
  return (
    readPositiveInteger("FINANCEIRO_UPLOAD_LIMIT_MB", 25, 50) *
    1024 *
    1024
  );
}

export function getRateLimitConfig() {
  return {
    ttl: readPositiveInteger("FINANCEIRO_RATE_LIMIT_TTL_MS", 60_000, 3_600_000),
    limit: readPositiveInteger("FINANCEIRO_RATE_LIMIT_REQUESTS", 120, 10_000),
  };
}

export function isSwaggerEnabled() {
  const configuredValue = String(
    process.env.FINANCEIRO_SWAGGER_ENABLED || "",
  )
    .trim()
    .toLowerCase();

  if (isProductionEnvironment()) {
    return false;
  }

  if (!configuredValue) {
    return false;
  }

  return configuredValue === "true";
}

export function getBindHost() {
  return String(
    process.env.FINANCEIRO_BIND_HOST ||
      process.env.HOST ||
      "127.0.0.1",
  ).trim();
}

export function getPort() {
  return readPositiveInteger("PORT", 3002, 65_535);
}

export function getTrustProxyHops() {
  const rawValue = String(process.env.FINANCEIRO_TRUST_PROXY_HOPS || "").trim();
  if (!rawValue) {
    return 0;
  }

  const parsedValue = Number(rawValue);
  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 0 ||
    parsedValue > 10
  ) {
    throw new Error(
      "FINANCEIRO_TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 10.",
    );
  }

  return parsedValue;
}

export function getInternalApiTimestampWindowMs() {
  return readPositiveInteger(
    "FINANCEIRO_HMAC_TIMESTAMP_WINDOW_MS",
    60_000,
    300_000,
  );
}

export function getInternalReplayCacheMaxEntries() {
  return readPositiveInteger(
    "FINANCEIRO_HMAC_REPLAY_CACHE_MAX_ENTRIES",
    50_000,
    1_000_000,
  );
}

export function getInternalApiSecret(
  systemId: "ESCOLA" | "PROJETO_INICIAL",
) {
  const variableName =
    systemId === "ESCOLA"
      ? "FINANCEIRO_HMAC_ESCOLA_SECRET"
      : "FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET";
  return String(process.env[variableName] || "").trim();
}

export function getFiscalArtifactStorageConfig() {
  const configuredMode = String(
    process.env.FINANCEIRO_FISCAL_ARTIFACT_STORAGE_MODE || "",
  )
    .trim()
    .toLowerCase();
  const mode =
    configuredMode ||
    (isProductionEnvironment() ? "database" : "database-and-filesystem");
  if (!["database", "database-and-filesystem"].includes(mode)) {
    throw new Error(
      "FINANCEIRO_FISCAL_ARTIFACT_STORAGE_MODE deve ser database ou database-and-filesystem.",
    );
  }

  const directory = String(
    process.env.FINANCEIRO_FISCAL_ARTIFACT_STORAGE_DIR || "storage",
  ).trim();
  if (
    mode === "database-and-filesystem" &&
    (!directory ||
      directory.includes("\0") ||
      (isProductionEnvironment() &&
        !/^(?:[A-Za-z]:[\\/]|\/(?!$))/.test(directory)))
  ) {
    throw new Error(
      "FINANCEIRO_FISCAL_ARTIFACT_STORAGE_DIR deve ser um diretório absoluto e específico em produção.",
    );
  }

  return {
    persistToFilesystem: mode === "database-and-filesystem",
    directory,
  };
}

export function validateProductionDatabaseConfig() {
  if (!isProductionEnvironment()) {
    return;
  }

  const rawUrl = String(process.env.DATABASE_URL || "").trim();
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawUrl);
  } catch {
    throw new Error(
      "DATABASE_URL deve ser uma URL PostgreSQL válida em produção.",
    );
  }

  const expectedRuntimeRole = String(
    process.env.FINANCEIRO_DATABASE_RUNTIME_ROLE || "financeiro_runtime",
  ).trim();
  let configuredRole = "";
  try {
    configuredRole = decodeURIComponent(databaseUrl.username);
  } catch {
    throw new Error("O usuário de DATABASE_URL possui encoding inválido.");
  }

  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname ||
    !databaseUrl.password ||
    !databaseUrl.pathname ||
    databaseUrl.pathname === "/" ||
    !expectedRuntimeRole ||
    configuredRole !== expectedRuntimeRole
  ) {
    throw new Error(
      "DATABASE_URL de produção deve usar PostgreSQL e exclusivamente o papel de runtime configurado.",
    );
  }

  if (databaseUrl.searchParams.get("sslmode") !== "require") {
    throw new Error(
      "DATABASE_URL de produção deve exigir TLS com sslmode=require.",
    );
  }
  if (
    databaseUrl.searchParams.get("sslaccept") !== "strict" ||
    databaseUrl.searchParams.get("sslrootcert") !==
      "/run/secrets/postgres_tls_ca.pem"
  ) {
    throw new Error(
      "DATABASE_URL de produção deve validar estritamente o certificado PostgreSQL com sslaccept=strict e a CA montada.",
    );
  }

  const connectionLimit = Number(
    databaseUrl.searchParams.get("connection_limit") || "",
  );
  if (
    !Number.isSafeInteger(connectionLimit) ||
    connectionLimit < 1 ||
    connectionLimit > 50
  ) {
    throw new Error(
      "DATABASE_URL de produção deve definir connection_limit entre 1 e 50.",
    );
  }
}

export function validateProductionSecurityConfig() {
  validateSicoobPowerShellRuntime();
  getAllowedOrigins();
  getBodyLimit();
  getUploadLimitBytes();
  getRateLimitConfig();
  getPort();
  getTrustProxyHops();
  getInternalApiTimestampWindowMs();
  getInternalReplayCacheMaxEntries();
  getFiscalArtifactStorageConfig();

  if (!isProductionEnvironment()) {
    return;
  }

  validateProductionDatabaseConfig();

  const encryptionSecret = String(
    process.env.FINANCEIRO_CERTIFICATE_SECRET ||
      process.env.FINANCEIRO_APP_SECRET ||
      "",
  ).trim();
  if (encryptionSecret.length < 32) {
    throw new Error(
      "FINANCEIRO_CERTIFICATE_SECRET (ou FINANCEIRO_APP_SECRET) deve ter pelo menos 32 caracteres em produção.",
    );
  }

  const escolaSecret = getInternalApiSecret("ESCOLA");
  const projetoInicialSecret = getInternalApiSecret("PROJETO_INICIAL");
  if (escolaSecret.length < 32 || projetoInicialSecret.length < 32) {
    throw new Error(
      "As credenciais HMAC de ESCOLA e PROJETO_INICIAL devem ter pelo menos 32 caracteres em produção.",
    );
  }
  if (escolaSecret === projetoInicialSecret) {
    throw new Error(
      "ESCOLA e PROJETO_INICIAL devem usar credenciais HMAC diferentes.",
    );
  }

  const escolaCallbackSecret = String(
    process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET || "",
  ).trim();
  const projetoCallbackSecret = String(
    process.env.SOURCE_SYSTEM_PROJETO_INICIAL_HMAC_SECRET || "",
  ).trim();
  if (
    escolaCallbackSecret.length < 32 ||
    projetoCallbackSecret.length < 32
  ) {
    throw new Error(
      "As credenciais HMAC direcionais de callback para ESCOLA e PROJETO_INICIAL devem ter pelo menos 32 caracteres em produção.",
    );
  }
  if (
    escolaCallbackSecret === projetoCallbackSecret ||
    escolaCallbackSecret === escolaSecret ||
    projetoCallbackSecret === projetoInicialSecret
  ) {
    throw new Error(
      "Cada direção e cada sistema devem usar uma credencial HMAC exclusiva.",
    );
  }
}
