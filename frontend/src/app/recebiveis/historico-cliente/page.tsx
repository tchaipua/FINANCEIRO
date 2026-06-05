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
import { buildFinanceApiQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type CustomerSale = {
  id: string;
  titleId: string;
  businessKey: string | null;
  description: string;
  sourceEntityName: string | null;
  classLabel: string | null;
  purchaseDate: string | null;
  totalAmount: number;
  openAmount: number;
  paidAmount: number;
  installmentCount: number;
  openInstallmentCount: number;
  paidInstallmentCount: number;
  overdueAmount: number;
  lastPaymentDate: string | null;
};

type CustomerInstallment = {
  id: string;
  titleId: string;
  saleDescription: string;
  description: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string | null;
  amount: number;
  openAmount: number;
  paidAmount: number;
  status: string;
  settlementMethod: string | null;
  settledAt: string | null;
  suggestedInterestAmount: number;
  suggestedPenaltyAmount: number;
  overdueDays: number;
  paidInterestAmount: number;
  paidPenaltyAmount: number;
  paidDiscountAmount: number;
  lastPaymentDate: string | null;
};

type CustomerHistoryRow = {
  id: string;
  customerName: string;
  customerDocument: string | null;
  totalPurchaseAmount: number;
  openAmount: number;
  firstPurchaseDate: string | null;
  lastPaymentDate: string | null;
  overdueAmount: number;
  sales: CustomerSale[];
  installments: CustomerInstallment[];
};

type AlertState = {
  type: 'warning' | 'error';
  title: string;
  message: string;
};

type CustomerHistoryColumnKey =
  | 'customerName'
  | 'totalPurchaseAmount'
  | 'openAmount'
  | 'firstPurchaseDate'
  | 'lastPaymentDate'
  | 'overdueAmount';

type CustomerHistoryFilters = Record<CustomerHistoryColumnKey, string>;

type CustomerHistorySort = {
  key: CustomerHistoryColumnKey | null;
  direction: 'ASC' | 'DESC';
};

type GridConfig = {
  order: CustomerHistoryColumnKey[];
  hidden: CustomerHistoryColumnKey[];
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_HISTORICO_CLIENTE';
const FINANCE_SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_HISTORICO_CLIENTE';
const SALES_POPUP_ID = 'POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_CLIENTE_VENDAS';
const INSTALLMENTS_POPUP_ID = 'POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_CLIENTE_PARCELAS';
const cardClass = FINANCE_GRID_PAGE_LAYOUT.card;
const GRID_STORAGE_PREFIX = 'financeiro:historico-cliente:grid-columns:';
const EXPORT_STORAGE_PREFIX = 'financeiro:historico-cliente:export-config:';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_SORT: CustomerHistorySort = { key: 'customerName', direction: 'ASC' };

const CUSTOMER_HISTORY_COLUMNS: GridColumnDefinition<CustomerHistoryRow, CustomerHistoryColumnKey>[] = [
  { key: 'customerName', label: 'Nome cliente', getValue: (row) => row.customerName || '---' },
  {
    key: 'totalPurchaseAmount',
    label: 'Valor total compras',
    getValue: (row) => formatCurrency(row.totalPurchaseAmount),
    align: 'right',
  },
  { key: 'openAmount', label: 'Valor aberto', getValue: (row) => formatCurrency(row.openAmount), align: 'right' },
  {
    key: 'firstPurchaseDate',
    label: 'Primeira compra',
    getValue: (row) => formatDateLabel(row.firstPurchaseDate || ''),
    align: 'center',
  },
  {
    key: 'lastPaymentDate',
    label: 'Último pagamento',
    getValue: (row) => formatDateLabel(row.lastPaymentDate || ''),
    align: 'center',
  },
  {
    key: 'overdueAmount',
    label: 'Valor em atraso',
    getValue: (row) => formatCurrency(row.overdueAmount),
    align: 'right',
  },
];

const DEFAULT_FILTERS: CustomerHistoryFilters = {
  customerName: '',
  totalPurchaseAmount: '',
  openAmount: '',
  firstPurchaseDate: '',
  lastPaymentDate: '',
  overdueAmount: '',
};

const DEFAULT_GRID_CONFIG: GridConfig = {
  order: CUSTOMER_HISTORY_COLUMNS.map((column) => column.key),
  hidden: [],
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

function getDateTime(value: string | null | undefined) {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function getColumnValue(row: CustomerHistoryRow, key: CustomerHistoryColumnKey) {
  if (key === 'customerName') return row.customerName;
  if (key === 'totalPurchaseAmount') return formatCurrency(row.totalPurchaseAmount);
  if (key === 'openAmount') return formatCurrency(row.openAmount);
  if (key === 'firstPurchaseDate') return formatDateLabel(row.firstPurchaseDate || '');
  if (key === 'lastPaymentDate') return formatDateLabel(row.lastPaymentDate || '');
  if (key === 'overdueAmount') return formatCurrency(row.overdueAmount);
  return '';
}

function compareRows(left: CustomerHistoryRow, right: CustomerHistoryRow, sort: CustomerHistorySort) {
  if (!sort.key) return 0;

  let leftValue: string | number = getColumnValue(left, sort.key);
  let rightValue: string | number = getColumnValue(right, sort.key);

  if (sort.key === 'totalPurchaseAmount' || sort.key === 'openAmount' || sort.key === 'overdueAmount') {
    leftValue = Number(left[sort.key] || 0);
    rightValue = Number(right[sort.key] || 0);
  }

  if (sort.key === 'firstPurchaseDate' || sort.key === 'lastPaymentDate') {
    leftValue = getDateTime(left[sort.key]);
    rightValue = getDateTime(right[sort.key]);
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

function normalizeGridConfig(config: Partial<GridConfig> | null | undefined): GridConfig {
  const allKeys = CUSTOMER_HISTORY_COLUMNS.map((column) => column.key);
  const validOrder = (config?.order || []).filter((item): item is CustomerHistoryColumnKey =>
    allKeys.includes(item as CustomerHistoryColumnKey),
  );
  const validHidden = (config?.hidden || []).filter((item): item is CustomerHistoryColumnKey =>
    allKeys.includes(item as CustomerHistoryColumnKey),
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

function ClearFiltersIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l3 3m0-3-3 3" />
    </svg>
  );
}

function SalesIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function InstallmentsIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
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
  columns: GridColumnDefinition<CustomerHistoryRow, CustomerHistoryColumnKey>[];
  order: CustomerHistoryColumnKey[];
  hidden: CustomerHistoryColumnKey[];
  onSave: (order: CustomerHistoryColumnKey[], hidden: CustomerHistoryColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftHidden, setDraftHidden] = useState<CustomerHistoryColumnKey[]>(hidden);

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
                    current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
                  )
                }
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                  isVisible ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'
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

export default function FinanceiroHistoricoClientePage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [rows, setRows] = useState<CustomerHistoryRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ALL');
  const [clientSearch, setClientSearch] = useState('');
  const [filterDrafts, setFilterDrafts] = useState<CustomerHistoryFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CustomerHistoryFilters>(DEFAULT_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] = useState<CustomerHistoryColumnKey | null>(null);
  const [gridSort, setGridSort] = useState<CustomerHistorySort>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<CustomerHistoryColumnKey[]>(DEFAULT_GRID_CONFIG.order);
  const [hiddenColumns, setHiddenColumns] = useState<CustomerHistoryColumnKey[]>(DEFAULT_GRID_CONFIG.hidden);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<CustomerHistoryColumnKey, boolean>>(
    buildDefaultExportColumns(CUSTOMER_HISTORY_COLUMNS),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [salesRow, setSalesRow] = useState<CustomerHistoryRow | null>(null);
  const [installmentsRow, setInstallmentsRow] = useState<CustomerHistoryRow | null>(null);

  const loadRows = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setAlert(null);
      const payload = await requestJson<CustomerHistoryRow[]>(
        `/receivables/customer-history${buildFinanceApiQueryString(runtimeContext)}`,
        {
          fallbackMessage: 'Não foi possível carregar o histórico por cliente.',
        },
      );
      setRows(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setRows([]);
      setAlert({
        type: 'error',
        title: 'Erro ao carregar histórico',
        message: getFriendlyRequestErrorMessage(error, 'Não foi possível carregar o histórico por cliente.'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

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
      JSON.stringify({ order: columnOrder, hidden: hiddenColumns } satisfies GridConfig),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  const visibleColumns = useMemo(
    () =>
      columnOrder
        .map((key) => CUSTOMER_HISTORY_COLUMNS.find((column) => column.key === key))
        .filter((column): column is GridColumnDefinition<CustomerHistoryRow, CustomerHistoryColumnKey> => Boolean(column))
        .filter((column) => !hiddenColumns.includes(column.key)),
    [columnOrder, hiddenColumns],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeFilterText(clientSearch);
    const baseRows = statusFilter === 'ACTIVE' ? rows.filter((row) => row.openAmount > 0) : rows;
    const filtered = baseRows.filter((row) => {
      if (normalizedSearch) {
        const rowText = [row.customerName, row.customerDocument, formatCurrency(row.openAmount)].join(' ');
        if (!normalizeFilterText(rowText).includes(normalizedSearch)) return false;
      }

      return (Object.keys(appliedFilters) as CustomerHistoryColumnKey[]).every((key) =>
        includesFilterText(getColumnValue(row, key), appliedFilters[key]),
      );
    });

    return [...filtered].sort((left, right) => compareRows(left, right, gridSort));
  }, [appliedFilters, clientSearch, gridSort, rows, statusFilter]);

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (summary, row) => ({
          totalPurchaseAmount: summary.totalPurchaseAmount + row.totalPurchaseAmount,
          openAmount: summary.openAmount + row.openAmount,
          overdueAmount: summary.overdueAmount + row.overdueAmount,
        }),
        { totalPurchaseAmount: 0, openAmount: 0, overdueAmount: 0 },
      ),
    [filteredRows],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const normalizedCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRows = useMemo(() => {
    const startIndex = (normalizedCurrentPage - 1) * pageSize;
    return filteredRows.slice(startIndex, startIndex + pageSize);
  }, [filteredRows, normalizedCurrentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters, clientSearch, pageSize, statusFilter]);

  function applyColumnFilter(columnKey: CustomerHistoryColumnKey) {
    setAppliedFilters((current) => ({ ...current, [columnKey]: filterDrafts[columnKey] }));
    setActiveFilterColumn(null);
  }

  function clearColumnFilter(columnKey: CustomerHistoryColumnKey) {
    setFilterDrafts((current) => ({ ...current, [columnKey]: '' }));
    setAppliedFilters((current) => ({ ...current, [columnKey]: '' }));
    setActiveFilterColumn(null);
  }

  function clearAllFilters() {
    setClientSearch('');
    setFilterDrafts(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setGridSort(DEFAULT_SORT);
    setActiveFilterColumn(null);
  }

  function renderColumnHeader(column: GridColumnDefinition<CustomerHistoryRow, CustomerHistoryColumnKey>) {
    return (
      <GridColumnFilterHeader
        label={column.label}
        isOpen={activeFilterColumn === column.key}
        isActive={Boolean(appliedFilters[column.key])}
        filterValue={filterDrafts[column.key]}
        align={column.align === 'right' ? 'right' : 'left'}
        sortDirection={gridSort.key === column.key ? gridSort.direction : null}
        onToggle={() => {
          setFilterDrafts((current) => ({ ...current, [column.key]: appliedFilters[column.key] }));
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

  const hasActiveFilters = Object.values(appliedFilters).some(Boolean) || Boolean(clientSearch);

  return (
    <div className={runtimeContext.embedded ? 'flex h-screen min-h-0 flex-col overflow-hidden' : FINANCE_GRID_PAGE_LAYOUT.shell}>
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Contas a receber</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Histórico Cliente</h1>
            <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
              Consulte compras, parcelas, pagamentos e valores em atraso por cliente.
            </p>
          </div>
        </section>
      ) : null}

      {alert ? (
        <section className={`${cardClass} shrink-0 border-rose-200 bg-rose-50 px-6 py-4 text-sm font-semibold text-rose-700`}>
          <div className="text-[11px] font-black uppercase tracking-[0.18em]">{alert.title}</div>
          <div className="mt-1">{alert.message}</div>
        </section>
      ) : null}

      <section className={`${cardClass} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input
              value={clientSearch}
              onChange={(event) => setClientSearch(normalizeUpperInput(event.target.value))}
              className={FINANCE_GRID_PAGE_LAYOUT.input}
              placeholder="CONSULTA POR CLIENTE"
              aria-label="Consulta por cliente"
            />
            <button
              type="button"
              onClick={() => void loadRows()}
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
                      hasActiveFilters
                        ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                    }`}
                  >
                    <ClearFiltersIcon />
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
                <th className="w-28 px-4 py-3 text-center">Ações</th>
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
                        <div>
                          <div className="font-black text-slate-900">{row.customerName}</div>
                          {row.customerDocument ? (
                            <div className="mt-1 text-[11px] font-bold text-slate-500">{row.customerDocument}</div>
                          ) : null}
                        </div>
                      ) : column.key === 'totalPurchaseAmount' ? (
                        <span className="font-black text-slate-900">{formatCurrency(row.totalPurchaseAmount)}</span>
                      ) : column.key === 'openAmount' ? (
                        <span className="font-black text-blue-700">{formatCurrency(row.openAmount)}</span>
                      ) : column.key === 'overdueAmount' ? (
                        <span className="font-black text-rose-700">{formatCurrency(row.overdueAmount)}</span>
                      ) : column.key === 'firstPurchaseDate' ? (
                        formatDateLabel(row.firstPurchaseDate || '')
                      ) : column.key === 'lastPaymentDate' ? (
                        formatDateLabel(row.lastPaymentDate || '')
                      ) : (
                        column.getValue(row)
                      )}
                    </td>
                  ))}
                  <td className="w-28 px-4 py-4 text-center">
                    <div className="grid grid-cols-2 items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSalesRow(row);
                        }}
                        title="Consultar vendas"
                        aria-label={`Consultar vendas de ${row.customerName}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                      >
                        <SalesIcon />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setInstallmentsRow(row);
                        }}
                        title="Consultar parcelas"
                        aria-label={`Consultar parcelas de ${row.customerName}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                      >
                        <InstallmentsIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && !paginatedRows.length ? (
                <tr>
                  <td colSpan={(visibleColumns.length || 1) + 2} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum histórico encontrado para os filtros atuais.
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr>
                  <td colSpan={(visibleColumns.length || 1) + 2} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Carregando histórico por cliente...
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
                <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalRecordsPill}>{filteredRows.length} registro(s)</span>
              </td>
              {visibleColumns.map((column) => (
                <td
                  key={column.key}
                  className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} ${
                    column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''
                  }`}
                >
                  {column.key === 'totalPurchaseAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.totalPurchaseAmount)}</span>
                  ) : column.key === 'openAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.openAmount)}</span>
                  ) : column.key === 'overdueAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.overdueAmount)}</span>
                  ) : null}
                </td>
              ))}
              <td className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} w-28`} />
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
          showRecordSummary={false}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onStatusFilterChange={setStatusFilter}
          onPageSizeChange={setPageSize}
          onPageChange={setCurrentPage}
        >
          {!runtimeContext.embedded ? <ScreenNameCopy screenId={FINANCE_SCREEN_ID} className="justify-end" /> : null}
        </GridStandardFooter>
      </section>

      <GridConfigModal
        isOpen={isColumnConfigOpen}
        columns={CUSTOMER_HISTORY_COLUMNS}
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
        title="Exportar histórico cliente"
        description={`A exportação respeita os filtros atuais e inclui ${filteredRows.length} cliente(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={CUSTOMER_HISTORY_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
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
                  .map((key) => CUSTOMER_HISTORY_COLUMNS.find((column) => column.key === key))
                  .filter((column): column is GridColumnDefinition<CustomerHistoryRow, CustomerHistoryColumnKey> => Boolean(column))
              : CUSTOMER_HISTORY_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: 'historico-cliente',
            branding: {
              title: 'Histórico Cliente',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: runtimeContext.companyName || 'FINANCEIRO',
              logoUrl: runtimeContext.logoUrl,
            },
          });
          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />

      {salesRow ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <section className={`${cardClass} flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden`}>
            <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Vendas do cliente</div>
                <h2 className="mt-1 text-xl font-black text-slate-900">{salesRow.customerName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSalesRow(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="sticky top-0 bg-slate-50 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Venda</th>
                    <th className="px-4 py-3 text-center">Data</th>
                    <th className="px-4 py-3 text-center">Parcelas</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Aberto</th>
                    <th className="px-4 py-3 text-right">Pago</th>
                    <th className="px-4 py-3 text-right">Atraso</th>
                    <th className="px-4 py-3 text-center">Último pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {salesRow.sales.map((sale) => (
                    <tr key={sale.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-black text-slate-900">{sale.description || '---'}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">{sale.businessKey || sale.titleId}</div>
                      </td>
                      <td className="px-4 py-3 text-center">{formatDateLabel(sale.purchaseDate || '')}</td>
                      <td className="px-4 py-3 text-center font-black text-slate-900">
                        {sale.installmentCount} ({sale.openInstallmentCount} abertas)
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(sale.totalAmount)}</td>
                      <td className="px-4 py-3 text-right font-black text-blue-700">{formatCurrency(sale.openAmount)}</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">{formatCurrency(sale.paidAmount)}</td>
                      <td className="px-4 py-3 text-right font-black text-rose-700">{formatCurrency(sale.overdueAmount)}</td>
                      <td className="px-4 py-3 text-center">{formatDateLabel(sale.lastPaymentDate || '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-5 flex justify-end">
                <ScreenNameCopy screenId={SALES_POPUP_ID} className="justify-end" />
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {installmentsRow ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <section className={`${cardClass} flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden`}>
            <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Parcelas do cliente</div>
                <h2 className="mt-1 text-xl font-black text-slate-900">{installmentsRow.customerName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setInstallmentsRow(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="sticky top-0 bg-slate-50 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Parcela</th>
                    <th className="px-4 py-3 text-center">Vencimento</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-right">Aberto</th>
                    <th className="px-4 py-3 text-right">Pago</th>
                    <th className="px-4 py-3 text-right">Juros aberto</th>
                    <th className="px-4 py-3 text-right">Juros pagos</th>
                    <th className="px-4 py-3 text-right">Desconto pago</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Último pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {installmentsRow.installments.map((installment) => (
                    <tr
                      key={installment.id}
                      className={`border-t border-slate-100 ${
                        installment.status === 'OPEN' && installment.overdueDays > 0 ? 'bg-rose-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-black text-slate-900">{installment.description}</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {installment.installmentNumber}/{installment.installmentCount} - {installment.saleDescription}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">{formatDateLabel(installment.dueDate || '')}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(installment.amount)}</td>
                      <td className="px-4 py-3 text-right font-black text-blue-700">{formatCurrency(installment.openAmount)}</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">{formatCurrency(installment.paidAmount)}</td>
                      <td className="px-4 py-3 text-right font-black text-amber-700">
                        {formatCurrency(installment.suggestedInterestAmount + installment.suggestedPenaltyAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-amber-700">
                        {formatCurrency(installment.paidInterestAmount + installment.paidPenaltyAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-700">
                        {formatCurrency(installment.paidDiscountAmount)}
                      </td>
                      <td className="px-4 py-3 text-center font-black text-slate-900">
                        {installment.status === 'PAID' ? 'BAIXADA' : 'ABERTA'}
                      </td>
                      <td className="px-4 py-3 text-center">{formatDateLabel(installment.lastPaymentDate || installment.settledAt || '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-5 flex justify-end">
                <ScreenNameCopy screenId={INSTALLMENTS_POPUP_ID} className="justify-end" />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
