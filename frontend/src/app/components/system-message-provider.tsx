"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export type SystemMessageType = "error" | "success";

type SystemMessageDetail = {
  type: SystemMessageType;
  message: string;
  logoUrl?: string | null;
};

type VisibleMessage = SystemMessageDetail & { id: number };

const MESSAGE_EVENT = "msinfor:system-message";
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SILENT_SUCCESS_PATTERNS = [
  /\/auth\/(?:login|master-login|logout|refresh|me)(?:\/|$)/i,
  /\/(?:search|lookup|preview|validate|validation|check|exists|suggestions?|calculate)(?:\/|\?|$)/i,
  /\/notifications?\/.+\/(?:read|viewed)(?:\/|\?|$)/i,
  /\/user-preferences(?:\/|\?|$)/i,
  /\/(?:heartbeat|health)(?:\/|\?|$)/i,
];

export function showSystemMessage(type: SystemMessageType, message: string, logoUrl?: string | null) {
  if (typeof window === "undefined" || !String(message || "").trim()) return;
  window.dispatchEvent(new CustomEvent<SystemMessageDetail>(MESSAGE_EVENT, {
    detail: { type, message: String(message).trim(), logoUrl },
  }));
}

export function showSuccessMessage(message: string, logoUrl?: string | null) {
  showSystemMessage("success", message, logoUrl);
}

export function showErrorMessage(message: string, logoUrl?: string | null) {
  showSystemMessage("error", message, logoUrl);
}

function decodeJwtPayload(token: string | null) {
  if (!token || token.split(".").length < 3) return null;
  try {
    const body = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, "="))) as { tenantId?: string };
  } catch {
    return null;
  }
}

function readCurrentTenantId() {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !/token/i.test(key)) continue;
      const tenantId = decodeJwtPayload(storage.getItem(key))?.tenantId;
      if (tenantId) return tenantId;
    }
  }
  return null;
}

function readCachedLogo() {
  const tenantId = readCurrentTenantId();
  if (!tenantId) return null;
  try {
    const branding = JSON.parse(window.localStorage.getItem(`tenant-branding:${tenantId}`) || "null") as { logoUrl?: string | null } | null;
    return branding?.logoUrl || null;
  } catch {
    return null;
  }
}

function resolveLogoUrl(pathname: string, explicitLogo?: string | null) {
  if (explicitLogo) return explicitLogo;

  const outsideSystem = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/reset-password");
  if (outsideSystem) return "/logo-msinfor.jpg";

  const params = new URLSearchParams(window.location.search);
  const queryLogo = params.get("logoUrl") || params.get("companyLogoUrl");
  if (queryLogo) return queryLogo;

  const visibleLogo = document.querySelector<HTMLImageElement>(
    "[data-current-company-logo], .side-logo-image img, .sidebar img, header img[data-company-logo]",
  );
  return visibleLogo?.src || readCachedLogo() || "/logo-msinfor.jpg";
}

function normalizeMessage(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.map(String).join("; ");
  const text = String(value || "").trim();
  return text || fallback;
}

