'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
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
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

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
  bankSlipSummary?: {
    status: 'WAITING_PREPARATION' | 'READY_TO_SEND' | 'SENT_TO_BANK' | 'PARTIAL_OR_ERROR';
    totalCount: number;
    waitingCount: number;
    preparedCount: number;
    issuedCount: number;
    errorCount: number;
  };
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
  bankSlipStatus:
    | 'ALL'
    | 'WAITING_PREPARATION'
    | 'READY_TO_SEND'
    | 'SENT_TO_BANK'
    | 'ERROR'
    | 'WITHOUT_PREPARATION'
    | 'PREPARATION_DONE';
};

type PrepareBankSlipsPopup = 'missing-selection' | 'missing-bank' | 'confirm' | null;
type ReverseBankPreparationPopup = 'missing-selection' | 'confirm' | null;
type ExcludePaidInstallmentsPopup = 'confirm' | null;

type InstallmentBankSlipPdfPayload = {
  contentType: string;
  fileName: string;
  base64: string;
};

type EmissionBankSlipPdfItem = {
  installmentId: string;
  fileName: string;
  blobUrl: string;
  sourceEntityName: string;
  payerNameSnapshot: string;
  installmentNumber: number;
  installmentCount: number;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_LOTES_DETALHE';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_LOTES_PARCELAS';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const DEFAULT_FILTERS: InstallmentFilters = {
  search: '',
  status: 'ALL',
  bankSlipStatus: 'ALL',
};
const PREPARE_BANK_SLIPS_TOOLTIP_TEXT =
  'Essa Opção apenas prepara os boletos para serem enviados, grava pra qual banco vai ser enviado, faz consistências etc, MAS AINDA NÃO ENVIA PRO BANCO';
const EXCLUDE_PAID_INSTALLMENT_TOOLTIP_TEXT =
  'A exclusão será apenas do lote, pois a parcela já se encontra fechada. A parcela continuará existindo no Financeiro.';
const PREPARE_BANK_SLIPS_POPUP_SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_LOTES_PREPARAR_BOLETOS';
const REVERSE_BANK_PREPARATION_POPUP_SCREEN_ID =
  'FINANCEIRO_RECEBIVEIS_LOTES_ESTORNAR_PREPARACAO_BOLETOS';
const EXCLUDE_PAID_INSTALLMENTS_POPUP_SCREEN_ID =
  'FINANCEIRO_RECEBIVEIS_LOTES_EXCLUIR_PARCELAS_PAGAS';
const EMIT_BANK_SLIPS_POPUP_SCREEN_ID =
  'FINANCEIRO_RECEBIVEIS_LOTES_EMITIR_BOLETOS';

const bankSlipStatusFilterOptions: Array<{
  value: InstallmentFilters['bankSlipStatus'];
  label: string;
}> = [
  { value: 'ALL', label: 'TODOS STATUS' },
  { value: 'WAITING_PREPARATION', label: 'AGUARDANDO PREPARAÇÃO' },
  { value: 'READY_TO_SEND', label: 'AGUARDANDO GRAVAR NO BANCO' },
  { value: 'SENT_TO_BANK', label: 'ENVIADO AO BANCO' },
  { value: 'ERROR', label: 'COM ERRO' },
  { value: 'WITHOUT_PREPARATION', label: 'SEM PREPARAÇÃO' },
  { value: 'PREPARATION_DONE', label: 'PREPARAÇÃO CONCLUÍDA' },
];

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

function canReversePreparedInstallment(installment: InstallmentItem) {
  return (
    installment.status === 'OPEN' &&
    Number(installment.openAmount || 0) > 0 &&
    Boolean(installment.bankAccountId) &&
    installment.bankSlipStatus !== 'ISSUED' &&
    installment.bankSlipStatus !== 'ERROR'
  );
}

function canExcludePaidInstallmentFromBatch(installment: InstallmentItem) {
  return (
    installment.status === 'PAID' &&
    !installment.bankAccountId &&
    !installment.bankSlipStatus
  );
}

function canEmitBankSlipPdf(installment: InstallmentItem) {
  return (
    String(installment.bankSlipStatus || '').trim().toUpperCase() === 'ISSUED' &&
    Boolean(installment.hasBankSlipPdf)
  );
}

function canSelectGridInstallment(installment: InstallmentItem) {
  return canSelectInstallment(installment) || canEmitBankSlipPdf(installment);
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

function getInstallmentBankSlipStatusLabel(item: InstallmentItem) {
  const bankSlipStatus = String(item.bankSlipStatus || '').trim().toUpperCase();

  if (bankSlipStatus === 'ISSUED') return 'ENVIADO AO BANCO';
  if (bankSlipStatus === 'ERROR') return 'COM ERRO';

  if (item.status === 'PAID') {
    return item.bankAccountId ? 'PREPARAÇÃO CONCLUÍDA' : 'SEM PREPARAÇÃO';
  }

  if (item.bankAccountId) return 'AGUARDANDO GRAVAR NO BANCO';

  return 'AGUARDANDO PREPARAÇÃO';
}

function getInstallmentBankSlipStatusFilterValue(
  item: InstallmentItem,
): InstallmentFilters['bankSlipStatus'] {
  const bankSlipStatus = String(item.bankSlipStatus || '').trim().toUpperCase();

  if (bankSlipStatus === 'ISSUED') return 'SENT_TO_BANK';
  if (bankSlipStatus === 'ERROR') return 'ERROR';

  if (item.status === 'PAID') {
    return item.bankAccountId ? 'PREPARATION_DONE' : 'WITHOUT_PREPARATION';
  }

  if (item.bankAccountId) return 'READY_TO_SEND';

  return 'WAITING_PREPARATION';
}

function getBankSlipStatusFilterLabel(status: InstallmentFilters['bankSlipStatus']) {
  return (
    bankSlipStatusFilterOptions.find((option) => option.value === status)?.label ||
    'TODOS STATUS'
  );
}

function getInstallmentBankSlipStatusTone(item: InstallmentItem) {
  const bankSlipStatus = String(item.bankSlipStatus || '').trim().toUpperCase();

  if (bankSlipStatus === 'ISSUED') {
    return 'border-emerald-300 bg-emerald-100 text-emerald-900';
  }

  if (bankSlipStatus === 'ERROR') {
    return 'border-rose-300 bg-rose-100 text-rose-800';
  }

  if (item.status === 'PAID') {
    return 'border-slate-300 bg-slate-100 text-slate-700';
  }

  if (item.bankAccountId) {
    return 'border-[#F54627] bg-[#F54627] text-white';
  }

  return 'border-yellow-200 bg-yellow-50 text-yellow-800';
}

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

type BatchDetailAuditParams = {
  batchId: string;
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  companyName?: string | null;
  filters: InstallmentFilters;
  displayedRowsCount: number;
  selectedRowsCount: number;
};

function buildBatchDetailAuditSql(params: BatchDetailAuditParams) {
  const search = params.filters.search.trim().toUpperCase();
  const status = String(params.filters.status || 'ALL').toUpperCase();
  const bankSlipStatusLabel = getBankSlipStatusFilterLabel(
    params.filters.bankSlipStatus,
  );

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :batchId = ${toSqlLiteral(params.batchId)}
-- :status = ${toSqlLiteral(status)}
-- :statusOperacionalBoleto = ${toSqlLiteral(bankSlipStatusLabel)}
-- :search = ${toSqlLiteral(search)}

SELECT RI.*
FROM receivable_installments RI
WHERE RI.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND RI.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND RI.batchId = ${toSqlLiteral(params.batchId)}
  AND (
    ${toSqlLiteral(status)} = 'ALL'
    OR (${toSqlLiteral(status)} = 'OPEN' AND RI.status <> 'PAID' AND RI.dueDate >= CURRENT_DATE)
    OR (${toSqlLiteral(status)} = 'OVERDUE' AND RI.status <> 'PAID' AND RI.dueDate < CURRENT_DATE)
    OR (${toSqlLiteral(status)} = 'PAID' AND RI.status = 'PAID')
  )
  AND (
    ${toSqlLiteral(search)} = ''
    OR UPPER(COALESCE(RI.sourceEntityName, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(RI.payerNameSnapshot, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(RI.description, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
  )
ORDER BY RI.dueDate ASC, RI.sourceEntityName ASC;`;
}

function buildBatchDetailAuditText(params: BatchDetailAuditParams) {
  const search = params.filters.search.trim().toUpperCase();
  const status = String(params.filters.status || 'ALL').toUpperCase();
  const bankSlipStatusLabel = getBankSlipStatusFilterLabel(
    params.filters.bankSlipStatus,
  );

  return `--- LOGICA DA TELA ---
Tela de detalhe do lote de recebiveis e suas parcelas.

TABELAS PRINCIPAIS:
- receivable_batches (RB) - lote financeiro
- receivable_installments (RI) - parcelas do lote
- banks (B) - contas bancarias usadas para boletos

RELACIONAMENTOS:
- receivable_installments.batchId = receivable_batches.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId, params.companyName)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- lote selecionado (:batchId): ${formatAuditValue(params.batchId)}
- status selecionado (:status): ${status}
- status operacional do boleto: ${bankSlipStatusLabel}
- busca digitada (:search): ${formatAuditValue(search)}
- parcelas exibidas apos os filtros: ${params.displayedRowsCount}
- parcelas selecionadas: ${params.selectedRowsCount}
- ordenacao atual: vencimento ASC, aluno/origem ASC

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- RI.sourceSystem, RI.sourceTenantId e RI.batchId isolam as parcelas do lote atual
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

export default function FinanceiroReceivableBatchDetailPage() {
  const params = useParams<{ batchId: string }>();
  const runtimeContext = useFinanceRuntimeContext();
  const isEmbedded = runtimeContext.embedded;
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
  const [isReversingBankPreparation, setIsReversingBankPreparation] =
    useState(false);
  const [isExcludingPaidInstallments, setIsExcludingPaidInstallments] =
    useState(false);
  const [isIssuingBankSlips, setIsIssuingBankSlips] = useState(false);
  const [isEmittingBankSlipPdfs, setIsEmittingBankSlipPdfs] = useState(false);
  const [emissionBankSlipPdfs, setEmissionBankSlipPdfs] = useState<
    EmissionBankSlipPdfItem[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [prepareBankSlipsPopup, setPrepareBankSlipsPopup] =
    useState<PrepareBankSlipsPopup>(null);
  const [reverseBankPreparationPopup, setReverseBankPreparationPopup] =
    useState<ReverseBankPreparationPopup>(null);
  const [excludePaidInstallmentsPopup, setExcludePaidInstallmentsPopup] =
    useState<ExcludePaidInstallmentsPopup>(null);
  const [excludePaidInstallmentTargetId, setExcludePaidInstallmentTargetId] =
    useState<string | null>(null);

  useEffect(() => {
    if (!isEmbedded) return;

    window.parent.postMessage(
      { type: 'MSINFOR_SCREEN_CONTEXT', screenId: EMBEDDED_SCREEN_ID },
      '*',
    );
  }, [isEmbedded]);

  useEffect(
    () => () => {
      emissionBankSlipPdfs.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    },
    [emissionBankSlipPdfs],
  );

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
  }, [batch, filters.search, filters.status, loadInstallments]);

  const displayedInstallments = useMemo(
    () =>
      filters.bankSlipStatus === 'ALL'
        ? installments
        : installments.filter(
            (item) =>
              getInstallmentBankSlipStatusFilterValue(item) ===
              filters.bankSlipStatus,
          ),
    [filters.bankSlipStatus, installments],
  );

  useEffect(() => {
    setSelectedInstallmentIds((current) =>
      current.filter((installmentId) =>
        displayedInstallments.some(
          (item) => item.id === installmentId && canSelectGridInstallment(item),
        ),
      ),
    );
  }, [displayedInstallments]);

  const selectableInstallments = useMemo(
    () => displayedInstallments.filter((item) => canSelectInstallment(item)),
    [displayedInstallments],
  );

  const selectedBank = useMemo(
    () => banks.find((bank) => bank.id === selectedBankId) || null,
    [banks, selectedBankId],
  );

  const selectedInstallments = useMemo(
    () => installments.filter((item) => selectedInstallmentIds.includes(item.id)),
    [installments, selectedInstallmentIds],
  );

  const selectedSelectableInstallments = useMemo(
    () => selectedInstallments.filter((item) => canSelectInstallment(item)),
    [selectedInstallments],
  );

  const reversiblePreparedInstallments = useMemo(
    () => displayedInstallments.filter((item) => canReversePreparedInstallment(item)),
    [displayedInstallments],
  );

  const selectedReversiblePreparedInstallments = useMemo(
    () => selectedInstallments.filter((item) => canReversePreparedInstallment(item)),
    [selectedInstallments],
  );

  const emittableBankSlipInstallments = useMemo(
    () => displayedInstallments.filter((item) => canEmitBankSlipPdf(item)),
    [displayedInstallments],
  );

  const selectedEmittableBankSlipInstallments = useMemo(
    () => selectedInstallments.filter((item) => canEmitBankSlipPdf(item)),
    [selectedInstallments],
  );

  const isBatchReadyToSend = batch?.bankSlipSummary?.status === 'READY_TO_SEND';

  const excludePaidInstallmentTarget = useMemo(
    () =>
      installments.find(
        (item) =>
          item.id === excludePaidInstallmentTargetId &&
          canExcludePaidInstallmentFromBatch(item),
      ) || null,
    [excludePaidInstallmentTargetId, installments],
  );

  const selectedBankSlipTotalAmount = useMemo(
    () =>
      selectedSelectableInstallments.reduce(
        (accumulator, item) =>
          accumulator + Number(item.status === 'PAID' ? item.paidAmount : item.openAmount || 0),
        0,
      ),
    [selectedSelectableInstallments],
  );

  const selectedReversibleBankSlipTotalAmount = useMemo(
    () =>
      selectedReversiblePreparedInstallments.reduce(
        (accumulator, item) =>
          accumulator + Number(item.status === 'PAID' ? item.paidAmount : item.openAmount || 0),
        0,
      ),
    [selectedReversiblePreparedInstallments],
  );

  const displayedBankSlipTotalAmount = useMemo(
    () =>
      displayedInstallments.reduce(
        (accumulator, item) =>
          accumulator + Number(item.status === 'PAID' ? item.paidAmount : item.openAmount || 0),
        0,
      ),
    [displayedInstallments],
  );

  const batchDetailAuditContext = useMemo(() => {
    const auditParams: BatchDetailAuditParams = {
      batchId,
      sourceSystem: batch?.sourceSystem || runtimeContext.sourceSystem,
      sourceTenantId: batch?.sourceTenantId || runtimeContext.sourceTenantId,
      companyName: batch?.companyName,
      filters,
      displayedRowsCount: displayedInstallments.length,
      selectedRowsCount: selectedInstallmentIds.length,
    };

    return {
      auditText: buildBatchDetailAuditText(auditParams),
      sqlText: buildBatchDetailAuditSql(auditParams),
    };
  }, [
    batch?.companyName,
    batch?.sourceSystem,
    batch?.sourceTenantId,
    batchId,
    displayedInstallments.length,
    filters,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    selectedInstallmentIds.length,
  ]);

  async function handleAssignBank() {
    if (!batch) return;

    const selectableInstallmentIds = selectedSelectableInstallments.map((item) => item.id);

    if (!selectedBankId) {
      setError('Selecione o banco que vai receber a emissão dos boletos.');
      return;
    }

    if (!selectableInstallmentIds.length) {
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
            requestedBy: runtimeContext.cashierUserId || undefined,
            sourceSystem: batch.sourceSystem,
            sourceTenantId: batch.sourceTenantId,
            bankAccountId: selectedBankId,
            installmentIds: selectableInstallmentIds,
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
      await loadBatchContext();
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

  async function handleReverseBankPreparation() {
    if (!batch) return;

    const reversibleInstallmentIds = selectedReversiblePreparedInstallments.map(
      (item) => item.id,
    );

    if (!reversibleInstallmentIds.length) {
      setError('Selecione ao menos uma parcela preparada para estornar.');
      return;
    }

    try {
      setIsReversingBankPreparation(true);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/receivables/batches/${batch.id}/reverse-bank-preparation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestedBy: runtimeContext.cashierUserId || undefined,
            sourceSystem: batch.sourceSystem,
            sourceTenantId: batch.sourceTenantId,
            installmentIds: reversibleInstallmentIds,
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.message || 'Não foi possível estornar a preparação dos boletos.',
        );
      }

      setStatusMessage(
        payload?.message || 'Preparação dos boletos estornada com sucesso.',
      );
      await loadInstallments(batch, filters);
      await loadBatchContext();
      setSelectedInstallmentIds([]);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível estornar a preparação dos boletos.',
        ),
      );
    } finally {
      setIsReversingBankPreparation(false);
    }
  }

  async function handleExcludePaidInstallmentsFromBatch() {
    if (!batch) return;

    if (!excludePaidInstallmentTarget) {
      setError('Somente parcelas fechadas sem preparação podem ser excluídas do lote.');
      return;
    }

    try {
      setIsExcludingPaidInstallments(true);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/receivables/batches/${batch.id}/exclude-installments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestedBy: runtimeContext.cashierUserId || undefined,
            sourceSystem: batch.sourceSystem,
            sourceTenantId: batch.sourceTenantId,
            installmentIds: [excludePaidInstallmentTarget.id],
          }),
        },
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.message || 'Não foi possível excluir as parcelas pagas do lote.',
        );
      }

      setStatusMessage(
        payload?.message || 'Parcelas pagas excluídas do lote com sucesso.',
      );
      await loadInstallments(batch, filters);
      await loadBatchContext();
      setSelectedInstallmentIds([]);
      setExcludePaidInstallmentTargetId(null);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível excluir as parcelas pagas do lote.',
        ),
      );
    } finally {
      setIsExcludingPaidInstallments(false);
    }
  }

  async function handleIssueBankSlips() {
    if (!batch) return;

    const selectableInstallmentIds = selectedSelectableInstallments.map((item) => item.id);

    if (!selectedBankId) {
      setError('Selecione o banco que vai emitir os boletos.');
      return;
    }

    if (!selectableInstallmentIds.length) {
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
            requestedBy: runtimeContext.cashierUserId || undefined,
            sourceSystem: batch.sourceSystem,
            sourceTenantId: batch.sourceTenantId,
            bankAccountId: selectedBankId,
            installmentIds: selectableInstallmentIds,
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
      await loadBatchContext();
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

  async function loadBankSlipPdfPayload(installmentId: string) {
    if (!batch) {
      throw new Error('Lote financeiro inválido.');
    }

    return getJson<InstallmentBankSlipPdfPayload>(
      `/receivables/installments/${installmentId}/bank-slip-pdf${buildFinanceApiQueryString(runtimeContext, {
        sourceSystem: batch.sourceSystem,
        sourceTenantId: batch.sourceTenantId,
      })}`,
    );
  }

  function buildBankSlipPdfBlobUrl(payload: InstallmentBankSlipPdfPayload) {
    const binary = window.atob(payload.base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([bytes], {
      type: payload.contentType || 'application/pdf',
    });

    return URL.createObjectURL(blob);
  }

  async function handleOpenBankSlipPdf(installmentId: string) {
    if (!batch) return;

    try {
      setError(null);
      const payload = await loadBankSlipPdfPayload(installmentId);
      const blobUrl = buildBankSlipPdfBlobUrl(payload);
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

  async function handleEmitSelectedBankSlipPdfs() {
    if (!batch) return;

    if (!selectedEmittableBankSlipInstallments.length) {
      setError('Selecione ao menos um boleto já gravado no banco para emitir.');
      return;
    }

    try {
      setIsEmittingBankSlipPdfs(true);
      setError(null);
      setStatusMessage(null);

      const loadedPdfs: EmissionBankSlipPdfItem[] = [];

      for (const installment of selectedEmittableBankSlipInstallments) {
        const payload = await loadBankSlipPdfPayload(installment.id);
        loadedPdfs.push({
          installmentId: installment.id,
          fileName: payload.fileName,
          blobUrl: buildBankSlipPdfBlobUrl(payload),
          sourceEntityName: installment.sourceEntityName,
          payerNameSnapshot: installment.payerNameSnapshot,
          installmentNumber: installment.installmentNumber,
          installmentCount: installment.installmentCount,
        });
      }

      setEmissionBankSlipPdfs(loadedPdfs);

      setStatusMessage(
        loadedPdfs.length === 1
          ? '1 boleto aberto para emissão.'
          : `${loadedPdfs.length} boletos abertos para emissão.`,
      );
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível emitir os boletos selecionados.',
        ),
      );
    } finally {
      setIsEmittingBankSlipPdfs(false);
    }
  }

  function handleCloseEmissionBankSlipPdfs() {
    emissionBankSlipPdfs.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    setEmissionBankSlipPdfs([]);
  }

  function handlePrepareBankSlipsClick() {
    if (!selectedSelectableInstallments.length) {
      setPrepareBankSlipsPopup('missing-selection');
      return;
    }

    if (!selectedBankId) {
      setPrepareBankSlipsPopup('missing-bank');
      return;
    }

    setPrepareBankSlipsPopup('confirm');
  }

  function handleReverseBankPreparationClick() {
    if (!selectedReversiblePreparedInstallments.length) {
      setReverseBankPreparationPopup('missing-selection');
      return;
    }

    setReverseBankPreparationPopup('confirm');
  }

  function handleExcludePaidInstallmentsClick(installmentId: string) {
    const targetInstallment = installments.find(
      (item) =>
        item.id === installmentId &&
        canExcludePaidInstallmentFromBatch(item),
    );

    if (!targetInstallment) {
      setError('Somente parcelas fechadas sem preparação podem ser excluídas do lote.');
      return;
    }

    setExcludePaidInstallmentTargetId(targetInstallment.id);
    setExcludePaidInstallmentsPopup('confirm');
  }

  async function handleConfirmPrepareBankSlips() {
    setPrepareBankSlipsPopup(null);
    await handleAssignBank();
  }

  async function handleConfirmReverseBankPreparation() {
    setReverseBankPreparationPopup(null);
    await handleReverseBankPreparation();
  }

  async function handleConfirmExcludePaidInstallments() {
    setExcludePaidInstallmentsPopup(null);
    await handleExcludePaidInstallmentsFromBatch();
  }

  function handleCloseExcludePaidInstallmentsPopup() {
    setExcludePaidInstallmentsPopup(null);
    setExcludePaidInstallmentTargetId(null);
  }

  const totalAmount = getBatchTotalAmount(batch);
  const pageClassName = isEmbedded
    ? 'flex min-h-[calc(100vh-0.75rem)] flex-col gap-3 overflow-hidden'
    : 'space-y-6';
  const compactSectionPaddingClass = isEmbedded ? 'p-3' : 'p-5 lg:p-6';
  const compactInputClass = isEmbedded
    ? 'w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white'
    : inputClass;
  const bankGridClassName = isEmbedded
    ? 'grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]'
    : 'grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]';
  const selectedBankPanelClassName = isEmbedded
    ? 'rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600'
    : 'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600';
  const actionBarClassName = isEmbedded
    ? 'mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 xl:flex-row xl:items-center xl:justify-between'
    : 'mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 xl:flex-row xl:items-center xl:justify-between';
  const actionSummaryClassName = isEmbedded
    ? 'text-[10px] font-black uppercase tracking-[0.12em] text-slate-500'
    : 'text-xs font-black uppercase tracking-[0.16em] text-slate-500';
  const secondaryActionButtonClassName = isEmbedded
    ? 'inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600 transition hover:bg-slate-50'
    : 'inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50';
  const prepareActionButtonClassName = isEmbedded
    ? 'inline-flex min-h-9 items-center justify-center rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-70'
    : 'inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-70';
  const reverseActionButtonClassName = isEmbedded
    ? 'inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-600 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-amber-600/20 transition hover:bg-amber-700 disabled:opacity-70'
    : 'inline-flex min-h-12 items-center justify-center rounded-2xl bg-amber-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-amber-600/25 transition hover:bg-amber-700 disabled:opacity-70';
  const issueActionButtonClassName = isEmbedded
    ? 'inline-flex min-h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-70'
    : 'inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-70';
  const emitBankSlipButtonClassName = isEmbedded
    ? 'inline-flex min-h-9 items-center justify-center rounded-xl bg-sky-700 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-sky-700/20 transition hover:bg-sky-800 disabled:opacity-70'
    : 'inline-flex min-h-12 items-center justify-center rounded-2xl bg-sky-700 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-sky-700/25 transition hover:bg-sky-800 disabled:opacity-70';
  const filterGridClassName = isEmbedded
    ? 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(150px,0.24fr)_minmax(210px,0.34fr)]'
    : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.3fr)_minmax(240px,0.38fr)]';
  const installmentsSectionClassName = `${cardClass} ${
    isEmbedded ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'overflow-hidden'
  }`;
  const installmentsHeaderClassName = isEmbedded
    ? 'border-b border-slate-100 px-4 py-3'
    : 'border-b border-slate-100 px-6 py-5';
  const installmentsEyebrowClassName = isEmbedded
    ? 'text-[10px] font-black uppercase tracking-[0.14em] text-slate-500'
    : 'text-[11px] font-black uppercase tracking-[0.22em] text-slate-500';
  const installmentsTitleClassName = isEmbedded
    ? 'mt-0.5 text-base font-black text-slate-900'
    : 'mt-1 text-xl font-black text-slate-900';
  const gridWrapperClassName = isEmbedded
    ? 'min-h-0 flex-1 overflow-auto'
    : 'max-h-[520px] overflow-auto';
  const tableClassName = isEmbedded
    ? 'min-w-full text-left text-xs text-slate-600'
    : 'min-w-full text-left text-sm text-slate-600';
  const tableHeadClassName = isEmbedded
    ? 'sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500'
    : 'sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500';
  const headCellClassName = isEmbedded ? 'px-3 py-2' : 'px-4 py-3';
  const bodyCellClassName = isEmbedded ? 'px-3 py-2 align-middle' : 'px-4 py-4';
  const entityNameClassName = isEmbedded
    ? 'max-w-44 truncate font-black text-slate-900'
    : 'font-black text-slate-900';
  const payerNameClassName = isEmbedded
    ? 'max-w-56 truncate font-semibold text-slate-700'
    : 'font-semibold text-slate-700';
  const descriptionClassName = isEmbedded
    ? 'max-w-64 truncate font-semibold text-slate-700'
    : 'font-semibold text-slate-700';
  const bankLabelClassName = isEmbedded
    ? 'max-w-56 truncate font-semibold text-slate-700'
    : 'font-semibold text-slate-700';
  const subInfoClassName = isEmbedded
    ? 'mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400'
    : 'mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400';
  const bankSlipDetailsClassName = isEmbedded
    ? 'mt-1 flex items-center gap-1 overflow-hidden whitespace-nowrap'
    : 'mt-2 space-y-2';
  const issuedPillClassName = isEmbedded
    ? 'inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700'
    : 'inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700';
  const bankSlipMetaClassName = isEmbedded
    ? 'max-w-24 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500'
    : 'text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500';
  const bankSlipLineClassName = isEmbedded
    ? 'sr-only'
    : 'text-[11px] font-semibold text-slate-500';
  const bankSlipButtonClassName = isEmbedded
    ? 'rounded-lg border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-blue-700 transition hover:bg-blue-100'
    : 'rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100';
  const gridExcludePaidButtonClassName = isEmbedded
    ? 'inline-flex min-h-7 items-center justify-center whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-70'
    : 'inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-70';
  const statusPillClassName = isEmbedded
    ? 'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em]'
    : 'inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]';
  const bankSlipStatusPillClassName = isEmbedded
    ? 'inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em]'
    : 'inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em]';
  const totalsFooterClassName = isEmbedded
    ? 'sticky bottom-0 z-20 border-t border-slate-100 bg-white px-4 py-2 shadow-[0_-8px_18px_rgba(15,23,42,0.05)]'
    : 'sticky bottom-0 z-20 border-t border-slate-100 bg-white px-6 py-3 shadow-[0_-8px_18px_rgba(15,23,42,0.05)]';
  const totalCardClassName = isEmbedded
    ? 'rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 sm:min-w-44'
    : 'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 sm:min-w-56';
  const totalValueCardClassName = isEmbedded
    ? 'rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 sm:min-w-52'
    : 'rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 sm:min-w-64';
  const totalLabelClassName = isEmbedded
    ? 'text-[10px] font-black uppercase tracking-[0.1em] text-slate-500'
    : 'text-[11px] font-black uppercase tracking-[0.18em] text-slate-500';
  const totalBlueLabelClassName = isEmbedded
    ? 'text-[10px] font-black uppercase tracking-[0.1em] text-blue-700'
    : 'text-[11px] font-black uppercase tracking-[0.18em] text-blue-700';
  const totalValueClassName = isEmbedded
    ? 'mt-0.5 text-sm font-black text-slate-900'
    : 'mt-1 text-base font-black text-slate-900';
  const totalBlueValueClassName = isEmbedded
    ? 'mt-0.5 text-sm font-black text-blue-950'
    : 'mt-1 text-base font-black text-blue-950';

  return (
    <div className={pageClassName}>
      {!isEmbedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                  Contas a receber
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight">
                  Detalhe do lote
                </h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
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
            <ScreenNameCopy
              screenId={SCREEN_ID}
              className="justify-end"
              auditText={batchDetailAuditContext.auditText}
              sqlText={batchDetailAuditContext.sqlText}
            />
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

      {!isEmbedded ? (
        <section className={`${cardClass} p-5 lg:p-6`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
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
      ) : null}

      <section className={`${cardClass} ${compactSectionPaddingClass}`}>
        <div className={bankGridClassName}>
          <select
            value={selectedBankId}
            onChange={(event) => setSelectedBankId(event.target.value)}
            className={compactInputClass}
            disabled={isLoadingBatch || !batch}
          >
            <option value="">SELECIONE O BANCO DE EMISSÃO</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {buildBankLabel(bank)}
              </option>
            ))}
          </select>

          <div className={selectedBankPanelClassName}>
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
              <div className="flex h-full items-center text-slate-500">
                Selecione um banco ativo para este lote.
              </div>
            )}
          </div>
        </div>

        <div className={actionBarClassName}>
          <div className={actionSummaryClassName}>
            {selectedInstallmentIds.length} parcela(s) selecionada(s)
          </div>
          <div className={isEmbedded ? 'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end' : 'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end'}>
            <button
              type="button"
              onClick={() =>
                setSelectedInstallmentIds(
                  (isBatchReadyToSend
                    ? reversiblePreparedInstallments
                    : selectableInstallments
                  ).map((item) => item.id),
                )
              }
              className={secondaryActionButtonClassName}
            >
              {isBatchReadyToSend ? 'Selecionar preparadas' : 'Selecionar abertas'}
            </button>

            {emittableBankSlipInstallments.length ? (
              <button
                type="button"
                onClick={() =>
                  setSelectedInstallmentIds(
                    emittableBankSlipInstallments.map((item) => item.id),
                  )
                }
                className={secondaryActionButtonClassName}
              >
                Selecionar gravados
              </button>
            ) : null}

            {isBatchReadyToSend ? (
              <button
                type="button"
                onClick={handleReverseBankPreparationClick}
                disabled={
                  isSubmittingBank ||
                  isReversingBankPreparation ||
                  isExcludingPaidInstallments ||
                  isIssuingBankSlips ||
                  isEmittingBankSlipPdfs
                }
                className={reverseActionButtonClassName}
              >
                {isReversingBankPreparation
                  ? 'Estornando...'
                  : 'Estornar preparação'}
              </button>
            ) : (
              <span className="inline-flex" title={PREPARE_BANK_SLIPS_TOOLTIP_TEXT}>
                <button
                  type="button"
                  onClick={handlePrepareBankSlipsClick}
                  disabled={
                    isSubmittingBank ||
                    isReversingBankPreparation ||
                    isExcludingPaidInstallments ||
                    isIssuingBankSlips ||
                    isEmittingBankSlipPdfs
                  }
                  className={prepareActionButtonClassName}
                >
                  {isSubmittingBank ? 'Processando...' : 'Preparar boletos'}
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={() => void handleIssueBankSlips()}
              disabled={
                isSubmittingBank ||
                isReversingBankPreparation ||
                isExcludingPaidInstallments ||
                isIssuingBankSlips ||
                isEmittingBankSlipPdfs ||
                !selectedBankId ||
                !selectedSelectableInstallments.length
              }
              className={issueActionButtonClassName}
            >
              {isIssuingBankSlips ? 'Gravando...' : 'Gravar boletos no banco'}
            </button>

            {emittableBankSlipInstallments.length ? (
              <button
                type="button"
                onClick={() => void handleEmitSelectedBankSlipPdfs()}
                disabled={
                  isSubmittingBank ||
                  isReversingBankPreparation ||
                  isExcludingPaidInstallments ||
                  isIssuingBankSlips ||
                  isEmittingBankSlipPdfs ||
                  !selectedEmittableBankSlipInstallments.length
                }
                className={emitBankSlipButtonClassName}
              >
                {isEmittingBankSlipPdfs ? 'Emitindo...' : 'Emitir boletos'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setSelectedInstallmentIds([])}
              className={secondaryActionButtonClassName}
            >
              Limpar seleção
            </button>
          </div>
        </div>
      </section>

      <section className={`${cardClass} ${compactSectionPaddingClass}`}>
        <div className={filterGridClassName}>
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            className={compactInputClass}
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
            className={compactInputClass}
          >
            <option value="ALL">TODAS</option>
            <option value="OPEN">ABERTAS</option>
            <option value="OVERDUE">VENCIDAS</option>
            <option value="PAID">FECHADAS</option>
          </select>
          <select
            value={filters.bankSlipStatus}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                bankSlipStatus: event.target
                  .value as InstallmentFilters['bankSlipStatus'],
              }))
            }
            className={compactInputClass}
            aria-label="Filtrar por status operacional do boleto"
          >
            {bankSlipStatusFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={installmentsSectionClassName}>
        <div className={installmentsHeaderClassName}>
          <div className={installmentsEyebrowClassName}>
            Parcelas do lote
          </div>
          <h2 className={installmentsTitleClassName}>
            {isLoadingInstallments
              ? 'Carregando...'
              : `${displayedInstallments.length} parcela(s) encontrada(s)`}
          </h2>
        </div>

        <div className={gridWrapperClassName}>
          <table className={tableClassName}>
            <thead className={tableHeadClassName}>
              <tr>
                <th className={headCellClassName}>Selecionar</th>
                <th className={headCellClassName}>Referente</th>
                <th className={headCellClassName}>Pagador</th>
                <th className={headCellClassName}>Descrição</th>
                <th className={headCellClassName}>Vencimento</th>
                <th className={headCellClassName}>Valor</th>
                <th className={headCellClassName}>Banco</th>
                <th className={headCellClassName}>Situação</th>
                <th className={headCellClassName}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {displayedInstallments.map((item) => {
                const isSelected = selectedInstallmentIds.includes(item.id);
                const currentValue = item.status === 'PAID' ? item.paidAmount : item.openAmount;
                const isSelectable = canSelectGridInstallment(item);
                const canExcludeFromBatch = canExcludePaidInstallmentFromBatch(item);

                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className={bodyCellClassName}>
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
                        className={isEmbedded ? 'h-3.5 w-3.5 rounded border-slate-300' : 'h-4 w-4 rounded border-slate-300'}
                      />
                    </td>
                    <td className={bodyCellClassName}>
                      <div className={entityNameClassName}>{item.sourceEntityName}</div>
                      <div className="mt-1">
                        <span
                          className={`${bankSlipStatusPillClassName} ${getInstallmentBankSlipStatusTone(item)}`}
                        >
                          {getInstallmentBankSlipStatusLabel(item)}
                        </span>
                      </div>
                      <div className={subInfoClassName}>
                        PARCELA {item.installmentNumber}/{item.installmentCount}
                      </div>
                    </td>
                    <td className={bodyCellClassName}>
                      <div className={payerNameClassName}>{item.payerNameSnapshot}</div>
                    </td>
                    <td className={bodyCellClassName}>
                      <div className={descriptionClassName}>{item.description}</div>
                      <div className={subInfoClassName}>
                        {item.classLabel || 'SEM TURMA'}
                      </div>
                    </td>
                    <td className={`${bodyCellClassName} font-semibold text-slate-700`}>
                      {formatDateLabel(item.dueDate)}
                    </td>
                    <td className={`${bodyCellClassName} font-black text-slate-900`}>
                      {formatCurrency(currentValue)}
                    </td>
                    <td className={bodyCellClassName}>
                      <div className={bankLabelClassName}>
                        {item.bankAccountLabel || 'NÃO DEFINIDO'}
                      </div>
                      {item.bankSlipStatus === 'ISSUED' ? (
                        <div className={bankSlipDetailsClassName}>
                          <div className={issuedPillClassName}>
                            {isEmbedded ? 'BOLETO' : 'BOLETO EMITIDO'}
                          </div>
                          <div className={bankSlipMetaClassName}>
                            {isEmbedded ? `Nº ${item.bankSlipOurNumber || '---'}` : `NOSSO NÚMERO ${item.bankSlipOurNumber || '---'}`}
                          </div>
                          {item.bankSlipDigitableLine ? (
                            <div className={bankSlipLineClassName}>
                              {item.bankSlipDigitableLine}
                            </div>
                          ) : null}
                          {item.hasBankSlipPdf ? (
                            <button
                              type="button"
                              onClick={() => void handleOpenBankSlipPdf(item.id)}
                              className={bankSlipButtonClassName}
                            >
                              Ver boleto
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {item.bankSlipStatus === 'ERROR' ? (
                        <div className={isEmbedded ? 'mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-rose-600' : 'mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-600'}>
                          {item.bankSlipMessage || 'ERRO NA EMISSÃO'}
                        </div>
                      ) : null}
                      {item.settlementMethod ? (
                        <div className={subInfoClassName}>
                          {item.settlementMethod}
                        </div>
                      ) : null}
                    </td>
                    <td className={bodyCellClassName}>
                      <span
                        className={`${statusPillClassName} ${getInstallmentStatusTone(item)}`}
                      >
                        {getInstallmentStatusLabel(item)}
                      </span>
                    </td>
                    <td className={bodyCellClassName}>
                      {canExcludeFromBatch ? (
                        <button
                          type="button"
                          title={EXCLUDE_PAID_INSTALLMENT_TOOLTIP_TEXT}
                          onClick={() => handleExcludePaidInstallmentsClick(item.id)}
                          disabled={
                            isSubmittingBank ||
                            isReversingBankPreparation ||
                            isExcludingPaidInstallments ||
                            isIssuingBankSlips ||
                            isEmittingBankSlipPdfs
                          }
                          className={gridExcludePaidButtonClassName}
                        >
                          Excluir do lote
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}

              {!isLoadingInstallments && !displayedInstallments.length ? (
                <tr>
                  <td colSpan={9} className={isEmbedded ? 'px-3 py-8 text-center text-xs font-semibold text-slate-500' : 'px-4 py-10 text-center text-sm font-semibold text-slate-500'}>
                    Nenhuma parcela foi localizada para o filtro informado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className={totalsFooterClassName}>
          <div className={isEmbedded ? 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end'}>
            <div className={totalCardClassName}>
              <div className={totalLabelClassName}>
                Quantidade de boletos
              </div>
              <div className={totalValueClassName}>
                {isLoadingInstallments ? 'Carregando...' : displayedInstallments.length}
              </div>
            </div>
            <div className={totalValueCardClassName}>
              <div className={totalBlueLabelClassName}>
                Valor total dos boletos
              </div>
              <div className={totalBlueValueClassName}>
                {isLoadingInstallments
                  ? 'Carregando...'
                  : formatCurrency(displayedBankSlipTotalAmount)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {emissionBankSlipPdfs.length ? (
        <style>
          {`
            @media print {
              body * {
                visibility: hidden !important;
              }

              .bank-slip-print-area,
              .bank-slip-print-area * {
                visibility: visible !important;
              }

              .bank-slip-print-area {
                position: fixed !important;
                inset: 0 !important;
                z-index: 99999 !important;
                overflow: visible !important;
                background: #ffffff !important;
              }

              .bank-slip-print-header {
                display: none !important;
              }

              .bank-slip-print-card {
                margin: 0 !important;
                border: 0 !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                break-after: page;
                page-break-after: always;
              }

              .bank-slip-print-card:last-child {
                break-after: auto;
                page-break-after: auto;
              }

              .bank-slip-pdf-object,
              .bank-slip-pdf-object iframe {
                height: 100vh !important;
              }
            }
          `}
        </style>
      ) : null}

      <AuditedPopupShell
        isOpen={emissionBankSlipPdfs.length > 0}
        screenId={EMIT_BANK_SLIPS_POPUP_SCREEN_ID}
        title="Emitir boletos"
        eyebrow="Boletos gravados"
        description="Confira os boletos selecionados e use a impressão quando estiver tudo certo."
        brandingName={runtimeContext.companyName || batch?.companyName || 'Financeiro'}
        logoUrl={runtimeContext.logoUrl}
        onClose={handleCloseEmissionBankSlipPdfs}
        panelClassName="max-w-6xl"
        bodyClassName="max-h-[76vh] overflow-auto"
        screenCopyWrapperClassName="hidden"
        footerActions={
          <>
            <button
              type="button"
              onClick={handleCloseEmissionBankSlipPdfs}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-sky-700 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-sky-700/25 transition hover:bg-sky-800"
            >
              Imprimir boletos
            </button>
          </>
        }
      >
        <div className="bank-slip-print-area space-y-4">
          {emissionBankSlipPdfs.map((item, index) => (
            <section
              key={item.installmentId}
              className="bank-slip-print-card overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="bank-slip-print-header flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black uppercase text-slate-900">
                    {item.sourceEntityName}
                  </div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    PARCELA {item.installmentNumber}/{item.installmentCount} | {item.payerNameSnapshot}
                  </div>
                </div>
                <a
                  href={item.blobUrl}
                  download={item.fileName}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700 transition hover:bg-blue-100"
                >
                  Baixar PDF
                </a>
              </div>
              <object
                data={item.blobUrl}
                type="application/pdf"
                className="bank-slip-pdf-object block h-[68vh] w-full border-0"
              >
                <iframe
                  src={item.blobUrl}
                  title={`Boleto ${index + 1}`}
                  className="h-[68vh] w-full border-0"
                />
              </object>
            </section>
          ))}
        </div>
      </AuditedPopupShell>

      <AuditedPopupShell
        isOpen={prepareBankSlipsPopup !== null}
        screenId={PREPARE_BANK_SLIPS_POPUP_SCREEN_ID}
        title={
          prepareBankSlipsPopup === 'confirm'
            ? 'Confirmar preparação'
            : 'Atenção'
        }
        eyebrow="Preparar boletos"
        description={
          prepareBankSlipsPopup === 'confirm'
            ? 'Confirme se os boletos selecionados devem ser preparados para envio ao banco.'
            : 'Não foi possível continuar com a preparação dos boletos.'
        }
        brandingName={runtimeContext.companyName || batch?.companyName || 'Financeiro'}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => setPrepareBankSlipsPopup(null)}
        panelClassName="max-w-2xl"
        screenCopyWrapperClassName="hidden"
        footerActions={
          prepareBankSlipsPopup === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={() => setPrepareBankSlipsPopup(null)}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPrepareBankSlips()}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
              >
                Confirmar preparação
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPrepareBankSlipsPopup(null)}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
            >
              Entendi
            </button>
          )
        }
      >
        {prepareBankSlipsPopup === 'missing-selection' ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold leading-6 text-rose-700">
            Selecione pelo menos um boleto no grid antes de clicar em Preparar boletos.
          </div>
        ) : null}

        {prepareBankSlipsPopup === 'missing-bank' ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold leading-6 text-rose-700">
            Selecione o banco de emissão antes de preparar os boletos.
          </div>
        ) : null}

        {prepareBankSlipsPopup === 'confirm' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-semibold leading-6 text-blue-900">
              Essa opção apenas prepara os boletos para serem enviados, grava para qual banco vai ser enviado e faz consistências. Ainda não envia para o banco.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Boletos selecionados
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {selectedInstallments.length}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Valor total selecionado
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {formatCurrency(selectedBankSlipTotalAmount)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Banco de envio
              </div>
              <div className="mt-2 text-sm font-black text-slate-900">
                {selectedBank ? buildBankLabel(selectedBank) : 'BANCO NÃO SELECIONADO'}
              </div>
            </div>
          </div>
        ) : null}
      </AuditedPopupShell>

      <AuditedPopupShell
        isOpen={reverseBankPreparationPopup !== null}
        screenId={REVERSE_BANK_PREPARATION_POPUP_SCREEN_ID}
        title={
          reverseBankPreparationPopup === 'confirm'
            ? 'Confirmar estorno'
            : 'Atenção'
        }
        eyebrow="Estornar preparação"
        description={
          reverseBankPreparationPopup === 'confirm'
            ? 'Confirme se a preparação dos boletos selecionados deve ser estornada.'
            : 'Não foi possível continuar com o estorno da preparação.'
        }
        brandingName={runtimeContext.companyName || batch?.companyName || 'Financeiro'}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => setReverseBankPreparationPopup(null)}
        panelClassName="max-w-2xl"
        screenCopyWrapperClassName="hidden"
        footerActions={
          reverseBankPreparationPopup === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={() => setReverseBankPreparationPopup(null)}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmReverseBankPreparation()}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-amber-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-amber-600/25 transition hover:bg-amber-700"
              >
                Confirmar estorno
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setReverseBankPreparationPopup(null)}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
            >
              Entendi
            </button>
          )
        }
      >
        {reverseBankPreparationPopup === 'missing-selection' ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold leading-6 text-rose-700">
            Selecione pelo menos um boleto preparado no grid antes de clicar em Estornar preparação.
          </div>
        ) : null}

        {reverseBankPreparationPopup === 'confirm' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-900">
              O estorno remove o banco gravado na preparação e volta os boletos selecionados para aguardarem preparação. Boletos já emitidos não são estornados por essa opção.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Preparações selecionadas
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {selectedReversiblePreparedInstallments.length}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Valor selecionado
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {formatCurrency(selectedReversibleBankSlipTotalAmount)}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </AuditedPopupShell>

      <AuditedPopupShell
        isOpen={excludePaidInstallmentsPopup !== null}
        screenId={EXCLUDE_PAID_INSTALLMENTS_POPUP_SCREEN_ID}
        title={
          excludePaidInstallmentsPopup === 'confirm'
            ? 'Confirmar exclusão'
            : 'Atenção'
        }
        eyebrow="Excluir do lote"
        description={
          excludePaidInstallmentsPopup === 'confirm'
            ? 'Confirme se esta parcela fechada deve sair deste lote.'
            : ''
        }
        brandingName={runtimeContext.companyName || batch?.companyName || 'Financeiro'}
        logoUrl={runtimeContext.logoUrl}
        onClose={handleCloseExcludePaidInstallmentsPopup}
        panelClassName="max-w-2xl"
        screenCopyWrapperClassName="hidden"
        footerActions={
          excludePaidInstallmentsPopup === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={handleCloseExcludePaidInstallmentsPopup}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmExcludePaidInstallments()}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700"
              >
                Confirmar exclusão
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleCloseExcludePaidInstallmentsPopup}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
            >
              Entendi
            </button>
          )
        }
      >
        {excludePaidInstallmentsPopup === 'confirm' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-semibold leading-6 text-rose-900">
              Confirma excluir esta parcela do lote? Ela continuará existindo no Financeiro, mas deixará de aparecer neste lote para preparação ou envio de boletos.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Parcela fechada
                </div>
                <div className="mt-2 text-sm font-black text-slate-900">
                  {excludePaidInstallmentTarget?.sourceEntityName || 'PARCELA NÃO LOCALIZADA'}
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  {excludePaidInstallmentTarget?.payerNameSnapshot || '---'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Valor fechado
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900">
                  {formatCurrency(
                    Number(
                      excludePaidInstallmentTarget?.paidAmount ||
                        excludePaidInstallmentTarget?.amount ||
                        0,
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </AuditedPopupShell>
    </div>
  );
}
