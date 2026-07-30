export const FINANCEIRO_BASE_PATH =
  process.env.NEXT_PUBLIC_FINANCEIRO_BASE_PATH || '';

export function withFinanceBasePath(path: string) {
  const value = String(path || '');
  if (
    !FINANCEIRO_BASE_PATH ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value === FINANCEIRO_BASE_PATH ||
    value.startsWith(`${FINANCEIRO_BASE_PATH}/`)
  ) {
    return value;
  }

  return `${FINANCEIRO_BASE_PATH}${value}`;
}

export function stripFinanceBasePath(path: string) {
  const value = String(path || '');
  if (!FINANCEIRO_BASE_PATH) return value;
  if (value === FINANCEIRO_BASE_PATH) return '/';
  return value.startsWith(`${FINANCEIRO_BASE_PATH}/`)
    ? value.slice(FINANCEIRO_BASE_PATH.length)
    : value;
}
