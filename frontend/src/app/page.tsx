'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { buildFinanceNavigationQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

type MenuItem = {
  id: string;
  label: string;
  href: string;
  hostPath: string;
  description: string;
  title?: string;
  image: string;
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'clientes',
    label: 'Clientes',
    href: '/clientes',
    hostPath: '/principal/financeiro/clientes',
    description: 'Cadastro híbrido de clientes do contas a receber.',
    image: '/principal-financeiro/historico-cliente.svg?v=1',
  },
  {
    id: 'empresa',
    label: 'Empresa',
    href: '/empresas',
    hostPath: '/principal/financeiro/empresa',
    description: 'Cadastro financeiro da empresa atual.',
    image: '/principal-financeiro/empresa.svg?v=2',
  },
  {
    id: 'bancos-e-boletos',
    label: 'Bancos e Boletos',
    href: '/bancos-e-boletos',
    hostPath: '/principal/financeiro/bancos-e-boletos',
    description: 'Acesse bancos, registro e retorno de boletos.',
    image: '/principal-financeiro/bancos.svg?v=1',
  },
  {
    id: 'resumo',
    label: 'Resumo geral',
    href: '/resumo',
    hostPath: '/principal/financeiro/resumo',
    description: 'Visao consolidada da operacao financeira.',
    image: '/principal-financeiro/resumo.svg?v=2',
  },
  {
    id: 'analises-graficos',
    label: 'Análises e gráficos',
    href: '/analises-graficos',
    hostPath: '/principal/financeiro/analises-graficos',
    description: 'Dashboards financeiros, comerciais e de estoque.',
    image: '/principal-financeiro/resumo.svg?v=2',
  },
  {
    id: 'contas-a-receber',
    label: 'Contas a Receber',
    href: '/recebiveis/parcelas',
    hostPath: '/principal/financeiro/contas-a-receber',
    description: 'Acesse as operacoes de contas a receber.',
    image: '/principal-financeiro/parcelas.svg?v=2',
  },
  {
    id: 'contas-a-pagar',
    label: 'Contas a Pagar',
    href: '/contas-a-pagar',
    hostPath: '/principal/financeiro/contas-a-pagar',
    description: 'Acesse as operacoes de contas a pagar.',
    image: '/principal-financeiro/contas-a-pagar.svg?v=1',
  },
  {
    id: 'estoque',
    label: 'Estoque',
    href: '/estoque',
    hostPath: '/principal/financeiro/estoque',
    description: 'Acesse o controle de produtos e estoque.',
    image: '/principal-financeiro/estoque.svg?v=1',
  },
  {
    id: 'caixa',
    label: 'Controle Caixa',
    href: '/caixa',
    hostPath: '/principal/financeiro/caixa',
    description: 'Abertura e fechamento do caixa do usuario logado.',
    image: '/principal-financeiro/caixa.svg?v=2',
  },
  {
    id: 'vendas',
    label: 'Vendas',
    href: '/vendas',
    hostPath: '/principal/financeiro/vendas',
    description: 'Venda produtos com caixa, estoque e contas a receber.',
    image: '/principal-financeiro/vendas.svg?v=1',
  },
  {
    id: 'vendas-2',
    label: 'Vendas 2',
    href: '/vendas-2',
    hostPath: '/principal/financeiro/vendas-2',
    description: 'Novo fluxo de vendas com consulta visual e foto dos produtos.',
    image: '/principal-financeiro/vendas.svg?v=1',
  },
];

function resolveHostBaseUrl() {
  if (typeof document === 'undefined' || !document.referrer) {
    return null;
  }

  try {
    const referrerUrl = new URL(document.referrer);
    if (typeof window !== 'undefined' && referrerUrl.origin === window.location.origin) {
      return null;
    }
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
  const content = (
    <>
      <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3">
        <img
          src={item.image}
          alt={item.label}
          className="max-h-full max-w-full object-contain opacity-95 transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
        <div className="text-sm font-black text-slate-800">{item.label}</div>
      </div>
    </>
  );

  const className =
    'group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50';

  if (target) {
    return (
      <a href={href} target={target} rel="noreferrer" title={item.title || item.description} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} title={item.title || item.description} className={className}>
      {content}
    </Link>
  );
}

export default function FinanceiroHomePage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [hostBaseUrl, setHostBaseUrl] = useState<string | null>(null);

  useEffect(() => {
    setHostBaseUrl(resolveHostBaseUrl());
  }, []);

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                  Financeiro integrado
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight">Portal Financeiro</h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                  Escolha abaixo a area desejada para abrir a tela completa do Financeiro.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {MENU_ITEMS.filter((item) => item.id !== 'vendas-2' || runtimeContext.userRole === 'ADMIN').map((item) => {
            const shouldReturnToHost = runtimeContext.embedded && hostBaseUrl;
            const href = shouldReturnToHost
              ? `${hostBaseUrl}${item.hostPath}`
              : `${item.href}${preservedQueryString}`;

            return (
              <FinanceMenuCard
                key={item.id}
                item={item}
                href={href}
                target={shouldReturnToHost ? '_top' : undefined}
              />
            );
          })}
        </div>
      </section>

    </div>
  );
}
