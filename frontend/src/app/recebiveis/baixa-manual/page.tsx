'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import { formatCurrency, formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildFinanceApiQueryString, buildFinanceNavigationQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';
import { authorizeSuperTefCardPayment } from '@/app/lib/supertef-payment';
import { createAndDispatchPrintJob } from '@/app/lib/local-print-agent';

type ManualPaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CHECK' | 'CUSTOMER_CREDIT';

type BankItem = {
  id: string;
  status: string;
  bankName: string;
  branchNumber: string;
  branchDigit?: string | null;
  accountNumber: string;
  accountDigit?: string | null;
  billingProvider?: string | null;
};

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
  status?: string | null;
  openAmount?: number;
  paidAmount?: number;
  receivedAmount?: number;
};

type CustomerCreditItem = {
  id: string;
  customerName: string;
  customerDocument?: string | null;
  status: string;
  originalAmount: number;
  availableAmount: number;
  createdAt: string;
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
  remainingAmount: number;
};

type SettlementPreviewState = {
  paymentMethodLabel: string;
  selectedCount: number;
  originalAmount: number;
  discountAmount: number;
  additionAmount: number;
  finalAmount: number;
  receivedAmount: number;
  remainingAmount: number;
  isPartial: boolean;
};

type SuperTefSettlementAuthorization = {
  paymentId: string;
  settlementGroupId: string;
  paymentMethod: 'CREDIT_CARD' | 'DEBIT_CARD';
  amount: number;
};

type ReceivablePixIntentState = {
  intentId: string;
  amount: number;
  pixCopyPaste: string;
  imageUrl: string;
  ourNumber?: string | null;
  settlementGroupId: string;
  bankMovementGroupId: string;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL';
const CONFIRMATION_SCREEN_ID = 'POPUP_FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_CONFIRMACAO';
const COMPLETION_SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_SUCESSO';
const PIX_QR_SCREEN_ID = 'POPUP_FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_PIX_SICOOB_QRCODE';
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
  { value: 'CUSTOMER_CREDIT', label: 'CRÉDITO CLIENTE', helper: 'Usa saldo de crédito já retido no caixa.' },
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
  const value = String(
    searchParams.get('companyLogoUrl') || searchParams.get('logoUrl') || '',
  ).trim();
  return value || null;
}

