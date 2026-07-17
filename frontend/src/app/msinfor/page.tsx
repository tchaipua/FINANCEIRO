'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const FINANCE_SCREEN_ID = 'FINANCEIRO_MSINFOR_CENTRAL';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_MSINFOR';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/page.tsx';

export default function MsinforPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [isMounted, setIsMounted] = useState(false);
  const screenId = runtimeContext.embedded ? EMBEDDED_SCREEN_ID : FINANCE_SCREEN_ID;
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!runtimeContext.embedded || window.parent === window) return;
    window.parent.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: EMBEDDED_SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  if (!isMounted) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className={`${cardClass} px-8 py-6 text-center text-sm font-bold text-slate-600`}>
          CARREGANDO CENTRAL MSINFOR...
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
          <h1 className="mt-2 text-2xl font-black text-slate-900">Central MSINFOR</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Esta área está disponível somente para usuários com perfil ADMIN.
          </p>
        </section>

        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText="Acesso negado porque o contexto atual não possui perfil ADMIN."
            sqlText="-- ESTA TELA NÃO CONSULTA DADOS QUANDO O ACESSO É NEGADO."
          />
        </section>
      </div>
    );
  }

  const auditText = `Central de integrações compartilhadas do Financeiro.

Contexto operacional:
- sistema de origem: ${runtimeContext.sourceSystem || 'NÃO INFORMADO'}
- tenant de origem: ${runtimeContext.sourceTenantId || 'NÃO INFORMADO'}
- filial: ${runtimeContext.sourceBranchCode}
- perfil exigido: ADMIN

Estrutura atual:
- card SUPERTEF abre a administração da integração em uma tela única com abas
- nenhuma credencial sensível é exibida ou armazenada nesta tela
- todas as integrações futuras devem preservar o isolamento por sourceSystem + sourceTenantId`;

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
                <img src="/logo-msinfor.jpg" alt="Logo MSINFOR" className="h-full w-full object-cover" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                  Financeiro integrado
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight">Central MSINFOR</h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                  Integrações e serviços compartilhados por todas as verticais do Financeiro.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <Link
            href={`/msinfor/supertef${preservedQueryString}`}
            title="Configurar máquinas, checkouts, roteamento, operações e estornos do SuperTEF."
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3">
              <img
                src="/principal-financeiro/supertef.svg"
                alt="SuperTEF"
                className="max-h-full max-w-full object-contain opacity-95 transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
              <div className="text-sm font-black text-slate-800">SUPERTEF</div>
            </div>
          </Link>
        </div>
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText={auditText}
            sqlText="-- CENTRAL DE NAVEGAÇÃO: ESTA TELA AINDA NÃO CONSULTA DADOS PERSISTIDOS."
          />
        </section>
      ) : null}
    </div>
  );
}
