'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import { formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildFinanceQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type CompanyItem = {
  id: string;
  sourceSystem: string;
  sourceTenantId: string;
  name: string;
  document?: string | null;
  status: string;
  createdAt: string;
  receivableTitleCount: number;
  installmentCount: number;
  cashSessionCount: number;
};

const SCREEN_ID = 'FINANCEIRO_EMPRESAS_LISTAGEM_GERAL';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

export default function FinanceiroEmpresasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompanies = useCallback(async (currentSearch?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      setCompanies(
        await getJson<CompanyItem[]>(
          `/companies${buildFinanceQueryString(runtimeContext, {
            search: currentSearch?.trim()
              ? currentSearch.trim().toUpperCase()
              : undefined,
          })}`,
        ),
      );
    } catch (currentError) {
      setCompanies([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar as empresas do Financeiro.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCompanies(search);
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Cadastro operacional</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Empresas</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                {runtimeContext.embedded
                  ? 'A empresa financeira desta escola é mantida automaticamente no core financeiro.'
                  : 'Cada empresa é criada automaticamente a partir do sistema de origem e passa a operar no mesmo núcleo financeiro.'}
              </p>
            </div>
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
            placeholder="PESQUISAR POR EMPRESA, DOCUMENTO OU TENANT"
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
              void loadCompanies();
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
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Empresas ativas</div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {isLoading ? 'Carregando...' : `${companies.length} empresa(s) encontrada(s)`}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Títulos</th>
                <th className="px-4 py-3">Parcelas</th>
                <th className="px-4 py-3">Caixas</th>
                <th className="px-4 py-3">Criada em</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">{item.name}</div>
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
                  <td className="px-4 py-4 font-semibold text-slate-700">{item.document || '---'}</td>
                  <td className="px-4 py-4">{item.receivableTitleCount}</td>
                  <td className="px-4 py-4">{item.installmentCount}</td>
                  <td className="px-4 py-4">{item.cashSessionCount}</td>
                  <td className="px-4 py-4">{formatDateLabel(item.createdAt)}</td>
                </tr>
              ))}

              {!isLoading && !companies.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhuma empresa financeira foi localizada para o filtro informado.
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