function readIsModalMode() {
  if (typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('modal') === '1';
}

function readInitialPartialSettlement() {
  if (typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('partial') === '1';
}

function readInitialPartialAmount() {
  if (typeof window === 'undefined') return null;

  const searchParams = new URLSearchParams(window.location.search);
  const rawValue = searchParams.get('partialAmount') || searchParams.get('settlementAmount') || '';
  const parsedValue = parseMoneyInput(rawValue);
  return parsedValue > 0 ? parsedValue : null;
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

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

function createBankMovementGroupId(paymentMethod: ManualPaymentMethod) {
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${paymentMethod}-${randomId}`.toUpperCase();
}

function createSettlementGroupId() {
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `BAIXA-${randomId}`.toUpperCase();
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

function sortInstallmentsBySettlementPriority(installments: InstallmentItem[]) {
  return [...installments].sort((left, right) => {
    const leftDueTime = new Date(left.dueDate).getTime();
    const rightDueTime = new Date(right.dueDate).getTime();

    if (leftDueTime !== rightDueTime) return leftDueTime - rightDueTime;
    if (left.installmentNumber !== right.installmentNumber) {
      return left.installmentNumber - right.installmentNumber;
    }

    return String(left.sourceEntityName || '').localeCompare(
      String(right.sourceEntityName || ''),
      'pt-BR',
    );
  });
}

function distributePartialReceivedAmount(
  installments: InstallmentItem[],
  totalAmount: number,
  interestByInstallment: Map<string, number>,
  penaltyByInstallment: Map<string, number>,
) {
  const distribution = new Map<
    string,
    { receivedAmount: number; interestAmount: number; penaltyAmount: number }
  >();
  let remainingAmount = roundMoney(totalAmount);

  for (const installment of sortInstallmentsBySettlementPriority(installments)) {
    const openAmount = roundMoney(Number(installment.openAmount || 0));
    const interestAmount = roundMoney(interestByInstallment.get(installment.id) ?? 0);
    const penaltyAmount = roundMoney(penaltyByInstallment.get(installment.id) ?? 0);
    const installmentDueAmount = roundMoney(openAmount + interestAmount + penaltyAmount);
    const allocatedAmount = roundMoney(Math.min(installmentDueAmount, remainingAmount));

    if (allocatedAmount <= 0) break;

    let appliedInterestAmount = 0;
    let appliedPenaltyAmount = 0;

    if (allocatedAmount >= installmentDueAmount) {
      appliedInterestAmount = interestAmount;
      appliedPenaltyAmount = penaltyAmount;
    } else if (allocatedAmount <= interestAmount) {
      appliedInterestAmount = allocatedAmount;
    } else {
      appliedInterestAmount = interestAmount;
      appliedPenaltyAmount = roundMoney(Math.min(penaltyAmount, allocatedAmount - appliedInterestAmount));
    }

    distribution.set(installment.id, {
      receivedAmount: allocatedAmount,
      interestAmount: appliedInterestAmount,
      penaltyAmount: appliedPenaltyAmount,
    });
    remainingAmount = roundMoney(remainingAmount - allocatedAmount);

    if (remainingAmount <= 0) break;
  }

  return distribution;
}

export default function FinanceiroManualSettlementPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [installmentIds, setInstallmentIds] = useState<string[]>([]);
  const [installments, setInstallments] = useState<InstallmentItem[]>([]);
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [customerCredits, setCustomerCredits] = useState<CustomerCreditItem[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedCustomerCreditId, setSelectedCustomerCreditId] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<ManualPaymentMethod>('CASH');
  const [superTefAuthorization, setSuperTefAuthorization] =
    useState<SuperTefSettlementAuthorization | null>(null);
  const [receivablePixIntent, setReceivablePixIntent] =
    useState<ReceivablePixIntentState | null>(null);
  const pixFinalizationRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [schoolBaseUrl, setSchoolBaseUrl] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [isModalMode, setIsModalMode] = useState(false);
  const [discountAmountInput, setDiscountAmountInput] = useState('0,00');
  const [manualInterestAmountInput, setManualInterestAmountInput] = useState('0,00');
  const [isPartialSettlement, setIsPartialSettlement] = useState(false);
  const [partialReceivedAmountInput, setPartialReceivedAmountInput] = useState('0,00');
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreviewState | null>(null);
  const [completionState, setCompletionState] = useState<CompletionState | null>(null);

  useEffect(() => {
    setInstallmentIds(readSelectedInstallmentIds());
    setSchoolBaseUrl(resolveSchoolBaseUrl());
    setCompanyLogoUrl(readCompanyLogoUrl());
    setIsModalMode(readIsModalMode());
    setIsPartialSettlement(readInitialPartialSettlement());

    const initialPartialAmount = readInitialPartialAmount();
    if (initialPartialAmount) {
      setPartialReceivedAmountInput(formatMoneyInput(initialPartialAmount));
    }
  }, []);

  useEffect(() => {
    async function loadInstallments() {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !installmentIds.length) {
        setInstallments([]);
        setBanks([]);
        setCustomerCredits([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setAlert(null);

        const [payload, loadedBanks, loadedCustomerCredits] = await Promise.all([
          requestJson<InstallmentItem[]>(
            `/receivables/installments${buildFinanceApiQueryString(runtimeContext, {
              status: 'ALL',
            })}`,
            {
              fallbackMessage: 'Não foi possível carregar as parcelas selecionadas.',
            },
          ),
          requestJson<BankItem[]>(
            `/banks${buildFinanceApiQueryString(runtimeContext, { status: 'ACTIVE' })}`,
            {
              fallbackMessage: 'Não foi possível carregar os bancos para baixa Pix.',
            },
          ),
          requestJson<CustomerCreditItem[]>(
            `/customer-credits${buildFinanceApiQueryString(runtimeContext, { status: 'OPEN' })}`,
            {
              fallbackMessage: 'Não foi possível carregar os créditos de clientes.',
            },
          ),
        ]);

        const selectedIdSet = new Set(installmentIds);
        const selectedInstallments = (Array.isArray(payload) ? payload : []).filter((item) =>
          selectedIdSet.has(String(item.id || '').trim().toUpperCase()),
        );
        const activeBanks = (Array.isArray(loadedBanks) ? loadedBanks : []).filter(
          (item) => String(item.status || '').trim().toUpperCase() === 'ACTIVE',
        );

        setInstallments(selectedInstallments);
        setBanks(activeBanks);
        setCustomerCredits(
          (Array.isArray(loadedCustomerCredits) ? loadedCustomerCredits : []).filter(
            (item) => Number(item.availableAmount || 0) > 0,
          ),
        );
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
        setBanks([]);
        setCustomerCredits([]);
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

  useEffect(() => {
    if (selectedPaymentMethod !== 'PIX') {
      setSelectedBankId('');
    }

    if (
      selectedBankId &&
      !banks.some(
        (bank) =>
          bank.id === selectedBankId &&
          String(bank.billingProvider || '').toUpperCase() === 'SICOOB',
      )
    ) {
      setSelectedBankId('');
    }
  }, [banks, selectedBankId, selectedPaymentMethod]);

  useEffect(() => {
    if (selectedPaymentMethod !== 'CUSTOMER_CREDIT') {
      setSelectedCustomerCreditId('');
      return;
    }

    if (
      selectedCustomerCreditId &&
      !customerCredits.some((credit) => credit.id === selectedCustomerCreditId)
    ) {
      setSelectedCustomerCreditId('');
    }
  }, [customerCredits, selectedCustomerCreditId, selectedPaymentMethod]);

  const selectedPaymentMethodOption =
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === selectedPaymentMethod) || PAYMENT_METHOD_OPTIONS[0];
  const selectedCustomerCredit = useMemo(
    () => customerCredits.find((credit) => credit.id === selectedCustomerCreditId) || null,
    [customerCredits, selectedCustomerCreditId],
  );
  const calculatedInterestAmount = useMemo(
    () => installments.reduce((total, item) => total + Number(item.suggestedInterestAmount || 0), 0),
    [installments],
  );
  const calculatedPenaltyAmount = useMemo(
    () => installments.reduce((total, item) => total + Number(item.suggestedPenaltyAmount || 0), 0),
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
    () => Math.max(0, selectedTotalAmount - discountAmount + manualInterestAmount + calculatedPenaltyAmount),
    [calculatedPenaltyAmount, discountAmount, manualInterestAmount, selectedTotalAmount],
  );
  const partialReceivedAmount = useMemo(
    () => parseMoneyInput(partialReceivedAmountInput),
    [partialReceivedAmountInput],
  );
  const effectiveReceivedAmount = isPartialSettlement ? partialReceivedAmount : finalReceivedAmount;
  const remainingAfterSettlement = useMemo(
    () => roundMoney(Math.max(0, finalReceivedAmount - effectiveReceivedAmount)),
    [effectiveReceivedAmount, finalReceivedAmount],
  );
  const hasInterestOverride = Math.abs(manualInterestAmount - calculatedInterestAmount) > 0.009;
  const returnHref = useMemo(() => {
    if (!runtimeContext.embedded || !schoolBaseUrl) {
      return `/recebiveis/parcelas${buildFinanceNavigationQueryString(runtimeContext)}`;
    }

    return `${schoolBaseUrl}/principal/parcelas`;
  }, [runtimeContext, schoolBaseUrl]);
  const isCompactModal = isModalMode;
  const pageSpacingClass = isCompactModal ? 'space-y-2' : 'space-y-6';
  const headerPaddingClass = isCompactModal ? 'px-4 py-3' : 'px-4 py-5';
  const logoBoxClass = isCompactModal
    ? 'h-12 w-12 rounded-2xl'
    : 'h-14 w-14 rounded-3xl';
  const sectionPaddingClass = isCompactModal ? 'p-3' : 'p-6';
  const innerCardPaddingClass = isCompactModal ? 'px-3 py-3' : 'px-5 py-5';
  const fieldCardPaddingClass = isCompactModal ? 'px-3 py-2' : 'px-4 py-4';
  const actionPaddingClass = isCompactModal ? 'px-4 py-3' : 'px-6 py-5';

  useEffect(() => {
    setDiscountAmountInput(formatMoneyInput(0));
    setManualInterestAmountInput(formatMoneyInput(calculatedInterestAmount));
  }, [calculatedInterestAmount]);

  useEffect(() => {
    if (!isPartialSettlement) {
      setPartialReceivedAmountInput(formatMoneyInput(finalReceivedAmount));
    }
  }, [finalReceivedAmount, isPartialSettlement]);

  async function handleConfirmSettlement() {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !installments.length || isSubmitting) {
      return;
    }

    if (discountAmount > selectedTotalAmount + manualInterestAmount + calculatedPenaltyAmount) {
      setAlert({
        type: 'warning',
        title: 'Desconto inválido',
        message: 'O desconto informado não pode deixar o valor final da baixa negativo.',
      });
      return;
    }

    if (isPartialSettlement && partialReceivedAmount <= 0) {
      setAlert({
        type: 'warning',
        title: 'Valor parcial inválido',
        message: 'Informe um valor recebido maior que zero para baixa parcial.',
      });
      return;
    }

    if (isPartialSettlement && partialReceivedAmount > finalReceivedAmount) {
      setAlert({
        type: 'warning',
        title: 'Valor parcial inválido',
        message: 'O valor recebido na baixa parcial não pode ser maior que o saldo aberto com juros/acréscimos.',
      });
      return;
    }

    if (selectedPaymentMethod === 'PIX' && !selectedBankId) {
      setAlert({
        type: 'warning',
        title: 'Banco do Pix obrigatório',
        message: 'Selecione o banco onde o Pix será creditado antes de confirmar a baixa.',
      });
      return;
    }

    if (selectedPaymentMethod === 'CUSTOMER_CREDIT' && !selectedCustomerCredit) {
      setAlert({
        type: 'warning',
        title: 'Crédito obrigatório',
        message: 'Selecione o crédito do cliente antes de confirmar a baixa.',
      });
      return;
    }

    if (
      selectedPaymentMethod === 'CUSTOMER_CREDIT' &&
      selectedCustomerCredit &&
      effectiveReceivedAmount > Number(selectedCustomerCredit.availableAmount || 0)
    ) {
      setAlert({
        type: 'warning',
        title: 'Saldo de crédito insuficiente',
        message: 'O valor da baixa não pode ser maior que o saldo disponível do crédito selecionado.',
      });
      return;
    }

    setAlert(null);
    setSettlementPreview({
      paymentMethodLabel: selectedPaymentMethodOption.label,
      selectedCount: installments.length,
      originalAmount: selectedTotalAmount,
      discountAmount: isPartialSettlement ? 0 : discountAmount,
      additionAmount: manualInterestAmount + calculatedPenaltyAmount,
      finalAmount: finalReceivedAmount,
      receivedAmount: effectiveReceivedAmount,
      remainingAmount: remainingAfterSettlement,
      isPartial: isPartialSettlement,
    });
  }

  async function executeConfirmedSettlement(confirmedPix?: {
    intentId: string;
    settlementGroupId: string;
    bankMovementGroupId: string;
  }) {
    if (
      !runtimeContext.sourceSystem ||
      !runtimeContext.sourceTenantId ||
      !installments.length ||
      !settlementPreview ||
      isSubmitting
    ) {
      return;
    }

    const settlementAuditNote = hasInterestOverride
      ? `AUDITORIA JUROS | CALCULADO=${formatMoneyInput(calculatedInterestAmount)} | INFORMADO=${formatMoneyInput(manualInterestAmount)} | MULTA=${formatMoneyInput(calculatedPenaltyAmount)} | DESCONTO=${formatMoneyInput(discountAmount)}`
      : `AUDITORIA JUROS | CALCULADO=${formatMoneyInput(calculatedInterestAmount)} | INFORMADO=${formatMoneyInput(manualInterestAmount)} | MULTA=${formatMoneyInput(calculatedPenaltyAmount)} | DESCONTO=${formatMoneyInput(discountAmount)}`;
    const orderedInstallments = sortInstallmentsBySettlementPriority(installments);
    const discountByInstallment = isPartialSettlement
      ? new Map(orderedInstallments.map((installment) => [installment.id, 0]))
      : distributeAmountByOpenAmount(orderedInstallments, discountAmount);
    const interestByInstallment = hasInterestOverride
      ? distributeAmountByOpenAmount(orderedInstallments, manualInterestAmount)
      : new Map(
          orderedInstallments.map((installment) => [
            installment.id,
            roundMoney(Number(installment.suggestedInterestAmount || 0)),
          ]),
        );
    const penaltyByInstallment = new Map(
      orderedInstallments.map((installment) => [
        installment.id,
        roundMoney(Number(installment.suggestedPenaltyAmount || 0)),
      ]),
    );
    const partialReceivedByInstallment = isPartialSettlement
      ? distributePartialReceivedAmount(
          orderedInstallments,
          partialReceivedAmount,
          interestByInstallment,
          penaltyByInstallment,
        )
      : new Map<string, { receivedAmount: number; interestAmount: number; penaltyAmount: number }>();
    const bankMovementGroupId = selectedPaymentMethod === 'PIX'
      ? confirmedPix?.bankMovementGroupId || createBankMovementGroupId(selectedPaymentMethod)
      : undefined;
    const reusableSuperTefAuthorization =
      superTefAuthorization &&
      superTefAuthorization.paymentMethod === selectedPaymentMethod &&
      Math.abs(superTefAuthorization.amount - effectiveReceivedAmount) <= 0.01
        ? superTefAuthorization
        : null;
    const settlementGroupId =
      confirmedPix?.settlementGroupId ||
      reusableSuperTefAuthorization?.settlementGroupId ||
      createSettlementGroupId();
    const receivedAt = new Date().toISOString();

    try {
      setIsSubmitting(true);
      setAlert(null);

      if (selectedPaymentMethod === 'PIX' && !confirmedPix) {
        const issuedPix = await requestJson<{
          intentId: string;
          amount: number;
          pixCopyPaste: string;
          ourNumber?: string | null;
        }>('/receivables/pix-intents', {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy: runtimeContext.cashierUserId || undefined,
            operationId: globalThis.crypto?.randomUUID?.() || `PIX-${Date.now()}`,
            settlementGroupId,
            bankAccountId: selectedBankId,
            installmentIds: orderedInstallments.map((item) => item.id),
            amount: effectiveReceivedAmount,
          }),
          fallbackMessage: 'O Sicoob não confirmou a emissão do PIX.',
        });
        const imageUrl = await QRCode.toDataURL(issuedPix.pixCopyPaste, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 280,
        });
        setReceivablePixIntent({
          ...issuedPix,
          imageUrl,
          settlementGroupId,
          bankMovementGroupId: bankMovementGroupId!,
        });
        return;
      }

      let superTefPaymentId =
        reusableSuperTefAuthorization?.paymentId || undefined;
      if (
        !superTefPaymentId &&
        (selectedPaymentMethod === 'CREDIT_CARD' ||
          selectedPaymentMethod === 'DEBIT_CARD')
      ) {
        const authorized = await authorizeSuperTefCardPayment({
          runtimeContext,
          paymentMethod: selectedPaymentMethod,
          amount: effectiveReceivedAmount,
          installmentCount: 1,
          purpose: 'RECEIVABLE',
          businessReference: settlementGroupId,
          description: 'RECEBIMENTO DE PARCELAS',
          onStatus: (message) =>
            setAlert({
              type: 'warning',
              title: 'Aguardando cartão no emulador',
              message,
            }),
        });
        superTefPaymentId = authorized.id;
        setSuperTefAuthorization({
          paymentId: authorized.id,
          settlementGroupId,
          paymentMethod: selectedPaymentMethod,
          amount: effectiveReceivedAmount,
        });
      }

      let successCount = 0;
      const failureMessages: string[] = [];

      for (const installment of orderedInstallments) {
        try {
          const installmentDiscountAmount = discountByInstallment.get(installment.id) ?? 0;
          const partialAllocation = partialReceivedByInstallment.get(installment.id);
          const installmentInterestAmount = isPartialSettlement
            ? partialAllocation?.interestAmount ?? 0
            : interestByInstallment.get(installment.id) ?? 0;
          const installmentPenaltyAmount = isPartialSettlement
            ? partialAllocation?.penaltyAmount ?? 0
            : penaltyByInstallment.get(installment.id) ?? 0;
          const installmentPartialReceivedAmount = partialAllocation?.receivedAmount ?? 0;

          if (isPartialSettlement && installmentPartialReceivedAmount <= 0) {
            continue;
          }

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
                settlementGroupId,
                bankAccountId: selectedPaymentMethod === 'PIX' ? selectedBankId : undefined,
                bankMovementGroupId,
                customerCreditId:
                  selectedPaymentMethod === 'CUSTOMER_CREDIT'
                    ? selectedCustomerCredit?.id
                    : undefined,
                superTefPaymentId,
                receivablePixIntentId:
                  selectedPaymentMethod === 'PIX' ? confirmedPix?.intentId : undefined,
                receivedAt,
                discountAmount: installmentDiscountAmount,
                interestAmount: installmentInterestAmount,
                penaltyAmount: installmentPenaltyAmount,
                receivedAmount: isPartialSettlement ? installmentPartialReceivedAmount : undefined,
                notes: `${settlementAuditNote} | TIPO_BAIXA=${isPartialSettlement ? 'PARCIAL' : 'TOTAL'} | PARCELA_DESCONTO=${formatMoneyInput(installmentDiscountAmount)} | PARCELA_ACRESCIMO=${formatMoneyInput(installmentInterestAmount + installmentPenaltyAmount)} | PARCELA_RECEBIDO=${formatMoneyInput(isPartialSettlement ? installmentPartialReceivedAmount : Number(installment.openAmount || 0) - installmentDiscountAmount + installmentInterestAmount + installmentPenaltyAmount)}${bankMovementGroupId ? ` | GRUPO_BANCO=${bankMovementGroupId}` : ''}`,
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
        void createAndDispatchPrintJob(
          `/printing/jobs/settlement-groups/${settlementGroupId}`,
          runtimeContext,
          `SETTLEMENT_RECEIPT:${settlementGroupId}`,
        ).catch((printError) => console.warn('Falha na impressão automática do recebimento:', printError));
        setSuperTefAuthorization(null);
        setInstallments([]);
        setSettlementPreview(null);
        setCompletionState({
          title: isPartialSettlement ? 'Baixa parcial realizada' : 'Baixa realizada com sucesso',
          message: isPartialSettlement
            ? `${successCount} parcela(s) receberam baixa parcial com ${selectedPaymentMethodOption.label}, priorizando o vencimento mais antigo. Valor restante: ${formatCurrency(remainingAfterSettlement)}.`
            : `${successCount} parcela(s) foram baixadas com ${selectedPaymentMethodOption.label}. Valor restante: ${formatCurrency(remainingAfterSettlement)}.`,
          settledCount: successCount,
          paymentMethodLabel: selectedPaymentMethodOption.label,
          originalAmount: selectedTotalAmount,
          discountAmount: isPartialSettlement ? 0 : discountAmount,
          additionAmount: isPartialSettlement
            ? Array.from(partialReceivedByInstallment.values()).reduce(
                (total, item) => total + item.interestAmount + item.penaltyAmount,
                0,
              )
            : manualInterestAmount + calculatedPenaltyAmount,
          finalAmount: effectiveReceivedAmount,
          remainingAmount: remainingAfterSettlement,
        });
        return;
      }

      if (successCount > 0) {
        setSettlementPreview(null);
        setAlert({
          type: 'warning',
          title: 'Baixa concluída parcialmente',
          message: `${successCount} parcela(s) foram baixadas. A primeira falha retornada foi: ${failureMessages[0]}`,
        });
        return;
      }

      setSettlementPreview(null);
      setAlert({
        type: 'error',
        title: 'Nenhuma parcela foi baixada',
        message: failureMessages[0] || 'Não foi possível registrar a baixa das parcelas selecionadas.',
      });
    } catch (error) {
      setAlert({
        type: 'error',
        title: selectedPaymentMethod === 'PIX' ? 'Erro no PIX' : 'Erro ao processar baixa',
        message: getFriendlyRequestErrorMessage(
          error,
          selectedPaymentMethod === 'PIX'
            ? 'Não foi possível emitir ou confirmar o PIX no Sicoob.'
            : 'Não foi possível processar a baixa.',
        ),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!receivablePixIntent) return;
    pixFinalizationRef.current = false;
    let disposed = false;

    const checkPayment = async () => {
      if (pixFinalizationRef.current) return;
      try {
        const result = await requestJson<{ paid: boolean }>(
          `/receivables/pix-intents/${receivablePixIntent.intentId}/status`,
          {
            method: 'POST',
            body: JSON.stringify({
              sourceSystem: runtimeContext.sourceSystem,
              sourceTenantId: runtimeContext.sourceTenantId,
              requestedBy: runtimeContext.cashierUserId || undefined,
            }),
          },
        );
        if (!result.paid || disposed) return;

        pixFinalizationRef.current = true;
        const confirmedPix = {
          intentId: receivablePixIntent.intentId,
          settlementGroupId: receivablePixIntent.settlementGroupId,
          bankMovementGroupId: receivablePixIntent.bankMovementGroupId,
        };
        setReceivablePixIntent(null);
        setAlert({
          type: 'success',
          title: 'PIX confirmado',
          message: 'Pagamento confirmado pelo Sicoob. Aplicando a baixa nas parcelas.',
        });
        await executeConfirmedSettlement(confirmedPix);
      } catch {
        // A cobrança permanece em consulta até confirmação, cancelamento ou fechamento.
      }
    };

    void checkPayment();
    const timer = window.setInterval(() => void checkPayment(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    receivablePixIntent,
    runtimeContext.cashierUserId,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
  ]);

  async function cancelReceivablePixPayment() {
    if (!receivablePixIntent || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await requestJson(
        `/receivables/pix-intents/${receivablePixIntent.intentId}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy: runtimeContext.cashierUserId || undefined,
          }),
        },
      );
      setReceivablePixIntent(null);
      setAlert({
        type: 'warning',
        title: 'PIX cancelado',
        message: 'A cobrança PIX foi cancelada e nenhuma parcela recebeu baixa.',
      });
    } catch (error) {
      setAlert({
        type: 'error',
        title: 'Erro ao cancelar PIX',
        message: getFriendlyRequestErrorMessage(
          error,
          'Não foi possível cancelar a cobrança PIX.',
        ),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancelSettlementConfirmation() {
    setSettlementPreview(null);
    setAlert({
      type: 'warning',
      title: 'Baixa não confirmada',
      message: 'A baixa não foi confirmada. Confira os valores e confirme novamente quando desejar.',
    });
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
          <div className="bg-gradient-to-br from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
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
              <h1 className="mt-3 text-2xl font-black tracking-tight">{completionState.title}</h1>
              <p className="mt-3 max-w-2xl text-sm font-medium text-blue-100/90">
                {completionState.message}
              </p>
            </div>
          </div>

          <div className="px-6 py-8">
            <div className="mb-6 flex justify-end">
              <ScreenNameCopy screenId={COMPLETION_SCREEN_ID} className="justify-end" />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
                  Valor restante
                </div>
                <div className="mt-3 text-2xl font-black text-emerald-800">
                  {formatCurrency(completionState.remainingAmount)}
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
    <div className={pageSpacingClass}>
      <section className={`${cardClass} overflow-hidden`}>
        <div className={`bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] text-white ${headerPaddingClass}`}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm ${logoBoxClass}`}>
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={`Logo de ${runtimeContext.companyName || 'ESCOLA'}`}
                    className="h-full w-full object-contain p-1.5"
                  />
                ) : (
                  <span className="text-lg font-black uppercase tracking-[0.25em] text-white">
                    {String(runtimeContext.companyName || 'ESCOLA').slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Contas a receber</div>
                <h1 className={`${isCompactModal ? 'mt-0.5 text-xl' : 'mt-1 text-2xl'} font-black tracking-tight`}>Baixa manual</h1>
                <p className={`${isCompactModal ? 'mt-0.5 text-xs' : 'mt-1 text-xs'} max-w-3xl font-medium text-blue-100/90`}>
                  Selecione a forma de recebimento para concluir a baixa das parcelas no core financeiro.
                </p>
              </div>
            </div>
            <div className={`${isCompactModal ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} rounded-2xl border border-white/15 bg-white/10 font-semibold text-blue-50`}>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">Operador</div>
              <div className={`${isCompactModal ? 'mt-0 text-sm' : 'mt-1 text-base'} font-black`}>
                {runtimeContext.cashierDisplayName || 'USUÁRIO NÃO INFORMADO'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${cardClass} ${sectionPaddingClass}`}>
        <div className="grid gap-3 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <div className={`rounded-3xl border border-slate-200 bg-slate-50 ${innerCardPaddingClass}`}>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Resumo</div>
              <h2 className={`${isCompactModal ? 'text-base' : 'text-xl'} mt-1 font-black text-slate-900`}>
                {isLoading ? 'Carregando parcelas...' : `${installments.length} parcela(s) selecionada(s)`}
              </h2>
              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <div className={`rounded-2xl border border-slate-200 bg-white ${fieldCardPaddingClass}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor total</div>
                  <div className="mt-1 text-base font-black text-slate-900">{formatCurrency(selectedTotalAmount)}</div>
                </div>
                <div className={`rounded-2xl border border-slate-200 bg-white ${fieldCardPaddingClass}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Caixa em uso</div>
                  <div className="mt-1 text-xs font-black text-slate-900">
                    {runtimeContext.cashierDisplayName || runtimeContext.cashierUserId || 'CAIXA NÃO INFORMADO'}
                  </div>
                </div>
                <div className={`rounded-2xl border border-slate-200 bg-white ${fieldCardPaddingClass}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Dias em atraso</div>
                  <div className="mt-1 text-base font-black text-slate-900">{totalOverdueDays}</div>
                </div>
                <div className={`rounded-2xl border border-slate-200 bg-white ${fieldCardPaddingClass}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">% juros</div>
                  <div className="mt-1 text-base font-black text-slate-900">
                    {averageInterestRate.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}%
                  </div>
                </div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className={`rounded-2xl border border-slate-200 bg-white ${fieldCardPaddingClass}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Juros calculado</div>
                  <input
                    value={formatMoneyInput(calculatedInterestAmount)}
                    readOnly
                    className="mt-1 w-full border-0 bg-transparent p-0 text-base font-black text-slate-900 outline-none"
                  />
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">
                    Valor automático conforme regra de juros do Financeiro.
                  </div>
                </label>
                <label className={`rounded-2xl border border-slate-200 bg-white ${fieldCardPaddingClass}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Desconto</div>
                  <input
                    value={discountAmountInput}
                    onChange={(event) => setDiscountAmountInput(event.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="mt-1 w-full border-0 bg-transparent p-0 text-base font-black text-slate-900 outline-none"
                  />
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">
                    Informe o desconto manual que será aplicado na baixa.
                  </div>
                </label>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className={`rounded-2xl border border-slate-200 bg-white ${fieldCardPaddingClass}`}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Acréscimo</div>
                  <input
                    value={manualInterestAmountInput}
                    onChange={(event) => setManualInterestAmountInput(event.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="mt-1 w-full border-0 bg-transparent p-0 text-base font-black text-slate-900 outline-none"
                  />
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">
                    O campo já vem com o juros calculado. Se alterar, a divergência fica auditável.
                  </div>
                </label>
                <div className={`rounded-2xl border border-slate-200 bg-white ${fieldCardPaddingClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor final da baixa</div>
                    <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">
                      <input
                        type="checkbox"
                        checked={isPartialSettlement}
                        onChange={(event) => {
                          setIsPartialSettlement(event.target.checked);
                          if (event.target.checked) {
                            setPartialReceivedAmountInput(formatMoneyInput(finalReceivedAmount));
                          }
                        }}
                        disabled={isSubmitting}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Parcial
                    </label>
                  </div>
                  <div className="mt-1 text-base font-black text-slate-900">{formatCurrency(finalReceivedAmount)}</div>
                  {isPartialSettlement ? (
                    <input
                      value={partialReceivedAmountInput}
                      onChange={(event) => setPartialReceivedAmountInput(event.target.value)}
                      disabled={isSubmitting}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="mt-1 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                    />
                  ) : null}
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">
                    {isPartialSettlement
                      ? 'Valor recebido será abatido do vencimento mais antigo primeiro.'
                      : 'Total com desconto e acréscimo aplicados.'}
                  </div>
                </div>
              </div>
              {hasInterestOverride ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-800">
                  O acréscimo informado está diferente do juros calculado automaticamente. Essa diferença será registrada na auditoria da baixa.
                </div>
              ) : null}
            </div>

            <div className={`rounded-3xl border border-slate-200 bg-white ${innerCardPaddingClass}`}>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Forma de pagamento</div>
              <div className="mt-2 grid gap-2 md:grid-cols-6">
                {PAYMENT_METHOD_OPTIONS.map((option) => {
                  const isSelected = option.value === selectedPaymentMethod;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSelectedPaymentMethod(option.value);
                        setSuperTefAuthorization(null);
                      }}
                      disabled={isSubmitting}
                      className={`rounded-2xl border px-3 py-2 text-left transition ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-[11px] font-black uppercase tracking-[0.18em]">{option.label}</div>
                      <div className="mt-1 text-[11px] font-semibold text-inherit">{option.helper}</div>
                    </button>
                  );
                })}
              </div>
              {selectedPaymentMethod === 'PIX' ? (
                <label className="mt-4 block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Banco de destino do Pix
                  </div>
                  <select
                    value={selectedBankId}
                    onChange={(event) => setSelectedBankId(event.target.value)}
                    disabled={isSubmitting}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500"
                  >
                    <option value="">SELECIONE O BANCO</option>
                    {banks
                      .filter((bank) => String(bank.billingProvider || '').toUpperCase() === 'SICOOB')
                      .map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {buildBankLabel(bank)}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    O QR Code será emitido pelo Sicoob e a baixa ocorrerá somente após a confirmação bancária.
                  </div>
                </label>
              ) : null}
              {selectedPaymentMethod === 'CUSTOMER_CREDIT' ? (
                <label className="mt-4 block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Crédito disponível
                  </div>
                  <select
                    value={selectedCustomerCreditId}
                    onChange={(event) => setSelectedCustomerCreditId(event.target.value)}
                    disabled={isSubmitting}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500"
                  >
                    <option value="">SELECIONE O CRÉDITO DO CLIENTE</option>
                    {customerCredits.map((credit) => (
                      <option key={credit.id} value={credit.id}>
                        {credit.customerName} - SALDO {formatCurrency(credit.availableAmount)}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    Ao confirmar, a parcela será baixada e uma saída compensatória será registrada no caixa.
                  </div>
                </label>
              ) : null}
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

      {receivablePixIntent ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section className={`${cardClass} w-full max-w-xl overflow-hidden`}>
            <div className="flex items-center gap-4 bg-gradient-to-r from-[#061c3f] via-[#082a59] to-[#0b3d7a] px-6 py-5 text-white">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-white">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={`Logo de ${runtimeContext.companyName || 'ESCOLA'}`}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-sm font-black uppercase tracking-[0.2em] text-[#153a6a]">
                    {String(runtimeContext.companyName || 'ESCOLA').slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">
                  PIX Sicoob
                </div>
                <h2 className="mt-1 text-xl font-black">Aguardando pagamento</h2>
                <p className="mt-1 text-xs font-semibold text-blue-100">
                  A baixa será realizada automaticamente após a confirmação bancária.
                </p>
              </div>
            </div>

            <div className="px-6 py-6 text-center">
              <div className="text-3xl font-black text-slate-950">
                {formatCurrency(receivablePixIntent.amount)}
              </div>
              <div className="mx-auto mt-5 flex w-fit rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                <img
                  src={receivablePixIntent.imageUrl}
                  alt="QR Code PIX Sicoob"
                  className="h-56 w-56"
                />
              </div>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(receivablePixIntent.pixCopyPaste)}
                className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
              >
                Copiar PIX copia e cola
              </button>
              {receivablePixIntent.ourNumber ? (
                <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  TXID: {receivablePixIntent.ourNumber}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => void cancelReceivablePixPayment()}
                disabled={isSubmitting}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
              >
                Cancelar PIX
              </button>
              <ScreenNameCopy
                screenId={PIX_QR_SCREEN_ID}
                className="justify-end"
                auditText="PIX de recebíveis emitido pelo Sicoob; baixa condicionada à confirmação bancária."
              />
            </div>
          </section>
        </div>
      ) : null}

      {settlementPreview ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section className={`${cardClass} w-full max-w-3xl overflow-hidden`}>
            <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={`Logo de ${runtimeContext.companyName || 'ESCOLA'}`}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-sm font-black uppercase tracking-[0.2em] text-[#153a6a]">
                    {String(runtimeContext.companyName || 'ESCOLA').slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Confirmação de baixa
                </div>
                <h2 className="mt-1 text-xl font-black text-slate-900">Confirmar baixa manual</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Confira os valores antes de gravar a baixa no contas a receber.
                </p>
              </div>
            </div>

            <div className="px-6 py-6">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Parcelas</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{settlementPreview.selectedCount}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Valor original</div>
                  <div className="mt-2 text-lg font-black text-slate-900">
                    {formatCurrency(settlementPreview.originalAmount)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Desconto</div>
                  <div className="mt-2 text-lg font-black text-slate-900">
                    {formatCurrency(settlementPreview.discountAmount)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Acréscimo</div>
                  <div className="mt-2 text-lg font-black text-slate-900">
                    {formatCurrency(settlementPreview.additionAmount)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Valor final</div>
                  <div className="mt-2 text-lg font-black text-slate-900">
                    {formatCurrency(settlementPreview.finalAmount)}
                  </div>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Valor da baixa</div>
                  <div className="mt-2 text-lg font-black text-blue-800">
                    {formatCurrency(settlementPreview.receivedAmount)}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Valor restante</div>
                  <div className="mt-2 text-lg font-black text-emerald-800">
                    {formatCurrency(settlementPreview.remainingAmount)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 md:col-span-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Forma</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{settlementPreview.paymentMethodLabel}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {settlementPreview.isPartial
                      ? 'Baixa parcial aplicada da parcela mais antiga para a mais nova.'
                      : 'Baixa total das parcelas selecionadas.'}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <ScreenNameCopy screenId={CONFIRMATION_SCREEN_ID} className="justify-end" />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-6 py-5">
              <button
                type="button"
                onClick={handleCancelSettlementConfirmation}
                disabled={isSubmitting}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Não confirmar
              </button>
              <button
                type="button"
                onClick={() => void executeConfirmedSettlement()}
                disabled={isSubmitting}
                className="rounded-2xl bg-blue-600 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {isSubmitting ? 'Processando...' : 'Confirmar baixa'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className={`${cardClass} ${actionPaddingClass}`}>
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
              disabled={
                isLoading ||
                !installments.length ||
                isSubmitting ||
                (selectedPaymentMethod === 'PIX' && !selectedBankId) ||
                (selectedPaymentMethod === 'CUSTOMER_CREDIT' && !selectedCustomerCreditId)
              }
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isSubmitting ? 'Processando...' : 'Confirmar baixa'}
            </button>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
      </div>
    </div>
  );
}
