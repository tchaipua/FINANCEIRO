'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import { getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
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

const SCREEN_ID = 'FINANCEIRO_ESTOQUE_HISTORICO_MOVIMENTACAO';
const PRODUCT_FILTER_POPUP_SCREEN_ID =
  'FINANCEIRO_ESTOQUE_HISTORICO_MOVIMENTACAO_FILTRO_PRODUTO';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\estoque\\historico-movimentacao\\page.tsx';
const PRODUCT_FILTER_POPUP_ORIGIN_TEXT =
  'Origem: Sistema Financeiro - popup local em C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\estoque\\historico-movimentacao\\page.tsx';

type StockMovementItem = {
  id: string;
  branchCode: number;
  productId: string;
  productName: string;
  productInternalCode?: string | null;
  productBarcode?: string | null;
  productUnitCode?: string | null;
  movementType: string;
  movementTypeLabel: string;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  unitCost?: number | null;
  sourceType: string;
  sourceDocument?: string | null;
  sourceAccessKey?: string | null;
  notes?: string | null;
  occurredAt: string;
  createdBy?: string | null;
};

type ProductFilterItem = {
  id: string;
  name: string;
  internalCode?: string | null;
  barcode?: string | null;
  unitCode?: string | null;
  status?: string | null;
};

type MovementTypeFilter = 'ALL' | 'ENTRY' | 'EXIT';
type MovementGridColumnKey =
  | 'occurredAt'
  | 'movementType'
  | 'product'
  | 'quantity'
  | 'previousStock'
  | 'resultingStock'
  | 'source'
  | 'createdBy'
  | 'notes';

const auditText = `--- LOGICA DA TELA ---
Esta tela lista o historico de movimentacoes de estoque gravado pelo Financeiro.

TABELAS PRINCIPAIS:
- stock_movements (SM) - historico append-only das movimentacoes que alteraram saldo.
- products (PR) - cadastro do produto movimentado.
- payable_invoice_imports (PII) - origem fiscal quando a movimentacao veio de NF-e.
- payable_invoice_import_items (PII_ITEM) - item da nota que gerou a movimentacao.

RELACIONAMENTOS:
- SM.companyId -> companies.id
- SM.productId -> products.id
- SM.sourceImportId -> payable_invoice_imports.id
- SM.sourceImportItemId -> payable_invoice_import_items.id

METRICAS / CAMPOS EXIBIDOS:
- data/hora da movimentacao
- tipo de movimento
- produto
- quantidade movimentada
- saldo anterior
- saldo resultante
- documento de origem
- usuario/operador e observacao

FILTROS APLICADOS AGORA:
- sourceSystem e sourceTenantId da vertical consumidora
- sourceBranchCode da filial operacional
- busca textual por produto, codigo, codigo de barras, nota, chave de acesso ou observacao
- filtro visual por tipo: entradas, todos ou saidas

ORDENACAO:
- movimentacoes mais recentes primeiro.

OBSERVACAO:
- Esta tela nao cadastra movimentos. Ela apenas exibe o resultado das movimentacoes geradas por fluxos operacionais do estoque.`;

const sqlText = `SELECT
  SM.id,
  SM.occurredAt,
  SM.movementType,
  PR.name AS productName,
  SM.quantity,
  SM.previousStock,
  SM.resultingStock,
  PII.invoiceNumber,
  SM.createdBy
FROM stock_movements SM
JOIN products PR ON PR.id = SM.productId
LEFT JOIN payable_invoice_imports PII ON PII.id = SM.sourceImportId
WHERE SM.companyId = :companyId
  AND SM.branchCode = :sourceBranchCode
  AND SM.canceledAt IS NULL
ORDER BY SM.occurredAt DESC, SM.createdAt DESC;`;

type StockMovementAuditParams = {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  sourceBranchCode?: number | null;
  search: string;
  selectedProductId?: string | null;
  selectedProductName?: string | null;
  movementType: MovementTypeFilter;
  displayedRowsCount: number;
};

