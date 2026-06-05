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

function SettlementIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m4-9.5c-.75-1-2.05-1.5-4-1.5-2.2 0-3.5.9-3.5 2.35 0 1.65 1.55 2.05 3.7 2.35 2.15.3 3.8.75 3.8 2.45 0 1.45-1.35 2.35-3.75 2.35-2 0-3.45-.55-4.25-1.55" />
    </svg>
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

  function handleOpenManualSettlement(row: CustomerReceivableRow) {
    if (!row.installmentIds.length) {
      setAlert({
        type: 'warning',
        title: 'Sem parcelas',
        message: 'Este cliente não possui parcelas abertas para baixa.',
      });
      return;
    }

    const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
    const separator = navigationQuery ? '&' : '?';
    const partialAmount = Math.max(row.totalDueAmount, row.totalOpenAmount);
    setFinanceSettlementUrl(
      `/recebiveis/baixa-manual${navigationQuery}${separator}modal=1&partial=1&partialAmount=${encodeURIComponent(
        partialAmount.toFixed(2),
      )}&installmentIds=${encodeURIComponent(row.installmentIds.join(','))}`,
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
                <th className="w-20 px-4 py-3 text-center">Baixa</th>
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
                  <td className="w-20 px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOpenManualSettlement(row);
                      }}
                      title="Dar baixa"
                      aria-label={`Dar baixa de ${row.customerName}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
                    >
                      <SettlementIcon />
                    </button>
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
              <td className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} w-20`} />
            </tr>
          </tfoot>
        </table>

        <GridStandardFooter
          statusFilter={statusFilter}
          totalRecords={filteredRows.length}
          pageSize={pageSize}
          currentPage={normalizedCurrentPage}
          totalPages={totalPages}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          aggregateSummaries={[
            { label: 'Parcelas', value: String(totals.installmentCount) },
            { label: 'Em aberto', value: formatCurrency(totals.totalOpenAmount) },
            { label: 'Juros', value: formatCurrency(totals.interestAmount) },
          ]}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onStatusFilterChange={setStatusFilter}
          onPageSizeChange={setPageSize}
          onPageChange={setCurrentPage}
        >
          <ScreenNameCopy
            screenId={runtimeContext.embedded ? SCREEN_ID : FINANCE_SCREEN_ID}
            className="justify-end"
          />
        </GridStandardFooter>
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
