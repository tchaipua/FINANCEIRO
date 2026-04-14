'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import { formatCurrency, formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildFinanceQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type InstallmentItem = {
  id: string;
  sourceEntityName: string;
  classLabel?: string | null;
  description: string;
  payerNameSnapshot: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amount: number;
  openAmount: number;
  paidAmount: number;
  status: string;
  settlementMethod?: string | null;
  settledAt?: string | null;
  isOverdue: boolean;
};

type Filters = {
  status: 'OPEN' | 'PAID' | 'OVERDUE' | 'ALL';
  studentName: string;
  payerName: string;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_PARCELAS_LISTAGEM';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

const DEFAULT_FILTERS: Filters = {
  status: 'OPEN',
  studentName: '',
  payerName: '',
};

export default function FinanceiroInstallmentsPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [installments, setInstallments] = useState<InstallmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInstallments = useCallback(async (nextFilters: Filters) => {
    try {
      setIsLoading(true);
      setError(null);

      setInstallments(
        await getJson<InstallmentItem[]>(
          `/receivables/installments${buildFinanceQueryString(runtimeContext, {
            status: nextFilters.status,
            studentName: nextFilters.studentName.trim()
              ? nextFilters.studentName.trim().toUpperCase()
              : undefined,
            payerName: nextFilters.payerName.trim()
              ? nextFilters.payerName.trim().toUpperCase()
              : undefined,
          })}`,
        ),
      );
    } catch (currentError) {
      setInstallments([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar as parcelas do Financeiro.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadInstallments(DEFAULT_FILTERS);
  }, [loadInstallments]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadInstallments(filters);
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Contas a receber</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Parcelas</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                {runtimeContext.embedded
                  ? 'Consulte as parcelas da escola atual com visão direta do core financeiro.'
                  : 'Consulte parcelas abertas, vencidas ou fechadas com visão consolidada das empresas que operam no core financeiro.'}
              </p>
            </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1.3fr_1.3fr_0.8fr_auto_auto]">
          <input
            value={filters.studentName}
            onChange={(event) => setFilters((current) => ({ ...current, studentName: event.target.value }))}
            className={inputClass}
            placeholder="NOME DO REFERENTE"
          />
          <input
            value={filters.payerName}
            onChange={(event) => setFilters((current) => ({ ...current, payerName: event.target.value }))}
            className={inputClass}
            placeholder="NOME DO PAGADOR"
          />
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as Filters['status'] }))}
            className={inputClass}
          >
            <option value="OPEN">ABERTAS</option>
            <option value="PAID">FECHADAS</option>
            <option value="OVERDUE">VENCIDAS</option>
            <option value="ALL">TODAS</option>
          </select>
          <button
            type="submit"
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              void loadInstallments(DEFAULT_FILTERS);
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
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Parcelas encontradas</div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {isLoading ? 'Carregando...' : `${installments.length} parcela(s) encontrada(s)`}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Referente</th>
                <th className="px-4 py-3">Pagador</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Turma</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((item) => {
                const currentValue = item.status === 'PAID' ? item.paidAmount : item.openAmount;
                const statusLabel =
                  item.status === 'PAID' ? 'FECHADA' : item.isOverdue ? 'VENCIDA' : 'ABERTA';
                const statusTone =
                  item.status === 'PAID'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : item.isOverdue
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-blue-200 bg-blue-50 text-blue-700';

                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-900">{item.sourceEntityName}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        PARCELA {item.installmentNumber}/{item.installmentCount}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{item.payerNameSnapshot}</td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-700">{item.description}</div>
                      {item.settledAt ? (
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          BAIXADA EM {formatDateLabel(item.settledAt)}
                          {item.settlementMethod ? ` - ${item.settlementMethod}` : ''}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{item.classLabel || '---'}</td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{formatDateLabel(item.dueDate)}</td>
                    <td className="px-4 py-4 font-black text-slate-900">{formatCurrency(currentValue)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${statusTone}`}>
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {!isLoading && !installments.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhuma parcela foi localizada para o filtro informado.
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
