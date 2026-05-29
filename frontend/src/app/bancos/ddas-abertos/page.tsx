'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
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

type BankItem = {
  id: string;
  bankName: string;
  branchNumber: string;
  branchDigit?: string | null;
  accountNumber: string;
  accountDigit?: string | null;
  billingProvider?: string | null;
  hasBillingApiCredentials?: boolean;
  hasBillingCertificate?: boolean;
  status: string;
};

type OpenDdaItem = {
  id: string;
  dueDate?: string | null;
  issueDate?: string | null;
  beneficiaryName: string;
  beneficiaryDocument?: string | null;
  payerName?: string | null;
  payerDocument?: string | null;
  documentNumber?: string | null;
  digitableLine?: string | null;
  barcode?: string | null;
  amount: number;
  status: string;
};

type OpenDdaResponse = {
  provider: string;
  bankAccountId: string;
  bankAccountLabel: string;
  accountNumber: number;
  ddaCount: number;
  openAmount: number;
  pulledAt?: string | null;
  scope?: string | null;
  items: OpenDdaItem[];
  message?: string;
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_BANCOS_DDAS_ABERTOS';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

function readBankIdFromUrl() {
  if (typeof window === 'undefined') return '';

  return String(new URLSearchParams(window.location.search).get('bankId') || '').trim();
}

function buildReturnQueryStringFromUrl() {
  if (typeof window === 'undefined') return '';

  const params = new URLSearchParams(window.location.search);
  params.delete('bankId');
  const query = params.toString();

  return query ? `?${query}` : '';
}

function formatDateOnlyLabel(value?: string | null) {
  const normalized = String(value || '').trim();
  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
  }

  return formatDateLabel(normalized);
}

