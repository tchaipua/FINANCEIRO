import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildInternalSignaturePayload,
  canonicalizePathAndQuery,
  hashInternalRequestBody,
  INTERNAL_API_HEADERS,
  INTERNAL_API_SIGNATURE_VERSION,
  normalizeInternalScopes,
  normalizeInternalSystemId,
} from "./internal-api-signature";
import { InternalReplayCacheService } from "./internal-replay-cache.service";
import { PUBLIC_ENDPOINT_METADATA } from "./public-endpoint.decorator";
import {
  getInternalApiSecret,
  getInternalApiTimestampWindowMs,
} from "./security-config";
import { getFinanceContext } from "./finance-context";

const GENERIC_UNAUTHORIZED_MESSAGE =
  "REQUISIÇÃO INTERNA NÃO AUTORIZADA.";
const CONTEXT_DIVERGENCE_MESSAGE =
  "CONTEXTO AUTENTICADO DIVERGENTE.";
const DUMMY_SECRET =
  "financeiro-dummy-secret-used-only-for-timing-normalization";
const SOURCE_SETTINGS_SYNC_PATH =
  "/api/v1/companies/sync-source-integration-settings";
const OPERATIONAL_SCOPES = new Set([
  "FINANCE_ACCESS",
  "FINANCE_ADMIN",
  "MANAGE_FINANCIAL",
]);
const MUTATION_SCOPES = new Set([
  "FINANCE_ADMIN",
  "MANAGE_FINANCIAL",
]);

type AuthenticatedScope = {
  sourceSystem: "ESCOLA" | "PROJETO_INICIAL";
  sourceTenantId: string;
  sourceBranchCode: number;
  sourceUserId: string;
  companyId: string;
  branchId: string;
  scopes: readonly string[];
  timestamp: number;
  nonce: string;
};

function readSingleHeader(request: Request, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? "" : String(value || "").trim();
}

function timingSafeHexEqual(left: string, right: string) {
  if (
    !/^[a-f0-9]{64}$/.test(left) ||
    !/^[a-f0-9]{64}$/.test(right)
  ) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function normalizeRequiredIdentifier(value: unknown, maximumLength = 128) {
  const normalizedValue = String(value || "").trim();
  return normalizedValue &&
    normalizedValue.length <= maximumLength &&
    !/[\u0000-\u001f\u007f]/.test(normalizedValue)
    ? normalizedValue
    : null;
}

function assertEquivalentString(value: unknown, expected: string) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (String(value).trim() !== expected) {
    throw new ForbiddenException(CONTEXT_DIVERGENCE_MESSAGE);
  }
}

function assertEquivalentSystem(value: unknown, expected: string) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (String(value).trim().toUpperCase() !== expected) {
    throw new ForbiddenException(CONTEXT_DIVERGENCE_MESSAGE);
  }
}

function assertEquivalentNumber(value: unknown, expected: number) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (Number(value) !== expected) {
    throw new ForbiddenException(CONTEXT_DIVERGENCE_MESSAGE);
  }
}

function validateDeclaredContext(
  value: unknown,
  scope: AuthenticatedScope,
  visited = new WeakSet<object>(),
) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (visited.has(value)) {
    return;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      validateDeclaredContext(item, scope, visited);
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    switch (key) {
      case "sourceSystem":
        assertEquivalentSystem(nestedValue, scope.sourceSystem);
        break;
      case "sourceTenantId":
        assertEquivalentSystem(nestedValue, scope.sourceTenantId);
        break;
      case "sourceBranchCode":
      case "branchCode":
        assertEquivalentNumber(nestedValue, scope.sourceBranchCode);
        break;
      case "sourceUserId":
      case "requestedBy":
      case "cashierUserId":
        assertEquivalentString(nestedValue, scope.sourceUserId);
        break;
      case "companyId":
        assertEquivalentString(nestedValue, scope.companyId);
        break;
      case "branchId":
        assertEquivalentString(nestedValue, scope.branchId);
        break;
      case "userRole":
      case "permissions":
        if (nestedValue !== undefined && nestedValue !== null && nestedValue !== "") {
          throw new ForbiddenException(
            "PAPÉIS E PERMISSÕES NÃO PODEM SER DECLARADOS PELO CLIENTE.",
          );
        }
        break;
      default:
        validateDeclaredContext(nestedValue, scope, visited);
    }
  }
}

