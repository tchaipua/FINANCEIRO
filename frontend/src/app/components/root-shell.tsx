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

  return (
    <div className="finance-shell min-h-screen mx-auto w-full max-w-[1700px] px-4 py-4 lg:px-6">
      <main className="finance-shell-main min-w-0">{children}</main>
    </div>
  );
}
