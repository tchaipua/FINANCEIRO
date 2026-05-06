'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buildFinanceNavigationQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

type MenuItem = {
  label: string;
  href: string;
  schoolPath?: string;
};

const MENU_ITEMS: MenuItem[] = [
  { label: 'Resumo geral', href: '/resumo', schoolPath: '/principal/financeiro/resumo' },
  { label: 'Empresa', href: '/empresas', schoolPath: '/principal/financeiro/empresa' },
  { label: 'Bancos', href: '/bancos', schoolPath: '/principal/financeiro/bancos' },
  { label: 'Produtos', href: '/produtos' },
  { label: 'Lotes', href: '/recebiveis/lotes', schoolPath: '/principal/financeiro/lotes' },
  { label: 'Retornos', href: '/recebiveis/retornos', schoolPath: '/principal/financeiro/retornos' },
  { label: 'Parcelas', href: '/recebiveis/parcelas', schoolPath: '/principal/parcelas' },
  { label: 'Caixa', href: '/caixa', schoolPath: '/principal/financeiro/caixa' },
];

function resolveSchoolBaseUrl() {
  if (typeof document === 'undefined' || !document.referrer) {
    return null;
  }

  try {
    const referrerUrl = new URL(document.referrer);
    return referrerUrl.origin;
  } catch {
    return null;
  }
}

type FinanceMenuCardProps = {
  item: MenuItem;
  href: string;
  target?: string;
};

function FinanceMenuCard({ item, href, target }: FinanceMenuCardProps) {
  const className =
    'rounded-3xl border border-slate-200 bg-white px-5 py-5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md sm:min-h-[92px]';

  const content = (
    <div className="text-base font-black uppercase tracking-[0.2em] text-slate-700">
      {item.label}
    </div>
  );

  if (target) {
    return (
      <a href={href} target={target} rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

export default function FinanceiroHomePage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [schoolBaseUrl, setSchoolBaseUrl] = useState<string | null>(null);

  useEffect(() => {
    setSchoolBaseUrl(resolveSchoolBaseUrl());
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className={`${cardClass} relative left-1/2 w-screen -translate-x-1/2 overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Controle Financeiro</h1>
            </div>
            <span className="inline-flex items-center self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white">
              Menu Financeiro
            </span>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-8`}>
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">
          {MENU_ITEMS.map((item) => {
            const shouldReturnToSchool =
              runtimeContext.embedded &&
              item.schoolPath &&
              schoolBaseUrl;

            const href = shouldReturnToSchool
              ? `${schoolBaseUrl}${item.schoolPath}`
              : `${item.href}${preservedQueryString}`;

            return (
              <FinanceMenuCard
                key={item.label}
                item={item}
                href={href}
                target={shouldReturnToSchool ? '_top' : undefined}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
