'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { API_BASE_URL, getJson } from '@/app/lib/api';
import {
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
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

type BankItem = {
  id: string;
  bankName: string;
  branchNumber: string;
  branchDigit?: string | null;
  accountNumber: string;
  accountDigit?: string | null;
  billingProvider?: string | null;
  status: string;
};

type BankReturnImportItem = {
  id: string;
  provider: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  importedItemCount: number;
  matchedItemCount: number;
  liquidatedItemCount: number;
  bankClosedItemCount: number;
  readyToApplyCount: number;
  appliedItemCount: number;
  unmatchedItemCount: number;
  bankAccountId: string;
  bankAccountLabel?: string | null;
  createdAt: string;
};

type ReturnImportStatus = 'ALL' | 'IMPORTED' | 'PARTIAL' | 'APPLIED';
type ReturnGridColumnKey =
  | 'bankAccount'
  | 'period'
  | 'importedItemCount'
  | 'liquidatedItemCount'
  | 'bankClosedItemCount'
  | 'readyToApplyCount'
  | 'createdAt';

type ReturnExportColumnKey =
  | ReturnGridColumnKey
  | 'provider'
  | 'status'
  | 'matchedItemCount'
  | 'appliedItemCount'
  | 'unmatchedItemCount';

type ReturnGridColumnDefinition = {
  key: ReturnGridColumnKey;
  label: string;
  visibleByDefault?: boolean;
  getValue: (item: BankReturnImportItem) => string;
};

type ReturnGridConfig = {
  order: ReturnGridColumnKey[];
  hidden: ReturnGridColumnKey[];
};

type ReturnGridSortDirection = 'ASC' | 'DESC';
type ReturnGridSort = {
  key: ReturnGridColumnKey | null;
  direction: ReturnGridSortDirection;
};
type ReturnColumnFilters = Record<ReturnGridColumnKey, string>;
type ReturnDatePeriodFilter = {
  start: string;
  end: string;
};

type ReturnGridConfigModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  columns: ReturnGridColumnDefinition[];
  order: ReturnGridColumnKey[];
  hidden: ReturnGridColumnKey[];
  onSave: (order: ReturnGridColumnKey[], hidden: ReturnGridColumnKey[]) => void;
  onClose: () => void;
};

const SCREEN_ID = 'FINANCEIRO_RETORNOS_BANCARIOS_LISTAGEM';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_RETORNOS';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const gridActionButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-70';
const gridActionToneClass = {
  blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-800',
};
const RETURN_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const RETURN_GRID_STORAGE_PREFIX = 'financeiro:retornos:grid-columns:';
const RETURN_EXPORT_STORAGE_PREFIX = 'financeiro:retornos:export-config:';

function getTodayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

