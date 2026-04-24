'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import { formatCurrency, formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildFinanceApiQueryString, buildFinanceNavigationQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type ManualPaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CHECK';

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
  suggestedDiscountAmount?: number;
  suggestedInterestAmount?: number;
  suggestedPenaltyAmount?: number;
  suggestedReceivedAmount?: number;
  overdueDays?: number;
  interestDays?: number;
  interestRate?: number;
  status: string;
  settlementMethod?: string | null;
  settledAt?: string | null;
  isOverdue: boolean;
};

type SettlementResponse = {
  message?: string | null;
};

type AlertState = {
  type: 'success' | 'warning' | 'error';
  title: string;
  message: string;
};

type CompletionState = {
  title: string;
  message: string;
  settledCount: number;
  paymentMethodLabel: string;
  originalAmount: number;
  discountAmount: number;
  additionAmount: number;
  finalAmount: number;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL';
const COMPLETION_SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_SUCESSO';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

const PAYMENT_METHOD_OPTIONS: Array<{
  value: ManualPaymentMethod;
  label: string;
  helper: string;
}> = [
  { value: 'CASH', label: 'DINHEIRO', helper: 'Entrada imediata no caixa físico.' },
  { value: 'PIX', label: 'PIX', helper: 'Recebimento instantâneo via chave ou QR Code.' },
  { value: 'CREDIT_CARD', label: 'CARTÃO CRÉDITO', helper: 'Recebimento por operadora de crédito.' },
  { value: 'DEBIT_CARD', label: 'CARTÃO DÉBITO', helper: 'Recebimento por operadora de débito.' },
  { value: 'CHECK', label: 'CHEQUE', helper: 'Recebimento registrado como cheque.' },
];

function readSelectedInstallmentIds() {
  if (typeof window === 'undefined') return [];

  const searchParams = new URLSearchParams(window.location.search);
  return Array.from(
    new Set(
      (searchParams.get('installmentIds') || '')
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

function resolveSchoolBaseUrl() {
  if (typeof document === 'undefined' || !document.referrer) {
    return null;
  }

  try {
    const referrerUrl = new URL(document.referrer);
    return referrerUrl.origin;
  } catch {
    return null;
  }
}

function readCompanyLogoUrl() {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search);
  const value = String(searchParams.get('companyLogoUrl') || '').trim();
  return value || null;
}

function readIsModalMode() {
  if (typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('modal') === '1';
}

function parseMoneyInput(value: string) {
  const normalized = String(value || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  if (!normalized) return 0;

  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatMoneyInput(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function distributeAmountByOpenAmount(
  installments: InstallmentItem[],
  totalAmount: number,
) {
  if (!installments.length) return new Map<string, number>();

  const normalizedTotalAmount = roundMoney(totalAmount);
  if (normalizedTotalAmount <= 0) {
    return new Map(installments.map((installment) => [installment.id, 0]));
  }

  const totalOpenAmount = roundMoney(
    installments.reduce((sum, installment) => sum + Number(installment.openAmount || 0), 0),
  );

  if (totalOpenAmount <= 0) {
    return new Map(installments.map((installment) => [installment.id, 0]));
  }

  const distribution = new Map<string, number>();
  let allocatedAmount = 0;

  installments.forEach((installment, index) => {
    if (index === installments.length - 1) {
      distribution.set(installment.id, roundMoney(normalizedTotalAmount - allocatedAmount));
      return;
    }

    const share = roundMoney(
      normalizedTotalAmount * (Number(installment.openAmount || 0) / totalOpenAmount),
    );
    distribution.set(installment.id, share);
    allocatedAmount = roundMoney(allocatedAmount + share);
  });

  return distribution;
}

export default function FinanceiroManualSettlementPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [installmentIds, setInstallmentIds] = useState<string[]>([]);
  const [installments, setInstallments] = useState<InstallmentItem[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<ManualPaymentMethod>('CASH');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [schoolBaseUrl, setSchoolBaseUrl] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [isModalMode, setIsModalMode] = useState(false);
  const [discountAmountInput, setDiscountAmountInput] = useState('0,00');
  const [manualInterestAmountInput, setManualInterestAmountInput] = useState('0,00');
  const [completionState, setCompletionState] = useState<CompletionState | null>(null);

  useEffect(() => {
    setInstallmentIds(readSelectedInstallmentIds());
    setSchoolBaseUrl(resolveSchoolBaseUrl());
    setCompanyLogoUrl(readCompanyLogoUrl());
    setIsModalMode(readIsModalMode());
  }, []);

  useEffect(() => {
    async function loadInstallments() {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !installmentIds.length) {
        setInstallments([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setAlert(null);

        const payload = await requestJson<InstallmentItem[]>(
          `/receivables/installments${buildFinanceApiQueryString(runtimeContext, {
            status: 'ALL',
          })}`,
          {
            fallbackMessage: 'Não foi possível carregar as parcelas selecionadas.',
          },
        );

        const selectedIdSet = new Set(installmentIds);
        const selectedInstallments = (Array.isArray(payload) ? payload : []).filter((item) =>
          selectedIdSet.has(String(item.id || '').trim().toUpperCase()),
        );

        setInstallments(selectedInstallments);
        setCompletionState(null);

        if (!selectedInstallments.length) {
          setAlert({
            type: 'warning',
            title: 'Nenhuma parcela disponível',
            message: 'As parcelas selecionadas não foram localizadas no Financeiro para esta escola.',
          });
        }
      } catch (error) {
        setInstallments([]);
        setAlert({
          type: 'error',
          title: 'Erro ao carregar parcelas',
          message: getFriendlyRequestErrorMessage(
            error,
            'Não foi possível carregar as parcelas selecionadas.',
          ),
        });
      } finally {
        setIsLoading(false);
      }
    }

    void loadInstallments();
  }, [installmentIds, runtimeContext]);

  const selectedPaymentMethodOption =
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === selectedPaymentMethod) || PAYMENT_METHOD_OPTIONS[0];
  const calculatedInterestAmount = useMemo(
    () => installments.reduce((total, item) => total + Number(item.suggestedInterestAmount || 0), 0),
    [installments],
  );
  const totalOverdueDays = useMemo(
    () => installments.reduce((total, item) => total + Number(item.overdueDays || 0), 0),
    [installments],
  );
  const averageInterestRate = useMemo(() => {
    if (!installments.length) return 0;

    const totalRate = installments.reduce((total, item) => total + Number(item.interestRate || 0), 0);
    return totalRate / installments.length;
  }, [installments]);
  const selectedTotalAmount = useMemo(
    () => installments.reduce((total, item) => total + Number(item.openAmount || 0), 0),
    [installments],
  );
  const discountAmount = useMemo(
    () => parseMoneyInput(discountAmountInput),
    [discountAmountInput],
  );
  const manualInterestAmount = useMemo(
    () => parseMoneyInput(manualInterestAmountInput),
    [manualInterestAmountInput],
    );
  const finalReceivedAmount = useMemo(
    () => Math.max(0, selectedTotalAmount - discountAmount + manualInterestAmount),
    [discountAmount, manualInterestAmount, selectedTotalAmount],
  );
  const hasInterestOverride = Math.abs(manualInterestAmount - calculatedInterestAmount) > 0.009;
  const returnHref = useMemo(() => {
    if (!runtimeContext.embedded || !schoolBaseUrl) {
      return `/recebiveis/parcelas${buildFinanceNavigationQueryString(runtimeContext)}`;
    }

    return `${schoolBaseUrl}/principal/parcelas`;
  }, [runtimeContext, schoolBaseUrl]);

  useEffect(() => {
    setDiscountAmountInput(formatMoneyInput(0));
    setManualInterestAmountInput(formatMoneyInput(calculatedInterestAmount));
  }, [calculatedInterestAmount]);

  async function handleConfirmSettlement() {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !installments.length || isSubmitting) {
      return;
    }

    if (discountAmount > selectedTotalAmount + manualInterestAmount) {
      setAlert({
        type: 'warning',
        title: 'Desconto inválido',
        message: 'O desconto informado não pode deixar o valor final da baixa negativo.',
      });
      return;
    }

    const settlementAuditNote = hasInterestOverride
      ? `AUDITORIA JUROS | CALCULADO=${formatMoneyInput(calculatedInterestAmount)} | INFORMADO=${formatMoneyInput(manualInterestAmount)} | DESCONTO=${formatMoneyInput(discountAmount)}`
      : `AUDITORIA JUROS | CALCULADO=${formatMoneyInput(calculatedInterestAmount)} | INFORMADO=${formatMoneyInput(manualInterestAmount)} | DESCONTO=${formatMoneyInput(discountAmount)}`;
    const discountByInstallment = distributeAmountByOpenAmount(installments, discountAmount);
    const interestByInstallment = distributeAmountByOpenAmount(installments, manualInterestAmount);

    try {
      setIsSubmitting(true);
      setAlert(null);

      let successCount = 0;
      const failureMessages: string[] = [];

      for (const installment of installments) {
        try {
          const installmentDiscountAmount = discountByInstallment.get(installment.id) ?? 0;
          const installmentInterestAmount = interestByInstallment.get(installment.id) ?? 0;

          const payload = await requestJson<SettlementResponse>(
            `/receivables/installments/${installment.id}/settle-manual`,
            {
              method: 'POST',
              body: JSON.stringify({
                sourceSystem: runtimeContext.sourceSystem,
                sourceTenantId: runtimeContext.sourceTenantId,
                cashierUserId: runtimeContext.cashierUserId || undefined,
                cashierDisplayName: runtimeContext.cashierDisplayName || undefined,
                paymentMethod: selectedPaymentMethod,
                discountAmount: installmentDiscountAmount,
                interestAmount: installmentInterestAmount,
                notes: `${settlementAuditNote} | PARCELA_DESCONTO=${formatMoneyInput(installmentDiscountAmount)} | PARCELA_ACRESCIMO=${formatMoneyInput(installmentInterestAmount)}`,
              }),
              fallbackMessage: `Não foi possível baixar a parcela de ${installment.sourceEntityName}.`,
            },
          );

          successCount += 1;

          if (payload?.message && successCount === installments.length) {
            setAlert({
              type: 'success',
              title: 'Baixa realizada com sucesso',
              message: payload.message,
            });
          }
        } catch (error) {
          failureMessages.push(
            getFriendlyRequestErrorMessage(
              error,
              `Não foi possível baixar a parcela de ${installment.sourceEntityName}.`,
            ),
          );
        }
      }

      if (failureMessages.length === 0) {
        setInstallments([]);
        setCompletionState({
          title: 'Baixa realizada com sucesso',
          message: `${successCount} parcela(s) foram baixadas com ${selectedPaymentMethodOption.label}.`,
          settledCount: successCount,
          paymentMethodLabel: selectedPaymentMethodOption.label,
          originalAmount: selectedTotalAmount,
          discountAmount,
          additionAmount: manualInterestAmount,
          finalAmount: finalReceivedAmount,
        });
        return;
      }

      if (successCount > 0) {
        setAlert({
          type: 'warning',
          title: 'Baixa concluída parcialmente',
          message: `${successCount} parcela(s) foram baixadas. A primeira falha retornada foi: ${failureMessages[0]}`,
        });
        return;
      }

      setAlert({
        type: 'error',
        title: 'Nenhuma parcela foi baixada',
        message: failureMessages[0] || 'Não foi possível registrar a baixa das parcelas selecionadas.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    if (completionState && isModalMode && typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_REFRESH' }, '*');
      window.parent.postMessage({ type: 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_CLOSE' }, '*');
      return;
    }

    if (isModalMode && typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_CLOSE' }, '*');
      return;
    }

    if (typeof window !== 'undefined') {
      window.history.back();
    }
  }

  if (completionState) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <section className={`${cardClass} w-full max-w-3xl overflow-hidden`}>
          <div className="bg-gradient-to-br from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-8 text-white">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white shadow-xl">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={`Logo de ${runtimeContext.companyName || 'ESCOLA'}`}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-xl font-black uppercase tracking-[0.25em] text-[#153a6a]">
                    {String(runtimeContext.companyName || 'ESCOLA').slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-cyan-200">
                Recebimento confirmado
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight">{completionState.title}</h1>
              <p className="mt-3 max-w-2xl text-sm font-medium text-blue-100/90">
                {completionState.message}
              </p>
            </div>
          </div>

          <div className="px-6 py-8">
            <div className="mb-6 flex justify-end">
              <ScreenNameCopy screenId={COMPLETION_SCREEN_ID} className="justify-end" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5 text-center">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Valor original
                </div>
                <div className="mt-3 text-2xl font-black text-slate-900">
                  {formatCurrency(completionState.originalAmount)}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5 text-center">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Valor desconto
                </div>
                <div className="mt-3 text-2xl font-black text-slate-900">
                  {formatCurrency(completionState.discountAmount)}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5 text-center">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Valor acréscimo
                </div>
                <div className="mt-3 text-2xl font-black text-slate-900">
                  {formatCurrency(completionState.additionAmount)}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5 text-center">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Valor final
                </div>
                <div className="mt-3 text-2xl font-black text-slate-900">
                  {formatCurrency(completionState.finalAmount)}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
              >
                Retornar
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={`Logo de ${runtimeContext.companyName || 'ESCOLA'}`}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-lg font-black uppercase tracking-[0.25em] text-white">
                    {String(runtimeContext.companyName || 'ESCOLA').slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Contas a receber</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">Baixa manual</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Selecione a forma de recebimento para concluir a baixa das parcelas no core financeiro.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-50">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Operador</div>
              <div className="mt-1 text-base font-black">
                {runtimeContext.cashierDisplayName || 'USUÁRIO NÃO INFORMADO'}
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
        </div>
      </section>

      <section className={`${cardClass} p-6`}>
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Resumo</div>
              <h2 className="mt-1 text-xl font-black text-slate-900">
                {isLoading ? 'Carregando parcelas...' : `${installments.length} parcela(s) selecionada(s)`}
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor total</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(selectedTotalAmount)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Caixa em uso</div>
                  <div className="mt-2 text-sm font-black text-slate-900">
                    {runtimeContext.cashierDisplayName || runtimeContext.cashierUserId || 'CAIXA NÃO INFORMADO'}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Dias em atraso</div>
                    <div className="mt-2 text-base font-black text-slate-900">{totalOverdueDays}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">% juros</div>
                    <div className="mt-2 text-base font-black text-slate-900">
                      {averageInterestRate.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}%
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Juros calculado</div>
                  <input
                    value={formatMoneyInput(calculatedInterestAmount)}
                    readOnly
                    className="mt-2 w-full border-0 bg-transparent p-0 text-lg font-black text-slate-900 outline-none"
                  />
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    Valor automático conforme regra de juros do Financeiro.
                  </div>
                </label>
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Desconto</div>
                  <input
                    value={discountAmountInput}
                    onChange={(event) => setDiscountAmountInput(event.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="mt-2 w-full border-0 bg-transparent p-0 text-lg font-black text-slate-900 outline-none"
                  />
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    Informe o desconto manual que será aplicado na baixa.
                  </div>
                </label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Acréscimo</div>
                  <input
                    value={manualInterestAmountInput}
                    onChange={(event) => setManualInterestAmountInput(event.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="mt-2 w-full border-0 bg-transparent p-0 text-lg font-black text-slate-900 outline-none"
                  />
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    O campo já vem com o juros calculado. Se alterar, a divergência fica auditável.
                  </div>
                </label>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor final da baixa</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{formatCurrency(finalReceivedAmount)}</div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    Total com desconto e acréscimo aplicados.
                  </div>
                </div>
              </div>
              {hasInterestOverride ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
                  O acréscimo informado está diferente do juros calculado automaticamente. Essa diferença será registrada na auditoria da baixa.
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Forma de pagamento</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {PAYMENT_METHOD_OPTIONS.map((option) => {
                  const isSelected = option.value === selectedPaymentMethod;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedPaymentMethod(option.value)}
                      disabled={isSubmitting}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-[11px] font-black uppercase tracking-[0.18em]">{option.label}</div>
                      <div className="mt-2 text-xs font-semibold text-inherit">{option.helper}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </section>

      {alert ? (
        <section
          className={`${cardClass} px-6 py-5 text-sm font-semibold ${
            alert.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : alert.type === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          <div className="text-[11px] font-black uppercase tracking-[0.18em]">{alert.title}</div>
          <div className="mt-2">{alert.message}</div>
        </section>
      ) : null}

      <section className={`${cardClass} px-6 py-5`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-semibold text-slate-500">
            Forma selecionada: <span className="font-black text-slate-900">{selectedPaymentMethodOption.label}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={returnHref}
              target={runtimeContext.embedded && schoolBaseUrl && !isModalMode ? '_top' : undefined}
              onClick={(event) => {
                if (isModalMode) {
                  event.preventDefault();
                  handleClose();
                }
              }}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100"
            >
              Voltar
            </Link>
            <button
              type="button"
              onClick={() => void handleConfirmSettlement()}
              disabled={isLoading || !installments.length || isSubmitting}
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isSubmitting ? 'Processando...' : 'Confirmar baixa'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
