'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_MSINFOR_CONFIGURACAO_RECIBOS';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/configuracao-recibos/page.tsx';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

export default function ReceiptConfigurationPage() {
  const runtime = useFinanceRuntimeContext();
  const queryString = buildFinanceNavigationQueryString(runtime);

  useEffect(() => {
    if (!runtime.embedded || window.parent === window) return;
    window.parent.postMessage(
      { type: 'MSINFOR_SCREEN_CONTEXT', screenId: SCREEN_ID },
      '*',
    );
  }, [runtime.embedded]);

  if (runtime.userRole !== 'ADMIN') {
    return (
      <div className="space-y-6">
        <section className={`${cardClass} border-amber-200 p-8 text-center`}>
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-600">
            Acesso restrito
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900">
            Configuração de recibos
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Esta área está disponível somente para usuários com perfil ADMIN.
          </p>
        </section>
        {!runtime.embedded ? (
          <section className={`${cardClass} px-6 py-4`}>
            <ScreenNameCopy
              screenId={SCREEN_ID}
              className="justify-end"
              originText={ORIGIN_TEXT}
              auditText="Acesso negado porque o contexto atual não possui perfil ADMIN."
              sqlText="-- ESTA TELA NÃO CONSULTA DADOS QUANDO O ACESSO É NEGADO."
            />
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-5 py-5 text-white">
          <div className="flex items-center gap-4">
            <img
              src="/logo-msinfor.jpg"
              alt="Logo MSINFOR"
              className="h-14 w-14 rounded-2xl border border-white/20 bg-white object-contain shadow-lg"
            />
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                Central MSINFOR
              </div>
              <h1 className="text-2xl font-black">Configuração de recibos</h1>
              <p className="mt-1 text-xs font-semibold text-blue-100">
                Escolha entre editar o modelo no sistema ou importar um modelo preparado a partir de uma imagem.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <Link
            href={`/msinfor/modelos-impressao${queryString}`}
            title="Abrir o editor visual, impressoras, automações e histórico."
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3 text-4xl">
              🖨️
            </div>
            <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
              <div className="text-sm font-black text-slate-800">
                MODELOS DE IMPRESSÃO
              </div>
            </div>
          </Link>

          <Link
            href={`/msinfor/configura-recibos-imagem${queryString}`}
            title="Comparar uma imagem de referência e importar o pacote de relatório criado no Codex."
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3 text-4xl">
              🧾
            </div>
            <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
              <div className="text-sm font-black text-slate-800">
                CONFIGURA RECIBOS POR IMAGEM
              </div>
            </div>
          </Link>
        </div>
      </section>

      {!runtime.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={SCREEN_ID}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText={`Central isolada por empresa e filial. Tenant: ${runtime.sourceTenantId || 'NÃO INFORMADO'}. Filial: ${runtime.sourceBranchCode}. Perfil exigido: ADMIN.`}
            sqlText="-- TELA DE NAVEGAÇÃO SEM MUTAÇÃO DE DADOS."
          />
        </section>
      ) : null}
    </div>
  );
}
