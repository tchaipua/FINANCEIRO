'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { API_BASE_URL, getJson } from '@/app/lib/api';
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
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type CashSessionItem = {
  id: string;
  companyName?: string;
  cashierUserId: string;
  cashierDisplayName: string;
  status: string;
  sourceSystem: string;
  sourceTenantId: string;
  openingAmount: number;
  totalReceivedAmount: number;
  expectedClosingAmount: number;
  openedAt: string;
  closedAt?: string | null;
};

type CashSessionFilters = {
  search: string;
  status: 'ALL' | 'OPEN' | 'CLOSED';
};

type CashSessionGridColumnKey =
  | 'companyName'
  | 'cashierDisplayName'
  | 'status'
  | 'openedAt'
  | 'closedAt'
  | 'totalReceivedAmount'
  | 'expectedClosingAmount'
  | 'sourceSystem'
  | 'sourceTenantId';

type CashSessionGridConfig = {
  order: CashSessionGridColumnKey[];
  hidden: CashSessionGridColumnKey[];
};

const SCREEN_ID = 'FINANCEIRO_CAIXA_SESSOES_GERAL';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CAIXA';
const cardClass = FINANCE_GRID_PAGE_LAYOUT.card;
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const DEFAULT_FILTERS: CashSessionFilters = {
  search: '',
  status: 'ALL',
};

const CASH_SESSION_GRID_COLUMNS: GridColumnDefinition<CashSessionItem, CashSessionGridColumnKey>[] = [
  { key: 'companyName', label: 'Empresa', getValue: (item) => item.companyName || '---' },
  { key: 'cashierDisplayName', label: 'Operador', getValue: (item) => item.cashierDisplayName || '---' },
  { key: 'status', label: 'Situação', getValue: (item) => normalizeSessionStatus(item.status) },
  { key: 'openedAt', label: 'Abertura', getValue: (item) => formatDateTimeLabel(item.openedAt) },
  { key: 'closedAt', label: 'Fechamento', getValue: (item) => formatDateTimeLabel(item.closedAt) },
  { key: 'totalReceivedAmount', label: 'Recebido', getValue: (item) => formatCurrency(item.totalReceivedAmount) },
  { key: 'expectedClosingAmount', label: 'Previsto', getValue: (item) => formatCurrency(item.expectedClosingAmount) },
  { key: 'sourceSystem', label: 'Sistema', getValue: (item) => item.sourceSystem || '---' },
  { key: 'sourceTenantId', label: 'Tenant', getValue: (item) => item.sourceTenantId || '---' },
];

const DEFAULT_CASH_SESSION_GRID_CONFIG: CashSessionGridConfig = {
  order: CASH_SESSION_GRID_COLUMNS.map((column) => column.key),
  hidden: CASH_SESSION_GRID_COLUMNS
    .filter((column) =>
      ['companyName', 'sourceSystem', 'sourceTenantId'].includes(column.key),
    )
    .map((column) => column.key),
};

const CASH_SESSION_GRID_STORAGE_PREFIX = 'financeiro:caixa:grid-columns:';
const CASH_SESSION_EXPORT_STORAGE_PREFIX = 'financeiro:caixa:export-config:';

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function normalizeSessionStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase() === 'OPEN' ? 'ABERTO' : 'FECHADO';
}

