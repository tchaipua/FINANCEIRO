'use client';

import { postMessageToTrustedParent } from '@/app/lib/trusted-messaging';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
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
import { withFinanceBasePath } from '@/app/lib/public-path';
import { buildFinanceApiQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

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

type CompanyBranchItem = {
  id: string;
  branchCode: number;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  inventoryControlType: 'TRADITIONAL' | 'COLOR_SIZE' | 'LOT';
  quantityPrecision: 'INTEGER_ONLY' | 'DECIMAL_ALLOWED' | 'PRODUCT_DEFINED';
  stockClassificationMode?: 'GROUP_ONLY' | 'GROUP_AND_SUBGROUP';
  allowSaleUnitPriceEdit?: boolean;
  allowSaleItemDiscount?: boolean;
};

type CompanyBranchFormState = {
  id: string | null;
  branchCode: string;
  name: string;
  inventoryControlType: 'TRADITIONAL' | 'COLOR_SIZE' | 'LOT';
  quantityPrecision: 'INTEGER_ONLY' | 'DECIMAL_ALLOWED' | 'PRODUCT_DEFINED';
  stockClassificationMode: 'GROUP_ONLY' | 'GROUP_AND_SUBGROUP';
  allowSaleUnitPriceEdit: boolean;
  allowSaleItemDiscount: boolean;
};

type BranchGridColumnKey =
  | 'branchCode'
  | 'name'
  | 'status'
  | 'inventoryControlType'
  | 'quantityPrecision'
  | 'stockClassificationMode'
  | 'isDefault';

type BranchGridSort = {
  key: BranchGridColumnKey | null;
  direction: 'ASC' | 'DESC';
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
const EMBEDDED_PARENT_COMPANY_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_EMPRESA';
const EMPRESAS_ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\empresas\\page.tsx';

type EmpresasAuditParams = {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  companyName?: string | null;
  search: string;
  displayedRowsCount: number;
};

function buildEmpresasAuditSql(params: EmpresasAuditParams) {
  const search = params.search.trim().toUpperCase();

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :search = ${toSqlLiteral(search)}

SELECT CO.*
FROM companies CO
WHERE CO.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND (
    ${toSqlLiteral(search)} = ''
    OR UPPER(COALESCE(CO.name, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(CO.document, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(CO.sourceSystem, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(CO.sourceTenantId, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
  )
ORDER BY CO.name ASC;`;
}

function buildEmpresasAuditText(params: EmpresasAuditParams) {
  const search = params.search.trim().toUpperCase();

  return `--- LOGICA DA TELA ---
Tela de cadastro/configuracao da empresa financeira.

TABELAS PRINCIPAIS:
- companies (CO) - empresas financeiras vinculadas ao sistema de origem
- company_branches - filiais/configuracoes operacionais da empresa

RELACIONAMENTOS:
- company_branches.companyId = companies.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId, params.companyName)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- busca digitada (:search): ${formatAuditValue(search)}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: nome ASC

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- CO.sourceSystem e CO.sourceTenantId isolam os dados da empresa/sistema de origem
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

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
type CompanyGridSortDirection = 'ASC' | 'DESC';
type CompanyGridSort = {
  key: CompanyGridColumnKey | null;
  direction: CompanyGridSortDirection;
};
type CompanyColumnFilters = Record<CompanyGridColumnKey, string>;

const DEFAULT_COMPANY_GRID_CONFIG: CompanyGridConfig = {
  order: COMPANY_GRID_COLUMNS.map((column) => column.key),
  hidden: [],
};
const EMPTY_COMPANY_COLUMN_FILTERS = COMPANY_GRID_COLUMNS.reduce((filters, column) => {
  filters[column.key] = '';
  return filters;
}, {} as CompanyColumnFilters);
const DEFAULT_COMPANY_GRID_SORT: CompanyGridSort = {
  key: null,
  direction: 'ASC',
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

const emptyBranchForm: CompanyBranchFormState = {
  id: null,
  branchCode: '',
  name: '',
  inventoryControlType: 'TRADITIONAL',
  quantityPrecision: 'INTEGER_ONLY',
  stockClassificationMode: 'GROUP_ONLY',
  allowSaleUnitPriceEdit: true,
  allowSaleItemDiscount: true,
};

const BRANCH_GRID_COLUMNS: GridColumnDefinition<CompanyBranchItem, BranchGridColumnKey>[] = [
  { key: 'branchCode', label: 'Código', getValue: (item) => String(item.branchCode) },
  { key: 'name', label: 'Filial', getValue: (item) => item.name },
  { key: 'status', label: 'Status', getValue: (item) => (item.isActive !== false ? 'ATIVO' : 'INATIVO') },
  { key: 'inventoryControlType', label: 'Tipo estoque', getValue: (item) => getInventoryControlTypeLabel(item.inventoryControlType) },
  { key: 'quantityPrecision', label: 'Quantidade', getValue: (item) => getQuantityPrecisionLabel(item.quantityPrecision) },
  {
    key: 'stockClassificationMode',
    label: 'Classificação',
    getValue: (item) => item.stockClassificationMode === 'GROUP_AND_SUBGROUP' ? 'GRUPO + SUBGRUPO' : 'GRUPO',
  },
  { key: 'isDefault', label: 'Padrão', getValue: (item) => (item.isDefault ? 'SIM' : 'NÃO') },
];

const EMPTY_BRANCH_GRID_FILTERS = BRANCH_GRID_COLUMNS.reduce((filters, column) => {
  filters[column.key] = '';
  return filters;
}, {} as Record<BranchGridColumnKey, string>);

function buildBranchForm(branch: CompanyBranchItem): CompanyBranchFormState {
  return {
    id: branch.id,
    branchCode: String(branch.branchCode),
    name: branch.name,
    inventoryControlType: branch.inventoryControlType || 'TRADITIONAL',
    quantityPrecision: branch.quantityPrecision || 'INTEGER_ONLY',
    stockClassificationMode: branch.stockClassificationMode === 'GROUP_AND_SUBGROUP' ? 'GROUP_AND_SUBGROUP' : 'GROUP_ONLY',
    allowSaleUnitPriceEdit: branch.allowSaleUnitPriceEdit !== false,
    allowSaleItemDiscount: branch.allowSaleItemDiscount !== false,
  };
}

function getInventoryControlTypeLabel(value: CompanyBranchItem['inventoryControlType']) {
  switch (value) {
    case 'COLOR_SIZE':
      return 'COR E NÚMERO';
    case 'LOT':
      return 'LOTE';
    default:
      return 'TRADICIONAL';
  }
}

function getQuantityPrecisionLabel(value: CompanyBranchItem['quantityPrecision']) {
  switch (value) {
    case 'DECIMAL_ALLOWED':
      return 'ACEITA DECIMAL';
    case 'PRODUCT_DEFINED':
      return 'DEFINIR NO PRODUTO';
    default:
      return 'SOMENTE INTEIRO';
  }
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

function normalizeCompanyGridFilterValue(value: string | number | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function getCompanyStatusLabel(status: string) {
  return status === 'ACTIVE' ? 'ATIVO' : 'INATIVO';
}

function getCompanyGridFilterValue(company: CompanyItem, columnKey: CompanyGridColumnKey) {
  if (columnKey === 'name') {
    return [company.name, getCompanyStatusLabel(company.status)].join(' ');
  }

  const column = COMPANY_GRID_COLUMNS.find((item) => item.key === columnKey);
  return column ? column.getValue(company) : '';
}

function matchesCompanyColumnFilters(company: CompanyItem, filters: CompanyColumnFilters) {
  return COMPANY_GRID_COLUMNS.every((column) => {
    const filter = normalizeCompanyGridFilterValue(filters[column.key]);
    if (!filter) {
      return true;
    }

    return normalizeCompanyGridFilterValue(getCompanyGridFilterValue(company, column.key)).includes(filter);
  });
}

function compareCompanyGridValues(leftValue: string, rightValue: string) {
  return normalizeCompanyGridFilterValue(leftValue).localeCompare(
    normalizeCompanyGridFilterValue(rightValue),
    'pt-BR',
    { numeric: true, sensitivity: 'base' },
  );
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

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
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
              <div className="space-y-5">
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

function CompanyBranchSettingsModal({
  company,
  branches,
  form,
  isOpen,
  isLoading,
  isSaving,
  error,
  onClose,
  onEdit,
  onChange,
  onSave,
}: {
  company: CompanyItem | null;
  branches: CompanyBranchItem[];
  form: CompanyBranchFormState;
  isOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onEdit: (branch: CompanyBranchItem) => void;
  onChange: (field: keyof CompanyBranchFormState, value: string | boolean) => void;
  onSave: () => void;
}) {
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmationOpen(false);
    }
  }, [isOpen]);

  if (!isOpen || !company) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-blue-900/30 bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-5 text-white">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-200">
              Parâmetros da filial
            </div>
            <h2 className="mt-1 text-2xl font-black text-white">{company.name}</h2>
            <p className="mt-2 text-sm font-medium text-blue-100">
              Configure estoque e regras comerciais. As alterações serão confirmadas no sistema de origem.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar parâmetros da filial"
            title="Fechar"
            className="rounded-full border border-rose-200 bg-rose-600 px-3 py-2 text-xl leading-none text-white shadow-lg shadow-rose-900/20 transition hover:bg-rose-700"
          >
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                  Filiais herdadas da origem
                </div>
                <div className="mt-1 text-xs font-medium text-slate-500">
                  {isLoading ? 'Carregando...' : `${branches.length} filial(is)`}
                </div>
              </div>
            </div>

            {!isLoading && branches.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
                Cadastre a filial no sistema de origem para que ela seja sincronizada automaticamente.
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => onEdit(branch)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    form.id === branch.id
                      ? 'border-blue-300 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black uppercase tracking-[0.12em]">
                      {branch.branchCode} - {branch.name}
                    </div>
                    {branch.isDefault ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                        Padrão
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {getInventoryControlTypeLabel(branch.inventoryControlType)} ·{' '}
                    {getQuantityPrecisionLabel(branch.quantityPrecision)} ·{' '}
                    {branch.stockClassificationMode === 'GROUP_AND_SUBGROUP' ? 'GRUPO + SUBGRUPO' : 'GRUPO'} · PREÇO{' '}
                    {branch.allowSaleUnitPriceEdit === false ? 'BLOQUEADO' : 'EDITÁVEL'} ·
                    DESCONTO{' '}
                    {branch.allowSaleItemDiscount === false ? 'BLOQUEADO' : 'LIBERADO'}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
              Configuração da filial
            </div>

            <div className="grid gap-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Código da filial
                </span>
                <input
                  value={form.branchCode}
                  readOnly
                  className={`${FINANCE_GRID_PAGE_LAYOUT.input} cursor-not-allowed bg-slate-100 text-slate-500`}
                  inputMode="numeric"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Nome da filial
                </span>
                <input
                  value={form.name}
                  readOnly
                  className={`${FINANCE_GRID_PAGE_LAYOUT.input} cursor-not-allowed bg-slate-100 text-slate-500`}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Tipo controle estoque
                </span>
                <select
                  value={form.inventoryControlType}
                  onChange={(event) => onChange('inventoryControlType', event.target.value)}
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                >
                  <option value="TRADITIONAL">TRADICIONAL</option>
                  <option value="COLOR_SIZE">COR E NÚMERO</option>
                  <option value="LOT">TRATAR POR LOTE</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Quantidade do estoque
                </span>
                <select
                  value={form.quantityPrecision}
                  onChange={(event) => onChange('quantityPrecision', event.target.value)}
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                >
                  <option value="INTEGER_ONLY">SOMENTE NÚMERO INTEIRO</option>
                  <option value="DECIMAL_ALLOWED">ACEITA QUANTIDADE DECIMAL</option>
                  <option value="PRODUCT_DEFINED">AMBOS, DEFINIR NO PRODUTO</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Classificação do estoque
                </span>
                <select
                  value={form.stockClassificationMode}
                  onChange={(event) => onChange('stockClassificationMode', event.target.value)}
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                >
                  <option value="GROUP_ONLY">CONTROLAR SOMENTE POR GRUPO</option>
                  <option value="GROUP_AND_SUBGROUP">CONTROLAR POR GRUPO E SUBGRUPO</option>
                </select>
                <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                  Parâmetro exclusivo do Financeiro e salvo por filial.
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Preço na venda
                </span>
                <select
                  value={form.allowSaleUnitPriceEdit ? 'YES' : 'NO'}
                  onChange={(event) =>
                    onChange('allowSaleUnitPriceEdit', event.target.value === 'YES')
                  }
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                >
                  <option value="YES">PERMITE ALTERAR O PREÇO</option>
                  <option value="NO">BLOQUEIA PREÇO DO PRODUTO</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Desconto por produto
                </span>
                <select
                  value={form.allowSaleItemDiscount ? 'YES' : 'NO'}
                  onChange={(event) =>
                    onChange('allowSaleItemDiscount', event.target.value === 'YES')
                  }
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                >
                  <option value="YES">PERMITE INFORMAR DESCONTO</option>
                  <option value="NO">NÃO EXIBE DESCONTO NO GRID</option>
                </select>
              </label>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => setIsConfirmationOpen(true)}
            disabled={isSaving}
            className="rounded-2xl bg-emerald-600 px-5 py-2 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isSaving ? 'Salvando...' : 'Salvar filial'}
          </button>
        </div>
      </div>

      {isConfirmationOpen ? (
        <div
          data-system-message-ignore
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-5 backdrop-blur-sm"
        >
          <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-white">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-100">
                Confirmação
              </div>
              <h3 className="mt-1 text-2xl font-black">Salvar parâmetros da filial?</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm font-semibold leading-6 text-slate-600">
                Confirme a gravação das configurações de estoque e regras comerciais da filial{' '}
                <span className="font-black text-slate-900">{form.branchCode} - {form.name}</span>.
              </p>
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                A alteração será enviada ao sistema de origem e aplicada para esta filial.
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsConfirmationOpen(false)}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmationOpen(false);
                  onSave();
                }}
                className="rounded-2xl bg-emerald-600 px-5 py-2 text-sm font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
              >
                Confirmar e salvar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function EmbeddedBranchesGrid({
  company,
  branches,
  isLoading,
  error,
  brandingName,
  brandingLogoUrl,
  onEdit,
}: {
  company: CompanyItem | null;
  branches: CompanyBranchItem[];
  isLoading: boolean;
  error: string | null;
  brandingName: string;
  brandingLogoUrl: string | null;
  onEdit: (branch: CompanyBranchItem) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
  const [columnFilters, setColumnFilters] = useState<Record<BranchGridColumnKey, string>>({
    ...EMPTY_BRANCH_GRID_FILTERS,
  });
  const [filterDrafts, setFilterDrafts] = useState<Record<BranchGridColumnKey, string>>({
    ...EMPTY_BRANCH_GRID_FILTERS,
  });
  const [activeFilterColumn, setActiveFilterColumn] = useState<BranchGridColumnKey | null>(null);
  const [sort, setSort] = useState<BranchGridSort>({ key: null, direction: 'ASC' });
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<BranchGridColumnKey, boolean>>(
    () => buildDefaultExportColumns(BRANCH_GRID_COLUMNS),
  );

  const normalize = (value: string | number | boolean | null | undefined) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();

  const getValue = (branch: CompanyBranchItem, key: BranchGridColumnKey) => {
    const column = BRANCH_GRID_COLUMNS.find((item) => item.key === key);
    return column ? column.getValue(branch) : '';
  };

  const displayedBranches = useMemo(() => {
    const filtered = branches.filter((branch) => {
      const isActive = branch.isActive !== false;
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'INACTIVE' && isActive) return false;
      return BRANCH_GRID_COLUMNS.every((column) => {
        const filter = normalize(columnFilters[column.key]);
        return !filter || normalize(getValue(branch, column.key)).includes(filter);
      });
    });

    if (!sort.key) return filtered;
    const direction = sort.direction === 'DESC' ? -1 : 1;
    return [...filtered].sort((left, right) =>
      normalize(getValue(left, sort.key as BranchGridColumnKey)).localeCompare(
        normalize(getValue(right, sort.key as BranchGridColumnKey)),
        'pt-BR',
        { numeric: true, sensitivity: 'base' },
      ) * direction,
    );
  }, [branches, columnFilters, sort, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(displayedBranches.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedBranches = useMemo(
    () => displayedBranches.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, displayedBranches, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [columnFilters, pageSize, sort, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const clearFilters = () => {
    setColumnFilters({ ...EMPTY_BRANCH_GRID_FILTERS });
    setFilterDrafts({ ...EMPTY_BRANCH_GRID_FILTERS });
    setSort({ key: null, direction: 'ASC' });
    setStatusFilter('ACTIVE');
    setActiveFilterColumn(null);
  };

  const hasFilters =
    statusFilter !== 'ACTIVE' || Boolean(sort.key) || Object.values(columnFilters).some(Boolean);

  const renderHeader = (column: GridColumnDefinition<CompanyBranchItem, BranchGridColumnKey>, index: number) => (
    <div className="flex items-center gap-1.5">
      {index === 0 ? (
        <button
          type="button"
          onClick={clearFilters}
          title="Limpar filtros"
          aria-label="Limpar filtros"
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs transition ${
            hasFilters
              ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
          }`}
        >
          ×
        </button>
      ) : null}
      <GridColumnFilterHeader
        label={column.label}
        isOpen={activeFilterColumn === column.key}
        isActive={Boolean(columnFilters[column.key]) || sort.key === column.key}
        filterValue={filterDrafts[column.key]}
        placeholder={`FILTRAR ${column.label.toUpperCase()}`}
        sortDirection={sort.key === column.key ? sort.direction : null}
        onToggle={() => {
          setFilterDrafts((current) => ({ ...current, [column.key]: columnFilters[column.key] }));
          setActiveFilterColumn((current) => (current === column.key ? null : column.key));
        }}
        onSort={(direction) => {
          setSort({ key: column.key, direction });
          setActiveFilterColumn(null);
        }}
        onFilterValueChange={(value) =>
          setFilterDrafts((current) => ({ ...current, [column.key]: value }))
        }
        onApply={() => {
          setColumnFilters((current) => ({ ...current, [column.key]: filterDrafts[column.key] }));
          setActiveFilterColumn(null);
        }}
        onClear={() => {
          setFilterDrafts((current) => ({ ...current, [column.key]: '' }));
          setColumnFilters((current) => ({ ...current, [column.key]: '' }));
          setActiveFilterColumn(null);
        }}
      />
    </div>
  );

  return (
    <>
      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} flex min-h-[520px] flex-col overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            Filiais da empresa
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {company?.name || brandingName} · {isLoading ? 'Carregando...' : `${displayedBranches.length} filial(is)`}
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Use Alterar para configurar o estoque e a classificação da filial.
          </p>
        </div>

        {error ? (
          <div className="m-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[1080px] w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 z-20 bg-slate-50 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 shadow-[0_1px_0_rgba(226,232,240,1)]">
              <tr>
                {BRANCH_GRID_COLUMNS.map((column, index) => (
                  <th key={column.key} className="px-4 py-3">
                    {renderHeader(column, index)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
              {activeFilterColumn ? (
                <tr aria-hidden="true">
                  <th colSpan={BRANCH_GRID_COLUMNS.length + 1} className="h-44 bg-white p-0" />
                </tr>
              ) : null}
            </thead>
            <tbody>
              {paginatedBranches.map((branch, index) => {
                const isActive = branch.isActive !== false;
                const zebraClass = isActive
                  ? index % 2 ? 'bg-slate-200/70' : 'bg-white'
                  : index % 2 ? 'bg-rose-200/70' : 'bg-rose-100/80';

                return (
                  <tr key={branch.id} className={`border-t border-slate-100 transition hover:bg-blue-50 ${zebraClass}`}>
                    <td className="px-4 py-4 font-black text-slate-900">{branch.branchCode}</td>
                    <td className="px-4 py-4 font-black text-slate-900">{branch.name}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-2 font-bold">
                        <span
                          className={`h-3 w-3 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          title={isActive ? 'ATIVO' : 'INATIVO'}
                          aria-label={isActive ? 'ATIVO' : 'INATIVO'}
                        />
                        {isActive ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td className="px-4 py-4">{getInventoryControlTypeLabel(branch.inventoryControlType)}</td>
                    <td className="px-4 py-4">{getQuantityPrecisionLabel(branch.quantityPrecision)}</td>
                    <td className="px-4 py-4 font-black text-slate-800">
                      {branch.stockClassificationMode === 'GROUP_AND_SUBGROUP' ? 'GRUPO + SUBGRUPO' : 'GRUPO'}
                    </td>
                    <td className="px-4 py-4">{branch.isDefault ? 'SIM' : 'NÃO'}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => onEdit(branch)}
                        title={`Alterar filial ${branch.name}`}
                        aria-label={`Alterar filial ${branch.name}`}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-blue-700"
                      >
                        Alterar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && !paginatedBranches.length ? (
                <tr>
                  <td colSpan={BRANCH_GRID_COLUMNS.length + 1} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhuma filial encontrada para os filtros atuais.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <GridStandardFooter
        statusFilter={statusFilter}
        totalRecords={displayedBranches.length}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onExport={() => setIsExportOpen(true)}
        onStatusFilterChange={setStatusFilter}
        onPageSizeChange={setPageSize}
        onPageChange={setPage}
      >
        <ScreenNameCopy
          screenId="PRINCIPAL_FINANCEIRO_EMPRESA_FILIAIS"
          className="justify-end"
          auditText={`Grid de filiais da empresa ${company?.name || brandingName}. Os filtros e a ordenação são aplicados localmente sobre as filiais sincronizadas da empresa logada.`}
          sqlText="SELECT * FROM company_branches WHERE companyId = :companyId ORDER BY branchCode;"
        />
      </GridStandardFooter>

      <GridExportModal
        isOpen={isExportOpen}
        title="Exportar filiais"
        description={`A exportação considera ${displayedBranches.length} filial(is) dos filtros atuais.`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={BRANCH_GRID_COLUMNS}
        selectedColumns={exportColumns}
        storageKey={`financeiro:empresa-filiais:export:${company?.id || 'default'}`}
        brandingName={brandingName}
        brandingLogoUrl={brandingLogoUrl}
        screenId="PRINCIPAL_FINANCEIRO_EMPRESA_FILIAIS"
        onClose={() => setIsExportOpen(false)}
        onExport={async (config) => {
          const orderedColumns = config.orderedColumns
            .map((key) => BRANCH_GRID_COLUMNS.find((column) => column.key === key))
            .filter((column): column is GridColumnDefinition<CompanyBranchItem, BranchGridColumnKey> => Boolean(column));
          await exportGridRows({
            rows: displayedBranches,
            columns: orderedColumns.length ? orderedColumns : BRANCH_GRID_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            fileBaseName: 'filiais-empresa',
            branding: {
              title: 'Filiais da empresa',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: brandingName,
              logoUrl: brandingLogoUrl,
            },
            pdfOptions: config.pdfOptions,
          });
          setExportColumns(config.selectedColumns);
          setIsExportOpen(false);
        }}
      />
    </>
  );
}

export default function FinanceiroEmpresasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [companyStatusFilter, setCompanyStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
  const [companyColumnFilters, setCompanyColumnFilters] = useState<CompanyColumnFilters>({
    ...EMPTY_COMPANY_COLUMN_FILTERS,
  });
  const [companyColumnFilterDrafts, setCompanyColumnFilterDrafts] = useState<CompanyColumnFilters>({
    ...EMPTY_COMPANY_COLUMN_FILTERS,
  });
  const [activeCompanyFilterColumn, setActiveCompanyFilterColumn] =
    useState<CompanyGridColumnKey | null>(null);
  const [companyGridSort, setCompanyGridSort] = useState<CompanyGridSort>({
    ...DEFAULT_COMPANY_GRID_SORT,
  });
  const [companyPageSize, setCompanyPageSize] = useState(10);
  const [companyPage, setCompanyPage] = useState(1);
  const [selectedCompanyGridRowId, setSelectedCompanyGridRowId] = useState<string | null>(null);
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
  const [branchCompany, setBranchCompany] = useState<CompanyItem | null>(null);
  const [branches, setBranches] = useState<CompanyBranchItem[]>([]);
  const [branchForm, setBranchForm] = useState<CompanyBranchFormState>(emptyBranchForm);
  const [branchFormError, setBranchFormError] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isSavingBranch, setIsSavingBranch] = useState(false);
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
  const hasCompanyGridFilters = useMemo(
    () =>
      Boolean(search.trim()) ||
      COMPANY_GRID_COLUMNS.some((column) => Boolean(companyColumnFilters[column.key].trim())) ||
      Boolean(companyGridSort.key),
    [companyColumnFilters, companyGridSort.key, search],
  );
  const displayedCompanies = useMemo(() => {
    const statusFilteredCompanies = companies.filter((company) => {
      if (companyStatusFilter === 'ALL') {
        return true;
      }

      return company.status === companyStatusFilter;
    });
    const columnFilteredCompanies = statusFilteredCompanies.filter((company) =>
      matchesCompanyColumnFilters(company, companyColumnFilters),
    );

    if (!companyGridSort.key) {
      return columnFilteredCompanies;
    }

    const directionMultiplier = companyGridSort.direction === 'DESC' ? -1 : 1;
    return [...columnFilteredCompanies].sort(
      (left, right) =>
        compareCompanyGridValues(
          getCompanyGridFilterValue(left, companyGridSort.key as CompanyGridColumnKey),
          getCompanyGridFilterValue(right, companyGridSort.key as CompanyGridColumnKey),
        ) * directionMultiplier,
    );
  }, [companies, companyColumnFilters, companyGridSort.direction, companyGridSort.key, companyStatusFilter]);
  const companyTotalPages = Math.max(1, Math.ceil(displayedCompanies.length / companyPageSize));
  const currentCompanyPage = Math.min(companyPage, companyTotalPages);
  const paginatedCompanies = useMemo(
    () =>
      displayedCompanies.slice(
        (currentCompanyPage - 1) * companyPageSize,
        currentCompanyPage * companyPageSize,
      ),
    [currentCompanyPage, displayedCompanies, companyPageSize],
  );
  const embeddedSingleCompany = runtimeContext.embedded && companies.length === 1;
  const embeddedCompany = embeddedSingleCompany ? companies[0] : null;

  const loadCompanies = useCallback(async (currentSearch?: string) => {
    // Quando a tela está embarcada, o gateway do Financeiro já conhece a
    // empresa/filial a partir da sessão do host e canonicaliza esse contexto
    // no backend. Não bloqueie a consulta apenas porque o endpoint visual
    // /context ainda não terminou (ou foi abortado durante a navegação).
    if (!runtimeTenantReady && !runtimeContext.embedded) {
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
    setCompanyPage(1);
  }, [
    companyColumnFilters,
    companyGridSort.direction,
    companyGridSort.key,
    companyPageSize,
    companyStatusFilter,
    search,
  ]);

  useEffect(() => {
    if (companyPage > companyTotalPages) {
      setCompanyPage(companyTotalPages);
    }
  }, [companyPage, companyTotalPages]);

  useEffect(() => {
    if (!runtimeContext.embedded || isLoading || companies.length !== 1) {
      return;
    }

    const company = companies[0];
    if (!company || editingCompany?.id === company.id) {
      return;
    }

    // No acesso embarcado pelo card Empresa, carregue o grid das filiais. A
    // edição dos parâmetros abre somente quando o usuário aciona Alterar.
    void loadBranches(company);
  }, [companies, isLoading, runtimeContext.embedded]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCompanies(search);
  }

  function clearAllCompanyGridFilters() {
    setSearch('');
    setCompanyColumnFilters({ ...EMPTY_COMPANY_COLUMN_FILTERS });
    setCompanyColumnFilterDrafts({ ...EMPTY_COMPANY_COLUMN_FILTERS });
    setCompanyGridSort({ ...DEFAULT_COMPANY_GRID_SORT });
    setActiveCompanyFilterColumn(null);
    void loadCompanies();
  }

  function openCompanyColumnFilter(columnKey: CompanyGridColumnKey) {
    setCompanyColumnFilterDrafts((current) => ({
      ...current,
      [columnKey]: companyColumnFilters[columnKey],
    }));
    setActiveCompanyFilterColumn((current) => (current === columnKey ? null : columnKey));
  }

  function applyCompanyColumnFilter(columnKey: CompanyGridColumnKey) {
    setCompanyColumnFilters((current) => ({
      ...current,
      [columnKey]: companyColumnFilterDrafts[columnKey].trim(),
    }));
    setActiveCompanyFilterColumn(null);
  }

  function clearCompanyColumnFilter(columnKey: CompanyGridColumnKey) {
    setCompanyColumnFilters((current) => ({
      ...current,
      [columnKey]: '',
    }));
    setCompanyColumnFilterDrafts((current) => ({
      ...current,
      [columnKey]: '',
    }));
    setActiveCompanyFilterColumn(null);
  }

  function renderCompanyClearAllButton() {
    return (
      <button
        type="button"
        onClick={clearAllCompanyGridFilters}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
          hasCompanyGridFilters
            ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
        }`}
        title="Limpar todos os filtros"
        aria-label="Limpar todos os filtros"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l3 3m0-3-3 3" />
        </svg>
      </button>
    );
  }

  function renderCompanyColumnHeader(
    column: GridColumnDefinition<CompanyItem, CompanyGridColumnKey>,
    columnIndex: number,
  ) {
    const isActive =
      Boolean(companyColumnFilters[column.key].trim()) || companyGridSort.key === column.key;

    return (
      <div className="flex items-center gap-1.5">
        {columnIndex === 0 ? renderCompanyClearAllButton() : null}
        <GridColumnFilterHeader
          label={column.label}
          isOpen={activeCompanyFilterColumn === column.key}
          isActive={isActive}
          filterValue={companyColumnFilterDrafts[column.key]}
          placeholder={`DIGITE ${column.label.toUpperCase()}`}
          align={
            ['receivableTitleCount', 'installmentCount', 'cashSessionCount', 'createdAt'].includes(
              column.key,
            )
              ? 'right'
              : 'left'
          }
          sortDirection={companyGridSort.key === column.key ? companyGridSort.direction : null}
          onToggle={() => openCompanyColumnFilter(column.key)}
          onSort={(direction) => {
            setCompanyGridSort({ key: column.key, direction });
            setActiveCompanyFilterColumn(null);
          }}
          onFilterValueChange={(value) =>
            setCompanyColumnFilterDrafts((current) => ({
              ...current,
              [column.key]: value,
            }))
          }
          onApply={() => applyCompanyColumnFilter(column.key)}
          onClear={() => clearCompanyColumnFilter(column.key)}
        />
      </div>
    );
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

  async function loadBranches(company: CompanyItem) {
    try {
      setIsLoadingBranches(true);
      setBranchFormError(null);
      const response = await getJson<CompanyBranchItem[]>(
        `/companies/${company.id}/branches${buildFinanceApiQueryString(runtimeContext)}`,
      );
      setBranches(response);
      if (response.length && !branchForm.id) {
        setBranchForm(buildBranchForm(response[0]));
      }
    } catch (currentError) {
      setBranches([]);
      setBranchFormError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar as filiais da empresa.',
        ),
      );
    } finally {
      setIsLoadingBranches(false);
    }
  }

  function openBranchSettings(company: CompanyItem) {
    setBranchCompany(company);
    setBranchForm(emptyBranchForm);
    setBranchFormError(null);
    void loadBranches(company);
  }

  function closeBranchSettings() {
    setBranchCompany(null);
    setBranchForm(emptyBranchForm);
    setBranchFormError(null);
    setIsSavingBranch(false);
  }

  async function handleSaveBranch() {
    if (!branchCompany) {
      return;
    }

    if (!branchForm.id) {
      setBranchFormError(
        'A filial deve ser cadastrada e sincronizada pelo sistema de origem.',
      );
      return;
    }

    try {
      setIsSavingBranch(true);
      setBranchFormError(null);
      const payload = {
        requestedBy:
          runtimeContext.cashierUserId || runtimeContext.sourceTenantId || runtimeContext.companyName || 'FINANCEIRO_EMPRESAS',
        inventoryControlType: branchForm.inventoryControlType,
        quantityPrecision: branchForm.quantityPrecision,
        stockClassificationMode: branchForm.stockClassificationMode,
        allowSaleUnitPriceEdit: branchForm.allowSaleUnitPriceEdit,
        allowSaleItemDiscount: branchForm.allowSaleItemDiscount,
      };

      const endpoint = `/companies/${branchCompany.id}/branches/${branchForm.id}${buildFinanceApiQueryString(
        runtimeContext,
      )}`;

      const savedBranch = await requestJson<CompanyBranchItem>(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(payload),
        fallbackMessage: 'Não foi possível salvar os parâmetros da filial.',
      });

      await loadBranches(branchCompany);
      setBranchForm(buildBranchForm(savedBranch));
      setStatusMessage('Parâmetros de estoque da filial atualizados com sucesso.');
    } catch (currentError) {
      setBranchFormError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível salvar os parâmetros da filial.',
        ),
      );
    } finally {
      setIsSavingBranch(false);
    }
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
              runtimeContext.cashierUserId || runtimeContext.sourceTenantId || runtimeContext.companyName || 'FINANCEIRO_EMPRESAS',
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
  const embeddedParentCompanyScreenId = showEmbeddedSuccess
    ? EMBEDDED_COMPANY_SUCCESS_SCREEN_ID
    : EMBEDDED_PARENT_COMPANY_SCREEN_ID;
  const empresasAuditContext = useMemo(() => {
    const auditParams: EmpresasAuditParams = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      companyName: embeddedCompany?.name || companies[0]?.name,
      search,
      displayedRowsCount: displayedCompanies.length,
    };

    return {
      auditText: buildEmpresasAuditText(auditParams),
      sqlText: buildEmpresasAuditSql(auditParams),
    };
  }, [
    companies,
    displayedCompanies.length,
    embeddedCompany?.name,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    search,
  ]);
  const successCompanyName =
    editingCompany?.name || embeddedCompany?.name || runtimeContext.companyName || 'ESCOLA';

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') {
      return;
    }

    postMessageToTrustedParent({
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: embeddedParentCompanyScreenId,
        originText: EMPRESAS_ORIGIN_TEXT,
        auditText: empresasAuditContext.auditText,
        sqlText: empresasAuditContext.sqlText,
      });
  }, [
    embeddedParentCompanyScreenId,
    empresasAuditContext.auditText,
    empresasAuditContext.sqlText,
    runtimeContext.embedded,
  ]);

  function handleReturnAfterSave() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = withFinanceBasePath('/');
  }

  const embeddedSuccessPopup =
    runtimeContext.embedded && showEmbeddedSuccess ? (
      <div className="absolute inset-0 z-[90] flex items-center justify-center bg-slate-900/20 p-6">
        <section className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-[#166534] via-[#15803d] to-[#22c55e] px-4 py-5 text-white">
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
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Cadastro operacional</div>
                <h1 className="mt-1 text-2xl font-black tracking-tight">Empresas</h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                  Cada empresa é criada automaticamente a partir do sistema de origem e passa a operar no mesmo núcleo financeiro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.location.href = withFinanceBasePath('/');
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
          <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1fr_auto_auto]">
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

      {runtimeContext.embedded ? (
        <EmbeddedBranchesGrid
          company={embeddedCompany}
          branches={branches}
          isLoading={isLoadingBranches || isLoading}
          error={branchFormError}
          brandingName={runtimeContext.companyName || embeddedCompany?.name || 'FINANCEIRO'}
          brandingLogoUrl={runtimeContext.logoUrl}
          onEdit={(branch) => {
            if (!embeddedCompany) return;
            setBranchCompany(embeddedCompany);
            setBranchForm(buildBranchForm(branch));
            setBranchFormError(null);
          }}
        />
      ) : null}

      {!runtimeContext.embedded ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} flex h-[calc(100vh-19rem)] min-h-[540px] flex-col overflow-hidden`}>
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Empresas</div>
            <h2 className="mt-1 text-xl font-black text-slate-900">
              {isLoading ? 'Carregando...' : `${displayedCompanies.length} empresa(s) encontrada(s)`}
            </h2>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="sticky top-0 z-20 bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 shadow-[0_1px_0_rgba(226,232,240,1)]">
                <tr>
                  {visibleCompanyColumns.map((column, columnIndex) => (
                    <th key={column.key} className="px-4 py-3">
                      {renderCompanyColumnHeader(column, columnIndex)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
                {activeCompanyFilterColumn ? (
                  <tr aria-hidden="true">
                    <th colSpan={visibleCompanyColumns.length + 1} className="h-44 bg-white p-0" />
                  </tr>
                ) : null}
              </thead>
              <tbody>
                {paginatedCompanies.map((item, companyIndex) => {
                  const isSelected = selectedCompanyGridRowId === item.id;
                  const zebraClass =
                    item.status === 'ACTIVE'
                      ? companyIndex % 2
                        ? 'bg-slate-200/70'
                        : 'bg-white'
                      : companyIndex % 2
                        ? 'bg-rose-200/70'
                        : 'bg-rose-100/80';

                  return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedCompanyGridRowId(item.id)}
                    aria-selected={isSelected}
                    className={`cursor-pointer border-t border-slate-100 transition hover:bg-blue-50 ${
                      isSelected ? 'bg-blue-100 ring-2 ring-inset ring-blue-300' : zebraClass
                    }`}
                  >
                    {visibleCompanyColumns.map((column) => (
                      <td key={column.key} className="px-4 py-4">
                        {column.key === 'name' ? (
                          <div>
                            <div className="flex items-center gap-2 font-black text-slate-900">
                              <span
                                className={`h-3 w-3 shrink-0 rounded-full ${
                                  item.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                                title={getCompanyStatusLabel(item.status)}
                                aria-label={getCompanyStatusLabel(item.status)}
                              />
                              <span>{item.name}</span>
                            </div>
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
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openFinancialSettings(item)}
                          title="Alterar financeiro"
                          aria-label="Alterar financeiro"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition hover:bg-blue-100 hover:text-blue-800"
                        >
                          <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.4-9.4a2 2 0 1 1 2.8 2.8L11.8 15H9v-2.8l8.6-8.6z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => openBranchSettings(item)}
                          title="Filiais e estoque"
                          aria-label="Filiais e estoque"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
                        >
                          <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}

                {!isLoading && !displayedCompanies.length ? (
                  <tr>
                    <td colSpan={visibleCompanyColumns.length + 1 || 1} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
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

      {!runtimeContext.embedded ? (
        <GridStandardFooter
          statusFilter={companyStatusFilter}
          totalRecords={displayedCompanies.length}
          pageSize={companyPageSize}
          currentPage={currentCompanyPage}
          totalPages={companyTotalPages}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onStatusFilterChange={setCompanyStatusFilter}
          onPageSizeChange={setCompanyPageSize}
          onPageChange={setCompanyPage}
        >
          <ScreenNameCopy
            screenId={embeddedCompanyScreenId}
            className="justify-end"
            auditText={empresasAuditContext.auditText}
            sqlText={empresasAuditContext.sqlText}
          />
        </GridStandardFooter>
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
      <CompanyBranchSettingsModal
        isOpen={Boolean(branchCompany)}
        company={branchCompany}
        branches={branches}
        form={branchForm}
        isLoading={isLoadingBranches}
        isSaving={isSavingBranch}
        error={branchFormError}
        onClose={closeBranchSettings}
        onEdit={(branch) => setBranchForm(buildBranchForm(branch))}
        onChange={(field, value) => {
          setBranchForm((current) => ({
            ...current,
            [field]: value,
          }));
        }}
        onSave={() => {
          void handleSaveBranch();
        }}
      />
      <GridExportModal
        isOpen={isExportModalOpen}
        title="Exportar empresas"
        description={`A exportação respeita a busca atual e inclui ${displayedCompanies.length} registro(s).`}
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
            rows: displayedCompanies,
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
