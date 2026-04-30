'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import { formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildDefaultExportColumns,
  exportGridRows,
  type GridColumnDefinition,
  type GridExportFormat,
} from '@/app/lib/grid-export-utils';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import { buildFinanceApiQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type CompanyItem = {
  id: string;
  sourceSystem: string;
  sourceTenantId: string;
  name: string;
  document?: string | null;
  status: string;
  interestRate?: number | null;
  interestGracePeriod?: number | null;
  penaltyRate?: number | null;
  penaltyValue?: number | null;
  penaltyGracePeriod?: number | null;
  createdAt: string;
  receivableTitleCount: number;
  installmentCount: number;
  cashSessionCount: number;
};

type CompanyFinancialFormState = {
  interestRate: string;
  interestGracePeriod: string;
  penaltyRate: string;
  penaltyValue: string;
  penaltyGracePeriod: string;
};

type CompanyGridColumnKey =
  | 'name'
  | 'sourceSystem'
  | 'sourceTenantId'
  | 'document'
  | 'receivableTitleCount'
  | 'installmentCount'
  | 'cashSessionCount'
  | 'createdAt';

type CompanyGridConfig = {
  order: CompanyGridColumnKey[];
  hidden: CompanyGridColumnKey[];
};

const EMBEDDED_COMPANY_SUCCESS_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_EMPRESA_SALVO_SUCESSO';

const COMPANY_GRID_COLUMNS: GridColumnDefinition<CompanyItem, CompanyGridColumnKey>[] = [
  { key: 'name', label: 'Empresa', getValue: (item) => item.name },
  { key: 'sourceSystem', label: 'Origem', getValue: (item) => item.sourceSystem },
  { key: 'sourceTenantId', label: 'Tenant', getValue: (item) => item.sourceTenantId },
  { key: 'document', label: 'Documento', getValue: (item) => item.document || '---' },
  { key: 'receivableTitleCount', label: 'Títulos', getValue: (item) => String(item.receivableTitleCount) },
  { key: 'installmentCount', label: 'Parcelas', getValue: (item) => String(item.installmentCount) },
  { key: 'cashSessionCount', label: 'Caixas', getValue: (item) => String(item.cashSessionCount) },
  { key: 'createdAt', label: 'Criada em', getValue: (item) => formatDateLabel(item.createdAt) },
];

const COMPANY_GRID_STORAGE_PREFIX = 'financeiro:empresas:grid-columns:';
const COMPANY_EXPORT_STORAGE_PREFIX = 'financeiro:empresas:export-config:';

const DEFAULT_COMPANY_GRID_CONFIG: CompanyGridConfig = {
  order: COMPANY_GRID_COLUMNS.map((column) => column.key),
  hidden: [],
};

function formatOptionalNumberInput(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function parseOptionalNumber(value: string, integer = false) {
  const normalized = String(value || '').trim().replace(',', '.');
  if (!normalized) {
    return null;
  }

  const parsed = integer ? Number.parseInt(normalized, 10) : Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Informe apenas valores numéricos iguais ou maiores que zero.');
  }

  return integer ? Math.trunc(parsed) : Number(parsed.toFixed(2));
}

function buildCompanyFinancialForm(company: CompanyItem): CompanyFinancialFormState {
  return {
    interestRate: formatOptionalNumberInput(company.interestRate),
    interestGracePeriod: formatOptionalNumberInput(company.interestGracePeriod),
    penaltyRate: formatOptionalNumberInput(company.penaltyRate),
    penaltyValue: formatOptionalNumberInput(company.penaltyValue),
    penaltyGracePeriod: formatOptionalNumberInput(company.penaltyGracePeriod),
  };
}

function getCompanyGridStorageKey(tenantId: string | null) {
  return `${COMPANY_GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getCompanyExportStorageKey(tenantId: string | null) {
  return `${COMPANY_EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function readStoredCompanyGridConfig(tenantId: string | null): CompanyGridConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_COMPANY_GRID_CONFIG;
  }

  try {
    const rawValue = window.localStorage.getItem(getCompanyGridStorageKey(tenantId));
    if (!rawValue) return DEFAULT_COMPANY_GRID_CONFIG;
    const parsed = JSON.parse(rawValue) as Partial<CompanyGridConfig>;
    const validOrder = Array.isArray(parsed.order)
      ? parsed.order.filter((key): key is CompanyGridColumnKey =>
          COMPANY_GRID_COLUMNS.some((column) => column.key === key),
        )
      : [];
    const validHidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((key): key is CompanyGridColumnKey =>
          COMPANY_GRID_COLUMNS.some((column) => column.key === key),
        )
      : [];
    return {
      order: validOrder.length ? validOrder : DEFAULT_COMPANY_GRID_CONFIG.order,
      hidden: validHidden,
    };
  } catch {
    return DEFAULT_COMPANY_GRID_CONFIG;
  }
}

function getVisibleCompanyColumns(config: CompanyGridConfig) {
  return config.order
    .map((key) => COMPANY_GRID_COLUMNS.find((column) => column.key === key))
    .filter((column): column is GridColumnDefinition<CompanyItem, CompanyGridColumnKey> => Boolean(column))
    .filter((column) => !config.hidden.includes(column.key));
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

function CompanyGridConfigModal({
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
  columns: GridColumnDefinition<CompanyItem, CompanyGridColumnKey>[];
  order: CompanyGridColumnKey[];
  hidden: CompanyGridColumnKey[];
  onSave: (order: CompanyGridColumnKey[], hidden: CompanyGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftOrder, setDraftOrder] = useState<CompanyGridColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<CompanyGridColumnKey[]>(hidden);
  const [draggedColumnKey, setDraggedColumnKey] = useState<CompanyGridColumnKey | null>(null);
  const [activeColumnKey, setActiveColumnKey] = useState<CompanyGridColumnKey | null>(null);

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

  const moveColumnToIndex = (columnKey: CompanyGridColumnKey, targetIndex: number) => {
    const currentIndex = draftOrder.indexOf(columnKey);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    setDraftOrder((current) => moveArrayItem(current, currentIndex, targetIndex));
    setActiveColumnKey(columnKey);
  };

  const toggleColumnVisibility = (columnKey: CompanyGridColumnKey) => {
    setDraftHidden((current) =>
      current.includes(columnKey)
        ? current.filter((item) => item !== columnKey)
        : [...current, columnKey],
    );
    setActiveColumnKey(columnKey);
  };

  const handleSave = () => {
    onSave(draftOrder, draftHidden);
    onClose();
  };

  const handleReset = () => {
    setDraftOrder(DEFAULT_COMPANY_GRID_CONFIG.order);
    setDraftHidden(DEFAULT_COMPANY_GRID_CONFIG.hidden);
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
            ✕
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
                  onClick={handleReset}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Restaurar padrão
                </button>
                <button
                  type="button"
                  onClick={handleSave}
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
                    className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 transition ${
                      isActive
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
                        title={
                          !isHidden
                            ? 'Esta coluna esta sendo usada no grid'
                            : 'Esta coluna nao esta sendo usada no grid'
                        }
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
                        <div className="text-base font-black text-slate-900">{column.label}</div>
                        <div className="text-xs font-medium text-slate-500">
                          {isHidden ? 'Coluna oculta' : 'Coluna padrão'}
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                        title="Mover para baixo"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
                        title="Arrastar para reordenar"
                      >
                        ⋮⋮
                      </button>
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

function CompanyFinancialSettingsModal({
  company,
  form,
  isOpen,
  isSaving,
  error,
  embedded = false,
  onClose,
  onChange,
  onSave,
}: {
  company: CompanyItem | null;
  form: CompanyFinancialFormState;
  isOpen: boolean;
  isSaving: boolean;
  error: string | null;
  embedded?: boolean;
  onClose: () => void;
  onChange: (field: keyof CompanyFinancialFormState, value: string) => void;
  onSave: () => void;
}) {
  if (!isOpen || !company) {
    return null;
  }

  const penaltyRateDisabled = Number(form.penaltyValue.replace(',', '.')) > 0;
  const penaltyValueDisabled = Number(form.penaltyRate.replace(',', '.')) > 0;

  return (
    <div
      className={
        embedded
          ? 'w-full'
          : 'fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm'
      }
    >
      <div
        className={
          embedded
            ? 'flex w-full flex-col overflow-visible rounded-[28px] border border-slate-200 bg-white shadow-sm'
            : 'flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl'
        }
      >
        {!embedded ? (
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
                Configuração financeira
              </div>
              <h2 className="mt-1 text-2xl font-black text-slate-900">{company.name}</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Ajuste as regras padrão que serão usadas nas novas parcelas desta empresa.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        ) : null}

        <div className={`p-6 ${embedded ? 'pb-6' : 'flex-1 overflow-y-auto'}`}>
          <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${embedded ? '' : 'mt-5'}`}>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  % juros mensais
                </label>
                <input
                  value={form.interestRate}
                  onChange={(event) => onChange('interestRate', event.target.value)}
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                  inputMode="decimal"
                  placeholder="Ex: 5,5"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Dias de carência (juros)
                </label>
                <input
                  value={form.interestGracePeriod}
                  onChange={(event) => onChange('interestGracePeriod', event.target.value)}
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                  inputMode="numeric"
                  placeholder="Ex: 5"
                />
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  % multa
                </label>
                <input
                  value={form.penaltyRate}
                  onChange={(event) => {
                    onChange('penaltyRate', event.target.value);
                    if (Number(event.target.value.replace(',', '.')) > 0) {
                      onChange('penaltyValue', '');
                    }
                  }}
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                  inputMode="decimal"
                  placeholder="Ex: 2"
                  disabled={penaltyRateDisabled}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  R$ valor fixo multa
                </label>
                <input
                  value={form.penaltyValue}
                  onChange={(event) => {
                    onChange('penaltyValue', event.target.value);
                    if (Number(event.target.value.replace(',', '.')) > 0) {
                      onChange('penaltyRate', '');
                    }
                  }}
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                  inputMode="decimal"
                  placeholder="Ex: 10"
                  disabled={penaltyValueDisabled}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Dias de carência (multa)
                </label>
                <input
                  value={form.penaltyGracePeriod}
                  onChange={(event) => onChange('penaltyGracePeriod', event.target.value)}
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                  inputMode="numeric"
                  placeholder="Ex: 5"
                />
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          {!embedded ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Fechar
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FinanceiroEmpresasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const runtimeTenantReady = Boolean(runtimeContext.sourceTenantId);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyItem | null>(null);
  const [financialForm, setFinancialForm] = useState<CompanyFinancialFormState>({
    interestRate: '',
    interestGracePeriod: '',
    penaltyRate: '',
    penaltyValue: '',
    penaltyGracePeriod: '',
  });
  const [financialFormError, setFinancialFormError] = useState<string | null>(null);
  const [isSavingFinancialSettings, setIsSavingFinancialSettings] = useState(false);
  const [columnOrder, setColumnOrder] = useState<CompanyGridColumnKey[]>(
    DEFAULT_COMPANY_GRID_CONFIG.order,
  );
  const [hiddenColumns, setHiddenColumns] = useState<CompanyGridColumnKey[]>(
    DEFAULT_COMPANY_GRID_CONFIG.hidden,
  );
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [showEmbeddedSuccess, setShowEmbeddedSuccess] = useState(false);
  const [exportColumns, setExportColumns] = useState<Record<CompanyGridColumnKey, boolean>>(
    buildDefaultExportColumns(COMPANY_GRID_COLUMNS),
  );
  const visibleCompanyColumns = useMemo(
    () => getVisibleCompanyColumns({ order: columnOrder, hidden: hiddenColumns }),
    [columnOrder, hiddenColumns],
  );
  const embeddedSingleCompany = runtimeContext.embedded && companies.length === 1;
  const embeddedCompany = embeddedSingleCompany ? companies[0] : null;

  const loadCompanies = useCallback(async (currentSearch?: string) => {
    if (!runtimeTenantReady) {
      setCompanies([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      setCompanies(
        await getJson<CompanyItem[]>(
          `/companies${buildFinanceApiQueryString(runtimeContext, {
            search: currentSearch?.trim()
              ? currentSearch.trim().toUpperCase()
              : undefined,
          })}`,
        ),
      );
    } catch (currentError) {
      setCompanies([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar as empresas do Financeiro.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext, runtimeTenantReady]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    const storedConfig = readStoredCompanyGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      getCompanyGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({ order: columnOrder, hidden: hiddenColumns }),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (!runtimeContext.embedded || isLoading || companies.length !== 1) {
      return;
    }

    const company = companies[0];
    if (!company || editingCompany?.id === company.id) {
      return;
    }

    openFinancialSettings(company);
  }, [companies, editingCompany?.id, isLoading, runtimeContext.embedded]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCompanies(search);
  }

  function openFinancialSettings(company: CompanyItem) {
    setEditingCompany(company);
    setFinancialForm(buildCompanyFinancialForm(company));
    setFinancialFormError(null);
  }

  function closeFinancialSettings() {
    setEditingCompany(null);
    setFinancialFormError(null);
    setIsSavingFinancialSettings(false);
  }

  async function handleSaveFinancialSettings() {
    if (!editingCompany) {
      return;
    }

    try {
      setIsSavingFinancialSettings(true);
      setFinancialFormError(null);

      const updatedCompany = await requestJson<CompanyItem>(
        `/companies/${editingCompany.id}/financial-settings${buildFinanceApiQueryString(
          runtimeContext,
        )}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            requestedBy:
              runtimeContext.sourceTenantId || runtimeContext.companyName || 'FINANCEIRO_EMPRESAS',
            interestRate: parseOptionalNumber(financialForm.interestRate),
            interestGracePeriod: parseOptionalNumber(
              financialForm.interestGracePeriod,
              true,
            ),
            penaltyRate: parseOptionalNumber(financialForm.penaltyRate),
            penaltyValue: parseOptionalNumber(financialForm.penaltyValue),
            penaltyGracePeriod: parseOptionalNumber(
              financialForm.penaltyGracePeriod,
              true,
            ),
          }),
          fallbackMessage:
            'Não foi possível salvar as configurações financeiras da empresa.',
        },
      );

      setCompanies((current) =>
        current.map((item) => (item.id === updatedCompany.id ? updatedCompany : item)),
      );
      setStatusMessage('Configurações financeiras da empresa atualizadas com sucesso.');
      if (runtimeContext.embedded) {
        setShowEmbeddedSuccess(true);
      }
      closeFinancialSettings();
    } catch (currentError) {
      setFinancialFormError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível salvar as configurações financeiras da empresa.',
        ),
      );
      setIsSavingFinancialSettings(false);
    }
  }

  const showClearSearchButton = Boolean(search.trim());
  const embeddedCompanyScreenId = embeddedSingleCompany
    ? 'FINANCEIRO_EMPRESA_EDITAR_ATUAL'
    : 'FINANCEIRO_EMPRESAS_LISTAGEM_GERAL';
  const successCompanyName =
    editingCompany?.name || embeddedCompany?.name || runtimeContext.companyName || 'ESCOLA';

  function handleReturnAfterSave() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = '/';
  }

  const embeddedSuccessPopup =
    runtimeContext.embedded && showEmbeddedSuccess ? (
      <div className="absolute inset-0 z-[90] flex items-center justify-center bg-slate-900/20 p-6">
        <section className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-[#166534] via-[#15803d] to-[#22c55e] px-6 py-8 text-white">
            <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-lg">
                {runtimeContext.logoUrl ? (
                  <img
                    src={runtimeContext.logoUrl}
                    alt={`Logo de ${successCompanyName}`}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-xl font-black uppercase tracking-[0.25em] text-[#166534]">
                    {String(successCompanyName || 'ESCOLA').slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="mt-5 text-xs font-black uppercase tracking-[0.28em] text-emerald-100">
                Informações salvas com sucesso
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight">Cadastro atualizado</h1>
              <p className="mt-3 max-w-2xl text-sm font-medium text-emerald-50/95">
                As configurações financeiras da empresa foram salvas com sucesso.
              </p>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
              <ScreenNameCopy
                screenId={EMBEDDED_COMPANY_SUCCESS_SCREEN_ID}
                className="justify-between text-slate-500"
              />
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleReturnAfterSave}
                className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
              >
                Retornar
              </button>
            </div>
          </div>
        </section>
      </div>
    ) : null;

  return (
    <>
    <div className={`space-y-6 ${runtimeContext.embedded ? 'relative' : ''}`}>
      {!runtimeContext.embedded ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Cadastro operacional</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">Empresas</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Cada empresa é criada automaticamente a partir do sistema de origem e passa a operar no mesmo núcleo financeiro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="inline-flex items-center self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar ao Menu
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {!runtimeContext.embedded ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} p-6`}>
          <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[auto_1fr_auto_auto]">
            <button
              type="button"
              title="INCLUIR"
              aria-label="INCLUIR"
              className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </button>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={FINANCE_GRID_PAGE_LAYOUT.input}
              placeholder="PESQUISAR POR EMPRESA, DOCUMENTO OU TENANT"
            />
            <button
              type="submit"
              title="PESQUISAR"
              aria-label="PESQUISAR"
              className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <circle cx="11" cy="11" r="6" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
            {showClearSearchButton ? (
              <button
                type="button"
                title="LIMPAR CONSULTA"
                aria-label="LIMPAR CONSULTA"
                onClick={() => {
                  setSearch('');
                  void loadCompanies();
                }}
                className="inline-flex items-center justify-center rounded-2xl bg-rose-500 px-6 py-3 text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M9 9l6 6" />
                  <path d="M15 9l-6 6" />
                </svg>
              </button>
            ) : null}
          </form>
        </section>
      ) : null}

      {error ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      {statusMessage ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} border-emerald-200 bg-emerald-50 px-6 py-5 text-sm font-semibold text-emerald-700`}>
          {statusMessage}
        </section>
      ) : null}

      {!runtimeContext.embedded ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} overflow-hidden`}>
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Empresas ativas</div>
            <h2 className="mt-1 text-xl font-black text-slate-900">
              {isLoading ? 'Carregando...' : `${companies.length} empresa(s) encontrada(s)`}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  {visibleCompanyColumns.map((column) => (
                    <th key={column.key} className="px-4 py-3">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companies.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    {visibleCompanyColumns.map((column) => (
                      <td key={column.key} className="px-4 py-4">
                        {column.key === 'name' ? (
                          <div>
                            <div className="font-black text-slate-900">{item.name}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {item.status}
                            </div>
                            <button
                              type="button"
                              onClick={() => openFinancialSettings(item)}
                              className="mt-3 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                            >
                              Alterar financeiro
                            </button>
                          </div>
                        ) : column.key === 'sourceSystem' ? (
                          <div>
                            <div className="font-semibold text-slate-700">{item.sourceSystem}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {item.sourceTenantId}
                            </div>
                          </div>
                        ) : column.key === 'sourceTenantId' ? (
                          <div className="font-semibold text-slate-700">{item.sourceTenantId}</div>
                        ) : column.key === 'document' ? (
                          <div className="font-semibold text-slate-700">{item.document || '---'}</div>
                        ) : column.key === 'receivableTitleCount' ? (
                          item.receivableTitleCount
                        ) : column.key === 'installmentCount' ? (
                          item.installmentCount
                        ) : column.key === 'cashSessionCount' ? (
                          item.cashSessionCount
                        ) : (
                          formatDateLabel(item.createdAt)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {!isLoading && !companies.length ? (
                  <tr>
                    <td colSpan={visibleCompanyColumns.length || 1} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                      {runtimeTenantReady
                        ? 'Nenhuma empresa financeira foi localizada para o tenant atual.'
                        : 'Nenhuma empresa pode ser exibida sem o tenant atual informado.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {runtimeContext.embedded && editingCompany ? (
        <CompanyFinancialSettingsModal
          isOpen
          embedded
          company={editingCompany}
          form={financialForm}
          isSaving={isSavingFinancialSettings}
          error={financialFormError}
          onClose={closeFinancialSettings}
          onChange={(field, value) => {
            setFinancialForm((current) => ({
              ...current,
              [field]: value,
            }));
          }}
          onSave={() => {
            void handleSaveFinancialSettings();
          }}
        />
      ) : null}

      {!runtimeContext.embedded ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} border-slate-100 bg-slate-50 px-6 py-4`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                title="COLUNAS"
                aria-label="COLUNAS"
                onClick={() => setIsColumnConfigOpen(true)}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                ☰ Colunas
              </button>
              <button
                type="button"
                title="IMPRIMIR"
                aria-label="IMPRIMIR"
                onClick={() => setIsExportModalOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-600"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9V4h12v5" />
                  <path d="M6 18h12v-6H6z" />
                  <path d="M8 14h8" />
                </svg>
              </button>
            </div>
            <ScreenNameCopy screenId={embeddedCompanyScreenId} className="justify-end" />
          </div>
        </section>
      ) : null}

      <CompanyGridConfigModal
        isOpen={isColumnConfigOpen}
        title="Configurar colunas do grid"
        description="Reordene, oculte ou inclua colunas do grid nesta tela."
        columns={COMPANY_GRID_COLUMNS}
        order={columnOrder}
        hidden={hiddenColumns}
        onSave={(order, hidden) => {
          setColumnOrder(order);
          setHiddenColumns(hidden);
        }}
        onClose={() => setIsColumnConfigOpen(false)}
      />
      <CompanyFinancialSettingsModal
        isOpen={!runtimeContext.embedded && Boolean(editingCompany)}
        company={editingCompany}
        form={financialForm}
        isSaving={isSavingFinancialSettings}
        error={financialFormError}
        embedded={false}
        onClose={closeFinancialSettings}
        onChange={(field, value) => {
          setFinancialForm((current) => ({
            ...current,
            [field]: value,
          }));
        }}
        onSave={() => {
          void handleSaveFinancialSettings();
        }}
      />
      <GridExportModal
        isOpen={isExportModalOpen}
        title="Exportar empresas"
        description={`A exportação respeita a busca atual e inclui ${companies.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={COMPANY_GRID_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={getCompanyExportStorageKey(runtimeContext.sourceTenantId)}
        brandingName={companies[0]?.name || runtimeContext.companyName || 'FINANCEIRO'}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: companies,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) => COMPANY_GRID_COLUMNS.find((column) => column.key === key))
                  .filter(
                    (column): column is GridColumnDefinition<CompanyItem, CompanyGridColumnKey> =>
                      Boolean(column),
                  )
              : COMPANY_GRID_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: 'empresas',
            branding: {
              title: 'Empresas',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: companies[0]?.name || runtimeContext.companyName || 'FINANCEIRO',
            },
          });
          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />
    </div>
    {embeddedSuccessPopup}
    </>
  );
}
