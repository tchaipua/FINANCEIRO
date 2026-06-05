'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
  formatCurrency,
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import {
  buildDefaultExportColumns,
  exportGridRows,
  type GridColumnDefinition,
  type GridExportFormat,
} from '@/app/lib/grid-export-utils';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type BatchItem = {
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

type BankSlipSummaryStatus =
  | 'ALL'
  | 'WAITING_PREPARATION'
  | 'READY_TO_SEND'
  | 'SENT_TO_BANK'
  | 'PARTIAL_OR_ERROR';

type InstallmentItem = {
  id: string;
  sourceEntityName: string;
  payerNameSnapshot: string;
  installmentNumber: number;
  installmentCount: number;
  bankSlipStatus?: string | null;
  bankSlipOurNumber?: string | null;
  hasBankSlipPdf?: boolean;
};

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

type BatchGridColumnKey =
  | 'batch'
  | 'target'
  | 'itemCount'
  | 'processedCount'
  | 'totalAmount'
  | 'createdAt';

type BatchExportColumnKey =
  | BatchGridColumnKey
  | 'companyName'
  | 'sourceSystem'
  | 'sourceTenantId'
  | 'sourceBatchId'
  | 'status'
  | 'duplicateCount'
  | 'errorCount'
  | 'referenceDate';

type BatchGridColumnDefinition = {
  key: BatchGridColumnKey;
  label: string;
  visibleByDefault?: boolean;
  getValue: (batch: BatchItem) => string;
};

type BatchGridConfig = {
  order: BatchGridColumnKey[];
  hidden: BatchGridColumnKey[];
};

type BatchGridSortDirection = 'ASC' | 'DESC';
type BatchGridSort = {
  key: BatchGridColumnKey | null;
  direction: BatchGridSortDirection;
};
type BatchColumnFilters = Record<BatchGridColumnKey, string>;
type BatchDatePeriodFilter = {
  start: string;
  end: string;
};

type BatchGridConfigModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  columns: BatchGridColumnDefinition[];
  order: BatchGridColumnKey[];
  hidden: BatchGridColumnKey[];
  onSave: (order: BatchGridColumnKey[], hidden: BatchGridColumnKey[]) => void;
  onClose: () => void;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_LOTES_LISTAGEM';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_LOTES';
const EMIT_BATCH_BANK_SLIPS_POPUP_SCREEN_ID =
  'FINANCEIRO_RECEBIVEIS_LOTES_IMPRIMIR_BOLETOS_LOTE';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const gridActionButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-70';
const gridActionToneClass = {
  blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-800',
  sky: 'bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-900',
};
const BATCH_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const BATCH_GRID_STORAGE_PREFIX = 'financeiro:lotes:grid-columns:';
const BATCH_EXPORT_STORAGE_PREFIX = 'financeiro:lotes:export-config:';

function getBatchTotalAmount(batch: BatchItem) {
  return (batch.receivableTitles || []).reduce(
    (accumulator, current) => accumulator + Number(current.totalAmount || 0),
    0,
  );
}

function canPrintFullBatchBankSlips(batch: BatchItem) {
  return (
    getBankSlipSummaryStatus(batch) === 'SENT_TO_BANK' &&
    Number(batch.bankSlipSummary?.totalCount || 0) > 0
  );
}

function canEmitBankSlipPdf(installment: InstallmentItem) {
  return (
    String(installment.bankSlipStatus || '').trim().toUpperCase() === 'ISSUED' &&
    Boolean(installment.hasBankSlipPdf)
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

function normalizeSearchValue(value?: string | number | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function getBankSlipSummaryStatus(batch: BatchItem) {
  return batch.bankSlipSummary?.status || 'WAITING_PREPARATION';
}

function getBankSlipSummaryStatusLabel(status: string) {
  switch (String(status || '').trim().toUpperCase()) {
    case 'ALL':
      return 'TODOS STATUS';
    case 'READY_TO_SEND':
      return 'AGUARDANDO ENVIO';
    case 'SENT_TO_BANK':
      return 'ENVIADO AO BANCO';
    case 'PARTIAL_OR_ERROR':
      return 'PARCIAL / COM ERRO';
    default:
      return 'AGUARDANDO PREPARAÇÃO';
  }
}

function getBankSlipSummaryStatusTone(status: string) {
  switch (String(status || '').trim().toUpperCase()) {
    case 'READY_TO_SEND':
      return 'border-[#F54627] bg-[#F54627] text-white';
    case 'SENT_TO_BANK':
      return 'border-emerald-300 bg-emerald-100 text-emerald-900';
    case 'PARTIAL_OR_ERROR':
      return 'border-rose-300 bg-rose-100 text-rose-800';
    default:
      return 'border-yellow-300 bg-yellow-100 text-yellow-900';
  }
}

const BATCH_GRID_COLUMNS: BatchGridColumnDefinition[] = [
  {
    key: 'batch',
    label: 'Lote',
    visibleByDefault: true,
    getValue: (batch) => `${batch.sourceBatchType || 'LOTE'} | ${batch.sourceSystem || '---'}`,
  },
  {
    key: 'target',
    label: 'Filtro',
    visibleByDefault: true,
    getValue: (batch) => batch.metadata?.targetLabel || batch.sourceTenantId || '---',
  },
  {
    key: 'itemCount',
    label: 'Títulos',
    visibleByDefault: true,
    getValue: (batch) => String(batch.itemCount || 0),
  },
  {
    key: 'processedCount',
    label: 'Parcelas',
    visibleByDefault: true,
    getValue: (batch) => String(batch.processedCount || 0),
  },
  {
    key: 'totalAmount',
    label: 'Total',
    visibleByDefault: true,
    getValue: (batch) => formatCurrency(getBatchTotalAmount(batch)),
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    visibleByDefault: true,
    getValue: (batch) => formatDateLabel(batch.createdAt),
  },
];

const BATCH_EXPORT_COLUMNS: GridColumnDefinition<BatchItem, BatchExportColumnKey>[] = [
  {
    key: 'companyName',
    label: 'Empresa',
    getValue: (batch) => batch.companyName || '---',
  },
  {
    key: 'batch',
    label: 'Lote',
    getValue: (batch) => `${batch.sourceBatchType || 'LOTE'} | ${batch.sourceSystem || '---'}`,
  },
  {
    key: 'target',
    label: 'Filtro',
    getValue: (batch) => batch.metadata?.targetLabel || batch.sourceTenantId || '---',
  },
  {
    key: 'sourceSystem',
    label: 'Sistema origem',
    getValue: (batch) => batch.sourceSystem || '---',
  },
  {
    key: 'sourceTenantId',
    label: 'Tenant origem',
    getValue: (batch) => batch.sourceTenantId || '---',
  },
  {
    key: 'sourceBatchId',
    label: 'ID lote origem',
    getValue: (batch) => batch.sourceBatchId || '---',
  },
  {
    key: 'status',
    label: 'Status boletos',
    getValue: (batch) => getBankSlipSummaryStatusLabel(getBankSlipSummaryStatus(batch)),
  },
  {
    key: 'itemCount',
    label: 'Títulos',
    getValue: (batch) => String(batch.itemCount || 0),
    align: 'right',
  },
  {
    key: 'processedCount',
    label: 'Parcelas',
    getValue: (batch) => String(batch.processedCount || 0),
    align: 'right',
  },
  {
    key: 'duplicateCount',
    label: 'Duplicados',
    getValue: (batch) => String(batch.duplicateCount || 0),
    align: 'right',
  },
  {
    key: 'errorCount',
    label: 'Erros',
    getValue: (batch) => String(batch.errorCount || 0),
    align: 'right',
  },
  {
    key: 'totalAmount',
    label: 'Total',
    getValue: (batch) => formatCurrency(getBatchTotalAmount(batch)),
    align: 'right',
  },
  {
    key: 'referenceDate',
    label: 'Referência',
    getValue: (batch) => formatDateLabel(batch.referenceDate),
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    getValue: (batch) => formatDateLabel(batch.createdAt),
    align: 'right',
  },
];

const DEFAULT_BATCH_GRID_CONFIG: BatchGridConfig = {
  order: BATCH_GRID_COLUMNS.map((column) => column.key),
  hidden: BATCH_GRID_COLUMNS.filter((column) => column.visibleByDefault === false).map(
    (column) => column.key,
  ),
};
const EMPTY_BATCH_COLUMN_FILTERS = BATCH_GRID_COLUMNS.reduce((filters, column) => {
  filters[column.key] = '';
  return filters;
}, {} as BatchColumnFilters);
const DEFAULT_BATCH_GRID_SORT: BatchGridSort = {
  key: null,
  direction: 'ASC',
};
const EMPTY_BATCH_CREATED_AT_PERIOD: BatchDatePeriodFilter = {
  start: '',
  end: '',
};

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function normalizeBatchGridFilterValue(value: string | number | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function getBatchGridFilterValue(batch: BatchItem, columnKey: BatchGridColumnKey) {
  if (columnKey === 'batch') {
    return [
      batch.sourceBatchType,
      batch.sourceSystem,
      batch.sourceBatchId,
      getBankSlipSummaryStatusLabel(getBankSlipSummaryStatus(batch)),
    ].join(' ');
  }

  if (columnKey === 'target') {
    return [
      batch.metadata?.targetLabel,
      batch.sourceTenantId,
      batch.sourceBatchId,
      batch.metadata?.schoolYear?.year,
    ].join(' ');
  }

  if (columnKey === 'processedCount') {
    return [batch.processedCount, batch.duplicateCount, batch.errorCount].join(' ');
  }

  if (columnKey === 'totalAmount') {
    return `${getBatchTotalAmount(batch)} ${formatCurrency(getBatchTotalAmount(batch))}`;
  }

  if (columnKey === 'createdAt') {
    return [batch.createdAt, formatDateLabel(batch.createdAt)].join(' ');
  }

  const column = BATCH_GRID_COLUMNS.find((item) => item.key === columnKey);
  return column ? column.getValue(batch) : '';
}

function matchesBatchColumnFilters(batch: BatchItem, filters: BatchColumnFilters) {
  return BATCH_GRID_COLUMNS.every((column) => {
    const filter = normalizeBatchGridFilterValue(filters[column.key]);
    if (!filter) {
      return true;
    }

    return normalizeBatchGridFilterValue(getBatchGridFilterValue(batch, column.key)).includes(
      filter,
    );
  });
}

function compareBatchGridValues(leftValue: string, rightValue: string) {
  return normalizeBatchGridFilterValue(leftValue).localeCompare(
    normalizeBatchGridFilterValue(rightValue),
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

function matchesBatchCreatedAtPeriod(batch: BatchItem, period: BatchDatePeriodFilter) {
  const startTime = parseDateOnlyTime(period.start);
  const endTime = parseDateOnlyTime(period.end);

  if (startTime === null && endTime === null) {
    return true;
  }

  const batchTime = parseDateOnlyTime(batch.createdAt);
  if (batchTime === null) {
    return false;
  }

  if (startTime !== null && batchTime < startTime) {
    return false;
  }

  if (endTime !== null && batchTime > endTime) {
    return false;
  }

  return true;
}

function getBatchGridColumnAlign(columnKey: BatchGridColumnKey) {
  return columnKey === 'itemCount' ||
    columnKey === 'processedCount' ||
    columnKey === 'totalAmount' ||
    columnKey === 'createdAt'
    ? 'right'
    : 'left';
}

function getBatchGridStorageKey(tenantId: string | null | undefined) {
  return `${BATCH_GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getBatchExportStorageKey(tenantId: string | null | undefined) {
  return `${BATCH_EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function normalizeBatchGridConfig(
  config: Partial<BatchGridConfig> | string[] | null | undefined,
): BatchGridConfig {
  if (Array.isArray(config)) {
    const visibleKeys = config.filter((item): item is BatchGridColumnKey =>
      BATCH_GRID_COLUMNS.some((column) => column.key === item),
    );
    const missingKeys = BATCH_GRID_COLUMNS.map((column) => column.key).filter(
      (key) => !visibleKeys.includes(key),
    );

    return {
      order: [...visibleKeys, ...missingKeys],
      hidden: visibleKeys.length ? missingKeys : DEFAULT_BATCH_GRID_CONFIG.hidden,
    };
  }

  const allKeys = BATCH_GRID_COLUMNS.map((column) => column.key);
  const validOrder = (config?.order || []).filter((item): item is BatchGridColumnKey =>
    BATCH_GRID_COLUMNS.some((column) => column.key === item),
  );
  const validHidden = (config?.hidden || []).filter((item): item is BatchGridColumnKey =>
    BATCH_GRID_COLUMNS.some((column) => column.key === item),
  );
  const normalizedHidden =
    validHidden.length >= allKeys.length ? DEFAULT_BATCH_GRID_CONFIG.hidden : validHidden;

  return {
    order: [...validOrder, ...allKeys.filter((key) => !validOrder.includes(key))],
    hidden: Array.from(new Set(normalizedHidden)),
  };
}

function readStoredBatchGridConfig(tenantId: string | null | undefined) {
  if (typeof window === 'undefined') {
    return DEFAULT_BATCH_GRID_CONFIG;
  }

  try {
    const stored = window.localStorage.getItem(getBatchGridStorageKey(tenantId));
    return stored
      ? normalizeBatchGridConfig(JSON.parse(stored) as Partial<BatchGridConfig> | string[])
      : DEFAULT_BATCH_GRID_CONFIG;
  } catch {
    return DEFAULT_BATCH_GRID_CONFIG;
  }
}

function writeStoredBatchGridConfig(
  tenantId: string | null | undefined,
  config: BatchGridConfig,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    getBatchGridStorageKey(tenantId),
    JSON.stringify(normalizeBatchGridConfig(config)),
  );
}

function formatBatchColumnFiltersAudit(filters: BatchColumnFilters) {
  const activeFilters = BATCH_GRID_COLUMNS.map((column) => {
    const value = filters[column.key].trim().toUpperCase();
    return value ? `${column.label}: ${value}` : null;
  }).filter((item): item is string => Boolean(item));

  return activeFilters.length ? activeFilters.join(' | ') : 'NENHUM';
}

function formatBatchSortAudit(sort: BatchGridSort) {
  if (!sort.key) {
    return 'CRIACAO DESC';
  }

  const column = BATCH_GRID_COLUMNS.find((item) => item.key === sort.key);
  return `${column?.label || sort.key} ${sort.direction}`;
}

function formatBatchPeriodAudit(period: BatchDatePeriodFilter) {
  const startLabel = period.start ? formatDateLabel(period.start) : 'INICIO';
  const endLabel = period.end ? formatDateLabel(period.end) : 'FIM';

  return period.start || period.end ? `${startLabel} A ${endLabel}` : 'NENHUM';
}

type BatchAuditParams = {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  search: string;
  statusFilter: BankSlipSummaryStatus;
  columnFilters: BatchColumnFilters;
  createdAtPeriod: BatchDatePeriodFilter;
  sort: BatchGridSort;
  currentPage: number;
  pageSize: number;
  displayedRowsCount: number;
  totalInstallments: number;
};

function buildBatchAuditSql(params: BatchAuditParams) {
  const search = params.search.trim().toUpperCase();
  const statusLabel = getBankSlipSummaryStatusLabel(params.statusFilter);
  const columnFilters = formatBatchColumnFiltersAudit(params.columnFilters);
  const createdAtPeriod = formatBatchPeriodAudit(params.createdAtPeriod);
  const sortLabel = formatBatchSortAudit(params.sort);

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :search = ${toSqlLiteral(search)}
-- :statusVisualBoletos = ${toSqlLiteral(statusLabel)}
-- :filtrosColuna = ${toSqlLiteral(columnFilters)}
-- :periodoCriadoEm = ${toSqlLiteral(createdAtPeriod)}
-- :ordenacaoGrid = ${toSqlLiteral(sortLabel)}
-- :paginaAtual = ${toSqlLiteral(params.currentPage)}
-- :registrosPorPagina = ${toSqlLiteral(params.pageSize)}

SELECT DISTINCT RB.*
FROM receivable_batches RB
LEFT JOIN receivable_installments RI
  ON RI.batchId = RB.id
 AND RI.canceledAt IS NULL
WHERE RB.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND RB.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND (
    ${toSqlLiteral(search)} = ''
    OR UPPER(COALESCE(RB.companyName, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(RB.sourceBatchId, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(RB.sourceBatchType, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(RB.sourceTenantId, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
  )
ORDER BY RB.createdAt DESC;

-- STATUS VISUAL DOS BOLETOS:
-- considera RI.status = 'OPEN' e RI.openAmount > 0
-- filtro visual atual: ${statusLabel}
-- filtros de coluna aplicados no grid: ${columnFilters}
-- periodo criado em aplicado no grid: ${createdAtPeriod}
-- ordenacao visual atual: ${sortLabel}
-- AGUARDANDO PREPARAÇÃO, AGUARDANDO ENVIO, ENVIADO AO BANCO ou PARCIAL / COM ERRO`;
}

function buildBatchAuditText(params: BatchAuditParams) {
  const search = params.search.trim().toUpperCase();
  const statusLabel = getBankSlipSummaryStatusLabel(params.statusFilter);
  const columnFilters = formatBatchColumnFiltersAudit(params.columnFilters);
  const createdAtPeriod = formatBatchPeriodAudit(params.createdAtPeriod);
  const sortLabel = formatBatchSortAudit(params.sort);

  return `--- LOGICA DA TELA ---
Tela de grid/listagem dos lotes de recebiveis recebidos pelo Financeiro.

TABELAS PRINCIPAIS:
- receivable_batches (RB) - lotes de titulos/parcelas importados
- receivable_installments (RI) - parcelas usadas para resumir a situacao dos boletos

RELACIONAMENTOS:
- cada lote pertence ao sistema/tenant de origem
- RI.batchId = RB.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- busca digitada (:search): ${formatAuditValue(search)}
- status visual dos boletos: ${formatAuditValue(statusLabel)}
- filtros por coluna: ${formatAuditValue(columnFilters)}
- periodo criado em: ${formatAuditValue(createdAtPeriod)}
- lotes exibidos apos os filtros: ${params.displayedRowsCount}
- parcelas processadas nos lotes exibidos: ${params.totalInstallments}
- ordenacao atual: ${sortLabel}
- paginacao atual: pagina ${params.currentPage}, ${params.pageSize} registro(s) por pagina
- situacao visual dos boletos: calculada sobre parcelas abertas com valor em aberto

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- RB.sourceSystem e RB.sourceTenantId isolam os dados da empresa/sistema de origem
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

const bankSlipStatusOptions: Array<{ value: BankSlipSummaryStatus; label: string }> = [
  { value: 'ALL', label: 'TODOS STATUS' },
  { value: 'WAITING_PREPARATION', label: 'AGUARDANDO PREPARAÇÃO' },
  { value: 'READY_TO_SEND', label: 'AGUARDANDO ENVIO' },
  { value: 'SENT_TO_BANK', label: 'ENVIADO AO BANCO' },
  { value: 'PARTIAL_OR_ERROR', label: 'PARCIAL / COM ERRO' },
];

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

function BatchGridConfigModal({
  isOpen,
  title,
  description,
  columns,
  order,
  hidden,
  onSave,
  onClose,
}: BatchGridConfigModalProps) {
  const [draftOrder, setDraftOrder] = useState<BatchGridColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<BatchGridColumnKey[]>(hidden);
  const [draggedColumnKey, setDraggedColumnKey] = useState<BatchGridColumnKey | null>(null);

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

  const moveColumnToIndex = (columnKey: BatchGridColumnKey, targetIndex: number) => {
    const currentIndex = draftOrder.indexOf(columnKey);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    setDraftOrder((current) => moveArrayItem(current, currentIndex, targetIndex));
  };

  const toggleColumnVisibility = (columnKey: BatchGridColumnKey) => {
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
              Configuração da tela
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
                  Colunas visíveis: {visibleCount}
                </div>
                <div className="text-xs font-medium text-slate-500">
                  Reordene, oculte ou inclua colunas do grid nesta tela.
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraftOrder(DEFAULT_BATCH_GRID_CONFIG.order);
                    setDraftHidden(DEFAULT_BATCH_GRID_CONFIG.hidden);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Restaurar padrão
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSave(draftOrder, draftHidden);
                    onClose();
                  }}
                  className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  Salvar / Fechar Configuração
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
                        title={!isHidden ? 'Esta coluna está sendo usada no grid' : 'Esta coluna não está sendo usada no grid'}
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
                          {column.visibleByDefault === false ? 'Coluna extra' : 'Coluna padrão'}
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

function BatchGridFooter({
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
            title="Registros por página"
            aria-label="Registros por página"
            className="h-10 rounded-full border border-slate-300 bg-white px-3 text-sm font-black text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          >
            {BATCH_PAGE_SIZE_OPTIONS.map((option) => (
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
              title="Voltar para o início"
              aria-label="Voltar para o início"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &lt;&lt;
            </button>
            <button
              type="button"
              onClick={() => onPageChange(normalizedCurrentPage - 1)}
              disabled={normalizedCurrentPage <= 1}
              title="Voltar uma página"
              aria-label="Voltar uma página"
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
              title="Avançar uma página"
              aria-label="Avançar uma página"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &gt;
            </button>
            <button
              type="button"
              onClick={() => onPageChange(normalizedTotalPages)}
              disabled={normalizedCurrentPage >= normalizedTotalPages}
              title="Avançar para o final"
              aria-label="Avançar para o final"
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

export default function FinanceiroReceivableBatchesPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const isEmbedded = runtimeContext.embedded;
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BankSlipSummaryStatus>('ALL');
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [printingBatchId, setPrintingBatchId] = useState<string | null>(null);
  const [emissionBankSlipPdfs, setEmissionBankSlipPdfs] = useState<
    EmissionBankSlipPdfItem[]
  >([]);
  const [emissionBatchTitle, setEmissionBatchTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeBatchFilterColumn, setActiveBatchFilterColumn] =
    useState<BatchGridColumnKey | null>(null);
  const [batchColumnFilters, setBatchColumnFilters] = useState<BatchColumnFilters>({
    ...EMPTY_BATCH_COLUMN_FILTERS,
  });
  const [batchColumnFilterDrafts, setBatchColumnFilterDrafts] =
    useState<BatchColumnFilters>({ ...EMPTY_BATCH_COLUMN_FILTERS });
  const [createdAtPeriodFilter, setCreatedAtPeriodFilter] =
    useState<BatchDatePeriodFilter>({ ...EMPTY_BATCH_CREATED_AT_PERIOD });
  const [createdAtPeriodDraft, setCreatedAtPeriodDraft] =
    useState<BatchDatePeriodFilter>({ ...EMPTY_BATCH_CREATED_AT_PERIOD });
  const [batchGridSort, setBatchGridSort] = useState<BatchGridSort>({
    ...DEFAULT_BATCH_GRID_SORT,
  });
  const [batchPageSize, setBatchPageSize] = useState(10);
  const [batchPage, setBatchPage] = useState(1);
  const [selectedBatchGridRowId, setSelectedBatchGridRowId] = useState<string | null>(
    null,
  );
  const [columnOrder, setColumnOrder] = useState<BatchGridColumnKey[]>(
    DEFAULT_BATCH_GRID_CONFIG.order,
  );
  const [hiddenColumns, setHiddenColumns] = useState<BatchGridColumnKey[]>(
    DEFAULT_BATCH_GRID_CONFIG.hidden,
  );
  const [loadedGridConfigKey, setLoadedGridConfigKey] = useState<string | null>(null);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<
    Record<BatchExportColumnKey, boolean>
  >(buildDefaultExportColumns(BATCH_EXPORT_COLUMNS));

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

  useEffect(() => {
    const storageKey = getBatchGridStorageKey(runtimeContext.sourceTenantId);
    const storedConfig = readStoredBatchGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
    setLoadedGridConfigKey(storageKey);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (loadedGridConfigKey !== getBatchGridStorageKey(runtimeContext.sourceTenantId)) {
      return;
    }

    writeStoredBatchGridConfig(runtimeContext.sourceTenantId, {
      order: columnOrder,
      hidden: hiddenColumns,
    });
  }, [columnOrder, hiddenColumns, loadedGridConfigKey, runtimeContext.sourceTenantId]);

  const loadBatches = useCallback(
    async () => {
      try {
        setIsLoading(true);
        setError(null);

        setBatches(
          await getJson<BatchItem[]>(
            `/receivables/batches${buildFinanceApiQueryString(runtimeContext)}`,
          ),
        );
      } catch (currentError) {
        setBatches([]);
        setError(
          getFriendlyRequestErrorMessage(
            currentError,
            'Não foi possível carregar os lotes do Financeiro.',
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [runtimeContext],
  );

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  async function loadBankSlipPdfPayload(batch: BatchItem, installmentId: string) {
    return getJson<InstallmentBankSlipPdfPayload>(
      `/receivables/installments/${installmentId}/bank-slip-pdf${buildFinanceApiQueryString(runtimeContext, {
        sourceSystem: batch.sourceSystem,
        sourceTenantId: batch.sourceTenantId,
      })}`,
    );
  }

  async function handlePrintBatchBankSlips(batch: BatchItem) {
    if (!canPrintFullBatchBankSlips(batch)) {
      setError('Somente lotes 100% gravados no banco podem imprimir todos os boletos.');
      return;
    }

    try {
      setPrintingBatchId(batch.id);
      setError(null);

      const loadedInstallments = await getJson<InstallmentItem[]>(
        `/receivables/installments${buildFinanceApiQueryString(runtimeContext, {
          sourceSystem: batch.sourceSystem,
          sourceTenantId: batch.sourceTenantId,
          batchId: batch.id,
          status: 'ALL',
        })}`,
      );
      const emittableInstallments = loadedInstallments.filter((item) =>
        canEmitBankSlipPdf(item),
      );

      if (!emittableInstallments.length) {
        throw new Error('Nenhum PDF de boleto foi encontrado para este lote.');
      }

      const loadedPdfs: EmissionBankSlipPdfItem[] = [];

      for (const installment of emittableInstallments) {
        const payload = await loadBankSlipPdfPayload(batch, installment.id);
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

      setEmissionBatchTitle(
        `${batch.sourceBatchType || 'LOTE'} | ${batch.metadata?.targetLabel || batch.sourceBatchId}`,
      );
      setEmissionBankSlipPdfs(loadedPdfs);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar os boletos do lote para impressão.',
        ),
      );
    } finally {
      setPrintingBatchId(null);
    }
  }

  function handleCloseEmissionBankSlipPdfs() {
    setEmissionBankSlipPdfs([]);
    setEmissionBatchTitle('');
  }

  const activeBatchColumns = useMemo(
    () =>
      columnOrder
        .map((columnKey) => BATCH_GRID_COLUMNS.find((column) => column.key === columnKey))
        .filter(
          (column): column is BatchGridColumnDefinition => {
            if (!column) {
              return false;
            }

            return !hiddenColumns.includes(column.key);
          },
        ),
    [columnOrder, hiddenColumns],
  );

  const filteredBatches = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(search);

    return batches.filter((batch) => {
      const bankSlipStatus = getBankSlipSummaryStatus(batch) as BankSlipSummaryStatus;

      if (statusFilter !== 'ALL' && bankSlipStatus !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = normalizeSearchValue(
        [
          batch.companyName,
          batch.sourceBatchType,
          batch.sourceSystem,
          batch.sourceTenantId,
          batch.sourceBatchId,
          batch.metadata?.targetLabel,
          batch.metadata?.schoolYear?.year,
          getBankSlipSummaryStatusLabel(bankSlipStatus),
        ].join(' '),
      );

      return searchableText.includes(normalizedSearch);
    });
  }, [batches, search, statusFilter]);

  const displayedBatches = useMemo(() => {
    const columnFilteredBatches = filteredBatches.filter(
      (batch) =>
        matchesBatchColumnFilters(batch, batchColumnFilters) &&
        matchesBatchCreatedAtPeriod(batch, createdAtPeriodFilter),
    );

    if (!batchGridSort.key) {
      return columnFilteredBatches;
    }

    const directionMultiplier = batchGridSort.direction === 'DESC' ? -1 : 1;
    return [...columnFilteredBatches].sort(
      (left, right) =>
        compareBatchGridValues(
          getBatchGridFilterValue(left, batchGridSort.key as BatchGridColumnKey),
          getBatchGridFilterValue(right, batchGridSort.key as BatchGridColumnKey),
        ) * directionMultiplier,
    );
  }, [
    batchColumnFilters,
    batchGridSort.direction,
    batchGridSort.key,
    createdAtPeriodFilter,
    filteredBatches,
  ]);

  const batchTotalPages = Math.max(1, Math.ceil(displayedBatches.length / batchPageSize));
  const currentBatchPage = Math.min(batchPage, batchTotalPages);
  const paginatedBatches = useMemo(
    () =>
      displayedBatches.slice(
        (currentBatchPage - 1) * batchPageSize,
        currentBatchPage * batchPageSize,
      ),
    [batchPageSize, currentBatchPage, displayedBatches],
  );

  const totalInstallments = useMemo(
    () =>
      displayedBatches.reduce(
        (accumulator, current) => accumulator + current.processedCount,
        0,
      ),
    [displayedBatches],
  );
  const totalAmount = useMemo(
    () =>
      displayedBatches.reduce(
        (accumulator, current) => accumulator + getBatchTotalAmount(current),
        0,
      ),
    [displayedBatches],
  );

  useEffect(() => {
    setBatchPage(1);
  }, [
    batchColumnFilters,
    batchGridSort.direction,
    batchGridSort.key,
    batchPageSize,
    createdAtPeriodFilter,
    search,
    statusFilter,
  ]);

  const batchAuditContext = useMemo(() => {
    const auditParams: BatchAuditParams = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      search,
      statusFilter,
      columnFilters: batchColumnFilters,
      createdAtPeriod: createdAtPeriodFilter,
      sort: batchGridSort,
      currentPage: currentBatchPage,
      pageSize: batchPageSize,
      displayedRowsCount: displayedBatches.length,
      totalInstallments,
    };

    return {
      auditText: buildBatchAuditText(auditParams),
      sqlText: buildBatchAuditSql(auditParams),
    };
  }, [
    batchColumnFilters,
    batchGridSort,
    batchPageSize,
    createdAtPeriodFilter,
    currentBatchPage,
    displayedBatches.length,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    search,
    statusFilter,
    totalInstallments,
  ]);

  const pageClassName = isEmbedded
    ? 'flex h-[calc(100vh-2rem)] min-h-0 flex-col'
    : 'space-y-6';
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
    runtimeContext.companyName || displayedBatches[0]?.companyName || 'EMPRESA ATUAL';

  function setBatchPageClamped(nextPage: number) {
    setBatchPage(Math.min(Math.max(1, nextPage), batchTotalPages));
  }

  function openBatchColumnFilter(columnKey: BatchGridColumnKey) {
    if (columnKey === 'itemCount') {
      return;
    }

    if (columnKey === 'createdAt') {
      setCreatedAtPeriodDraft(createdAtPeriodFilter);
      setActiveBatchFilterColumn((current) => (current === columnKey ? null : columnKey));
      return;
    }

    setBatchColumnFilterDrafts((current) => ({
      ...current,
      [columnKey]: batchColumnFilters[columnKey],
    }));
    setActiveBatchFilterColumn((current) => (current === columnKey ? null : columnKey));
  }

  function applyBatchColumnFilter(columnKey: BatchGridColumnKey) {
    if (columnKey === 'createdAt') {
      setCreatedAtPeriodFilter(createdAtPeriodDraft);
      setActiveBatchFilterColumn(null);
      return;
    }

    setBatchColumnFilters((current) => ({
      ...current,
      [columnKey]: batchColumnFilterDrafts[columnKey],
    }));
    setActiveBatchFilterColumn(null);
  }

  function clearBatchColumnFilter(columnKey: BatchGridColumnKey) {
    if (columnKey === 'createdAt') {
      setCreatedAtPeriodFilter({ ...EMPTY_BATCH_CREATED_AT_PERIOD });
      setCreatedAtPeriodDraft({ ...EMPTY_BATCH_CREATED_AT_PERIOD });
      setActiveBatchFilterColumn(null);
      return;
    }

    setBatchColumnFilters((current) => ({
      ...current,
      [columnKey]: '',
    }));
    setBatchColumnFilterDrafts((current) => ({
      ...current,
      [columnKey]: '',
    }));
    setActiveBatchFilterColumn(null);
  }

  function clearAllBatchColumnControls() {
    setBatchColumnFilters({ ...EMPTY_BATCH_COLUMN_FILTERS });
    setBatchColumnFilterDrafts({ ...EMPTY_BATCH_COLUMN_FILTERS });
    setCreatedAtPeriodFilter({ ...EMPTY_BATCH_CREATED_AT_PERIOD });
    setCreatedAtPeriodDraft({ ...EMPTY_BATCH_CREATED_AT_PERIOD });
    setBatchGridSort({ ...DEFAULT_BATCH_GRID_SORT });
    setActiveBatchFilterColumn(null);
  }

  function renderBatchClearAllButton() {
    const hasActiveControls =
      Object.values(batchColumnFilters).some((value) => value.trim()) ||
      Boolean(createdAtPeriodFilter.start || createdAtPeriodFilter.end) ||
      Boolean(batchGridSort.key);

    return (
      <button
        type="button"
        onClick={clearAllBatchColumnControls}
        disabled={!hasActiveControls}
        title="Limpar filtros e ordenação"
        aria-label="Limpar filtros e ordenação"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
          hasActiveControls
            ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm hover:bg-blue-100'
            : 'border-slate-200 bg-white text-slate-300'
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    );
  }

  function renderBatchCreatedAtPeriodHeader(column: BatchGridColumnDefinition) {
    const isOpen = activeBatchFilterColumn === column.key;
    const isActive =
      Boolean(createdAtPeriodFilter.start || createdAtPeriodFilter.end) ||
      batchGridSort.key === column.key;

    return (
      <div className="relative inline-flex items-center gap-1.5">
        <span>{column.label}</span>
        <button
          type="button"
          onClick={() => openBatchColumnFilter(column.key)}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
            isActive
              ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
          }`}
          title="Filtrar período de criação"
          aria-label="Filtrar período de criação"
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
                      setBatchGridSort({ key: column.key, direction });
                      setActiveBatchFilterColumn(null);
                    }}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                      batchGridSort.key === column.key && batchGridSort.direction === direction
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
                Período
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
                    Até
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
                onClick={() => applyBatchColumnFilter(column.key)}
                className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100"
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={() => clearBatchColumnFilter(column.key)}
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

  function renderBatchColumnHeader(column: BatchGridColumnDefinition) {
    if (column.key === 'itemCount') {
      return <span>{column.label}</span>;
    }

    if (column.key === 'createdAt') {
      return renderBatchCreatedAtPeriodHeader(column);
    }

    const isActive =
      Boolean(batchColumnFilters[column.key].trim()) || batchGridSort.key === column.key;

    return (
      <GridColumnFilterHeader
        label={column.label}
        isOpen={activeBatchFilterColumn === column.key}
        isActive={isActive}
        filterValue={batchColumnFilterDrafts[column.key]}
        placeholder={`DIGITE ${column.label.toUpperCase()}`}
        align={getBatchGridColumnAlign(column.key)}
        sortDirection={batchGridSort.key === column.key ? batchGridSort.direction : null}
        onToggle={() => openBatchColumnFilter(column.key)}
        onSort={(direction) => {
          setBatchGridSort({ key: column.key, direction });
          setActiveBatchFilterColumn(null);
        }}
        onFilterValueChange={(value) =>
          setBatchColumnFilterDrafts((current) => ({
            ...current,
            [column.key]: value,
          }))
        }
        onApply={() => applyBatchColumnFilter(column.key)}
        onClear={() => clearBatchColumnFilter(column.key)}
      />
    );
  }

  function renderBatchSummaryCell(column: BatchGridColumnDefinition) {
    const showTotalAmount = column.key === 'totalAmount';

    if (!showTotalAmount) {
      return null;
    }

    return (
      <div className="flex justify-end">
        <span className="font-black text-slate-900">{formatCurrency(totalAmount)}</span>
      </div>
    );
  }

  function renderBatchCell(item: BatchItem, column: BatchGridColumnDefinition) {
    if (column.key === 'batch') {
      const bankSlipStatus = getBankSlipSummaryStatus(item);

      return (
        <div>
          <div className="font-black text-slate-900">
            {item.sourceBatchType || 'LOTE'} | {item.sourceSystem || '---'}
          </div>
          <div className="mt-1">
            <span className={`${statusPillClassName} ${getBankSlipSummaryStatusTone(bankSlipStatus)}`}>
              {getBankSlipSummaryStatusLabel(bankSlipStatus)}
            </span>
          </div>
          <div className={secondaryMetaClassName}>BOLETOS</div>
        </div>
      );
    }

    if (column.key === 'target') {
      return (
        <div>
          <div className="font-semibold text-slate-700">
            {item.metadata?.targetLabel || item.sourceTenantId}
          </div>
          <div className={secondaryMetaClassName}>
            {item.metadata?.schoolYear?.year
              ? `ANO LETIVO ${item.metadata.schoolYear.year}`
              : item.sourceBatchId}
          </div>
        </div>
      );
    }

    if (column.key === 'processedCount') {
      return (
        <div>
          <div className="font-semibold text-slate-700">{item.processedCount}</div>
          {(item.duplicateCount > 0 || item.errorCount > 0) && (
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-500">
              {item.duplicateCount > 0 ? `${item.duplicateCount} DUPLIC.` : ''}
              {item.duplicateCount > 0 && item.errorCount > 0 ? ' | ' : ''}
              {item.errorCount > 0 ? `${item.errorCount} ERRO(S)` : ''}
            </div>
          )}
        </div>
      );
    }

    if (column.key === 'totalAmount') {
      return <span className="font-black text-slate-900">{formatCurrency(getBatchTotalAmount(item))}</span>;
    }

    if (column.key === 'createdAt') {
      return <span className="font-semibold text-slate-700">{formatDateLabel(item.createdAt)}</span>;
    }

    return <span className="font-semibold text-slate-700">{column.getValue(item)}</span>;
  }

  return (
    <div className={pageClassName}>
      {!isEmbedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                Contas a receber
              </div>
              <h1 className="mt-1 text-2xl font-black tracking-tight">Lotes recebidos</h1>
              <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                Cada lote representa um agrupamento de títulos e parcelas importados para o core financeiro.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <ScreenNameCopy
              screenId={SCREEN_ID}
              className="justify-end"
              auditText={batchAuditContext.auditText}
              sqlText={batchAuditContext.sqlText}
            />
          </div>
        </section>
      ) : null}

      {error ? (
        <section
          className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}
        >
          {error}
        </section>
      ) : null}

      <section className={gridSectionClassName}>
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="BUSCAR LOTE..."
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
              onChange={(event) => setStatusFilter(event.target.value as BankSlipSummaryStatus)}
              title="Status dos boletos"
              aria-label="Status dos boletos"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-[0.08em] text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 sm:w-64"
            >
              {bankSlipStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="ml-auto text-xs font-black uppercase tracking-[0.14em] text-slate-600">
              {isLoading ? 'Carregando...' : `${displayedBatches.length} lote(s) encontrado(s)`}
            </div>
          </div>
        </div>

        <div
          className={`min-h-0 overflow-auto ${
            isEmbedded ? 'max-h-[calc(100vh-12rem)]' : 'max-h-[calc(100vh-24rem)]'
          }`}
        >
          <table className="w-full min-w-[1040px] border-collapse text-left text-sm text-slate-600">
            <colgroup>
              <col className="w-12" />
              {activeBatchColumns.map((column) => (
                <col key={column.key} />
              ))}
              <col className="w-32" />
            </colgroup>
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider text-slate-600">
                <th className="sticky top-0 z-20 w-12 bg-slate-50 px-3 py-3 text-left">
                  {renderBatchClearAllButton()}
                </th>
                {activeBatchColumns.map((column) => (
                  <th
                    key={column.key}
                    className={`sticky top-0 z-20 bg-slate-50 px-4 py-3 ${
                      getBatchGridColumnAlign(column.key) === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {renderBatchColumnHeader(column)}
                  </th>
                ))}
                <th className="sticky top-0 z-20 w-32 bg-slate-50 px-4 py-3 text-right">
                  Ações
                </th>
              </tr>
              {activeBatchFilterColumn ? (
                <tr aria-hidden="true">
                  <th colSpan={activeBatchColumns.length + 2} className="h-56 bg-white p-0" />
                </tr>
              ) : null}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={activeBatchColumns.length + 2}
                    className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Carregando lotes...
                  </td>
                </tr>
              ) : null}

              {!isLoading && paginatedBatches.map((item, batchIndex) => {
                const canPrintBatchBankSlips = canPrintFullBatchBankSlips(item);
                const isSelected = selectedBatchGridRowId === item.id;
                const zebraClass = batchIndex % 2 ? 'bg-slate-100/70' : 'bg-white';

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedBatchGridRowId(item.id)}
                    aria-selected={isSelected}
                    className={`cursor-pointer border-t border-slate-100 transition hover:bg-blue-50 ${
                      isSelected ? 'bg-blue-100 ring-2 ring-inset ring-blue-300' : zebraClass
                    }`}
                  >
                    <td className="px-3 py-4" />
                    {activeBatchColumns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-4 ${
                          getBatchGridColumnAlign(column.key) === 'right'
                            ? 'text-right'
                            : 'text-left'
                        }`}
                      >
                        {renderBatchCell(item, column)}
                      </td>
                    ))}
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/recebiveis/lotes/${item.id}${preservedQueryString}`}
                          title="Ver parcelas"
                          aria-label="Ver parcelas"
                          onClick={(event) => event.stopPropagation()}
                          className={`${gridActionButtonClass} ${gridActionToneClass.blue}`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
                          </svg>
                        </Link>

                        {canPrintBatchBankSlips ? (
                          <button
                            type="button"
                            title="Imprimir boletos"
                            aria-label="Imprimir boletos"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handlePrintBatchBankSlips(item);
                            }}
                            disabled={printingBatchId === item.id}
                            className={`${gridActionButtonClass} ${gridActionToneClass.sky}`}
                          >
                            <PrintIcon />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!isLoading && !displayedBatches.length ? (
                <tr>
                  <td
                    colSpan={activeBatchColumns.length + 2}
                    className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Nenhum lote financeiro foi encontrado para o filtro informado.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="text-sm">
                <td
                  colSpan={activeBatchColumns.length ? 2 : 1}
                  className="sticky bottom-0 z-20 border-t border-slate-300 bg-slate-100 px-4 py-3 text-left"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-black uppercase tracking-[0.12em] text-slate-700">
                      Total registros: {displayedBatches.length}
                    </span>
                    {activeBatchColumns[0]?.key === 'totalAmount' ? (
                      <span className="font-black text-slate-900">{formatCurrency(totalAmount)}</span>
                    ) : null}
                  </div>
                </td>
                {activeBatchColumns.slice(1).map((column) => (
                  <td
                    key={column.key}
                    className={`sticky bottom-0 z-20 border-t border-slate-300 bg-slate-100 px-4 py-3 ${
                      getBatchGridColumnAlign(column.key) === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {renderBatchSummaryCell(column)}
                  </td>
                ))}
                <td className="sticky bottom-0 z-20 border-t border-slate-300 bg-slate-100 px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>

        <BatchGridFooter
          pageSize={batchPageSize}
          currentPage={currentBatchPage}
          totalPages={batchTotalPages}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onPageSizeChange={setBatchPageSize}
          onPageChange={setBatchPageClamped}
        />
      </section>

      <BatchGridConfigModal
        isOpen={isColumnConfigOpen}
        title="Configurar colunas do grid"
        description="Reordene, oculte ou inclua colunas dos lotes recebidos nesta tela."
        columns={BATCH_GRID_COLUMNS}
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
        title="Exportar lotes"
        description={`A exportação respeita a busca atual e inclui ${displayedBatches.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={BATCH_EXPORT_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={getBatchExportStorageKey(runtimeContext.sourceTenantId)}
        brandingName={companyDisplayName}
        brandingLogoUrl={runtimeContext.logoUrl}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          try {
            await exportGridRows({
              rows: displayedBatches,
              columns: (config.orderedColumns || []).length
                ? config.orderedColumns
                    .map((key) =>
                      BATCH_EXPORT_COLUMNS.find((column) => column.key === key),
                    )
                    .filter(
                      (
                        column,
                      ): column is GridColumnDefinition<BatchItem, BatchExportColumnKey> =>
                        Boolean(column),
                    )
                : BATCH_EXPORT_COLUMNS,
              selectedColumns: config.selectedColumns,
              format: exportFormat,
              pdfOptions: config.pdfOptions,
              fileBaseName: 'lotes-recebiveis',
              branding: {
                title: 'Lotes recebidos',
                subtitle: 'Exportação com os filtros atualmente aplicados.',
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
                : 'Não foi possível exportar os lotes.',
            );
          }
        }}
      />

      {emissionBankSlipPdfs.length ? (
        <style>
          {`
            @media print {
              body * {
                visibility: hidden !important;
              }

              .batch-bank-slip-print-area,
              .batch-bank-slip-print-area * {
                visibility: visible !important;
              }

              .batch-bank-slip-print-area {
                position: fixed !important;
                inset: 0 !important;
                z-index: 99999 !important;
                overflow: visible !important;
                background: #ffffff !important;
              }

              .batch-bank-slip-print-header {
                display: none !important;
              }

              .batch-bank-slip-print-card {
                margin: 0 !important;
                border: 0 !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                break-after: page;
                page-break-after: always;
              }

              .batch-bank-slip-print-card:last-child {
                break-after: auto;
                page-break-after: auto;
              }

              .batch-bank-slip-pdf-object,
              .batch-bank-slip-pdf-object iframe {
                height: 100vh !important;
              }
            }
          `}
        </style>
      ) : null}

      <AuditedPopupShell
        isOpen={emissionBankSlipPdfs.length > 0}
        screenId={EMIT_BATCH_BANK_SLIPS_POPUP_SCREEN_ID}
        title="Imprimir boletos do lote"
        eyebrow="Boletos gravados"
        description="Confira os boletos do lote e use a impressão quando estiver tudo certo."
        brandingName={runtimeContext.companyName || 'Financeiro'}
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
        <div className="batch-bank-slip-print-area space-y-4">
          <div className="batch-bank-slip-print-header rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Lote selecionado
            </div>
            <div className="mt-1 text-sm font-black uppercase text-slate-900">
              {emissionBatchTitle || 'LOTE FINANCEIRO'}
            </div>
            <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              {emissionBankSlipPdfs.length} boleto(s)
            </div>
          </div>

          {emissionBankSlipPdfs.map((item, index) => (
            <section
              key={item.installmentId}
              className="batch-bank-slip-print-card overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="batch-bank-slip-print-header flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                className="batch-bank-slip-pdf-object block h-[68vh] w-full border-0"
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
    </div>
  );
}
