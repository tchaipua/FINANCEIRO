'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridExportModal from '@/app/components/grid-export-modal';
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
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

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
  currentStock: string;
  minimumStock: string;
  purchasePrice: string;
  salePrice: string;
  ncmCode: string;
  cestCode: string;
  notes: string;
};

type ProductGridColumnKey =
  | 'name'
  | 'internalCode'
  | 'sku'
  | 'unitCode'
  | 'productType'
  | 'stock'
  | 'status'
  | 'updatedAt';

type ProductExportColumnKey =
  | ProductGridColumnKey
  | 'barcode'
  | 'purchasePrice'
  | 'salePrice'
  | 'minimumStock'
  | 'notes'
  | 'createdAt';

type ProductGridConfig = {
  order: ProductGridColumnKey[];
  hidden: ProductGridColumnKey[];
};

const PRODUCT_SCREEN_ID = 'FINANCEIRO_PRODUTOS_LISTAGEM_GERAL';
const PRODUCT_GRID_STORAGE_PREFIX = 'financeiro:produtos:grid-columns:';
const PRODUCT_EXPORT_STORAGE_PREFIX = 'financeiro:produtos:export-config:';

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
        ? `${formatStock(item.currentStock)} / mín ${formatStock(item.minimumStock)}`
        : 'SEM CONTROLE',
  },
  {
    key: 'status',
    label: 'Situação',
    getValue: (item) => (item.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'),
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
    getValue: (item) => (item.tracksInventory ? formatStock(item.currentStock) : 'SEM CONTROLE'),
  },
  {
    key: 'minimumStock',
    label: 'Estoque mínimo',
    getValue: (item) => (item.tracksInventory ? formatStock(item.minimumStock) : '---'),
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

FILTROS APLICADOS:
- companyId obrigatório pelo tenant informado
- status opcional: ACTIVE | INACTIVE | ALL
- busca opcional por name, internalCode, sku, barcode e ncmCode

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
  AND (
    :search IS NULL
    OR PR.name LIKE :search
    OR PR.internalCode LIKE :search
    OR PR.sku LIKE :search
    OR PR.barcode LIKE :searchDigits
    OR PR.ncmCode LIKE :searchDigits
  )
ORDER BY PR.name ASC;`;

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

function formatStock(value?: number | null) {
  const normalized = Number(value || 0);
  return normalized.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(normalized) ? 0 : 2,
    maximumFractionDigits: 2,
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
  const navigationQueryString = buildFinanceNavigationQueryString(runtimeContext);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'INACTIVE'>('ACTIVE');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
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

  const loadProducts = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setProducts([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const queryString = buildFinanceApiQueryString(runtimeContext, {
        search: appliedSearch || null,
        status: statusFilter,
      });

      const response = await getJson<ProductItem[]>(`/products${queryString}`);
      setProducts(response);
    } catch (error) {
      setErrorMessage(getFriendlyRequestErrorMessage(error, 'Não foi possível carregar os produtos.'));
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, runtimeContext, statusFilter]);

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

  const showClearSearchButton = Boolean(searchInput.trim() || appliedSearch.trim());

  function openCreateModal() {
    setFormState(emptyFormState);
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsFormOpen(true);
  }

  function openEditModal(product: ProductItem) {
    setFormState(buildProductForm(product));
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsFormOpen(true);
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setErrorMessage('Informe o tenant de origem para manter produtos no Financeiro.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
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
        tracksInventory: formState.tracksInventory,
        allowFraction: formState.allowFraction,
        currentStock: formState.tracksInventory ? parseOptionalNumber(formState.currentStock) ?? 0 : 0,
        minimumStock: formState.tracksInventory ? parseOptionalNumber(formState.minimumStock) ?? 0 : 0,
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
      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.28em] text-blue-100">
                Cadastro base para estoque
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Produtos</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-50">
                Cadastre o produto uma única vez no Financeiro e deixe o estoque pronto para
                futuras notas fiscais, entradas e vendas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-black uppercase tracking-[0.18em] text-white">
                Menu Financeiro
              </span>
              <Link
                href={`/${navigationQueryString}`}
                className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Voltar ao menu
              </Link>
            </div>
          </div>
        </div>
      </section>

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
        <div className="grid gap-4 xl:grid-cols-[auto_1fr_auto_auto]">
          <button
            type="button"
            onClick={openCreateModal}
            className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
          >
            Incluir
          </button>

          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Pesquisar por produto, código, SKU, barras ou NCM"
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          />

          <button
            type="button"
            onClick={() => setAppliedSearch(searchInput.trim())}
            className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}
          >
            Pesquisar
          </button>

          {showClearSearchButton ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setAppliedSearch('');
              }}
              className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}
            >
              Limpar consulta
            </button>
          ) : (
            <div />
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {[
            {
              value: 'ACTIVE' as const,
              label: 'Ativos',
              tone: 'bg-emerald-500',
              activeTone: 'bg-emerald-700',
            },
            {
              value: 'ALL' as const,
              label: 'Todos',
              tone: 'bg-slate-300',
              activeTone: 'bg-slate-700',
            },
            {
              value: 'INACTIVE' as const,
              label: 'Inativos',
              tone: 'bg-rose-300',
              activeTone: 'bg-rose-500',
            },
          ].map((item) => {
            const isActive = statusFilter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatusFilter(item.value)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black uppercase tracking-[0.14em] text-white transition ${
                  isActive ? item.activeTone : item.tone
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                {item.label}
              </button>
            );
          })}
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

      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} overflow-hidden`}>
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                Produtos encontrados
              </div>
              <div className="mt-1 text-xl font-black text-slate-900">
                {loading ? 'Carregando...' : `${products.length} registro(s)`}
              </div>
            </div>
            <div className="text-sm font-medium text-slate-500">
              Cadastro base do estoque por empresa financeira.
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-white">
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500"
                  >
                    {column.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {!loading && !products.length ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    className="px-6 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Nenhum produto foi encontrado para os filtros informados.
                  </td>
                </tr>
              ) : null}

              {products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/70">
                  {visibleColumns.map((column) => {
                    if (column.key === 'name') {
                      return (
                        <td key={column.key} className="px-4 py-4 align-top">
                          <div className="font-black uppercase tracking-[0.08em] text-slate-900">
                            {product.name}
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
                              ? `${formatStock(product.currentStock)} ${product.unitCode}`
                              : 'SEM CONTROLE'}
                          </div>
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

                    if (column.key === 'status') {
                      return (
                        <td key={column.key} className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                              product.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {product.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'}
                          </span>
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
                        onClick={() => openEditModal(product)}
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
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsColumnConfigOpen(true)}
              className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}
            >
              ☰ Colunas
            </button>
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className={FINANCE_GRID_PAGE_LAYOUT.footerIconButton}
              aria-label="Imprimir"
              title="Imprimir"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M6 9V3h12v6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 14h12v7H6z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <ScreenNameCopy
            screenId={PRODUCT_SCREEN_ID}
            className="justify-end"
            originText="Origem: Sistema Financeiro - frontend/src/app/produtos/page.tsx"
            auditText={screenAuditText}
          />
        </div>
      </section>

      {isFormOpen ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
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
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="min-h-0 flex-1 overflow-auto p-6">
              <div className="grid gap-6">
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
                          setFormState((current) => ({ ...current, internalCode: event.target.value }))
                        }
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

                    <button
                      type="button"
                      onClick={() =>
                        setFormState((current) => ({
                          ...current,
                          tracksInventory: !current.tracksInventory,
                        }))
                      }
                      className={`rounded-3xl border px-4 py-4 text-left transition ${
                        formState.tracksInventory
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <div className="text-sm font-black uppercase tracking-[0.16em]">
                        Controla estoque
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formState.tracksInventory ? 'Sim, este produto movimenta estoque.' : 'Não, apenas cadastro comercial/fiscal.'}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFormState((current) => ({
                          ...current,
                          allowFraction: !current.allowFraction,
                        }))
                      }
                      className={`rounded-3xl border px-4 py-4 text-left transition ${
                        formState.allowFraction
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <div className="text-sm font-black uppercase tracking-[0.16em]">
                        Permite fracionar
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formState.allowFraction ? 'Sim, aceita quantidade fracionada.' : 'Não, trabalha com quantidade inteira.'}
                      </div>
                    </button>
                  </div>
                </section>

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
            </form>
          </div>
        </div>
      ) : null}

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
        description={`A exportação respeita a busca atual e inclui ${products.length} registro(s).`}
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
            rows: products,
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
              schoolName: runtimeContext.companyName || products[0]?.companyName || 'FINANCEIRO',
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
