'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import { formatCurrency, formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildDefaultExportColumns,
  exportGridRows,
  type GridColumnDefinition,
  type GridExportFormat,
} from '@/app/lib/grid-export-utils';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import { buildFinanceApiQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type InstallmentItem = {
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
  settlementMethod?: string | null;
  settledAt?: string | null;
  isOverdue: boolean;
};

type Filters = {
  status: 'OPEN' | 'PAID' | 'OVERDUE' | 'ALL';
  studentName: string;
  payerName: string;
};

type InstallmentGridColumnKey =
  | 'sourceEntityName'
  | 'payerNameSnapshot'
  | 'description'
  | 'classLabel'
  | 'dueDate'
  | 'amount'
  | 'status';

type InstallmentGridConfig = {
  order: InstallmentGridColumnKey[];
  hidden: InstallmentGridColumnKey[];
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_PARCELAS_LISTAGEM';
const cardClass = FINANCE_GRID_PAGE_LAYOUT.card;
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

const DEFAULT_FILTERS: Filters = {
  status: 'OPEN',
  studentName: '',
  payerName: '',
};

const INSTALLMENT_GRID_COLUMNS: GridColumnDefinition<InstallmentItem, InstallmentGridColumnKey>[] = [
  { key: 'sourceEntityName', label: 'Referente', getValue: (item) => item.sourceEntityName || '---' },
  { key: 'payerNameSnapshot', label: 'Pagador', getValue: (item) => item.payerNameSnapshot || '---' },
  { key: 'description', label: 'Descrição', getValue: (item) => item.description || '---' },
  { key: 'classLabel', label: 'Turma', getValue: (item) => item.classLabel || '---' },
  { key: 'dueDate', label: 'Vencimento', getValue: (item) => formatDateLabel(item.dueDate) },
  { key: 'amount', label: 'Valor', getValue: (item) => formatCurrency(getCurrentInstallmentValue(item)) },
  { key: 'status', label: 'Situação', getValue: (item) => getInstallmentStatusMeta(item).label },
];

const DEFAULT_INSTALLMENT_GRID_CONFIG: InstallmentGridConfig = {
  order: INSTALLMENT_GRID_COLUMNS.map((column) => column.key),
  hidden: [],
};

const INSTALLMENT_GRID_STORAGE_PREFIX = 'financeiro:parcelas:grid-columns:';
const INSTALLMENT_EXPORT_STORAGE_PREFIX = 'financeiro:parcelas:export-config:';

function getCurrentInstallmentValue(item: InstallmentItem) {
  return item.status === 'PAID' ? item.paidAmount : item.openAmount;
}

function getInstallmentStatusMeta(item: InstallmentItem) {
  if (item.status === 'PAID') {
    return {
      label: 'FECHADA',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (item.isOverdue) {
    return {
      label: 'VENCIDA',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  return {
    label: 'ABERTA',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  };
}

function getInstallmentGridStorageKey(tenantId: string | null) {
  return `${INSTALLMENT_GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getInstallmentExportStorageKey(tenantId: string | null) {
  return `${INSTALLMENT_EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function normalizeInstallmentGridConfig(
  config: Partial<InstallmentGridConfig> | null | undefined,
): InstallmentGridConfig {
  const validOrder = (config?.order || []).filter((item): item is InstallmentGridColumnKey =>
    INSTALLMENT_GRID_COLUMNS.some((column) => column.key === item),
  );
  const allKeys = INSTALLMENT_GRID_COLUMNS.map((column) => column.key);
  const normalizedOrder = [...validOrder, ...allKeys.filter((key) => !validOrder.includes(key))];
  const validHidden = (config?.hidden || []).filter((item): item is InstallmentGridColumnKey =>
    INSTALLMENT_GRID_COLUMNS.some((column) => column.key === item),
  );

  return {
    order: normalizedOrder,
    hidden: Array.from(new Set(validHidden)),
  };
}

function readStoredInstallmentGridConfig(tenantId: string | null) {
  if (typeof window === 'undefined') {
    return DEFAULT_INSTALLMENT_GRID_CONFIG;
  }

  try {
    const rawValue = window.localStorage.getItem(getInstallmentGridStorageKey(tenantId));
    if (!rawValue) {
      return DEFAULT_INSTALLMENT_GRID_CONFIG;
    }

    const parsed = JSON.parse(rawValue) as Partial<InstallmentGridConfig>;
    return normalizeInstallmentGridConfig(parsed);
  } catch {
    return DEFAULT_INSTALLMENT_GRID_CONFIG;
  }
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  if (item === undefined) {
    return items;
  }

  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function getVisibleInstallmentColumns(order: InstallmentGridColumnKey[], hidden: InstallmentGridColumnKey[]) {
  const hiddenSet = new Set(hidden);
  return order
    .filter((key) => !hiddenSet.has(key))
    .map((key) => INSTALLMENT_GRID_COLUMNS.find((column) => column.key === key))
    .filter(
      (column): column is GridColumnDefinition<InstallmentItem, InstallmentGridColumnKey> =>
        Boolean(column),
    );
}

function getFilterPillClass(active: boolean, tone: 'blue' | 'emerald' | 'amber' | 'rose') {
  const tones = {
    blue: active
      ? 'border-blue-300 bg-blue-100 text-blue-800'
      : 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: active
      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: active
      ? 'border-amber-300 bg-amber-100 text-amber-800'
      : 'border-amber-200 bg-amber-50 text-amber-700',
    rose: active
      ? 'border-rose-300 bg-rose-100 text-rose-800'
      : 'border-rose-200 bg-rose-50 text-rose-700',
  };

  return `inline-flex rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition hover:brightness-95 ${tones[tone]}`;
}

function InstallmentGridConfigModal({
  isOpen,
  title,
  description,
  columns,
  order,
  hidden,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  description: string;
  columns: GridColumnDefinition<InstallmentItem, InstallmentGridColumnKey>[];
  order: InstallmentGridColumnKey[];
  hidden: InstallmentGridColumnKey[];
  onSave: (order: InstallmentGridColumnKey[], hidden: InstallmentGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftOrder, setDraftOrder] = useState<InstallmentGridColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<InstallmentGridColumnKey[]>(hidden);
  const [draggedColumnKey, setDraggedColumnKey] = useState<InstallmentGridColumnKey | null>(null);
  const [activeColumnKey, setActiveColumnKey] = useState<InstallmentGridColumnKey | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraggedColumnKey(null);
      setActiveColumnKey(null);
      return;
    }

    setDraftOrder(order);
    setDraftHidden(hidden);
  }, [hidden, isOpen, order]);

  if (!isOpen) {
    return null;
  }

  const visibleCount = draftOrder.filter((columnKey) => !draftHidden.includes(columnKey)).length;

  const moveColumnToIndex = (columnKey: InstallmentGridColumnKey, targetIndex: number) => {
    const currentIndex = draftOrder.indexOf(columnKey);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    setDraftOrder((current) => moveArrayItem(current, currentIndex, targetIndex));
    setActiveColumnKey(columnKey);
  };

  const toggleColumnVisibility = (columnKey: InstallmentGridColumnKey) => {
    setDraftHidden((current) =>
      current.includes(columnKey)
        ? current.filter((item) => item !== columnKey)
        : [...current, columnKey],
    );
    setActiveColumnKey(columnKey);
  };

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <div className={FINANCE_GRID_PAGE_LAYOUT.modalPanel}>
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
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
            ✕
          </button>
        </div>

        <div className={FINANCE_GRID_PAGE_LAYOUT.modalBody}>
          <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
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
                    setDraftOrder(DEFAULT_INSTALLMENT_GRID_CONFIG.order);
                    setDraftHidden(DEFAULT_INSTALLMENT_GRID_CONFIG.hidden);
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
                const isActive = activeColumnKey === columnKey || isDragging;

                return (
                  <div
                    key={column.key}
                    draggable
                    onClick={() => setActiveColumnKey(column.key)}
                    onDragStart={() => {
                      setActiveColumnKey(column.key);
                      setDraggedColumnKey(column.key);
                    }}
                    onDragEnd={() => setDraggedColumnKey(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedColumnKey) {
                        return;
                      }

                      moveColumnToIndex(draggedColumnKey, index);
                      setDraggedColumnKey(null);
                    }}
                    className={FINANCE_GRID_PAGE_LAYOUT.modalListItem + ` ${
                      isActive
                        ? FINANCE_GRID_PAGE_LAYOUT.modalActiveItem
                        : FINANCE_GRID_PAGE_LAYOUT.modalInactiveItem
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
                        title={
                          !isHidden
                            ? 'Esta coluna esta sendo usada no grid'
                            : 'Esta coluna nao esta sendo usada no grid'
                        }
                        className={
                          !isHidden
                            ? FINANCE_GRID_PAGE_LAYOUT.modalToggleOn
                            : FINANCE_GRID_PAGE_LAYOUT.modalToggleOff
                        }
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
                        <div className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">
                          {column.label}
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-500">
                          {isHidden ? 'Oculta no grid atual.' : 'Visível no grid atual.'}
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
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        title="Mover para cima"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveColumnToIndex(column.key, Math.min(index + 1, draftOrder.length - 1));
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        title="Mover para baixo"
                      >
                        ↓
                      </button>
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                        Arraste
                      </div>
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

export default function FinanceiroInstallmentsPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [installments, setInstallments] = useState<InstallmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<InstallmentGridColumnKey[]>(
    DEFAULT_INSTALLMENT_GRID_CONFIG.order,
  );
  const [hiddenColumns, setHiddenColumns] = useState<InstallmentGridColumnKey[]>(
    DEFAULT_INSTALLMENT_GRID_CONFIG.hidden,
  );
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<InstallmentGridColumnKey, boolean>>(
    buildDefaultExportColumns(INSTALLMENT_GRID_COLUMNS),
  );

  const visibleColumns = useMemo(
    () => getVisibleInstallmentColumns(columnOrder, hiddenColumns),
    [columnOrder, hiddenColumns],
  );

  const loadInstallments = useCallback(async (nextFilters: Filters) => {
    try {
      setIsLoading(true);
      setError(null);

      setInstallments(
        await getJson<InstallmentItem[]>(
          `/receivables/installments${buildFinanceApiQueryString(runtimeContext, {
            status: nextFilters.status,
            studentName: nextFilters.studentName.trim()
              ? nextFilters.studentName.trim().toUpperCase()
              : undefined,
            payerName: nextFilters.payerName.trim()
              ? nextFilters.payerName.trim().toUpperCase()
              : undefined,
          })}`,
        ),
      );
    } catch (currentError) {
      setInstallments([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar as parcelas do Financeiro.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadInstallments(DEFAULT_FILTERS);
  }, [loadInstallments]);

  useEffect(() => {
    const storedConfig = readStoredInstallmentGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      getInstallmentGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({
        order: columnOrder,
        hidden: hiddenColumns,
      }),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters = {
      ...appliedFilters,
      studentName: draftFilters.studentName,
      payerName: draftFilters.payerName,
    };
    setAppliedFilters(nextFilters);
    void loadInstallments(nextFilters);
  }

  function applyStatusFilter(status: Filters['status']) {
    const nextFilters = {
      ...appliedFilters,
      status,
    };
    setAppliedFilters(nextFilters);
    void loadInstallments(nextFilters);
  }

  const openCountLabel = useMemo(
    () => installments.filter((item) => item.status !== 'PAID' && !item.isOverdue).length,
    [installments],
  );
  const overdueCountLabel = useMemo(
    () => installments.filter((item) => item.status !== 'PAID' && item.isOverdue).length,
    [installments],
  );
  const paidCountLabel = useMemo(
    () => installments.filter((item) => item.status === 'PAID').length,
    [installments],
  );

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
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

      <section className={`${cardClass} p-6`}>
        <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1.3fr_1.3fr_auto_auto]">
          <input
            value={draftFilters.studentName}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, studentName: event.target.value }))
            }
            className={inputClass}
            placeholder="NOME DO REFERENTE"
          />
          <input
            value={draftFilters.payerName}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, payerName: event.target.value }))
            }
            className={inputClass}
            placeholder="NOME DO PAGADOR"
          />
          <button type="submit" className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftFilters(DEFAULT_FILTERS);
              setAppliedFilters(DEFAULT_FILTERS);
              void loadInstallments(DEFAULT_FILTERS);
            }}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
          >
            Limpar
          </button>
        </form>
      </section>

      {error ? (
        <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            Parcelas encontradas
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {isLoading ? 'Carregando...' : `${installments.length} parcela(s) encontrada(s)`}
          </h2>
        </div>

        <div
          className={`overflow-auto ${
            runtimeContext.embedded
              ? 'max-h-[calc(100vh-24rem)]'
              : 'max-h-[calc(100vh-30rem)]'
          }`}
        >
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                {visibleColumns.map((column) => (
                  <th key={column.key} className="px-4 py-3">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {installments.map((item) => {
                const currentValue = getCurrentInstallmentValue(item);
                const statusMeta = getInstallmentStatusMeta(item);

                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    {visibleColumns.map((column) => (
                      <td key={column.key} className="px-4 py-4">
                        {column.key === 'sourceEntityName' ? (
                          <div>
                            <div className="font-black text-slate-900">{item.sourceEntityName}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              PARCELA {item.installmentNumber}/{item.installmentCount}
                            </div>
                          </div>
                        ) : column.key === 'payerNameSnapshot' ? (
                          <div className="font-semibold text-slate-700">{item.payerNameSnapshot}</div>
                        ) : column.key === 'description' ? (
                          <div>
                            <div className="font-semibold text-slate-700">{item.description}</div>
                            {item.settledAt ? (
                              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                BAIXADA EM {formatDateLabel(item.settledAt)}
                                {item.settlementMethod ? ` - ${item.settlementMethod}` : ''}
                              </div>
                            ) : null}
                          </div>
                        ) : column.key === 'classLabel' ? (
                          <div className="font-semibold text-slate-700">{item.classLabel || '---'}</div>
                        ) : column.key === 'dueDate' ? (
                          <div className="font-semibold text-slate-700">{formatDateLabel(item.dueDate)}</div>
                        ) : column.key === 'amount' ? (
                          <div className="font-black text-slate-900">{formatCurrency(currentValue)}</div>
                        ) : column.key === 'status' ? (
                          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        ) : (
                          column.getValue(item)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {!isLoading && !installments.length ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length || 1}
                    className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Nenhuma parcela foi localizada para o filtro informado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${cardClass} border-slate-100 bg-slate-50 px-6 py-4`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              title="COLUNAS"
              aria-label="COLUNAS"
              onClick={() => setIsColumnConfigOpen(true)}
              className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}
            >
              ☰ Colunas
            </button>
            <button
              type="button"
              title="IMPRIMIR"
              aria-label="IMPRIMIR"
              onClick={() => setIsExportModalOpen(true)}
              className={FINANCE_GRID_PAGE_LAYOUT.footerIconButton}
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
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => applyStatusFilter('ALL')}
              className={getFilterPillClass(appliedFilters.status === 'ALL', 'blue')}
            >
              Todas ({installments.length})
            </button>
            <button
              type="button"
              onClick={() => applyStatusFilter('OPEN')}
              className={getFilterPillClass(appliedFilters.status === 'OPEN', 'emerald')}
            >
              Abertas ({openCountLabel})
            </button>
            <button
              type="button"
              onClick={() => applyStatusFilter('OVERDUE')}
              className={getFilterPillClass(appliedFilters.status === 'OVERDUE', 'amber')}
            >
              Vencidas ({overdueCountLabel})
            </button>
            <button
              type="button"
              onClick={() => applyStatusFilter('PAID')}
              className={getFilterPillClass(appliedFilters.status === 'PAID', 'rose')}
            >
              Fechadas ({paidCountLabel})
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
              Registros exibidos ({installments.length})
            </div>
            {!runtimeContext.embedded ? (
              <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
            ) : null}
          </div>
        </div>
      </section>

      <InstallmentGridConfigModal
        isOpen={isColumnConfigOpen}
        title="Configurar colunas do grid"
        description="Reordene, oculte ou inclua colunas do grid nesta tela."
        columns={INSTALLMENT_GRID_COLUMNS}
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
        title="Exportar parcelas"
        description={`A exportação respeita os filtros atuais e inclui ${installments.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={INSTALLMENT_GRID_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={getInstallmentExportStorageKey(runtimeContext.sourceTenantId)}
        brandingName={runtimeContext.companyName || 'FINANCEIRO'}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: installments,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) => INSTALLMENT_GRID_COLUMNS.find((column) => column.key === key))
                  .filter(
                    (
                      column,
                    ): column is GridColumnDefinition<InstallmentItem, InstallmentGridColumnKey> =>
                      Boolean(column),
                  )
              : INSTALLMENT_GRID_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: 'parcelas',
            branding: {
              title: 'Parcelas',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: runtimeContext.companyName || 'FINANCEIRO',
            },
          });
          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />
    </div>
  );
}
