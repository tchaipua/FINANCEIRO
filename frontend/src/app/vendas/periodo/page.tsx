'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter from '@/app/components/grid-standard-footer';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import { formatCurrency, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildDefaultExportColumns,
  exportGridRows,
  type GridColumnDefinition,
  type GridExportFormat,
} from '@/app/lib/grid-export-utils';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type SalePeriodItem = {
  id: string;
  companyName?: string | null;
  branchCode: number;
  saleNumber: string;
  saleChannel: string;
  status: string;
  customerName: string;
  customerDocument?: string | null;
  totalAmount: number;
  paidAmount: number;
  receivableAmount: number;
  paymentSummary?: string | null;
  confirmedAt?: string | null;
  items?: SalePeriodItemProduct[];
  payments?: SalePeriodPayment[];
};

type SalePeriodItemProduct = {
  id: string;
  productId: string;
  lineNumber: number;
  productName: string;
  productCode?: string | null;
  unitCode: string;
  quantity: number;
  unitCost?: number | null;
  unitPrice: number;
  discountAmount: number;
  totalAmount: number;
  tracksInventory: boolean;
  variantKey?: string | null;
  colorCode?: string | null;
  colorName?: string | null;
  sizeCode?: string | null;
  lotNumber?: string | null;
  lotExpirationDate?: string | null;
  previousStock?: number | null;
  resultingStock?: number | null;
};

type SalePeriodPayment = {
  id: string;
  paymentMethod: string;
  paymentMethodLabel?: string | null;
  amount: number;
  dueDate?: string | null;
  installmentCount?: number | null;
  cardInstallmentCount?: number | null;
  cashSessionId?: string | null;
  receivableInstallmentId?: string | null;
  status: string;
  movementDate?: string | null;
  notes?: string | null;
};

type SalePeriodFilters = {
  dateFrom: string;
  dateTo: string;
  status: 'ALL' | 'CONFIRMED' | 'CANCELED';
  search: string;
};

type SalePeriodColumnKey =
  | 'confirmedAt'
  | 'saleNumber'
  | 'customerName'
  | 'paymentSummary'
  | 'totalAmount'
  | 'paidAmount'
  | 'receivableAmount'
  | 'status';

type SalePeriodGridFilters = Record<SalePeriodColumnKey, string>;

type SalePeriodGridSort = {
  key: SalePeriodColumnKey | null;
  direction: 'ASC' | 'DESC';
};

type SalePeriodGridConfig = {
  order: SalePeriodColumnKey[];
  hidden: SalePeriodColumnKey[];
};

type SaleDetailTabKey = 'info' | 'products' | 'payments';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_VENDAS_DO_PERIODO';
const DETAIL_MODAL_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_VENDAS_DO_PERIODO_DETALHE_VENDA';
const SALE_DETAIL_TABS: Array<{ key: SaleDetailTabKey; label: string }> = [
  { key: 'info', label: 'Informações' },
  { key: 'products', label: 'Produtos' },
  { key: 'payments', label: 'Parcelas' },
];
const cardClass = FINANCE_GRID_PAGE_LAYOUT.card;
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const GRID_STORAGE_PREFIX = 'financeiro:vendas-periodo:grid-columns:';

const DEFAULT_GRID_FILTERS: SalePeriodGridFilters = {
  confirmedAt: '',
  saleNumber: '',
  customerName: '',
  paymentSummary: '',
  totalAmount: '',
  paidAmount: '',
  receivableAmount: '',
  status: '',
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultFilters(): SalePeriodFilters {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    dateFrom: toDateInputValue(firstDay),
    dateTo: toDateInputValue(today),
    status: 'ALL',
    search: '',
  };
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function normalizeStatusLabel(status?: string | null) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'CONFIRMED') return 'CONFIRMADA';
  if (normalized === 'CANCELED') return 'CANCELADA';
  return normalized || '---';
}

function normalizePaymentStatusLabel(status?: string | null) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PAID') return 'PAGO - DINHEIRO JÁ ENTROU NO CAIXA';
  if (normalized === 'OPEN') return 'EM ABERTO - AGUARDANDO RECEBIMENTO';
  if (normalized === 'CANCELED') return 'CANCELADO';
  if (normalized === 'REGISTERED') return 'REGISTRADO';
  return normalized || '---';
}

function formatDateLabel(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
}