function defineImmutableRequestContext(
  request: Request,
  scope: AuthenticatedScope,
) {
  const immutableValues = {
    sourceSystem: scope.sourceSystem,
    sourceTenantId: scope.sourceTenantId,
    sourceBranchCode: scope.sourceBranchCode,
    sourceUserId: scope.sourceUserId,
    companyId: scope.companyId,
    branchId: scope.branchId,
    financeAuth: Object.freeze({ ...scope, scopes: Object.freeze([...scope.scopes]) }),
  };

  for (const [property, value] of Object.entries(immutableValues)) {
    Object.defineProperty(request, property, {
      configurable: false,
      enumerable: false,
      writable: false,
      value,
    });
  }
}

@Injectable()
export class InternalApiAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly replayCache: InternalReplayCacheService,
  ) {}

  async canActivate(executionContext: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ENDPOINT_METADATA,
      [executionContext.getHandler(), executionContext.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = executionContext.switchToHttp().getRequest<Request>();
    const version = readSingleHeader(request, INTERNAL_API_HEADERS.version);
    const systemId = normalizeInternalSystemId(
      readSingleHeader(request, INTERNAL_API_HEADERS.systemId),
    );
    const tenantId = normalizeRequiredIdentifier(
      readSingleHeader(request, INTERNAL_API_HEADERS.tenantId),
    )?.toUpperCase();
    const branchCodeText = readSingleHeader(
      request,
      INTERNAL_API_HEADERS.branchCode,
    );
    const branchCode = Number(branchCodeText);
    const userId = normalizeRequiredIdentifier(
      readSingleHeader(request, INTERNAL_API_HEADERS.userId),
    );
    const scopes = normalizeInternalScopes(
      readSingleHeader(request, INTERNAL_API_HEADERS.scopes),
    );
    const timestampText = readSingleHeader(
      request,
      INTERNAL_API_HEADERS.timestamp,
    );
    const timestamp = Number(timestampText);
    const nonce = readSingleHeader(request, INTERNAL_API_HEADERS.nonce);
    const declaredBodyHash = readSingleHeader(
      request,
      INTERNAL_API_HEADERS.contentSha256,
    ).toLowerCase();
    const providedSignature = readSingleHeader(
      request,
      INTERNAL_API_HEADERS.signature,
    ).toLowerCase();

    if (
      version !== INTERNAL_API_SIGNATURE_VERSION ||
      !systemId ||
      !tenantId ||
      !Number.isSafeInteger(branchCode) ||
      branchCode < 1 ||
      !userId ||
      !Number.isSafeInteger(timestamp) ||
      !/^[A-Za-z0-9_-]{22,128}$/.test(nonce)
    ) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED_MESSAGE);
    }

    const now = Date.now();
    const timestampWindow = getInternalApiTimestampWindowMs();
    if (Math.abs(now - timestamp) > timestampWindow) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED_MESSAGE);
    }

    const hasDeclaredBody =
      Number(request.headers["content-length"] || 0) > 0 ||
      Boolean(request.headers["transfer-encoding"]);
    if (hasDeclaredBody && !Buffer.isBuffer(request.rawBody)) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED_MESSAGE);
    }
    const rawBody = request.rawBody || Buffer.alloc(0);
    const actualBodyHash = hashInternalRequestBody(rawBody);
    if (!timingSafeHexEqual(actualBodyHash, declaredBodyHash)) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED_MESSAGE);
    }

    const canonicalPayload = buildInternalSignaturePayload({
      version,
      systemId,
      method: request.method,
      canonicalTarget: canonicalizePathAndQuery(request.originalUrl),
      timestamp: timestampText,
      nonce,
      bodySha256: declaredBodyHash,
      tenantId,
      branchCode: String(branchCode),
      userId,
      scopes,
    });
    const callerSecret = getInternalApiSecret(systemId);
    const expectedSignature = createHmac(
      "sha256",
      callerSecret || DUMMY_SECRET,
    )
      .update(canonicalPayload)
      .digest("hex");
    if (
      !callerSecret ||
      !timingSafeHexEqual(expectedSignature, providedSignature)
    ) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED_MESSAGE);
    }

    const requestPath = new URL(
      request.originalUrl,
      "http://internal.invalid",
    ).pathname;
    const isSourceSettingsSync = requestPath === SOURCE_SETTINGS_SYNC_PATH;
    const isReadMethod = request.method === "GET" || request.method === "HEAD";
    const hasRequiredScope = isSourceSettingsSync
      ? scopes.includes("SOURCE_SETTINGS_SYNC")
      : scopes.some((scope) =>
          (isReadMethod ? OPERATIONAL_SCOPES : MUTATION_SCOPES).has(scope),
        );
    if (!hasRequiredScope) {
      throw new ForbiddenException("ESCOPO FINANCEIRO NÃO AUTORIZADO.");
    }

    const replayResult = this.replayCache.consume(
      `${systemId}:${nonce}`,
      now,
      now + timestampWindow,
    );
    if (replayResult === "REPLAY") {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED_MESSAGE);
    }
    if (replayResult === "FULL") {
      throw new ServiceUnavailableException(
        "SERVIÇO DE PROTEÇÃO CONTRA REPLAY INDISPONÍVEL.",
      );
    }

    const company = await this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: systemId,
          sourceTenantId: tenantId,
        },
      },
    });
    if (
      !company ||
      company.status !== "ACTIVE" ||
      company.canceledAt
    ) {
      throw new ForbiddenException("ESCOPO FINANCEIRO NÃO AUTORIZADO.");
    }

    const branch = await this.prisma.companyBranch.findUnique({
      where: {
        companyId_branchCode: {
          companyId: company.id,
          branchCode,
        },
      },
    });
    if (!branch || !branch.isActive || branch.canceledAt) {
      throw new ForbiddenException("ESCOPO FINANCEIRO NÃO AUTORIZADO.");
    }

    const scope: AuthenticatedScope = Object.freeze({
      sourceSystem: systemId,
      sourceTenantId: tenantId,
      sourceBranchCode: branchCode,
      sourceUserId: userId,
      companyId: company.id,
      branchId: branch.id,
      scopes: Object.freeze(scopes),
      timestamp,
      nonce,
    });

    assertEquivalentSystem(
      request.headers["x-source-system"],
      scope.sourceSystem,
    );
    assertEquivalentSystem(
      request.headers["x-source-tenant-id"],
      scope.sourceTenantId,
    );
    assertEquivalentNumber(
      request.headers["x-source-branch-code"],
      scope.sourceBranchCode,
    );
    assertEquivalentString(
      request.headers["x-source-user-id"],
      scope.sourceUserId,
    );
    for (const forbiddenHeader of [
      "x-company-id",
      "x-branch-id",
      "x-user-role",
      "x-permissions",
      "x-api-key",
    ]) {
      if (request.headers[forbiddenHeader] !== undefined) {
        throw new ForbiddenException(CONTEXT_DIVERGENCE_MESSAGE);
      }
    }

    validateDeclaredContext(request.query, scope);
    validateDeclaredContext(request.body, scope);
    validateDeclaredContext(request.params, scope);
    if (
      request.path.startsWith("/api/v1/companies/") &&
      request.params.id &&
      request.params.id !== scope.companyId
    ) {
      throw new ForbiddenException(CONTEXT_DIVERGENCE_MESSAGE);
    }

    const financeContext = getFinanceContext();
    if (!financeContext || financeContext.authenticated) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED_MESSAGE);
    }
    Object.assign(financeContext, {
      authenticated: true,
      sourceSystem: scope.sourceSystem,
      sourceTenantId: scope.sourceTenantId,
      sourceBranchCode: scope.sourceBranchCode,
      sourceUserId: scope.sourceUserId,
      companyId: scope.companyId,
      branchId: scope.branchId,
      scopes: scope.scopes,
      branchCode: scope.sourceBranchCode,
    });
    Object.freeze(financeContext);
    defineImmutableRequestContext(request, scope);

    return true;
  }
}