function normalizeSearchValue(value?: string | number | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizeStatusValue(value?: string | null) {
  return normalizeSearchValue(value) || 'IMPORTED';
}

function getImportStatusLabel(status: string) {
  switch (normalizeStatusValue(status)) {
    case 'ALL':
      return 'TODOS STATUS';
    case 'APPLIED':
      return 'APLICADO';
    case 'PARTIAL':
      return 'PARCIAL';
    default:
      return 'IMPORTADO';
  }
}

function getImportStatusTone(status: string) {
  switch (normalizeStatusValue(status)) {
    case 'APPLIED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'PARTIAL':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700';
  }
}

function formatIntegerValue(value: number | null | undefined) {
  return String(Number(value || 0));
}

function formatReturnPeriod(item: BankReturnImportItem) {
  return `${formatDateLabel(item.periodStart)} ate ${formatDateLabel(item.periodEnd)}`;
}

const RETURN_STATUS_OPTIONS: Array<{ value: ReturnImportStatus; label: string }> = [
  { value: 'ALL', label: 'TODOS STATUS' },
  { value: 'IMPORTED', label: 'IMPORTADO' },
  { value: 'PARTIAL', label: 'PARCIAL' },
  { value: 'APPLIED', label: 'APLICADO' },
];

const RETURN_GRID_COLUMNS: ReturnGridColumnDefinition[] = [
  {
    key: 'bankAccount',
    label: 'Banco',
    visibleByDefault: true,
    getValue: (item) => item.bankAccountLabel || 'BANCO',
  },
  {
    key: 'period',
    label: 'Periodo',
    visibleByDefault: true,
    getValue: formatReturnPeriod,
  },
  {
    key: 'importedItemCount',
    label: 'Importados',
    visibleByDefault: true,
    getValue: (item) => formatIntegerValue(item.importedItemCount),
  },
  {
    key: 'liquidatedItemCount',
    label: 'Liquidados',
    visibleByDefault: true,
    getValue: (item) => formatIntegerValue(item.liquidatedItemCount),
  },
  {
    key: 'bankClosedItemCount',
    label: 'Baixados',
    visibleByDefault: true,
    getValue: (item) => formatIntegerValue(item.bankClosedItemCount),
  },
  {
    key: 'readyToApplyCount',
    label: 'Prontos',
    visibleByDefault: true,
    getValue: (item) => formatIntegerValue(item.readyToApplyCount),
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    visibleByDefault: true,
    getValue: (item) => formatDateLabel(item.createdAt),
  },
];

const RETURN_EXPORT_COLUMNS: GridColumnDefinition<
  BankReturnImportItem,
  ReturnExportColumnKey
>[] = [
  {
    key: 'bankAccount',
    label: 'Banco',
    getValue: (item) => item.bankAccountLabel || 'BANCO',
  },
  {
    key: 'provider',
    label: 'Provedor',
    getValue: (item) => item.provider || '---',
  },
  {
    key: 'status',
    label: 'Status',
    getValue: (item) => getImportStatusLabel(item.status),
  },
  {
    key: 'period',
    label: 'Periodo',
    getValue: formatReturnPeriod,
  },
  {
    key: 'importedItemCount',
    label: 'Importados',
    getValue: (item) => formatIntegerValue(item.importedItemCount),
    align: 'right',
  },
  {
    key: 'matchedItemCount',
    label: 'Vinculados',
    getValue: (item) => formatIntegerValue(item.matchedItemCount),
    align: 'right',
  },
  {
    key: 'liquidatedItemCount',
    label: 'Liquidados',
    getValue: (item) => formatIntegerValue(item.liquidatedItemCount),
    align: 'right',
  },
  {
    key: 'bankClosedItemCount',
    label: 'Baixados',
    getValue: (item) => formatIntegerValue(item.bankClosedItemCount),
    align: 'right',
  },
  {
    key: 'readyToApplyCount',
    label: 'Prontos',
    getValue: (item) => formatIntegerValue(item.readyToApplyCount),
    align: 'right',
  },
  {
    key: 'appliedItemCount',
    label: 'Aplicados',
    getValue: (item) => formatIntegerValue(item.appliedItemCount),
    align: 'right',
  },
  {
    key: 'unmatchedItemCount',
    label: 'Nao vinculados',
    getValue: (item) => formatIntegerValue(item.unmatchedItemCount),
    align: 'right',
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    getValue: (item) => formatDateLabel(item.createdAt),
    align: 'right',
  },
];

const DEFAULT_RETURN_GRID_CONFIG: ReturnGridConfig = {
  order: RETURN_GRID_COLUMNS.map((column) => column.key),
  hidden: RETURN_GRID_COLUMNS.filter((column) => column.visibleByDefault === false).map(
    (column) => column.key,
  ),
};
const EMPTY_RETURN_COLUMN_FILTERS = RETURN_GRID_COLUMNS.reduce((filters, column) => {
  filters[column.key] = '';
  return filters;
}, {} as ReturnColumnFilters);
const DEFAULT_RETURN_GRID_SORT: ReturnGridSort = {
  key: null,
  direction: 'ASC',
};
const EMPTY_RETURN_CREATED_AT_PERIOD: ReturnDatePeriodFilter = {
  start: '',
  end: '',
};

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function getReturnGridFilterValue(item: BankReturnImportItem, columnKey: ReturnGridColumnKey) {
  if (columnKey === 'bankAccount') {
    return [
      item.bankAccountLabel,
      item.bankAccountId,
      item.provider,
      item.status,
      getImportStatusLabel(item.status),
    ].join(' ');
  }

  if (columnKey === 'period') {
    return [
      item.periodStart,
      item.periodEnd,
      formatDateLabel(item.periodStart),
      formatDateLabel(item.periodEnd),
      formatReturnPeriod(item),
    ].join(' ');
  }

  if (columnKey === 'createdAt') {
    return [item.createdAt, formatDateLabel(item.createdAt)].join(' ');
  }

  const column = RETURN_GRID_COLUMNS.find((current) => current.key === columnKey);
  return column ? column.getValue(item) : '';
}

function matchesReturnColumnFilters(item: BankReturnImportItem, filters: ReturnColumnFilters) {
  return RETURN_GRID_COLUMNS.every((column) => {
    const filter = normalizeSearchValue(filters[column.key]);
    if (!filter) {
      return true;
    }

    return normalizeSearchValue(getReturnGridFilterValue(item, column.key)).includes(filter);
  });
}

function compareReturnGridValues(leftValue: string, rightValue: string) {
  return normalizeSearchValue(leftValue).localeCompare(
    normalizeSearchValue(rightValue),
    'pt-BR',
    { numeric: true, sensitivity: 'base' },
  );
}

function parseDateOnlyTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const [datePart] = String(value).split('T');
  const [year, month, day] = datePart.split('-').map((part) => Number(part));

  if (!year || !month || !day) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  }

  return new Date(year, month - 1, day).getTime();
}

function matchesReturnCreatedAtPeriod(
  item: BankReturnImportItem,
  period: ReturnDatePeriodFilter,
) {
  const startTime = parseDateOnlyTime(period.start);
  const endTime = parseDateOnlyTime(period.end);

  if (startTime === null && endTime === null) {
    return true;
  }

  const itemTime = parseDateOnlyTime(item.createdAt);
  if (itemTime === null) {
    return false;
  }

  if (startTime !== null && itemTime < startTime) {
    return false;
  }

  if (endTime !== null && itemTime > endTime) {
    return false;
  }

  return true;
}

function getReturnGridColumnAlign(columnKey: ReturnGridColumnKey) {
  return columnKey === 'importedItemCount' ||
    columnKey === 'liquidatedItemCount' ||
    columnKey === 'bankClosedItemCount' ||
    columnKey === 'readyToApplyCount' ||
    columnKey === 'createdAt'
    ? 'right'
    : 'left';
}