function getFriendlyCancellationPasswordMessage(message?: string | null) {
  const normalizedMessage = String(message || '').trim();
  if (
    !normalizedMessage ||
    normalizedMessage.includes('Cannot POST') ||
    normalizedMessage.includes('/auth/confirm-cash-cancellation-password') ||
    normalizedMessage.includes('confirm-cash-cancellation-password')
  ) {
    return 'Confira a senha do operador ou supervisor.';
  }

  return normalizedMessage;
}

function confirmCashCancellationPassword(password: string) {
  return new Promise<{
    authorizedBy?: string;
    authorizedUserId?: string | null;
    authorizedUserName?: string | null;
    supervisorName?: string | null;
  }>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.parent) {
      reject(new Error('Abra esta tela pelo sistema da Escola para validar a senha.'));
      return;
    }

    const requestId = `sale-period-cancel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Tempo esgotado para validação da senha.'));
    }, 20000);

    function handleMessage(event: MessageEvent) {
      const payload = event.data as {
        type?: string;
        requestId?: string;
        ok?: boolean;
        message?: string;
        authorizedBy?: string;
        authorizedUserId?: string | null;
        authorizedUserName?: string | null;
        supervisorName?: string | null;
      } | null;

      if (
        payload?.type !== 'MSINFOR_CONFIRM_CASH_CANCELLATION_PASSWORD_RESULT' ||
        payload.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);

      if (!payload.ok) {
        reject(new Error(getFriendlyCancellationPasswordMessage(payload.message)));
        return;
      }

      resolve({
        authorizedBy: payload.authorizedBy,
        authorizedUserId: payload.authorizedUserId || null,
        authorizedUserName: payload.authorizedUserName || null,
        supervisorName: payload.supervisorName || null,
      });
    }

    window.addEventListener('message', handleMessage);
    window.parent.postMessage(
      {
        type: 'MSINFOR_CONFIRM_CASH_CANCELLATION_PASSWORD',
        requestId,
        password,
      },
      '*',
    );
  });
}

function buildAuditText(params: {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  companyName?: string | null;
  filters: SalePeriodFilters;
  displayedRowsCount: number;
  totalAmount: number;
  paidAmount: number;
  receivableAmount: number;
}) {
  return `--- LOGICA DA TELA ---
Tela de grid das vendas confirmadas por periodo.

TABELAS PRINCIPAIS:
- sales (S) - cabecalho das vendas confirmadas.
- sale_payments (SP) - formas de pagamento da venda.
- companies (CO) - empresa financeira resolvida pelo contexto.

RELACIONAMENTOS:
- sales.companyId = companies.id
- sale_payments.saleId = sales.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId, params.companyName)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- periodo inicial (:dateFrom): ${formatAuditValue(params.filters.dateFrom)}
- periodo final (:dateTo): ${formatAuditValue(params.filters.dateTo)}
- status (:status): ${params.filters.status}
- busca (:search): ${formatAuditValue(params.filters.search)}
- registros exibidos: ${params.displayedRowsCount}
- total vendido: ${formatCurrency(params.totalAmount)}
- total recebido: ${formatCurrency(params.paidAmount)}
- total a receber: ${formatCurrency(params.receivableAmount)}
- ordenacao atual: confirmedAt DESC`;
}

function buildAuditSql(params: {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  filters: SalePeriodFilters;
}) {
  const search = params.filters.search.trim().toUpperCase();

  return `SELECT
  S.confirmedAt,
  S.saleNumber,
  S.customerNameSnapshot,
  S.paymentSummary,
  S.totalAmount,
  S.paidAmount,
  S.receivableAmount,
  S.status
FROM sales S
INNER JOIN companies CO
  ON CO.id = S.companyId
WHERE S.canceledAt IS NULL
  AND CO.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND DATE(S.confirmedAt) >= DATE(${toSqlLiteral(params.filters.dateFrom)})
  AND DATE(S.confirmedAt) <= DATE(${toSqlLiteral(params.filters.dateTo)})
  AND (
    ${toSqlLiteral(params.filters.status)} = 'ALL'
    OR S.status = ${toSqlLiteral(params.filters.status)}
  )
  AND (
    ${toSqlLiteral(search)} = ''
    OR UPPER(S.saleNumber) LIKE '%' || ${toSqlLiteral(search)} || '%'
    OR UPPER(S.customerNameSnapshot) LIKE '%' || ${toSqlLiteral(search)} || '%'
    OR UPPER(COALESCE(S.customerDocumentSnapshot, '')) LIKE '%' || ${toSqlLiteral(search)} || '%'
  )
