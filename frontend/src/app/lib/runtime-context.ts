'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export type FinanceRuntimeContext = {
  embedded: boolean;
  sourceSystem: string | null;
  sourceTenantId: string | null;
  companyName: string | null;
  logoUrl: string | null;
  cashierUserId: string | null;
  cashierDisplayName: string | null;
  userRole: string | null;
  permissions: string[];
};

function normalizeQueryValue(value: string | null, uppercase = true) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  return uppercase ? trimmed.toUpperCase() : trimmed;
}

const EMPTY_RUNTIME_CONTEXT: FinanceRuntimeContext = {
  embedded: false,
  sourceSystem: null,
  sourceTenantId: null,
  companyName: null,
  logoUrl: null,
  cashierUserId: null,
  cashierDisplayName: null,
  userRole: null,
  permissions: [],
};

function normalizePermissions(value: string | null) {
  return String(value || '')
    .split(',')
    .map((permission) => normalizeQueryValue(permission))
    .filter((permission): permission is string => Boolean(permission));
}

function readRuntimeContextFromSearch(search: string): FinanceRuntimeContext {
  const searchParams = new URLSearchParams(search);

  return {
    embedded: searchParams.get('embedded') === '1',
    sourceSystem: normalizeQueryValue(searchParams.get('sourceSystem')),
    sourceTenantId: normalizeQueryValue(searchParams.get('sourceTenantId')),
    companyName: normalizeQueryValue(searchParams.get('companyName')),
    logoUrl: normalizeQueryValue(searchParams.get('logoUrl'), false),
    cashierUserId: normalizeQueryValue(searchParams.get('cashierUserId')),
    cashierDisplayName: normalizeQueryValue(
      searchParams.get('cashierDisplayName'),
    ),
    userRole: normalizeQueryValue(searchParams.get('userRole')),
    permissions: normalizePermissions(searchParams.get('permissions')),
  };
}

export function useFinanceRuntimeContext(): FinanceRuntimeContext {
  const pathname = usePathname();
  const [runtimeContext, setRuntimeContext] =
    useState<FinanceRuntimeContext>(EMPTY_RUNTIME_CONTEXT);

  useEffect(() => {
    setRuntimeContext(readRuntimeContextFromSearch(window.location.search));
  }, [pathname]);

  useEffect(() => {
    const syncRuntimeContext = () =>
      setRuntimeContext(readRuntimeContextFromSearch(window.location.search));

    window.addEventListener('popstate', syncRuntimeContext);
    window.addEventListener('hashchange', syncRuntimeContext);

    return () => {
      window.removeEventListener('popstate', syncRuntimeContext);
      window.removeEventListener('hashchange', syncRuntimeContext);
    };
  }, []);

  return runtimeContext;
}

export function buildFinanceNavigationQueryString(
  runtimeContext: FinanceRuntimeContext,
) {
  const params = new URLSearchParams();

  if (runtimeContext.embedded) {
    params.set('embedded', '1');
  }

  if (runtimeContext.sourceSystem) {
    params.set('sourceSystem', runtimeContext.sourceSystem);
  }

  if (runtimeContext.sourceTenantId) {
    params.set('sourceTenantId', runtimeContext.sourceTenantId);
  }

  if (runtimeContext.companyName) {
    params.set('companyName', runtimeContext.companyName);
  }

  if (runtimeContext.logoUrl) {
    params.set('logoUrl', runtimeContext.logoUrl);
  }

  if (runtimeContext.cashierUserId) {
    params.set('cashierUserId', runtimeContext.cashierUserId);
  }

  if (runtimeContext.cashierDisplayName) {
    params.set('cashierDisplayName', runtimeContext.cashierDisplayName);
  }

  if (runtimeContext.userRole) {
    params.set('userRole', runtimeContext.userRole);
  }

  if (runtimeContext.permissions.length) {
    params.set('permissions', runtimeContext.permissions.join(','));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function buildFinanceApiQueryString(
  runtimeContext: FinanceRuntimeContext,
  extraParams?: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams();

  if (runtimeContext.sourceSystem) {
    params.set('sourceSystem', runtimeContext.sourceSystem);
  }

  if (runtimeContext.sourceTenantId) {
    params.set('sourceTenantId', runtimeContext.sourceTenantId);
  }

  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const normalizedValue = String(value).trim();
    if (!normalizedValue) return;
    params.set(key, normalizedValue);
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}
