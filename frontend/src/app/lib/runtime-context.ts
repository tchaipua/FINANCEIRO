'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { financeApiFetch } from '@/app/lib/api';
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

function normalizeTextValue(value: unknown, uppercase = true) {
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

function normalizePermissions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((permission) => normalizeTextValue(permission))
    .filter((permission): permission is string => Boolean(permission));
}

function normalizeBranchCode(value: unknown) {
  const normalized = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(normalized) && normalized >= 1 ? normalized : 1;
}

function normalizeStockParameterMode(value: unknown): BranchStockParameterMode {
  const normalized = normalizeTextValue(value);
  return normalized === 'NO' || normalized === 'YES' || normalized === 'BY_PRODUCT'
    ? normalized
    : 'BY_PRODUCT';
}

function readPresentationContextFromSearch(search: string) {
  const searchParams = new URLSearchParams(search);

  return {
    embedded: searchParams.get('embedded') === '1',
    colorTheme: isFinanceColorThemeId(searchParams.get('colorTheme'))
      ? searchParams.get('colorTheme') as FinanceColorThemeId
      : null,
    colorIntensity: normalizeFinanceColorIntensity(searchParams.get('colorIntensity')),
  };
}

function normalizeServerRuntimeContext(value: unknown): FinanceRuntimeContext {
  const payload =
    value && typeof value === 'object'
      ? value as Record<string, unknown>
      : {};
  const normalizedSourceSystem = normalizeTextValue(payload.sourceSystem);
  const sourceSystem =
    normalizedSourceSystem === 'ESCOLA' ||
    normalizedSourceSystem === 'PROJETO_INICIAL'
      ? normalizedSourceSystem
      : null;
  const presentation =
    typeof window === 'undefined'
      ? {
          embedded: false,
          colorTheme: null,
          colorIntensity: 3 as FinanceColorIntensity,
        }
      : readPresentationContextFromSearch(window.location.search);

  return {
    ...EMPTY_RUNTIME_CONTEXT,
    ...presentation,
    sourceSystem,
    sourceTenantId: normalizeTextValue(payload.sourceTenantId),
    sourceBranchCode: normalizeBranchCode(payload.sourceBranchCode),
    stockControlMode: normalizeStockParameterMode(payload.stockControlMode),
    stockIntegerQuantityMode: normalizeStockParameterMode(
      payload.stockIntegerQuantityMode,
    ),
    stockLotControlMode: normalizeStockParameterMode(payload.stockLotControlMode),
    stockExpirationControlMode: normalizeStockParameterMode(
      payload.stockExpirationControlMode,
    ),
    stockGridControlMode: normalizeStockParameterMode(payload.stockGridControlMode),
    stockNegativeControlMode: normalizeStockParameterMode(
      payload.stockNegativeControlMode,
    ),
    companyName: normalizeTextValue(payload.companyName, false),
    logoUrl: normalizeTextValue(payload.logoUrl, false),
    cashierUserId: normalizeTextValue(payload.cashierUserId, false),
    cashierDisplayName: normalizeTextValue(payload.cashierDisplayName, false),
    userRole: normalizeTextValue(payload.userRole),
    permissions: normalizePermissions(payload.permissions),
  };
}

function readPresentationOnlyRuntimeContext(): FinanceRuntimeContext {
  if (typeof window === 'undefined') {
    return EMPTY_RUNTIME_CONTEXT;
  }

  return {
    ...EMPTY_RUNTIME_CONTEXT,
    ...readPresentationContextFromSearch(window.location.search),
  };
}

export function useFinanceRuntimeContext(): FinanceRuntimeContext {
  const pathname = usePathname();
  const [runtimeContext, setRuntimeContext] =
    useState<FinanceRuntimeContext>(EMPTY_RUNTIME_CONTEXT);

  useEffect(() => {
    const abortController = new AbortController();
    setRuntimeContext(readPresentationOnlyRuntimeContext());

    void financeApiFetch('/context', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Contexto financeiro não autenticado.');
        }
        return response.json();
      })
      .then((payload) => {
        if (!abortController.signal.aborted) {
          setRuntimeContext(normalizeServerRuntimeContext(payload));
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          // Falha fechada: sem contexto do BFF, nenhuma empresa ou permissão é assumida.
          setRuntimeContext(readPresentationOnlyRuntimeContext());
        }
      });

    return () => abortController.abort();
  }, [pathname]);

  return runtimeContext;
}

export function buildFinanceNavigationQueryString(
  runtimeContext: FinanceRuntimeContext,
) {
  const params = new URLSearchParams();

  if (runtimeContext.embedded) {
    params.set('embedded', '1');
  }

  if (runtimeContext.colorTheme) {
    params.set('colorTheme', runtimeContext.colorTheme);
    params.set('colorIntensity', String(runtimeContext.colorIntensity));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function buildFinanceApiQueryString(
  _runtimeContext: FinanceRuntimeContext,
  extraParams?: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams();
  const protectedContextKeys = new Set([
    'sourceSystem',
    'sourceTenantId',
    'sourceBranchCode',
    'branchCode',
    'sourceUserId',
    'requestedBy',
    'cashierUserId',
    'companyId',
    'branchId',
    'userRole',
    'permissions',
  ]);

  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (protectedContextKeys.has(key)) return;
    if (value === undefined || value === null) return;
    const normalizedValue = String(value).trim();
    if (!normalizedValue) return;
    params.set(key, normalizedValue);
  });

  const query = params.toString();
  return query ? `?${query}` : '';
}