function buildStockMovementAuditSql(params: StockMovementAuditParams) {
  const search = params.search.trim().toUpperCase();
  const movementType = String(params.movementType || 'ALL').toUpperCase();

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :sourceBranchCode = ${toSqlLiteral(params.sourceBranchCode ?? '')}
-- :search = ${toSqlLiteral(search)}
-- :productId = ${toSqlLiteral(params.selectedProductId || '')}
-- :movementType = ${toSqlLiteral(movementType)}

SELECT
  SM.id,
  SM.occurredAt,
  SM.movementType,
  PR.name AS productName,
  SM.quantity,
  SM.previousStock,
  SM.resultingStock,
  PII.invoiceNumber,
  SM.createdBy
FROM stock_movements SM
JOIN companies CO ON CO.id = SM.companyId
JOIN products PR ON PR.id = SM.productId
LEFT JOIN payable_invoice_imports PII ON PII.id = SM.sourceImportId
WHERE CO.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND SM.branchCode = ${toSqlLiteral(params.sourceBranchCode ?? '')}
  AND SM.canceledAt IS NULL
  AND (${toSqlLiteral(movementType)} = 'ALL' OR SM.movementType = ${toSqlLiteral(movementType)})
  AND (${toSqlLiteral(params.selectedProductId || '')} = '' OR SM.productId = ${toSqlLiteral(params.selectedProductId || '')})
  AND (
    ${toSqlLiteral(search)} = ''
    OR UPPER(COALESCE(PR.name, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(PR.internalCode, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(PR.barcode, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(PII.invoiceNumber, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(PII.accessKey, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(SM.notes, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
  )
ORDER BY SM.occurredAt DESC, SM.createdAt DESC;`;
}

function buildStockMovementAuditText(params: StockMovementAuditParams) {
  const search = params.search.trim().toUpperCase();
  const movementType = String(params.movementType || 'ALL').toUpperCase();

  return `--- LOGICA DA TELA ---
Esta tela lista o historico de movimentacoes de estoque gravado pelo Financeiro.

TABELAS PRINCIPAIS:
- stock_movements (SM) - historico append-only das movimentacoes que alteraram saldo
- products (PR) - cadastro do produto movimentado
- payable_invoice_imports (PII) - origem fiscal quando a movimentacao veio de NF-e
- companies (CO) - empresa financeira resolvida por origem

RELACIONAMENTOS:
- SM.companyId = companies.id
- SM.productId = products.id
- SM.sourceImportId = payable_invoice_imports.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- filial origem (:sourceBranchCode): ${formatAuditValue(params.sourceBranchCode, '1')}
- busca digitada (:search): ${formatAuditValue(search)}
- produto selecionado (:productId): ${formatAuditValue(params.selectedProductName || params.selectedProductId)}
- tipo de movimento (:movementType): ${movementType}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: movimentacao DESC, criacao DESC

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- CO.sourceSystem e CO.sourceTenantId isolam os dados da empresa/sistema de origem
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

const MOVEMENT_GRID_COLUMNS: GridColumnDefinition<StockMovementItem, MovementGridColumnKey>[] = [
  {
    key: 'occurredAt',
    label: 'Data/Hora',
    getValue: (item) => formatDateTime(item.occurredAt),
  },
  {
    key: 'movementType',
    label: 'Tipo',
    getValue: (item) => item.movementTypeLabel,
  },
  {
    key: 'product',
    label: 'Produto',
    getValue: (item) => item.productName,
  },
  {
    key: 'quantity',
    label: 'Quantidade',
    getValue: (item) => `${formatQuantity(item.quantity)} ${item.productUnitCode || ''}`.trim(),
    align: 'right',
  },
  {
    key: 'previousStock',
    label: 'Saldo anterior',
    getValue: (item) => formatQuantity(item.previousStock),
    align: 'right',
  },
  {
    key: 'resultingStock',
    label: 'Saldo final',
    getValue: (item) => formatQuantity(item.resultingStock),
    align: 'right',
  },
  {
    key: 'source',
    label: 'Origem',
    getValue: (item) => item.sourceDocument || item.sourceType || '---',
  },
  {
    key: 'createdBy',
    label: 'Usuário',
    getValue: (item) => item.createdBy || '---',
  },
  {
    key: 'notes',
    label: 'Observação',
    getValue: (item) => item.notes || '---',
  },
];

const DEFAULT_MOVEMENT_GRID_CONFIG = {
  order: MOVEMENT_GRID_COLUMNS.map((column) => column.key),
  hidden: ['notes'] as MovementGridColumnKey[],
};

function getMovementGridStorageKey(sourceTenantId?: string | null) {
  return `financeiro:estoque-historico:grid-columns:${sourceTenantId || 'default'}`;
}

function getMovementExportStorageKey(sourceTenantId?: string | null) {
  return `financeiro:estoque-historico:export-config:${sourceTenantId || 'default'}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function formatQuantity(value?: number | null) {
  const normalized = Number(value || 0);
  return normalized.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(normalized) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function readStoredGridConfig(storageKey: string) {
  if (typeof window === 'undefined') return DEFAULT_MOVEMENT_GRID_CONFIG;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return DEFAULT_MOVEMENT_GRID_CONFIG;
    const parsed = JSON.parse(stored) as Partial<typeof DEFAULT_MOVEMENT_GRID_CONFIG>;
    const validKeys = new Set(MOVEMENT_GRID_COLUMNS.map((column) => column.key));
    const order = (parsed.order || []).filter((key): key is MovementGridColumnKey =>
      validKeys.has(key as MovementGridColumnKey),
    );
    const hidden = (parsed.hidden || []).filter((key): key is MovementGridColumnKey =>
      validKeys.has(key as MovementGridColumnKey),
    );

    return {
      order: [
        ...order,
        ...DEFAULT_MOVEMENT_GRID_CONFIG.order.filter((key) => !order.includes(key)),
      ],
      hidden,
    };
  } catch {
    return DEFAULT_MOVEMENT_GRID_CONFIG;
  }
}

function writeStoredGridConfig(
  storageKey: string,
  order: MovementGridColumnKey[],
  hidden: MovementGridColumnKey[],
) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify({ order, hidden }));
}

function MovementGridConfigModal({
  isOpen,
  order,
  hidden,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  order: MovementGridColumnKey[];
  hidden: MovementGridColumnKey[];
  onSave: (order: MovementGridColumnKey[], hidden: MovementGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftOrder, setDraftOrder] = useState(order);
  const [draftHidden, setDraftHidden] = useState(hidden);

  useEffect(() => {
    if (!isOpen) return;
    setDraftOrder(order);
    setDraftHidden(hidden);
  }, [hidden, isOpen, order]);

  if (!isOpen) return null;

  const toggleColumnVisibility = (columnKey: MovementGridColumnKey) => {
    setDraftHidden((current) =>
      current.includes(columnKey)
        ? current.filter((item) => item !== columnKey)
        : [...current, columnKey],
    );
  };

  const moveColumn = (columnKey: MovementGridColumnKey, direction: -1 | 1) => {
    setDraftOrder((current) => {
      const index = current.indexOf(columnKey);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [removed] = next.splice(index, 1);
      next.splice(nextIndex, 0, removed);
      return next;
    });
  };

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
              Reordene, oculte ou inclua colunas do histórico de estoque.
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

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="grid gap-3">
            {draftOrder.map((columnKey) => {
              const column = MOVEMENT_GRID_COLUMNS.find((item) => item.key === columnKey);
              if (!column) return null;
              const isHidden = draftHidden.includes(columnKey);

              return (
                <div
                  key={column.key}
                  className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 transition ${
                    isHidden ? 'border-slate-200 bg-white' : 'border-emerald-300 bg-emerald-100/90'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => toggleColumnVisibility(column.key)}
                      aria-pressed={!isHidden}
                      title={!isHidden ? 'Esta coluna está sendo usada no grid' : 'Esta coluna não está sendo usada no grid'}
                      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-sm transition-transform hover:scale-105 ${
                        isHidden
                          ? 'border-rose-200 bg-rose-500 text-white shadow-rose-200/80'
                          : 'border-emerald-200 bg-emerald-500 text-white shadow-emerald-200/80'
                      }`}
                    >
                      {isHidden ? '×' : '✓'}
                    </button>
                    <div>
                      <div className="text-sm font-black text-slate-800">{column.label}</div>
                      <div className="text-xs font-medium text-slate-500">
                        {isHidden ? 'Oculta no grid atual.' : 'Visível no grid atual.'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveColumn(column.key, -1)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                      title="Mover para cima"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(column.key, 1)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                      title="Mover para baixo"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 border-t border-slate-100 px-6 py-5">
          <button
            type="button"
            onClick={() => {
              setDraftOrder(DEFAULT_MOVEMENT_GRID_CONFIG.order);
              setDraftHidden(DEFAULT_MOVEMENT_GRID_CONFIG.hidden);
            }}
            className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}
          >
            Restaurar padrão
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draftOrder, draftHidden);
              onClose();
            }}
            className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductFilterModal({
  isOpen,
  products,
  search,
  isLoading,
  errorMessage,
  runtimeContext,
  onSearchChange,
  onSelect,
  onClear,
  onClose,
}: {
  isOpen: boolean;
  products: ProductFilterItem[];
  search: string;
  isLoading: boolean;
  errorMessage: string | null;
  runtimeContext: ReturnType<typeof useFinanceRuntimeContext>;
  onSearchChange: (value: string) => void;
  onSelect: (product: ProductFilterItem) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <AuditedPopupShell
      isOpen={isOpen}
      screenId={PRODUCT_FILTER_POPUP_SCREEN_ID}
      title="Escolher produto"
      eyebrow="Filtro do histórico"
      description="Selecione um único produto para filtrar as movimentações de estoque."
      brandingName={runtimeContext.companyName}
      logoUrl={runtimeContext.logoUrl}
      originText={PRODUCT_FILTER_POPUP_ORIGIN_TEXT}
      auditText={`--- LOGICA DO POPUP ---
Este popup lista produtos da empresa/filial atual para escolher um unico produto como filtro do historico de movimentacao.

TABELAS PRINCIPAIS:
- products (PR) - cadastro financeiro generico de produtos
- stock_movements (SM) - movimentos filtrados pelo produto selecionado na tela principal

FILTROS APLICADOS:
- sourceSystem: ${formatAuditValue(runtimeContext.sourceSystem)}
- sourceTenantId: ${formatTenantAuditValue(runtimeContext.sourceTenantId)}
- sourceBranchCode: ${formatAuditValue(runtimeContext.sourceBranchCode, '1')}
- busca do popup: ${formatAuditValue(search.trim().toUpperCase())}`}
      sqlText={`SELECT
  PR.id,
  PR.name,
  PR.internalCode,
  PR.barcode,
  PR.unitCode
FROM products PR
JOIN companies CO ON CO.id = PR.companyId
WHERE CO.sourceSystem = ${toSqlLiteral(runtimeContext.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(runtimeContext.sourceTenantId || '')}
  AND PR.canceledAt IS NULL
  AND (
    ${toSqlLiteral(search.trim().toUpperCase())} = ''
    OR UPPER(COALESCE(PR.name, '')) LIKE '%' || UPPER(${toSqlLiteral(search.trim().toUpperCase())}) || '%'
    OR UPPER(COALESCE(PR.internalCode, '')) LIKE '%' || UPPER(${toSqlLiteral(search.trim().toUpperCase())}) || '%'
    OR UPPER(COALESCE(PR.barcode, '')) LIKE '%' || UPPER(${toSqlLiteral(search.trim().toUpperCase())}) || '%'
  )
ORDER BY PR.name ASC;`}
      onClose={onClose}
      panelClassName="max-w-5xl"
      bodyClassName="p-5"
      footerActions={
        <button
          type="button"
          onClick={onClear}
          className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}
        >
          Limpar produto
        </button>
      }
    >
      <div className="grid gap-4">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Pesquisar produto por nome, código ou código de barras"
          className={FINANCE_GRID_PAGE_LAYOUT.input}
        />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="max-h-[48vh] overflow-y-auto rounded-2xl border border-slate-200">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-500">
              Carregando produtos...
            </div>
          ) : null}

          {!isLoading && !products.length ? (
            <div className="px-5 py-8 text-center text-sm font-semibold text-slate-500">
              Nenhum produto localizado para os filtros informados.
            </div>
          ) : null}

          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onSelect(product)}
              className="flex w-full items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 text-left transition last:border-b-0 hover:bg-emerald-50"
            >
              <div>
                <div className="font-black uppercase tracking-[0.08em] text-slate-900">
                  {product.name}
                </div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {[product.internalCode, product.barcode, product.unitCode]
                    .filter(Boolean)
                    .join(' | ') || 'SEM CODIGO'}
                </div>
              </div>
              <span className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm">
                Selecionar
              </span>
            </button>
          ))}
        </div>
      </div>
    </AuditedPopupShell>
  );
}

