import { createHash } from "crypto";

export const INTERNAL_API_SIGNATURE_VERSION = "v1";
export const INTERNAL_SYSTEM_IDS = ["ESCOLA", "PROJETO_INICIAL"] as const;

export type InternalSystemId = (typeof INTERNAL_SYSTEM_IDS)[number];

export const INTERNAL_API_HEADERS = {
  version: "x-msinfor-signature-version",
  systemId: "x-msinfor-system-id",
  tenantId: "x-msinfor-tenant-id",
  branchCode: "x-msinfor-branch-code",
  userId: "x-msinfor-user-id",
  scopes: "x-msinfor-scopes",
  timestamp: "x-msinfor-timestamp",
  nonce: "x-msinfor-nonce",
  contentSha256: "x-msinfor-content-sha256",
  signature: "x-msinfor-signature",
} as const;

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function compareCanonicalText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeInternalSystemId(
  value: unknown,
): InternalSystemId | null {
  const normalizedValue = String(value || "").trim().toUpperCase();
  return INTERNAL_SYSTEM_IDS.includes(normalizedValue as InternalSystemId)
    ? (normalizedValue as InternalSystemId)
    : null;
}

export function normalizeInternalScopes(value: unknown) {
  const rawScopes = Array.isArray(value)
    ? value
    : String(value || "").split(",");

  return Array.from(
    new Set(
      rawScopes
        .map((scope) => String(scope || "").trim().toUpperCase())
        .filter((scope) => /^[A-Z][A-Z0-9_:-]{0,63}$/.test(scope)),
    ),
  ).sort();
}

export function canonicalizePathAndQuery(target: string) {
  const parsedUrl = new URL(String(target || "/"), "http://internal.invalid");
  const queryEntries = Array.from(parsedUrl.searchParams.entries())
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = compareCanonicalText(leftKey, rightKey);
      return keyComparison || compareCanonicalText(leftValue, rightValue);
    });
  const canonicalQuery = queryEntries
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return `${parsedUrl.pathname}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
}

export function hashInternalRequestBody(body: Buffer | Uint8Array | string) {
  return createHash("sha256").update(body).digest("hex");
}

export type InternalSignaturePayload = {
  version: string;
  systemId: string;
  method: string;
  canonicalTarget: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
  tenantId: string;
  branchCode: string;
  userId: string;
  scopes: readonly string[];
};

export function buildInternalSignaturePayload(
  input: InternalSignaturePayload,
) {
  return [
    input.version,
    input.systemId,
    input.method.toUpperCase(),
    input.canonicalTarget,
    input.timestamp,
    input.nonce,
    input.bodySha256,
    input.tenantId,
    input.branchCode,
    input.userId,
    [...input.scopes].sort().join(","),
  ].join("\n");
}
