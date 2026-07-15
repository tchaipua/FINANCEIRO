'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { buildFinanceNavigationQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_BANCOS_E_BOLETOS';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

const MENU_ITEMS = [
  {
    id: 'bancos',
    label: 'Bancos',
    href: '/bancos',
    hostPath: '/principal/financeiro/bancos',
    description: 'Cadastre e consulte os bancos usados pela empresa.',
    image: '/principal-financeiro/bancos.svg?v=1',
  },
  {
    id: 'controle-extrato',
    label: 'Controle Extrato',
    href: '/bancos/extrato',
    hostPath: '/principal/financeiro/bancos/extrato',
    description: 'Consulte e confira o extrato bancario por banco.',
    image: '/principal-financeiro/bancos.svg?v=1',
  },
  {
    id: 'movimentos-abertos',
    label: 'Movimentos em Aberto',
    href: '/bancos/movimentos-abertos',
    hostPath: '/principal/financeiro/bancos/movimentos-abertos',
    description: 'Confira movimentos em aberto selecionando o banco.',
    image: '/principal-financeiro/bancos.svg?v=1',
  },
  {
    id: 'lotes',
    label: 'Envio\\Registro Boletos',
    href: '/recebiveis/lotes',
    hostPath: '/principal/financeiro/lotes',
    description: 'Registre no banco os boletos das parcelas geradas.',
    image: '/principal-financeiro/lotes.svg?v=2',
  },
  {
    id: 'retornos',
    label: 'Retorno Boletos',
    href: '/recebiveis/retornos',
    hostPath: '/principal/financeiro/retornos',
    description: 'Importe e confira os retornos bancarios.',
    image: '/principal-financeiro/retornos.svg?v=2',
  },
  {
    id: 'dda',
    label: 'Duplicatas DDA',
    href: '/bancos/ddas-abertos',
    hostPath: '/principal/financeiro/bancos/ddas-abertos',
    description: 'Consulte os boletos DDA em aberto das contas do Sicoob.',
    image: '/principal-financeiro/contas-a-pagar.svg?v=1',
  },
] as const;

function resolveHostBaseUrl() {
  if (typeof document === 'undefined' || !document.referrer) return null;

  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

export default function BancosEBoletosPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [hostBaseUrl, setHostBaseUrl] = useState<string | null>(null);

  useEffect(() => {
    setHostBaseUrl(resolveHostBaseUrl());
  }, []);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') return;
    window.parent?.postMessage({ type: 'MSINFOR_SCREEN_CONTEXT', screenId: SCREEN_ID }, '*');
  }, [runtimeContext.embedded]);

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
              Financeiro integrado
            </div>
            <h1 className="mt-1 text-2xl font-black">Bancos e Boletos</h1>
            <p className="mt-1 text-xs font-medium text-blue-100/90">
              Escolha a operacao bancaria desejada.
            </p>
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MENU_ITEMS.map((item) => {
            const shouldReturnToHost = runtimeContext.embedded && hostBaseUrl;
            const href = shouldReturnToHost
              ? `${hostBaseUrl}${item.hostPath}`
              : `${item.href}${preservedQueryString}`;
            const className =
              'group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50';
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

            return shouldReturnToHost ? (
              <a
                key={item.id}
                href={href}
                target="_top"
                rel="noreferrer"
                title={item.description}
                className={className}
              >
                {content}
              </a>
            ) : (
              <Link key={item.id} href={href} title={item.description} className={className}>
                {content}
              </Link>
            );
          })}
        </div>
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={SCREEN_ID}
            className="justify-end"
            originText="Origem: Sistema Financeiro - caminho fisico: C:/Sistemas/IA/Financeiro/frontend/src/app/bancos-e-boletos/page.tsx"
          />
        </section>
      ) : null}
    </div>
  );
}
