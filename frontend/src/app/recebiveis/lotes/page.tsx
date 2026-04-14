'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import { formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildFinanceQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type BatchItem = {
  id: string;
  companyName: string;
  sourceSystem: string;
  sourceTenantId: string;
  sourceBatchType: string;
  sourceBatchId: string;
  status: string;
  itemCount: number;
  processedCount: number;
  duplicateCount: number;
  errorCount: number;
  createdAt: string;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_LOTES_LISTAGEM';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

export default function FinanceiroReceivableBatchesPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [search, setSearch] = useState('');
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBatches = useCallback(async (currentSearch?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      setBatches(
        await getJson<BatchItem[]>(
          `/receivables/batches${buildFinanceQueryString(runtimeContext, {
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
  }, [runtimeContext]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadBatches(search);
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Contas a receber</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Lotes recebidos</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                {runtimeContext.embedded
                  ? 'Acompanhe os lotes recebidos desta escola no core financeiro, com histórico e controle de duplicidade.'
                  : 'Cada lote representa uma importação do sistema de origem para o core financeiro, com controle de duplicidade e histórico.'}
              </p>
            </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
            placeholder="PESQUISAR POR EMPRESA, TENANT, SISTEMA OU TIPO"
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
        <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Resultado</div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {isLoading ? 'Carregando...' : `${batches.length} lote(s) encontrado(s)`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Títulos</th>
                <th className="px-4 py-3">Parcelas</th>
                <th className="px-4 py-3">Duplicidades</th>
                <th className="px-4 py-3">Erros</th>
                <th className="px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">{item.companyName}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {item.status}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-700">{item.sourceSystem}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {item.sourceTenantId}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">{item.sourceBatchType}</td>
                  <td className="px-4 py-4">{item.itemCount}</td>
                  <td className="px-4 py-4">{item.processedCount}</td>
                  <td className="px-4 py-4">{item.duplicateCount}</td>
                  <td className="px-4 py-4">{item.errorCount}</td>
                  <td className="px-4 py-4">{formatDateLabel(item.createdAt)}</td>
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