async function readResponseMessage(response: Response, fallback: string) {
  try {
    const payload = await response.clone().json() as { message?: unknown; error?: unknown };
    return normalizeMessage(payload?.message ?? payload?.error, fallback);
  } catch {
    return fallback;
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function defaultSuccessMessage(method: string) {
  if (method === "DELETE") return "Registro excluído com sucesso.";
  if (method === "PATCH" || method === "PUT") return "Informações atualizadas com sucesso.";
  return "Informações salvas com sucesso.";
}

function cleanLegacyMessage(text: string, type: SystemMessageType) {
  return text
    .replace(type === "success" ? /^\s*SUCESSO\s*!*\s*[:\-–—]?\s*/i : /^\s*E\s*R\s*R\s*O\s*!*\s*[:\-–—]?\s*/i, "")
    .replace(/\b(?:Fechar|OK|Voltar|Continuar)\b/gi, " ")
    .replace(/[×✕]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findLegacyClose(element: HTMLElement) {
  const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>("button"));
  return buttons.find((button) => {
    const label = `${button.textContent || ""} ${button.getAttribute("aria-label") || ""}`;
    return /fechar|continuar|voltar|ok|×|close/i.test(label);
  }) || null;
}

export default function SystemMessageProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState<VisibleMessage | null>(null);
  const lastSignatureRef = useRef("");
  const lastShownAtRef = useRef(0);
  const lastInteractionAtRef = useRef(0);
  const lastLegacyCaptureAtRef = useRef(0);
  const lastInvalidAtRef = useRef(0);
  const legacyCloseRef = useRef<(() => void) | null>(null);

  const display = useCallback((detail: SystemMessageDetail, legacyClose?: (() => void) | null) => {
    const message = String(detail.message || "").replace(/\s+/g, " ").trim();
    if (!message) return;
    const signature = `${detail.type}:${message}`;
    const now = Date.now();
    if (lastSignatureRef.current === signature && now - lastShownAtRef.current < 1200) return;
    lastSignatureRef.current = signature;
    lastShownAtRef.current = now;
    legacyCloseRef.current = legacyClose || null;
    setVisible({ ...detail, message, logoUrl: resolveLogoUrl(pathname, detail.logoUrl), id: now });
  }, [pathname]);

  const close = useCallback(() => {
    setVisible(null);
    const legacyClose = legacyCloseRef.current;
    legacyCloseRef.current = null;
    legacyClose?.();
  }, []);

  useEffect(() => {
    const listener = (event: Event) => display((event as CustomEvent<SystemMessageDetail>).detail);
    window.addEventListener(MESSAGE_EVENT, listener);
    return () => window.removeEventListener(MESSAGE_EVENT, listener);
  }, [display]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && visible) close();
      if (event.key === "Enter" || event.key === " ") lastInteractionAtRef.current = Date.now();
    };
    const markInteraction = () => { lastInteractionAtRef.current = Date.now(); };
    document.addEventListener("pointerdown", markInteraction, true);
    document.addEventListener("submit", markInteraction, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", markInteraction, true);
      document.removeEventListener("submit", markInteraction, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, visible]);

  useEffect(() => {
    const originalAlert = window.alert.bind(window);
    window.alert = (message?: unknown) => display({
      type: /sucesso|conclu[ií]d|realizad/i.test(String(message || "")) ? "success" : "error",
      message: normalizeMessage(message, "Não foi possível concluir a operação."),
    });
    return () => { window.alert = originalAlert; };
  }, [display]);

  useEffect(() => {
    const onInvalid = (event: Event) => {
      event.preventDefault();
      const field = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const now = Date.now();
      if (now - lastInvalidAtRef.current < 120) return;
      lastInvalidAtRef.current = now;
      const label = field.closest("label, .field")?.querySelector("span")?.textContent?.trim()
        || field.getAttribute("aria-label")
        || field.getAttribute("placeholder")
        || "o campo obrigatório";
      display({
        type: "error",
        message: field.validity.valueMissing
          ? `Informe ${label.toLowerCase()}.`
          : field.validationMessage || `Verifique ${label.toLowerCase()}.`,
      });
      field.focus();
    };
    document.addEventListener("invalid", onInvalid, true);
    return () => document.removeEventListener("invalid", onInvalid, true);
  }, [display]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const method = requestMethod(input, init);
      if (!MUTATION_METHODS.has(method)) return originalFetch(input, init);

      const url = requestUrl(input);
      const userInitiated = Date.now() - lastInteractionAtRef.current < 5000;
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await originalFetch(input, init);
      } catch (error) {
        if (userInitiated) {
          display({
            type: "error",
            message: error instanceof Error ? error.message : "Não foi possível concluir a operação.",
          });
        }
        throw error;
      }
      if (!userInitiated) return response;

      const silentSuccess = SILENT_SUCCESS_PATTERNS.some((pattern) => pattern.test(url));
      const fallback = response.ok ? defaultSuccessMessage(method) : "Não foi possível concluir a operação.";
      const message = await readResponseMessage(response, fallback);
      window.setTimeout(() => {
        if (lastLegacyCaptureAtRef.current >= startedAt) return;
        if (response.ok) {
          if (!silentSuccess) display({ type: "success", message });
        } else {
          display({ type: "error", message });
        }
      }, 240);
      return response;
    };
    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, [display]);

  useEffect(() => {
    const selector = [
      ".alert-ok", ".alert-error", ".login-error-backdrop",
      "[data-message-type='success']", "[data-message-type='error']",
      "[role='alert']", "[role='alertdialog']", ".fixed.inset-0",
      "[class*='border-red-'][class*='bg-red-'][class*='text-red-']",
      "[class*='border-rose-'][class*='bg-rose-'][class*='text-rose-']",
      "[class*='border-green-'][class*='bg-green-'][class*='text-green-']",
      "[class*='border-emerald-'][class*='bg-emerald-'][class*='text-emerald-']",
    ].join(",");

    const capture = (element: HTMLElement) => {
      if (element.closest("[data-system-message-root]")) return;
      if (element.matches(".fixed.inset-0") && element.querySelector("form, input, select, textarea")) return;
      const rawText = String(element.textContent || "").replace(/\s+/g, " ").trim();
      if (!rawText) return;

      const explicitSuccess = element.matches(".alert-ok,[data-message-type='success']");
      const explicitError = element.matches(".alert-error,.login-error-backdrop,[data-message-type='error']");
      const successHeadline = /\bSUCESSO\b|\bsalv[oa]s?\b|\bgravad[oa]s?\b|\batualizad[oa]s?\b|\bcadastrad[oa]s?\b|\bconclu[ií]d[oa]s?\b|\benviad[oa]s?\b|\bexclu[ií]d[oa]s?\b|\bregistrad[oa]s?\b|\bprocessad[oa]s?\b|\bgerad[oa]s?\b|\bimportad[oa]s?\b|\bconfirmad[oa]s?\b|\balterad[oa]s?\b|\bagendad[oa]s?\b/i.test(rawText);
      const errorHeadline = /E\s*R\s*R\s*O\s*!*|\bnão (?:foi|é|está|possui|pode|confere)\b|\bdeve (?:ser|estar|informar|selecionar)\b|\bfalha\b|\binválid[oa]s?\b|\binforme\b|\bselecione\b|\bnenhum\b|\bsomente\b|\bobrigatóri[oa]s?\b|\bindisponível\b|\bausente\b|\bincorret[oa]s?\b|\bbloquead[oa]s?\b/i.test(rawText);
      const type: SystemMessageType | null = explicitError || errorHeadline
        ? "error"
        : explicitSuccess || successHeadline
          ? "success"
          : null;
      if (!type) return;

      if (element.matches(".fixed.inset-0") && !successHeadline && !errorHeadline) return;
      const preferred = Array.from(element.querySelectorAll<HTMLElement>(".login-error-body p, [data-message-body], p"))
        .map((node) => String(node.textContent || "").trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)[0];
      const message = cleanLegacyMessage(preferred || rawText, type);
      if (!message) return;

      const signature = `${type}:${message}`;
      if (element.dataset.systemMessageCaptured === signature) return;
      element.dataset.systemMessageCaptured = signature;
      element.style.setProperty("display", "none", "important");
      const closeButton = findLegacyClose(element);
      lastLegacyCaptureAtRef.current = Date.now();
      display({ type, message }, closeButton ? () => closeButton.click() : null);
    };

    const scan = (root: ParentNode) => {
      if (root instanceof HTMLElement && root.matches(selector)) capture(root);
      root.querySelectorAll<HTMLElement>(selector).forEach(capture);
    };
    scan(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData" && mutation.target.parentElement) {
          scan(mutation.target.parentElement);
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) scan(node);
          else if (node.parentElement) scan(node.parentElement);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [display]);

  return (
    <>
      {children}
      {visible ? (
        <div className="system-message-backdrop" data-system-message-root role="presentation">
          <section
            className={`system-message-card system-message-${visible.type}`}
            role="alertdialog"
            aria-modal="true"
            aria-label={visible.type === "success" ? "Sucesso" : "Erro"}
          >
            <span className="system-message-accent" aria-hidden="true" />
            <span className="system-message-status-icon" aria-hidden="true">
              {visible.type === "success" ? "✓" : "!"}
            </span>
            <header className="system-message-header">
              <span className="system-message-logo">
                <img src={visible.logoUrl || "/logo-msinfor.jpg"} alt="Logotipo" />
              </span>
              <strong>{visible.type === "success" ? "SUCESSO !!!" : "ERRO !!!!"}</strong>
              <span aria-hidden="true" />
            </header>
            <div className="system-message-divider" />
            <div className="system-message-body"><p>{visible.message}</p></div>
            <button type="button" className="system-message-close" onClick={close} aria-label="Fechar mensagem">×</button>
          </section>
        </div>
      ) : null}
    </>
  );
}
