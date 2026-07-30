'use client';

import { isTrustedMessageEvent, postMessageToTrustedParent } from '@/app/lib/trusted-messaging';
import { getTrustedMessageOrigins } from '@/app/lib/trusted-messaging';
import { stripFinanceBasePath } from '@/app/lib/public-path';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useFinanceRuntimeContext } from '@/app/lib/runtime-context';
import {
  applyFinanceColorPreference,
  isFinanceColorThemeId,
  normalizeFinanceColorIntensity,
  readFinanceColorPreference,
  saveFinanceColorPreference,
  type FinanceColorPreference,
} from '@/app/lib/color-theme';

function hasIntegratedNavigationContext() {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  return params.has('embedded');
}

function isTopLevelWindow() {
  if (typeof window === 'undefined') return false;

  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

function resolveSchoolShellOrigin() {
  if (typeof window === 'undefined') return null;

  if (typeof document !== 'undefined' && document.referrer) {
    try {
      const referrerUrl = new URL(document.referrer);
      if (
        referrerUrl.origin !== window.location.origin &&
        getTrustedMessageOrigins().has(referrerUrl.origin)
      ) {
        return referrerUrl.origin;
      }
    } catch {
      // Mantem fallback local abaixo.
    }
  }

  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }

  return null;
}

function resolveSchoolFinancePath(pathname: string) {
  if (pathname.startsWith('/contas-a-receber')) {
    return '/principal/financeiro/contas-a-receber';
  }
  if (pathname.startsWith('/msinfor/controle-s3')) {
    return `/principal/financeiro${pathname}`;
  }
  if (pathname.startsWith('/analises-graficos')) {
    return `/principal/financeiro${pathname}`;
  }
  if (pathname.startsWith('/bancos-e-boletos')) return '/principal/financeiro/bancos-e-boletos';
  if (pathname.startsWith('/bancos/ddas-abertos')) {
    return '/principal/financeiro/bancos/ddas-abertos';
  }
  if (pathname.startsWith('/bancos')) return '/principal/financeiro/bancos';
  if (pathname.startsWith('/empresas')) return '/principal/financeiro/empresa';
  if (pathname.startsWith('/resumo')) return '/principal/financeiro/resumo';
  if (pathname.startsWith('/contas-a-pagar')) return '/principal/financeiro/contas-a-pagar';
  if (pathname.startsWith('/estoque') || pathname.startsWith('/produtos')) {
    return '/principal/financeiro/estoque';
  }
  if (pathname.startsWith('/recebiveis/lotes')) return '/principal/financeiro/lotes';
  if (pathname.startsWith('/recebiveis/retornos')) return '/principal/financeiro/retornos';
  if (pathname.startsWith('/recebiveis/recebimentos-por-cliente')) {
    return '/principal/financeiro/recebimentos-por-cliente';
  }
  if (pathname.startsWith('/recebiveis/parcelas')) return '/principal/financeiro/parcelas';
  if (pathname.startsWith('/caixa')) return '/principal/financeiro/caixa';
  if (pathname.startsWith('/vendas/devolucao-mercadorias')) {
    return '/principal/financeiro/devolucao-mercadorias';
  }
  if (pathname.startsWith('/vendas/periodo')) return '/principal/financeiro/vendas-periodo';
  if (pathname.startsWith('/vendas')) return '/principal/financeiro/vendas';
  if (pathname.startsWith('/emissao-nfe')) return '/principal/financeiro/emissao-nfe';
  if (pathname.startsWith('/emissao-nfs')) return '/principal/financeiro/emissao-nfs';

  return null;
}

export default function RootShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimeContext = useFinanceRuntimeContext();
  const pathname = usePathname();

  useEffect(() => {
    if (!isTopLevelWindow() || !hasIntegratedNavigationContext()) return;

    const schoolPath = resolveSchoolFinancePath(
      stripFinanceBasePath(pathname || window.location.pathname),
    );
    const schoolOrigin = resolveSchoolShellOrigin();

    if (!schoolPath || !schoolOrigin || schoolOrigin === window.location.origin) {
      return;
    }

    window.location.replace(`${schoolOrigin}${schoolPath}`);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (runtimeContext.embedded) {
      document.body.dataset.financeEmbedded = '1';
      return () => {
        delete document.body.dataset.financeEmbedded;
      };
    }

    delete document.body.dataset.financeEmbedded;
  }, [runtimeContext.embedded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyAndStore = (preference: FinanceColorPreference) => {
      applyFinanceColorPreference(preference);
      saveFinanceColorPreference(
        preference,
        runtimeContext.sourceSystem,
        runtimeContext.sourceTenantId,
        runtimeContext.cashierUserId,
      );
    };

    const initialPreference: FinanceColorPreference = runtimeContext.colorTheme
      ? {
          colorTheme: runtimeContext.colorTheme,
          colorIntensity: runtimeContext.colorIntensity,
        }
      : readFinanceColorPreference(
          runtimeContext.sourceSystem,
          runtimeContext.sourceTenantId,
          runtimeContext.cashierUserId,
        );
    applyAndStore(initialPreference);

    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedMessageEvent(event)) return;
      const data = event.data as { type?: string; colorTheme?: unknown; colorIntensity?: unknown } | null;
      if (!data || data.type !== 'MSINFOR_COLOR_THEME_CHANGED' || !isFinanceColorThemeId(data.colorTheme)) return;
      applyAndStore({
        colorTheme: data.colorTheme,
        colorIntensity: normalizeFinanceColorIntensity(data.colorIntensity),
      });
    };

    const handleLocalThemeChange = (event: Event) => {
      const detail = (event as CustomEvent).detail as { colorTheme?: unknown; colorIntensity?: unknown } | null;
      if (!detail || !isFinanceColorThemeId(detail.colorTheme)) return;
      const preference = {
        colorTheme: detail.colorTheme,
        colorIntensity: normalizeFinanceColorIntensity(detail.colorIntensity),
      };
      applyAndStore(preference);
      if (runtimeContext.embedded && window.parent !== window) {
        postMessageToTrustedParent({ type: 'MSINFOR_COLOR_THEME_CHANGED', ...preference });
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('msinfor-finance-color-theme-changed', handleLocalThemeChange);
    if (runtimeContext.embedded && window.parent !== window) {
      postMessageToTrustedParent({ type: 'MSINFOR_COLOR_THEME_REQUEST' });
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('msinfor-finance-color-theme-changed', handleLocalThemeChange);
    };
  }, [
    runtimeContext.cashierUserId,
    runtimeContext.colorIntensity,
    runtimeContext.colorTheme,
    runtimeContext.embedded,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
  ]);

  return (
    <div className="finance-shell min-h-screen mx-auto w-full max-w-[1700px] px-4 py-4 lg:px-6">
      <main className="finance-shell-main min-w-0">{children}</main>
    </div>
  );
}
