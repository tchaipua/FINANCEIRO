import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getVisibleBranchCodes } from "../common/branch.constants";
import { getFinanceContext } from "../common/finance-context";

const MODEL_FIELDS = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Set(model.fields.map((field) => field.name)),
  ]),
);

const READ_ACTIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const MUTATION_WITH_WHERE_ACTIONS = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);
const CHILD_SCOPE_MODELS = new Set([
  "PayableInvoiceImportItem",
  "PayableInvoiceImportInstallment",
]);
const ADMIN_SHARED_BRANCH_WRITE_MODELS = new Set([
  "NfseServiceItem",
  "NfseServiceDescription",
]);

type AuthenticatedScope = {
  companyId: string;
  branchId: string;
  branchCode: number;
  sourceSystem: string;
  sourceTenantId: string;
  scopes: readonly string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getModelFields(model: string) {
  return MODEL_FIELDS.get(model) || new Set<string>();
}

function buildScopeFilter(
  model: string,
  scope: AuthenticatedScope,
  includeSharedBranch: boolean,
) {
  if (model === "Company") {
    return {
      id: scope.companyId,
      sourceSystem: scope.sourceSystem,
      sourceTenantId: scope.sourceTenantId,
    };
  }

  if (CHILD_SCOPE_MODELS.has(model)) {
    return {
      invoiceImport: {
        is: {
          companyId: scope.companyId,
          branchCode: includeSharedBranch
            ? { in: getVisibleBranchCodes(scope.branchCode) }
            : scope.branchCode,
        },
      },
    };
  }

  const fields = getModelFields(model);
  const filter: Record<string, unknown> = {};
  if (fields.has("companyId")) {
    filter.companyId = scope.companyId;
  }
  if (fields.has("branchId")) {
    filter.branchId = scope.branchId;
  } else if (fields.has("branchCode")) {
    filter.branchCode =
      model === "CompanyBranch"
        ? scope.branchCode
        : includeSharedBranch
          ? { in: getVisibleBranchCodes(scope.branchCode) }
          : scope.branchCode;
  }
  return filter;
}

function assertEquivalent(
  value: unknown,
  expected: string | number,
  label: string,
) {
  if (value === undefined) {
    return;
  }
  if (String(value) !== String(expected)) {
    throw new ForbiddenException(
      `Tentativa de alterar ${label} fora do escopo autenticado.`,
    );
  }
}

function enforceMutationDataScope(
  model: string,
  data: Record<string, unknown>,
  scope: AuthenticatedScope,
  injectMissing: boolean,
) {
  if (model === "Company") {
    if (injectMissing) {
      throw new ForbiddenException(
        "O mapeamento de empresa deve ser provisionado fora da API operacional.",
      );
    }
    assertEquivalent(data.id, scope.companyId, "a empresa");
    assertEquivalent(data.sourceSystem, scope.sourceSystem, "o sistema de origem");
    assertEquivalent(
      data.sourceTenantId,
      scope.sourceTenantId,
      "o tenant de origem",
    );
    return;
  }

  if (model === "CompanyBranch" && injectMissing) {
    throw new ForbiddenException(
      "O mapeamento de filial deve ser provisionado fora da API operacional.",
    );
  }

  const fields = getModelFields(model);
  if (fields.has("companyId")) {
    assertEquivalent(data.companyId, scope.companyId, "a empresa");
    if (injectMissing && data.companyId === undefined) {
      data.companyId = scope.companyId;
    }
  }
  if (fields.has("branchId")) {
    assertEquivalent(data.branchId, scope.branchId, "a filial");
    if (injectMissing && data.branchId === undefined) {
      data.branchId = scope.branchId;
    }
  }
  if (fields.has("branchCode")) {
    const canWriteSharedBranch =
      ADMIN_SHARED_BRANCH_WRITE_MODELS.has(model) &&
      scope.scopes.includes("FINANCE_ADMIN");
    if (!(canWriteSharedBranch && Number(data.branchCode) === 0)) {
      assertEquivalent(data.branchCode, scope.branchCode, "a filial");
    }
    if (injectMissing && data.branchCode === undefined) {
      data.branchCode = scope.branchCode;
    }
  }
}

function scopeWhereForUniqueAction(
  originalWhere: Record<string, unknown>,
  scopeFilter: Record<string, unknown>,
) {
  for (const [key, scopedValue] of Object.entries(scopeFilter)) {
    if (
      originalWhere[key] !== undefined &&
      JSON.stringify(originalWhere[key]) !== JSON.stringify(scopedValue)
    ) {
      throw new ForbiddenException(
        "Identificador divergente do escopo autenticado.",
      );
    }
  }
  return {
    ...scopeFilter,
    ...originalWhere,
  };
}

export function branchMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    const context = getFinanceContext();
    const model = params.model;
    if (
      !model ||
      !context?.authenticated ||
      !context.companyId ||
      !context.branchId ||
      !context.sourceSystem ||
      !context.sourceTenantId
    ) {
      return next(params);
    }

    const scope: AuthenticatedScope = {
      companyId: context.companyId,
      branchId: context.branchId,
      branchCode: context.branchCode,
      sourceSystem: context.sourceSystem,
      sourceTenantId: context.sourceTenantId,
      scopes: context.scopes || [],
    };
    const isReadAction = READ_ACTIONS.has(params.action);
    const isControlPlaneMappingModel =
      model === "Company" || model === "CompanyBranch";
    const canUpdateControlPlaneMapping =
      scope.scopes.includes("FINANCE_ADMIN") ||
      scope.scopes.includes("SOURCE_SETTINGS_SYNC");
    if (
      isControlPlaneMappingModel &&
      !isReadAction &&
      !canUpdateControlPlaneMapping
    ) {
      throw new ForbiddenException(
        "A alteração da empresa ou filial exige escopo administrativo.",
      );
    }
    const mayWriteSharedBranch =
      ADMIN_SHARED_BRANCH_WRITE_MODELS.has(model) &&
      scope.scopes.includes("FINANCE_ADMIN");
    const scopeFilter = buildScopeFilter(
      model,
      scope,
      isReadAction || mayWriteSharedBranch,
    );
    if (Object.keys(scopeFilter).length === 0) {
      throw new ForbiddenException(
        `O modelo ${model} não possui uma regra explícita de isolamento.`,
      );
    }

    if (isReadAction) {
      if (!params.args) params.args = {};
      const originalWhere = isPlainObject(params.args.where)
        ? params.args.where
        : {};
      params.args.where =
        params.action === "findUnique" ||
        params.action === "findUniqueOrThrow"
          ? scopeWhereForUniqueAction(originalWhere, scopeFilter)
          : { AND: [originalWhere, scopeFilter] };
      return next(params);
    }

    if (MUTATION_WITH_WHERE_ACTIONS.has(params.action)) {
      if (!params.args) params.args = {};
      const originalWhere = isPlainObject(params.args.where)
        ? params.args.where
        : {};
      params.args.where =
        params.action === "update" || params.action === "delete"
          ? scopeWhereForUniqueAction(originalWhere, scopeFilter)
          : { AND: [originalWhere, scopeFilter] };
      if (params.action === "update" && isPlainObject(params.args.data)) {
        enforceMutationDataScope(model, params.args.data, scope, false);
      }
      return next(params);
    }

    if (params.action === "create") {
      if (!params.args) params.args = {};
      if (!isPlainObject(params.args.data)) params.args.data = {};
      enforceMutationDataScope(model, params.args.data, scope, true);
      return next(params);
    }

    if (params.action === "createMany" && params.args?.data) {
      const items = Array.isArray(params.args.data)
        ? params.args.data
        : [params.args.data];
      for (const item of items) {
        if (!isPlainObject(item)) {
          throw new ForbiddenException("Dados de criação inválidos.");
        }
        enforceMutationDataScope(model, item, scope, true);
      }
      return next(params);
    }

    if (params.action === "upsert") {
      if (!params.args) params.args = {};
      const originalWhere = isPlainObject(params.args.where)
        ? params.args.where
        : {};
      params.args.where = scopeWhereForUniqueAction(
        originalWhere,
        scopeFilter,
      );
      if (!isPlainObject(params.args.create)) params.args.create = {};
      if (!isPlainObject(params.args.update)) params.args.update = {};
      enforceMutationDataScope(model, params.args.create, scope, true);
      enforceMutationDataScope(model, params.args.update, scope, false);
      return next(params);
    }

    throw new ForbiddenException(
      `A operação Prisma ${params.action} não possui regra de isolamento.`,
    );
  };
}
