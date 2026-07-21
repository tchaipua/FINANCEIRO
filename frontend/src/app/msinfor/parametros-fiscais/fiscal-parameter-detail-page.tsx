'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import type { FiscalParameterCatalogItem } from './fiscal-parameter-catalog';
import FiscalParameterEditor from './fiscal-parameter-editor';

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

type FiscalParameterDetailPageProps = {
  item: FiscalParameterCatalogItem;
};

export default function FiscalParameterDetailPage({ item }: FiscalParameterDetailPageProps) {
  const runtimeContext = useFinanceRuntimeContext();
  const [isMounted, setIsMounted] = useState(false);
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const standaloneScreenId = `FINANCEIRO_MSINFOR_PARAMETROS_FISCAIS_${item.screenSuffix}`;
  const embeddedScreenId = `PRINCIPAL_FINANCEIRO_MSINFOR_PARAMETROS_FISCAIS_${item.screenSuffix}`;
  const screenId = runtimeContext.embedded ? embeddedScreenId : standaloneScreenId;
  const originText = `Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/parametros-fiscais/[cadastro]/page.tsx - cadastro: ${item.slug}`;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!runtimeContext.embedded || window.parent === window) return;
    window.parent.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: embeddedScreenId,
      },
      '*',
    );
  }, [embeddedScreenId, runtimeContext.embedded]);

  if (!isMounted) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className={`${cardClass} px-8 py-6 text-center text-sm font-bold text-slate-600`}>
          CARREGANDO {item.title}...
        </div>
      </div>
    );
  }

  if (runtimeContext.userRole !== 'ADMIN') {
    return (
      <div className="space-y-6">
        <section className={`${cardClass} border-amber-200 p-8 text-center`}>
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-600">
            Acesso restrito
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900">{item.title}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Esta área está disponível somente para usuários com perfil ADMIN.
          </p>
        </section>
      </div>
    );
  }

  const auditText = `Cadastro fiscal reservado no Financeiro.

Contexto:
- cadastro: ${item.title}
- sistema de origem: ${runtimeContext.sourceSystem || 'NÃO INFORMADO'}
- tenant de origem: ${runtimeContext.sourceTenantId || 'NÃO INFORMADO'}
- filial: ${runtimeContext.sourceBranchCode}

Regra:
- os dados serão persistidos por empresa e filial
- alterações terão auditoria e cancelamento lógico
- nenhum sistema externo armazenará regra de emissão fiscal`;

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white p-2 shadow-lg">
                <img src={item.icon} alt={item.title} className="h-full w-full object-contain" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                  Parâmetros fiscais
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight">{item.title}</h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                  {item.description}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
              Cadastro fiscal por filial
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-900">{item.title}</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              {item.description}
            </p>
          </div>
          <Link
            href={`/msinfor/parametros-fiscais${preservedQueryString}`}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
          >
            Voltar aos parâmetros
          </Link>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {item.plannedFields.map((field) => (
            <div
              key={field}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700"
            >
              {field}
            </div>
          ))}
        </div>

        <FiscalParameterEditor itemSlug={item.slug} />
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={originText}
            auditText={auditText}
            sqlText="-- CADASTROS FISCAIS PERSISTIDOS POR EMPRESA E FILIAL NO NÚCLEO DO FINANCEIRO."
          />
        </section>
      ) : null}
    </div>
  );
}
