import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { BadRequestException } from "@nestjs/common";

function getSecretKey() {
  const rawSecret =
    process.env.FINANCEIRO_CERTIFICATE_SECRET ||
    process.env.FINANCEIRO_APP_SECRET ||
    "";

  const normalizedSecret = String(rawSecret || "").trim();
  if (!normalizedSecret) {
    throw new BadRequestException(
      "Configure a chave FINANCEIRO_CERTIFICATE_SECRET no backend para operar certificados digitais.",
    );
  }

  return createHash("sha256").update(normalizedSecret).digest();
}

export function encryptSecret(value: string) {
  const normalizedValue = String(value || "");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizedValue, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(value: string) {
  const payload = Buffer.from(String(value || ""), "base64");
  if (payload.length < 29) {
    throw new BadRequestException("Segredo criptografado inválido.");
  }

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", getSecretKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}
