'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { API_BASE_URL, getJson } from '@/app/lib/api';
import {
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type BankItem = {
  id: string;
  bankName: string;
  branchNumber: string;
  branchDigit?: string | null;
  accountNumber: string;
  accountDigit?: string | null;
  billingProvider?: string | null;
  status: string;
};

type BankReturnImportItem = {
  id: string;
  provider: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  importedItemCount: number;
  matchedItemCount: number;
  liquidatedItemCount: number;
  bankClosedItemCount: number;
  readyToApplyCount: number;
  appliedItemCount: number;
  unmatchedItemCount: number;
  bankAccountId: string;
  bankAccountLabel?: string | null;
  createdAt: string;
};

const SCREEN_ID = 'FINANCEIRO_RETORNOS_BANCARIOS_LISTAGEM';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

function getTodayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

function getImportStatusTone(status: string) {
  switch (String(status || '').trim().toUpperCase()) {
    case 'APPLIED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'PARTIAL':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700';
  }
}

export default function FinanceiroBankReturnsPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const router = useRouter();
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [imports, setImports] = useState<BankReturnImportItem[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [periodStart, setPeriodStart] = useState(getTodayDateInput());
  const [periodEnd, setPeriodEnd] = useState(getTodayDateInput());
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadPageData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [loadedBanks, loadedImports] = await Promise.all([
        getJson<BankItem[]>(`/banks${buildFinanceApiQueryString(runtimeContext, {
          status: 'ACTIVE',
        })}`),
        getJson<BankReturnImportItem[]>(
          `/receivables/bank-return-imports${buildFinanceApiQueryString(runtimeContext)}`,
        ),
      ]);

      const filteredBanks = loadedBanks.filter(
        (item) => String(item.status || '').trim().toUpperCase() === 'ACTIVE',
      );

      setBanks(filteredBanks);
      setImports(loadedImports);

      if (!selectedBankId && filteredBanks.length) {
        setSelectedBankId(filteredBanks[0].id);
      }
    } catch (currentError) {
      setBanks([]);
      setImports([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Nao foi possivel carregar os retornos bancarios do Financeiro.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext, selectedBankId]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const selectedBank = useMemo(
    () => banks.find((item) => item.id === selectedBankId) || null,
    [banks, selectedBankId],
  );

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedBankId) {
      setError('Selecione o banco do retorno bancario.');
      return;
    }

    try {
      setIsImporting(true);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(`${API_BASE_URL}/receivables/bank-return-imports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          bankAccountId: selectedBankId,
          periodStart,
          periodEnd,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.message || 'Nao foi possivel importar o retorno bancario.',
        );
      }

      setStatusMessage(
        payload?.message || 'Retorno bancario importado com sucesso.',
      );

      if (payload?.id) {
        router.push(`/recebiveis/retornos/${payload.id}${preservedQueryString}`);
        return;
      }

      await loadPageData();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Nao foi possivel importar o retorno bancario.',
        ),
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                  Contas a receber
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">
                  Retorno bancario
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Importe os boletos liquidados e baixados do banco, confira as
                  observacoes e so depois efetive a baixa manual nas parcelas do sistema.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/recebiveis/lotes${preservedQueryString}`}
                  className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
                >
                  Voltar aos lotes
                </Link>
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

      {statusMessage ? (
        <section className={`${cardClass} border-emerald-200 bg-emerald-50 px-6 py-5 text-sm font-semibold text-emerald-700`}>
          {statusMessage}
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="mb-4">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Nova importacao
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            Buscar retorno no banco
          </h2>
        </div>

        <form onSubmit={handleImport} className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Banco
            </span>
            <select
              value={selectedBankId}
              onChange={(event) => setSelectedBankId(event.target.value)}
              className={inputClass}
            >
              <option value="">SELECIONE</option>
              {banks.map((item) => (
                <option key={item.id} value={item.id}>
                  {buildBankLabel(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Data inicial
            </span>
            <input
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Data final
            </span>
            <input
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              className={inputClass}
            />
          </label>

          <button
            type="submit"
            disabled={isImporting}
            className="mt-auto rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isImporting ? 'Importando...' : 'Importar retorno'}
          </button>
        </form>

        {selectedBank ? (
          <p className="mt-4 text-sm font-semibold text-slate-500">
            Banco selecionado: {buildBankLabel(selectedBank)}.
          </p>
        ) : null}
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Resultado
          </div>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="text-xl font-black text-slate-900">
              {isLoading ? 'Carregando...' : `${imports.length} importacao(oes) encontrada(s)`}
            </h2>
            {!isLoading ? (
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Conferencia manual antes da baixa no sistema
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Banco</th>
                <th className="px-4 py-3">Periodo</th>
                <th className="px-4 py-3">Importados</th>
                <th className="px-4 py-3">Liquidados</th>
                <th className="px-4 py-3">Baixados</th>
                <th className="px-4 py-3">Prontos</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">
                      {item.bankAccountLabel || 'BANCO'}
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getImportStatusTone(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {formatDateLabel(item.periodStart)} ate {formatDateLabel(item.periodEnd)}
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">{item.importedItemCount}</td>
                  <td className="px-4 py-4 font-semibold text-emerald-700">{item.liquidatedItemCount}</td>
                  <td className="px-4 py-4 font-semibold text-rose-600">{item.bankClosedItemCount}</td>
                  <td className="px-4 py-4 font-black text-blue-700">{item.readyToApplyCount}</td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {formatDateLabel(item.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/recebiveis/retornos/${item.id}${preservedQueryString}`}
                      className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                    >
                      Ver conferencia
                    </Link>
                  </td>
                </tr>
              ))}

              {!isLoading && !imports.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhuma importacao de retorno bancario foi registrada ainda.
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
