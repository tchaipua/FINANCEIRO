'use client';

import { useCallback, useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
  formatCurrency,
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type DashboardOverview = {
  companyCount: number;
  batchCount: number;
  openCashSessionCount: number;
  openInstallmentCount: number;
  overdueInstallmentCount: number;
  openInstallmentAmount: number;
  settledAmountThisMonth: number;
  recentBatches: Array<{
    id: string;
    companyName: string;
    sourceSystem: string;
    sourceBatchType: string;
    itemCount: number;
    processedCount: number;
    duplicateCount: number;
    errorCount: number;
    createdAt: string;
  }>;
  recentCashSessions: Array<{
    id: string;
    companyName: string;
    cashierDisplayName: string;
    status: string;
    openingAmount: number;
    totalReceivedAmount: number;
    expectedClosingAmount: number;
    openedAt: string;
    closedAt?: string | null;
  }>;
};

const SCREEN_ID = 'FINANCEIRO_DASHBOARD_RESUMO_GERAL';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

export default function FinanceiroResumoPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setOverview(
        await getJson<DashboardOverview>(
          `/dashboard/overview${buildFinanceApiQueryString(runtimeContext)}`,
        ),
      );
    } catch (currentError) {
      setOverview(null);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar o resumo do Financeiro.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                  Financeiro desacoplado
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">Resumo Geral</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Acompanhe a operação centralizada do core financeiro para escolas, petshops e
                  outros sistemas de origem.
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-50">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">
                  Status da carga
                </div>
                <div className="mt-1 text-base font-black">
                  {isLoading ? 'CARREGANDO...' : error ? 'INDISPONÍVEL' : 'OPERACIONAL'}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
          </div>
        </section>
      ) : null}

      {error ? (
        <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Empresas ativas',
            value: overview?.companyCount ?? 0,
            tone: 'border-blue-200 bg-blue-50 text-blue-700',
          },
          {
            label: 'Lotes recebidos',
            value: overview?.batchCount ?? 0,
            tone: 'border-cyan-200 bg-cyan-50 text-cyan-700',
          },
          {
            label: 'Parcelas em aberto',
            value: overview?.openInstallmentCount ?? 0,
            tone: 'border-amber-200 bg-amber-50 text-amber-700',
          },
          {
            label: 'Caixas abertos',
            value: overview?.openCashSessionCount ?? 0,
            tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          },
        ].map((item) => (
          <article key={item.label} className={`${cardClass} p-5`}>
            <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${item.tone}`}>
              {item.label}
            </div>
            <div className="mt-4 text-4xl font-black text-slate-900">
              {isLoading ? '...' : item.value}
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className={`${cardClass} p-5`}>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Valor aberto
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">
            {isLoading ? '...' : formatCurrency(overview?.openInstallmentAmount)}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Soma das parcelas ainda pendentes no financeiro.
          </p>
        </article>
        <article className={`${cardClass} p-5`}>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Recebido no mês
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">
            {isLoading ? '...' : formatCurrency(overview?.settledAmountThisMonth)}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Total baixado em caixa dentro do mês corrente.
          </p>
        </article>
        <article className={`${cardClass} p-5`}>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Parcelas vencidas
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">
            {isLoading ? '...' : overview?.overdueInstallmentCount ?? 0}
          </div>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Quantidade de parcelas vencidas ainda em aberto.
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
              Lotes recentes
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-900">Importações recebidas</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Títulos</th>
                  <th className="px-4 py-3">Parcelas</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.recentBatches || []).map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-900">{item.companyName}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {item.sourceSystem}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{item.sourceBatchType}</td>
                    <td className="px-4 py-4">{item.itemCount}</td>
                    <td className="px-4 py-4">{item.processedCount}</td>
                    <td className="px-4 py-4">{formatDateLabel(item.createdAt)}</td>
                  </tr>
                ))}
                {!isLoading && !(overview?.recentBatches || []).length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                      Nenhum lote financeiro foi recebido ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
              Caixa recente
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-900">Sessões de caixa</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Operador</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Recebido</th>
                  <th className="px-4 py-3">Abertura</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.recentCashSessions || []).map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-4 font-black text-slate-900">{item.companyName}</td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{item.cashierDisplayName}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${item.status === 'OPEN' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                        {item.status === 'OPEN' ? 'ABERTO' : 'FECHADO'}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-black text-slate-900">{formatCurrency(item.totalReceivedAmount)}</td>
                    <td className="px-4 py-4">{formatDateLabel(item.openedAt)}</td>
                  </tr>
                ))}
                {!isLoading && !(overview?.recentCashSessions || []).length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                      Nenhum caixa foi aberto ainda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
