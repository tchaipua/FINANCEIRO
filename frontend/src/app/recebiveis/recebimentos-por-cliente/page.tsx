'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import { formatCurrency, formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildDefaultExportColumns,
  exportGridRows,
  type GridColumnDefinition,
  type GridExportFormat,
} from '@/app/lib/grid-export-utils';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type InstallmentResponse = {
  id: string;
  sourceEntityName: string;
  payerNameSnapshot?: string | null;
  description: string;
  dueDate: string;
  openAmount: number;
  status: string;
  suggestedInterestAmount?: number;
  suggestedPenaltyAmount?: number;
};

type CustomerReceivableRow = {
  id: string;
  customerName: string;
  installmentCount: number;
  totalOpenAmount: number;
  interestAmount: number;
  penaltyAmount: number;
  totalDueAmount: number;
  earliestDueDate: string;
  installmentIds: string[];
};

type CustomerHistoryItem = {
  id: string;
  customerName: string;
  customerDocument?: string | null;
  totalPurchaseAmount: number;
  openAmount: number;
  overdueAmount: number;
  sales: Array<{
    id: string;
    description?: string | null;
    sourceEntityName?: string | null;
    classLabel?: string | null;
    purchaseDate?: string | null;
    totalAmount: number;
    openAmount: number;
    paidAmount: number;
    installmentCount: number;
  }>;
  installments: Array<{
    id: string;
    saleDescription?: string | null;
    description?: string | null;
    installmentNumber: number;
    installmentCount: number;
    dueDate?: string | null;
    amount: number;
    openAmount: number;
    paidAmount: number;
    status: string;
  }>;
};

type CustomerDetailModalState = {
  view: 'purchases' | 'installments';
  row: CustomerReceivableRow;
  history: CustomerHistoryItem | null;
  selectedInstallmentIds: string[];
  isLoading: boolean;
  error: string;
};

type AlertState = {
  type: 'warning' | 'error';
  title: string;
  message: string;
};

type CustomerGridColumnKey =
  | 'customerName'
  | 'installmentCount'
  | 'totalOpenAmount'
  | 'interestAmount'
  | 'totalDueAmount'
  | 'earliestDueDate';

type CustomerGridFilters = Record<CustomerGridColumnKey, string>;

type CustomerGridSort = {
  key: CustomerGridColumnKey | null;
  direction: 'ASC' | 'DESC';
};

