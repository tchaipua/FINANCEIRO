import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

const MAX_SECRET_FILE_BYTES = 16 * 1024;
const runtimeSecretNames = [
  "DATABASE_URL",
  "FINANCEIRO_CERTIFICATE_SECRET",
  "FINANCEIRO_APP_SECRET",
  "FINANCEIRO_HMAC_ESCOLA_SECRET",
  "FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET",
  "SOURCE_SYSTEM_ESCOLA_HMAC_SECRET",
  "SOURCE_SYSTEM_PROJETO_INICIAL_HMAC_SECRET",
  "MSINFOR_CENTRAL_SYSTEM_KEY",
];

function readSecretFile(variableName, filePath) {
  if (!isAbsolute(filePath)) {
    throw new Error(`${variableName}_FILE deve apontar para um caminho absoluto.`);
  }
  const metadata = statSync(filePath);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_SECRET_FILE_BYTES) {
    throw new Error(`${variableName}_FILE não aponta para um secret file válido.`);
  }

  const value = readFileSync(filePath, "utf8").replace(/\r?\n$/, "");
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${variableName}_FILE contém um valor inválido.`);
  }
  return value;
}

function hydrateSecret(variableName) {
  const inlineValue = String(process.env[variableName] || "").trim();
  const fileVariableName = `${variableName}_FILE`;
  const filePath = String(process.env[fileVariableName] || "").trim();
  if (inlineValue && filePath) {
    throw new Error(
      `Configure somente ${variableName} ou ${fileVariableName}, nunca ambos.`,
    );
  }
  if (filePath) {
    process.env[variableName] = readSecretFile(variableName, filePath);
    delete process.env[fileVariableName];
  }
}

if (
  process.env.MIGRATION_DATABASE_URL ||
  process.env.MIGRATION_DATABASE_URL_FILE
) {
  throw new Error(
    "A credencial do migrador foi fornecida ao runtime e a inicialização foi recusada.",
  );
}

for (const variableName of runtimeSecretNames) {
  hydrateSecret(variableName);
}

await import("../dist/main.js");