export default function FinanceiroEstoqueHistoricoMovimentacaoPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [products, setProducts] = useState<ProductFilterItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductFilterItem | null>(null);
  const [initialProductFilterReady, setInitialProductFilterReady] = useState(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState<MovementTypeFilter>('ALL');
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isProductLoading, setIsProductLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [productErrorMessage, setProductErrorMessage] = useState<string | null>(null);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState(() =>
    buildDefaultExportColumns(MOVEMENT_GRID_COLUMNS),
  );
  const [columnOrder, setColumnOrder] = useState<MovementGridColumnKey[]>(
    DEFAULT_MOVEMENT_GRID_CONFIG.order,
  );
  const [hiddenColumns, setHiddenColumns] = useState<MovementGridColumnKey[]>(
    DEFAULT_MOVEMENT_GRID_CONFIG.hidden,
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = String(params.get('productId') || '').trim();
    const productName = String(params.get('productName') || '').trim();
    if (productId) {
      setSelectedProduct({
        id: productId,
        name: productName || 'PRODUTO SELECIONADO',
      });
    }
    setInitialProductFilterReady(true);
  }, []);

  useEffect(() => {
    if (!runtimeContext.embedded) return;

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: 'PRINCIPAL_FINANCEIRO_ESTOQUE_HISTORICO_MOVIMENTACAO',
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  useEffect(() => {
    const handleEmbeddedBackNavigation = (event: MessageEvent) => {
      const data = event.data as { type?: string; screenId?: string } | null;
      if (event.source !== window.parent) return;
      if (!data || data.type !== 'MSINFOR_FINANCEIRO_NAVIGATE_BACK') return;
      if (data.screenId !== 'PRINCIPAL_FINANCEIRO_ESTOQUE_HISTORICO_MOVIMENTACAO') return;

      const params = new URLSearchParams(window.location.search);
      const historyOrigin = params.get('historyOrigin');
      params.delete('historyOrigin');
      params.delete('productId');
      params.delete('productName');
      const query = params.toString();
      const destination = historyOrigin === 'PRODUCTS' ? '/produtos' : '/estoque';

      window.location.replace(`${destination}${query ? `?${query}` : ''}`);
    };

    window.addEventListener('message', handleEmbeddedBackNavigation);
    return () => window.removeEventListener('message', handleEmbeddedBackNavigation);
  }, []);

  useEffect(() => {
    const storageKey = getMovementGridStorageKey(runtimeContext.sourceTenantId);
    const storedConfig = readStoredGridConfig(storageKey);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
  }, [runtimeContext.sourceTenantId]);

  const loadMovements = useCallback(async () => {
    if (!initialProductFilterReady) return;
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setMovements([]);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await getJson<StockMovementItem[]>(
        `/products/stock-movements${buildFinanceApiQueryString(runtimeContext, {
          search: appliedSearch,
          movementType: movementTypeFilter,
          productId: selectedProduct?.id || null,
          sourceBranchCode: runtimeContext.sourceBranchCode,
        })}`,
      );
      setMovements(data);
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(error, 'Não foi possível carregar o histórico de estoque.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, initialProductFilterReady, movementTypeFilter, runtimeContext, selectedProduct?.id]);

  const loadProducts = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !isProductModalOpen) {
      setProducts([]);
      return;
    }

    setIsProductLoading(true);
    setProductErrorMessage(null);

    try {
      const data = await getJson<ProductFilterItem[]>(
        `/products${buildFinanceApiQueryString(runtimeContext, {
          search: productSearch.trim(),
          status: 'ACTIVE',
          sourceBranchCode: runtimeContext.sourceBranchCode,
        })}`,
      );
      setProducts(data);
    } catch (error) {
      setProductErrorMessage(
        getFriendlyRequestErrorMessage(error, 'Não foi possível carregar os produtos.'),
      );
    } finally {
      setIsProductLoading(false);
    }
  }, [isProductModalOpen, productSearch, runtimeContext]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedMovementId(null);
  }, [appliedSearch, movementTypeFilter, selectedProduct?.id]);

  const activeColumns = useMemo(
    () =>
      columnOrder
        .map((columnKey) => MOVEMENT_GRID_COLUMNS.find((column) => column.key === columnKey))
        .filter(
          (
            column,
          ): column is GridColumnDefinition<StockMovementItem, MovementGridColumnKey> =>
            Boolean(column),
        )
        .filter((column) => !hiddenColumns.includes(column.key)),
    [columnOrder, hiddenColumns],
  );
  const stockMovementAuditContext = useMemo(() => {
    const auditParams: StockMovementAuditParams = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceBranchCode: runtimeContext.sourceBranchCode,
      search: appliedSearch,
      selectedProductId: selectedProduct?.id,
      selectedProductName: selectedProduct?.name,
      movementType: movementTypeFilter,
      displayedRowsCount: movements.length,
    };

    return {
      auditText: buildStockMovementAuditText(auditParams),
      sqlText: buildStockMovementAuditSql(auditParams),
    };
  }, [
    appliedSearch,
    movementTypeFilter,
    movements.length,
    runtimeContext.sourceBranchCode,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    selectedProduct?.id,
    selectedProduct?.name,
  ]);

  const showClearSearchButton = Boolean(
    searchInput.trim() || appliedSearch.trim() || selectedProduct,
  );
  const totalPages = Math.max(1, Math.ceil(movements.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedMovements = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return movements.slice(start, start + pageSize);
  }, [movements, pageSize, safeCurrentPage]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(Math.max(1, page), totalPages));
  };

  return (
    <div className="flex h-[calc(100vh-1.5rem)] min-h-0 flex-col gap-4">
      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} p-6`}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(searchInput.trim());
          }}
          className="grid gap-4 xl:grid-cols-[1fr_auto_auto_auto]"
        >
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Pesquisar por produto, nota, chave, código ou observação"
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          />

          <button type="submit" className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}>
            Pesquisar
          </button>

          <button
            type="button"
            onClick={() => setIsProductModalOpen(true)}
            className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-emerald-700"
          >
            Produto
          </button>

          {showClearSearchButton ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setAppliedSearch('');
                setSelectedProduct(null);
              }}
              className={FINANCE_GRID_PAGE_LAYOUT.footerActionButton}
            >
              Limpar consulta
            </button>
          ) : (
            <div />
          )}
        </form>

        {selectedProduct ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-emerald-800">
            Produto filtrado: {selectedProduct.name}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {errorMessage}
          </div>
        ) : null}
      </section>

      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                Movimentações encontradas
              </div>
              <div className="mt-1 text-xl font-black text-slate-900">
                {isLoading ? 'Carregando...' : `${movements.length} registro(s)`}
              </div>
            </div>
            <div className="text-sm font-medium text-slate-500">
              Filial {runtimeContext.sourceBranchCode}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_rgba(148,163,184,0.35)]">
              <tr>
                {activeColumns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {!isLoading && !movements.length ? (
                <tr>
                  <td
                    colSpan={activeColumns.length || 1}
                    className="px-6 py-10 text-center text-sm font-semibold text-slate-500"
                  >
                    Nenhuma movimentação de estoque foi localizada para os filtros informados.
                  </td>
                </tr>
              ) : null}

              {paginatedMovements.map((movement, rowIndex) => {
                const isSelected = selectedMovementId === movement.id;
                const zebraClass = rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-200/70';

                return (
                  <tr
                    key={movement.id}
                    aria-selected={isSelected}
                    onClick={() => setSelectedMovementId(movement.id)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-100 outline outline-2 -outline-offset-2 outline-blue-400'
                        : `${zebraClass} hover:bg-slate-300/70`
                    }`}
                  >
                    {activeColumns.map((column) => {
                      if (column.key === 'product') {
                        return (
                          <td key={column.key} className="px-4 py-4 align-top">
                            <div className="font-black uppercase tracking-[0.08em] text-slate-900">
                              {movement.productName}
                            </div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {movement.productInternalCode || movement.productBarcode || '---'}
                            </div>
                          </td>
                        );
                      }

                      if (column.key === 'movementType') {
                        const isEntry = movement.movementType === 'ENTRY';
                        const isExit = movement.movementType === 'EXIT';
                        return (
                          <td key={column.key} className="px-4 py-4 align-top">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                                isEntry
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : isExit
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}
                            >
                              {movement.movementTypeLabel}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={column.key}
                          className={`px-4 py-4 align-top text-sm font-semibold text-slate-700 ${
                            column.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {column.getValue(movement)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid shrink-0 gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 xl:grid-cols-[1fr_auto_1fr] xl:items-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsColumnConfigOpen(true)}
              title="ALTERAR COLUNAS GRID"
              aria-label="ALTERAR COLUNAS GRID"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5v14M15 5v14" />
              </svg>
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

          <div className="flex items-center justify-center gap-2">
            {[
              {
                value: 'ENTRY' as const,
                label: 'Entradas',
                tone: 'bg-emerald-500',
                activeTone: 'bg-emerald-700',
              },
              {
                value: 'ALL' as const,
                label: 'Todos',
                tone: 'bg-amber-200',
                activeTone: 'bg-amber-400',
              },
              {
                value: 'EXIT' as const,
                label: 'Saídas',
                tone: 'bg-rose-200',
                activeTone: 'bg-rose-400',
              },
            ].map((item) => {
              const isActive = movementTypeFilter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMovementTypeFilter(item.value)}
                  aria-label={item.label}
                  title={item.label}
                  aria-pressed={isActive}
                  className={`relative h-6 w-14 rounded-full border transition duration-200 ${
                    isActive
                      ? `${item.activeTone} border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35),0_8px_24px_rgba(15,23,42,0.22)] ring-4 ring-slate-400 ring-offset-2 ring-offset-slate-100 scale-105`
                      : `${item.tone} border-transparent opacity-55 hover:opacity-85`
                  }`}
                >
                  <span
                    className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm ${
                      isActive ? 'right-1' : 'left-1'
                    }`}
                  />
                  <span className="sr-only">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm">
              Total registros: <span className="ml-1 text-blue-700">{movements.length}</span>
            </div>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
              className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 outline-none"
              aria-label="Quantidade por página"
              title="Quantidade por página"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={safeCurrentPage <= 1}
              className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 disabled:opacity-40"
              aria-label="Primeira página"
              title="Primeira página"
            >
              &lt;&lt;
            </button>
            <button
              type="button"
              onClick={() => goToPage(safeCurrentPage - 1)}
              disabled={safeCurrentPage <= 1}
              className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 disabled:opacity-40"
              aria-label="Página anterior"
              title="Página anterior"
            >
              &lt;
            </button>
            <div className="min-w-20 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              {safeCurrentPage}/{totalPages}
            </div>
            <button
              type="button"
              onClick={() => goToPage(safeCurrentPage + 1)}
              disabled={safeCurrentPage >= totalPages}
              className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 disabled:opacity-40"
              aria-label="Próxima página"
              title="Próxima página"
            >
              &gt;
            </button>
            <button
              type="button"
              onClick={() => goToPage(totalPages)}
              disabled={safeCurrentPage >= totalPages}
              className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 disabled:opacity-40"
              aria-label="Última página"
              title="Última página"
            >
              &gt;&gt;
            </button>
            {!runtimeContext.embedded ? (
              <ScreenNameCopy
                screenId={SCREEN_ID}
                className="justify-end"
                originText={ORIGIN_TEXT}
                auditText={stockMovementAuditContext.auditText || auditText}
                sqlText={stockMovementAuditContext.sqlText || sqlText}
              />
            ) : null}
          </div>
        </div>
      </section>

      <MovementGridConfigModal
        isOpen={isColumnConfigOpen}
        order={columnOrder}
        hidden={hiddenColumns}
        onSave={(order, hidden) => {
          setColumnOrder(order);
          setHiddenColumns(hidden);
          writeStoredGridConfig(getMovementGridStorageKey(runtimeContext.sourceTenantId), order, hidden);
        }}
        onClose={() => setIsColumnConfigOpen(false)}
      />

      <ProductFilterModal
        isOpen={isProductModalOpen}
        products={products}
        search={productSearch}
        isLoading={isProductLoading}
        errorMessage={productErrorMessage}
        runtimeContext={runtimeContext}
        onSearchChange={setProductSearch}
        onSelect={(product) => {
          setSelectedProduct(product);
          setIsProductModalOpen(false);
        }}
        onClear={() => {
          setSelectedProduct(null);
          setProductSearch('');
          setIsProductModalOpen(false);
        }}
        onClose={() => setIsProductModalOpen(false)}
      />

      <GridExportModal
        isOpen={isExportModalOpen}
        title="Exportar histórico de estoque"
        description={`A exportação respeita a busca atual e inclui ${movements.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={MOVEMENT_GRID_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={getMovementExportStorageKey(runtimeContext.sourceTenantId)}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: movements,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) =>
                    MOVEMENT_GRID_COLUMNS.find((definition) => definition.key === key),
                  )
                  .filter(
                    (column): column is GridColumnDefinition<StockMovementItem, MovementGridColumnKey> =>
                      Boolean(column),
                  )
              : MOVEMENT_GRID_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            fileBaseName: 'historico-movimentacao-estoque',
            branding: {
              title: 'Histórico de estoque',
              subtitle: 'Exportação com os filtros atualmente aplicados.',
              schoolName: runtimeContext.companyName || 'FINANCEIRO',
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
