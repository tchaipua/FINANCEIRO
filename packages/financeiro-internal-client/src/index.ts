import { createHash, createHmac, randomBytes } from "crypto";

export type FinanceiroSourceSystem = "ESCOLA" | "PROJETO_INICIAL";

export type FinanceiroAuthenticatedContext = {
  systemId: FinanceiroSourceSystem;
  tenantId: string;
  branchCode: number;
  userId: string;
  scopes?: readonly string[];
};

export type FinanceiroInternalClientOptions = {
  baseUrl: string;
  systemId: FinanceiroSourceSystem;
  secret: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
};

export type FinanceiroInternalRequest = {
  path: string;
  method?: string;
  context: Omit<FinanceiroAuthenticatedContext, "systemId">;
  json?: unknown;
  bodyBytes?: Buffer | Uint8Array | string;
  contentType?: string;
  headers?: Record<string, string>;
};

export type FinanceiroBinaryResponse = {
  status: number;
  contentType: "application/pdf" | "application/xml";
  contentDisposition: string | null;
  body: Buffer;
};

const VERSION = "v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BINARY_RESPONSE_BYTES = 10 * 1024 * 1024;
const PROTECTED_HEADERS = new Set([
  "x-msinfor-signature-version",
  "x-msinfor-system-id",
  "x-msinfor-tenant-id",
  "x-msinfor-branch-code",
  "x-msinfor-user-id",
  "x-msinfor-scopes",
  "x-msinfor-timestamp",
  "x-msinfor-nonce",
  "x-msinfor-content-sha256",
  "x-msinfor-signature",
]);

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

export function canonicalizeFinanceiroTarget(target: string) {
  const parsedUrl = new URL(target, "http://internal.invalid");
  const entries = Array.from(parsedUrl.searchParams.entries())
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = compareCanonicalText(leftKey, rightKey);
      return keyComparison || compareCanonicalText(leftValue, rightValue);
    });
  const query = entries.map(([key, value]) => `${key}=${value}`).join("&");
  return `${parsedUrl.pathname}${query ? `?${query}` : ""}`;
}

function normalizeScopes(scopes: readonly string[] | undefined) {
  return Array.from(
    new Set(
      (scopes || [])
        .map((scope) => String(scope).trim().toUpperCase())
        .filter((scope) => /^[A-Z][A-Z0-9_:-]{0,63}$/.test(scope)),
    ),
  ).sort();
}

function serializeBody(request: FinanceiroInternalRequest) {
  if (request.json !== undefined && request.bodyBytes !== undefined) {
    throw new Error("Informe json ou bodyBytes, nunca os dois.");
  }
  if (request.json !== undefined) {
    return {
      bytes: Buffer.from(JSON.stringify(request.json), "utf8"),
      contentType: request.contentType || "application/json",
    };
  }
  if (request.bodyBytes !== undefined) {
    return {
      bytes: Buffer.from(request.bodyBytes),
      contentType: request.contentType,
    };
  }
  return { bytes: Buffer.alloc(0), contentType: request.contentType };
}

export function withFinanceiroContextFields<T extends Record<string, unknown>>(
  value: T,
  systemId: FinanceiroSourceSystem,
  context: Omit<FinanceiroAuthenticatedContext, "systemId">,
  options?: { includeBranch?: boolean; includeRequestedBy?: boolean },
) {
  return {
    ...value,
    sourceSystem: systemId,
    sourceTenantId: context.tenantId.trim().toUpperCase(),
    ...(options?.includeBranch
      ? { sourceBranchCode: context.branchCode }
      : {}),
    ...(options?.includeRequestedBy
      ? { requestedBy: context.userId }
      : {}),
  };
}

