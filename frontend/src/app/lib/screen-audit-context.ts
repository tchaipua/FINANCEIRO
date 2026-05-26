'use client';

export function toSqlLiteral(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function formatAuditValue(value: unknown, emptyText = 'VAZIO') {
  const normalized = String(value ?? '').trim();
  return normalized || emptyText;
}

export function formatTenantAuditValue(tenantId: string | null | undefined, tenantName?: string | null) {
  const normalizedTenantId = String(tenantId || '').trim() || 'EMPRESA LOGADA';
  const normalizedTenantName = String(tenantName || '').trim();
  return normalizedTenantName ? `${normalizedTenantId} (${normalizedTenantName})` : normalizedTenantId;
}
