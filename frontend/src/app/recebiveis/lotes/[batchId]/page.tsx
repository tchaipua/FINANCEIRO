'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
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

type BatchDetail = {
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

type InstallmentItem = {
  id: string;
  batchId: string;
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
  bankAccountId?: string | null;
  bankAccountLabel?: string | null;
  bankSlipStatus?: string | null;
  bankSlipMessage?: string | null;
  bankSlipProvider?: string | null;
  bankSlipOurNumber?: string | null;
  bankSlipYourNumber?: string | null;
  bankSlipDigitableLine?: string | null;
  bankSlipBarcode?: string | null;
  bankSlipQrCode?: string | null;
  bankSlipIssuedAt?: string | null;
  hasBankSlipPdf?: boolean;
  settlementMethod?: string | null;
  settledAt?: string | null;
  isOverdue: boolean;
};

type BankItem = {
  id: string;
  bankName: string;
  branchNumber: string;
  branchDigit?: string | null;
  accountNumber: string;
  accountDigit?: string | null;
  billingProvider?: string | null;
  billingEnvironment?: string | null;
  hasBillingApiCredentials?: boolean;
  hasBillingCertificate?: boolean;
};

type InstallmentFilters = {
  search: string;
  status: 'OPEN' | 'PAID' | 'OVERDUE' | 'ALL';
};

type InstallmentBankSlipPdfPayload = {
  contentType: string;
  fileName: string;
  base64: string;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_LOTES_DETALHE';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const DEFAULT_FILTERS: InstallmentFilters = {
  search: '',
  status: 'ALL',
};

function getBatchTotalAmount(batch: BatchDetail | null) {
  return (batch?.receivableTitles || []).reduce(
    (accumulator, current) => accumulator + Number(current.totalAmount || 0),
    0,
  );
}

function canSelectInstallment(installment: InstallmentItem) {
  return (
    installment.status === 'OPEN' &&
    Number(installment.openAmount || 0) > 0 &&
    installment.bankSlipStatus !== 'ISSUED'
  );
}

function getInstallmentStatusLabel(item: InstallmentItem) {
  if (item.status === 'PAID') return 'FECHADA';
  if (item.isOverdue) return 'VENCIDA';
  return 'ABERTA';
}

function getInstallmentStatusTone(item: InstallmentItem) {
  if (item.status === 'PAID') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (item.isOverdue) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

export default function FinanceiroReceivableBatchDetailPage() {
  const params = useParams<{ batchId: string }>();
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const batchId = String(params?.batchId || '').trim();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [filters, setFilters] = useState<InstallmentFilters>(DEFAULT_FILTERS);
  const [installments, setInstallments] = useState<InstallmentItem[]>([]);
  const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<string[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [isLoadingBatch, setIsLoadingBatch] = useState(true);
  const [isLoadingInstallments, setIsLoadingInstallments] = useState(true);
  const [isSubmittingBank, setIsSubmittingBank] = useState(false);
  const [isIssuingBankSlips, setIsIssuingBankSlips] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadBatchContext = useCallback(async () => {
    if (!batchId) {
      setBatch(null);
      setBanks([]);
      setError('Lote financeiro inválido.');
      setIsLoadingBatch(false);
      return;
    }

    try {
      setIsLoadingBatch(true);
      setError(null);

      const loadedBatch = await getJson<BatchDetail>(
        `/receivables/batches/${batchId}${buildFinanceApiQueryString(runtimeContext)}`,
      );

      setBatch(loadedBatch);

      const bankQuery = buildFinanceApiQueryString(runtimeContext, {
        sourceSystem: loadedBatch.sourceSystem,
        sourceTenantId: loadedBatch.sourceTenantId,
        status: 'ACTIVE',
      });

      const loadedBanks = await getJson<BankItem[]>(`/banks${bankQuery}`);
      setBanks(loadedBanks);
    } catch (currentError) {
      setBatch(null);
      setBanks([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar o lote financeiro.',
        ),
      );
    } finally {
      setIsLoadingBatch(false);
    }
  }, [batchId, runtimeContext]);

  const loadInstallments = useCallback(
    async (currentBatch: BatchDetail | null, currentFilters: InstallmentFilters) => {
      if (!currentBatch) {
        setInstallments([]);
        setIsLoadingInstallments(false);
        return;
      }

      try {
        setIsLoadingInstallments(true);
        setError(null);

        const queryString = buildFinanceApiQueryString(runtimeContext, {
          sourceSystem: currentBatch.sourceSystem,
          sourceTenantId: currentBatch.sourceTenantId,
          batchId: currentBatch.id,
          status: currentFilters.status,
          search: currentFilters.search.trim()
            ? currentFilters.search.trim().toUpperCase()
            : undefined,
        });

        setInstallments(await getJson<InstallmentItem[]>(`/receivables/installments${queryString}`));
      } catch (currentError) {
        setInstallments([]);
        setError(
          getFriendlyRequestErrorMessage(
            currentError,
            'Não foi possível carregar as parcelas do lote.',
          ),
        );
      } finally {
        setIsLoadingInstallments(false);
      }
    },
    [runtimeContext],
  );

  useEffect(() => {
    void loadBatchContext();
  }, [loadBatchContext]);

  useEffect(() => {
    if (!batch) return;
    void loadInstallments(batch, filters);
  }, [batch, filters, loadInstallments]);

  useEffect(() => {
    setSelectedInstallmentIds((current) =>
      current.filter((installmentId) =>
        installments.some(
          (item) => item.id === installmentId && canSelectInstallment(item),
        ),
      ),
    );
  }, [installments]);

  const selectableInstallments = useMemo(
    () => installments.filter((item) => canSelectInstallment(item)),
    [installments],
  );

  const selectedBank = useMemo(
    () => banks.find((bank) => bank.id === selectedBankId) || null,
    [banks, selectedBankId],
  );

  async function handleAssignBank() {
    if (!batch) return;

    if (!selectedBankId) {
      setError('Selecione o banco que vai receber a emissão dos boletos.');
      return;
    }

    if (!selectedInstallmentIds.length) {
      setError('Selecione ao menos uma parcela em aberto.');
      return;
    }

    try {
      setIsSubmittingBank(true);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/receivables/batches/${batch.id}/assign-bank`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceSystem: batch.sourceSystem,
            sourceTenantId: batch.sourceTenantId,
            bankAccountId: selectedBankId,
            installmentIds: selectedInstallmentIds,
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.message ||
            'Não foi possível vincular o banco às parcelas selecionadas.',
        );
      }

      setStatusMessage(
        payload?.message || 'Banco vinculado às parcelas selecionadas com sucesso.',
      );
      await loadInstallments(batch, filters);
      setSelectedInstallmentIds([]);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível preparar o banco de emissão das parcelas.',
        ),
      );
    } finally {
      setIsSubmittingBank(false);
    }
  }

  async function handleIssueBankSlips() {
    if (!batch) return;

    if (!selectedBankId) {
      setError('Selecione o banco que vai emitir os boletos.');
      return;
    }

    if (!selectedInstallmentIds.length) {
      setError('Selecione ao menos uma parcela em aberto.');
      return;
    }

    try {
      setIsIssuingBankSlips(true);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/receivables/batches/${batch.id}/issue-bank-slips`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceSystem: batch.sourceSystem,
            sourceTenantId: batch.sourceTenantId,
            bankAccountId: selectedBankId,
            installmentIds: selectedInstallmentIds,
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.message || 'Não foi possível emitir os boletos selecionados.',
        );
      }

      setStatusMessage(
        payload?.message || 'Boletos emitidos com sucesso para as parcelas selecionadas.',
      );
      await loadInstallments(batch, filters);
      setSelectedInstallmentIds([]);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível emitir os boletos selecionados.',
        ),
      );
    } finally {
      setIsIssuingBankSlips(false);
    }
  }

  async function handleOpenBankSlipPdf(installmentId: string) {
    if (!batch) return;

    try {
      setError(null);
      const payload = await getJson<InstallmentBankSlipPdfPayload>(
        `/receivables/installments/${installmentId}/bank-slip-pdf${buildFinanceApiQueryString(runtimeContext, {
          sourceSystem: batch.sourceSystem,
          sourceTenantId: batch.sourceTenantId,
        })}`,
      );

      const binary = window.atob(payload.base64);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blob = new Blob([bytes], {
        type: payload.contentType || 'application/pdf',
      });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível abrir o boleto da parcela.',
        ),
      );
    }
  }

  function handleSubmitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!batch) return;
    void loadInstallments(batch, filters);
  }

  const totalAmount = getBatchTotalAmount(batch);

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
                Detalhe do lote
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                Consulte as parcelas do lote e defina o banco que fará a emissão dos boletos.
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
        <div className="grid gap-4 xl:grid-cols-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Empresa</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoadingBatch ? 'Carregando...' : batch?.companyName || '---'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Tipo</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoadingBatch ? 'Carregando...' : batch?.sourceBatchType || '---'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Filtro</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoadingBatch ? 'Carregando...' : batch?.metadata?.targetLabel || batch?.sourceTenantId || '---'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Parcelas</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoadingBatch ? 'Carregando...' : batch?.processedCount || 0}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Total</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoadingBatch ? 'Carregando...' : formatCurrency(totalAmount)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">1º vencimento</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoadingBatch
                ? 'Carregando...'
                : formatDateLabel(batch?.metadata?.firstDueDate || batch?.referenceDate || null)}
            </div>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_auto_auto_auto]">
          <select
            value={selectedBankId}
            onChange={(event) => setSelectedBankId(event.target.value)}
            className={inputClass}
            disabled={isLoadingBatch || !batch}
          >
            <option value="">SELECIONE O BANCO DE EMISSÃO</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {buildBankLabel(bank)}
              </option>
            ))}
          </select>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            {selectedBank ? (
              <div className="space-y-1">
                <div className="font-black text-slate-900">{selectedBank.bankName}</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {selectedBank.billingProvider || 'SEM PROVEDOR'} |{' '}
                  {selectedBank.billingEnvironment || 'SEM AMBIENTE'}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {selectedBank.hasBillingApiCredentials ? 'CREDENCIAIS OK' : 'SEM CREDENCIAIS'} |{' '}
                  {selectedBank.hasBillingCertificate ? 'CERTIFICADO OK' : 'SEM CERTIFICADO'}
                </div>
              </div>
            ) : !banks.length ? (
              <div className="flex h-full flex-col justify-center gap-2 text-slate-500">
                <span>Nenhum banco ativo foi encontrado para este lote.</span>
                <Link
                  href={`/bancos/novo${preservedQueryString}`}
                  className="inline-flex w-fit rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                >
                  Cadastrar banco
                </Link>
              </div>
            ) : (
              <div className="h-full flex items-center text-slate-500">
                Selecione um banco ativo para este lote.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setSelectedInstallmentIds(selectableInstallments.map((item) => item.id))
            }
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
          >
            Selecionar abertas
          </button>

          <button
            type="button"
            onClick={() => void handleAssignBank()}
            disabled={
              isSubmittingBank ||
              isIssuingBankSlips ||
              !selectedBankId ||
              !selectedInstallmentIds.length
            }
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-70"
          >
            {isSubmittingBank ? 'Processando...' : 'Preparar boletos'}
          </button>

          <button
            type="button"
            onClick={() => void handleIssueBankSlips()}
            disabled={
              isSubmittingBank ||
              isIssuingBankSlips ||
              !selectedBankId ||
              !selectedInstallmentIds.length
            }
            className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-70"
          >
            {isIssuingBankSlips ? 'Emitindo...' : 'Emitir boletos'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
          <span>{selectedInstallmentIds.length} parcela(s) selecionada(s)</span>
          <button
            type="button"
            onClick={() => setSelectedInstallmentIds([])}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-50"
          >
            Limpar seleção
          </button>
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <form onSubmit={handleSubmitFilters} className="grid gap-4 xl:grid-cols-[1.5fr_0.8fr_auto_auto]">
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            className={inputClass}
            placeholder="PESQUISAR POR REFERENTE, PAGADOR OU DESCRIÇÃO"
          />
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as InstallmentFilters['status'],
              }))
            }
            className={inputClass}
          >
            <option value="ALL">TODAS</option>
            <option value="OPEN">ABERTAS</option>
            <option value="OVERDUE">VENCIDAS</option>
            <option value="PAID">FECHADAS</option>
          </select>
          <button
            type="submit"
            className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
          >
            Limpar
          </button>
        </form>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            Parcelas do lote
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {isLoadingInstallments
              ? 'Carregando...'
              : `${installments.length} parcela(s) encontrada(s)`}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Selecionar</th>
                <th className="px-4 py-3">Referente</th>
                <th className="px-4 py-3">Pagador</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Banco</th>
                <th className="px-4 py-3">Situação</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((item) => {
                const isSelected = selectedInstallmentIds.includes(item.id);
                const currentValue = item.status === 'PAID' ? item.paidAmount : item.openAmount;
                const isSelectable = canSelectInstallment(item);

                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isSelectable}
                        onChange={(event) => {
                          if (!isSelectable) return;
                          setSelectedInstallmentIds((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((installmentId) => installmentId !== item.id),
                          );
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-900">{item.sourceEntityName}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        PARCELA {item.installmentNumber}/{item.installmentCount}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{item.payerNameSnapshot}</td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-700">{item.description}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {item.classLabel || 'SEM TURMA'}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">
                      {formatDateLabel(item.dueDate)}
                    </td>
                    <td className="px-4 py-4 font-black text-slate-900">
                      {formatCurrency(currentValue)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-700">
                        {item.bankAccountLabel || 'NÃO DEFINIDO'}
                      </div>
                      {item.bankSlipStatus === 'ISSUED' ? (
                        <div className="mt-2 space-y-2">
                          <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                            BOLETO EMITIDO
                          </div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            NOSSO NÚMERO {item.bankSlipOurNumber || '---'}
                          </div>
                          {item.bankSlipDigitableLine ? (
                            <div className="text-[11px] font-semibold text-slate-500">
                              {item.bankSlipDigitableLine}
                            </div>
                          ) : null}
                          {item.hasBankSlipPdf ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenBankSlipPdf(item.id)}
                              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                            >
                              Ver boleto
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {item.bankSlipStatus === 'ERROR' ? (
                        <div className="mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-600">
                          {item.bankSlipMessage || 'ERRO NA EMISSÃO'}
                        </div>
                      ) : null}
                      {item.settlementMethod ? (
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {item.settlementMethod}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getInstallmentStatusTone(item)}`}
                      >
                        {getInstallmentStatusLabel(item)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {!isLoadingInstallments && !installments.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
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
