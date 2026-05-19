export const DEFAULT_BRANCH_CODE = 1;
export const SHARED_BRANCH_CODE = 0;

export function normalizeBranchCode(
  value: unknown,
  fallback = DEFAULT_BRANCH_CODE,
) {
  const normalized =
    typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);

  if (!Number.isInteger(normalized) || normalized < 0) {
    return fallback;
  }

  return normalized;
}

export function getVisibleBranchCodes(branchCode: unknown) {
  const normalizedBranchCode = normalizeBranchCode(branchCode);

  return Array.from(
    new Set([SHARED_BRANCH_CODE, normalizedBranchCode || DEFAULT_BRANCH_CODE]),
  );
}
