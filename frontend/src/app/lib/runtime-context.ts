'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export type FinanceRuntimeContext = {
  embedded: boolean;
  sourceSystem: string | null;
  sourceTenantId: string | null;
  cashierUserId: string | null;
  cashierDisplayName: string | null;
};

function normalizeQueryValue(value: string | null, uppercase = true) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  return uppercase ? trimmed.toUpperCase() : trimmed;
}

function readRuntimeContext(): FinanceRuntimeContext {
  if (typeof window === 'undefined') {
    return {
      embedded: false,
      sourceSystem: null,
      sourceTenantId: null,
      cashierUserId: null,
      cashierDisplayName: null,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);

  return {
    embedded: searchParams.get('embedded') === '1',
    sourceSystem: normalizeQueryValue(searchParams.get('sourceSystem')),
    sourceTenantId: normalizeQueryValue(searchParams.get('sourceTenantId')),
    cashierUserId: normalizeQueryValue(searchParams.get('cashierUserId')),
    cashierDisplayName: normalizeQueryValue(
      searchParams.get('cashierDisplayName'),
    ),
  };
}

export function useFinanceRuntimeContext(): FinanceRuntimeContext {
  const pathname = usePathname();
  const [runtimeContext, setRuntimeContext] =
    useState<FinanceRuntimeContext>(readRuntimeContext);

  useEffect(() => {
    setRuntimeContext(readRuntimeContext());
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncRuntimeContext = () => setRuntimeContext(readRuntimeContext());

    window.addEventListener('popstate', syncRuntimeContext);
    window.addEventListener('hashchange', syncRuntimeContext);

    return () => {
      window.removeEventListener('popstate', syncRuntimeContext);
      window.removeEventListener('hashchange', syncRuntimeContext);
    };
  }, []);

  return runtimeContext;
}

export function buildFinanceQueryString(
  runtimeContext: FinanceRuntimeContext,
  extraParams?: Record<string, string | number | null | undefined>,
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

  if (runtimeContext.cashierUserId) {
    params.set('cashierUserId', runtimeContext.cashierUserId);
  }

  if (runtimeContext.cashierDisplayName) {
    params.set('cashierDisplayName', runtimeContext.cashierDisplayName);
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