ORDER BY S.confirmedAt DESC;`;
}

const SALE_PERIOD_COLUMNS: GridColumnDefinition<SalePeriodItem, SalePeriodColumnKey>[] = [
  { key: 'confirmedAt', label: 'Data', getValue: (item) => formatDateTimeLabel(item.confirmedAt) },
  { key: 'saleNumber', label: 'Venda', getValue: (item) => item.saleNumber || '---' },
  { key: 'customerName', label: 'Cliente', getValue: (item) => item.customerName || '---' },
  { key: 'paymentSummary', label: 'Pagamento', getValue: (item) => item.paymentSummary || '---' },
  { key: 'totalAmount', label: 'Total', getValue: (item) => formatCurrency(item.totalAmount) },
  { key: 'paidAmount', label: 'Recebido', getValue: (item) => formatCurrency(item.paidAmount) },
  { key: 'receivableAmount', label: 'A receber', getValue: (item) => formatCurrency(item.receivableAmount) },
  { key: 'status', label: 'Status', getValue: (item) => normalizeStatusLabel(item.status) },
];

const DEFAULT_GRID_CONFIG: SalePeriodGridConfig = {
  order: SALE_PERIOD_COLUMNS.map((column) => column.key),
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

function getSaleColumnValue(item: SalePeriodItem, key: SalePeriodColumnKey) {
  if (key === 'confirmedAt') return formatDateTimeLabel(item.confirmedAt);
  if (key === 'saleNumber') return item.saleNumber || '';
  if (key === 'customerName') return item.customerName || '';
  if (key === 'paymentSummary') return item.paymentSummary || '';
  if (key === 'totalAmount') return formatCurrency(item.totalAmount);
  if (key === 'paidAmount') return formatCurrency(item.paidAmount);
  if (key === 'receivableAmount') return formatCurrency(item.receivableAmount);
  if (key === 'status') return normalizeStatusLabel(item.status);
  return '';
}

function compareSaleValues(left: SalePeriodItem, right: SalePeriodItem, sort: SalePeriodGridSort) {
  if (!sort.key) return 0;

  let leftValue: string | number = getSaleColumnValue(left, sort.key);
  let rightValue: string | number = getSaleColumnValue(right, sort.key);

  if (sort.key === 'totalAmount' || sort.key === 'paidAmount' || sort.key === 'receivableAmount') {
    leftValue = Number(left[sort.key] || 0);
    rightValue = Number(right[sort.key] || 0);
  }

  if (sort.key === 'confirmedAt') {
    leftValue = left.confirmedAt ? new Date(left.confirmedAt).getTime() : 0;
    rightValue = right.confirmedAt ? new Date(right.confirmedAt).getTime() : 0;
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

function normalizeGridConfig(config: Partial<SalePeriodGridConfig> | null | undefined): SalePeriodGridConfig {
  const allKeys = SALE_PERIOD_COLUMNS.map((column) => column.key);
  const validOrder = (config?.order || []).filter((item): item is SalePeriodColumnKey =>
    allKeys.includes(item as SalePeriodColumnKey),
  );
  const validHidden = (config?.hidden || []).filter((item): item is SalePeriodColumnKey =>
    allKeys.includes(item as SalePeriodColumnKey),
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
    return raw ? normalizeGridConfig(JSON.parse(raw) as Partial<SalePeriodGridConfig>) : DEFAULT_GRID_CONFIG;
  } catch {
    return DEFAULT_GRID_CONFIG;
  }
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (item === undefined) return items;
  next.splice(toIndex, 0, item);
  return next;
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
  columns: GridColumnDefinition<SalePeriodItem, SalePeriodColumnKey>[];
  order: SalePeriodColumnKey[];
  hidden: SalePeriodColumnKey[];
  onSave: (order: SalePeriodColumnKey[], hidden: SalePeriodColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftOrder, setDraftOrder] = useState<SalePeriodColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<SalePeriodColumnKey[]>(hidden);

  useEffect(() => {
    if (!isOpen) return;
    setDraftOrder(order);
    setDraftHidden(hidden);
  }, [hidden, isOpen, order]);

  if (!isOpen) return null;

  const orderedColumns = draftOrder
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is GridColumnDefinition<SalePeriodItem, SalePeriodColumnKey> => Boolean(column));

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <div className={FINANCE_GRID_PAGE_LAYOUT.modalPanel}>
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
              Configuração do grid
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-900">Configurar colunas</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-rose-500">
            X
          </button>
        </div>
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalBody}>
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-600">
            Use as setas para organizar a ordem e ligue/desligue as colunas visíveis.
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-2">
              {orderedColumns.map((column, index) => {
                const isHidden = draftHidden.includes(column.key);

                return (
                  <div
                    key={column.key}
                    className={`${FINANCE_GRID_PAGE_LAYOUT.modalListItem} ${
                      isHidden
                        ? FINANCE_GRID_PAGE_LAYOUT.modalInactiveItem
                        : FINANCE_GRID_PAGE_LAYOUT.modalActiveItem
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900">{column.label}</div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {index + 1}º coluna
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftOrder((current) => moveArrayItem(current, index, index - 1))}
                        disabled={index === 0}
                        className="h-9 w-9 rounded-full border border-slate-300 bg-white text-sm font-black text-slate-600 disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftOrder((current) => moveArrayItem(current, index, index + 1))}
                        disabled={index === orderedColumns.length - 1}
                        className="h-9 w-9 rounded-full border border-slate-300 bg-white text-sm font-black text-slate-600 disabled:opacity-40"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftHidden((current) =>
                            current.includes(column.key)
                              ? current.filter((key) => key !== column.key)
                              : [...current, column.key],
                          )
                        }
                        className={
                          isHidden
                            ? FINANCE_GRID_PAGE_LAYOUT.modalToggleOff
                            : FINANCE_GRID_PAGE_LAYOUT.modalToggleOn
                        }
                      >
                        {isHidden ? 'X' : '✓'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-5">
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
              onSave(draftOrder, draftHidden);
              onClose();
            }}
            className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SalePeriodPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [filters, setFilters] = useState<SalePeriodFilters>(getDefaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<SalePeriodFilters>(getDefaultFilters);
  const [sales, setSales] = useState<SalePeriodItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generalSearch, setGeneralSearch] = useState('');
  const [filterDrafts, setFilterDrafts] = useState<SalePeriodGridFilters>(DEFAULT_GRID_FILTERS);
  const [gridFilters, setGridFilters] = useState<SalePeriodGridFilters>(DEFAULT_GRID_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] = useState<SalePeriodColumnKey | null>(null);
  const [gridSort, setGridSort] = useState<SalePeriodGridSort>({ key: 'confirmedAt', direction: 'DESC' });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<SalePeriodColumnKey[]>(DEFAULT_GRID_CONFIG.order);
  const [hiddenColumns, setHiddenColumns] = useState<SalePeriodColumnKey[]>(DEFAULT_GRID_CONFIG.hidden);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<SalePeriodColumnKey, boolean>>(
    buildDefaultExportColumns(SALE_PERIOD_COLUMNS),
  );
  const [selectedSaleForDetails, setSelectedSaleForDetails] = useState<SalePeriodItem | null>(null);
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [isCancelingSale, setIsCancelingSale] = useState(false);
  const [activeSaleDetailTab, setActiveSaleDetailTab] = useState<SaleDetailTabKey>('info');

  useEffect(() => {
    const storedConfig = readStoredGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({ order: columnOrder, hidden: hiddenColumns } satisfies SalePeriodGridConfig),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  const visibleColumns = useMemo(() => {
    return columnOrder
      .map((key) => SALE_PERIOD_COLUMNS.find((column) => column.key === key))
      .filter((column): column is GridColumnDefinition<SalePeriodItem, SalePeriodColumnKey> => Boolean(column))
      .filter((column) => !hiddenColumns.includes(column.key));
  }, [columnOrder, hiddenColumns]);

  const filteredSales = useMemo(() => {
    const normalizedGeneralSearch = normalizeFilterText(generalSearch);

    const filtered = sales.filter((sale) => {
      const generalText = [
        formatDateTimeLabel(sale.confirmedAt),
        sale.saleNumber,
        sale.customerName,
        sale.customerDocument,
        sale.paymentSummary,
        formatCurrency(sale.totalAmount),
        formatCurrency(sale.paidAmount),
        formatCurrency(sale.receivableAmount),
        normalizeStatusLabel(sale.status),
      ].join(' ');

      if (normalizedGeneralSearch && !normalizeFilterText(generalText).includes(normalizedGeneralSearch)) {
        return false;
      }

      return (Object.keys(gridFilters) as SalePeriodColumnKey[]).every((key) => {
        const filter = gridFilters[key];
        if (!filter) return true;
        return includesFilterText(getSaleColumnValue(sale, key), filter);
      });
    });

    return [...filtered].sort((left, right) => compareSaleValues(left, right, gridSort));
  }, [generalSearch, gridFilters, gridSort, sales]);

  const totalAmount = useMemo(
    () => filteredSales.reduce((total, item) => total + Number(item.totalAmount || 0), 0),
    [filteredSales],
  );
  const paidAmount = useMemo(
    () => filteredSales.reduce((total, item) => total + Number(item.paidAmount || 0), 0),
    [filteredSales],
  );
  const receivableAmount = useMemo(
    () => filteredSales.reduce((total, item) => total + Number(item.receivableAmount || 0), 0),
    [filteredSales],
  );

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const paginatedSales = useMemo(() => {
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredSales.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredSales, pageSize, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters, generalSearch, gridFilters, pageSize]);

  const loadSales = useCallback(async () => {
    if (!runtimeContext.sourceTenantId) {
      setSales([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await getJson<SalePeriodItem[]>(
        `/sales${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
          dateFrom: appliedFilters.dateFrom,
          dateTo: appliedFilters.dateTo,
          status: appliedFilters.status,
          search: appliedFilters.search,
        })}`,
      );
      setSales(Array.isArray(data) ? data : []);
    } catch (currentError) {
      setSales([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar as vendas do período.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, runtimeContext]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') return;

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  const auditText = useMemo(
    () =>
      buildAuditText({
        sourceSystem: runtimeContext.sourceSystem,
        sourceTenantId: runtimeContext.sourceTenantId,
        companyName: sales[0]?.companyName,
        filters: appliedFilters,
        displayedRowsCount: filteredSales.length,
        totalAmount,
        paidAmount,
        receivableAmount,
      }),
    [appliedFilters, filteredSales.length, paidAmount, receivableAmount, runtimeContext.sourceSystem, runtimeContext.sourceTenantId, sales, totalAmount],
  );

  const sqlText = useMemo(
    () =>
      buildAuditSql({
        sourceSystem: runtimeContext.sourceSystem,
        sourceTenantId: runtimeContext.sourceTenantId,
        filters: appliedFilters,
      }),
    [appliedFilters, runtimeContext.sourceSystem, runtimeContext.sourceTenantId],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters({
      ...filters,
      search: filters.search.trim(),
    });
  }

  function applyColumnFilter(columnKey: SalePeriodColumnKey) {
    setGridFilters((current) => ({
      ...current,
      [columnKey]: filterDrafts[columnKey],
    }));
    setActiveFilterColumn(null);
  }

  function clearColumnFilter(columnKey: SalePeriodColumnKey) {
    setFilterDrafts((current) => ({ ...current, [columnKey]: '' }));
    setGridFilters((current) => ({ ...current, [columnKey]: '' }));
    setActiveFilterColumn(null);
  }

  function clearAllGridFilters() {
    setGeneralSearch('');
    setFilterDrafts(DEFAULT_GRID_FILTERS);
    setGridFilters(DEFAULT_GRID_FILTERS);
    setGridSort({ key: 'confirmedAt', direction: 'DESC' });
    setActiveFilterColumn(null);
  }

  function closeSaleDetails() {
    if (isCancelingSale) return;
    setSelectedSaleForDetails(null);
    setActiveSaleDetailTab('info');
    setCancelPassword('');
    setCancelReason('');
    setCancelFeedback(null);
  }

  async function handleCancelSale() {
    if (!selectedSaleForDetails) return;

    const password = cancelPassword.trim();
    if (!password) {
      setCancelFeedback('Informe a senha para cancelar a venda.');
      return;
    }

    try {
      setIsCancelingSale(true);
      setCancelFeedback(null);
      const authorization = await confirmCashCancellationPassword(password);
      const authorizedUserId = String(authorization.authorizedUserId || '').trim();
      if (!authorizedUserId) {
        throw new Error('Não foi possível identificar o usuário da senha para validar o caixa aberto.');
      }
      const requestedBy =
        authorization.authorizedUserName ||
        authorization.supervisorName ||
        authorizedUserId ||
        'OPERADOR';

      await requestJson(`/sales/${selectedSaleForDetails.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          sourceBranchCode: runtimeContext.sourceBranchCode,
          cashierUserId: authorizedUserId,
          cashierDisplayName: authorization.authorizedUserName || requestedBy,
          requestedBy,
          reason: cancelReason.trim() || 'CANCELAMENTO PELA TELA VENDAS DO PERÍODO',
        }),
        fallbackMessage: 'Não foi possível cancelar a venda.',
      });

      setCancelPassword('');
      setCancelReason('');
      setSelectedSaleForDetails(null);
      await loadSales();
    } catch (currentError) {
      setCancelFeedback(getFriendlyRequestErrorMessage(currentError, 'Não foi possível cancelar a venda.'));
    } finally {
      setIsCancelingSale(false);
    }
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={`${cardClass} overflow-hidden`}>
        <form onSubmit={handleSubmit} className="grid gap-4 border-b border-slate-100 p-6 xl:grid-cols-[auto_auto_auto_1fr_auto_auto]">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          />
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as SalePeriodFilters['status'] }))}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          >
            <option value="ALL">TODAS</option>
            <option value="CONFIRMED">CONFIRMADAS</option>
            <option value="CANCELED">CANCELADAS</option>
          </select>
          <input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
            placeholder="BUSCAR VENDA, CLIENTE OU DOCUMENTO"
          />
          <button type="submit" className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => {
              const defaultFilters = getDefaultFilters();
              setFilters(defaultFilters);
              setAppliedFilters(defaultFilters);
            }}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
          >
            Limpar
          </button>
        </form>

        {error ? (
          <div className="border-b border-rose-100 bg-rose-50 px-6 py-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
          <input
            value={generalSearch}
            onChange={(event) => setGeneralSearch(normalizeUpperInput(event.target.value))}
            className={inputClass}
            placeholder="PESQUISAR EM TODO O GRID"
          />
        </div>

        <div className="min-h-[360px] overflow-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="w-12 px-3 py-3">
                  <button
                    type="button"
                    onClick={clearAllGridFilters}
                    title="Limpar todos os filtros"
                    aria-label="Limpar todos os filtros"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                      Object.values(gridFilters).some(Boolean) || generalSearch || gridSort.key !== 'confirmedAt' || gridSort.direction !== 'DESC'
                        ? 'border-rose-300 bg-rose-50 text-rose-600 shadow-sm hover:bg-rose-100'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 6h16M7 12h10M10 18h4" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M18 4 6 20" />
                    </svg>
                  </button>
                </th>
                {visibleColumns.map((column) => (
                  <th key={column.key} className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>
                    <GridColumnFilterHeader
                      label={column.label}
                      isOpen={activeFilterColumn === column.key}
                      isActive={Boolean(gridFilters[column.key])}
                      filterValue={filterDrafts[column.key]}
                      align={column.align === 'right' ? 'right' : 'left'}
                      sortDirection={gridSort.key === column.key ? gridSort.direction : null}
                      onToggle={() => {
                        setFilterDrafts((current) => ({
                          ...current,
                          [column.key]: gridFilters[column.key],
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
                  </th>
                ))}
                <th className="w-24 px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSales.map((item, index) => (
                <tr
                  key={item.id}
                  aria-selected={selectedSaleId === item.id}
                  onClick={() => setSelectedSaleId(item.id)}
                  className={`cursor-pointer border-t border-slate-100 transition ${
                    selectedSaleId === item.id
                      ? 'bg-blue-100 outline outline-1 outline-blue-400'
                      : index % 2 === 0
                        ? 'bg-white hover:bg-slate-100'
                        : 'bg-slate-200/70 hover:bg-slate-300/70'
                  }`}
                >
                  <td className="w-12 px-3 py-4" />
                  {visibleColumns.map((column) => (
                    <td key={column.key} className={`px-4 py-4 ${column.align === 'right' ? 'text-right' : ''}`}>
                      {column.key === 'status' ? (
                        <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                          String(item.status).toUpperCase() === 'CANCELED'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}>
                          {column.getValue(item)}
                        </span>
                      ) : column.key === 'totalAmount' || column.key === 'paidAmount' || column.key === 'receivableAmount' ? (
                        <span className="font-black text-slate-900">{column.getValue(item)}</span>
                      ) : (
                        column.getValue(item)
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedSaleId(item.id);
                        setSelectedSaleForDetails(item);
                        setActiveSaleDetailTab('info');
                        setCancelPassword('');
                        setCancelReason('');
                        setCancelFeedback(null);
                      }}
                      title="Visualizar produtos e parcelas"
                      aria-label="Visualizar produtos e parcelas"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && !paginatedSales.length ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm font-semibold text-slate-500" colSpan={(visibleColumns.length || 1) + 2}>
                    Nenhuma venda foi localizada para os filtros atuais.
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm font-semibold text-slate-500" colSpan={(visibleColumns.length || 1) + 2}>
                    Carregando vendas...
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
                  Total registros: {filteredSales.length}
                </span>
              </td>
              {visibleColumns.map((column) => (
                <td
                  key={column.key}
                  className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  {column.key === 'totalAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totalAmount)}</span>
                  ) : column.key === 'paidAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(paidAmount)}</span>
                  ) : column.key === 'receivableAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(receivableAmount)}</span>
                  ) : null}
                </td>
              ))}
              <td className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} />
            </tr>
          </tfoot>
        </table>

        <GridStandardFooter
          statusFilter="ALL"
          totalRecords={filteredSales.length}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          showStatusFilter={false}
          showRecordSummary={false}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onStatusFilterChange={() => undefined}
          onPageSizeChange={(value) => setPageSize(value)}
          onPageChange={setCurrentPage}
        >
          <ScreenNameCopy
            screenId={SCREEN_ID}
            label="Copiar tela"
            auditText={auditText}
            sqlText={sqlText}
            originText="Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/vendas/periodo/page.tsx"
          />
        </GridStandardFooter>
      </section>

      <GridConfigModal
        isOpen={isColumnConfigOpen}
        columns={SALE_PERIOD_COLUMNS}
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
        title="Exportar vendas do período"
        description={`A exportação respeita os filtros atuais e inclui ${filteredSales.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={SALE_PERIOD_COLUMNS}
        selectedColumns={exportColumns}
        onClose={() => setIsExportModalOpen(false)}
        brandingName={sales[0]?.companyName || null}
        brandingLogoUrl={runtimeContext.logoUrl}
        onExport={async (config) => {
          await exportGridRows({
            rows: filteredSales,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) => SALE_PERIOD_COLUMNS.find((column) => column.key === key))
                  .filter((column): column is GridColumnDefinition<SalePeriodItem, SalePeriodColumnKey> => Boolean(column))
              : visibleColumns,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: 'vendas-do-periodo',
            branding: {
              title: 'Vendas do Período',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: sales[0]?.companyName || undefined,
              logoUrl: runtimeContext.logoUrl,
            },
          });
          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />

      {selectedSaleForDetails ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <div className={`${FINANCE_GRID_PAGE_LAYOUT.modalPanel} max-w-5xl`}>
            <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
              <div className="flex min-w-0 items-center gap-4">
                {runtimeContext.logoUrl ? (
                  <img
                    src={runtimeContext.logoUrl}
                    alt="Logotipo"
                    className="h-12 w-12 flex-none rounded-xl border border-slate-200 bg-white object-contain p-1"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Venda {selectedSaleForDetails.saleNumber}
                  </div>
                  <h2 className="mt-1 truncate text-xl font-black text-slate-900">
                    Produtos e parcelas
                  </h2>
                </div>
              </div>
              <button type="button" onClick={closeSaleDetails} className="text-slate-400 transition hover:text-rose-500">
                X
              </button>
            </div>

            <div className={`${FINANCE_GRID_PAGE_LAYOUT.modalBody} gap-5 overflow-y-auto`}>
              <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                {SALE_DETAIL_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveSaleDetailTab(tab.key)}
                    className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${
                      activeSaleDetailTab === tab.key
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeSaleDetailTab === 'info' ? (
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 md:grid-cols-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Cliente</div>
                    <div className="mt-1 text-slate-900">{selectedSaleForDetails.customerName || '---'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Data</div>
                    <div className="mt-1 text-slate-900">{formatDateTimeLabel(selectedSaleForDetails.confirmedAt)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Total</div>
                    <div className="mt-1 text-slate-900">{formatCurrency(selectedSaleForDetails.totalAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Status</div>
                    <div className="mt-1 text-slate-900">{normalizeStatusLabel(selectedSaleForDetails.status)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Pagamento</div>
                    <div className="mt-1 text-slate-900">{selectedSaleForDetails.paymentSummary || '---'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Recebido</div>
                    <div className="mt-1 text-slate-900">{formatCurrency(selectedSaleForDetails.paidAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">A receber</div>
                    <div className="mt-1 text-slate-900">{formatCurrency(selectedSaleForDetails.receivableAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Filial</div>
                    <div className="mt-1 text-slate-900">{selectedSaleForDetails.branchCode}</div>
                  </div>
                </div>
              ) : null}

              {activeSaleDetailTab === 'products' ? (
                <div>
                <div className="overflow-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3 text-right">Qtd</th>
                        <th className="px-4 py-3 text-right">Unitário</th>
                        <th className="px-4 py-3 text-right">Desconto</th>
                        <th className="px-4 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSaleForDetails.items || []).map((product) => (
                        <tr key={product.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {product.productName || '---'}
                            {product.productCode ? (
                              <span className="ml-2 text-xs font-bold text-slate-500">{product.productCode}</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{product.quantity}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(product.unitPrice)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(product.discountAmount)}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(product.totalAmount)}</td>
                        </tr>
                      ))}
                      {!(selectedSaleForDetails.items || []).length ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center font-semibold text-slate-500">
                            Nenhum produto localizado para esta venda.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                </div>
              ) : null}

              {activeSaleDetailTab === 'payments' ? (
                <div>
                <div className="overflow-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Forma</th>
                        <th className="px-4 py-3">Vencimento</th>
                        <th className="px-4 py-3">Movimento</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSaleForDetails.payments || []).map((payment, index) => (
                        <tr key={payment.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {payment.paymentMethodLabel || payment.paymentMethod || '---'}
                            {payment.installmentCount && payment.installmentCount > 1 ? (
                              <span className="ml-2 text-xs font-bold text-slate-500">
                                {index + 1}/{payment.installmentCount}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">{formatDateLabel(payment.dueDate)}</td>
                          <td className="px-4 py-3">{formatDateTimeLabel(payment.movementDate)}</td>
                          <td className="px-4 py-3">{normalizePaymentStatusLabel(payment.status)}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(payment.amount)}</td>
                        </tr>
                      ))}
                      {!(selectedSaleForDetails.payments || []).length ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center font-semibold text-slate-500">
                            Nenhuma parcela ou pagamento localizado para esta venda.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                </div>
              ) : null}

              {activeSaleDetailTab === 'info' && String(selectedSaleForDetails.status).toUpperCase() !== 'CANCELED' ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-700">Cancelar venda</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
                    <input
                      value={cancelReason}
                      onChange={(event) => setCancelReason(normalizeUpperInput(event.target.value))}
                      className={FINANCE_GRID_PAGE_LAYOUT.input}
                      placeholder="MOTIVO DO CANCELAMENTO"
                    />
                    <input
                      type="password"
                      value={cancelPassword}
                      onChange={(event) => setCancelPassword(event.target.value)}
                      className={FINANCE_GRID_PAGE_LAYOUT.input}
                      placeholder="SENHA"
                    />
                  </div>
                  {cancelFeedback ? (
                    <div className="mt-3 text-sm font-semibold text-rose-700">{cancelFeedback}</div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 border-t border-slate-100 bg-white px-6 py-5 md:flex-row md:items-center md:justify-between">
              <ScreenNameCopy
                screenId={DETAIL_MODAL_SCREEN_ID}
                label="Popup"
                className="min-w-0 md:max-w-[520px]"
                auditText={`--- LOGICA DA TELA ---
Popup de detalhe da venda no periodo.

TABELAS PRINCIPAIS:
- sales (S) - cabecalho da venda selecionada.
- sale_items (SI) - produtos vendidos.
- sale_payments (SP) - parcelas e pagamentos.

FILTROS APLICADOS AGORA:
- venda (:saleId): ${selectedSaleForDetails.id}
- numero da venda: ${selectedSaleForDetails.saleNumber}
- cliente: ${selectedSaleForDetails.customerName || '---'}
- status: ${normalizeStatusLabel(selectedSaleForDetails.status)}
- total: ${formatCurrency(selectedSaleForDetails.totalAmount)}`}
                sqlText={`SELECT
  S.saleNumber,
  S.customerNameSnapshot,
  S.totalAmount,
  S.status,
  SI.productNameSnapshot,
  SI.quantity,
  SI.unitPrice,
  SI.totalAmount AS itemTotal,
  SP.paymentMethod,
  SP.dueDate,
  SP.amount
FROM sales S
LEFT JOIN sale_items SI
  ON SI.saleId = S.id
  AND SI.canceledAt IS NULL
LEFT JOIN sale_payments SP
  ON SP.saleId = S.id
  AND SP.canceledAt IS NULL
WHERE S.id = ${toSqlLiteral(selectedSaleForDetails.id)}
ORDER BY SI.lineNumber ASC, SP.createdAt ASC;`}
                originText="Origem: Sistema Financeiro - popup físico: C:/Sistemas/IA/Financeiro/frontend/src/app/vendas/periodo/page.tsx"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeSaleDetails}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
                >
                  Fechar
                </button>
                {activeSaleDetailTab === 'info' && String(selectedSaleForDetails.status).toUpperCase() !== 'CANCELED' ? (
                <button
                  type="button"
                  onClick={() => void handleCancelSale()}
                  disabled={isCancelingSale}
                  className="rounded-xl bg-rose-600 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCancelingSale ? 'Cancelando...' : 'Cancelar venda'}
                </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
