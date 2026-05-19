'use client';

import { useEffect } from 'react';
import { useFinanceRuntimeContext } from '@/app/lib/runtime-context';

export default function RootShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimeContext = useFinanceRuntimeContext();

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
