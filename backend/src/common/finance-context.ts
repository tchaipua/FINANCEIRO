import { AsyncLocalStorage } from "async_hooks";

export interface IFinanceContext {
  branchCode: number;
}

export const financeContext = new AsyncLocalStorage<IFinanceContext>();

export function getFinanceContext() {
  return financeContext.getStore();
}

export function runWithFinanceBranchScope<T>(
  branchCode: number,
  operation: () => Promise<T>,
): Promise<T> {
  const currentContext = getFinanceContext();

  return financeContext.run(
    {
      ...(currentContext || { branchCode }),
      branchCode,
    },
    () => operation(),
  );
}
