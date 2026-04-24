'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { API_BASE_URL, getJson } from '@/app/lib/api';
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

type BankReturnImportInstallment = {
  id: string;
  sourceInstallmentKey: string;
  status: string;
  openAmount: number;
  paidAmount: number;
  settledAt?: string | null;
};

type BankReturnImportRow = {
  id: string;
  movementTypeCode: string;
  movementStatus: string;
  dueDate?: string | null;
  movementDate?: string | null;
  paymentDate?: string | null;
  expectedCreditDate?: string | null;
  ourNumber?: string | null;
  yourNumber?: string | null;
  barcode?: string | null;
  contractNumber?: string | null;
  amount: number;
  settledAmount?: number | null;
  discountAmount?: number | null;
  interestAmount?: number | null;
  feeAmount?: number | null;
  appliedAt?: string | null;
  appliedStatus?: string | null;
  suggestionCode: string;
  suggestionLabel: string;
  noteText: string;
  canApply: boolean;
  matchedInstallment?: BankReturnImportInstallment | null;
};

type BankReturnImportDetail = {
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
  companyName?: string | null;
  createdAt: string;
  items: BankReturnImportRow[];
};

const SCREEN_ID = 'FINANCEIRO_RETORNOS_BANCARIOS_DETALHE';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

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

