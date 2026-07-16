'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
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
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  type BranchStockParameterMode,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type ProductItem = {
  id: string;
  companyId: string;
  companyName?: string | null;
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  status: string;
  name: string;
  internalCode?: string | null;
  sku?: string | null;
  barcode?: string | null;
  unitCode: string;
  productType: string;
  tracksInventory: boolean;
  allowFraction: boolean;
  usesColorSize: boolean;
  usesLotControl: boolean;
  usesExpirationControl?: boolean;
  allowsNegativeStock?: boolean;
  currentStock: number;
  minimumStock: number;
  purchasePrice?: number | null;
  salePrice?: number | null;
  ncmCode?: string | null;
  cestCode?: string | null;
  notes?: string | null;
  inventorySituation: 'OK' | 'LOW' | 'OUT' | 'WITHOUT_CONTROL';
  createdAt: string;
  updatedAt: string;
  canceledAt?: string | null;
};

type CompanyItem = {
  id: string;
  name: string;
};

type BranchInventoryConfig = {
  id?: string;
  branchCode: number;
  name?: string;
  inventoryControlType: 'TRADITIONAL' | 'COLOR_SIZE' | 'LOT';
  quantityPrecision: 'INTEGER_ONLY' | 'DECIMAL_ALLOWED' | 'PRODUCT_DEFINED';
  stockControlMode: BranchStockParameterMode;
  stockIntegerQuantityMode: BranchStockParameterMode;
  stockLotControlMode: BranchStockParameterMode;
  stockExpirationControlMode: BranchStockParameterMode;
  stockGridControlMode: BranchStockParameterMode;
  stockNegativeControlMode: BranchStockParameterMode;
};

type ProductFormState = {
  id: string | null;
  name: string;
  internalCode: string;
  sku: string;
  barcode: string;
  unitCode: string;
  productType: string;
  tracksInventory: boolean;
  allowFraction: boolean;
  usesColorSize: boolean;
  usesLotControl: boolean;
  usesExpirationControl: boolean;
  allowsNegativeStock: boolean;
  currentStock: string;
  minimumStock: string;
  purchasePrice: string;
  salePrice: string;
  ncmCode: string;
  cestCode: string;
  notes: string;
};

type ManualStockMovementState = {
  product: ProductItem;
  movementType: 'ENTRY' | 'EXIT';
  operationId: string;
  quantity: string;
  notes: string;
  colorName: string;
  sizeCode: string;
  lotNumber: string;
  lotExpirationDate: string;
};

type ManualStockMovementResponse = {
  id: string;
  previousStock: number;
  resultingStock: number;
  message?: string;
};

type ProductGridColumnKey =
  | 'name'
  | 'internalCode'
  | 'sku'
  | 'unitCode'
  | 'productType'
  | 'stock'
  | 'updatedAt';

type ProductExportColumnKey =
  | ProductGridColumnKey
  | 'barcode'
  | 'purchasePrice'
  | 'salePrice'
  | 'minimumStock'
  | 'notes'
  | 'createdAt'
  | 'status';

type ProductGridConfig = {
  order: ProductGridColumnKey[];
  hidden: ProductGridColumnKey[];
};

type ProductGridFilterKey = 'name' | 'internalCode';
type ProductGridSortDirection = 'ASC' | 'DESC';
type ProductGridSort = {
  key: ProductGridFilterKey | null;
  direction: ProductGridSortDirection;
};
type ProductColumnFilters = Record<ProductGridFilterKey, string>;
type ProductFormTab = 'IDENTIFICATION' | 'CLASSIFICATION' | 'STOCK_PRICES' | 'FISCAL';

const PRODUCT_SCREEN_ID = 'FINANCEIRO_PRODUTOS_LISTAGEM_GERAL';
const EMBEDDED_PRODUCT_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_ESTOQUE';
const PRODUCT_FORM_POPUP_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_ESTOQUE_CADASTRO_PRODUTO';
const MANUAL_STOCK_ENTRY_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_ESTOQUE_ENTRADA_MANUAL';
const MANUAL_STOCK_EXIT_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_ESTOQUE_SAIDA_MANUAL';
const PRODUCT_FORM_TABS: Array<{ value: ProductFormTab; label: string }> = [
  { value: 'IDENTIFICATION', label: 'Identificação' },
  { value: 'CLASSIFICATION', label: 'Classificação' },
  { value: 'STOCK_PRICES', label: 'Estoque e valores' },
  { value: 'FISCAL', label: 'Fiscal e observações' },
];
const PRODUCT_GRID_STORAGE_PREFIX = 'financeiro:produtos:grid-columns:';
const PRODUCT_EXPORT_STORAGE_PREFIX = 'financeiro:produtos:export-config:';
const PRODUCT_GRID_FILTER_KEYS: ProductGridFilterKey[] = ['name', 'internalCode'];
const DEFAULT_PRODUCT_COLUMN_FILTERS: ProductColumnFilters = {
  name: '',
  internalCode: '',
};
const DEFAULT_PRODUCT_GRID_SORT: ProductGridSort = {
  key: null,
  direction: 'ASC',
};
const productFilterInputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500';

const PRODUCT_GRID_COLUMNS: GridColumnDefinition<ProductItem, ProductGridColumnKey>[] = [
  { key: 'name', label: 'Produto', getValue: (item) => item.name },
  { key: 'internalCode', label: 'Código interno', getValue: (item) => item.internalCode || '---' },
  { key: 'sku', label: 'SKU', getValue: (item) => item.sku || '---' },
  { key: 'unitCode', label: 'Unidade', getValue: (item) => item.unitCode || 'UN' },
  {
    key: 'productType',
    label: 'Tipo',
    getValue: (item) => getProductTypeLabel(item.productType),
  },
  {
    key: 'stock',
    label: 'Estoque',
    getValue: (item) =>
      item.tracksInventory
        ? `${formatStock(item.currentStock, item.allowFraction)} / mín ${formatStock(
            item.minimumStock,
            item.allowFraction,
          )}`
        : 'SEM CONTROLE',
  },
  {
    key: 'updatedAt',
    label: 'Atualizado em',
    getValue: (item) => formatDateLabel(item.updatedAt),
  },
];