function isReturnSummaryColumn(columnKey: ReturnGridColumnKey) {
  return (
    columnKey === 'importedItemCount' ||
    columnKey === 'liquidatedItemCount' ||
    columnKey === 'bankClosedItemCount' ||
    columnKey === 'readyToApplyCount'
  );
}

function getReturnGridStorageKey(tenantId: string | null | undefined) {
  return `${RETURN_GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getReturnExportStorageKey(tenantId: string | null | undefined) {
  return `${RETURN_EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function normalizeReturnGridConfig(
  config: Partial<ReturnGridConfig> | string[] | null | undefined,
): ReturnGridConfig {
  if (Array.isArray(config)) {
    const visibleKeys = config.filter((item): item is ReturnGridColumnKey =>
      RETURN_GRID_COLUMNS.some((column) => column.key === item),
    );
    const missingKeys = RETURN_GRID_COLUMNS.map((column) => column.key).filter(
      (key) => !visibleKeys.includes(key),
    );

    return {
      order: [...visibleKeys, ...missingKeys],
      hidden: visibleKeys.length ? missingKeys : DEFAULT_RETURN_GRID_CONFIG.hidden,
    };
  }

  const allKeys = RETURN_GRID_COLUMNS.map((column) => column.key);
  const validOrder = (config?.order || []).filter((item): item is ReturnGridColumnKey =>
    RETURN_GRID_COLUMNS.some((column) => column.key === item),
  );
  const validHidden = (config?.hidden || []).filter((item): item is ReturnGridColumnKey =>
    RETURN_GRID_COLUMNS.some((column) => column.key === item),
  );
  const normalizedHidden =
    validHidden.length >= allKeys.length ? DEFAULT_RETURN_GRID_CONFIG.hidden : validHidden;

  return {
    order: [...validOrder, ...allKeys.filter((key) => !validOrder.includes(key))],
    hidden: Array.from(new Set(normalizedHidden)),
  };
}

function readStoredReturnGridConfig(tenantId: string | null | undefined) {
  if (typeof window === 'undefined') {
    return DEFAULT_RETURN_GRID_CONFIG;
  }

  try {
    const stored = window.localStorage.getItem(getReturnGridStorageKey(tenantId));
    return stored
      ? normalizeReturnGridConfig(JSON.parse(stored) as Partial<ReturnGridConfig> | string[])
      : DEFAULT_RETURN_GRID_CONFIG;
  } catch {
    return DEFAULT_RETURN_GRID_CONFIG;
  }
}

function writeStoredReturnGridConfig(
  tenantId: string | null | undefined,
  config: ReturnGridConfig,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    getReturnGridStorageKey(tenantId),
    JSON.stringify(normalizeReturnGridConfig(config)),
  );
}

function ColumnsIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={2} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5v14M15 5v14" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9V4h12v5" />
      <path d="M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1" />
      <path d="M6 14h12v6H6z" />
      <path d="M17 12h.01" />
    </svg>
  );
}

