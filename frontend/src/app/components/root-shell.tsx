'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  buildFinanceQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const NAV_ITEMS = [
  { href: '/', label: 'Resumo geral' },
  { href: '/empresas', label: 'Empresas' },
  { href: '/recebiveis/lotes', label: 'Lotes' },
  { href: '/recebiveis/parcelas', label: 'Parcelas' },
  { href: '/caixa', label: 'Caixa' },
];

export default function RootShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
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

  const preservedQueryString = useMemo(
    () => buildFinanceQueryString(runtimeContext),
    [runtimeContext],
  );

  if (runtimeContext.embedded) {
    return (
      <div className="min-h-screen">
        <main className="min-w-0">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] gap-6 px-4 py-4 lg:px-6">
        <aside className="hidden w-72 shrink-0 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)] lg:block">
          <div className="bg-gradient-to-br from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-8 text-white">
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-200">
              Core Financeiro
            </div>
            <h1 className="mt-3 text-3xl font-black leading-tight">
              Operação Multiempresa
            </h1>
            <p className="mt-3 text-sm font-medium text-blue-100/90">
              Caixa, títulos, parcelas e integração desacoplada dos sistemas de
              origem.
            </p>
          </div>
          <nav className="space-y-2 px-4 py-4">
            {NAV_ITEMS.map((item) => {
              const href = `${item.href}${preservedQueryString}`;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={href}
                  className={`flex items-center rounded-2xl border px-4 py-3 text-sm font-black uppercase tracking-[0.14em] transition ${
                    isActive
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-transparent text-slate-600 hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
