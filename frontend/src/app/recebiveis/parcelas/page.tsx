'use client';

import { useEffect, useMemo, useState } from 'react';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import { formatCurrency, formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type InstallmentListStatus = 'OPEN' | 'PAID' | 'OVERDUE' | 'ALL';

type InstallmentFilters = {
  status: InstallmentListStatus;
  studentName: string;
  payerName: string;
  description: string;
  classLabel: string;
  dueDateStart: string;
  dueDateEnd: string;
  amount: string;
};

type InstallmentGridFilterKey = keyof InstallmentFilters | 'dueDate';

type InstallmentGridSort = {
  key: InstallmentGridFilterKey | null;
  direction: 'ASC' | 'DESC';
};

type AlertModalState = {
  type: 'warning' | 'success' | 'error';
  title: string;
  message: string;
};

type EditInstallmentModalState = {
  installmentId: string;
  sourceEntityName: string;
  installmentLabel: string;
  originalDueDateInput: string;
  originalAmountInput: string;
  dueDateInput: string;
  amountInput: string;
};

type CashSessionResponse = {
  id: string;
  cashierDisplayName: string;
  status: string;
  openingAmount: number;
  totalReceivedAmount: number;
  expectedClosingAmount: number;
  openedAt: string;
  movementCount: number;
  settlementCount: number;
};

type InstallmentResponse = {
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
  settledAt?: string | null;
  settlementMethod?: string | null;
  isOverdue: boolean;
};

type ParcelasAuditParams = {
  sourceSystem: string | null;
  sourceTenantId: string | null;
  tenantName?: string | null;
  filters: InstallmentFilters;
  displayedRowsCount: number;
  selectedRowsCount: number;
  selectedTotalAmount: number;
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_PARCELAS';
const ALERT_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_PARCELAS_ALERTA_GERAL';

const DEFAULT_FILTERS: InstallmentFilters = {
  status: 'OPEN',
  studentName: '',
  payerName: '',
  description: '',
  classLabel: '',
  dueDateStart: '',
  dueDateEnd: '',
  amount: '',
};

const DEFAULT_INSTALLMENT_GRID_SORT: InstallmentGridSort = {
  key: 'dueDate',
  direction: 'ASC',
};

const STATUS_OPTIONS: Array<{ value: InstallmentListStatus; label: string }> = [
  { value: 'OPEN', label: 'ABERTAS' },
  { value: 'PAID', label: 'FECHADAS' },
  { value: 'OVERDUE', label: 'VENCIDAS' },
  { value: 'ALL', label: 'TODAS' },
];

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

function hasPermission(role: string | null, permissions: string[], permission: string) {
  const normalizedRole = String(role || '').toUpperCase();
  if (normalizedRole === 'ADMIN' || normalizedRole === 'MASTER') return true;
  return permissions.map((item) => item.toUpperCase()).includes(permission);
}

function hasAnyPermission(role: string | null, permissions: string[], required: string[]) {
  return required.some((permission) => hasPermission(role, permissions, permission));
}

function repairTextEncoding(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!/[ÃÂ]/.test(normalized)) return normalized;

  try {
    return decodeURIComponent(escape(normalized));
  } catch {
    return normalized;
  }
}

function formatDateInputValue(value?: string | null) {
  if (!value) return '';
  const normalized = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function formatCurrencyInput(value?: number | null) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseCurrencyInput(value: string) {
  const normalized = String(value || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getInstallmentStatusLabel(item: InstallmentResponse) {
  if (item.status === 'PAID') return 'FECHADA';
  if (item.isOverdue) return 'VENCIDA';
  return 'ABERTA';
}

function getInstallmentStatusClasses(item: InstallmentResponse) {
  if (item.status === 'PAID') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (item.isOverdue) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function normalizeFilterText(value: string | number | null | undefined) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function includesFilterText(value: string | number | null | undefined, filter: string) {
  const normalizedFilter = normalizeFilterText(filter);
  if (!normalizedFilter) return true;
  return normalizeFilterText(value).includes(normalizedFilter);
}

function getDateOnlyValue(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 10);

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function buildParcelasAuditSql(params: ParcelasAuditParams) {
  const statusFilter = String(params.filters.status || 'OPEN').toUpperCase();
  const studentName = params.filters.studentName.trim().toUpperCase();
  const payerName = params.filters.payerName.trim().toUpperCase();
  const description = params.filters.description.trim().toUpperCase();
  const classLabel = params.filters.classLabel.trim().toUpperCase();
  const dueDateStart = params.filters.dueDateStart.trim();
  const dueDateEnd = params.filters.dueDateEnd.trim();
  const amount = params.filters.amount.trim().toUpperCase();

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :status = ${toSqlLiteral(statusFilter)}
-- :studentName = ${toSqlLiteral(studentName)}
-- :payerName = ${toSqlLiteral(payerName)}
-- :description = ${toSqlLiteral(description)}
-- :classLabel = ${toSqlLiteral(classLabel)}
-- :dueDateStart = ${toSqlLiteral(dueDateStart)}
-- :dueDateEnd = ${toSqlLiteral(dueDateEnd)}
-- :amount = ${toSqlLiteral(amount)}

SELECT RI.*
FROM receivable_installments RI
INNER JOIN companies CO
  ON CO.id = RI.companyId
 AND CO.canceledAt IS NULL
INNER JOIN receivable_titles RT
  ON RT.id = RI.titleId
 AND RT.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
  AND CO.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND (
    ${toSqlLiteral(statusFilter)} = 'ALL'
    OR (${toSqlLiteral(statusFilter)} = 'OPEN' AND RI.status <> 'PAID' AND RI.openAmount > 0)
    OR (${toSqlLiteral(statusFilter)} = 'PAID' AND RI.status = 'PAID')
    OR (${toSqlLiteral(statusFilter)} = 'OVERDUE' AND RI.status <> 'PAID' AND RI.dueDate < CURRENT_DATE)
  )
  AND (
    ${toSqlLiteral(studentName)} = ''
    OR UPPER(COALESCE(RT.sourceEntityName, '')) LIKE '%' || UPPER(${toSqlLiteral(studentName)}) || '%'
  )
  AND (
    ${toSqlLiteral(payerName)} = ''
    OR UPPER(COALESCE(RI.payerNameSnapshot, '')) LIKE '%' || UPPER(${toSqlLiteral(payerName)}) || '%'
  )
  AND (
    ${toSqlLiteral(description)} = ''
    OR UPPER(COALESCE(RI.descriptionSnapshot, '')) LIKE '%' || UPPER(${toSqlLiteral(description)}) || '%'
  )
  AND (
    ${toSqlLiteral(classLabel)} = ''
    OR UPPER(COALESCE(RT.classLabel, '')) LIKE '%' || UPPER(${toSqlLiteral(classLabel)}) || '%'
  )
  AND (
    ${toSqlLiteral(dueDateStart)} = ''
    OR DATE(RI.dueDate) >= DATE(${toSqlLiteral(dueDateStart)})
  )
  AND (
    ${toSqlLiteral(dueDateEnd)} = ''
    OR DATE(RI.dueDate) <= DATE(${toSqlLiteral(dueDateEnd)})
  )
ORDER BY RI.dueDate ASC, RT.sourceEntityName ASC;`;
}

function buildParcelasAuditText(params: ParcelasAuditParams) {
  const statusFilter = String(params.filters.status || 'OPEN').toUpperCase();
  const studentName = params.filters.studentName.trim().toUpperCase();
  const payerName = params.filters.payerName.trim().toUpperCase();
  const description = params.filters.description.trim().toUpperCase();
  const classLabel = params.filters.classLabel.trim().toUpperCase();
  const dueDateStart = params.filters.dueDateStart.trim();
  const dueDateEnd = params.filters.dueDateEnd.trim();
  const amount = params.filters.amount.trim().toUpperCase();

  return `--- LOGICA DA TELA ---
Tela de grid/listagem financeira para baixa e manutencao de parcelas.

TABELAS PRINCIPAIS:
- companies (CO) - empresa financeira resolvida pelo contexto da Escola
- receivable_titles (RT) - titulos financeiros das parcelas
- receivable_installments (RI) - parcelas financeiras do core financeiro
- cash_sessions (CS) - sessao de caixa atual usada na baixa

RELACIONAMENTOS:
- RI.companyId = CO.id
- RI.titleId = RT.id
- a baixa usa a sessao de caixa aberta do usuario autenticado
- as parcelas sao filtradas por sourceSystem/sourceTenantId e pelos filtros aplicados no grid

FILTROS APLICADOS AGORA:
- empresa/tenant atual: ${formatTenantAuditValue(params.sourceTenantId, params.tenantName)}
- sistema origem: ${formatAuditValue(params.sourceSystem)}
- situacao (:status): ${statusFilter}
- aluno/origem (:studentName): ${formatAuditValue(studentName)}
- pagador (:payerName): ${formatAuditValue(payerName)}
- descricao (:description): ${formatAuditValue(description)}
- turma (:classLabel): ${formatAuditValue(classLabel)}
- vencimento periodo (:dueDateStart/:dueDateEnd): ${formatAuditValue(dueDateStart || 'INICIO')} A ${formatAuditValue(dueDateEnd || 'FIM')}
- valor (:amount): ${formatAuditValue(amount)}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- parcelas selecionadas para baixa: ${params.selectedRowsCount}
- valor selecionado para baixa: ${params.selectedTotalAmount.toFixed(2)}
- ordenacao atual: vencimento ASC, aluno/origem ASC

OBSERVACAO SOBRE O FILTRO DA EMPRESA / ESCOLA:
- CO.sourceSystem e CO.sourceTenantId isolam os dados da empresa / escola
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

export default function FinanceiroParcelasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [filterDrafts, setFilterDrafts] = useState<InstallmentFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<InstallmentFilters>(DEFAULT_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] =
    useState<InstallmentGridFilterKey | null>(null);
  const [gridSort, setGridSort] = useState<InstallmentGridSort>(DEFAULT_INSTALLMENT_GRID_SORT);
  const [installments, setInstallments] = useState<InstallmentResponse[]>([]);
  const [currentSession, setCurrentSession] = useState<CashSessionResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [isLoadingInstallments, setIsLoadingInstallments] = useState(true);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [financeSettlementUrl, setFinanceSettlementUrl] = useState<string | null>(null);
  const [isUpdatingInstallment, setIsUpdatingInstallment] = useState(false);
  const [editInstallmentModal, setEditInstallmentModal] =
    useState<EditInstallmentModalState | null>(null);
  const [alertModal, setAlertModal] = useState<AlertModalState | null>(null);

  const permissions = runtimeContext.permissions;
  const canViewCashier = hasAnyPermission(runtimeContext.userRole, permissions, [
    'VIEW_CASHIER',
    'SETTLE_RECEIVABLES',
  ]);
  const canOpenCashier = hasPermission(runtimeContext.userRole, permissions, 'VIEW_CASHIER');
  const canSettleInstallments = hasPermission(
    runtimeContext.userRole,
    permissions,
    'SETTLE_RECEIVABLES',
  );
  const canEditInstallments = hasAnyPermission(runtimeContext.userRole, permissions, [
    'MANAGE_MONTHLY_FEES',
    'MANAGE_RECEIVABLES',
  ]);

  const contextReady = Boolean(runtimeContext.sourceSystem && runtimeContext.sourceTenantId);
  const cashierUserId = runtimeContext.cashierUserId || 'USUARIO';
  const cashierDisplayName = repairTextEncoding(runtimeContext.cashierDisplayName) || 'USUARIO';

  async function loadCurrentSession() {
    if (!contextReady || !canViewCashier) {
      setCurrentSession(null);
      setIsLoadingSession(false);
      return;
    }

    try {
      setIsLoadingSession(true);
      const query = buildFinanceApiQueryString(runtimeContext, {
        cashierUserId,
        cashierDisplayName,
      });
      const payload = await requestJson<CashSessionResponse | null>(`/cash-sessions/current${query}`);
      setCurrentSession(payload);
    } catch (error) {
      setCurrentSession(null);
      setAlertModal({
        type: 'error',
        title: 'Erro ao carregar o caixa',
        message: getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar o caixa atual do usuário.',
        ),
      });
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function loadInstallments(nextFilters: InstallmentFilters) {
    if (!contextReady || !canViewCashier) {
      setInstallments([]);
      setIsLoadingInstallments(false);
      return;
    }

    try {
      setIsLoadingInstallments(true);
      const payload = await requestJson<InstallmentResponse[]>(
        `/receivables/installments${buildFinanceApiQueryString(runtimeContext, {
          status: nextFilters.status,
          studentName: nextFilters.studentName.trim() || undefined,
          payerName: nextFilters.payerName.trim() || undefined,
        })}`,
      );
      setInstallments(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setInstallments([]);
      setAlertModal({
        type: 'error',
        title: 'Erro ao carregar parcelas',
        message: getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar as parcelas do Financeiro.',
        ),
      });
    } finally {
      setIsLoadingInstallments(false);
    }
  }

  useEffect(() => {
    void loadCurrentSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextReady, canViewCashier, cashierUserId]);

  useEffect(() => {
    void loadInstallments(appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contextReady,
    canViewCashier,
    appliedFilters.status,
    appliedFilters.studentName,
    appliedFilters.payerName,
  ]);

  const displayInstallments = useMemo(() => {
    const filtered = installments.filter((item) => {
      if (!includesFilterText(item.description, appliedFilters.description)) return false;
      if (!includesFilterText(item.classLabel || '---', appliedFilters.classLabel)) return false;
      const itemDueDate = getDateOnlyValue(item.dueDate);
      if (appliedFilters.dueDateStart && itemDueDate < appliedFilters.dueDateStart) return false;
      if (appliedFilters.dueDateEnd && itemDueDate > appliedFilters.dueDateEnd) return false;
      if (
        !includesFilterText(
          formatCurrency(item.status === 'PAID' ? item.paidAmount : item.openAmount),
          appliedFilters.amount,
        )
      ) {
        return false;
      }
      return true;
    });

    if (!gridSort.key) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const direction = gridSort.direction === 'ASC' ? 1 : -1;
      const getComparableValue = (item: InstallmentResponse) => {
        if (gridSort.key === 'studentName') return item.sourceEntityName;
        if (gridSort.key === 'payerName') return item.payerNameSnapshot;
        if (gridSort.key === 'description') return item.description;
        if (gridSort.key === 'classLabel') return item.classLabel || '';
        if (gridSort.key === 'dueDate') return item.dueDate;
        if (gridSort.key === 'amount') return item.status === 'PAID' ? item.paidAmount : item.openAmount;
        if (gridSort.key === 'status') return getInstallmentStatusLabel(item);
        return '';
      };

      const leftValue = getComparableValue(left);
      const rightValue = getComparableValue(right);

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue), 'pt-BR') * direction;
    });
  }, [appliedFilters, gridSort, installments]);

  useEffect(() => {
    const visibleSelectableIds = new Set(
      displayInstallments
        .filter((item) => item.status !== 'PAID' && item.openAmount > 0)
        .map((item) => item.id),
    );

    setSelectedIds((current) => current.filter((id) => visibleSelectableIds.has(id)));
  }, [displayInstallments]);

  useEffect(() => {
    function handleFinancePopupMessage(event: MessageEvent) {
      const messageType = event.data?.type;

      if (messageType === 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_CLOSE') {
        setFinanceSettlementUrl(null);
        return;
      }

      if (messageType === 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_REFRESH') {
        setFinanceSettlementUrl(null);
        void loadCurrentSession();
        void loadInstallments(appliedFilters);
      }
    }

    window.addEventListener('message', handleFinancePopupMessage);
    return () => window.removeEventListener('message', handleFinancePopupMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  const selectableInstallments = useMemo(
    () => displayInstallments.filter((item) => item.status !== 'PAID' && item.openAmount > 0),
    [displayInstallments],
  );
  const selectedInstallments = useMemo(
    () => displayInstallments.filter((item) => selectedIds.includes(item.id)),
    [displayInstallments, selectedIds],
  );
  const selectedTotalAmount = selectedInstallments.reduce(
    (total, item) => total + Number(item.openAmount || 0),
    0,
  );
  const allSelectableChecked =
    selectableInstallments.length > 0 &&
    selectableInstallments.every((item) => selectedIds.includes(item.id));

  const parcelasAuditContext = useMemo(
    () => ({
      auditText: buildParcelasAuditText({
        sourceSystem: runtimeContext.sourceSystem,
        sourceTenantId: runtimeContext.sourceTenantId,
        tenantName: repairTextEncoding(runtimeContext.companyName),
        filters: appliedFilters,
        displayedRowsCount: displayInstallments.length,
        selectedRowsCount: selectedInstallments.length,
        selectedTotalAmount,
      }),
      sqlText: buildParcelasAuditSql({
        sourceSystem: runtimeContext.sourceSystem,
        sourceTenantId: runtimeContext.sourceTenantId,
        tenantName: repairTextEncoding(runtimeContext.companyName),
        filters: appliedFilters,
        displayedRowsCount: displayInstallments.length,
        selectedRowsCount: selectedInstallments.length,
        selectedTotalAmount,
      }),
    }),
    [
      appliedFilters,
      displayInstallments.length,
      runtimeContext.companyName,
      runtimeContext.sourceSystem,
      runtimeContext.sourceTenantId,
      selectedInstallments.length,
      selectedTotalAmount,
    ],
  );

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') return;
    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
        auditText: parcelasAuditContext.auditText,
        sqlText: parcelasAuditContext.sqlText,
      },
      '*',
    );
  }, [parcelasAuditContext.auditText, parcelasAuditContext.sqlText, runtimeContext.embedded]);

  async function handleOpenCashSession() {
    if (!contextReady || !canOpenCashier || isOpeningSession) return;

    const normalizedOpeningAmount = openingAmount.trim();
    const parsedOpeningAmount = normalizedOpeningAmount
      ? Number(normalizedOpeningAmount.replace(',', '.'))
      : undefined;

    if (
      typeof parsedOpeningAmount === 'number' &&
      (!Number.isFinite(parsedOpeningAmount) || parsedOpeningAmount < 0)
    ) {
      setAlertModal({
        type: 'warning',
        title: 'Valor de abertura inválido',
        message: 'Informe um valor de abertura igual ou maior que zero.',
      });
      return;
    }

    try {
      setIsOpeningSession(true);
      const payload = await requestJson<CashSessionResponse>('/cash-sessions/open', {
        method: 'POST',
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          cashierUserId,
          cashierDisplayName,
          requestedBy: cashierUserId,
          openingAmount: parsedOpeningAmount,
          notes: openingNotes.trim() || undefined,
        }),
      });

      setCurrentSession(payload);
      setOpeningAmount('');
      setOpeningNotes('');
      setAlertModal({
        type: 'success',
        title: 'Caixa aberto com sucesso',
        message: 'O caixa do usuário foi aberto e já está pronto para receber baixas em dinheiro.',
      });
    } catch (error) {
      setAlertModal({
        type: 'error',
        title: 'Erro ao abrir o caixa',
        message: getFriendlyRequestErrorMessage(error, 'Não foi possível abrir o caixa do usuário.'),
      });
    } finally {
      setIsOpeningSession(false);
    }
  }

  function applyColumnFilter(columnKey: InstallmentGridFilterKey) {
    setSelectedIds([]);
    if (columnKey === 'dueDate') {
      setAppliedFilters((current) => ({
        ...current,
        dueDateStart: filterDrafts.dueDateStart,
        dueDateEnd: filterDrafts.dueDateEnd,
      }));
      setActiveFilterColumn(null);
      return;
    }

    setAppliedFilters((current) => ({
      ...current,
      [columnKey]: filterDrafts[columnKey],
    }));
    setActiveFilterColumn(null);
  }

  function clearColumnFilter(columnKey: InstallmentGridFilterKey) {
    setSelectedIds([]);
    if (columnKey === 'dueDate') {
      setFilterDrafts((current) => ({
        ...current,
        dueDateStart: '',
        dueDateEnd: '',
      }));
      setAppliedFilters((current) => ({
        ...current,
        dueDateStart: '',
        dueDateEnd: '',
      }));
      setActiveFilterColumn(null);
      return;
    }

    setFilterDrafts((current) => ({
      ...current,
      [columnKey]: DEFAULT_FILTERS[columnKey],
    }));
    setAppliedFilters((current) => ({
      ...current,
      [columnKey]: DEFAULT_FILTERS[columnKey],
    }));
    setActiveFilterColumn(null);
  }

  function clearAllColumnControls() {
    setSelectedIds([]);
    setFilterDrafts(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setGridSort(DEFAULT_INSTALLMENT_GRID_SORT);
    setActiveFilterColumn(null);
  }

  function openColumnFilter(columnKey: InstallmentGridFilterKey) {
    if (columnKey === 'dueDate') {
      setFilterDrafts((current) => ({
        ...current,
        dueDateStart: appliedFilters.dueDateStart,
        dueDateEnd: appliedFilters.dueDateEnd,
      }));
      setActiveFilterColumn((current) => (current === columnKey ? null : columnKey));
      return;
    }

    setFilterDrafts((current) => ({
      ...current,
      [columnKey]: appliedFilters[columnKey],
    }));
    setActiveFilterColumn((current) => (current === columnKey ? null : columnKey));
  }

  function renderClearAllFiltersButton() {
    const hasActiveControls =
      appliedFilters.status !== DEFAULT_FILTERS.status ||
      Boolean(appliedFilters.studentName.trim()) ||
      Boolean(appliedFilters.payerName.trim()) ||
      Boolean(appliedFilters.description.trim()) ||
      Boolean(appliedFilters.classLabel.trim()) ||
      Boolean(appliedFilters.dueDateStart.trim()) ||
      Boolean(appliedFilters.dueDateEnd.trim()) ||
      Boolean(appliedFilters.amount.trim()) ||
      gridSort.key !== DEFAULT_INSTALLMENT_GRID_SORT.key ||
      gridSort.direction !== DEFAULT_INSTALLMENT_GRID_SORT.direction;

    return (
      <button
        type="button"
        onClick={clearAllColumnControls}
        title="Limpar todos os filtros"
        aria-label="Limpar todos os filtros"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
          hasActiveControls
            ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l3 3m0-3-3 3" />
        </svg>
      </button>
    );
  }

  function renderTextColumnHeader(
    columnKey: Exclude<InstallmentGridFilterKey, 'status' | 'dueDate'>,
    label: string,
    placeholder: string,
    align: 'left' | 'right' = 'left',
  ) {
    return (
      <GridColumnFilterHeader
        label={label}
        isOpen={activeFilterColumn === columnKey}
        isActive={Boolean(appliedFilters[columnKey].trim()) || gridSort.key === columnKey}
        filterValue={filterDrafts[columnKey]}
        placeholder={placeholder}
        align={align}
        sortDirection={gridSort.key === columnKey ? gridSort.direction : null}
        onToggle={() => openColumnFilter(columnKey)}
        onSort={(direction) => {
          setGridSort({ key: columnKey, direction });
          setActiveFilterColumn(null);
        }}
        onFilterValueChange={(value) =>
          setFilterDrafts((current) => ({
            ...current,
            [columnKey]: value,
          }))
        }
        onApply={() => applyColumnFilter(columnKey)}
        onClear={() => clearColumnFilter(columnKey)}
      />
    );
  }

  function renderDueDateColumnHeader() {
    const isOpen = activeFilterColumn === 'dueDate';
    const isActive =
      Boolean(appliedFilters.dueDateStart || appliedFilters.dueDateEnd) ||
      gridSort.key === 'dueDate';

    return (
      <div className="relative inline-flex items-center gap-1.5">
        <span>Vencimento</span>
        <button
          type="button"
          onClick={() => openColumnFilter('dueDate')}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
            isActive
              ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
          }`}
          title="Filtrar Vencimento"
          aria-label="Filtrar Vencimento"
          aria-expanded={isOpen}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 0 1 1 1v15H4V6a1 1 0 0 1 1-1z" />
          </svg>
        </button>

        {isOpen ? (
          <div className="absolute right-0 top-8 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-left normal-case tracking-normal text-slate-700 shadow-xl">
            <div className="mb-3 space-y-2 border-b border-slate-100 pb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                Ordenar coluna
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['ASC', 'DESC'] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => {
                      setGridSort({ key: 'dueDate', direction });
                      setActiveFilterColumn(null);
                    }}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                      gridSort.key === 'dueDate' && gridSort.direction === direction
                        ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {direction === 'ASC' ? 'Crescente' : 'Decrescente'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                Periodo
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    De
                  </span>
                  <input
                    type="date"
                    value={filterDrafts.dueDateStart}
                    onChange={(event) =>
                      setFilterDrafts((current) => ({
                        ...current,
                        dueDateStart: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Ate
                  </span>
                  <input
                    type="date"
                    value={filterDrafts.dueDateEnd}
                    onChange={(event) =>
                      setFilterDrafts((current) => ({
                        ...current,
                        dueDateEnd: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => applyColumnFilter('dueDate')}
                className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100"
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={() => clearColumnFilter('dueDate')}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
              >
                Limpar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderStatusColumnHeader() {
    const isOpen = activeFilterColumn === 'status';
    const isActive =
      appliedFilters.status !== DEFAULT_FILTERS.status || gridSort.key === 'status';

    return (
      <div className="relative inline-flex items-center gap-1.5">
        <span>Situação</span>
        <button
          type="button"
          onClick={() => openColumnFilter('status')}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
            isActive
              ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
          }`}
          title="Filtrar Situação"
          aria-label="Filtrar Situação"
          aria-expanded={isOpen}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
          </svg>
        </button>

        {isOpen ? (
          <div className="absolute right-0 top-8 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-left normal-case tracking-normal text-slate-700 shadow-xl">
            <div className="mb-3 space-y-2 border-b border-slate-100 pb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                Ordenar coluna
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['ASC', 'DESC'] as const).map((direction) => (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => {
                      setGridSort({ key: 'status', direction });
                      setActiveFilterColumn(null);
                    }}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                      gridSort.key === 'status' && gridSort.direction === direction
                        ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {direction === 'ASC' ? 'Crescente' : 'Decrescente'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                Filtrar Situação
              </div>
              <div className="grid gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFilterDrafts((current) => ({
                        ...current,
                        status: option.value,
                      }))
                    }
                    className={`rounded-lg border px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.12em] transition ${
                      filterDrafts.status === option.value
                        ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => applyColumnFilter('status')}
                className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100"
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={() => clearColumnFilter('status')}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
              >
                Limpar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function handleToggleInstallment(installmentId: string) {
    setSelectedIds((current) =>
      current.includes(installmentId)
        ? current.filter((currentId) => currentId !== installmentId)
        : [...current, installmentId],
    );
  }

  function handleToggleAllVisible() {
    if (allSelectableChecked) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(selectableInstallments.map((item) => item.id));
  }

  function handleOpenEditInstallment(item: InstallmentResponse) {
    setEditInstallmentModal({
      installmentId: item.id,
      sourceEntityName: item.sourceEntityName,
      installmentLabel: `${item.installmentNumber}/${item.installmentCount}`,
      originalDueDateInput: formatDateInputValue(item.dueDate),
      originalAmountInput: formatCurrencyInput(item.openAmount),
      dueDateInput: formatDateInputValue(item.dueDate),
      amountInput: formatCurrencyInput(item.openAmount),
    });
  }

  async function handleSaveInstallmentChanges() {
    if (!editInstallmentModal || isUpdatingInstallment) return;

    const parsedAmount = parseCurrencyInput(editInstallmentModal.amountInput);

    if (!editInstallmentModal.dueDateInput) {
      setAlertModal({
        type: 'warning',
        title: 'Vencimento obrigatório',
        message: 'Informe o novo vencimento da parcela.',
      });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setAlertModal({
        type: 'warning',
        title: 'Valor inválido',
        message: 'Informe um valor de parcela maior que zero.',
      });
      return;
    }

    try {
      setIsUpdatingInstallment(true);
      await requestJson(`/receivables/installments/${editInstallmentModal.installmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          dueDate: editInstallmentModal.dueDateInput,
          amount: parsedAmount,
          requestedBy: cashierUserId,
        }),
      });

      setEditInstallmentModal(null);
      setAlertModal({
        type: 'success',
        title: 'Parcela alterada',
        message: 'O vencimento e o valor da parcela foram atualizados com sucesso.',
      });
      void loadInstallments(appliedFilters);
    } catch (error) {
      setAlertModal({
        type: 'error',
        title: 'Erro ao alterar parcela',
        message: getFriendlyRequestErrorMessage(error, 'Não foi possível salvar a alteração da parcela.'),
      });
    } finally {
      setIsUpdatingInstallment(false);
    }
  }

  function handleOpenManualSettlement() {
    if (!selectedIds.length) {
      setAlertModal({
        type: 'warning',
        title: 'Selecione parcelas',
        message: 'Selecione ao menos uma parcela em aberto para iniciar a baixa manual.',
      });
      return;
    }

    const separator = buildFinanceNavigationQueryString(runtimeContext) ? '&' : '?';
    setFinanceSettlementUrl(
      `/recebiveis/baixa-manual${buildFinanceNavigationQueryString(
        runtimeContext,
      )}${separator}modal=1&installmentIds=${encodeURIComponent(selectedIds.join(','))}`,
    );
  }

  function handleOpenColumns() {
    setAlertModal({
      type: 'warning',
      title: 'Colunas fixas',
      message: 'Esta tela segue o modelo original de parcelas da Escola e mantém as colunas fixas.',
    });
  }

  function handleOpenExport() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  if (!contextReady && runtimeContext.embedded) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center p-6">
        <div className="w-full rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-700">Contexto obrigatório</div>
          <div className="mt-2 text-xl font-black text-slate-900">Não foi possível identificar a empresa.</div>
          <p className="mt-2 text-sm font-semibold text-amber-800">
            Abra esta tela pelo menu principal para carregar o contexto financeiro.
          </p>
        </div>
      </div>
    );
  }

  if (!canViewCashier) {
    return (
      <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl items-center justify-center p-6">
        <div className="w-full rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-700">Acesso negado</div>
          <div className="mt-2 text-xl font-black text-slate-900">Usuário sem permissão para parcelas.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                Contas a receber
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Parcelas</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                Consulte parcelas abertas, vencidas ou fechadas com visão consolidada das empresas que operam no core financeiro.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 xl:flex-row xl:items-center xl:justify-end">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenManualSettlement}
              disabled={!canSettleInstallments || !selectedIds.length}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Baixa
            </button>
            <span className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
              Selecionadas: {selectedInstallments.length} - {formatCurrency(selectedTotalAmount)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {renderClearAllFiltersButton()}
                    <input
                      type="checkbox"
                      checked={allSelectableChecked}
                      onChange={handleToggleAllVisible}
                      disabled={!canSettleInstallments || !selectableInstallments.length}
                      aria-label="Selecionar todas as parcelas em aberto"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                </th>
                <th className="px-4 py-3">
                  {renderTextColumnHeader('studentName', 'Aluno', 'NOME DO ALUNO')}
                </th>
                <th className="px-4 py-3">
                  {renderTextColumnHeader('payerName', 'Responsável pagador', 'NOME DO RESPONSAVEL')}
                </th>
                <th className="px-4 py-3">
                  {renderTextColumnHeader('description', 'Descrição', 'DESCRICAO')}
                </th>
                <th className="px-4 py-3">
                  {renderTextColumnHeader('classLabel', 'Turma', 'TURMA')}
                </th>
                <th className="px-4 py-3">
                  {renderDueDateColumnHeader()}
                </th>
                <th className="px-4 py-3">
                  {renderTextColumnHeader('amount', 'Valor', 'VALOR', 'right')}
                </th>
                <th className="px-4 py-3">{renderStatusColumnHeader()}</th>
              </tr>
            </thead>
            <tbody>
              {displayInstallments.map((item) => {
                const isSelectable = item.status !== 'PAID' && item.openAmount > 0;
                const rowValue = item.status === 'PAID' ? item.paidAmount : item.openAmount;

                return (
                  <tr
                    key={item.id}
                    className="border-t border-slate-100 align-top transition hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleToggleInstallment(item.id)}
                        disabled={!canSettleInstallments || !isSelectable}
                        aria-label={`Selecionar parcela de ${item.sourceEntityName}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-900">{item.sourceEntityName}</div>
                      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        PARCELA {item.installmentNumber}/{item.installmentCount}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">
                      {item.payerNameSnapshot}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-slate-700">{item.description}</div>
                      {item.settledAt ? (
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                          BAIXADA EM {formatDateLabel(item.settledAt)}
                          {item.settlementMethod ? ` - ${item.settlementMethod}` : ''}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">
                      {item.classLabel || '---'}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-700">
                      {formatDateLabel(item.dueDate)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-black text-slate-900">{formatCurrency(rowValue)}</div>
                      {canEditInstallments && isSelectable ? (
                        <button
                          type="button"
                          onClick={() => handleOpenEditInstallment(item)}
                          className="mt-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
                        >
                          Editar
                        </button>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getInstallmentStatusClasses(
                          item,
                        )}`}
                      >
                        {getInstallmentStatusLabel(item)}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {!isLoadingInstallments && !displayInstallments.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhuma parcela foi encontrada para os filtros informados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenColumns}
              className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              ☰ Colunas
            </button>
            <button
              type="button"
              onClick={handleOpenExport}
              aria-label="Imprimir"
              title="Imprimir"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9V4h12v5" />
                <path d="M6 18h12v-6H6z" />
                <path d="M8 14h8" />
              </svg>
            </button>
            <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 shadow-sm">
              Total registros: {displayInstallments.length}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
              Selecionadas: {selectedInstallments.length}
            </span>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">
              Valor selecionado: {formatCurrency(selectedTotalAmount)}
            </span>
          </div>

          {!runtimeContext.embedded ? (
            <ScreenNameCopy
              screenId={SCREEN_ID}
              className="justify-end"
              auditText={parcelasAuditContext.auditText}
              sqlText={parcelasAuditContext.sqlText}
            />
          ) : null}
        </div>
      </section>

      {editInstallmentModal ? (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {runtimeContext.logoUrl ? (
                    <img
                      src={runtimeContext.logoUrl}
                      alt={`Logo de ${repairTextEncoding(runtimeContext.companyName) || 'empresa'}`}
                      className="h-full w-full object-contain p-1.5"
                    />
                  ) : (
                    <span className="text-sm font-black uppercase tracking-[0.25em] text-[#153a6a]">
                      {String(repairTextEncoding(runtimeContext.companyName) || 'ESCOLA').slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">
                    Alteração de parcela
                  </div>
                  <h3 className="mt-1 text-xl font-black text-slate-900">
                    {editInstallmentModal.sourceEntityName} - PARCELA{' '}
                    {editInstallmentModal.installmentLabel}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    Altere o vencimento e o valor da parcela em aberto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !isUpdatingInstallment && setEditInstallmentModal(null)}
                  className="rounded-full bg-white px-3 py-2 text-sm font-black text-slate-500 shadow-sm hover:text-slate-900"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
              <label>
                <span className={labelClass}>Novo vencimento</span>
                <input
                  type="date"
                  value={editInstallmentModal.dueDateInput}
                  onChange={(event) =>
                    setEditInstallmentModal((current) =>
                      current ? { ...current, dueDateInput: event.target.value } : current,
                    )
                  }
                  className={inputClass}
                />
              </label>

              <label>
                <span className={labelClass}>Novo valor</span>
                <input
                  value={editInstallmentModal.amountInput}
                  onChange={(event) =>
                    setEditInstallmentModal((current) =>
                      current ? { ...current, amountInput: event.target.value } : current,
                    )
                  }
                  inputMode="decimal"
                  className={inputClass}
                  placeholder="0,00"
                />
              </label>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditInstallmentModal(null)}
                  disabled={isUpdatingInstallment}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveInstallmentChanges()}
                  disabled={isUpdatingInstallment}
                  className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                >
                  {isUpdatingInstallment ? 'Salvando...' : 'Salvar alteração'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {alertModal ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
            <div
              className={`flex items-start gap-4 border-b border-slate-100 px-6 py-5 ${
                alertModal.type === 'success'
                  ? 'bg-emerald-50'
                  : alertModal.type === 'error'
                    ? 'bg-rose-50'
                    : 'bg-amber-50'
              }`}
            >
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  alertModal.type === 'success'
                    ? 'border-emerald-200'
                    : alertModal.type === 'error'
                      ? 'border-rose-200'
                      : 'border-amber-200'
                }`}
              >
                {runtimeContext.logoUrl ? (
                  <img
                    src={runtimeContext.logoUrl}
                    alt={`Logo de ${repairTextEncoding(runtimeContext.companyName) || 'empresa'}`}
                    className="h-full w-full object-contain p-1.5"
                  />
                ) : alertModal.type === 'success' ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-7 w-7 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-7 w-7 ${
                      alertModal.type === 'error' ? 'text-rose-600' : 'text-amber-600'
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.29 3.86l-8.45 14.63A2 2 0 0 0 3.58 21h16.84a2 2 0 0 0 1.74-3.01L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  </svg>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[11px] font-black uppercase tracking-[0.24em] ${
                    alertModal.type === 'success'
                      ? 'text-emerald-700'
                      : alertModal.type === 'error'
                        ? 'text-rose-700'
                        : 'text-amber-700'
                  }`}
                >
                  {alertModal.type === 'success' ? 'Sucesso' : alertModal.type === 'error' ? 'Erro' : 'Aviso'}
                </div>
                <h3 className="mt-1 text-xl font-black text-slate-900">{alertModal.title}</h3>
                <p className="mt-2 text-sm font-medium text-slate-600">{alertModal.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setAlertModal(null)}
                className="rounded-full bg-white px-3 py-2 text-sm font-black text-slate-500 shadow-sm hover:text-slate-900"
              >
                ×
              </button>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex flex-col gap-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setAlertModal(null)}
                    className={`rounded-2xl px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg transition ${
                      alertModal.type === 'success'
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                        : alertModal.type === 'error'
                          ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
                          : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25'
                    }`}
                  >
                    Fechar
                  </button>
                </div>
                <div className="flex justify-end">
                  <ScreenNameCopy screenId={ALERT_SCREEN_ID} className="justify-end text-slate-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {financeSettlementUrl ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-2 backdrop-blur-sm">
          <div className="relative flex h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-end border-b border-slate-100 bg-slate-50 px-3 py-2">
              <button
                type="button"
                onClick={() => setFinanceSettlementUrl(null)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>
            <iframe
              src={financeSettlementUrl}
              title="FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL"
              className="h-full w-full border-0 bg-white"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
