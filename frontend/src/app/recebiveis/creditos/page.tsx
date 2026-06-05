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

type CustomerCreditStatus = 'OPEN' | 'USED' | 'CANCELED' | 'ALL';

type CustomerCreditItem = {
  id: string;
  customerName: string;
  customerDocument?: string | null;
  status: string;
  originalAmount: number;
  availableAmount: number;
  sourceType: string;
  notes?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

type AlertState = {
  type: 'success' | 'warning' | 'error';
  title: string;
  message: string;
};

type CreditGridColumnKey =
  | 'customerName'
  | 'customerDocument'
  | 'originalAmount'
  | 'availableAmount'
  | 'status'
  | 'createdAt'
  | 'createdBy'
  | 'notes';

type CreditGridFilterKey = CreditGridColumnKey;

type CreditGridFilters = Record<CreditGridFilterKey, string>;

type CreditGridSort = {
  key: CreditGridColumnKey | null;
  direction: 'ASC' | 'DESC';
};

type CreditGridConfig = {
  order: CreditGridColumnKey[];
  hidden: CreditGridColumnKey[];
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CREDITOS';
const FINANCE_SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_CONTROLE_CREDITOS';
const SUCCESS_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_CREDITOS_SUCESSO';
const cardClass = FINANCE_GRID_PAGE_LAYOUT.card;
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500';
const GRID_STORAGE_PREFIX = 'financeiro:creditos:grid-columns:';
const EXPORT_STORAGE_PREFIX = 'financeiro:creditos:export-config:';

const CREDIT_GRID_COLUMNS: GridColumnDefinition<CustomerCreditItem, CreditGridColumnKey>[] = [
  { key: 'customerName', label: 'Cliente', getValue: (item) => item.customerName || '---' },
  { key: 'customerDocument', label: 'Documento', getValue: (item) => item.customerDocument || '---' },
  { key: 'originalAmount', label: 'Gerado', getValue: (item) => formatCurrency(item.originalAmount), align: 'right' },
  { key: 'availableAmount', label: 'Disponível', getValue: (item) => formatCurrency(item.availableAmount), align: 'right' },
  { key: 'status', label: 'Status', getValue: (item) => getCreditStatusLabel(item.status) },
  { key: 'createdAt', label: 'Data', getValue: (item) => formatDateLabel(item.createdAt) },
  { key: 'createdBy', label: 'Usuário', getValue: (item) => item.createdBy || '---' },
  { key: 'notes', label: 'Observação', getValue: (item) => item.notes || '---' },
];

const DEFAULT_GRID_CONFIG: CreditGridConfig = {
  order: CREDIT_GRID_COLUMNS.map((column) => column.key),
  hidden: ['createdBy', 'notes'],
};

const DEFAULT_FILTERS: CreditGridFilters = {
  customerName: '',
  customerDocument: '',
  originalAmount: '',
  availableAmount: '',
  status: '',
  createdAt: '',
  createdBy: '',
  notes: '',
};

function parseMoneyInput(value: string) {
  const normalized = String(value || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyInput(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeUpperInput(value: string) {
  return String(value || '').toUpperCase();
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(value: string) {
  const digits = value.replace(/\D+/g, '');
  if (!/^\d{11}$/.test(digits) || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (baseLength: number) => {
    const sum = digits
      .slice(0, baseLength)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (baseLength + 1 - index), 0);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };

  return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
}

function isValidCnpj(value: string) {
  const digits = value.replace(/\D+/g, '');
  if (!/^\d{14}$/.test(digits) || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (baseLength: number) => {
    const weights =
      baseLength === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits
      .slice(0, baseLength)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (weights[index] ?? 0), 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

function validateBrazilDocument(value: string) {
  const digits = value.replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length !== 11 && digits.length !== 14) return 'INFORME UM CPF COM 11 DÍGITOS OU CNPJ COM 14 DÍGITOS.';
  if (digits.length === 11 && !isValidCpf(digits)) return 'CPF INVÁLIDO.';
  if (digits.length === 14 && !isValidCnpj(digits)) return 'CNPJ INVÁLIDO.';
  return '';
}

function normalizeFilterText(value: string | number | null | undefined) {
  return String(value ?? '').trim().toUpperCase();
}

function includesFilterText(value: string | number | null | undefined, filter: string) {
  const normalizedFilter = normalizeFilterText(filter);
  if (!normalizedFilter) return true;
  return normalizeFilterText(value).includes(normalizedFilter);
}

function getCreditStatusLabel(status: string) {
  if (status === 'OPEN') return 'ABERTO';
  if (status === 'USED') return 'UTILIZADO';
  if (status === 'CANCELED') return 'CANCELADO';
  return status || '---';
}

function getCreditStatusClass(status: string) {
  if (status === 'OPEN') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'USED') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'CANCELED') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function getCreditColumnValue(item: CustomerCreditItem, key: CreditGridColumnKey) {
  if (key === 'customerName') return item.customerName || '';
  if (key === 'customerDocument') return item.customerDocument || '';
  if (key === 'originalAmount') return formatCurrency(item.originalAmount);
  if (key === 'availableAmount') return formatCurrency(item.availableAmount);
  if (key === 'status') return getCreditStatusLabel(item.status);
  if (key === 'createdAt') return formatDateLabel(item.createdAt);
  if (key === 'createdBy') return item.createdBy || '';
  if (key === 'notes') return item.notes || '';
  return '';
}

function compareCreditValues(
  left: CustomerCreditItem,
  right: CustomerCreditItem,
  sort: CreditGridSort,
) {
  if (!sort.key) return 0;

  let leftValue: string | number = getCreditColumnValue(left, sort.key);
  let rightValue: string | number = getCreditColumnValue(right, sort.key);

  if (sort.key === 'originalAmount' || sort.key === 'availableAmount') {
    leftValue = Number(left[sort.key] || 0);
    rightValue = Number(right[sort.key] || 0);
  }

  if (sort.key === 'createdAt') {
    leftValue = new Date(left.createdAt).getTime();
    rightValue = new Date(right.createdAt).getTime();
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

function normalizeGridConfig(config: Partial<CreditGridConfig> | null | undefined): CreditGridConfig {
  const allKeys = CREDIT_GRID_COLUMNS.map((column) => column.key);
  const validOrder = (config?.order || []).filter((item): item is CreditGridColumnKey =>
    allKeys.includes(item as CreditGridColumnKey),
  );
  const validHidden = (config?.hidden || []).filter((item): item is CreditGridColumnKey =>
    allKeys.includes(item as CreditGridColumnKey),
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
    return raw ? normalizeGridConfig(JSON.parse(raw) as Partial<CreditGridConfig>) : DEFAULT_GRID_CONFIG;
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
  columns: GridColumnDefinition<CustomerCreditItem, CreditGridColumnKey>[];
  order: CreditGridColumnKey[];
  hidden: CreditGridColumnKey[];
  onSave: (order: CreditGridColumnKey[], hidden: CreditGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftOrder, setDraftOrder] = useState<CreditGridColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<CreditGridColumnKey[]>(hidden);

  useEffect(() => {
    if (!isOpen) return;
    setDraftOrder(order);
    setDraftHidden(hidden);
  }, [hidden, isOpen, order]);

  if (!isOpen) return null;

  const orderedColumns = draftOrder
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is GridColumnDefinition<CustomerCreditItem, CreditGridColumnKey> => Boolean(column));

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
            ✕
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
                        {isHidden ? '✕' : '✓'}
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

export default function FinanceiroCustomerCreditsPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [credits, setCredits] = useState<CustomerCreditItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
  const [generalSearch, setGeneralSearch] = useState('');
  const [filterDrafts, setFilterDrafts] = useState<CreditGridFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CreditGridFilters>(DEFAULT_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] = useState<CreditGridFilterKey | null>(null);
  const [gridSort, setGridSort] = useState<CreditGridSort>({ key: 'createdAt', direction: 'DESC' });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCreditId, setSelectedCreditId] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<CreditGridColumnKey[]>(DEFAULT_GRID_CONFIG.order);
  const [hiddenColumns, setHiddenColumns] = useState<CreditGridColumnKey[]>(DEFAULT_GRID_CONFIG.hidden);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<CreditGridColumnKey, boolean>>(
    buildDefaultExportColumns(CREDIT_GRID_COLUMNS),
  );
  const [customerName, setCustomerName] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [customerDocumentError, setCustomerDocumentError] = useState('');
  const [amountInput, setAmountInput] = useState('0,00');
  const [notes, setNotes] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);

  const logoUrl = runtimeContext.logoUrl;
  const logoAlt = `Logo de ${runtimeContext.companyName || 'ESCOLA'}`;
  const logoFallback = String(runtimeContext.companyName || 'ESCOLA').slice(0, 3).toUpperCase();

  const apiStatus = useMemo<CustomerCreditStatus>(() => {
    if (statusFilter === 'ACTIVE') return 'OPEN';
    if (statusFilter === 'ALL') return 'ALL';
    return 'ALL';
  }, [statusFilter]);

  const loadCredits = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setCredits([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setAlert(null);
      setCredits(
        await requestJson<CustomerCreditItem[]>(
          `/customer-credits${buildFinanceApiQueryString(runtimeContext, {
            status: apiStatus,
          })}`,
          {
            fallbackMessage: 'Não foi possível carregar os créditos de clientes.',
          },
        ),
      );
    } catch (error) {
      setCredits([]);
      setAlert({
        type: 'error',
        title: 'Erro ao carregar créditos',
        message: getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar os créditos de clientes.',
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiStatus, runtimeContext]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

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

  useEffect(() => {
    const storedConfig = readStoredGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({ order: columnOrder, hidden: hiddenColumns } satisfies CreditGridConfig),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  const visibleColumns = useMemo(() => {
    return columnOrder
      .map((key) => CREDIT_GRID_COLUMNS.find((column) => column.key === key))
      .filter((column): column is GridColumnDefinition<CustomerCreditItem, CreditGridColumnKey> => Boolean(column))
      .filter((column) => !hiddenColumns.includes(column.key));
  }, [columnOrder, hiddenColumns]);

  const statusFilteredCredits = useMemo(() => {
    if (statusFilter === 'ACTIVE') {
      return credits.filter((credit) => credit.status === 'OPEN');
    }

    if (statusFilter === 'INACTIVE') {
      return credits.filter((credit) => credit.status === 'USED' || credit.status === 'CANCELED');
    }

    return credits;
  }, [credits, statusFilter]);

  const filteredCredits = useMemo(() => {
    const normalizedGeneralSearch = normalizeFilterText(generalSearch);

    const filtered = statusFilteredCredits.filter((credit) => {
      const generalText = [
        credit.customerName,
        credit.customerDocument,
        formatCurrency(credit.originalAmount),
        formatCurrency(credit.availableAmount),
        getCreditStatusLabel(credit.status),
        formatDateLabel(credit.createdAt),
        credit.createdBy,
        credit.notes,
      ].join(' ');

      if (normalizedGeneralSearch && !normalizeFilterText(generalText).includes(normalizedGeneralSearch)) {
        return false;
      }

      return (Object.keys(appliedFilters) as CreditGridFilterKey[]).every((key) => {
        const filter = appliedFilters[key];
        if (!filter) return true;
        return includesFilterText(getCreditColumnValue(credit, key), filter);
      });
    });

    return [...filtered].sort((left, right) => compareCreditValues(left, right, gridSort));
  }, [appliedFilters, generalSearch, gridSort, statusFilteredCredits]);

  const totals = useMemo(() => {
    return filteredCredits.reduce(
      (summary, credit) => ({
        originalAmount: summary.originalAmount + Number(credit.originalAmount || 0),
        availableAmount: summary.availableAmount + Number(credit.availableAmount || 0),
      }),
      { originalAmount: 0, availableAmount: 0 },
    );
  }, [filteredCredits]);

  const openCount = useMemo(
    () => credits.filter((credit) => credit.status === 'OPEN').length,
    [credits],
  );
  const inactiveCount = useMemo(
    () => credits.filter((credit) => credit.status === 'USED' || credit.status === 'CANCELED').length,
    [credits],
  );
  const totalPages = Math.max(1, Math.ceil(filteredCredits.length / pageSize));
  const paginatedCredits = useMemo(() => {
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredCredits.slice(startIndex, startIndex + pageSize);
  }, [currentPage, filteredCredits, pageSize, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [appliedFilters, generalSearch, pageSize, statusFilter]);

  function resetForm() {
    setCustomerName('');
    setCustomerDocument('');
    setCustomerDocumentError('');
    setAmountInput(formatMoneyInput(0));
    setNotes('');
  }

  function renderLogo(sizeClass = 'h-16 w-16') {
    return (
      <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${sizeClass}`}>
        {logoUrl ? (
          <img src={logoUrl} alt={logoAlt} className="h-full w-full object-contain p-1.5" />
        ) : (
          <span className="text-sm font-black uppercase tracking-[0.2em] text-[#153a6a]">{logoFallback}</span>
        )}
      </div>
    );
  }

  function applyColumnFilter(columnKey: CreditGridFilterKey) {
    setAppliedFilters((current) => ({
      ...current,
      [columnKey]: filterDrafts[columnKey],
    }));
    setActiveFilterColumn(null);
  }

  function clearColumnFilter(columnKey: CreditGridFilterKey) {
    setFilterDrafts((current) => ({ ...current, [columnKey]: '' }));
    setAppliedFilters((current) => ({ ...current, [columnKey]: '' }));
    setActiveFilterColumn(null);
  }

  function clearAllFilters() {
    setGeneralSearch('');
    setFilterDrafts(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setGridSort({ key: 'createdAt', direction: 'DESC' });
    setActiveFilterColumn(null);
  }

  async function handleCreateCredit() {
    if (isSaving) return;

    const amount = parseMoneyInput(amountInput);
    const normalizedCustomerName = customerName.trim().toUpperCase();
    const normalizedCustomerDocument = customerDocument.replace(/\D+/g, '');
    const documentError = validateBrazilDocument(normalizedCustomerDocument);

    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setAlert({
        type: 'warning',
        title: 'Contexto obrigatório',
        message: 'Abra a tela pelo sistema da Escola para identificar o tenant financeiro.',
      });
      return;
    }

    if (!runtimeContext.cashierUserId) {
      setAlert({
        type: 'warning',
        title: 'Caixa obrigatório',
        message: 'É necessário estar com operador de caixa identificado para lançar crédito.',
      });
      return;
    }

    if (!normalizedCustomerName) {
      setAlert({
        type: 'warning',
        title: 'Cliente obrigatório',
        message: 'Informe o cliente para lançar o crédito.',
      });
      return;
    }

    if (documentError) {
      setCustomerDocumentError(documentError);
      return;
    }

    if (amount <= 0) {
      setAlert({
        type: 'warning',
        title: 'Valor obrigatório',
        message: 'Informe um valor de crédito maior que zero.',
      });
      return;
    }

    try {
      setIsSaving(true);
      setAlert(null);
      const createdCredit = await requestJson<CustomerCreditItem & { message?: string }>(
        '/customer-credits',
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            cashierUserId: runtimeContext.cashierUserId,
            cashierDisplayName: runtimeContext.cashierDisplayName || runtimeContext.cashierUserId,
            customerName: normalizedCustomerName,
            customerDocument: normalizedCustomerDocument || undefined,
            amount,
            notes: notes.trim().toUpperCase() || undefined,
          }),
          fallbackMessage: 'Não foi possível lançar o crédito para o cliente.',
        },
      );

      resetForm();
      setIsCreateModalOpen(false);
      setStatusFilter('ACTIVE');
      setSuccessMessage(createdCredit.message || 'Crédito lançado para o cliente com sucesso.');
      await loadCredits();
    } catch (error) {
      setAlert({
        type: 'error',
        title: 'Erro ao lançar crédito',
        message: getFriendlyRequestErrorMessage(
          error,
          'Não foi possível lançar o crédito para o cliente.',
        ),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
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

      <section className={`${cardClass} flex h-[calc(100vh-17rem)] min-h-[520px] flex-col overflow-hidden`}>
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto]">
            <button
              type="button"
              onClick={() => {
                setAlert(null);
                resetForm();
                setIsCreateModalOpen(true);
              }}
              title="Novo lançamento de crédito"
              className="flex h-[46px] w-[52px] items-center justify-center rounded-xl bg-blue-600 text-2xl font-black leading-none text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
            >
              +
            </button>
            <input
              value={generalSearch}
              onChange={(event) => setGeneralSearch(normalizeUpperInput(event.target.value))}
              className={inputClass}
              placeholder="PESQUISAR EM TODO O GRID"
            />
            <button
              type="button"
              onClick={() => void loadCredits()}
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
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black transition ${
                      Object.values(appliedFilters).some(Boolean) || generalSearch || gridSort.key
                        ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                    }`}
                  >
                    x
                  </button>
                </th>
                {visibleColumns.map((column) => (
                  <th key={column.key} className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : ''}`}>
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
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedCredits.map((credit, index) => (
                <tr
                  key={credit.id}
                  aria-selected={selectedCreditId === credit.id}
                  onClick={() => setSelectedCreditId(credit.id)}
                  className={`cursor-pointer border-t border-slate-100 transition ${
                    selectedCreditId === credit.id
                      ? 'bg-blue-100 outline outline-1 outline-blue-400'
                      : credit.status === 'OPEN'
                        ? index % 2 === 0
                          ? 'bg-white hover:bg-slate-100'
                          : 'bg-slate-200/70 hover:bg-slate-300/70'
                        : index % 2 === 0
                          ? 'bg-rose-100/80 hover:bg-rose-200/80'
                          : 'bg-rose-200/70 hover:bg-rose-300/70'
                  }`}
                >
                  <td className="w-12 px-3 py-4" />
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-4 ${column.align === 'right' ? 'text-right' : ''}`}
                    >
                      {column.key === 'customerName' ? (
                        <div className="font-black text-slate-900">{credit.customerName}</div>
                      ) : column.key === 'originalAmount' ? (
                        <span className="font-black text-slate-900">{formatCurrency(credit.originalAmount)}</span>
                      ) : column.key === 'availableAmount' ? (
                        <span className="font-black text-blue-700">{formatCurrency(credit.availableAmount)}</span>
                      ) : column.key === 'status' ? (
                        <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getCreditStatusClass(credit.status)}`}>
                          {getCreditStatusLabel(credit.status)}
                        </span>
                      ) : column.key === 'createdAt' ? (
                        formatDateLabel(credit.createdAt)
                      ) : (
                        column.getValue(credit)
                      )}
                    </td>
                  ))}
                </tr>
              ))}

              {!isLoading && !paginatedCredits.length ? (
                <tr>
                  <td colSpan={(visibleColumns.length || 1) + 1} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum crédito encontrado para os filtros atuais.
                  </td>
                </tr>
              ) : null}
              {isLoading ? (
                <tr>
                  <td colSpan={(visibleColumns.length || 1) + 1} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Carregando créditos...
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
                  {filteredCredits.length} registro(s)
                </span>
              </td>
              {visibleColumns.map((column) => (
                <td
                  key={column.key}
                  className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  {column.key === 'originalAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.originalAmount)}</span>
                  ) : column.key === 'availableAmount' ? (
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.availableAmount)}</span>
                  ) : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>

        <GridStandardFooter
          statusFilter={statusFilter}
          totalRecords={filteredCredits.length}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          aggregateSummaries={[
            { label: 'Abertos', value: String(openCount) },
            { label: 'Baixados/Cancelados', value: String(inactiveCount) },
            { label: 'Disponível', value: formatCurrency(totals.availableAmount) },
          ]}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onStatusFilterChange={setStatusFilter}
          onPageSizeChange={(value) => setPageSize(value)}
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
        columns={CREDIT_GRID_COLUMNS}
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
        title="Exportar créditos"
        description={`A exportação respeita os filtros atuais e inclui ${filteredCredits.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={CREDIT_GRID_COLUMNS.map((column) => ({
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
            rows: filteredCredits,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) => CREDIT_GRID_COLUMNS.find((column) => column.key === key))
                  .filter(
                    (
                      column,
                    ): column is GridColumnDefinition<CustomerCreditItem, CreditGridColumnKey> =>
                      Boolean(column),
                  )
              : CREDIT_GRID_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: 'controle-creditos',
            branding: {
              title: 'Controle de Créditos',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: runtimeContext.companyName || 'FINANCEIRO',
              logoUrl: runtimeContext.logoUrl,
            },
          });
          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />

      {isCreateModalOpen ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <section className={`${cardClass} w-full max-w-2xl overflow-hidden`}>
            <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
              {renderLogo()}
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Novo lançamento
                </div>
                <h2 className="mt-1 text-xl font-black text-slate-900">Lançar Crédito para Cliente</h2>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              <label className="block">
                <span className={labelClass}>Cliente</span>
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(normalizeUpperInput(event.target.value))}
                  className={inputClass}
                  placeholder="NOME DO CLIENTE"
                  disabled={isSaving}
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Documento</span>
                  <input
                    value={customerDocument}
                    onChange={(event) => {
                      setCustomerDocument(event.target.value.replace(/\D+/g, '').slice(0, 14));
                      setCustomerDocumentError('');
                    }}
                    onBlur={() => setCustomerDocumentError(validateBrazilDocument(customerDocument))}
                    inputMode="numeric"
                    aria-invalid={Boolean(customerDocumentError)}
                    className={`${inputClass} ${customerDocumentError ? 'border-rose-400 bg-rose-50 focus:border-rose-500' : ''}`}
                    placeholder="CPF/CNPJ"
                    disabled={isSaving}
                  />
                  {customerDocumentError ? (
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.08em] text-rose-600">
                      {customerDocumentError}
                    </p>
                  ) : null}
                </label>
                <label className="block">
                  <span className={labelClass}>Valor do crédito</span>
                  <input
                    value={amountInput}
                    onChange={(event) => setAmountInput(event.target.value)}
                    inputMode="decimal"
                    className={inputClass}
                    placeholder="0,00"
                    disabled={isSaving}
                  />
                </label>
              </div>
              <label className="block">
                <span className={labelClass}>Observação</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(normalizeUpperInput(event.target.value))}
                  className={`${inputClass} min-h-24 resize-none`}
                  placeholder="MOTIVO DO CRÉDITO"
                  disabled={isSaving}
                />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  if (isSaving) return;
                  setIsCreateModalOpen(false);
                }}
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCreateCredit()}
                disabled={isSaving}
                className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {isSaving ? 'Lançando...' : 'Confirmar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {successMessage ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-xl">
            <div className="flex flex-col items-center bg-emerald-50 px-6 py-8 text-center">
              {renderLogo('h-20 w-20')}
              <div className="mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">
                Crédito lançado
              </div>
              <h2 className="mt-2 text-2xl font-black text-emerald-800">Lançamento realizado com sucesso</h2>
              <p className="mt-3 max-w-md text-sm font-semibold text-emerald-700">
                {successMessage}
              </p>
            </div>
            <div className="flex justify-between gap-3 px-6 py-4">
              <ScreenNameCopy screenId={SUCCESS_SCREEN_ID} className="text-slate-500" />
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="rounded-xl bg-emerald-600 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
              >
                OK
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
