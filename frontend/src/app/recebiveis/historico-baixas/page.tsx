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

type SettlementDetailItem = {
  settlementId: string;
  installmentId: string;
  description: string;
  customerName: string;
  dueDate: string | null;
  installmentNumber: number;
  installmentCount: number;
  receivedAmount: number;
  discountAmount: number;
  interestAmount: number;
  penaltyAmount: number;
  paymentMethodLabel: string;
  status: 'ACTIVE' | 'REVERSED';
  settledAt: string;
  canceledAt?: string | null;
};

type SettlementHistoryRow = {
  id: string;
  settlementGroupId: string;
  settledAt: string;
  customerName: string;
  installmentCount: number;
  receivedAmount: number;
  discountAmount: number;
  interestAmount: number;
  penaltyAmount: number;
  paymentMethodLabel: string;
  cashierDisplayName: string;
  status: 'ACTIVE' | 'REVERSED';
  statusLabel: string;
  canReverse: boolean;
  installments: SettlementDetailItem[];
};

type AlertState = {
  type: 'success' | 'warning' | 'error';
  title: string;
  message: string;
};

type SettlementColumnKey =
  | 'settledAt'
  | 'customerName'
  | 'installmentCount'
  | 'receivedAmount'
  | 'interestAmount'
  | 'paymentMethodLabel';

type SettlementFilters = Record<SettlementColumnKey, string>;

type SettlementSort = {
  key: SettlementColumnKey | null;
  direction: 'ASC' | 'DESC';
};

type GridConfig = {
  order: SettlementColumnKey[];
  hidden: SettlementColumnKey[];
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_HISTORICO_BAIXAS';
const FINANCE_SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_HISTORICO_BAIXAS';
const DETAIL_POPUP_ID = 'POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_BAIXAS_DETALHE';
const REVERSE_POPUP_ID = 'POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_BAIXAS_ESTORNO';
const cardClass = FINANCE_GRID_PAGE_LAYOUT.card;
const GRID_STORAGE_PREFIX = 'financeiro:historico-baixas:grid-columns:';
const EXPORT_STORAGE_PREFIX = 'financeiro:historico-baixas:export-config:';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_SORT: SettlementSort = { key: 'settledAt', direction: 'DESC' };

const SETTLEMENT_COLUMNS: GridColumnDefinition<SettlementHistoryRow, SettlementColumnKey>[] = [
  { key: 'settledAt', label: 'Data baixa', getValue: (row) => formatDateTimeLabel(row.settledAt), align: 'center' },
  { key: 'customerName', label: 'Cliente', getValue: (row) => row.customerName || '---' },
  { key: 'installmentCount', label: 'Parcelas', getValue: (row) => String(row.installmentCount), align: 'center' },
  { key: 'receivedAmount', label: 'Valor baixado', getValue: (row) => formatCurrency(row.receivedAmount), align: 'right' },
  { key: 'interestAmount', label: 'Juros', getValue: (row) => formatCurrency(row.interestAmount), align: 'right' },
  { key: 'paymentMethodLabel', label: 'Forma', getValue: (row) => row.paymentMethodLabel || '---' },
];

const DEFAULT_FILTERS: SettlementFilters = {
  settledAt: '',
  customerName: '',
  installmentCount: '',
  receivedAmount: '',
  interestAmount: '',
  paymentMethodLabel: '',
};

const DEFAULT_GRID_CONFIG: GridConfig = {
  order: SETTLEMENT_COLUMNS.map((column) => column.key),
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

function formatDateTimeLabel(value: string | null | undefined) {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.getTime())) return '---';

  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getColumnValue(row: SettlementHistoryRow, key: SettlementColumnKey) {
  if (key === 'settledAt') return formatDateTimeLabel(row.settledAt);
  if (key === 'customerName') return row.customerName;
  if (key === 'installmentCount') return String(row.installmentCount);
  if (key === 'receivedAmount') return formatCurrency(row.receivedAmount);
  if (key === 'interestAmount') return formatCurrency(row.interestAmount);
  if (key === 'paymentMethodLabel') return row.paymentMethodLabel;
  return '';
}

function compareRows(left: SettlementHistoryRow, right: SettlementHistoryRow, sort: SettlementSort) {
  if (!sort.key) return 0;

  let leftValue: string | number = getColumnValue(left, sort.key);
  let rightValue: string | number = getColumnValue(right, sort.key);

  if (sort.key === 'settledAt') {
    leftValue = getDateTime(left.settledAt);
    rightValue = getDateTime(right.settledAt);
  }

  if (sort.key === 'installmentCount' || sort.key === 'receivedAmount' || sort.key === 'interestAmount') {
    leftValue = Number(left[sort.key] || 0);
    rightValue = Number(right[sort.key] || 0);
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
  const allKeys = SETTLEMENT_COLUMNS.map((column) => column.key);
  const validOrder = (config?.order || []).filter((item): item is SettlementColumnKey =>
    allKeys.includes(item as SettlementColumnKey),
  );
  const validHidden = (config?.hidden || []).filter((item): item is SettlementColumnKey =>
    allKeys.includes(item as SettlementColumnKey),
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
  columns: GridColumnDefinition<SettlementHistoryRow, SettlementColumnKey>[];
  order: SettlementColumnKey[];
  hidden: SettlementColumnKey[];
  onSave: (order: SettlementColumnKey[], hidden: SettlementColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftHidden, setDraftHidden] = useState<SettlementColumnKey[]>(hidden);

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

function ClearFiltersIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l3 3m0-3-3 3" />
    </svg>
  );
}

function MagnifierIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
    </svg>
  );
}

function ReverseIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14 4 9m0 0 5-5M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

function SettlementStatusDot({ status }: { status: SettlementHistoryRow['status'] }) {
  const isReversed = status === 'REVERSED';

  return (
    <span
      title={isReversed ? 'Baixa estornada' : 'Baixa ativa'}
      aria-label={isReversed ? 'Baixa estornada' : 'Baixa ativa'}
      className={`inline-flex h-3.5 w-3.5 rounded-full border shadow-sm ${
        isReversed
          ? 'border-rose-700 bg-rose-500 shadow-rose-500/30'
          : 'border-emerald-700 bg-emerald-500 shadow-emerald-500/30'
      }`}
    />
  );
}

export default function FinanceiroHistoricoBaixasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [rows, setRows] = useState<SettlementHistoryRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ALL');
  const [generalSearch, setGeneralSearch] = useState('');
  const [filterDrafts, setFilterDrafts] = useState<SettlementFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<SettlementFilters>(DEFAULT_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] = useState<SettlementColumnKey | null>(null);
  const [gridSort, setGridSort] = useState<SettlementSort>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<SettlementColumnKey[]>(DEFAULT_GRID_CONFIG.order);
  const [hiddenColumns, setHiddenColumns] = useState<SettlementColumnKey[]>(DEFAULT_GRID_CONFIG.hidden);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<SettlementColumnKey, boolean>>(
    buildDefaultExportColumns(SETTLEMENT_COLUMNS),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isReversing, setIsReversing] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [detailRow, setDetailRow] = useState<SettlementHistoryRow | null>(null);
  const [reverseRow, setReverseRow] = useState<SettlementHistoryRow | null>(null);

  const loadRows = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setAlert(null);
      const payload = await requestJson<SettlementHistoryRow[]>(
        `/receivables/settlements${buildFinanceApiQueryString(runtimeContext)}`,
        {
          fallbackMessage: 'Não foi possível carregar o histórico de baixas.',
        },
      );
      setRows(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setRows([]);
      setAlert({
        type: 'error',
        title: 'Erro ao carregar histórico',
        message: getFriendlyRequestErrorMessage(error, 'Não foi possível carregar o histórico de baixas.'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    const storedConfig = readStoredGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({ order: columnOrder, hidden: hiddenColumns }),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  const visibleColumns = useMemo(
    () =>
      columnOrder
        .map((key) => SETTLEMENT_COLUMNS.find((column) => column.key === key))
        .filter((column): column is GridColumnDefinition<SettlementHistoryRow, SettlementColumnKey> => Boolean(column))
        .filter((column) => !hiddenColumns.includes(column.key)),
    [columnOrder, hiddenColumns],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeFilterText(generalSearch);
    const statusRows = rows.filter((row) => {
      if (statusFilter === 'ACTIVE') return row.status === 'ACTIVE';
      if (statusFilter === 'INACTIVE') return row.status === 'REVERSED';
      return true;
    });

    const filtered = statusRows.filter((row) => {
      if (normalizedSearch) {
        const rowText = [
                      row.customerName,
                      row.paymentMethodLabel,
                      formatCurrency(row.receivedAmount),
                      formatDateTimeLabel(row.settledAt),
                    ].join(' ');

        if (!normalizeFilterText(rowText).includes(normalizedSearch)) return false;
      }

      return (Object.keys(appliedFilters) as SettlementColumnKey[]).every((key) =>
        includesFilterText(getColumnValue(row, key), appliedFilters[key]),
      );
    });

    return [...filtered].sort((left, right) => compareRows(left, right, gridSort));
  }, [appliedFilters, generalSearch, gridSort, rows, statusFilter]);

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (summary, row) => ({
          installmentCount: summary.installmentCount + row.installmentCount,
          receivedAmount: summary.receivedAmount + row.receivedAmount,
          interestAmount: summary.interestAmount + row.interestAmount,
        }),
        { installmentCount: 0, receivedAmount: 0, interestAmount: 0 },
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
  }, [appliedFilters, generalSearch, pageSize, statusFilter]);

  function applyColumnFilter(columnKey: SettlementColumnKey) {
    setAppliedFilters((current) => ({ ...current, [columnKey]: filterDrafts[columnKey] }));
    setActiveFilterColumn(null);
  }

  function clearColumnFilter(columnKey: SettlementColumnKey) {
    setFilterDrafts((current) => ({ ...current, [columnKey]: '' }));
    setAppliedFilters((current) => ({ ...current, [columnKey]: '' }));
    setActiveFilterColumn(null);
  }

  function clearAllFilters() {
    setGeneralSearch('');
    setFilterDrafts(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setGridSort(DEFAULT_SORT);
    setActiveFilterColumn(null);
  }

  async function confirmReverseSettlement() {
    if (!reverseRow || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || isReversing) return;

    try {
      setIsReversing(true);
      setAlert(null);
      const payload = await requestJson<{ message?: string; reversedAmount?: number }>(
        `/receivables/settlements/${encodeURIComponent(reverseRow.settlementGroupId)}/reverse`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            cashierUserId: runtimeContext.cashierUserId || undefined,
            cashierDisplayName: runtimeContext.cashierDisplayName || undefined,
            requestedBy: runtimeContext.cashierDisplayName || runtimeContext.cashierUserId || undefined,
            reason: 'ESTORNO SOLICITADO NO HISTÓRICO DE BAIXAS',
          }),
          fallbackMessage: 'Não foi possível estornar a baixa selecionada.',
        },
      );

      setReverseRow(null);
      setAlert({
        type: 'success',
        title: 'Baixa estornada',
        message:
          payload?.message ||
          `Baixa estornada com sucesso. Valor estornado: ${formatCurrency(reverseRow.receivedAmount)}.`,
      });
      await loadRows();
    } catch (error) {
      setAlert({
        type: 'error',
        title: 'Erro ao estornar baixa',
        message: getFriendlyRequestErrorMessage(error, 'Não foi possível estornar a baixa selecionada.'),
      });
    } finally {
      setIsReversing(false);
    }
  }

  function renderColumnHeader(column: GridColumnDefinition<SettlementHistoryRow, SettlementColumnKey>) {
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

  const hasActiveFilters = Object.values(appliedFilters).some(Boolean) || Boolean(generalSearch);

  return (
    <div className={runtimeContext.embedded ? 'flex h-screen min-h-0 flex-col overflow-hidden' : FINANCE_GRID_PAGE_LAYOUT.shell}>
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Contas a receber</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Histórico Baixas</h1>
            <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
              Consulte baixas de parcelas e estorne lançamentos quando necessário.
            </p>
          </div>
        </section>
      ) : null}

      {alert ? (
        <section
          className={`${cardClass} shrink-0 px-6 py-4 text-sm font-semibold ${
            alert.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : alert.type === 'warning'
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
              value={generalSearch}
              onChange={(event) => setGeneralSearch(normalizeUpperInput(event.target.value))}
              className={FINANCE_GRID_PAGE_LAYOUT.input}
              placeholder="PESQUISAR NO GRID"
              aria-label="Pesquisar no grid"
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
                    row.status === 'REVERSED'
                      ? selectedRowId === row.id
                        ? 'bg-rose-200 text-rose-950 outline outline-1 outline-rose-500'
                        : 'bg-rose-100 text-rose-950 hover:bg-rose-200'
                      : selectedRowId === row.id
                      ? 'bg-blue-100 outline outline-1 outline-blue-400'
                      : index % 2 === 0
                        ? 'bg-white hover:bg-slate-100'
                        : 'bg-slate-200/70 hover:bg-slate-300/70'
                  }`}
                >
                  <td className="w-12 px-3 py-4 text-center">
                    <SettlementStatusDot status={row.status} />
                  </td>
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-4 ${
                        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {column.key === 'settledAt' ? (
                        <span className={`font-black ${row.status === 'REVERSED' ? 'text-rose-950' : 'text-slate-900'}`}>
                          {formatDateTimeLabel(row.settledAt)}
                        </span>
                      ) : column.key === 'customerName' ? (
                        <div className={`font-black ${row.status === 'REVERSED' ? 'text-rose-950' : 'text-slate-900'}`}>
                          {row.customerName}
                        </div>
                      ) : column.key === 'installmentCount' ? (
                        <span className={`font-black ${row.status === 'REVERSED' ? 'text-rose-950' : 'text-slate-900'}`}>
                          {row.installmentCount}
                        </span>
                      ) : column.key === 'receivedAmount' ? (
                        <span className={`font-black ${row.status === 'REVERSED' ? 'text-rose-950' : 'text-blue-700'}`}>
                          {formatCurrency(row.receivedAmount)}
                        </span>
                      ) : column.key === 'interestAmount' ? (
                        <span className={`font-black ${row.status === 'REVERSED' ? 'text-rose-950' : 'text-amber-700'}`}>
                          {formatCurrency(row.interestAmount)}
                        </span>
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
                          setDetailRow(row);
                        }}
                        title="Consultar informações da baixa"
                        aria-label="Consultar informações da baixa"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                      >
                        <MagnifierIcon />
                      </button>
                      {row.canReverse ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setReverseRow(row);
                          }}
                          title="Estornar baixa"
                          aria-label="Estornar baixa"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500 text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-600"
                        >
                          <ReverseIcon />
                        </button>
                      ) : (
                        <span className="h-9 w-9" aria-hidden="true" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && !paginatedRows.length ? (
                <tr>
                  <td colSpan={(visibleColumns.length || 1) + 2} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhuma baixa encontrada para os filtros atuais.
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr>
                  <td colSpan={(visibleColumns.length || 1) + 2} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Carregando histórico de baixas...
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
                  {column.key === 'installmentCount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{totals.installmentCount}</span>
                  ) : column.key === 'receivedAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.receivedAmount)}</span>
                  ) : column.key === 'interestAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.interestAmount)}</span>
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
          aggregateSummaries={[
            { label: 'Parcelas', value: String(totals.installmentCount) },
            { label: 'Baixado', value: formatCurrency(totals.receivedAmount) },
            { label: 'Juros', value: formatCurrency(totals.interestAmount) },
          ]}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onStatusFilterChange={setStatusFilter}
          onPageSizeChange={setPageSize}
          onPageChange={setCurrentPage}
        >
          <ScreenNameCopy screenId={runtimeContext.embedded ? SCREEN_ID : FINANCE_SCREEN_ID} className="justify-end" />
        </GridStandardFooter>
      </section>

      <GridConfigModal
        isOpen={isColumnConfigOpen}
        columns={SETTLEMENT_COLUMNS}
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
        title="Exportar histórico de baixas"
        description={`A exportação respeita os filtros atuais e inclui ${filteredRows.length} baixa(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={SETTLEMENT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
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
                  .map((key) => SETTLEMENT_COLUMNS.find((column) => column.key === key))
                  .filter((column): column is GridColumnDefinition<SettlementHistoryRow, SettlementColumnKey> => Boolean(column))
              : SETTLEMENT_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: 'historico-baixas',
            branding: {
              title: 'Histórico Baixas',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: runtimeContext.companyName || 'FINANCEIRO',
              logoUrl: runtimeContext.logoUrl,
            },
          });
          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />

      {detailRow ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <section className={`${cardClass} flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden`}>
            <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {runtimeContext.logoUrl ? (
                    <img src={runtimeContext.logoUrl} alt="Logo" className="h-full w-full object-contain p-2" />
                  ) : (
                    <span className="text-sm font-black text-[#153a6a]">CEC</span>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Consulta da baixa</div>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Informações da baixa</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              <div className="mb-5 grid gap-3 md:grid-cols-3">
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Cliente</div>
                  <div className="mt-2 text-sm font-black text-slate-900">{detailRow.customerName || '---'}</div>
                </div>
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Operador</div>
                  <div className="mt-2 text-sm font-black text-slate-900">{detailRow.cashierDisplayName || '---'}</div>
                </div>
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Status</div>
                  <div className={`mt-2 text-sm font-black ${detailRow.status === 'ACTIVE' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {detailRow.status === 'ACTIVE' ? 'ATIVA' : 'ESTORNADA'}
                  </div>
                </div>
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Data da baixa</div>
                  <div className="mt-2 text-sm font-black text-slate-900">{formatDateTimeLabel(detailRow.settledAt)}</div>
                </div>
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Forma</div>
                  <div className="mt-2 text-sm font-black text-slate-900">{detailRow.paymentMethodLabel || '---'}</div>
                </div>
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Parcelas envolvidas</div>
                  <div className="mt-2 text-sm font-black text-slate-900">{detailRow.installmentCount}</div>
                </div>
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Valor baixado</div>
                  <div className="mt-2 text-sm font-black text-blue-700">{formatCurrency(detailRow.receivedAmount)}</div>
                </div>
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Juros</div>
                  <div className="mt-2 text-sm font-black text-amber-700">{formatCurrency(detailRow.interestAmount)}</div>
                </div>
                <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Desconto / Multa</div>
                  <div className="mt-2 text-sm font-black text-slate-900">
                    {formatCurrency(detailRow.discountAmount)} / {formatCurrency(detailRow.penaltyAmount)}
                  </div>
                </div>
              </div>

              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Parcela</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-right">Juros</th>
                    <th className="px-4 py-3 text-right">Desconto</th>
                    <th className="px-4 py-3 text-right">Multa</th>
                    <th className="px-4 py-3">Forma</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRow.installments.length ? detailRow.installments.map((item) => (
                    <tr key={item.settlementId} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-black text-slate-900">{item.description}</div>
                        <div className="text-xs font-semibold text-slate-500">
                          {item.installmentNumber}/{item.installmentCount}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatDateLabel(item.dueDate || '')}</td>
                      <td className="px-4 py-3 text-right font-black text-blue-700">{formatCurrency(item.receivedAmount)}</td>
                      <td className="px-4 py-3 text-right font-black text-amber-700">{formatCurrency(item.interestAmount)}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-700">{formatCurrency(item.discountAmount)}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-700">{formatCurrency(item.penaltyAmount)}</td>
                      <td className="px-4 py-3">{item.paymentMethodLabel || '---'}</td>
                      <td className="px-4 py-3 text-center">{item.status === 'ACTIVE' ? 'ATIVA' : 'ESTORNADA'}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Nenhuma parcela detalhada encontrada para esta baixa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="mt-5 flex justify-end">
                <ScreenNameCopy screenId={DETAIL_POPUP_ID} className="justify-end" />
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {reverseRow ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <section className={`${cardClass} w-full max-w-2xl overflow-hidden`}>
            <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {runtimeContext.logoUrl ? (
                    <img src={runtimeContext.logoUrl} alt="Logo" className="h-full w-full object-contain p-2" />
                  ) : (
                    <span className="text-sm font-black text-[#153a6a]">CEC</span>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Estorno de baixa</div>
                  <h2 className="mt-1 text-xl font-black text-slate-900">Confirmar estorno</h2>
                </div>
              </div>
            </div>
            <div className="grid gap-3 p-6 md:grid-cols-2">
              <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Cliente</div>
                <div className="mt-2 text-sm font-black text-slate-900">{reverseRow.customerName}</div>
              </div>
              <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Valor</div>
                <div className="mt-2 text-sm font-black text-blue-700">{formatCurrency(reverseRow.receivedAmount)}</div>
              </div>
              <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Parcelas</div>
                <div className="mt-2 text-sm font-black text-slate-900">{reverseRow.installmentCount}</div>
              </div>
              <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Data</div>
                <div className="mt-2 text-sm font-black text-slate-900">{formatDateTimeLabel(reverseRow.settledAt)}</div>
              </div>
              <div className="md:col-span-2">
                <ScreenNameCopy screenId={REVERSE_POPUP_ID} className="justify-end" />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setReverseRow(null)}
                disabled={isReversing}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmReverseSettlement()}
                disabled={isReversing}
                className="rounded-xl bg-rose-500 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600 disabled:bg-slate-300"
              >
                {isReversing ? 'Estornando...' : 'Estornar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
