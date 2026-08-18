import { ForbiddenException } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";

export type AuthenticatedFinanceRequestContext = {
  sourceSystem: string;
  sourceTenantId: string;
  sourceBranchCode: number;
  sourceUserId: string;
  centralTenantId?: string;
  companyId: string;
  branchId: string;
  scopes: readonly string[];
  isMasterIdentity?: boolean;
  canOperateCashier?: boolean;
};

export interface IFinanceContext
  extends Partial<AuthenticatedFinanceRequestContext> {
  authenticated: boolean;
  branchCode: number;
  companyWideBranchDirectoryRead?: boolean;
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

export function assertCashierOperationAllowed(message = "O usuário Master não possui permissão para operar o caixa.") {
  const context = getFinanceContext();
  if (context?.isMasterIdentity && context.canOperateCashier !== true) {
    throw new ForbiddenException(message);
  }
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

export function runWithCompanyWideBranchDirectoryRead<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const currentContext = getFinanceContext();
  if (!currentContext?.authenticated || !currentContext.companyId) {
    throw new ForbiddenException(
      "A consulta das filiais exige uma empresa autenticada.",
    );
  }

  return financeContext.run(
    {
      ...currentContext,
      companyWideBranchDirectoryRead: true,
    },
    operation,
  );
}

export function runWithAdministrativeBranchScope<T>(
  branchId: string,
  branchCode: number,
  operation: () => Promise<T>,
): Promise<T> {
  const currentContext = getFinanceContext();
  if (
    !currentContext?.authenticated ||
    !currentContext.companyId ||
    !hasAuthenticatedFinanceScope("FINANCE_ADMIN")
  ) {
    throw new ForbiddenException(
      "A manutenção de outra filial exige o escopo FINANCE_ADMIN.",
    );
  }
  return financeContext.run(
    {
      ...currentContext,
      branchId,
      branchCode,
      sourceBranchCode: branchCode,
    },
    operation,
  );
}
