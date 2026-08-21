import {
  BadGatewayException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";
import { getFinanceContext } from "./finance-context";
import {
  buildInternalSignaturePayload,
  canonicalizePathAndQuery,
  hashInternalRequestBody,
  INTERNAL_API_HEADERS,
  INTERNAL_API_SIGNATURE_VERSION,
} from "./internal-api-signature";
import { resolveSourceCallbackConfiguration } from "./source-system-parameters.client";

export type SourceSystemPerson = {
  found: boolean;
  registeredPersonId?: string | null;
  sourceUserId?: string | null;
  centralIdentityAccountId?: string | null;
  name?: string | null;
  email?: string | null;
  login?: string | null;
  document?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  city?: string | null;
  state?: string | null;
  roles?: string[];
};

export type SourceSystemUserResult = {
  sourceUserId: string;
  centralIdentityAccountId?: string | null;
  registeredPersonId?: string | null;
  displayName: string;
  email?: string | null;
  login: string;
  sourceRole: string;
  branchCodes: number[];
  active: boolean;
};

type SourceUserOperation =
  | "resolve"
  | "upsert"
  | "confirmation-pin"
  | "password"
  | "confirm-operation-credential";

async function requestSourceSystemUsers<T>(
  operation: SourceUserOperation,
  payload: Record<string, unknown>,
): Promise<T> {
  const context = getFinanceContext();
  if (
    !context?.authenticated ||
    !context.sourceSystem ||
    !context.sourceTenantId ||
    !context.sourceBranchCode ||
    !context.sourceUserId
  ) {
    throw new ForbiddenException("CONTEXTO FINANCEIRO AUTENTICADO É OBRIGATÓRIO.");
  }

  const configuration = resolveSourceCallbackConfiguration(context.sourceSystem);
  if (!configuration.baseUrl || !configuration.secret) {
    throw new ServiceUnavailableException(
      "O SISTEMA DE ORIGEM NÃO ESTÁ CONFIGURADO PARA USUÁRIOS DO SISTEMA.",
    );
  }

  const endpoint = new URL(
    `${configuration.baseUrl}/integrations/financeiro/system-users/${operation}`,
  );
  const callbackBody = {
    ...payload,
    sourceSystem: context.sourceSystem,
    sourceTenantId: context.sourceTenantId,
    sourceBranchCode: context.sourceBranchCode,
    requestedBy: context.sourceUserId,
  };
  const bodyBytes = Buffer.from(JSON.stringify(callbackBody), "utf8");
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString("base64url");
  const scopes = ["SYSTEM_USERS_WRITE"] as const;
  const bodySha256 = hashInternalRequestBody(bodyBytes);
  const canonicalPayload = buildInternalSignaturePayload({
    version: INTERNAL_API_SIGNATURE_VERSION,
    systemId: "FINANCEIRO",
    method: "POST",
    canonicalTarget: canonicalizePathAndQuery(
      `${endpoint.pathname}${endpoint.search}`,
    ),
    timestamp,
    nonce,
    bodySha256,
    tenantId: context.sourceTenantId,
    branchCode: String(context.sourceBranchCode),
    userId: context.sourceUserId,
    scopes,
  });
  const signature = createHmac("sha256", configuration.secret)
    .update(canonicalPayload)
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [INTERNAL_API_HEADERS.version]: INTERNAL_API_SIGNATURE_VERSION,
        [INTERNAL_API_HEADERS.systemId]: "FINANCEIRO",
        [INTERNAL_API_HEADERS.tenantId]: context.sourceTenantId,
        [INTERNAL_API_HEADERS.branchCode]: String(context.sourceBranchCode),
        [INTERNAL_API_HEADERS.userId]: context.sourceUserId,
        [INTERNAL_API_HEADERS.scopes]: scopes.join(","),
        [INTERNAL_API_HEADERS.timestamp]: timestamp,
        [INTERNAL_API_HEADERS.nonce]: nonce,
        [INTERNAL_API_HEADERS.contentSha256]: bodySha256,
        [INTERNAL_API_HEADERS.signature]: signature,
      },
      body: bodyBytes,
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null) as
        | { message?: unknown }
        | null;
      const message = String(errorBody?.message || "").trim();
      throw new BadGatewayException(
        message || `O SISTEMA DE ORIGEM RECUSOU A OPERAÇÃO (HTTP ${response.status}).`,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (
      error instanceof BadGatewayException ||
      error instanceof ServiceUnavailableException
    ) {
      throw error;
    }
    throw new BadGatewayException(
      "NÃO FOI POSSÍVEL SINCRONIZAR O USUÁRIO COM O SISTEMA DE ORIGEM.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveSourceSystemPerson(document: string) {
  return requestSourceSystemUsers<SourceSystemPerson>("resolve", { document });
}

export function upsertSourceSystemUser(payload: Record<string, unknown>) {
  return requestSourceSystemUsers<SourceSystemUserResult>("upsert", payload);
}

export function updateSourceSystemUserConfirmationPin(
  sourceUserId: string,
  confirmationPin: string,
) {
  return requestSourceSystemUsers<{ updated: boolean }>("confirmation-pin", {
    sourceUserId,
    confirmationPin,
  });
}

export function updateSourceSystemUserPassword(
  sourceUserId: string,
  password: string,
) {
  return requestSourceSystemUsers<{ updated: boolean }>("password", {
    sourceUserId,
    password,
  });
}

export async function confirmSourceSystemOperationCredential(credential: string) {
  const confirmation = await requestSourceSystemUsers<{
    authenticated: true;
    authorizedBy: string;
    supervisorName?: string;
  }>("confirm-operation-credential", { credential });
  if (
    confirmation?.authenticated !== true
    || !String(confirmation.authorizedBy || "").trim()
  ) {
    throw new BadGatewayException(
      "O SISTEMA DE ORIGEM RETORNOU UMA CONFIRMAÇÃO DE CREDENCIAL INVÁLIDA.",
    );
  }
  return confirmation;
}