type CustomerGridConfig = {
  order: CustomerGridColumnKey[];
  hidden: CustomerGridColumnKey[];
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_RECEBIMENTOS_POR_CLIENTE';
const FINANCE_SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_RECEBIMENTOS_POR_CLIENTE';
const PURCHASES_POPUP_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_RECEBIMENTOS_POR_CLIENTE_COMPRAS';
const INSTALLMENTS_POPUP_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_RECEBIMENTOS_POR_CLIENTE_PARCELAS';
const cardClass = FINANCE_GRID_PAGE_LAYOUT.card;
const GRID_STORAGE_PREFIX = 'financeiro:recebimentos-cliente:grid-columns:';
const EXPORT_STORAGE_PREFIX = 'financeiro:recebimentos-cliente:export-config:';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const CUSTOMER_GRID_COLUMNS: GridColumnDefinition<CustomerReceivableRow, CustomerGridColumnKey>[] = [
  { key: 'customerName', label: 'Nome', getValue: (row) => row.customerName || '---' },
  {
    key: 'installmentCount',
    label: 'Qtd parcelas em aberto',
    getValue: (row) => String(row.installmentCount),
    align: 'center',
  },
  {
    key: 'totalOpenAmount',
    label: 'Valor total em aberto',
    getValue: (row) => formatCurrency(row.totalOpenAmount),
    align: 'right',
  },
  {
    key: 'interestAmount',
    label: 'Valor juros até hoje',
    getValue: (row) => formatCurrency(row.interestAmount),
    align: 'right',
  },
  {
    key: 'totalDueAmount',
    label: 'Total para baixa',
    getValue: (row) => formatCurrency(row.totalDueAmount),
    align: 'right',
  },
  {
    key: 'earliestDueDate',
    label: 'Mais antigo',
    getValue: (row) => formatDateLabel(row.earliestDueDate),
    align: 'center',
  },
];

const DEFAULT_GRID_CONFIG: CustomerGridConfig = {
  order: CUSTOMER_GRID_COLUMNS.map((column) => column.key),
  hidden: [],
};

const DEFAULT_FILTERS: CustomerGridFilters = {
  customerName: '',
  installmentCount: '',
  totalOpenAmount: '',
  interestAmount: '',
  totalDueAmount: '',
  earliestDueDate: '',
};

function normalizeUpperInput(value: string) {
  return String(value || '').toUpperCase();
}

function normalizeFilterText(value: string | number | null | undefined) {
  return String(value ?? '').trim().toUpperCase();
}

function includesFilterText(value: string | number | null | undefined, filter: string) {
  const normalizedFilter = normalizeFilterText(filter);
  if (!normalizedFilter) return true;
  return normalizeFilterText(value).includes(normalizedFilter);
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getDateTime(value: string | null | undefined) {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sortInstallmentsByOldest(installments: InstallmentResponse[]) {
  return [...installments].sort((left, right) => {
    const dueDiff = getDateTime(left.dueDate) - getDateTime(right.dueDate);
    if (dueDiff !== 0) return dueDiff;
    return String(left.id || '').localeCompare(String(right.id || ''), 'pt-BR');
  });
}

function getCustomerName(item: InstallmentResponse) {
  return normalizeUpperInput(item.payerNameSnapshot || item.sourceEntityName || 'CLIENTE NÃO INFORMADO');
}

function buildCustomerRows(installments: InstallmentResponse[]) {
  const grouped = new Map<string, InstallmentResponse[]>();

  installments
    .filter((item) => String(item.status || '').toUpperCase() === 'OPEN' && Number(item.openAmount || 0) > 0)
    .forEach((item) => {
      const customerName = getCustomerName(item);
      const key = customerName || String(item.sourceEntityName || item.id).toUpperCase();
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });

  return Array.from(grouped.entries())
    .map(([customerName, customerInstallments]) => {
      const orderedInstallments = sortInstallmentsByOldest(customerInstallments);
      const totalOpenAmount = roundMoney(
        orderedInstallments.reduce((total, item) => total + Number(item.openAmount || 0), 0),
      );
      const interestAmount = roundMoney(
        orderedInstallments.reduce(
          (total, item) => total + Number(item.suggestedInterestAmount || 0),
          0,
        ),
      );
      const penaltyAmount = roundMoney(
        orderedInstallments.reduce(
          (total, item) => total + Number(item.suggestedPenaltyAmount || 0),
          0,
        ),
      );

      return {
        id: customerName,
        customerName,
        installmentCount: orderedInstallments.length,
        totalOpenAmount,
        interestAmount,
        penaltyAmount,
        totalDueAmount: roundMoney(totalOpenAmount + interestAmount + penaltyAmount),
        earliestDueDate: orderedInstallments[0]?.dueDate || '',
        installmentIds: orderedInstallments.map((item) => item.id),
      } satisfies CustomerReceivableRow;
    })
    .sort((left, right) => getDateTime(left.earliestDueDate) - getDateTime(right.earliestDueDate));
}

function getCustomerColumnValue(row: CustomerReceivableRow, key: CustomerGridColumnKey) {
  if (key === 'customerName') return row.customerName;
  if (key === 'installmentCount') return String(row.installmentCount);
  if (key === 'totalOpenAmount') return formatCurrency(row.totalOpenAmount);
  if (key === 'interestAmount') return formatCurrency(row.interestAmount);
  if (key === 'totalDueAmount') return formatCurrency(row.totalDueAmount);
  if (key === 'earliestDueDate') return formatDateLabel(row.earliestDueDate);
  return '';
}

function compareCustomerRows(
  left: CustomerReceivableRow,
  right: CustomerReceivableRow,
  sort: CustomerGridSort,
) {
  if (!sort.key) return 0;

  let leftValue: string | number = getCustomerColumnValue(left, sort.key);
  let rightValue: string | number = getCustomerColumnValue(right, sort.key);

  if (
    sort.key === 'installmentCount' ||
    sort.key === 'totalOpenAmount' ||
    sort.key === 'interestAmount' ||
    sort.key === 'totalDueAmount'
  ) {
    leftValue = Number(left[sort.key] || 0);
    rightValue = Number(right[sort.key] || 0);
  }

  if (sort.key === 'earliestDueDate') {
    leftValue = getDateTime(left.earliestDueDate);
    rightValue = getDateTime(right.earliestDueDate);
  }

  const result =
    typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'pt-BR');

  return sort.direction === 'ASC' ? result : -result;
}

function getGridStorageKey(tenantId: string | null) {
  return `${GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getExportStorageKey(tenantId: string | null) {
  return `${EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function normalizeGridConfig(config: Partial<CustomerGridConfig> | null | undefined): CustomerGridConfig {
  const allKeys = CUSTOMER_GRID_COLUMNS.map((column) => column.key);
  const validOrder = (config?.order || []).filter((item): item is CustomerGridColumnKey =>
    allKeys.includes(item as CustomerGridColumnKey),
  );
  const validHidden = (config?.hidden || []).filter((item): item is CustomerGridColumnKey =>
    allKeys.includes(item as CustomerGridColumnKey),
  );

  return {
    order: [...validOrder, ...allKeys.filter((key) => !validOrder.includes(key))],
    hidden: Array.from(new Set(validHidden)),
  };
}

function readStoredGridConfig(tenantId: string | null) {
  if (typeof window === 'undefined') return DEFAULT_GRID_CONFIG;

  try {
    const raw = window.localStorage.getItem(getGridStorageKey(tenantId));
    return normalizeGridConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_GRID_CONFIG;
  }
}

function GridConfigModal({
  isOpen,
  columns,
  order,
  hidden,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  columns: GridColumnDefinition<CustomerReceivableRow, CustomerGridColumnKey>[];
  order: CustomerGridColumnKey[];
  hidden: CustomerGridColumnKey[];
  onSave: (order: CustomerGridColumnKey[], hidden: CustomerGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftHidden, setDraftHidden] = useState<CustomerGridColumnKey[]>(hidden);

  useEffect(() => {
    if (isOpen) setDraftHidden(hidden);
  }, [hidden, isOpen]);

  if (!isOpen) return null;

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <section className={`${cardClass} w-full max-w-xl overflow-hidden`}>
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Grid</div>
            <h2 className="mt-1 text-xl font-black text-slate-900">Alterar colunas</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>
        <div className="grid gap-2 p-6">
          {order.map((key) => {
            const column = columns.find((item) => item.key === key);
            if (!column) return null;
            const isVisible = !draftHidden.includes(key);

            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setDraftHidden((current) =>
                    current.includes(key)
                      ? current.filter((item) => item !== key)
                      : [...current, key],
                  )
                }
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                  isVisible
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {column.label}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(order, draftHidden);
              onClose();
            }}
            className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
          >
            Aplicar
          </button>
        </div>
      </section>
    </div>
  );
}

export default function FinanceiroRecebimentosPorClientePage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [installments, setInstallments] = useState<InstallmentResponse[]>([]);
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
  const [customerSearch, setCustomerSearch] = useState('');
  const [filterDrafts, setFilterDrafts] = useState<CustomerGridFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CustomerGridFilters>(DEFAULT_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] = useState<CustomerGridColumnKey | null>(null);
  const [gridSort, setGridSort] = useState<CustomerGridSort>({ key: 'earliestDueDate', direction: 'ASC' });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<CustomerGridColumnKey[]>(DEFAULT_GRID_CONFIG.order);
  const [hiddenColumns, setHiddenColumns] = useState<CustomerGridColumnKey[]>(DEFAULT_GRID_CONFIG.hidden);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<CustomerGridColumnKey, boolean>>(
    buildDefaultExportColumns(CUSTOMER_GRID_COLUMNS),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [customerDetailModal, setCustomerDetailModal] = useState<CustomerDetailModalState | null>(null);
  const [financeSettlementUrl, setFinanceSettlementUrl] = useState<string | null>(null);

  const loadInstallments = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setInstallments([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setAlert(null);
      setInstallments(
        await requestJson<InstallmentResponse[]>(
          `/receivables/installments${buildFinanceApiQueryString(runtimeContext, {
            status: 'OPEN',
          })}`,
          {
            fallbackMessage: 'Não foi possível carregar os recebimentos por cliente.',
          },
        ),
      );
    } catch (error) {
      setInstallments([]);
      setAlert({
        type: 'error',
        title: 'Erro ao carregar recebimentos',
        message: getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar os recebimentos por cliente.',
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadInstallments();
  }, [loadInstallments]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') return;
    window.parent?.postMessage({ type: 'MSINFOR_SCREEN_CONTEXT', screenId: SCREEN_ID }, '*');
  }, [runtimeContext.embedded]);

  useEffect(() => {
    const storedConfig = readStoredGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({ order: columnOrder, hidden: hiddenColumns } satisfies CustomerGridConfig),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  useEffect(() => {
    function handleFinancePopupMessage(event: MessageEvent) {
      const messageType = event.data?.type;

      if (messageType === 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_CLOSE') {
        setFinanceSettlementUrl(null);
        return;
      }

      if (messageType === 'FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_REFRESH') {
        setFinanceSettlementUrl(null);
        setCustomerDetailModal(null);
        void loadInstallments();
      }
    }

    window.addEventListener('message', handleFinancePopupMessage);
    return () => window.removeEventListener('message', handleFinancePopupMessage);
  }, [loadInstallments]);

  const visibleColumns = useMemo(() => {
    return columnOrder
      .map((key) => CUSTOMER_GRID_COLUMNS.find((column) => column.key === key))
      .filter((column): column is GridColumnDefinition<CustomerReceivableRow, CustomerGridColumnKey> =>
        Boolean(column),
      )
      .filter((column) => !hiddenColumns.includes(column.key));
  }, [columnOrder, hiddenColumns]);

  const customerRows = useMemo(() => buildCustomerRows(installments), [installments]);
  const selectableCustomerInstallments = useMemo(
    () => (customerDetailModal?.history?.installments || []).filter(
      (installment) =>
        String(installment.status || '').toUpperCase() === 'OPEN' &&
        Number(installment.openAmount || 0) > 0,
    ),
    [customerDetailModal?.history?.installments],
  );

  const statusFilteredRows = useMemo(() => {
    if (statusFilter === 'INACTIVE') return [];
    return customerRows;
  }, [customerRows, statusFilter]);

  const filteredRows = useMemo(() => {
    const normalizedCustomerSearch = normalizeFilterText(customerSearch);

    const filtered = statusFilteredRows.filter((row) => {
      if (normalizedCustomerSearch && !normalizeFilterText(row.customerName).includes(normalizedCustomerSearch)) {
        return false;
      }

      return (Object.keys(appliedFilters) as CustomerGridColumnKey[]).every((key) => {
        const filter = appliedFilters[key];
        if (!filter) return true;
        return includesFilterText(getCustomerColumnValue(row, key), filter);
      });
    });

    return [...filtered].sort((left, right) => compareCustomerRows(left, right, gridSort));
  }, [appliedFilters, customerSearch, gridSort, statusFilteredRows]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (summary, row) => ({
        installmentCount: summary.installmentCount + row.installmentCount,
        totalOpenAmount: summary.totalOpenAmount + row.totalOpenAmount,
        interestAmount: summary.interestAmount + row.interestAmount,
        totalDueAmount: summary.totalDueAmount + row.totalDueAmount,
      }),
      { installmentCount: 0, totalOpenAmount: 0, interestAmount: 0, totalDueAmount: 0 },
    );
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const normalizedCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRows = useMemo(() => {
    const startIndex = (normalizedCurrentPage - 1) * pageSize;
    return filteredRows.slice(startIndex, startIndex + pageSize);
  }, [filteredRows, normalizedCurrentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters, customerSearch, pageSize, statusFilter]);

  function applyColumnFilter(columnKey: CustomerGridColumnKey) {
    setAppliedFilters((current) => ({
      ...current,
      [columnKey]: filterDrafts[columnKey],
    }));
    setActiveFilterColumn(null);
  }

  function clearColumnFilter(columnKey: CustomerGridColumnKey) {
    setFilterDrafts((current) => ({ ...current, [columnKey]: '' }));
    setAppliedFilters((current) => ({ ...current, [columnKey]: '' }));
    setActiveFilterColumn(null);
  }

  function clearAllFilters() {
    setCustomerSearch('');
    setFilterDrafts(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setGridSort({ key: 'earliestDueDate', direction: 'ASC' });
    setActiveFilterColumn(null);
  }

  async function openCustomerDetail(
    row: CustomerReceivableRow,
    view: CustomerDetailModalState['view'],
  ) {
    setCustomerDetailModal({
      view,
      row,
      history: null,
      selectedInstallmentIds: [],
      isLoading: true,
      error: '',
    });

    try {
      const history = await requestJson<CustomerHistoryItem[]>(
        `/receivables/customer-history${buildFinanceApiQueryString(runtimeContext, {
          search: row.customerName,
        })}`,
        {
          fallbackMessage: 'Não foi possível consultar o histórico financeiro do cliente.',
        },
      );
      const normalizedName = normalizeFilterText(row.customerName);
      const customerHistory = history.find(
        (item) => normalizeFilterText(item.customerName) === normalizedName,
      ) || history[0] || null;

      setCustomerDetailModal((current) =>
        current && current.row.id === row.id && current.view === view
          ? {
              ...current,
              history: customerHistory,
              isLoading: false,
              error: customerHistory ? '' : 'Nenhuma compra ou parcela foi localizada para este cliente.',
            }
          : current,
      );
    } catch (error) {
      setCustomerDetailModal((current) =>
        current && current.row.id === row.id && current.view === view
          ? {
              ...current,
              isLoading: false,
              error: getFriendlyRequestErrorMessage(
                error,
                'Não foi possível consultar o histórico financeiro do cliente.',
              ),
            }
          : current,
      );
    }
  }

  function toggleCustomerInstallment(installmentId: string) {
    setCustomerDetailModal((current) => {
      if (!current || current.view !== 'installments') return current;
      const selectedInstallmentIds = current.selectedInstallmentIds.includes(installmentId)
        ? current.selectedInstallmentIds.filter((id) => id !== installmentId)
        : [...current.selectedInstallmentIds, installmentId];
      return { ...current, selectedInstallmentIds, error: '' };
    });
  }

  function openSelectedManualSettlement() {
    const installmentIds = customerDetailModal?.selectedInstallmentIds || [];
    if (!installmentIds.length) {
      setCustomerDetailModal((current) => current ? {
        ...current,
        error: 'Selecione ao menos uma parcela em aberto para dar baixa.',
      } : current);
      return;
    }

    const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
    const separator = navigationQuery ? '&' : '?';
    setFinanceSettlementUrl(
      `/recebiveis/baixa-manual${navigationQuery}${separator}modal=1&installmentIds=${encodeURIComponent(
        installmentIds.join(','),
      )}`,
    );
  }

  function renderColumnHeader(column: GridColumnDefinition<CustomerReceivableRow, CustomerGridColumnKey>) {
    return (
      <GridColumnFilterHeader
        label={column.label}
        isOpen={activeFilterColumn === column.key}
        isActive={Boolean(appliedFilters[column.key])}
        filterValue={filterDrafts[column.key]}
        align={column.align === 'right' ? 'right' : 'left'}
        sortDirection={gridSort.key === column.key ? gridSort.direction : null}
        onToggle={() => {
          setFilterDrafts((current) => ({
            ...current,
            [column.key]: appliedFilters[column.key],
          }));
          setActiveFilterColumn((current) => (current === column.key ? null : column.key));
        }}
        onSort={(direction) => {
          setGridSort({ key: column.key, direction });
          setActiveFilterColumn(null);
        }}
        onFilterValueChange={(value) =>
          setFilterDrafts((current) => ({ ...current, [column.key]: normalizeUpperInput(value) }))
        }
        onApply={() => applyColumnFilter(column.key)}
        onClear={() => clearColumnFilter(column.key)}
      />
    );
  }

  return (
    <div className={runtimeContext.embedded ? 'flex h-screen min-h-0 flex-col overflow-hidden' : FINANCE_GRID_PAGE_LAYOUT.shell}>
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
              Contas a receber
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Recebimentos por Cliente</h1>
            <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
              Clientes com parcelas abertas agrupadas para baixa manual.
            </p>
          </div>
        </section>
      ) : null}

      {alert ? (
        <section
          className={`${cardClass} shrink-0 px-6 py-4 text-sm font-semibold ${
            alert.type === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          <div className="text-[11px] font-black uppercase tracking-[0.18em]">{alert.title}</div>
          <div className="mt-1">{alert.message}</div>
        </section>
      ) : null}

      <section className={`${cardClass} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              value={customerSearch}
              onChange={(event) => setCustomerSearch(normalizeUpperInput(event.target.value))}
              className={FINANCE_GRID_PAGE_LAYOUT.input}
              placeholder="CONSULTA POR CLIENTE"
              aria-label="Consulta por cliente"
            />
            <button
              type="button"
              onClick={() => void loadInstallments()}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="w-12 px-3 py-3">
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    title="Limpar todos os filtros"
                    aria-label="Limpar todos os filtros"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                      Object.values(appliedFilters).some(Boolean) || customerSearch
                        ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                    }`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l3 3m0-3-3 3" />
                    </svg>
                  </button>
                </th>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 ${
                      column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''
                    }`}
                  >
                    {renderColumnHeader(column)}
                  </th>
                ))}
                <th className="w-48 px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, index) => (
                <tr
                  key={row.id}
                  aria-selected={selectedRowId === row.id}
                  onClick={() => setSelectedRowId(row.id)}
                  className={`cursor-pointer border-t border-slate-100 transition ${
                    selectedRowId === row.id
                      ? 'bg-blue-100 outline outline-1 outline-blue-400'
                      : index % 2 === 0
                        ? 'bg-white hover:bg-slate-100'
                        : 'bg-slate-200/70 hover:bg-slate-300/70'
                  }`}
                >
                  <td className="w-12 px-3 py-4" />
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-4 ${
                        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {column.key === 'customerName' ? (
                        <div className="font-black text-slate-900">{row.customerName}</div>
                      ) : column.key === 'installmentCount' ? (
                        <span className="font-black text-slate-900">{row.installmentCount}</span>
                      ) : column.key === 'totalOpenAmount' ? (
                        <span className="font-black text-slate-900">{formatCurrency(row.totalOpenAmount)}</span>
                      ) : column.key === 'interestAmount' ? (
                        <span className="font-black text-amber-700">{formatCurrency(row.interestAmount)}</span>
                      ) : column.key === 'totalDueAmount' ? (
                        <span className="font-black text-blue-700">{formatCurrency(row.totalDueAmount)}</span>
                      ) : column.key === 'earliestDueDate' ? (
                        formatDateLabel(row.earliestDueDate)
                      ) : (
                        column.getValue(row)
                      )}
                    </td>
                  ))}
                  <td className="w-48 px-3 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openCustomerDetail(row, 'purchases');
                        }}
                        title={`Mostrar compras de ${row.customerName}`}
                        aria-label={`Mostrar compras de ${row.customerName}`}
                        className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-700 transition hover:bg-indigo-100"
                      >
                        Compras
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openCustomerDetail(row, 'installments');
                        }}
                        title={`Mostrar parcelas de ${row.customerName}`}
                        aria-label={`Mostrar parcelas de ${row.customerName}`}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700 transition hover:bg-emerald-100"
                      >
                        Parcelas
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && !paginatedRows.length ? (
                <tr>
                  <td colSpan={(visibleColumns.length || 1) + 2} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum recebimento encontrado para os filtros atuais.
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr>
                  <td colSpan={(visibleColumns.length || 1) + 2} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Carregando recebimentos por cliente...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <table className="min-w-full text-left text-sm text-slate-600">
          <tfoot className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsRow}>
            <tr>
              <td className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell}>
                <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalRecordsPill}>
                  {filteredRows.length} registro(s)
                </span>
              </td>
              {visibleColumns.map((column) => (
                <td
                  key={column.key}
                  className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} ${
                    column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''
                  }`}
                >
                  {column.key === 'installmentCount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{totals.installmentCount}</span>
                  ) : column.key === 'totalOpenAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.totalOpenAmount)}</span>
                  ) : column.key === 'interestAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.interestAmount)}</span>
                  ) : column.key === 'totalDueAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.totalDueAmount)}</span>
                  ) : null}
                </td>
              ))}
              <td className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} w-48`} />
            </tr>
          </tfoot>
        </table>

        <GridStandardFooter
          statusFilter={statusFilter}
          totalRecords={filteredRows.length}
          showRecordSummary={false}
          pageSize={pageSize}
          currentPage={normalizedCurrentPage}
          totalPages={totalPages}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onStatusFilterChange={setStatusFilter}
          onPageSizeChange={setPageSize}
          onPageChange={setCurrentPage}
        />
      </section>

      <GridConfigModal
        isOpen={isColumnConfigOpen}
        columns={CUSTOMER_GRID_COLUMNS}
        order={columnOrder}
        hidden={hiddenColumns}
        onSave={(order, hidden) => {
          setColumnOrder(order);
          setHiddenColumns(hidden);
        }}
        onClose={() => setIsColumnConfigOpen(false)}
      />

      <GridExportModal
        isOpen={isExportModalOpen}
        title="Exportar recebimentos por cliente"
        description={`A exportação respeita os filtros atuais e inclui ${filteredRows.length} cliente(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={CUSTOMER_GRID_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={getExportStorageKey(runtimeContext.sourceTenantId)}
        brandingName={runtimeContext.companyName || 'FINANCEIRO'}
        brandingLogoUrl={runtimeContext.logoUrl}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: filteredRows,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) => CUSTOMER_GRID_COLUMNS.find((column) => column.key === key))
                  .filter(
                    (
                      column,
                    ): column is GridColumnDefinition<CustomerReceivableRow, CustomerGridColumnKey> =>
                      Boolean(column),
                  )
              : CUSTOMER_GRID_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: 'recebimentos-por-cliente',
            branding: {
              title: 'Recebimentos por Cliente',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: runtimeContext.companyName || 'FINANCEIRO',
              logoUrl: runtimeContext.logoUrl,
            },
          });
          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />

      {customerDetailModal ? (
        <section className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/35">
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#061c3f] via-[#082a59] to-[#0b3d7a] px-5 py-4 text-white">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-white">
                  {runtimeContext.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={runtimeContext.logoUrl} alt="Logotipo" className="h-full w-full object-contain p-1" />
                  ) : (
                    <span className="text-xs font-black tracking-[0.16em] text-[#082a59]">MS</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200">Recebimentos por cliente</div>
                  <h2 className="mt-1 truncate text-xl font-black">
                    {customerDetailModal.view === 'purchases' ? 'Compras do cliente' : 'Parcelas do cliente'}
                  </h2>
                  <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-blue-100">
                    {customerDetailModal.row.customerName}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomerDetailModal(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-lg text-white transition hover:bg-white/20"
                title="Fechar"
                aria-label="Fechar histórico do cliente"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {customerDetailModal.isLoading ? (
                <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50 p-10 text-center text-sm font-bold text-blue-700">
                  Consultando histórico financeiro do cliente...
                </div>
              ) : null}

              {customerDetailModal.error ? (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                  {customerDetailModal.error}
                </div>
              ) : null}

              {!customerDetailModal.isLoading && customerDetailModal.history ? (
                <>
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-blue-600">Total comprado</div>
                      <div className="mt-1 text-xl font-black text-[#061c3f]">{formatCurrency(customerDetailModal.history.totalPurchaseAmount)}</div>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-700">Total em aberto</div>
                      <div className="mt-1 text-xl font-black text-amber-800">{formatCurrency(customerDetailModal.history.openAmount)}</div>
                    </div>
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-rose-700">Total atrasado</div>
                      <div className="mt-1 text-xl font-black text-rose-800">{formatCurrency(customerDetailModal.history.overdueAmount)}</div>
                    </div>
                  </div>

                  {customerDetailModal.view === 'purchases' ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-xs text-slate-700">
                          <thead className="bg-slate-100 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Data</th>
                              <th className="px-4 py-3">Compra</th>
                              <th className="px-4 py-3 text-center">Parcelas</th>
                              <th className="px-4 py-3 text-right">Total</th>
                              <th className="px-4 py-3 text-right">Pago</th>
                              <th className="px-4 py-3 text-right">Em aberto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...customerDetailModal.history.sales]
                              .sort((left, right) => getDateTime(right.purchaseDate) - getDateTime(left.purchaseDate))
                              .map((sale, index) => (
                                <tr key={sale.id} className={`border-t border-slate-100 transition hover:bg-blue-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-100/80'}`}>
                                  <td className="whitespace-nowrap px-4 py-3 font-bold">{formatDateLabel(sale.purchaseDate)}</td>
                                  <td className="min-w-64 px-4 py-3">
                                    <div className="font-black uppercase text-slate-900">{sale.description || sale.sourceEntityName || 'COMPRA'}</div>
                                    <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{sale.classLabel || 'FINANCEIRO'}</div>
                                  </td>
                                  <td className="px-4 py-3 text-center font-black">{sale.installmentCount}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-black">{formatCurrency(sale.totalAmount)}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-emerald-700">{formatCurrency(sale.paidAmount)}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-amber-700">{formatCurrency(sale.openAmount)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {!customerDetailModal.history.sales.length ? (
                        <div className="p-8 text-center text-sm font-bold text-slate-500">Nenhuma compra encontrada para este cliente.</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-xs text-slate-700">
                          <thead className="bg-slate-100 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                            <tr>
                              <th className="w-12 px-3 py-3 text-center">Sel.</th>
                              <th className="px-4 py-3">Parcela</th>
                              <th className="px-4 py-3">Compra</th>
                              <th className="px-4 py-3">Vencimento</th>
                              <th className="px-4 py-3 text-right">Valor</th>
                              <th className="px-4 py-3 text-right">Em aberto</th>
                              <th className="px-4 py-3 text-center">Situação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerDetailModal.history.installments.map((installment, index) => {
                              const isOpen = String(installment.status || '').toUpperCase() === 'OPEN' && Number(installment.openAmount || 0) > 0;
                              const isSelected = customerDetailModal.selectedInstallmentIds.includes(installment.id);
                              return (
                                <tr key={installment.id} className={`border-t border-slate-100 transition ${isSelected ? 'bg-blue-100 outline outline-1 outline-inset outline-blue-400' : index % 2 === 0 ? 'bg-white hover:bg-slate-100' : 'bg-slate-100/80 hover:bg-slate-200'}`}>
                                  <td className="px-3 py-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={!isOpen}
                                      onChange={() => toggleCustomerInstallment(installment.id)}
                                      aria-label={`Selecionar parcela ${installment.installmentNumber} de ${installment.installmentCount}`}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    />
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 font-black">{installment.installmentNumber}/{installment.installmentCount}</td>
                                  <td className="min-w-64 px-4 py-3 font-black uppercase text-slate-900">{installment.saleDescription || installment.description || 'PARCELA'}</td>
                                  <td className="whitespace-nowrap px-4 py-3 font-bold">{formatDateLabel(installment.dueDate)}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-black">{formatCurrency(installment.amount)}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-black text-amber-700">{formatCurrency(installment.openAmount)}</td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${isOpen ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                                      {isOpen ? 'Em aberto' : 'Paga'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {!customerDetailModal.history.installments.length ? (
                        <div className="p-8 text-center text-sm font-bold text-slate-500">Nenhuma parcela encontrada para este cliente.</div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {customerDetailModal.view === 'installments' && selectableCustomerInstallments.length ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCustomerDetailModal((current) => current ? {
                        ...current,
                        selectedInstallmentIds: selectableCustomerInstallments.every((item) => current.selectedInstallmentIds.includes(item.id))
                          ? []
                          : selectableCustomerInstallments.map((item) => item.id),
                        error: '',
                      } : current)}
                      className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 transition hover:bg-blue-50"
                    >
                      {selectableCustomerInstallments.every((item) => customerDetailModal.selectedInstallmentIds.includes(item.id))
                        ? 'Desmarcar todas'
                        : 'Selecionar abertas'}
                    </button>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                      {customerDetailModal.selectedInstallmentIds.length} selecionada(s)
                    </div>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCustomerDetailModal(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
                >
                  Fechar
                </button>
                {customerDetailModal.view === 'installments' ? (
                  <button
                    type="button"
                    onClick={openSelectedManualSettlement}
                    disabled={!customerDetailModal.selectedInstallmentIds.length}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Dar baixa selecionadas
                  </button>
                ) : null}
              </div>
            </div>
            <div className="border-t border-slate-100 bg-white px-5 py-2">
              <ScreenNameCopy
                screenId={customerDetailModal.view === 'purchases' ? PURCHASES_POPUP_SCREEN_ID : INSTALLMENTS_POPUP_SCREEN_ID}
                className="max-w-full justify-end rounded-xl bg-slate-50 px-2 py-1 text-right"
                originText="Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/recebiveis/recebimentos-por-cliente/page.tsx"
                auditText="Consulta de compras e parcelas do cliente, com seleção de parcelas abertas para baixa manual."
              />
            </div>
          </div>
        </section>
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