function getRowNoteTone(item: BankReturnImportRow) {
  if (String(item.movementStatus || '').trim().toUpperCase() === 'WRITE_OFF') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (item.canApply) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function getSuggestionTone(item: BankReturnImportRow) {
  if (item.canApply) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (String(item.movementStatus || '').trim().toUpperCase() === 'WRITE_OFF') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-slate-200 bg-slate-100 text-slate-600';
}

export default function FinanceiroBankReturnImportDetailPage() {
  const params = useParams<{ importId: string }>();
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const importId = String(params?.importId || '').trim();
  const [importDetail, setImportDetail] = useState<BankReturnImportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadImportDetail = useCallback(async () => {
    if (!importId) {
      setImportDetail(null);
      setError('Importacao de retorno bancario invalida.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const loadedImport = await getJson<BankReturnImportDetail>(
        `/receivables/bank-return-imports/${importId}${buildFinanceApiQueryString(runtimeContext)}`,
      );

      setImportDetail(loadedImport);
    } catch (currentError) {
      setImportDetail(null);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Nao foi possivel carregar a conferencia do retorno bancario.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [importId, runtimeContext]);

  useEffect(() => {
    void loadImportDetail();
  }, [loadImportDetail]);

  const canApplyLiquidations = useMemo(
    () => Number(importDetail?.readyToApplyCount || 0) > 0,
    [importDetail],
  );

  async function handleApplyLiquidations() {
    if (!importDetail) return;

    try {
      setIsApplying(true);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/receivables/bank-return-imports/${importDetail.id}/apply-liquidations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.message || 'Nao foi possivel efetivar a baixa das parcelas.',
        );
      }

      setStatusMessage(
        payload?.message || 'Baixa das parcelas liquidada com sucesso.',
      );
      await loadImportDetail();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Nao foi possivel efetivar a baixa das parcelas.',
        ),
      );
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                Contas a receber
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                Conferencia do retorno bancario
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                Confira os boletos importados do banco antes de baixar as parcelas.
                Somente os retornos liquidados e vinculados a parcelas em aberto
                podem ser efetivados.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/recebiveis/retornos${preservedQueryString}`}
                className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar aos retornos
              </Link>
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
              Importacao
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-900">
              {isLoading ? 'Carregando...' : importDetail?.bankAccountLabel || 'RETORNO BANCARIO'}
            </h2>
            {!isLoading && importDetail ? (
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Periodo de {formatDateLabel(importDetail.periodStart)} ate{' '}
                {formatDateLabel(importDetail.periodEnd)}.
              </p>
            ) : null}
          </div>

          {!isLoading && importDetail ? (
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getImportStatusTone(importDetail.status)}`}
              >
                {importDetail.status}
              </span>
              <button
                type="button"
                onClick={handleApplyLiquidations}
                disabled={!canApplyLiquidations || isApplying}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isApplying ? 'Baixando...' : 'Baixar boletos liquidados'}
              </button>
            </div>
          ) : null}
        </div>

        {!isLoading && importDetail ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Importados
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">
                {importDetail.importedItemCount}
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Liquidados
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-700">
                {importDetail.liquidatedItemCount}
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Baixados
              </div>
              <div className="mt-2 text-2xl font-black text-rose-600">
                {importDetail.bankClosedItemCount}
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Com vinculo
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">
                {importDetail.matchedItemCount}
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Prontos p/ baixa
              </div>
              <div className="mt-2 text-2xl font-black text-blue-700">
                {importDetail.readyToApplyCount}
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Ja aplicados
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">
                {importDetail.appliedItemCount}
              </div>
            </article>
          </div>
        ) : null}

        {!isLoading && importDetail ? (
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
            A importacao nao baixa nada sozinha. O botao acima efetiva apenas os
            boletos liquidados e vinculados a parcelas em aberto no sistema.
          </div>
        ) : null}
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Itens importados
          </div>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="text-xl font-black text-slate-900">
              {isLoading
                ? 'Carregando conferencia...'
                : `${importDetail?.items.length || 0} boleto(s) conferido(s)`}
            </h2>
            {!isLoading && importDetail ? (
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Conferencia registrada em {formatDateLabel(importDetail.createdAt)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Movimento</th>
                <th className="px-4 py-3">Boleto</th>
                <th className="px-4 py-3">Parcela</th>
                <th className="px-4 py-3">Valores</th>
                <th className="px-4 py-3">Datas</th>
                <th className="px-4 py-3">Observacao</th>
              </tr>
            </thead>
            <tbody>
              {importDetail?.items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">
                      {item.movementTypeCode || 'OUTRO'}
                    </div>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getSuggestionTone(item)}`}
                      >
                        {item.suggestionLabel}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">
                      Nosso numero: {item.ourNumber || '---'}
                    </div>
                    <div className="mt-1 font-semibold text-slate-500">
                      Seu numero: {item.yourNumber || '---'}
                    </div>
                    <div className="mt-1 font-semibold text-slate-500">
                      Contrato: {item.contractNumber || '---'}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {item.matchedInstallment ? (
                      <>
                        <div className="font-black text-slate-900">
                          {item.matchedInstallment.sourceInstallmentKey}
                        </div>
                        <div className="mt-1 font-semibold text-slate-500">
                          Status: {item.matchedInstallment.status}
                        </div>
                        <div className="mt-1 font-semibold text-slate-500">
                          Em aberto: {formatCurrency(item.matchedInstallment.openAmount)}
                        </div>
                      </>
                    ) : (
                      <span className="font-bold text-slate-400">
                        Sem vinculo no sistema
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">
                      Titulo: {formatCurrency(item.amount)}
                    </div>
                    <div className="mt-1 font-semibold text-emerald-700">
                      Liquido: {formatCurrency(item.settledAmount)}
                    </div>
                    <div className="mt-1 font-semibold text-slate-500">
                      Desconto: {formatCurrency(item.discountAmount)}
                    </div>
                    <div className="mt-1 font-semibold text-slate-500">
                      Juros: {formatCurrency(item.interestAmount)}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    <div>Vencimento: {formatDateLabel(item.dueDate)}</div>
                    <div className="mt-1">
                      Movimento: {formatDateLabel(item.movementDate)}
                    </div>
                    <div className="mt-1">
                      Liquidacao: {formatDateLabel(item.paymentDate)}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm font-black uppercase tracking-[0.08em] ${getRowNoteTone(item)}`}
                    >
                      {item.noteText}
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && !importDetail?.items.length ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm font-semibold text-slate-400"
                  >
                    Nenhum boleto retornado pelo banco neste periodo.
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