function ReturnGridConfigModal({
  isOpen,
  title,
  description,
  columns,
  order,
  hidden,
  onSave,
  onClose,
}: ReturnGridConfigModalProps) {
  const [draftOrder, setDraftOrder] = useState<ReturnGridColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<ReturnGridColumnKey[]>(hidden);
  const [draggedColumnKey, setDraggedColumnKey] =
    useState<ReturnGridColumnKey | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraggedColumnKey(null);
      return;
    }

    setDraftOrder(order);
    setDraftHidden(hidden);
  }, [hidden, isOpen, order]);

  if (!isOpen) {
    return null;
  }

  const visibleCount = draftOrder.filter((columnKey) => !draftHidden.includes(columnKey)).length;

  const moveColumnToIndex = (columnKey: ReturnGridColumnKey, targetIndex: number) => {
    const currentIndex = draftOrder.indexOf(columnKey);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    setDraftOrder((current) => moveArrayItem(current, currentIndex, targetIndex));
  };

  const toggleColumnVisibility = (columnKey: ReturnGridColumnKey) => {
    setDraftHidden((current) => {
      const isHidden = current.includes(columnKey);
      if (!isHidden && visibleCount <= 1) {
        return current;
      }

      return isHidden ? current.filter((item) => item !== columnKey) : [...current, columnKey];
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
              Configuracao da tela
            </div>
            <h2 className="mt-1 truncate text-2xl font-black text-slate-900">{title}</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            X
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-slate-700">
                  Colunas visiveis: {visibleCount}
                </div>
                <div className="text-xs font-medium text-slate-500">
                  Reordene, oculte ou inclua colunas do grid nesta tela.
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraftOrder(DEFAULT_RETURN_GRID_CONFIG.order);
                    setDraftHidden(DEFAULT_RETURN_GRID_CONFIG.hidden);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Restaurar padrao
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSave(draftOrder, draftHidden);
                    onClose();
                  }}
                  className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  Salvar / Fechar Configuracao
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-3">
              {draftOrder.map((columnKey, index) => {
                const column = columns.find((item) => item.key === columnKey);
                if (!column) {
                  return null;
                }

                const isHidden = draftHidden.includes(columnKey);
                const isDragging = draggedColumnKey === columnKey;

                return (
                  <div
                    key={column.key}
                    draggable
                    onDragStart={() => setDraggedColumnKey(column.key)}
                    onDragEnd={() => setDraggedColumnKey(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedColumnKey) {
                        return;
                      }

                      moveColumnToIndex(draggedColumnKey, index);
                      setDraggedColumnKey(null);
                    }}
                    className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 transition ${
                      isDragging
                        ? 'border-emerald-300 bg-emerald-100/90 ring-2 ring-emerald-300'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleColumnVisibility(column.key);
                        }}
                        aria-pressed={!isHidden}
                        title={!isHidden ? 'Esta coluna esta sendo usada no grid' : 'Esta coluna nao esta sendo usada no grid'}
                        className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-sm transition-transform hover:scale-105 ${
                          isHidden
                            ? 'border-rose-200 bg-rose-500 text-white shadow-rose-200/80'
                            : 'border-emerald-200 bg-emerald-500 text-white shadow-emerald-200/80'
                        }`}
                      >
                        {isHidden ? (
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        ) : (
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      <div>
                        <div className="text-sm font-black text-slate-800">{column.label}</div>
                        <div className="text-xs font-medium text-slate-500">
                          {column.visibleByDefault === false ? 'Coluna extra' : 'Coluna padrao'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveColumnToIndex(column.key, Math.max(index - 1, 0));
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                        title="Mover para cima"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 15l6-6 6 6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveColumnToIndex(column.key, Math.min(index + 1, draftOrder.length - 1));
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                        title="Mover para baixo"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      <span
                        className="inline-flex h-10 w-10 cursor-grab items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:cursor-grabbing"
                        title="Clique e segure para arrastar esta coluna"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
                        </svg>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReturnGridFooter({
  pageSize,
  currentPage,
  totalPages,
  onColumnSettings,
  onExport,
  onPageSizeChange,
  onPageChange,
}: {
  pageSize: number;
  currentPage: number;
  totalPages: number;
  onColumnSettings: () => void;
  onExport: () => void;
  onPageSizeChange: (value: number) => void;
  onPageChange: (value: number) => void;
}) {
  const normalizedTotalPages = Math.max(1, totalPages);
  const normalizedCurrentPage = Math.min(Math.max(1, currentPage), normalizedTotalPages);

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onColumnSettings}
            title="ALTERAR COLUNAS GRID"
            aria-label="ALTERAR COLUNAS GRID"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ColumnsIcon />
          </button>
          <button
            type="button"
            onClick={onExport}
            title="Imprimir ou exportar"
            aria-label="Imprimir ou exportar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-600"
          >
            <PrintIcon />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            title="Registros por pagina"
            aria-label="Registros por pagina"
            className="h-10 rounded-full border border-slate-300 bg-white px-3 text-sm font-black text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          >
            {RETURN_PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={normalizedCurrentPage <= 1}
              title="Voltar para o inicio"
              aria-label="Voltar para o inicio"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &lt;&lt;
            </button>
            <button
              type="button"
              onClick={() => onPageChange(normalizedCurrentPage - 1)}
              disabled={normalizedCurrentPage <= 1}
              title="Voltar uma pagina"
              aria-label="Voltar uma pagina"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &lt;
            </button>
            <span className="min-w-16 text-center text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              {normalizedCurrentPage}/{normalizedTotalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(normalizedCurrentPage + 1)}
              disabled={normalizedCurrentPage >= normalizedTotalPages}
              title="Avancar uma pagina"
              aria-label="Avancar uma pagina"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &gt;
            </button>
            <button
              type="button"
              onClick={() => onPageChange(normalizedTotalPages)}
              disabled={normalizedCurrentPage >= normalizedTotalPages}
              title="Avancar para o final"
              aria-label="Avancar para o final"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &gt;&gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinanceiroBankReturnsPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const isEmbedded = runtimeContext.embedded;
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const router = useRouter();
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [imports, setImports] = useState<BankReturnImportItem[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [periodStart, setPeriodStart] = useState(getTodayDateInput());
  const [periodEnd, setPeriodEnd] = useState(getTodayDateInput());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReturnImportStatus>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeReturnFilterColumn, setActiveReturnFilterColumn] =
    useState<ReturnGridColumnKey | null>(null);
  const [returnColumnFilters, setReturnColumnFilters] = useState<ReturnColumnFilters>({
    ...EMPTY_RETURN_COLUMN_FILTERS,
  });
  const [returnColumnFilterDrafts, setReturnColumnFilterDrafts] =
    useState<ReturnColumnFilters>({ ...EMPTY_RETURN_COLUMN_FILTERS });
  const [createdAtPeriodFilter, setCreatedAtPeriodFilter] =
    useState<ReturnDatePeriodFilter>({ ...EMPTY_RETURN_CREATED_AT_PERIOD });
  const [createdAtPeriodDraft, setCreatedAtPeriodDraft] =
    useState<ReturnDatePeriodFilter>({ ...EMPTY_RETURN_CREATED_AT_PERIOD });
  const [returnGridSort, setReturnGridSort] = useState<ReturnGridSort>({
    ...DEFAULT_RETURN_GRID_SORT,
  });
  const [returnPageSize, setReturnPageSize] = useState(10);
  const [returnPage, setReturnPage] = useState(1);
  const [selectedReturnGridRowId, setSelectedReturnGridRowId] = useState<string | null>(
    null,
  );
  const [columnOrder, setColumnOrder] = useState<ReturnGridColumnKey[]>(
    DEFAULT_RETURN_GRID_CONFIG.order,
  );
  const [hiddenColumns, setHiddenColumns] = useState<ReturnGridColumnKey[]>(
    DEFAULT_RETURN_GRID_CONFIG.hidden,
  );
  const [loadedGridConfigKey, setLoadedGridConfigKey] = useState<string | null>(null);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<
    Record<ReturnExportColumnKey, boolean>
  >(buildDefaultExportColumns(RETURN_EXPORT_COLUMNS));

  useEffect(() => {
    if (!isEmbedded) return;

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: EMBEDDED_SCREEN_ID,
      },
      '*',
    );
  }, [isEmbedded]);

  useEffect(() => {
    if (!isEmbedded || typeof document === 'undefined') return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isEmbedded]);

  useEffect(() => {
    const storageKey = getReturnGridStorageKey(runtimeContext.sourceTenantId);
    const storedConfig = readStoredReturnGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
    setLoadedGridConfigKey(storageKey);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (loadedGridConfigKey !== getReturnGridStorageKey(runtimeContext.sourceTenantId)) {
      return;
    }

    writeStoredReturnGridConfig(runtimeContext.sourceTenantId, {
      order: columnOrder,
      hidden: hiddenColumns,
    });
  }, [columnOrder, hiddenColumns, loadedGridConfigKey, runtimeContext.sourceTenantId]);

  const loadPageData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [loadedBanks, loadedImports] = await Promise.all([
        getJson<BankItem[]>(`/banks${buildFinanceApiQueryString(runtimeContext, {
          status: 'ACTIVE',
        })}`),
        getJson<BankReturnImportItem[]>(
          `/receivables/bank-return-imports${buildFinanceApiQueryString(runtimeContext)}`,
        ),
      ]);

      const filteredBanks = loadedBanks.filter(
        (item) => String(item.status || '').trim().toUpperCase() === 'ACTIVE',
      );

      setBanks(filteredBanks);
      setImports(loadedImports);

      if (!selectedBankId && filteredBanks.length) {
        setSelectedBankId(filteredBanks[0].id);
      }
    } catch (currentError) {
      setBanks([]);
      setImports([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Nao foi possivel carregar os retornos bancarios do Financeiro.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext, selectedBankId]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const activeReturnColumns = useMemo(
    () =>
      columnOrder
        .map((columnKey) => RETURN_GRID_COLUMNS.find((column) => column.key === columnKey))
        .filter(
          (column): column is ReturnGridColumnDefinition => {
            if (!column) {
              return false;
            }

            return !hiddenColumns.includes(column.key);
          },
        ),
    [columnOrder, hiddenColumns],
  );

  const selectedBank = useMemo(
    () => banks.find((item) => item.id === selectedBankId) || null,
    [banks, selectedBankId],
  );

  const filteredImports = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(search);

    return imports.filter((item) => {
      const importStatus = normalizeStatusValue(item.status) as ReturnImportStatus;

      if (statusFilter !== 'ALL' && importStatus !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = normalizeSearchValue(
        [
          item.bankAccountLabel,
          item.bankAccountId,
          item.provider,
          item.status,
          getImportStatusLabel(item.status),
          item.periodStart,
          item.periodEnd,
          formatReturnPeriod(item),
          item.importedItemCount,
          item.liquidatedItemCount,
          item.bankClosedItemCount,
          item.readyToApplyCount,
          item.createdAt,
        ].join(' '),
      );

      return searchableText.includes(normalizedSearch);
    });
  }, [imports, search, statusFilter]);

  const displayedImports = useMemo(() => {
    const columnFilteredImports = filteredImports.filter(
      (item) =>
        matchesReturnColumnFilters(item, returnColumnFilters) &&
        matchesReturnCreatedAtPeriod(item, createdAtPeriodFilter),
    );

    if (!returnGridSort.key) {
      return columnFilteredImports;
    }

    const directionMultiplier = returnGridSort.direction === 'DESC' ? -1 : 1;
    return [...columnFilteredImports].sort(
      (left, right) =>
        compareReturnGridValues(
          getReturnGridFilterValue(left, returnGridSort.key as ReturnGridColumnKey),
          getReturnGridFilterValue(right, returnGridSort.key as ReturnGridColumnKey),
        ) * directionMultiplier,
    );
  }, [
    createdAtPeriodFilter,
    filteredImports,
    returnColumnFilters,
    returnGridSort.direction,
    returnGridSort.key,
  ]);

  const returnTotalPages = Math.max(1, Math.ceil(displayedImports.length / returnPageSize));
  const currentReturnPage = Math.min(returnPage, returnTotalPages);
  const paginatedImports = useMemo(
    () =>
      displayedImports.slice(
        (currentReturnPage - 1) * returnPageSize,
        currentReturnPage * returnPageSize,
      ),
    [currentReturnPage, displayedImports, returnPageSize],
  );

  const returnGridTotals = useMemo(
    () =>
      displayedImports.reduce(
        (accumulator, current) => ({
          importedItemCount: accumulator.importedItemCount + current.importedItemCount,
          liquidatedItemCount:
            accumulator.liquidatedItemCount + current.liquidatedItemCount,
          bankClosedItemCount:
            accumulator.bankClosedItemCount + current.bankClosedItemCount,
          readyToApplyCount: accumulator.readyToApplyCount + current.readyToApplyCount,
        }),
        {
          importedItemCount: 0,
          liquidatedItemCount: 0,
          bankClosedItemCount: 0,
          readyToApplyCount: 0,
        },
      ),
    [displayedImports],
  );

  useEffect(() => {
    setReturnPage(1);
  }, [
    createdAtPeriodFilter,
    returnColumnFilters,
    returnGridSort.direction,
    returnGridSort.key,
    returnPageSize,
    search,
    statusFilter,
  ]);

  const pageClassName = isEmbedded
    ? 'flex h-screen min-h-0 flex-col gap-4 overflow-hidden'
    : 'space-y-6';
  const importSectionClassName = `${cardClass} shrink-0 ${isEmbedded ? 'p-4' : 'p-6'}`;
  const gridSectionClassName = `${cardClass} flex ${
    isEmbedded ? 'min-h-0 flex-1' : 'h-[calc(100vh-17rem)] min-h-[560px]'
  } flex-col overflow-hidden`;
  const statusPillClassName = isEmbedded
    ? 'inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]'
    : 'inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]';
  const secondaryMetaClassName = isEmbedded
    ? 'mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400'
    : 'mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400';
  const companyDisplayName =
    runtimeContext.companyName || selectedBank?.bankName || 'EMPRESA ATUAL';

  function setReturnPageClamped(nextPage: number) {
    setReturnPage(Math.min(Math.max(1, nextPage), returnTotalPages));
  }

  function openReturnColumnFilter(columnKey: ReturnGridColumnKey) {
    if (columnKey === 'createdAt') {
      setCreatedAtPeriodDraft(createdAtPeriodFilter);
      setActiveReturnFilterColumn((current) => (current === columnKey ? null : columnKey));
      return;
    }

    setReturnColumnFilterDrafts((current) => ({
      ...current,
      [columnKey]: returnColumnFilters[columnKey],
    }));
    setActiveReturnFilterColumn((current) => (current === columnKey ? null : columnKey));
  }

  function applyReturnColumnFilter(columnKey: ReturnGridColumnKey) {
    if (columnKey === 'createdAt') {
      setCreatedAtPeriodFilter(createdAtPeriodDraft);
      setActiveReturnFilterColumn(null);
      return;
    }

    setReturnColumnFilters((current) => ({
      ...current,
      [columnKey]: returnColumnFilterDrafts[columnKey],
    }));
    setActiveReturnFilterColumn(null);
  }

  function clearReturnColumnFilter(columnKey: ReturnGridColumnKey) {
    if (columnKey === 'createdAt') {
      setCreatedAtPeriodFilter({ ...EMPTY_RETURN_CREATED_AT_PERIOD });
      setCreatedAtPeriodDraft({ ...EMPTY_RETURN_CREATED_AT_PERIOD });
      setActiveReturnFilterColumn(null);
      return;
    }

    setReturnColumnFilters((current) => ({
      ...current,
      [columnKey]: '',
    }));
    setReturnColumnFilterDrafts((current) => ({
      ...current,
      [columnKey]: '',
    }));
    setActiveReturnFilterColumn(null);
  }

  function clearAllReturnColumnControls() {
    setReturnColumnFilters({ ...EMPTY_RETURN_COLUMN_FILTERS });
    setReturnColumnFilterDrafts({ ...EMPTY_RETURN_COLUMN_FILTERS });
    setCreatedAtPeriodFilter({ ...EMPTY_RETURN_CREATED_AT_PERIOD });
    setCreatedAtPeriodDraft({ ...EMPTY_RETURN_CREATED_AT_PERIOD });
    setReturnGridSort({ ...DEFAULT_RETURN_GRID_SORT });
    setActiveReturnFilterColumn(null);
  }

  function renderReturnClearAllButton() {
    const hasActiveControls =
      Object.values(returnColumnFilters).some((value) => value.trim()) ||
      Boolean(createdAtPeriodFilter.start || createdAtPeriodFilter.end) ||
      Boolean(returnGridSort.key);

    return (
      <button
        type="button"
        onClick={clearAllReturnColumnControls}
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

  function renderReturnCreatedAtPeriodHeader(column: ReturnGridColumnDefinition) {
    const isOpen = activeReturnFilterColumn === column.key;
    const isActive =
      Boolean(createdAtPeriodFilter.start || createdAtPeriodFilter.end) ||
      returnGridSort.key === column.key;

    return (
      <div className="relative inline-flex items-center gap-1.5">
        <span>{column.label}</span>
        <button
          type="button"
          onClick={() => openReturnColumnFilter(column.key)}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
            isActive
              ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
          }`}
          title="Filtrar periodo de criacao"
          aria-label="Filtrar periodo de criacao"
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
                      setReturnGridSort({ key: column.key, direction });
                      setActiveReturnFilterColumn(null);
                    }}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                      returnGridSort.key === column.key && returnGridSort.direction === direction
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
                    value={createdAtPeriodDraft.start}
                    onChange={(event) =>
                      setCreatedAtPeriodDraft((current) => ({
                        ...current,
                        start: event.target.value,
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
                    value={createdAtPeriodDraft.end}
                    onChange={(event) =>
                      setCreatedAtPeriodDraft((current) => ({
                        ...current,
                        end: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => applyReturnColumnFilter(column.key)}
                className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100"
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={() => clearReturnColumnFilter(column.key)}
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

  function renderReturnColumnHeader(column: ReturnGridColumnDefinition) {
    if (column.key === 'createdAt') {
      return renderReturnCreatedAtPeriodHeader(column);
    }

    const isActive =
      Boolean(returnColumnFilters[column.key].trim()) || returnGridSort.key === column.key;

    return (
      <GridColumnFilterHeader
        label={column.label}
        isOpen={activeReturnFilterColumn === column.key}
        isActive={isActive}
        filterValue={returnColumnFilterDrafts[column.key]}
        placeholder={`DIGITE ${column.label.toUpperCase()}`}
        align={getReturnGridColumnAlign(column.key)}
        sortDirection={returnGridSort.key === column.key ? returnGridSort.direction : null}
        onToggle={() => openReturnColumnFilter(column.key)}
        onSort={(direction) => {
          setReturnGridSort({ key: column.key, direction });
          setActiveReturnFilterColumn(null);
        }}
        onFilterValueChange={(value) =>
          setReturnColumnFilterDrafts((current) => ({
            ...current,
            [column.key]: value,
          }))
        }
        onApply={() => applyReturnColumnFilter(column.key)}
        onClear={() => clearReturnColumnFilter(column.key)}
      />
    );
  }

  function renderReturnSummaryCell(column: ReturnGridColumnDefinition) {
    if (!isReturnSummaryColumn(column.key)) {
      return null;
    }

    return (
      <div className="flex justify-end">
        <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>
          {formatIntegerValue(returnGridTotals[column.key])}
        </span>
      </div>
    );
  }

  function renderReturnCell(item: BankReturnImportItem, column: ReturnGridColumnDefinition) {
    if (column.key === 'bankAccount') {
      return (
        <div>
          <div className="font-black text-slate-900">
            {item.bankAccountLabel || 'BANCO'}
          </div>
          <div className="mt-1">
            <span className={`${statusPillClassName} ${getImportStatusTone(item.status)}`}>
              {getImportStatusLabel(item.status)}
            </span>
          </div>
          <div className={secondaryMetaClassName}>{item.provider || 'RETORNO BANCARIO'}</div>
        </div>
      );
    }

    if (column.key === 'period') {
      return <span className="font-semibold text-slate-700">{formatReturnPeriod(item)}</span>;
    }

    if (column.key === 'liquidatedItemCount') {
      return <span className="font-semibold text-emerald-700">{item.liquidatedItemCount}</span>;
    }

    if (column.key === 'bankClosedItemCount') {
      return <span className="font-semibold text-rose-600">{item.bankClosedItemCount}</span>;
    }

    if (column.key === 'readyToApplyCount') {
      return <span className="font-black text-blue-700">{item.readyToApplyCount}</span>;
    }

    if (column.key === 'createdAt') {
      return <span className="font-semibold text-slate-700">{formatDateLabel(item.createdAt)}</span>;
    }

    return <span className="font-semibold text-slate-700">{column.getValue(item)}</span>;
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedBankId) {
      setError('Selecione o banco do retorno bancario.');
      return;
    }

    try {
      setIsImporting(true);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(`${API_BASE_URL}/receivables/bank-return-imports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          bankAccountId: selectedBankId,
          periodStart,
          periodEnd,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload?.message || 'Nao foi possivel importar o retorno bancario.',
        );
      }

      setStatusMessage(
        payload?.message || 'Retorno bancario importado com sucesso.',
      );

      if (payload?.id) {
        router.push(`/recebiveis/retornos/${payload.id}${preservedQueryString}`);
        return;
      }

      await loadPageData();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Nao foi possivel importar o retorno bancario.',
        ),
      );
    } finally {
      setIsImporting(false);
    }
  }

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
                  Retorno bancario
                </h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                  Importe os boletos liquidados e baixados do banco, confira as
                  observacoes e so depois efetive a baixa manual nas parcelas do sistema.
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
            <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
          </div>
        </section>
      ) : null}

      {error ? (
        <section className={`${cardClass} shrink-0 border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      {statusMessage ? (
        <section className={`${cardClass} shrink-0 border-emerald-200 bg-emerald-50 px-6 py-5 text-sm font-semibold text-emerald-700`}>
          {statusMessage}
        </section>
      ) : null}

      <section className={importSectionClassName}>
        <form onSubmit={handleImport} className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Banco
            </span>
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
            disabled={isImporting}
            className="mt-auto rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isImporting ? 'Importando...' : 'Importar retorno'}
          </button>
        </form>
      </section>

      <section className={gridSectionClassName}>
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="BUSCAR RETORNO..."
              />
              <svg
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ReturnImportStatus)}
              title="Status do retorno"
              aria-label="Status do retorno"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 sm:w-56"
            >
              {RETURN_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="ml-auto text-xs font-black uppercase tracking-[0.14em] text-slate-600">
              {isLoading
                ? 'Carregando...'
                : `${displayedImports.length} retorno(s) encontrado(s)`}
            </div>
          </div>
        </div>

        <div
          className={`min-h-0 ${
            isEmbedded ? 'flex-1 overflow-auto' : 'max-h-[calc(100vh-24rem)] overflow-auto'
          }`}
        >
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm text-slate-600">
            <colgroup>
              <col className="w-12" />
              {activeReturnColumns.map((column) => (
                <col key={column.key} />
              ))}
              <col className="w-32" />
            </colgroup>
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider text-slate-600">
                <th className="sticky top-0 z-20 w-12 bg-slate-50 px-3 py-3 text-left">
                  {renderReturnClearAllButton()}
                </th>
                {activeReturnColumns.map((column) => (
                  <th
                    key={column.key}
                    className={`sticky top-0 z-20 bg-slate-50 px-4 py-3 ${
                      getReturnGridColumnAlign(column.key) === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {renderReturnColumnHeader(column)}
                  </th>
                ))}
                <th className="sticky top-0 z-20 w-32 bg-slate-50 px-4 py-3 text-right">
                  Acoes
                </th>
              </tr>
              {activeReturnFilterColumn ? (
                <tr aria-hidden="true">
                  <th colSpan={activeReturnColumns.length + 2} className="h-56 bg-white p-0" />
                </tr>
              ) : null}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={activeReturnColumns.length + 2}
                    className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Carregando retornos...
                  </td>
                </tr>
              ) : null}

              {!isLoading && paginatedImports.map((item, returnIndex) => {
                const isSelected = selectedReturnGridRowId === item.id;
                const zebraClass = returnIndex % 2 ? 'bg-slate-100/70' : 'bg-white';

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedReturnGridRowId(item.id)}
                    aria-selected={isSelected}
                    className={`cursor-pointer border-t border-slate-100 transition hover:bg-blue-50 ${
                      isSelected ? 'bg-blue-100 ring-2 ring-inset ring-blue-300' : zebraClass
                    }`}
                  >
                    <td className="px-3 py-4" />
                    {activeReturnColumns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-4 ${
                          getReturnGridColumnAlign(column.key) === 'right'
                            ? 'text-right'
                            : 'text-left'
                        }`}
                      >
                        {renderReturnCell(item, column)}
                      </td>
                    ))}
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/recebiveis/retornos/${item.id}${preservedQueryString}`}
                          title="Ver conferencia"
                          aria-label="Ver conferencia"
                          onClick={(event) => event.stopPropagation()}
                          className={`${gridActionButtonClass} ${gridActionToneClass.blue}`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
                          </svg>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!isLoading && !displayedImports.length ? (
                <tr>
                  <td
                    colSpan={activeReturnColumns.length + 2}
                    className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Nenhuma importacao de retorno bancario foi encontrada para o filtro informado.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsRow}>
              <tr className="bg-[#1d4f91]">
                <td
                  colSpan={activeReturnColumns.length ? 2 : 1}
                  className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} text-left`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalRecordsPill}>
                      Total registros: {displayedImports.length}
                    </span>
                    {activeReturnColumns[0] ? renderReturnSummaryCell(activeReturnColumns[0]) : null}
                  </div>
                </td>
                {activeReturnColumns.slice(1).map((column) => (
                  <td
                    key={column.key}
                    className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} ${
                      getReturnGridColumnAlign(column.key) === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {renderReturnSummaryCell(column)}
                  </td>
                ))}
                <td className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} />
              </tr>
            </tfoot>
          </table>
        </div>

        <ReturnGridFooter
          pageSize={returnPageSize}
          currentPage={currentReturnPage}
          totalPages={returnTotalPages}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onPageSizeChange={setReturnPageSize}
          onPageChange={setReturnPageClamped}
        />
      </section>

      <ReturnGridConfigModal
        isOpen={isColumnConfigOpen}
        title="Configurar colunas do grid"
        description="Reordene, oculte ou inclua colunas dos retornos bancarios nesta tela."
        columns={RETURN_GRID_COLUMNS}
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
        title="Exportar retornos"
        description={`A exportacao respeita a busca atual e inclui ${displayedImports.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={RETURN_EXPORT_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={getReturnExportStorageKey(runtimeContext.sourceTenantId)}
        brandingName={companyDisplayName}
        brandingLogoUrl={runtimeContext.logoUrl}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          try {
            await exportGridRows({
              rows: displayedImports,
              columns: (config.orderedColumns || []).length
                ? config.orderedColumns
                    .map((key) =>
                      RETURN_EXPORT_COLUMNS.find((column) => column.key === key),
                    )
                    .filter(
                      (
                        column,
                      ): column is GridColumnDefinition<
                        BankReturnImportItem,
                        ReturnExportColumnKey
                      > => Boolean(column),
                    )
                : RETURN_EXPORT_COLUMNS,
              selectedColumns: config.selectedColumns,
              format: exportFormat,
              pdfOptions: config.pdfOptions,
              fileBaseName: 'retornos-bancarios',
              branding: {
                title: 'Retornos bancarios',
                subtitle: 'Exportacao com os filtros atualmente aplicados.',
                schoolName: companyDisplayName,
                logoUrl: runtimeContext.logoUrl,
              },
            });
            setExportColumns(config.selectedColumns);
            setError(null);
            setIsExportModalOpen(false);
          } catch (currentError) {
            setError(
              currentError instanceof Error
                ? currentError.message
                : 'Nao foi possivel exportar os retornos.',
            );
          }
        }}
      />
    </div>
  );
}