export function createFinanceiroInternalClient(
  options: FinanceiroInternalClientOptions,
) {
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(String(options.baseUrl || ""));
  } catch {
    throw new Error("baseUrl interna inválida.");
  }
  if (
    !["http:", "https:"].includes(parsedBaseUrl.protocol) ||
    parsedBaseUrl.username ||
    parsedBaseUrl.password ||
    parsedBaseUrl.search ||
    parsedBaseUrl.hash
  ) {
    throw new Error("baseUrl interna inválida.");
  }
  if (!["ESCOLA", "PROJETO_INICIAL"].includes(options.systemId)) {
    throw new Error("systemId interno inválido.");
  }
  const basePath = parsedBaseUrl.pathname.replace(/\/+$/, "") || "/";
  const baseUrl = `${parsedBaseUrl.origin}${basePath === "/" ? "" : basePath}`;
  const secret = String(options.secret || "");
  if (secret.length < 32) {
    throw new Error("A credencial técnica deve possuir pelo menos 32 caracteres.");
  }
  const fetchImplementation = options.fetchImplementation || fetch;
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 120_000
  ) {
    throw new Error("timeoutMs deve estar entre 1000 e 120000 milissegundos.");
  }

  async function send(request: FinanceiroInternalRequest) {
      const method = String(request.method || "GET").toUpperCase();
      const requestPath = String(request.path || "");
      if (
        !requestPath.startsWith("/") ||
        requestPath.startsWith("//") ||
        requestPath.includes("\\") ||
        /[\u0000-\u001f\u007f]/.test(requestPath) ||
        !/^[A-Z]+$/.test(method)
      ) {
        throw new Error("Caminho ou método interno inválido.");
      }
      const targetUrl = new URL(`${baseUrl}${requestPath}`);
      const targetPath = targetUrl.pathname.replace(/\/+$/, "") || "/";
      if (
        targetUrl.origin !== parsedBaseUrl.origin ||
        (basePath !== "/" &&
          targetPath !== basePath &&
          !targetPath.startsWith(`${basePath}/`))
      ) {
        throw new Error("A requisição deve permanecer no backend Financeiro configurado.");
      }

      const tenantId = String(request.context.tenantId || "")
        .trim()
        .toUpperCase();
      const branchCode = Number(request.context.branchCode);
      const userId = String(request.context.userId || "").trim();
      if (
        !tenantId ||
        !Number.isSafeInteger(branchCode) ||
        branchCode < 1 ||
        !userId
      ) {
        throw new Error("Contexto interno inválido.");
      }

      const scopes = normalizeScopes(request.context.scopes);
      const { bytes, contentType } = serializeBody(request);
      const timestamp = String(Date.now());
      const nonce = randomBytes(24).toString("base64url");
      const bodySha256 = createHash("sha256").update(bytes).digest("hex");
      const canonicalTarget = canonicalizeFinanceiroTarget(
        `${targetUrl.pathname}${targetUrl.search}`,
      );
      const canonicalPayload = [
        VERSION,
        options.systemId,
        method,
        canonicalTarget,
        timestamp,
        nonce,
        bodySha256,
        tenantId,
        String(branchCode),
        userId,
        scopes.join(","),
      ].join("\n");
      const signature = createHmac("sha256", secret)
        .update(canonicalPayload)
        .digest("hex");

      const additionalHeaders = Object.fromEntries(
        Object.entries(request.headers || {}).filter(
          ([name]) => !PROTECTED_HEADERS.has(name.toLowerCase()),
        ),
      );
      const headers: Record<string, string> = {
        ...additionalHeaders,
        ...(contentType ? { "content-type": contentType } : {}),
        "x-msinfor-signature-version": VERSION,
        "x-msinfor-system-id": options.systemId,
        "x-msinfor-tenant-id": tenantId,
        "x-msinfor-branch-code": String(branchCode),
        "x-msinfor-user-id": userId,
        "x-msinfor-scopes": scopes.join(","),
        "x-msinfor-timestamp": timestamp,
        "x-msinfor-nonce": nonce,
        "x-msinfor-content-sha256": bodySha256,
        "x-msinfor-signature": signature,
      };

      const response = await fetchImplementation(targetUrl, {
        method,
        headers,
        body: bytes.length > 0 ? bytes : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const responseMessage =
          payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : null;
        throw new Error(
          responseMessage ||
            `Financeiro respondeu com HTTP ${response.status}.`,
        );
      }
      return response;
  }

  return {
    async request<T>(request: FinanceiroInternalRequest): Promise<T> {
      const response = await send(request);
      const payload = await response.json().catch(() => null);
      if (payload === null) {
        throw new Error("O Financeiro retornou uma resposta JSON inválida.");
      }
      return payload as T;
    },

    async requestBytes(
      request: FinanceiroInternalRequest,
      options?: { maxBytes?: number },
    ): Promise<FinanceiroBinaryResponse> {
      const maxBytes = Number(
        options?.maxBytes ?? DEFAULT_MAX_BINARY_RESPONSE_BYTES,
      );
      if (
        !Number.isSafeInteger(maxBytes) ||
        maxBytes < 1 ||
        maxBytes > 50 * 1024 * 1024
      ) {
        throw new Error(
          "maxBytes deve ser um inteiro entre 1 byte e 50 MiB.",
        );
      }

      const response = await send(request);
      const declaredLength = Number(
        response.headers.get("content-length") || "0",
      );
      if (
        (declaredLength &&
          (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) ||
        declaredLength > maxBytes
      ) {
        throw new Error("O arquivo do Financeiro excede o limite permitido.");
      }

      const rawContentType = String(
        response.headers.get("content-type") || "",
      );
      const mediaType = rawContentType
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (mediaType !== "application/pdf" && mediaType !== "application/xml") {
        throw new Error(
          "O Financeiro retornou um tipo de arquivo não autorizado.",
        );
      }

      const contentDisposition =
        response.headers.get("content-disposition");
      if (
        contentDisposition &&
        (contentDisposition.length > 512 ||
          /[\r\n]/.test(contentDisposition))
      ) {
        throw new Error(
          "O Financeiro retornou um nome de arquivo inválido.",
        );
      }

      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > maxBytes) {
        throw new Error("O arquivo do Financeiro excede o limite permitido.");
      }

      return {
        status: response.status,
        contentType: mediaType,
        contentDisposition,
        body,
      };
    },
  };
}