function getDdaStatusTone(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();

  if (normalized.includes('VENC')) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (normalized.includes('ABERTO') || normalized.includes('PEND')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function isDdaOverdue(item: OpenDdaItem) {
  const normalized = String(item.dueDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = normalized.split('-').map((part) => Number(part));
  const dueDate = new Date(year, month - 1, day);

  return dueDate < todayOnly;
}

export default function FinanceiroOpenDdasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [returnQueryString, setReturnQueryString] = useState('');
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [lockedBankId, setLockedBankId] = useState('');
  const [ddaItems, setDdaItems] = useState<OpenDdaItem[]>([]);
  const [pulledAt, setPulledAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConsulting, setIsConsulting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeReady = Boolean(runtimeContext.sourceSystem && runtimeContext.sourceTenantId);
  const selectedBank = useMemo(
    () => banks.find((item) => item.id === selectedBankId) || null,
    [banks, selectedBankId],
  );
  const banksReturnQueryString = returnQueryString || preservedQueryString;
  const ddaSummary = useMemo(() => {
    const openAmount = ddaItems.reduce((total, item) => total + Number(item.amount || 0), 0);
    const overdueCount = ddaItems.filter((item) => isDdaOverdue(item)).length;

    return {
      openAmount,
      overdueCount,
      ddaCount: ddaItems.length,
    };
  }, [ddaItems]);

  const clearDdas = useCallback(() => {
    setDdaItems([]);
    setPulledAt(null);
    setStatusMessage(null);
  }, []);

  const handleReturnToBanks = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();

      const queryString = buildReturnQueryStringFromUrl() || banksReturnQueryString;
      window.location.href = `/bancos${queryString}`;
    },
    [banksReturnQueryString],
  );

  const loadOpenDdas = useCallback(async () => {
    if (!scopeReady || !selectedBankId) {
      clearDdas();
      return;
    }

    try {
      setIsConsulting(true);
      setError(null);
      setStatusMessage(null);

      const response = await getJson<OpenDdaResponse>(
        `/banks/${selectedBankId}/dda/open${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
          requestedBy:
            runtimeContext.cashierDisplayName ||
            runtimeContext.cashierUserId ||
            'SISTEMA',
        })}`,
      );

      setDdaItems(response.items || []);
      setPulledAt(response.pulledAt || null);
      setStatusMessage(
        response.message ||
          `${response.ddaCount || response.items?.length || 0} DDA(s) em aberto encontrado(s).`,
      );
    } catch (currentError) {
      clearDdas();
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível consultar os DDAs em aberto no banco.',
        ),
      );
    } finally {
      setIsConsulting(false);
    }
  }, [clearDdas, runtimeContext, scopeReady, selectedBankId]);

  const loadPageData = useCallback(async () => {
    if (!scopeReady) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const loadedBanks = await getJson<BankItem[]>(
        `/banks${buildFinanceApiQueryString(runtimeContext, { status: 'ACTIVE' })}`,
      );
      const activeBanks = loadedBanks.filter(
        (item) => String(item.status || '').trim().toUpperCase() === 'ACTIVE',
      );

      setBanks(activeBanks);

      if (!selectedBankId && !lockedBankId && activeBanks.length) {
        setSelectedBankId(activeBanks[0].id);
      }
    } catch (currentError) {
      setBanks([]);
      clearDdas();
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar os bancos para consultar DDA.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [clearDdas, lockedBankId, runtimeContext, scopeReady, selectedBankId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
      },
      '*',
    );
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncSelectedBankId = () => {
      const bankId = readBankIdFromUrl();
      setSelectedBankId(bankId);
      setLockedBankId(bankId);
      setReturnQueryString(buildReturnQueryStringFromUrl());
    };

    syncSelectedBankId();
    window.addEventListener('popstate', syncSelectedBankId);
    window.addEventListener('hashchange', syncSelectedBankId);

    return () => {
      window.removeEventListener('popstate', syncSelectedBankId);
      window.removeEventListener('hashchange', syncSelectedBankId);
    };
  }, []);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    void loadOpenDdas();
  }, [loadOpenDdas]);

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                  Bancos
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">
                  DDAs em aberto
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Consulte os boletos DDA em aberto da conta selecionada.
                </p>
              </div>

              <Link
                href={`/bancos${banksReturnQueryString}`}
                onClick={handleReturnToBanks}
                className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar aos bancos
              </Link>
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
        <div className="grid gap-4 lg:grid-cols-[1.5fr_auto] lg:items-end">
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Banco
            </span>
            {lockedBankId ? (
              <div className="min-h-[46px] rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-black uppercase text-slate-700">
                {selectedBank ? buildBankLabel(selectedBank) : 'BANCO SELECIONADO'}
              </div>
            ) : (
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
            )}
          </label>

          <button
            type="button"
            onClick={() => void loadOpenDdas()}
            disabled={isConsulting || !selectedBankId}
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isConsulting ? 'Consultando...' : 'Atualizar DDA'}
          </button>
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-3">
        <div className={`${cardClass} px-4 py-2`}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
            DDAs em aberto
          </div>
          <div className="mt-0.5 text-lg font-black text-slate-900">
            {ddaSummary.ddaCount}
          </div>
        </div>
        <div className={`${cardClass} px-4 py-2`}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
            Valor em aberto
          </div>
          <div className="mt-0.5 text-lg font-black text-emerald-700">
            {formatCurrency(ddaSummary.openAmount)}
          </div>
        </div>
        <div className={`${cardClass} px-4 py-2`}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
            Vencidos
          </div>
          <div className="mt-0.5 text-lg font-black text-rose-700">
            {ddaSummary.overdueCount}
          </div>
        </div>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="max-h-[58vh] overflow-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Beneficiário</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Pagador</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Linha digitável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ddaItems.map((item) => (
                <tr key={item.id} className="bg-white align-top">
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {formatDateOnlyLabel(item.dueDate)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">
                      {item.beneficiaryName || '---'}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {item.beneficiaryDocument || '---'}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {item.documentNumber || '---'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-700">
                      {item.payerName || '---'}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {item.payerDocument || '---'}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right font-black text-slate-900">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getDdaStatusTone(item.status)}`}>
                      {item.status || 'EM ABERTO'}
                    </span>
                  </td>
                  <td className="max-w-sm px-4 py-4 font-mono text-xs font-semibold text-slate-500">
                    <span className="break-all">
                      {item.digitableLine || item.barcode || '---'}
                    </span>
                  </td>
                </tr>
              ))}

              {!isLoading && !isConsulting && !ddaItems.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum DDA em aberto foi localizado para o banco selecionado.
                  </td>
                </tr>
              ) : null}

              {(isLoading || isConsulting) && !ddaItems.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Consultando DDAs em aberto...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Última consulta: {pulledAt ? formatDateLabel(pulledAt) : '---'}
        </div>
        <Link
          href={`/bancos${banksReturnQueryString}`}
          onClick={handleReturnToBanks}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
        >
          Voltar aos bancos
        </Link>
      </div>
    </div>
  );
}
