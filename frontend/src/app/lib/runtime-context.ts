'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  isFinanceColorThemeId,
  normalizeFinanceColorIntensity,
  type FinanceColorIntensity,
  type FinanceColorThemeId,
} from '@/app/lib/color-theme';

export type BranchStockParameterMode = 'NO' | 'YES' | 'BY_PRODUCT';

export type FinanceRuntimeContext = {
  embedded: boolean;
  sourceSystem: string | null;
  sourceTenantId: string | null;
  sourceBranchCode: number;
  stockControlMode: BranchStockParameterMode;
  stockIntegerQuantityMode: BranchStockParameterMode;
  stockLotControlMode: BranchStockParameterMode;
  stockExpirationControlMode: BranchStockParameterMode;
  stockGridControlMode: BranchStockParameterMode;
  stockNegativeControlMode: BranchStockParameterMode;
  companyName: string | null;
  logoUrl: string | null;
  cashierUserId: string | null;
  cashierDisplayName: string | null;
  userRole: string | null;
  permissions: string[];
  colorTheme: FinanceColorThemeId | null;
  colorIntensity: FinanceColorIntensity;
};

export function normalizeFinanceDisplayText(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (!/[\u00c2\u00c3\u0080-\u009f]/.test(trimmed)) {
    return trimmed;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(Array.from(trimmed).map((character) => character.charCodeAt(0) & 255)),
    );
  } catch {
    return trimmed;
  }
}

function normalizeQueryValue(value: string | null, uppercase = true) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const normalized = normalizeFinanceDisplayText(trimmed) || trimmed;

  return uppercase ? normalized.toUpperCase() : normalized;
}

const EMPTY_RUNTIME_CONTEXT: FinanceRuntimeContext = {
  embedded: false,
  sourceSystem: null,
  sourceTenantId: null,
  sourceBranchCode: 1,
  stockControlMode: 'BY_PRODUCT',
  stockIntegerQuantityMode: 'BY_PRODUCT',
  stockLotControlMode: 'BY_PRODUCT',
  stockExpirationControlMode: 'BY_PRODUCT',
  stockGridControlMode: 'BY_PRODUCT',
  stockNegativeControlMode: 'BY_PRODUCT',
  companyName: null,
  logoUrl: null,
  cashierUserId: null,
  cashierDisplayName: null,
  userRole: null,
  permissions: [],
  colorTheme: null,
  colorIntensity: 3,
};

function normalizePermissions(value: string | null) {
  return String(value || '')
    .split(',')
    .map((permission) => normalizeQueryValue(permission))
    .filter((permission): permission is string => Boolean(permission));
}

function normalizeBranchCode(value: string | null) {
  const normalized = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 1;
}

function normalizeStockParameterMode(value: string | null): BranchStockParameterMode {
  const normalized = normalizeQueryValue(value);
  return normalized === 'NO' || normalized === 'YES' || normalized === 'BY_PRODUCT'
    ? normalized
    : 'BY_PRODUCT';
}

function readRuntimeContextFromSearch(search: string): FinanceRuntimeContext {
  const searchParams = new URLSearchParams(search);

  return {
    embedded: searchParams.get('embedded') === '1',
    sourceSystem: normalizeQueryValue(searchParams.get('sourceSystem')),
    sourceTenantId: normalizeQueryValue(searchParams.get('sourceTenantId')),
    sourceBranchCode: normalizeBranchCode(searchParams.get('sourceBranchCode')),
    stockControlMode: normalizeStockParameterMode(searchParams.get('stockControlMode')),
    stockIntegerQuantityMode: normalizeStockParameterMode(
      searchParams.get('stockIntegerQuantityMode'),
    ),
    stockLotControlMode: normalizeStockParameterMode(searchParams.get('stockLotControlMode')),
    stockExpirationControlMode: normalizeStockParameterMode(
      searchParams.get('stockExpirationControlMode'),
    ),
    stockGridControlMode: normalizeStockParameterMode(searchParams.get('stockGridControlMode')),
    stockNegativeControlMode: normalizeStockParameterMode(
      searchParams.get('stockNegativeControlMode'),
    ),
    companyName: normalizeQueryValue(searchParams.get('companyName')),
    logoUrl: normalizeQueryValue(searchParams.get('logoUrl'), false),
    cashierUserId: normalizeQueryValue(searchParams.get('cashierUserId')),
    cashierDisplayName: normalizeQueryValue(
      searchParams.get('cashierDisplayName'),
    ),
    userRole: normalizeQueryValue(searchParams.get('userRole')),
    permissions: normalizePermissions(searchParams.get('permissions')),
    colorTheme: isFinanceColorThemeId(searchParams.get('colorTheme'))
      ? searchParams.get('colorTheme') as FinanceColorThemeId
      : null,
    colorIntensity: normalizeFinanceColorIntensity(searchParams.get('colorIntensity')),
  };
}

function readCurrentRuntimeContext(): FinanceRuntimeContext {
  if (typeof window === 'undefined') {
    return EMPTY_RUNTIME_CONTEXT;
  }

  return readRuntimeContextFromSearch(window.location.search);
}

export function useFinanceRuntimeContext(): FinanceRuntimeContext {
  const pathname = usePathname();
  const [runtimeContext, setRuntimeContext] =
    useState<FinanceRuntimeContext>(EMPTY_RUNTIME_CONTEXT);

  useEffect(() => {
    setRuntimeContext(readCurrentRuntimeContext());
  }, [pathname]);

  useEffect(() => {
    const syncRuntimeContext = () =>
      setRuntimeContext(readCurrentRuntimeContext());

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

  if (Number.isInteger(runtimeContext.sourceBranchCode) && runtimeContext.sourceBranchCode >= 0) {
    params.set('sourceBranchCode', String(runtimeContext.sourceBranchCode));
  }

  params.set('stockControlMode', runtimeContext.stockControlMode);
  params.set('stockIntegerQuantityMode', runtimeContext.stockIntegerQuantityMode);
  params.set('stockLotControlMode', runtimeContext.stockLotControlMode);
  params.set('stockExpirationControlMode', runtimeContext.stockExpirationControlMode);
  params.set('stockGridControlMode', runtimeContext.stockGridControlMode);
  params.set('stockNegativeControlMode', runtimeContext.stockNegativeControlMode);

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

  if (runtimeContext.colorTheme) {
    params.set('colorTheme', runtimeContext.colorTheme);
    params.set('colorIntensity', String(runtimeContext.colorIntensity));
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
