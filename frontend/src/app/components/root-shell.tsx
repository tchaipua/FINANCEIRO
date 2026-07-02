'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useFinanceRuntimeContext } from '@/app/lib/runtime-context';

function hasIntegratedNavigationContext() {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  return [
    'embedded',
    'sourceSystem',
    'sourceTenantId',
    'sourceBranchCode',
    'cashierUserId',
    'cashierDisplayName',
    'companyName',
  ].some((key) => params.has(key));
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
      if (referrerUrl.origin !== window.location.origin) {
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
  if (pathname.startsWith('/bancos')) return '/principal/financeiro/bancos';
  if (pathname.startsWith('/empresas')) return '/principal/financeiro/empresa';
  if (pathname.startsWith('/resumo')) return '/principal/financeiro/resumo';
  if (pathname.startsWith('/contas-a-pagar')) return '/principal/financeiro/contas-a-pagar';
  if (pathname.startsWith('/estoque') || pathname.startsWith('/produtos')) {
    return '/principal/financeiro/estoque';
  }
  if (pathname.startsWith('/recebiveis/lotes')) return '/principal/financeiro/lotes';
  if (pathname.startsWith('/recebiveis/retornos')) return '/principal/financeiro/retornos';
  if (pathname.startsWith('/recebiveis/parcelas')) return '/principal/financeiro/parcelas';
  if (pathname.startsWith('/caixa')) return '/principal/financeiro/caixa';
  if (pathname.startsWith('/vendas/periodo')) return '/principal/financeiro/vendas-periodo';
  if (pathname.startsWith('/vendas')) return '/principal/financeiro/vendas';

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

    const schoolPath = resolveSchoolFinancePath(pathname || window.location.pathname);
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

    const originalFetch = window.fetch.bind(window);
    const branchHeaderValue = String(runtimeContext.sourceBranchCode || 1);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (!requestUrl.includes('/api/v1/')) {
        return originalFetch(input, init);
      }

      const headers = new Headers(
        input instanceof Request ? input.headers : init?.headers,
      );
      headers.set('x-source-branch-code', branchHeaderValue);

      if (input instanceof Request) {
        return originalFetch(
          new Request(input, {
            headers,
          }),
          init,
        );
      }

      return originalFetch(input, {
        ...init,
        headers,
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [runtimeContext.sourceBranchCode]);

  return (
    <div className="finance-shell min-h-screen mx-auto w-full max-w-[1700px] px-4 py-4 lg:px-6">
      <main className="finance-shell-main min-w-0">{children}</main>
    </div>
  );
}