function getCashSessionGridStorageKey(tenantId: string | null) {
  return `${CASH_SESSION_GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getCashSessionExportStorageKey(tenantId: string | null) {
  return `${CASH_SESSION_EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function normalizeCashSessionGridConfig(config: Partial<CashSessionGridConfig> | null | undefined): CashSessionGridConfig {
  const validOrder = (config?.order || []).filter((item): item is CashSessionGridColumnKey =>
    CASH_SESSION_GRID_COLUMNS.some((column) => column.key === item),
  );
  const allKeys = CASH_SESSION_GRID_COLUMNS.map((column) => column.key);
  const normalizedOrder = [...validOrder, ...allKeys.filter((key) => !validOrder.includes(key))];
  const validHidden = (config?.hidden || []).filter((item): item is CashSessionGridColumnKey =>
    CASH_SESSION_GRID_COLUMNS.some((column) => column.key === item),
  );

  return {
    order: normalizedOrder,
    hidden: Array.from(new Set(validHidden)),
  };
}

function readStoredCashSessionGridConfig(tenantId: string | null) {
  if (typeof window === 'undefined') {
    return DEFAULT_CASH_SESSION_GRID_CONFIG;
  }

  try {
    const rawValue = window.localStorage.getItem(getCashSessionGridStorageKey(tenantId));
    if (!rawValue) {
      return DEFAULT_CASH_SESSION_GRID_CONFIG;
    }

    const parsed = JSON.parse(rawValue) as Partial<CashSessionGridConfig>;
    return normalizeCashSessionGridConfig(parsed);
  } catch {
    return DEFAULT_CASH_SESSION_GRID_CONFIG;
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

function getVisibleCashSessionColumns(order: CashSessionGridColumnKey[], hidden: CashSessionGridColumnKey[]) {
  const hiddenSet = new Set(hidden);
  return order
    .filter((key) => !hiddenSet.has(key))
    .map((key) => CASH_SESSION_GRID_COLUMNS.find((column) => column.key === key))
    .filter(
      (column): column is GridColumnDefinition<CashSessionItem, CashSessionGridColumnKey> =>
        Boolean(column),
    );
}

function getStatusPillClass(active: boolean, tone: 'blue' | 'emerald' | 'rose') {
  const tones = {
    blue: active
      ? 'border-blue-300 bg-blue-100 text-blue-800'
      : 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: active
      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: active
      ? 'border-rose-300 bg-rose-100 text-rose-800'
      : 'border-rose-200 bg-rose-50 text-rose-700',
  };

  return `inline-flex rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition hover:brightness-95 ${tones[tone]}`;
}

function CashSessionGridConfigModal({
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
  columns: GridColumnDefinition<CashSessionItem, CashSessionGridColumnKey>[];
  order: CashSessionGridColumnKey[];
  hidden: CashSessionGridColumnKey[];
  onSave: (order: CashSessionGridColumnKey[], hidden: CashSessionGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftOrder, setDraftOrder] = useState<CashSessionGridColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<CashSessionGridColumnKey[]>(hidden);
  const [draggedColumnKey, setDraggedColumnKey] = useState<CashSessionGridColumnKey | null>(null);
  const [activeColumnKey, setActiveColumnKey] = useState<CashSessionGridColumnKey | null>(null);

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

  const moveColumnToIndex = (columnKey: CashSessionGridColumnKey, targetIndex: number) => {
    const currentIndex = draftOrder.indexOf(columnKey);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    setDraftOrder((current) => moveArrayItem(current, currentIndex, targetIndex));
    setActiveColumnKey(columnKey);
  };

  const toggleColumnVisibility = (columnKey: CashSessionGridColumnKey) => {
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
                    setDraftOrder(DEFAULT_CASH_SESSION_GRID_CONFIG.order);
                    setDraftHidden(DEFAULT_CASH_SESSION_GRID_CONFIG.hidden);
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

export default function FinanceiroCashPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [sessions, setSessions] = useState<CashSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<CashSessionFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CashSessionFilters>(DEFAULT_FILTERS);
  const [columnOrder, setColumnOrder] = useState<CashSessionGridColumnKey[]>(
    DEFAULT_CASH_SESSION_GRID_CONFIG.order,
  );
  const [hiddenColumns, setHiddenColumns] = useState<CashSessionGridColumnKey[]>(
    DEFAULT_CASH_SESSION_GRID_CONFIG.hidden,
  );
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<CashSessionGridColumnKey, boolean>>(
    buildDefaultExportColumns(CASH_SESSION_GRID_COLUMNS),
  );
  const runtimeTenantReady = Boolean(runtimeContext.sourceTenantId);
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const canViewAllCashiers =
    runtimeContext.userRole === 'ADMIN' || runtimeContext.userRole === 'SOFTHOUSE_ADMIN';

  const visibleColumns = useMemo(
    () => getVisibleCashSessionColumns(columnOrder, hiddenColumns),
    [columnOrder, hiddenColumns],
  );

  const searchMatchedSessions = useMemo(() => {
    const normalizedSearch = appliedFilters.search.trim().toUpperCase();

    return sessions.filter((item) => {
      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        item.companyName,
        item.cashierDisplayName,
        item.sourceSystem,
        item.sourceTenantId,
      ]
        .filter(Boolean)
        .join(' ')
        .toUpperCase();

      return haystack.includes(normalizedSearch);
    });
  }, [appliedFilters.search, sessions]);

  const filteredSessions = useMemo(() => {
    if (appliedFilters.status === 'ALL') {
      return searchMatchedSessions;
    }

    return searchMatchedSessions.filter((item) => {
      const status = String(item.status || '').trim().toUpperCase();
      return appliedFilters.status === 'OPEN' ? status === 'OPEN' : status !== 'OPEN';
    });
  }, [appliedFilters.status, searchMatchedSessions]);

  const openCount = useMemo(
    () =>
      searchMatchedSessions.filter((item) => String(item.status || '').trim().toUpperCase() === 'OPEN')
        .length,
    [searchMatchedSessions],
  );
  const closedCount = searchMatchedSessions.length - openCount;

  const loadSessions = useCallback(async () => {
    if (!runtimeTenantReady) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const queryParams = canViewAllCashiers
        ? undefined
        : { cashierUserId: runtimeContext.cashierUserId };

      let loadedSessions = await getJson<CashSessionItem[]>(
        `/cash-sessions${buildFinanceApiQueryString(runtimeContext, queryParams)}`,
      );

      const currentCashierHasOpenSession = loadedSessions.some(
        (session) =>
          session.status === 'OPEN' &&
          session.cashierUserId === runtimeContext.cashierUserId,
      );

      if (
        runtimeContext.sourceSystem &&
        runtimeContext.sourceTenantId &&
        runtimeContext.cashierUserId &&
        runtimeContext.cashierDisplayName &&
        !currentCashierHasOpenSession
      ) {
        const response = await fetch(`${API_BASE_URL}/cash-sessions/open`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            cashierUserId: runtimeContext.cashierUserId,
            cashierDisplayName: runtimeContext.cashierDisplayName,
            openingAmount: 0,
          }),
        });

        if (response.ok) {
          loadedSessions = await getJson<CashSessionItem[]>(
            `/cash-sessions${buildFinanceApiQueryString(runtimeContext, queryParams)}`,
          );
        }
      }

      setSessions(loadedSessions);
    } catch (currentError) {
      setSessions([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar as sessões de caixa.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [canViewAllCashiers, runtimeContext, runtimeTenantReady]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') {
      return;
    }

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: EMBEDDED_SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  useEffect(() => {
    const storedConfig = readStoredCashSessionGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      getCashSessionGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({
        order: columnOrder,
        hidden: hiddenColumns,
      }),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  async function handleCloseSession(session: CashSessionItem) {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !session.cashierUserId) {
      setError('Não foi possível identificar a escola e o operador para fechar o caixa.');
      return;
    }

    try {
      setClosingSessionId(session.id);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/cash-sessions/close-current`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          cashierUserId: session.cashierUserId,
          declaredClosingAmount: session.expectedClosingAmount,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'Não foi possível fechar o caixa.');
      }

      await loadSessions();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível fechar o caixa.',
        ),
      );
    } finally {
      setClosingSessionId(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters({
      search: draftFilters.search.trim(),
      status: draftFilters.status,
    });
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                  Operação de caixa
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">Sessões de Caixa</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Abra e feche caixas por operador e empresa de origem, mantendo o histórico financeiro centralizado.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar ao Menu
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1fr_0.8fr_auto_auto]">
          <input
            value={draftFilters.search}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                search: event.target.value,
              }))
            }
            className={inputClass}
            placeholder="PESQUISAR POR OPERADOR, EMPRESA, SISTEMA OU TENANT"
          />
          <select
            value={draftFilters.status}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                status: event.target.value as CashSessionFilters['status'],
              }))
            }
            className={inputClass}
          >
            <option value="ALL">TODOS</option>
            <option value="OPEN">ABERTOS</option>
            <option value="CLOSED">FECHADOS</option>
          </select>
          <button type="submit" className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>
            Aplicar
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftFilters(DEFAULT_FILTERS);
              setAppliedFilters(DEFAULT_FILTERS);
            }}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
          >
            Limpar
          </button>
        </form>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            Sessões de caixa
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {isLoading ? 'Carregando...' : `${filteredSessions.length} sessão(ões) encontrada(s)`}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                {visibleColumns.map((column) => (
                  <th key={column.key} className="px-4 py-3">
                    {column.label}
                  </th>
                ))}
                <th className="px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  {visibleColumns.map((column) => (
                    <td key={column.key} className="px-4 py-4">
                      {column.key === 'companyName' ? (
                        <div>
                          <div className="font-black text-slate-900">{item.companyName || '---'}</div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            {item.sourceSystem}
                          </div>
                        </div>
                      ) : column.key === 'cashierDisplayName' ? (
                        <div className="font-semibold text-slate-700">{item.cashierDisplayName}</div>
                      ) : column.key === 'status' ? (
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                            item.status === 'OPEN'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-rose-200 bg-rose-50 text-rose-700'
                          }`}
                        >
                          {item.status === 'OPEN' ? 'ABERTO' : 'FECHADO'}
                        </span>
                      ) : column.key === 'openedAt' ? (
                        formatDateTimeLabel(item.openedAt)
                      ) : column.key === 'closedAt' ? (
                        formatDateTimeLabel(item.closedAt)
                      ) : column.key === 'totalReceivedAmount' ? (
                        <span className="font-black text-slate-900">
                          {formatCurrency(item.totalReceivedAmount)}
                        </span>
                      ) : column.key === 'expectedClosingAmount' ? (
                        <span className="font-black text-slate-900">
                          {formatCurrency(item.expectedClosingAmount)}
                        </span>
                      ) : column.key === 'sourceSystem' ? (
                        <div className="font-semibold text-slate-700">{item.sourceSystem || '---'}</div>
                      ) : column.key === 'sourceTenantId' ? (
                        <div className="font-semibold text-slate-700">{item.sourceTenantId || '---'}</div>
                      ) : (
                        column.getValue(item)
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/caixa/${item.id}${preservedQueryString}`}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                      >
                        Detalhar
                      </Link>
                      {item.status === 'OPEN' ? (
                        <button
                          type="button"
                          disabled={closingSessionId === item.id}
                          onClick={() => void handleCloseSession(item)}
                          className="rounded-xl bg-slate-800 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-slate-900 disabled:opacity-60"
                        >
                          {closingSessionId === item.id ? 'Fechando...' : 'Fechar'}
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          ---
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && !filteredSessions.length ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Nenhuma sessão de caixa foi localizada com os filtros atuais.
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
              onClick={() => {
                setDraftFilters((current) => ({ ...current, status: 'ALL' }));
                setAppliedFilters((current) => ({ ...current, status: 'ALL' }));
              }}
              className={getStatusPillClass(appliedFilters.status === 'ALL', 'blue')}
            >
              Todos ({searchMatchedSessions.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftFilters((current) => ({ ...current, status: 'OPEN' }));
                setAppliedFilters((current) => ({ ...current, status: 'OPEN' }));
              }}
              className={getStatusPillClass(appliedFilters.status === 'OPEN', 'emerald')}
            >
              Abertos ({openCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftFilters((current) => ({ ...current, status: 'CLOSED' }));
                setAppliedFilters((current) => ({ ...current, status: 'CLOSED' }));
              }}
              className={getStatusPillClass(appliedFilters.status === 'CLOSED', 'rose')}
            >
              Fechados ({closedCount})
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
              Registros exibidos ({filteredSessions.length})
            </div>
            {!runtimeContext.embedded ? (
              <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
            ) : null}
          </div>
        </div>
      </section>

      <CashSessionGridConfigModal
        isOpen={isColumnConfigOpen}
        title="Configurar colunas do grid"
        description="Reordene, oculte ou inclua colunas do grid nesta tela."
        columns={CASH_SESSION_GRID_COLUMNS}
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
        title="Exportar sessões de caixa"
        description={`A exportação respeita os filtros atuais e inclui ${filteredSessions.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={CASH_SESSION_GRID_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={getCashSessionExportStorageKey(runtimeContext.sourceTenantId)}
        brandingName={runtimeContext.companyName || 'FINANCEIRO'}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: filteredSessions,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) => CASH_SESSION_GRID_COLUMNS.find((column) => column.key === key))
                  .filter(
                    (
                      column,
                    ): column is GridColumnDefinition<CashSessionItem, CashSessionGridColumnKey> =>
                      Boolean(column),
                  )
              : CASH_SESSION_GRID_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: 'caixa-sessoes',
            branding: {
              title: 'Sessões de Caixa',
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