const PRODUCT_EXPORT_COLUMNS: GridColumnDefinition<ProductItem, ProductExportColumnKey>[] = [
  { key: 'name', label: 'Produto', getValue: (item) => item.name },
  { key: 'internalCode', label: 'Código interno', getValue: (item) => item.internalCode || '---' },
  { key: 'sku', label: 'SKU', getValue: (item) => item.sku || '---' },
  { key: 'barcode', label: 'Código de barras', getValue: (item) => item.barcode || '---' },
  { key: 'unitCode', label: 'Unidade', getValue: (item) => item.unitCode || 'UN' },
  {
    key: 'productType',
    label: 'Tipo',
    getValue: (item) => getProductTypeLabel(item.productType),
  },
  {
    key: 'stock',
    label: 'Estoque atual',
    getValue: (item) =>
      item.tracksInventory ? formatStock(item.currentStock, item.allowFraction) : 'SEM CONTROLE',
  },
  {
    key: 'minimumStock',
    label: 'Estoque mínimo',
    getValue: (item) =>
      item.tracksInventory ? formatStock(item.minimumStock, item.allowFraction) : '---',
  },
  {
    key: 'purchasePrice',
    label: 'Custo',
    getValue: (item) => formatCurrency(item.purchasePrice),
  },
  {
    key: 'salePrice',
    label: 'Venda',
    getValue: (item) => formatCurrency(item.salePrice),
  },
  {
    key: 'status',
    label: 'Situação',
    getValue: (item) => (item.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'),
  },
  { key: 'createdAt', label: 'Criado em', getValue: (item) => formatDateLabel(item.createdAt) },
  { key: 'updatedAt', label: 'Atualizado em', getValue: (item) => formatDateLabel(item.updatedAt) },
  { key: 'notes', label: 'Observações', getValue: (item) => item.notes || '---' },
];

const DEFAULT_PRODUCT_GRID_CONFIG: ProductGridConfig = {
  order: PRODUCT_GRID_COLUMNS.map((column) => column.key),
  hidden: ['sku', 'productType', 'updatedAt'],
};

const emptyFormState: ProductFormState = {
  id: null,
  name: '',
  internalCode: '',
  sku: '',
  barcode: '',
  unitCode: 'UN',
  productType: 'GOODS',
  tracksInventory: true,
  allowFraction: false,
  usesColorSize: false,
  usesLotControl: false,
  usesExpirationControl: false,
  allowsNegativeStock: true,
  currentStock: '0',
  minimumStock: '0',
  purchasePrice: '',
  salePrice: '',
  ncmCode: '',
  cestCode: '',
  notes: '',
};

const screenAuditText = `--- LOGICA DA TELA ---
Esta tela lista e mantém o cadastro base de produtos do Financeiro, preparado para estoque e vínculo futuro com notas fiscais.

TABELAS PRINCIPAIS:
- products (PR) - cadastro base de produtos compartilhados por empresa financeira.
- companies (CO) - empresa financeira dona do cadastro, resolvida por sourceSystem + sourceTenantId.

RELACIONAMENTOS:
- products.companyId -> companies.id

METRICAS / CAMPOS EXIBIDOS:
- nome do produto
- código interno
- sku
- unidade
- tipo do produto
- estoque atual
- estoque mínimo
- situação cadastral
- data da última atualização

FILTROS APLICADOS AGORA:
- companyId obrigatório pelo tenant informado
- status opcional: ACTIVE | INACTIVE | ALL
- nome do produto opcional por coluna
- código interno opcional por coluna

ORDENACAO:
- order by products.name asc

SQL BASE:
SELECT
  PR.id,
  PR.name,
  PR.internalCode,
  PR.sku,
  PR.barcode,
  PR.unitCode,
  PR.productType,
  PR.tracksInventory,
  PR.allowFraction,
  PR.currentStock,
  PR.minimumStock,
  PR.purchasePrice,
  PR.salePrice,
  PR.status,
  PR.updatedAt,
  CO.name AS companyName
FROM products PR
INNER JOIN companies CO ON CO.id = PR.companyId
WHERE PR.companyId = :companyId
  AND (:status = 'ALL' OR PR.status = :status)
  AND (:nameFilter IS NULL OR PR.name LIKE :nameFilter)
  AND (:internalCodeFilter IS NULL OR PR.internalCode LIKE :internalCodeFilter)
ORDER BY PR.name ASC;`;

type ProductAuditParams = {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  companyName?: string | null;
  quickSearch: string;
  nameFilter: string;
  internalCodeFilter: string;
  sortKey: ProductGridFilterKey | null;
  sortDirection: ProductGridSortDirection;
  status: 'ACTIVE' | 'ALL' | 'INACTIVE';
  displayedRowsCount: number;
};

function buildProductAuditSql(params: ProductAuditParams) {
  const quickSearch = params.quickSearch.trim().toUpperCase();
  const nameFilter = params.nameFilter.trim().toUpperCase();
  const internalCodeFilter = params.internalCodeFilter.trim().toUpperCase();
  const status = String(params.status || 'ACTIVE').toUpperCase();
  const sortColumn = params.sortKey === 'internalCode' ? 'PR.internalCode' : 'PR.name';
  const sortDirection = params.sortDirection === 'DESC' ? 'DESC' : 'ASC';

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :status = ${toSqlLiteral(status)}
-- :quickSearch = ${toSqlLiteral(quickSearch)}
-- :nameFilter = ${toSqlLiteral(nameFilter)}
-- :internalCodeFilter = ${toSqlLiteral(internalCodeFilter)}
-- :sortColumn = ${toSqlLiteral(sortColumn)}
-- :sortDirection = ${toSqlLiteral(sortDirection)}

SELECT
  PR.id,
  PR.name,
  PR.internalCode,
  PR.sku,
  PR.barcode,
  PR.unitCode,
  PR.productType,
  PR.tracksInventory,
  PR.allowFraction,
  PR.currentStock,
  PR.minimumStock,
  PR.purchasePrice,
  PR.salePrice,
  PR.status,
  PR.updatedAt,
  CO.name AS companyName
FROM products PR
INNER JOIN companies CO ON CO.id = PR.companyId
WHERE CO.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND (
    ${toSqlLiteral(status)} = 'ALL'
    OR PR.status = ${toSqlLiteral(status)}
  )
  AND (
    ${toSqlLiteral(quickSearch)} = ''
    OR UPPER(COALESCE(PR.name, '')) LIKE '%' || UPPER(${toSqlLiteral(quickSearch)}) || '%'
    OR UPPER(COALESCE(PR.internalCode, '')) LIKE '%' || UPPER(${toSqlLiteral(quickSearch)}) || '%'
    OR UPPER(COALESCE(PR.sku, '')) LIKE '%' || UPPER(${toSqlLiteral(quickSearch)}) || '%'
    OR UPPER(COALESCE(PR.barcode, '')) LIKE '%' || UPPER(${toSqlLiteral(quickSearch)}) || '%'
  )
  AND (
    ${toSqlLiteral(nameFilter)} = ''
    OR UPPER(COALESCE(PR.name, '')) LIKE '%' || UPPER(${toSqlLiteral(nameFilter)}) || '%'
  )
  AND (
    ${toSqlLiteral(internalCodeFilter)} = ''
    OR UPPER(COALESCE(PR.internalCode, '')) LIKE '%' || UPPER(${toSqlLiteral(
      internalCodeFilter,
    )}) || '%'
  )
ORDER BY ${sortColumn} ${sortDirection}, PR.name ASC;`;
}

function buildProductAuditText(params: ProductAuditParams) {
  const quickSearch = params.quickSearch.trim().toUpperCase();
  const nameFilter = params.nameFilter.trim().toUpperCase();
  const internalCodeFilter = params.internalCodeFilter.trim().toUpperCase();
  const status = String(params.status || 'ACTIVE').toUpperCase();
  const sortColumn = params.sortKey === 'internalCode' ? 'products.internalCode' : 'products.name';
  const sortDirection = params.sortDirection === 'DESC' ? 'DESC' : 'ASC';

  return `--- LOGICA DA TELA ---
Esta tela lista e mantem o cadastro base de produtos do Financeiro.

TABELAS PRINCIPAIS:
- products (PR) - cadastro base de produtos compartilhados por empresa financeira
- companies (CO) - empresa financeira dona do cadastro, resolvida por sourceSystem + sourceTenantId

RELACIONAMENTOS:
- products.companyId = companies.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId, params.companyName)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- status selecionado (:status): ${status}
- pesquisa rápida por produto, código, SKU ou barras (:quickSearch): ${formatAuditValue(quickSearch)}
- filtro por nome do produto (:nameFilter): ${formatAuditValue(nameFilter)}
- filtro por código interno (:internalCodeFilter): ${formatAuditValue(internalCodeFilter)}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: ${sortColumn} ${sortDirection}

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- CO.sourceSystem e CO.sourceTenantId resolvem a empresa financeira vinculada ao sistema de origem
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

function getProductTypeLabel(value?: string | null) {
  switch (String(value || '').toUpperCase()) {
    case 'SERVICE':
      return 'SERVIÇO';
    case 'INPUT':
      return 'INSUMO';
    case 'CONSUMABLE':
      return 'CONSUMO';
    default:
      return 'MERCADORIA';
  }
}

function getInventorySituationLabel(value: ProductItem['inventorySituation']) {
  switch (value) {
    case 'OK':
      return 'OK';
    case 'LOW':
      return 'BAIXO';
    case 'OUT':
      return 'ZERADO';
    default:
      return 'SEM CONTROLE';
  }
}

function getInventorySituationClass(value: ProductItem['inventorySituation']) {
  switch (value) {
    case 'OK':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'LOW':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'OUT':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

const DEFAULT_BRANCH_INVENTORY_CONFIG: BranchInventoryConfig = {
  branchCode: 1,
  inventoryControlType: 'TRADITIONAL',
  quantityPrecision: 'PRODUCT_DEFINED',
  stockControlMode: 'BY_PRODUCT',
  stockIntegerQuantityMode: 'BY_PRODUCT',
  stockLotControlMode: 'BY_PRODUCT',
  stockExpirationControlMode: 'BY_PRODUCT',
  stockGridControlMode: 'BY_PRODUCT',
  stockNegativeControlMode: 'BY_PRODUCT',
};

function resolveBranchBoolean(
  mode: BranchStockParameterMode,
  productValue: boolean,
) {
  if (mode === 'YES') return true;
  if (mode === 'NO') return false;
  return productValue;
}

function resolveBranchFractionPermission(
  mode: BranchStockParameterMode,
  productAllowsFraction: boolean,
) {
  if (mode === 'YES') return false;
  if (mode === 'NO') return true;
  return productAllowsFraction;
}

function applyBranchInventoryRules(
  form: ProductFormState,
  branch: BranchInventoryConfig,
): ProductFormState {
  return {
    ...form,
    tracksInventory: resolveBranchBoolean(branch.stockControlMode, form.tracksInventory),
    allowFraction: resolveBranchFractionPermission(
      branch.stockIntegerQuantityMode,
      form.allowFraction,
    ),
    usesLotControl: resolveBranchBoolean(branch.stockLotControlMode, form.usesLotControl),
    usesExpirationControl: resolveBranchBoolean(
      branch.stockExpirationControlMode,
      form.usesExpirationControl,
    ),
    usesColorSize: resolveBranchBoolean(branch.stockGridControlMode, form.usesColorSize),
    allowsNegativeStock: resolveBranchBoolean(
      branch.stockNegativeControlMode,
      form.allowsNegativeStock,
    ),
  };
}

function StockParameterButton({
  label,
  value,
  editable,
  enabledText,
  disabledText,
  onToggle,
}: {
  label: string;
  value: boolean;
  editable: boolean;
  enabledText: string;
  disabledText: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!editable}
      className={`rounded-3xl border px-4 py-4 text-left transition ${
        editable ? '' : 'cursor-not-allowed'
      } ${
        value
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-400'
          : `border-rose-300 bg-rose-50 text-rose-800 ${
              editable ? 'hover:border-rose-400 hover:bg-rose-100' : ''
            }`
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-black uppercase tracking-[0.16em]">{label}</div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${
            editable
              ? 'bg-blue-100 text-blue-700'
              : 'border border-slate-200 bg-white text-slate-500'
          }`}
        >
          {editable ? 'NO PRODUTO' : 'NA FILIAL'}
        </span>
      </div>
      <div className="mt-1 text-sm font-medium">{value ? enabledText : disabledText}</div>
      {!editable ? (
        <div className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
          Configuração bloqueada pela filial
        </div>
      ) : null}
    </button>
  );
}

function formatStock(value?: number | null, allowFraction = true) {
  const normalized = Number(value || 0);
  return normalized.toLocaleString('pt-BR', {
    minimumFractionDigits: allowFraction && !Number.isInteger(normalized) ? 2 : 0,
    maximumFractionDigits: allowFraction ? 2 : 0,
  });
}

function formatOptionalNumberInput(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function parseOptionalNumber(value: string) {
  const normalized = String(value || '').trim().replace(',', '.');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Informe apenas valores numéricos iguais ou maiores que zero.');
  }

  return Number(parsed.toFixed(2));
}

function createManualStockOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `manual-stock-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseStockNumber(value: string, allowFraction: boolean) {
  const parsed = parseOptionalNumber(value) ?? 0;
  if (!allowFraction && !Number.isInteger(parsed)) {
    throw new Error('Esta filial trabalha apenas com quantidade inteira.');
  }
  return allowFraction ? parsed : Math.trunc(parsed);
}

function buildProductForm(product: ProductItem): ProductFormState {
  return {
    id: product.id,
    name: product.name,
    internalCode: product.internalCode || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    unitCode: product.unitCode || 'UN',
    productType: product.productType || 'GOODS',
    tracksInventory: Boolean(product.tracksInventory),
    allowFraction: Boolean(product.allowFraction),
    usesColorSize: Boolean(product.usesColorSize),
    usesLotControl: Boolean(product.usesLotControl),
    usesExpirationControl: Boolean(product.usesExpirationControl),
    allowsNegativeStock: Boolean(product.allowsNegativeStock),
    currentStock: formatOptionalNumberInput(product.currentStock),
    minimumStock: formatOptionalNumberInput(product.minimumStock),
    purchasePrice: formatOptionalNumberInput(product.purchasePrice),
    salePrice: formatOptionalNumberInput(product.salePrice),
    ncmCode: product.ncmCode || '',
    cestCode: product.cestCode || '',
    notes: product.notes || '',
  };
}

function getProductGridStorageKey(tenantId: string | null) {
  return `${PRODUCT_GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getProductExportStorageKey(tenantId: string | null) {
  return `${PRODUCT_EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
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

function readStoredProductGridConfig(tenantId: string | null): ProductGridConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_PRODUCT_GRID_CONFIG;
  }

  try {
    const rawValue = window.localStorage.getItem(getProductGridStorageKey(tenantId));
    if (!rawValue) return DEFAULT_PRODUCT_GRID_CONFIG;

    const parsed = JSON.parse(rawValue) as Partial<ProductGridConfig>;
    const validOrder = Array.isArray(parsed.order)
      ? parsed.order.filter((key): key is ProductGridColumnKey =>
          PRODUCT_GRID_COLUMNS.some((column) => column.key === key),
        )
      : [];
    const validHidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((key): key is ProductGridColumnKey =>
          PRODUCT_GRID_COLUMNS.some((column) => column.key === key),
        )
      : [];

    return {
      order: validOrder.length ? validOrder : DEFAULT_PRODUCT_GRID_CONFIG.order,
      hidden: validHidden,
    };
  } catch {
    return DEFAULT_PRODUCT_GRID_CONFIG;
  }
}

function getVisibleProductColumns(config: ProductGridConfig) {
  return config.order
    .map((key) => PRODUCT_GRID_COLUMNS.find((column) => column.key === key))
    .filter((column): column is GridColumnDefinition<ProductItem, ProductGridColumnKey> => Boolean(column))
    .filter((column) => !config.hidden.includes(column.key));
}

function isProductGridFilterKey(value: ProductGridColumnKey): value is ProductGridFilterKey {
  return PRODUCT_GRID_FILTER_KEYS.includes(value as ProductGridFilterKey);
}

function isProductFilterActive(filters: ProductColumnFilters, key: ProductGridFilterKey) {
  return Boolean(filters[key].trim());
}

function getProductSortValue(item: ProductItem, key: ProductGridFilterKey) {
  if (key === 'internalCode') {
    return String(item.internalCode || '').trim().toUpperCase();
  }

  return String(item.name || '').trim().toUpperCase();
}

function compareProductSortValues(leftValue: string, rightValue: string) {
  return String(leftValue || '').localeCompare(String(rightValue || ''), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function SearchFilterIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
    </svg>
  );
}

function ClearAllFiltersIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l3 3m0-3-3 3" />
    </svg>
  );
}

type ProductFilterHeaderProps = {
  label: string;
  filterKey: ProductGridFilterKey;
  active: boolean;
  openFilter: ProductGridFilterKey | null;
  setOpenFilter: (key: ProductGridFilterKey | null) => void;
  sortDirection?: ProductGridSortDirection | null;
  onSort: (direction: ProductGridSortDirection) => void;
  align?: 'left' | 'right';
  children: ReactNode;
};

function ProductFilterHeader({
  label,
  filterKey,
  active,
  openFilter,
  setOpenFilter,
  sortDirection = null,
  onSort,
  align = 'left',
  children,
}: ProductFilterHeaderProps) {
  const isOpen = openFilter === filterKey;

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpenFilter(isOpen ? null : filterKey)}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
          active
            ? 'border-blue-300 bg-blue-100 text-blue-700'
            : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'
        }`}
        title={`Filtrar e ordenar ${label}`}
        aria-label={`Filtrar e ordenar ${label}`}
      >
        <SearchFilterIcon />
      </button>

      {isOpen ? (
        <div className={`absolute top-8 z-40 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-left normal-case tracking-normal text-slate-700 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="mb-3 space-y-2 border-b border-slate-100 pb-3">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Ordenar coluna
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onSort('ASC');
                  setOpenFilter(null);
                }}
                className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                  sortDirection === 'ASC'
                    ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Crescente
              </button>
              <button
                type="button"
                onClick={() => {
                  onSort('DESC');
                  setOpenFilter(null);
                }}
                className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                  sortDirection === 'DESC'
                    ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Decrescente
              </button>
            </div>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ProductGridConfigModal({
  isOpen,
  order,
  hidden,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  order: ProductGridColumnKey[];
  hidden: ProductGridColumnKey[];
  onSave: (order: ProductGridColumnKey[], hidden: ProductGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftOrder, setDraftOrder] = useState<ProductGridColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<ProductGridColumnKey[]>(hidden);
  const [draggedColumnKey, setDraggedColumnKey] = useState<ProductGridColumnKey | null>(null);

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

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <div className={FINANCE_GRID_PAGE_LAYOUT.modalPanel}>
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
              Configuração da tela
            </div>
            <h2 className="mt-1 text-2xl font-black text-slate-900">Configurar colunas do grid</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Reordene, oculte ou inclua colunas do cadastro de produtos nesta tela.
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

        <div className={FINANCE_GRID_PAGE_LAYOUT.modalBody}>
          <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-slate-700">Colunas visíveis: {visibleCount}</div>
                <div className="text-xs font-medium text-slate-500">
                  Reordene, oculte ou inclua colunas do grid nesta tela.
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraftOrder(DEFAULT_PRODUCT_GRID_CONFIG.order);
                    setDraftHidden(DEFAULT_PRODUCT_GRID_CONFIG.hidden);
                  }}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Restaurar padrão
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSave(draftOrder, draftHidden);
                    onClose();
                  }}
                  className="rounded-full bg-blue-600 px-5 py-2 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-auto pr-1">
            <div className="space-y-3">
              {draftOrder.map((columnKey, index) => {
                const column = PRODUCT_GRID_COLUMNS.find((item) => item.key === columnKey);
                if (!column) return null;

                const visible = !draftHidden.includes(columnKey);

                return (
                  <div
                    key={column.key}
                    draggable
                    onDragStart={() => setDraggedColumnKey(column.key)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedColumnKey) return;
                      const fromIndex = draftOrder.indexOf(draggedColumnKey);
                      setDraftOrder((current) => moveArrayItem(current, fromIndex, index));
                      setDraggedColumnKey(null);
                    }}
                    className={`${FINANCE_GRID_PAGE_LAYOUT.modalListItem} ${
                      visible
                        ? FINANCE_GRID_PAGE_LAYOUT.modalActiveItem
                        : FINANCE_GRID_PAGE_LAYOUT.modalInactiveItem
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setDraftHidden((current) =>
                          current.includes(column.key)
                            ? current.filter((item) => item !== column.key)
                            : [...current, column.key],
                        )
                      }
                      className={
                        visible
                          ? FINANCE_GRID_PAGE_LAYOUT.modalToggleOn
                          : FINANCE_GRID_PAGE_LAYOUT.modalToggleOff
                      }
                    >
                      {visible ? '✓' : '✕'}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black uppercase tracking-[0.12em] text-slate-700">
                        {column.label}
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        Arraste para reposicionar esta coluna no grid.
                      </div>
                    </div>

                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                      {visible ? 'Visível' : 'Oculta'}
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

export default function FinanceiroProdutosPage() {
  const runtimeContext = useFinanceRuntimeContext();

  useEffect(() => {
    if (!runtimeContext.embedded) return;

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: EMBEDDED_PRODUCT_SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productColumnFilters, setProductColumnFilters] = useState<ProductColumnFilters>({
    ...DEFAULT_PRODUCT_COLUMN_FILTERS,
  });
  const [productColumnFilterDrafts, setProductColumnFilterDrafts] = useState<ProductColumnFilters>({
    ...DEFAULT_PRODUCT_COLUMN_FILTERS,
  });
  const [openProductGridFilter, setOpenProductGridFilter] = useState<ProductGridFilterKey | null>(
    null,
  );
  const [productGridSort, setProductGridSort] = useState<ProductGridSort>({
    ...DEFAULT_PRODUCT_GRID_SORT,
  });
  const [quickSearch, setQuickSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
  const [productPageSize, setProductPageSize] = useState(10);
  const [productPage, setProductPage] = useState(1);
  const [selectedProductGridRowId, setSelectedProductGridRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualMovementSaving, setManualMovementSaving] = useState(false);
  const [manualMovement, setManualMovement] = useState<ManualStockMovementState | null>(null);
  const [manualMovementError, setManualMovementError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [productFormTab, setProductFormTab] = useState<ProductFormTab>('IDENTIFICATION');
  const [formState, setFormState] = useState<ProductFormState>(emptyFormState);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<ProductExportColumnKey, boolean>>(
    buildDefaultExportColumns(PRODUCT_EXPORT_COLUMNS),
  );
  const [columnOrder, setColumnOrder] = useState<ProductGridColumnKey[]>(
    DEFAULT_PRODUCT_GRID_CONFIG.order,
  );
  const [hiddenColumns, setHiddenColumns] = useState<ProductGridColumnKey[]>(
    DEFAULT_PRODUCT_GRID_CONFIG.hidden,
  );
  const [branchInventoryConfig, setBranchInventoryConfig] = useState<BranchInventoryConfig>(
    DEFAULT_BRANCH_INVENTORY_CONFIG,
  );
  const displayedProducts = useMemo(() => {
    const normalizedQuickSearch = quickSearch.trim().toUpperCase();
    const filteredProducts = normalizedQuickSearch
      ? products.filter((product) =>
          [product.name, product.internalCode, product.sku, product.barcode]
            .filter(Boolean)
            .some((value) => String(value).toUpperCase().includes(normalizedQuickSearch)),
        )
      : products;

    if (!productGridSort.key) {
      return filteredProducts;
    }

    const directionMultiplier = productGridSort.direction === 'DESC' ? -1 : 1;
    return [...filteredProducts].sort((left, right) => {
      const compared = compareProductSortValues(
        getProductSortValue(left, productGridSort.key as ProductGridFilterKey),
        getProductSortValue(right, productGridSort.key as ProductGridFilterKey),
      );

      return compared * directionMultiplier;
    });
  }, [productGridSort.direction, productGridSort.key, products, quickSearch]);

  const productTotalPages = Math.max(1, Math.ceil(displayedProducts.length / productPageSize));
  const currentProductPage = Math.min(productPage, productTotalPages);
  const paginatedProducts = useMemo(
    () =>
      displayedProducts.slice(
        (currentProductPage - 1) * productPageSize,
        currentProductPage * productPageSize,
      ),
    [currentProductPage, displayedProducts, productPageSize],
  );

  const productAuditContext = useMemo(() => {
    const auditParams: ProductAuditParams = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      companyName: displayedProducts[0]?.companyName || products[0]?.companyName,
      quickSearch,
      nameFilter: productColumnFilters.name,
      internalCodeFilter: productColumnFilters.internalCode,
      sortKey: productGridSort.key,
      sortDirection: productGridSort.direction,
      status: statusFilter,
      displayedRowsCount: displayedProducts.length,
    };

    return {
      auditText: buildProductAuditText(auditParams),
      sqlText: buildProductAuditSql(auditParams),
    };
  }, [
    displayedProducts,
    productColumnFilters.internalCode,
    productColumnFilters.name,
    productGridSort.direction,
    productGridSort.key,
    products,
    quickSearch,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    statusFilter,
  ]);

  const loadProducts = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setProducts([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const queryString = buildFinanceApiQueryString(runtimeContext, {
        name: productColumnFilters.name.trim() || null,
        internalCode: productColumnFilters.internalCode.trim() || null,
        status: statusFilter,
      });

      const response = await getJson<ProductItem[]>(`/products${queryString}`);
      setProducts(response);
    } catch (error) {
      setErrorMessage(getFriendlyRequestErrorMessage(error, 'Não foi possível carregar os produtos.'));
    } finally {
      setLoading(false);
    }
  }, [productColumnFilters.internalCode, productColumnFilters.name, runtimeContext, statusFilter]);

  const loadBranchInventoryConfig = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setBranchInventoryConfig(DEFAULT_BRANCH_INVENTORY_CONFIG);
      return;
    }

    try {
      const companies = await getJson<CompanyItem[]>(
        `/companies${buildFinanceApiQueryString(runtimeContext)}`,
      );
      const company = companies[0];
      if (!company) {
        setBranchInventoryConfig(DEFAULT_BRANCH_INVENTORY_CONFIG);
        return;
      }

      const branches = await getJson<BranchInventoryConfig[]>(
        `/companies/${company.id}/branches${buildFinanceApiQueryString(runtimeContext)}`,
      );
      const currentBranch =
        branches.find((branch) => branch.branchCode === runtimeContext.sourceBranchCode) ||
        branches.find((branch) => branch.branchCode === 1) ||
        branches[0];

      setBranchInventoryConfig(
        currentBranch
          ? { ...DEFAULT_BRANCH_INVENTORY_CONFIG, ...currentBranch }
          : DEFAULT_BRANCH_INVENTORY_CONFIG,
      );
    } catch {
      setBranchInventoryConfig(DEFAULT_BRANCH_INVENTORY_CONFIG);
    }
  }, [runtimeContext]);

  useEffect(() => {
    const storedConfig = readStoredProductGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
    setExportColumns(buildDefaultExportColumns(PRODUCT_EXPORT_COLUMNS));
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadBranchInventoryConfig();
  }, [loadBranchInventoryConfig]);

  useEffect(() => {
    setProductPage(1);
  }, [productColumnFilters, productGridSort.direction, productGridSort.key, productPageSize, quickSearch, statusFilter]);

  useEffect(() => {
    if (productPage > productTotalPages) {
      setProductPage(productTotalPages);
    }
  }, [productPage, productTotalPages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      getProductGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({ order: columnOrder, hidden: hiddenColumns } satisfies ProductGridConfig),
    );
  }, [columnOrder, hiddenColumns, runtimeContext.sourceTenantId]);

  const visibleColumns = useMemo(
    () => getVisibleProductColumns({ order: columnOrder, hidden: hiddenColumns }),
    [columnOrder, hiddenColumns],
  );

  const firstVisibleProductFilterColumn = useMemo(
    () => visibleColumns.find((column) => isProductGridFilterKey(column.key))?.key || null,
    [visibleColumns],
  );

  const hasProductGridFilters = useMemo(
    () =>
      PRODUCT_GRID_FILTER_KEYS.some((key) => isProductFilterActive(productColumnFilters, key)) ||
      Boolean(productGridSort.key),
    [productColumnFilters, productGridSort.key],
  );

  const clearProductColumnFilter = useCallback((column: ProductGridFilterKey) => {
    setProductColumnFilters((current) => ({
      ...current,
      [column]: '',
    }));
    setProductColumnFilterDrafts((current) => ({
      ...current,
      [column]: '',
    }));
  }, []);

  const clearProductGridFilters = useCallback(() => {
    setProductColumnFilters({ ...DEFAULT_PRODUCT_COLUMN_FILTERS });
    setProductColumnFilterDrafts({ ...DEFAULT_PRODUCT_COLUMN_FILTERS });
    setProductGridSort({ ...DEFAULT_PRODUCT_GRID_SORT });
    setOpenProductGridFilter(null);
  }, []);

  function handleSetOpenProductGridFilter(filterKey: ProductGridFilterKey | null) {
    if (filterKey) {
      setProductColumnFilterDrafts((current) => ({
        ...current,
        [filterKey]: productColumnFilters[filterKey],
      }));
    }

    setOpenProductGridFilter(filterKey);
  }

  function applyProductColumnFilter(filterKey: ProductGridFilterKey) {
    setProductColumnFilters((current) => ({
      ...current,
      [filterKey]: productColumnFilterDrafts[filterKey].trim(),
    }));
    setOpenProductGridFilter(null);
  }

  function getProductGridSortDirection(filterKey: ProductGridFilterKey) {
    return productGridSort.key === filterKey ? productGridSort.direction : null;
  }

  function handleProductGridSort(filterKey: ProductGridFilterKey, direction: ProductGridSortDirection) {
    setProductGridSort({ key: filterKey, direction });
  }

  function renderProductGridHeader(column: GridColumnDefinition<ProductItem, ProductGridColumnKey>) {
    if (isProductGridFilterKey(column.key)) {
      const filterKey = column.key;
      const filterLabel = filterKey === 'name' ? 'produto' : 'código interno';

      return (
        <div className="flex items-center gap-1.5">
          {firstVisibleProductFilterColumn === filterKey ? (
            <button
              type="button"
              onClick={clearProductGridFilters}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                hasProductGridFilters
                  ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                  : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
              }`}
              title="Limpar todos os filtros"
              aria-label="Limpar todos os filtros"
            >
              <ClearAllFiltersIcon />
            </button>
          ) : null}
          <ProductFilterHeader
            label={column.label}
            filterKey={filterKey}
            active={
              isProductFilterActive(productColumnFilters, filterKey) ||
              productGridSort.key === filterKey
            }
            openFilter={openProductGridFilter}
            setOpenFilter={handleSetOpenProductGridFilter}
            sortDirection={getProductGridSortDirection(filterKey)}
            onSort={(direction) => handleProductGridSort(filterKey, direction)}
            align={filterKey === 'internalCode' ? 'right' : 'left'}
          >
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                Filtrar {filterLabel}
              </div>
              <input
                value={productColumnFilterDrafts[filterKey]}
                onChange={(event) =>
                  setProductColumnFilterDrafts((current) => ({
                    ...current,
                    [filterKey]: event.target.value,
                  }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    applyProductColumnFilter(filterKey);
                  }
                }}
                className={productFilterInputClass}
                placeholder={filterKey === 'name' ? 'DIGITE O PRODUTO' : 'DIGITE O CÓDIGO'}
              />
              <button
                type="button"
                onClick={() => applyProductColumnFilter(filterKey)}
                className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100"
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={() => {
                  clearProductColumnFilter(filterKey);
                  setOpenProductGridFilter(null);
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
              >
                Limpar
              </button>
            </div>
          </ProductFilterHeader>
        </div>
      );
    }

    return column.label;
  }

  function openCreateModal() {
    setFormState(applyBranchInventoryRules(emptyFormState, branchInventoryConfig));
    setSuccessMessage(null);
    setErrorMessage(null);
    setProductFormTab('IDENTIFICATION');
    setIsFormOpen(true);
  }

  function openEditModal(product: ProductItem) {
    setFormState(applyBranchInventoryRules(buildProductForm(product), branchInventoryConfig));
    setSuccessMessage(null);
    setErrorMessage(null);
    setProductFormTab('IDENTIFICATION');
    setIsFormOpen(true);
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState.name.trim()) {
      setProductFormTab('IDENTIFICATION');
      setErrorMessage('INFORME O NOME DO PRODUTO.');
      return;
    }

    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setErrorMessage('Informe o tenant de origem para manter produtos no Financeiro.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const effectiveForm = applyBranchInventoryRules(formState, branchInventoryConfig);
      const allowStockFraction = effectiveForm.allowFraction;
      const payload = {
        requestedBy: runtimeContext.cashierDisplayName || runtimeContext.userRole || 'FINANCEIRO',
        sourceSystem: runtimeContext.sourceSystem,
        sourceTenantId: runtimeContext.sourceTenantId,
        companyName: runtimeContext.companyName || undefined,
        name: formState.name,
        internalCode: formState.internalCode || undefined,
        sku: formState.sku || undefined,
        barcode: formState.barcode || undefined,
        unitCode: formState.unitCode || undefined,
        productType: formState.productType || undefined,
        tracksInventory: effectiveForm.tracksInventory,
        allowFraction: allowStockFraction,
        usesColorSize: effectiveForm.usesColorSize,
        usesLotControl: effectiveForm.usesLotControl,
        usesExpirationControl: effectiveForm.usesExpirationControl,
        allowsNegativeStock: effectiveForm.allowsNegativeStock,
        currentStock: effectiveForm.tracksInventory
          ? parseStockNumber(formState.currentStock, allowStockFraction)
          : 0,
        minimumStock: effectiveForm.tracksInventory
          ? parseStockNumber(formState.minimumStock, allowStockFraction)
          : 0,
        purchasePrice: parseOptionalNumber(formState.purchasePrice),
        salePrice: parseOptionalNumber(formState.salePrice),
        ncmCode: formState.ncmCode || undefined,
        cestCode: formState.cestCode || undefined,
        notes: formState.notes || undefined,
      };

      if (formState.id) {
        await requestJson(`/products/${formState.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
          fallbackMessage: 'Não foi possível atualizar o produto.',
        });
        setSuccessMessage('Produto atualizado com sucesso.');
      } else {
        await requestJson('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
          fallbackMessage: 'Não foi possível cadastrar o produto.',
        });
        setSuccessMessage('Produto cadastrado com sucesso.');
      }

      setIsFormOpen(false);
      await loadProducts();
    } catch (error) {
      setErrorMessage(getFriendlyRequestErrorMessage(error, 'Não foi possível salvar o produto.'));
    } finally {
      setSaving(false);
    }
  }

  function openManualStockMovement(product: ProductItem, movementType: 'ENTRY' | 'EXIT') {
    if (product.status !== 'ACTIVE') {
      setErrorMessage('O produto precisa estar ativo para movimentar o estoque.');
      return;
    }
    if (!product.tracksInventory) {
      setErrorMessage('O produto não possui controle de estoque.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setManualMovementError(null);
    setManualMovement({
      product,
      movementType,
      operationId: createManualStockOperationId(),
      quantity: '',
      notes: '',
      colorName: '',
      sizeCode: '',
      lotNumber: '',
      lotExpirationDate: '',
    });
  }

  async function saveManualStockMovement() {
    if (!manualMovement || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;

    setManualMovementSaving(true);
    setManualMovementError(null);
    try {
      const quantity = parseStockNumber(
        manualMovement.quantity,
        manualMovement.product.allowFraction,
      );
      if (quantity <= 0) {
        throw new Error('Informe uma quantidade maior que zero.');
      }
      if (manualMovement.notes.trim().length < 3) {
        throw new Error('Informe o motivo da movimentação manual.');
      }

      const result = await requestJson<ManualStockMovementResponse>(
        `/products/${manualMovement.product.id}/stock-movements`,
        {
          method: 'POST',
          body: JSON.stringify({
            requestedBy:
              runtimeContext.cashierDisplayName || runtimeContext.userRole || 'FINANCEIRO',
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            operationId: manualMovement.operationId,
            movementType: manualMovement.movementType,
            quantity,
            notes: manualMovement.notes,
            colorName: manualMovement.colorName || undefined,
            sizeCode: manualMovement.sizeCode || undefined,
            lotNumber: manualMovement.lotNumber || undefined,
            lotExpirationDate: manualMovement.lotExpirationDate || undefined,
          }),
          fallbackMessage: 'Não foi possível registrar a movimentação manual.',
        },
      );

      setManualMovement(null);
      setSuccessMessage(
        `${result.message || 'Movimentação registrada com sucesso.'} Saldo anterior: ${formatStock(
          result.previousStock,
          manualMovement.product.allowFraction,
        )}; saldo atual: ${formatStock(
          result.resultingStock,
          manualMovement.product.allowFraction,
        )}.`,
      );
      await loadProducts();
    } catch (error) {
      setManualMovementError(
        getFriendlyRequestErrorMessage(error, 'Não foi possível registrar a movimentação manual.'),
      );
    } finally {
      setManualMovementSaving(false);
    }
  }

  function openProductStockHistory(product: ProductItem) {
    const params = new URLSearchParams(
      buildFinanceNavigationQueryString(runtimeContext).replace(/^\?/, ''),
    );
    params.set('productId', product.id);
    params.set('productName', product.name);
    window.location.assign(`/estoque/historico-movimentacao?${params.toString()}`);
  }

  async function handleStatusChange(product: ProductItem, action: 'activate' | 'inactivate') {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setErrorMessage('Informe o tenant de origem para alterar a situação do produto.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await requestJson(`/products/${product.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          requestedBy: runtimeContext.cashierDisplayName || runtimeContext.userRole || 'FINANCEIRO',
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
        }),
        fallbackMessage:
          action === 'activate'
            ? 'Não foi possível reativar o produto.'
            : 'Não foi possível inativar o produto.',
      });

      setSuccessMessage(
        action === 'activate'
          ? 'Produto reativado com sucesso.'
          : 'Produto inativado com sucesso.',
      );
      await loadProducts();
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          action === 'activate'
            ? 'Não foi possível reativar o produto.'
            : 'Não foi possível inativar o produto.',
        ),
      );
    }
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      {!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} p-8`}>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
            <div className="text-sm font-black uppercase tracking-[0.22em]">Contexto obrigatório</div>
            <p className="mt-2 text-sm font-medium">
              Esta tela precisa receber `sourceSystem` e `sourceTenantId` para manter o isolamento
              correto entre empresas.
            </p>
          </div>
        </section>
      ) : null}

      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} p-6`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openCreateModal}
            title="Incluir novo produto"
            aria-label="Incluir novo produto"
            className={`${FINANCE_GRID_PAGE_LAYOUT.iconButton} h-12 w-12 shrink-0 text-2xl font-black`}
          >
            +
          </button>
          <input
            type="search"
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
            className={`${FINANCE_GRID_PAGE_LAYOUT.input} min-w-0 flex-1`}
            placeholder="PESQUISAR PRODUTO, CÓDIGO, SKU OU CÓDIGO DE BARRAS"
            aria-label="Pesquisar produtos"
          />
        </div>

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {successMessage}
          </div>
        ) : null}
      </section>

      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} flex h-[calc(100vh-13rem)] min-h-[520px] flex-col overflow-hidden`}>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_rgba(226,232,240,1)]">
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500"
                  >
                    {renderProductGridHeader(column)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Ações
                </th>
              </tr>
              {openProductGridFilter ? (
                <tr aria-hidden="true">
                  <th colSpan={visibleColumns.length + 1} className="h-44 bg-white p-0" />
                </tr>
              ) : null}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && !displayedProducts.length ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    className="px-6 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Nenhum produto foi encontrado para os filtros informados.
                  </td>
                </tr>
              ) : null}

              {paginatedProducts.map((product, productIndex) => {
                const isSelected = selectedProductGridRowId === product.id;
                const zebraClass =
                  product.status === 'ACTIVE'
                    ? productIndex % 2
                      ? 'bg-slate-200/70'
                      : 'bg-white'
                    : productIndex % 2
                      ? 'bg-rose-200/70'
                      : 'bg-rose-100/80';

                return (
                <tr
                  key={product.id}
                  onClick={() => setSelectedProductGridRowId(product.id)}
                  aria-selected={isSelected}
                  className={`cursor-pointer transition hover:bg-blue-50 ${
                    isSelected ? 'bg-blue-100 ring-2 ring-inset ring-blue-300' : zebraClass
                  }`}
                >
                  {visibleColumns.map((column) => {
                    if (column.key === 'name') {
                      return (
                        <td key={column.key} className="px-4 py-4 align-top">
                          <div className="flex items-center gap-2 font-black uppercase tracking-[0.08em] text-slate-900">
                            <span
                              className={`h-3 w-3 shrink-0 rounded-full ${
                                product.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                              title={product.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'}
                              aria-label={product.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'}
                            />
                            <span>{product.name}</span>
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            {product.barcode || product.companyName || '---'}
                          </div>
                        </td>
                      );
                    }

                    if (column.key === 'stock') {
                      return (
                        <td key={column.key} className="px-4 py-4 align-top">
                          <div className="font-semibold text-slate-800">
                            {product.tracksInventory
                              ? `${formatStock(product.currentStock, product.allowFraction)} ${product.unitCode}`
                              : 'SEM CONTROLE'}
                          </div>
                          {product.usesColorSize || product.usesLotControl ? (
                            <div className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                              {product.usesColorSize ? 'COR/NÚMERO' : 'LOTE'}
                            </div>
                          ) : null}
                          <div className="mt-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getInventorySituationClass(
                                product.inventorySituation,
                              )}`}
                            >
                              {getInventorySituationLabel(product.inventorySituation)}
                            </span>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={column.key} className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                        {column.getValue(product)}
                      </td>
                    );
                  })}

                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openManualStockMovement(product, 'ENTRY');
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-xl font-black text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-900"
                        title="Entrada manual de estoque"
                        aria-label="Entrada manual de estoque"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openManualStockMovement(product, 'EXIT');
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-xl font-black text-rose-700 transition hover:bg-rose-100 hover:text-rose-900"
                        title="Saída manual de estoque"
                        aria-label="Saída manual de estoque"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openProductStockHistory(product);
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 transition hover:bg-amber-100 hover:text-amber-900"
                        title="Consultar histórico de movimentação"
                        aria-label="Consultar histórico de movimentação"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" />
                          <path d="M3 4v5h5M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditModal(product);
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition hover:bg-blue-100 hover:text-blue-800"
                        title="Editar produto"
                      >
                        ✎
                      </button>
                      {product.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(product, 'inactivate')}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100 hover:text-rose-800"
                          title="Inativar produto"
                        >
                          ⊘
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(product, 'activate')}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
                          title="Reativar produto"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>

        <GridStandardFooter
          statusFilter={statusFilter}
          totalRecords={displayedProducts.length}
          pageSize={productPageSize}
          currentPage={currentProductPage}
          totalPages={productTotalPages}
          onColumnSettings={() => setIsColumnConfigOpen(true)}
          onExport={() => setIsExportModalOpen(true)}
          onStatusFilterChange={setStatusFilter}
          onPageSizeChange={setProductPageSize}
          onPageChange={setProductPage}
        >
          {!runtimeContext.embedded ? (
            <ScreenNameCopy
              screenId={PRODUCT_SCREEN_ID}
              className="justify-end"
              originText="Origem: Sistema Financeiro - frontend/src/app/produtos/page.tsx"
              auditText={productAuditContext.auditText || screenAuditText}
              sqlText={productAuditContext.sqlText}
            />
          ) : null}
        </GridStandardFooter>
      </section>

      {isFormOpen ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {runtimeContext.logoUrl ? (
                    <img
                      src={runtimeContext.logoUrl}
                      alt={runtimeContext.companyName || 'Empresa'}
                      className="h-full w-full object-contain p-1.5"
                    />
                  ) : (
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                      {String(runtimeContext.companyName || 'FINANCEIRO').slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
                    Cadastro de produto
                  </div>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">
                    {formState.id ? 'Editar produto' : 'Novo produto'}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    Este cadastro base será reutilizado por estoque, notas de entrada e vendas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="min-h-0 flex-1 overflow-auto p-6">
              <div
                role="tablist"
                aria-label="Etapas do cadastro de produto"
                className="mb-6 grid gap-2 rounded-3xl border border-slate-200 bg-slate-100 p-2 sm:grid-cols-2 xl:grid-cols-4"
              >
                {PRODUCT_FORM_TABS.map((tab) => {
                  const isActive = productFormTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setProductFormTab(tab.value)}
                      className={`rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                          : 'bg-white text-slate-500 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {errorMessage ? (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {errorMessage}
                </div>
              ) : null}

              <div className="grid gap-6">
                {productFormTab === 'IDENTIFICATION' ? (
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                    Identificação
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Produto
                      </span>
                      <input
                        value={formState.name}
                        onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Código interno
                      </span>
                      <input
                        value={formState.internalCode}
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            internalCode: event.target.value.replace(/\D+/g, ''),
                          }))
                        }
                        inputMode="numeric"
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        SKU
                      </span>
                      <input
                        value={formState.sku}
                        onChange={(event) => setFormState((current) => ({ ...current, sku: event.target.value }))}
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Código de barras
                      </span>
                      <input
                        value={formState.barcode}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, barcode: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>
                  </div>
                </section>
                ) : null}

                {productFormTab === 'CLASSIFICATION' ? (
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                    Classificação
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Unidade
                      </span>
                      <input
                        value={formState.unitCode}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, unitCode: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Tipo do produto
                      </span>
                      <select
                        value={formState.productType}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, productType: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      >
                        <option value="GOODS">MERCADORIA</option>
                        <option value="INPUT">INSUMO</option>
                        <option value="CONSUMABLE">CONSUMO</option>
                        <option value="SERVICE">SERVIÇO</option>
                      </select>
                    </label>

                    <StockParameterButton
                      label="Controlar quantidade do estoque"
                      value={formState.tracksInventory}
                      editable={branchInventoryConfig.stockControlMode === 'BY_PRODUCT'}
                      enabledText="Sim, este produto movimenta estoque."
                      disabledText="Não, apenas cadastro comercial/fiscal."
                      onToggle={() =>
                        setFormState((current) => ({
                          ...current,
                          tracksInventory: !current.tracksInventory,
                        }))
                      }
                    />

                    <StockParameterButton
                      label="Tratar apenas quantidade inteira"
                      value={!formState.allowFraction}
                      editable={branchInventoryConfig.stockIntegerQuantityMode === 'BY_PRODUCT'}
                      enabledText="Sim, aceita somente quantidade inteira."
                      disabledText="Não, permite quantidade fracionada."
                      onToggle={() =>
                        setFormState((current) => ({
                          ...current,
                          allowFraction: !current.allowFraction,
                        }))
                      }
                    />

                    <StockParameterButton
                      label="Controla lote"
                      value={formState.usesLotControl}
                      editable={branchInventoryConfig.stockLotControlMode === 'BY_PRODUCT'}
                      enabledText="Sim, este produto controla lote."
                      disabledText="Não, produto sem controle de lote."
                      onToggle={() =>
                        setFormState((current) => ({
                          ...current,
                          usesLotControl: !current.usesLotControl,
                        }))
                      }
                    />

                    <StockParameterButton
                      label="Controla validade"
                      value={formState.usesExpirationControl}
                      editable={branchInventoryConfig.stockExpirationControlMode === 'BY_PRODUCT'}
                      enabledText="Sim, este produto controla validade."
                      disabledText="Não, produto sem controle de validade."
                      onToggle={() =>
                        setFormState((current) => ({
                          ...current,
                          usesExpirationControl: !current.usesExpirationControl,
                        }))
                      }
                    />

                    <StockParameterButton
                      label="Controla grade"
                      value={formState.usesColorSize}
                      editable={branchInventoryConfig.stockGridControlMode === 'BY_PRODUCT'}
                      enabledText="Sim, este produto usa grade."
                      disabledText="Não, produto sem grade."
                      onToggle={() =>
                        setFormState((current) => ({
                          ...current,
                          usesColorSize: !current.usesColorSize,
                        }))
                      }
                    />

                    <StockParameterButton
                      label="Permite estoque negativo"
                      value={formState.allowsNegativeStock}
                      editable={branchInventoryConfig.stockNegativeControlMode === 'BY_PRODUCT'}
                      enabledText="Sim, este produto pode ficar com saldo negativo."
                      disabledText="Não, saída sem saldo será bloqueada."
                      onToggle={() =>
                        setFormState((current) => ({
                          ...current,
                          allowsNegativeStock: !current.allowsNegativeStock,
                        }))
                      }
                    />
                  </div>
                </section>
                ) : null}

                {productFormTab === 'STOCK_PRICES' ? (
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                    Estoque e valores
                  </div>
                  <div className="grid gap-4 lg:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Estoque atual
                      </span>
                      <input
                        value={formState.currentStock}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, currentStock: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                        inputMode={formState.allowFraction ? 'decimal' : 'numeric'}
                        disabled={!formState.tracksInventory}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Estoque mínimo
                      </span>
                      <input
                        value={formState.minimumStock}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, minimumStock: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                        inputMode={formState.allowFraction ? 'decimal' : 'numeric'}
                        disabled={!formState.tracksInventory}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Custo
                      </span>
                      <input
                        value={formState.purchasePrice}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, purchasePrice: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Venda
                      </span>
                      <input
                        value={formState.salePrice}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, salePrice: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>
                  </div>
                </section>
                ) : null}

                {productFormTab === 'FISCAL' ? (
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                    Fiscal e observações
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        NCM
                      </span>
                      <input
                        value={formState.ncmCode}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, ncmCode: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        CEST
                      </span>
                      <input
                        value={formState.cestCode}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, cestCode: event.target.value }))
                        }
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>

                    <label className="block lg:col-span-2">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Observações
                      </span>
                      <textarea
                        value={formState.notes}
                        onChange={(event) =>
                          setFormState((current) => ({ ...current, notes: event.target.value }))
                        }
                        className="min-h-28 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  </div>
                </section>
                ) : null}
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
                >
                  {saving ? 'Salvando...' : 'Salvar produto'}
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <ScreenNameCopy
                  screenId={PRODUCT_FORM_POPUP_SCREEN_ID}
                  className="justify-end"
                  originText="Origem: Sistema Financeiro - C:/Sistemas/IA/Financeiro/frontend/src/app/produtos/page.tsx"
                  auditText={`--- LOGICA DO POPUP ---
Cadastro e manutenção do produto financeiro.

OPERAÇÃO ATUAL:
- ${formState.id ? 'ALTERAÇÃO DE PRODUTO EXISTENTE' : 'INCLUSÃO DE NOVO PRODUTO'}

ABAS:
- identificação
- classificação
- estoque e valores
- fiscal e observações

CONTEXTO:
- empresa: ${formatTenantAuditValue(runtimeContext.sourceTenantId)}
- filial: ${formatAuditValue(runtimeContext.sourceBranchCode, '1')}
- produto: ${formatAuditValue(formState.name)}

REGRAS:
- textos são normalizados para uppercase pelo backend
- o produto permanece isolado por empresa e filial
- alterações são auditadas e não apagam o histórico de estoque`}
                  sqlText={formState.id ? `UPDATE products
SET name = ${toSqlLiteral(formState.name)},
    internalCode = ${toSqlLiteral(formState.internalCode)},
    sku = ${toSqlLiteral(formState.sku)},
    barcode = ${toSqlLiteral(formState.barcode)},
    unitCode = ${toSqlLiteral(formState.unitCode)},
    updatedAt = CURRENT_TIMESTAMP
WHERE id = ${toSqlLiteral(formState.id)}
  AND canceledAt IS NULL;` : `INSERT INTO products (
  name, internalCode, sku, barcode, unitCode, productType, createdAt, updatedAt
) VALUES (
  ${toSqlLiteral(formState.name)},
  ${toSqlLiteral(formState.internalCode)},
  ${toSqlLiteral(formState.sku)},
  ${toSqlLiteral(formState.barcode)},
  ${toSqlLiteral(formState.unitCode)},
  ${toSqlLiteral(formState.productType)},
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);`}
                />
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <AuditedPopupShell
        isOpen={Boolean(manualMovement)}
        screenId={
          manualMovement?.movementType === 'EXIT'
            ? MANUAL_STOCK_EXIT_SCREEN_ID
            : MANUAL_STOCK_ENTRY_SCREEN_ID
        }
        title={manualMovement?.movementType === 'EXIT' ? 'Saída manual' : 'Entrada manual'}
        eyebrow="Movimentação de estoque"
        description="A operação altera o saldo e cria um novo registro permanente no histórico do produto."
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        originText="Origem: Sistema Financeiro - C:/Sistemas/IA/Financeiro/frontend/src/app/produtos/page.tsx"
        auditText={manualMovement ? `--- LOGICA DO POPUP ---
Produto: ${manualMovement.product.name}
Produto ID: ${manualMovement.product.id}
Filial: ${runtimeContext.sourceBranchCode}
Operação: ${manualMovement.movementType === 'ENTRY' ? 'ENTRADA MANUAL' : 'SAÍDA MANUAL'}
Saldo exibido antes da confirmação: ${manualMovement.product.currentStock}

REGRAS:
- a quantidade deve respeitar a precisão do produto/filial
- saída sem permissão de estoque negativo não pode superar o saldo
- a atualização do saldo e a inclusão em stock_movements ocorrem na mesma transação
- movimentos antigos nunca são editados ou apagados fisicamente` : ''}
        sqlText={manualMovement ? `-- BASE LOGICA DA MOVIMENTACAO MANUAL
UPDATE products
SET currentStock = currentStock ${manualMovement.movementType === 'ENTRY' ? '+' : '-'} :quantity,
    updatedBy = ${toSqlLiteral(runtimeContext.cashierDisplayName || runtimeContext.userRole || 'FINANCEIRO')}
WHERE id = ${toSqlLiteral(manualMovement.product.id)}
  AND companyId = :companyId;

INSERT INTO stock_movements
  (companyId, branchCode, productId, sourceType, sourceId, movementType,
   quantity, previousStock, resultingStock, notes, occurredAt, createdBy, updatedBy)
VALUES
  (:companyId, ${toSqlLiteral(runtimeContext.sourceBranchCode)}, ${toSqlLiteral(manualMovement.product.id)},
   'MANUAL_STOCK', ${toSqlLiteral(manualMovement.operationId)}, ${toSqlLiteral(manualMovement.movementType)},
   :quantity, :previousStock, :resultingStock, :notes, CURRENT_TIMESTAMP,
   ${toSqlLiteral(runtimeContext.cashierDisplayName || runtimeContext.userRole || 'FINANCEIRO')},
   ${toSqlLiteral(runtimeContext.cashierDisplayName || runtimeContext.userRole || 'FINANCEIRO')});` : ''}
        onClose={() => {
          if (!manualMovementSaving) {
            setManualMovement(null);
            setManualMovementError(null);
          }
        }}
        panelClassName="max-w-2xl"
        footerActions={manualMovement ? (
          <>
            <button
              type="button"
              onClick={() => {
                setManualMovement(null);
                setManualMovementError(null);
              }}
              disabled={manualMovementSaving}
              className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void saveManualStockMovement()}
              disabled={manualMovementSaving}
              className={manualMovement.movementType === 'ENTRY'
                ? FINANCE_GRID_PAGE_LAYOUT.primaryButton
                : 'rounded-2xl bg-rose-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 disabled:opacity-50'}
            >
              {manualMovementSaving
                ? 'Salvando...'
                : manualMovement.movementType === 'ENTRY'
                  ? 'Confirmar entrada'
                  : 'Confirmar saída'}
            </button>
          </>
        ) : null}
      >
        {manualMovement ? (
          <div className="min-h-0 overflow-auto pr-1">
            <div className={`rounded-2xl border p-4 ${
              manualMovement.movementType === 'ENTRY'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-rose-200 bg-rose-50'
            }`}>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                Produto selecionado
              </div>
              <div className="mt-1 text-lg font-black uppercase text-slate-950">
                {manualMovement.product.name}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
                <span>Código: {manualMovement.product.internalCode || '---'}</span>
                <span>Saldo atual: {formatStock(manualMovement.product.currentStock, manualMovement.product.allowFraction)} {manualMovement.product.unitCode}</span>
              </div>
            </div>

            {manualMovementError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {manualMovementError}
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Quantidade
                </span>
                <input
                  autoFocus
                  type="number"
                  min={manualMovement.product.allowFraction ? '0.001' : '1'}
                  step={manualMovement.product.allowFraction ? 'any' : '1'}
                  value={manualMovement.quantity}
                  onChange={(event) => setManualMovement((current) => current ? { ...current, quantity: event.target.value } : current)}
                  className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}
                  required
                />
              </label>

              {manualMovement.product.usesColorSize ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Cor</span>
                    <input
                      value={manualMovement.colorName}
                      onChange={(event) => setManualMovement((current) => current ? { ...current, colorName: event.target.value.toUpperCase() } : current)}
                      className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Número</span>
                    <input
                      value={manualMovement.sizeCode}
                      onChange={(event) => setManualMovement((current) => current ? { ...current, sizeCode: event.target.value.toUpperCase() } : current)}
                      className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}
                      required
                    />
                  </label>
                </>
              ) : null}

              {manualMovement.product.usesLotControl ? (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Lote</span>
                  <input
                    value={manualMovement.lotNumber}
                    onChange={(event) => setManualMovement((current) => current ? { ...current, lotNumber: event.target.value.toUpperCase() } : current)}
                    className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}
                    required
                  />
                </label>
              ) : null}

              {manualMovement.product.usesExpirationControl ? (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Validade do lote</span>
                  <input
                    type="date"
                    value={manualMovement.lotExpirationDate}
                    onChange={(event) => setManualMovement((current) => current ? { ...current, lotExpirationDate: event.target.value } : current)}
                    className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}
                    required
                  />
                </label>
              ) : null}

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Motivo da movimentação
                </span>
                <textarea
                  value={manualMovement.notes}
                  onChange={(event) => setManualMovement((current) => current ? { ...current, notes: event.target.value.toUpperCase() } : current)}
                  className="min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold uppercase text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="INFORME O MOTIVO"
                  required
                />
              </label>
            </div>
          </div>
        ) : null}
      </AuditedPopupShell>

      <ProductGridConfigModal
        isOpen={isColumnConfigOpen}
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
        title="Exportar produtos"
        description={`A exportação respeita os filtros atuais e inclui ${displayedProducts.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={PRODUCT_EXPORT_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={getProductExportStorageKey(runtimeContext.sourceTenantId)}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: displayedProducts,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) =>
                    PRODUCT_EXPORT_COLUMNS.find((definition) => definition.key === key),
                  )
                  .filter(
                    (column): column is GridColumnDefinition<ProductItem, ProductExportColumnKey> =>
                      Boolean(column),
                  )
              : PRODUCT_EXPORT_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            fileBaseName: 'produtos',
            branding: {
              title: 'Produtos',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName:
                runtimeContext.companyName ||
                displayedProducts[0]?.companyName ||
                products[0]?.companyName ||
                'FINANCEIRO',
            },
            pdfOptions: config.pdfOptions,
          });

          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />
    </div>
  );
}
