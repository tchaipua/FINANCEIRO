'use client';

import Link from 'next/link';
import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
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

type BankStatementMovement = {
  id: string;
  occurredAt: string;
  description: string;
  detailLines?: string[];
  documentNumber?: string | null;
  movementType: string;
  amount: number;
  balanceAfter?: number | null;
  status?: string | null;
  reviewStatus?: string | null;
  isReviewed?: boolean;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

type BankStatementResponse = {
  provider: string;
  bankAccountId: string;
  bankAccountLabel: string;
  periodStart: string;
  periodEnd: string;
  currentBalance?: number | null;
  creditAmount: number;
  debitAmount: number;
  movementCount: number;
  pulledAt?: string | null;
  message?: string;
  movements: BankStatementMovement[];
};

type BankStatementReviewBulkResponse = {
  updatedCount: number;
  movements: BankStatementMovement[];
};

type StatementGridFilterKey =
  | 'date'
  | 'review'
  | 'description'
  | 'document'
  | 'type'
  | 'value'
  | 'status';

type StatementGridFilters = {
  dateFrom: string;
  dateTo: string;
  review: 'ALL' | 'REVIEWED' | 'NOT_REVIEWED';
  description: string;
  document: string;
  type: 'ALL' | 'CREDIT' | 'DEBIT';
  valueMin: string;
  valueMax: string;
  status: string;
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const filterInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500';
const DEFAULT_STATEMENT_GRID_FILTERS: StatementGridFilters = {
  dateFrom: '',
  dateTo: '',
  review: 'ALL',
  description: '',
  document: '',
  type: 'ALL',
  valueMin: '',
  valueMax: '',
  status: '',
};
const STATEMENT_GRID_FILTER_KEYS: StatementGridFilterKey[] = [
  'date',
  'review',
  'description',
  'document',
  'type',
  'value',
  'status',
];

function getDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthStartDateInput() {
  const now = new Date();
  return getDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
}

function getTodayDateInput() {
  return getDateInput(new Date());
}

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

function readBankIdFromUrl() {
  if (typeof window === 'undefined') return '';

  return String(new URLSearchParams(window.location.search).get('bankId') || '').trim();
}

function normalizeMovementType(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function getMovementTypeLabel(value?: string | null) {
  const normalized = normalizeMovementType(value);

  if (normalized === 'CREDIT') return 'Crédito';
  if (normalized === 'DEBIT') return 'Débito';

  return normalized ? normalized.replace(/_/g, ' ') : '---';
}

function getMovementTypeTone(value?: string | null) {
  return normalizeMovementType(value) === 'DEBIT'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getMovementStatusTone(value?: string | null) {
  switch (String(value || '').trim().toUpperCase()) {
    case 'CONCILIADO':
    case 'CONCILED':
    case 'RECONCILED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'PENDENTE':
    case 'PENDING':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700';
  }
}

function normalizeFilterText(value?: string | number | null) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function getStatementDateInput(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized.length >= 10 ? normalized.slice(0, 10) : '';
}

function parseMoneyFilter(value: string) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValueInsideMoneyRange(value: number | null, minInput: string, maxInput: string) {
  const min = parseMoneyFilter(minInput);
  const max = parseMoneyFilter(maxInput);

  if (min === null && max === null) return true;
  if (value === null) return false;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;

  return true;
}

function isStatementFilterActive(filters: StatementGridFilters, key: StatementGridFilterKey) {
  switch (key) {
    case 'date':
      return Boolean(filters.dateFrom || filters.dateTo);
    case 'review':
      return filters.review !== 'ALL';
    case 'description':
      return Boolean(filters.description.trim());
    case 'document':
      return Boolean(filters.document.trim());
    case 'type':
      return filters.type !== 'ALL';
    case 'value':
      return Boolean(filters.valueMin.trim() || filters.valueMax.trim());
    case 'status':
      return Boolean(filters.status.trim());
    default:
      return false;
  }
}

function SearchFilterIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
    </svg>
  );
}

function ClearAllFiltersIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l3 3m0-3-3 3" />
    </svg>
  );
}

function ReconcileIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ReturnPendingIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10H4V5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10a8 8 0 1 0 2.34-5.66L4 6.69" />
    </svg>
  );
}

function ReviewedIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function NotReviewedIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4.5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

function isMovementReviewed(item: BankStatementMovement) {
  const normalizedStatus = normalizeFilterText(item.reviewStatus);

  return Boolean(item.isReviewed) || normalizedStatus === 'REVIEWED' || normalizedStatus === 'CONFERIDO';
}

type StatementFilterHeaderProps = {
  label: string;
  filterKey: StatementGridFilterKey;
  active: boolean;
  openFilter: StatementGridFilterKey | null;
  setOpenFilter: (key: StatementGridFilterKey | null) => void;
  align?: 'left' | 'right';
  children: ReactNode;
};

function StatementFilterHeader({
  label,
  filterKey,
  active,
  openFilter,
  setOpenFilter,
  align = 'left',
  children,
}: StatementFilterHeaderProps) {
  const isOpen = openFilter === filterKey;

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpenFilter(isOpen ? null : filterKey)}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
          active
            ? 'border-blue-300 bg-blue-100 text-blue-700'
            : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'
        }`}
        title={`Filtrar ${label}`}
        aria-label={`Filtrar ${label}`}
      >
        <SearchFilterIcon />
      </button>

      {isOpen ? (
        <div className={`absolute top-8 z-40 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-left normal-case tracking-normal text-slate-700 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default function FinanceiroBankStatementPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [statementMovements, setStatementMovements] = useState<BankStatementMovement[]>([]);
  const [selectedBankId, setSelectedBankId] = useState(readBankIdFromUrl);
  const [lockedBankId, setLockedBankId] = useState(readBankIdFromUrl);
  const [periodStart, setPeriodStart] = useState(getMonthStartDateInput());
  const [periodEnd, setPeriodEnd] = useState(getTodayDateInput());
  const [statementBalance, setStatementBalance] = useState<number | null>(null);
  const [statementCreditAmount, setStatementCreditAmount] = useState(0);
  const [statementDebitAmount, setStatementDebitAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isPullingStatement, setIsPullingStatement] = useState(false);
  const [reconcilingMovementId, setReconcilingMovementId] = useState<string | null>(null);
  const [reviewingMovementId, setReviewingMovementId] = useState<string | null>(null);
  const [bulkReviewStatus, setBulkReviewStatus] = useState<'REVIEWED' | 'NOT_REVIEWED' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [openGridFilter, setOpenGridFilter] = useState<StatementGridFilterKey | null>(null);
  const [gridFilters, setGridFilters] = useState<StatementGridFilters>(
    DEFAULT_STATEMENT_GRID_FILTERS,
  );

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
    };

    syncSelectedBankId();
    window.addEventListener('popstate', syncSelectedBankId);
    window.addEventListener('hashchange', syncSelectedBankId);

    return () => {
      window.removeEventListener('popstate', syncSelectedBankId);
      window.removeEventListener('hashchange', syncSelectedBankId);
    };
  }, []);

  const selectedBank = useMemo(
    () => banks.find((item) => item.id === selectedBankId) || null,
    [banks, selectedBankId],
  );
  const scopeReady = Boolean(
    runtimeContext.sourceSystem && runtimeContext.sourceTenantId,
  );
  const statementSummary = useMemo(() => {
    return {
      creditAmount: statementCreditAmount,
      debitAmount: statementDebitAmount,
      latestBalance: statementBalance,
    };
  }, [statementBalance, statementCreditAmount, statementDebitAmount]);
  const hasGridFilterActive = useMemo(
    () => STATEMENT_GRID_FILTER_KEYS.some((key) => isStatementFilterActive(gridFilters, key)),
    [gridFilters],
  );
  const statementStatusOptions = useMemo(() => {
    return Array.from(
      new Set(
        statementMovements
          .map((item) => normalizeFilterText(item.status || 'PENDENTE'))
          .filter(Boolean),
      ),
    ).sort((left, right) => {
      const preferredOrder = ['PENDENTE', 'CONCILIADO'];
      const leftIndex = preferredOrder.indexOf(left);
      const rightIndex = preferredOrder.indexOf(right);

      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : preferredOrder.length) -
          (rightIndex >= 0 ? rightIndex : preferredOrder.length);
      }

      return left.localeCompare(right);
    });
  }, [statementMovements]);
  const filteredStatementMovements = useMemo(() => {
    const description = normalizeFilterText(gridFilters.description);
    const document = normalizeFilterText(gridFilters.document);
    const status = normalizeFilterText(gridFilters.status);

    return statementMovements.filter((item) => {
      const movementDate = getStatementDateInput(item.occurredAt);
      const movementType = normalizeMovementType(item.movementType);
      const movementAmount = Math.abs(Number(item.amount || 0));

      if (gridFilters.dateFrom && movementDate < gridFilters.dateFrom) {
        return false;
      }

      if (gridFilters.dateTo && movementDate > gridFilters.dateTo) {
        return false;
      }

      if (description) {
        const searchableDescription = normalizeFilterText(
          [
            item.description,
            ...(item.detailLines || []),
            selectedBank?.bankName || '',
          ].join(' '),
        );

        if (!searchableDescription.includes(description)) {
          return false;
        }
      }

      if (document && !normalizeFilterText(item.documentNumber).includes(document)) {
        return false;
      }

      if (gridFilters.type !== 'ALL' && movementType !== gridFilters.type) {
        return false;
      }

      if (gridFilters.review !== 'ALL') {
        const reviewStatus = isMovementReviewed(item) ? 'REVIEWED' : 'NOT_REVIEWED';

        if (reviewStatus !== gridFilters.review) {
          return false;
        }
      }

      if (!isValueInsideMoneyRange(movementAmount, gridFilters.valueMin, gridFilters.valueMax)) {
        return false;
      }

      if (status && normalizeFilterText(item.status || 'PENDENTE') !== status) {
        return false;
      }

      return true;
    });
  }, [gridFilters, selectedBank?.bankName, statementMovements]);

  const clearStatement = useCallback(() => {
    setStatementMovements([]);
    setStatementBalance(null);
    setStatementCreditAmount(0);
    setStatementDebitAmount(0);
  }, []);

  const applyStatementResponse = useCallback(
    (statement: BankStatementResponse, showMessage: boolean) => {
      setStatementMovements(statement.movements || []);
      setStatementBalance(
        typeof statement.currentBalance === 'number' ? statement.currentBalance : null,
      );
      setStatementCreditAmount(Number(statement.creditAmount || 0));
      setStatementDebitAmount(Number(statement.debitAmount || 0));

      if (showMessage) {
        setStatusMessage(
          statement.message ||
            `${statement.movementCount || statement.movements?.length || 0} lançamento(s) de extrato bancário encontrado(s).`,
        );
      }
    },
    [],
  );

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
      clearStatement();
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar os bancos para consultar o extrato.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [clearStatement, lockedBankId, runtimeContext, scopeReady, selectedBankId]);

  const loadSavedStatement = useCallback(async () => {
    if (!scopeReady || !selectedBankId) {
      clearStatement();
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setStatusMessage(null);

      const statement = await getJson<BankStatementResponse>(
        `/banks/${selectedBankId}/statement/saved${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
          periodStart,
          periodEnd,
        })}`,
      );

      applyStatementResponse(statement, false);
    } catch (currentError) {
      clearStatement();
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar o extrato bancário gravado.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    applyStatementResponse,
    clearStatement,
    periodEnd,
    periodStart,
    runtimeContext,
    scopeReady,
    selectedBankId,
  ]);

  useEffect(() => {
    if (scopeReady) {
      void loadPageData();
      return;
    }

    setIsLoading(false);
  }, [loadPageData, scopeReady]);

  useEffect(() => {
    void loadSavedStatement();
  }, [loadSavedStatement]);

  async function handlePullStatement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setError('Origem financeira não identificada para consultar o extrato bancário.');
      return;
    }

    if (!selectedBankId) {
      setError('Selecione o banco para puxar o extrato bancário.');
      return;
    }

    try {
      setIsPullingStatement(true);
      setError(null);
      setStatusMessage(null);

      const statement = await getJson<BankStatementResponse>(
        `/banks/${selectedBankId}/statement${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
          requestedBy:
            runtimeContext.cashierDisplayName ||
            runtimeContext.cashierUserId ||
            'SISTEMA',
          periodStart,
          periodEnd,
        })}`,
      );

      applyStatementResponse(statement, true);
    } catch (currentError) {
      clearStatement();
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível puxar o extrato bancário com o banco.',
        ),
      );
    } finally {
      setIsPullingStatement(false);
    }
  }

  async function handleReconcileStatementMovement(movement: BankStatementMovement) {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !selectedBankId) {
      setError('Origem financeira ou banco não identificado para conciliar o lançamento.');
      return;
    }

    try {
      setReconcilingMovementId(movement.id);
      setError(null);

      const updatedMovement = await requestJson<BankStatementMovement>(
        `/banks/${selectedBankId}/statement/movements/${movement.id}/reconcile`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy:
              runtimeContext.cashierDisplayName ||
              runtimeContext.cashierUserId ||
              'SISTEMA',
            cashierUserId: runtimeContext.cashierUserId || undefined,
            cashierDisplayName: runtimeContext.cashierDisplayName || undefined,
          }),
          fallbackMessage: 'Não foi possível marcar o lançamento como conciliado.',
        },
      );

      setStatementMovements((current) =>
        current.map((item) =>
          item.id === movement.id
            ? {
                ...item,
                status: updatedMovement.status || 'CONCILIADO',
              }
            : item,
        ),
      );
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível marcar o lançamento como conciliado.',
        ),
      );
    } finally {
      setReconcilingMovementId(null);
    }
  }

  async function handleUnreconcileStatementMovement(movement: BankStatementMovement) {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !selectedBankId) {
      setError('Origem financeira ou banco não identificado para voltar o lançamento para pendente.');
      return;
    }

    try {
      setReconcilingMovementId(movement.id);
      setError(null);

      const updatedMovement = await requestJson<BankStatementMovement>(
        `/banks/${selectedBankId}/statement/movements/${movement.id}/unreconcile`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy:
              runtimeContext.cashierDisplayName ||
              runtimeContext.cashierUserId ||
              'SISTEMA',
            cashierUserId: runtimeContext.cashierUserId || undefined,
            cashierDisplayName: runtimeContext.cashierDisplayName || undefined,
          }),
          fallbackMessage: 'Não foi possível voltar o lançamento para pendente.',
        },
      );

      setStatementMovements((current) =>
        current.map((item) =>
          item.id === movement.id
            ? {
                ...item,
                status: updatedMovement.status || 'PENDENTE',
              }
            : item,
        ),
      );
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível voltar o lançamento para pendente.',
        ),
      );
    } finally {
      setReconcilingMovementId(null);
    }
  }

  async function handleToggleStatementReview(movement: BankStatementMovement) {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !selectedBankId) {
      setError('Origem financeira ou banco não identificado para conferir o lançamento.');
      return;
    }

    try {
      setReviewingMovementId(movement.id);
      setError(null);

      const updatedMovement = await requestJson<BankStatementMovement>(
        `/banks/${selectedBankId}/statement/movements/${movement.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy:
              runtimeContext.cashierDisplayName ||
              runtimeContext.cashierUserId ||
              'SISTEMA',
            cashierUserId: runtimeContext.cashierUserId || undefined,
            cashierDisplayName: runtimeContext.cashierDisplayName || undefined,
          }),
          fallbackMessage: 'Não foi possível atualizar a conferência do lançamento.',
        },
      );

      setStatementMovements((current) =>
        current.map((item) =>
          item.id === movement.id
            ? {
                ...item,
                reviewStatus:
                  updatedMovement.reviewStatus ||
                  (updatedMovement.isReviewed ? 'CONFERIDO' : 'NAO_CONFERIDO'),
                isReviewed: Boolean(updatedMovement.isReviewed),
                reviewedAt: updatedMovement.reviewedAt || null,
                reviewedBy: updatedMovement.reviewedBy || null,
              }
            : item,
        ),
      );
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível atualizar a conferência do lançamento.',
        ),
      );
    } finally {
      setReviewingMovementId(null);
    }
  }

  async function handleBulkStatementReview(reviewStatus: 'REVIEWED' | 'NOT_REVIEWED') {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !selectedBankId) {
      setError('Origem financeira ou banco não identificado para conferir os lançamentos.');
      return;
    }

    const movementIds = filteredStatementMovements.map((movement) => movement.id);

    if (!movementIds.length) {
      setError('Nenhum lançamento exibido para atualizar a conferência.');
      return;
    }

    try {
      setBulkReviewStatus(reviewStatus);
      setError(null);

      const updatedResult = await requestJson<BankStatementReviewBulkResponse>(
        `/banks/${selectedBankId}/statement/movements/review-bulk`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy:
              runtimeContext.cashierDisplayName ||
              runtimeContext.cashierUserId ||
              'SISTEMA',
            cashierUserId: runtimeContext.cashierUserId || undefined,
            cashierDisplayName: runtimeContext.cashierDisplayName || undefined,
            movementIds,
            reviewStatus,
          }),
          fallbackMessage: 'Não foi possível atualizar a conferência dos lançamentos.',
        },
      );
      const updatedById = new Map(
        (updatedResult.movements || []).map((movement) => [movement.id, movement]),
      );

      setStatementMovements((current) =>
        current.map((item) => {
          const updatedMovement = updatedById.get(item.id);

          if (!updatedMovement) return item;

          return {
            ...item,
            reviewStatus:
              updatedMovement.reviewStatus ||
              (updatedMovement.isReviewed ? 'CONFERIDO' : 'NAO_CONFERIDO'),
            isReviewed: Boolean(updatedMovement.isReviewed),
            reviewedAt: updatedMovement.reviewedAt || null,
            reviewedBy: updatedMovement.reviewedBy || null,
          };
        }),
      );
      setOpenGridFilter(null);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível atualizar a conferência dos lançamentos.',
        ),
      );
    } finally {
      setBulkReviewStatus(null);
    }
  }

  function clearGridFilter(filterKey: StatementGridFilterKey) {
    setGridFilters((current) => {
      switch (filterKey) {
        case 'date':
          return { ...current, dateFrom: '', dateTo: '' };
        case 'review':
          return { ...current, review: 'ALL' };
        case 'description':
          return { ...current, description: '' };
        case 'document':
          return { ...current, document: '' };
        case 'type':
          return { ...current, type: 'ALL' };
        case 'value':
          return { ...current, valueMin: '', valueMax: '' };
        case 'status':
          return { ...current, status: '' };
        default:
          return current;
      }
    });
  }

  function clearAllGridFilters() {
    setGridFilters({ ...DEFAULT_STATEMENT_GRID_FILTERS });
    setOpenGridFilter(null);
  }

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
                  Extrato bancário
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Consulte os lançamentos reais da conta, com créditos, débitos e saldo do banco.
                </p>
              </div>

              <Link
                href={`/bancos${preservedQueryString}`}
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
        <form onSubmit={handlePullStatement} className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
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
            disabled={isPullingStatement}
            className="mt-auto rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPullingStatement ? 'Puxando...' : 'Puxar extrato'}
          </button>
        </form>
      </section>

      <section className="grid gap-2 md:grid-cols-3">
        <div className={`${cardClass} px-4 py-2`}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
            Créditos
          </div>
          <div className="mt-0.5 text-lg font-black text-emerald-700">
            {formatCurrency(statementSummary.creditAmount)}
          </div>
        </div>
        <div className={`${cardClass} px-4 py-2`}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
            Débitos
          </div>
          <div className="mt-0.5 text-lg font-black text-rose-700">
            {formatCurrency(statementSummary.debitAmount)}
          </div>
        </div>
        <div className={`${cardClass} px-4 py-2`}>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
            Saldo informado
          </div>
          <div className="mt-0.5 text-lg font-black text-slate-900">
            {statementSummary.latestBalance === null
              ? '---'
              : formatCurrency(statementSummary.latestBalance)}
          </div>
        </div>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="max-h-[52vh] overflow-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={clearAllGridFilters}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                        hasGridFilterActive
                          ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                      }`}
                      title="Limpar todos os filtros"
                      aria-label="Limpar todos os filtros"
                    >
                      <ClearAllFiltersIcon />
                    </button>
                    <StatementFilterHeader
                      label="Data"
                      filterKey="date"
                      active={isStatementFilterActive(gridFilters, 'date')}
                      openFilter={openGridFilter}
                      setOpenFilter={setOpenGridFilter}
                    >
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Período no grid
                      </div>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          De
                        </span>
                        <input
                          type="date"
                          value={gridFilters.dateFrom}
                          onChange={(event) =>
                            setGridFilters((current) => ({
                              ...current,
                              dateFrom: event.target.value,
                            }))
                          }
                          className={filterInputClass}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Até
                        </span>
                        <input
                          type="date"
                          value={gridFilters.dateTo}
                          onChange={(event) =>
                            setGridFilters((current) => ({
                              ...current,
                              dateTo: event.target.value,
                            }))
                          }
                          className={filterInputClass}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => clearGridFilter('date')}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
                      >
                        Limpar
                      </button>
                    </div>
                    </StatementFilterHeader>
                  </div>
                </th>
                <th className="px-4 py-3">
                  <StatementFilterHeader
                    label="Conf."
                    filterKey="review"
                    active={isStatementFilterActive(gridFilters, 'review')}
                    openFilter={openGridFilter}
                    setOpenFilter={setOpenGridFilter}
                  >
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Filtrar conferência
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setGridFilters((current) => ({
                              ...current,
                              review: 'NOT_REVIEWED',
                            }));
                            setOpenGridFilter(null);
                          }}
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                            gridFilters.review === 'NOT_REVIEWED'
                              ? 'border-amber-300 bg-amber-100 text-amber-800 shadow-sm'
                              : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          Não conferido
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGridFilters((current) => ({
                              ...current,
                              review: 'REVIEWED',
                            }));
                            setOpenGridFilter(null);
                          }}
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                            gridFilters.review === 'REVIEWED'
                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800 shadow-sm'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          Conferido
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGridFilters((current) => ({
                              ...current,
                              review: 'ALL',
                            }));
                            setOpenGridFilter(null);
                          }}
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                            gridFilters.review === 'ALL'
                              ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm'
                              : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          Ambos
                        </button>
                      </div>
                      <div className="border-t border-slate-100 pt-2">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => void handleBulkStatementReview('REVIEWED')}
                            disabled={!filteredStatementMovements.length || bulkReviewStatus !== null}
                            className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {bulkReviewStatus === 'REVIEWED'
                              ? 'Marcando...'
                              : 'Marcar todos como conferidos'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleBulkStatementReview('NOT_REVIEWED')}
                            disabled={!filteredStatementMovements.length || bulkReviewStatus !== null}
                            className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {bulkReviewStatus === 'NOT_REVIEWED'
                              ? 'Marcando...'
                              : 'Marcar todos como não conferidos'}
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearGridFilter('review')}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
                      >
                        Limpar
                      </button>
                    </div>
                  </StatementFilterHeader>
                </th>
                <th className="px-4 py-3">
                  <StatementFilterHeader
                    label="Histórico"
                    filterKey="description"
                    active={isStatementFilterActive(gridFilters, 'description')}
                    openFilter={openGridFilter}
                    setOpenFilter={setOpenGridFilter}
                  >
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Filtrar histórico
                      </div>
                      <input
                        value={gridFilters.description}
                        onChange={(event) =>
                          setGridFilters((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        className={filterInputClass}
                        placeholder="DIGITE O HISTÓRICO"
                      />
                      <button
                        type="button"
                        onClick={() => clearGridFilter('description')}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
                      >
                        Limpar
                      </button>
                    </div>
                  </StatementFilterHeader>
                </th>
                <th className="px-4 py-3">
                  <StatementFilterHeader
                    label="Documento"
                    filterKey="document"
                    active={isStatementFilterActive(gridFilters, 'document')}
                    openFilter={openGridFilter}
                    setOpenFilter={setOpenGridFilter}
                  >
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Filtrar documento
                      </div>
                      <input
                        value={gridFilters.document}
                        onChange={(event) =>
                          setGridFilters((current) => ({
                            ...current,
                            document: event.target.value,
                          }))
                        }
                        className={filterInputClass}
                        placeholder="NÚMERO OU TEXTO"
                      />
                      <button
                        type="button"
                        onClick={() => clearGridFilter('document')}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
                      >
                        Limpar
                      </button>
                    </div>
                  </StatementFilterHeader>
                </th>
                <th className="px-4 py-3">
                  <StatementFilterHeader
                    label="Tipo"
                    filterKey="type"
                    active={isStatementFilterActive(gridFilters, 'type')}
                    openFilter={openGridFilter}
                    setOpenFilter={setOpenGridFilter}
                  >
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Filtrar tipo
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setGridFilters((current) => ({
                              ...current,
                              type: 'DEBIT',
                            }));
                            setOpenGridFilter(null);
                          }}
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                            gridFilters.type === 'DEBIT'
                              ? 'border-rose-300 bg-rose-100 text-rose-800 shadow-sm'
                              : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                          }`}
                        >
                          Débito
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGridFilters((current) => ({
                              ...current,
                              type: 'CREDIT',
                            }));
                            setOpenGridFilter(null);
                          }}
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                            gridFilters.type === 'CREDIT'
                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800 shadow-sm'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          Crédito
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGridFilters((current) => ({
                              ...current,
                              type: 'ALL',
                            }));
                            setOpenGridFilter(null);
                          }}
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                            gridFilters.type === 'ALL'
                              ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm'
                              : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          Ambos
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setGridFilters((current) => ({
                            ...current,
                            type: 'ALL',
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
                      >
                        Limpar
                      </button>
                    </div>
                  </StatementFilterHeader>
                </th>
                <th className="px-4 py-3">
                  <StatementFilterHeader
                    label="Valor"
                    filterKey="value"
                    active={isStatementFilterActive(gridFilters, 'value')}
                    openFilter={openGridFilter}
                    setOpenFilter={setOpenGridFilter}
                    align="right"
                  >
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Filtrar valor
                      </div>
                      <input
                        value={gridFilters.valueMin}
                        onChange={(event) =>
                          setGridFilters((current) => ({
                            ...current,
                            valueMin: event.target.value,
                          }))
                        }
                        className={filterInputClass}
                        placeholder="VALOR MÍNIMO"
                      />
                      <input
                        value={gridFilters.valueMax}
                        onChange={(event) =>
                          setGridFilters((current) => ({
                            ...current,
                            valueMax: event.target.value,
                          }))
                        }
                        className={filterInputClass}
                        placeholder="VALOR MÁXIMO"
                      />
                      <button
                        type="button"
                        onClick={() => clearGridFilter('value')}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
                      >
                        Limpar
                      </button>
                    </div>
                  </StatementFilterHeader>
                </th>
                <th className="px-4 py-3">
                  Saldo
                </th>
                <th className="px-4 py-3">
                  <StatementFilterHeader
                    label="Situação"
                    filterKey="status"
                    active={isStatementFilterActive(gridFilters, 'status')}
                    openFilter={openGridFilter}
                    setOpenFilter={setOpenGridFilter}
                    align="right"
                  >
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Filtrar situação
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        {statementStatusOptions.map((statusOption) => (
                          <button
                            key={statusOption}
                            type="button"
                            onClick={() => {
                              setGridFilters((current) => ({
                                ...current,
                                status: statusOption,
                              }));
                              setOpenGridFilter(null);
                            }}
                            className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] transition ${getMovementStatusTone(statusOption)} ${
                              gridFilters.status === statusOption
                                ? 'shadow-sm ring-1 ring-slate-300'
                                : 'hover:opacity-80'
                            }`}
                          >
                            {statusOption}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setGridFilters((current) => ({
                              ...current,
                              status: '',
                            }));
                            setOpenGridFilter(null);
                          }}
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                            !gridFilters.status
                              ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm'
                              : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          Ambos
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearGridFilter('status')}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
                      >
                        Limpar
                      </button>
                    </div>
                  </StatementFilterHeader>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStatementMovements.map((item) => {
                const isDebit = normalizeMovementType(item.movementType) === 'DEBIT';
                const statusLabel = item.status || 'PENDENTE';
                const isPendingStatus = ['PENDENTE', 'PENDING'].includes(
                  normalizeFilterText(statusLabel),
                );
                const isReconciledStatus = ['CONCILIADO', 'CONCILED', 'RECONCILED'].includes(
                  normalizeFilterText(statusLabel),
                );
                const isReconciling = reconcilingMovementId === item.id;
                const isReviewed = isMovementReviewed(item);
                const isReviewing = reviewingMovementId === item.id;

                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-4 font-semibold text-slate-700">
                      {formatDateLabel(item.occurredAt)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => void handleToggleStatementReview(item)}
                        disabled={isReviewing}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          isReviewed
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        }`}
                        title={isReviewed ? 'CONFERIDO' : 'NÃO CONFERIDO'}
                        aria-label={
                          isReviewed
                            ? 'Marcar lançamento como não conferido'
                            : 'Marcar lançamento como conferido'
                        }
                      >
                        {isReviewed ? <ReviewedIcon /> : <NotReviewedIcon />}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-900">{item.description}</div>
                      {item.detailLines?.length ? (
                        <div className="mt-1 space-y-0.5 text-xs font-semibold text-slate-500">
                          {item.detailLines.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {selectedBank?.bankName || 'BANCO'}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">
                      {item.documentNumber || '---'}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getMovementTypeTone(item.movementType)}`}
                      >
                        {getMovementTypeLabel(item.movementType)}
                      </span>
                    </td>
                    <td className={`px-4 py-4 font-black ${isDebit ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatCurrency(Math.abs(item.amount))}
                    </td>
                    <td className="px-4 py-4 font-black text-slate-900">
                      {typeof item.balanceAfter === 'number'
                        ? formatCurrency(item.balanceAfter)
                        : '---'}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getMovementStatusTone(item.status)}`}
                          title={isPendingStatus ? 'AGUARDANDO CONCILIAÇÃO' : statusLabel}
                        >
                          {statusLabel}
                        </span>
                        {isPendingStatus ? (
                          <button
                            type="button"
                            onClick={() => void handleReconcileStatementMovement(item)}
                            disabled={isReconciling}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Marcar como conciliado"
                            aria-label="Marcar como conciliado"
                          >
                            <ReconcileIcon />
                          </button>
                        ) : null}
                        {isReconciledStatus ? (
                          <button
                            type="button"
                            onClick={() => void handleUnreconcileStatementMovement(item)}
                            disabled={isReconciling}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Voltar para pendente"
                            aria-label="Voltar para pendente"
                          >
                            <ReturnPendingIcon />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!isLoading && !filteredStatementMovements.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum lançamento de extrato bancário foi localizado para o banco selecionado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Link
            href={`/bancos${preservedQueryString}`}
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Retornar
          </Link>
          <div className="text-right text-sm font-black uppercase tracking-[0.14em] text-slate-700">
            Registros exibidos ({filteredStatementMovements.length})
          </div>
        </div>
      </section>
    </div>
  );
}
