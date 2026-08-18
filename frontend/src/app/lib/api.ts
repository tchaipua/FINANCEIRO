function resolveSameOriginApiBaseUrl(value: string | undefined): string {
  const candidate = String(value || "/api/financeiro").trim();

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.includes("?") ||
    candidate.includes("#")
  ) {
    throw new Error(
      "NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL deve ser um caminho same-origin.",
    );
  }

  return candidate.length > 1 ? candidate.replace(/\/+$/, "") : candidate;
}

export const API_BASE_URL = resolveSameOriginApiBaseUrl(
  process.env.NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL,
);

// O Financeiro é servido pelo mesmo host do sistema de origem. Portanto,
// somente os cookies que o navegador torna visíveis nesse host podem fornecer
// o token. A ordem mantém os contratos atuais de Escola e Projeto antes do
// fallback legado, sem aceitar nome/origem vindos de URL ou mensagem externa.
const ORIGIN_CSRF_COOKIE_NAMES = [
  "__Host-msinfor_escola_csrf",
  "msinfor_escola_csrf",
  "__Host-msinfor_projeto_csrf",
  "msinfor_projeto_csrf",
  "__Host-msinfor_financeiro_csrf",
  "msinfor_financeiro_csrf",
] as const;
const CSRF_COOKIE_NAMES_BY_SOURCE_SYSTEM = {
  ESCOLA: [
    "__Host-msinfor_escola_csrf",
    "msinfor_escola_csrf",
  ],
  PROJETO_INICIAL: [
    "__Host-msinfor_projeto_csrf",
    "msinfor_projeto_csrf",
  ],
} as const;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let activeSourceSystem: "ESCOLA" | "PROJETO_INICIAL" | null = null;

export function setFinanceSourceSystem(sourceSystem: string | null | undefined) {
  const normalized = String(sourceSystem || "").trim().toUpperCase();
  activeSourceSystem =
    normalized === "ESCOLA" || normalized === "PROJETO_INICIAL"
      ? normalized
      : null;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const encodedName = `${encodeURIComponent(name)}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName));
  if (!match) return null;

  try {
    return decodeURIComponent(match.slice(encodedName.length));
  } catch {
    return null;
  }
}

function readFinanceCsrfToken() {
  const sourceSpecificNames = activeSourceSystem
    ? CSRF_COOKIE_NAMES_BY_SOURCE_SYSTEM[activeSourceSystem]
    : [];
  const cookieNames = [
    ...sourceSpecificNames,
    ...ORIGIN_CSRF_COOKIE_NAMES.filter(
      (cookieName) => !sourceSpecificNames.includes(cookieName as never),
    ),
  ];
  for (const cookieName of cookieNames) {
    const token = readCookie(cookieName);
    if (token && /^[A-Za-z0-9._~-]{20,512}$/.test(token)) {
      return token;
    }
  }
  return null;
}

export async function financeApiFetch(
  path: string,
  init: RequestInit = {},
) {
  const requestPath = String(path || "");
  if (
    !requestPath.startsWith("/") ||
    requestPath.startsWith("//") ||
    requestPath.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(requestPath)
  ) {
    throw new Error("Caminho inválido para o BFF do Financeiro.");
  }

  const method = String(init.method || "GET").trim().toUpperCase();
  const headers = new Headers(init.headers);
  headers.delete("x-msinfor-csrf");
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readFinanceCsrfToken();
    if (!csrfToken) {
      throw new Error(
        "A sessão segura do Financeiro expirou. Atualize a página e entre novamente.",
      );
    }
    headers.set("x-msinfor-csrf", csrfToken);
  }

  return fetch(`${API_BASE_URL}${requestPath}`, {
    ...init,
    method,
    headers,
    credentials: "include",
    cache: "no-store",
    mode: "same-origin",
    redirect: "error",
  });
}

export async function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path, {
    fallbackMessage: "Não foi possível carregar os dados do Financeiro.",
  });
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit & { fallbackMessage?: string },
): Promise<T> {
  const response = await financeApiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        init?.fallbackMessage ||
        "Não foi possível carregar os dados do Financeiro.",
    );
  }

  return payload as T;
}
