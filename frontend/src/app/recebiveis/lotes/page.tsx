'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
  formatCurrency,
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type BatchItem = {
  id: string;
  companyName?: string | null;
  sourceSystem: string;
  sourceTenantId: string;
  sourceBatchType: string;
  sourceBatchId: string;
  status: string;
  itemCount: number;
  processedCount: number;
  duplicateCount: number;
  errorCount: number;
  referenceDate?: string | null;
  createdAt: string;
  metadata?: {
    targetLabel?: string | null;
    firstDueDate?: string | null;
    schoolYear?: {
      year: number;
    } | null;
  } | null;
  receivableTitles?: Array<{
    totalAmount?: number | null;
  }>;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_LOTES_LISTAGEM';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

function getBatchTotalAmount(batch: BatchItem) {
  return (batch.receivableTitles || []).reduce(
    (accumulator, current) => accumulator + Number(current.totalAmount || 0),
    0,
  );
}

function getBatchStatusTone(status: string) {
  switch (String(status || '').trim().toUpperCase()) {
    case 'PROCESSED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'PARTIAL':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

export default function FinanceiroReceivableBatchesPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [search, setSearch] = useState('');
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBatches = useCallback(
    async (currentSearch?: string) => {
      try {
        setIsLoading(true);
        setError(null);

        setBatches(
          await getJson<BatchItem[]>(
            `/receivables/batches${buildFinanceApiQueryString(runtimeContext, {
              search: currentSearch?.trim()
                ? currentSearch.trim().toUpperCase()
                : undefined,
            })}`,
          ),
        );
      } catch (currentError) {
        setBatches([]);
        setError(
          getFriendlyRequestErrorMessage(
            currentError,
            'Não foi possível carregar os lotes do Financeiro.',
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [runtimeContext],
  );

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadBatches(search);
  }

  const totalInstallments = useMemo(
    () => batches.reduce((accumulator, current) => accumulator + current.processedCount, 0),
    [batches],
  );

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                Contas a receber
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Lotes recebidos</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                Cada lote representa um agrupamento de títulos e parcelas importados para o core financeiro.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
            placeholder="PESQUISAR POR EMPRESA, LOTE, SISTEMA, TENANT OU TIPO"
          />
          <button
            type="submit"
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
          >
            Pesquisar
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              void loadBatches();
            }}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
          >
            Limpar
          </button>
        </form>
      </section>

      {error ? (
        <section
          className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}
        >
          {error}
        </section>
      ) : null}

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            Resultado
          </div>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="text-xl font-black text-slate-900">
              {isLoading ? 'Carregando...' : `${batches.length} lote(s) encontrado(s)`}
            </h2>
            {!isLoading ? (
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                {totalInstallments} parcela(s) somadas nos lotes listados
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Filtro</th>
                <th className="px-4 py-3">Títulos</th>
                <th className="px-4 py-3">Parcelas</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">1º vencimento</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">
                      {item.companyName || 'EMPRESA FINANCEIRA'}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {item.sourceBatchType} | {item.sourceSystem}
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getBatchStatusTone(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-700">
                      {item.metadata?.targetLabel || item.sourceTenantId}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {item.metadata?.schoolYear?.year
                        ? `ANO LETIVO ${item.metadata.schoolYear.year}`
                        : item.sourceBatchId}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">{item.itemCount}</td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-700">{item.processedCount}</div>
                    {(item.duplicateCount > 0 || item.errorCount > 0) && (
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-500">
                        {item.duplicateCount > 0 ? `${item.duplicateCount} duplic.` : ''}
                        {item.duplicateCount > 0 && item.errorCount > 0 ? ' | ' : ''}
                        {item.errorCount > 0 ? `${item.errorCount} erro(s)` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 font-black text-slate-900">
                    {formatCurrency(getBatchTotalAmount(item))}
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {formatDateLabel(item.metadata?.firstDueDate || item.referenceDate || null)}
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {formatDateLabel(item.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/recebiveis/lotes/${item.id}${preservedQueryString}`}
                      className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                    >
                      Ver parcelas
                    </Link>
                  </td>
                </tr>
              ))}

              {!isLoading && !batches.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum lote financeiro foi encontrado para o filtro informado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
