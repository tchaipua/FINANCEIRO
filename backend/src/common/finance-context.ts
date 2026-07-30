import { ForbiddenException } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";

export type AuthenticatedFinanceRequestContext = {
  sourceSystem: string;
  sourceTenantId: string;
  sourceBranchCode: number;
  sourceUserId: string;
  companyId: string;
  branchId: string;
  scopes: readonly string[];
};

export interface IFinanceContext
  extends Partial<AuthenticatedFinanceRequestContext> {
  authenticated: boolean;
  branchCode: number;
}

export const financeContext = new AsyncLocalStorage<IFinanceContext>();

export function getFinanceContext() {
  return financeContext.getStore();
}

export function hasAuthenticatedFinanceScope(...requiredScopes: string[]) {
  const context = getFinanceContext();
  if (!context?.authenticated) {
    return false;
  }

  const availableScopes = new Set(
    (context.scopes || []).map((scope) => String(scope).toUpperCase()),
  );
  return requiredScopes.some((scope) =>
    availableScopes.has(String(scope).toUpperCase()),
  );
}

export function runWithFinanceBranchScope<T>(
  branchCode: number,
  operation: () => Promise<T>,
): Promise<T> {
  const currentContext = getFinanceContext();
  if (
    currentContext?.authenticated &&
    currentContext.branchCode !== branchCode
  ) {
    throw new ForbiddenException(
      "Tentativa de alterar a filial autenticada durante a requisição.",
    );
  }

  return financeContext.run(
    {
      ...(currentContext || { authenticated: false, branchCode }),
      branchCode,
    },
    () => operation(),
  );
}
