'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
import InactivationConfirmationPopup from '@/app/components/inactivation-confirmation-popup';
import { getJson, requestJson } from '@/app/lib/api';
import { getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildDefaultExportColumns, exportGridRows, type GridColumnDefinition, type GridExportFormat } from '@/app/lib/grid-export-utils';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import { buildFinanceApiQueryString, type FinanceRuntimeContext } from '@/app/lib/runtime-context';

export const GROUP_PRODUCTS_POPUP_SCREEN_ID = 'POPUP_FINANCEIRO_ESTOQUE_GRUPO_SUBGRUPO_PRODUTOS_CONSULTA';
const PRODUCT_CLASSIFICATION_EDIT_SCREEN_ID = 'POPUP_FINANCEIRO_ESTOQUE_PRODUTO_CLASSIFICACAO_EDICAO';

type ClassificationRow = {
  id: string;
  type: 'GROUP' | 'SUBGROUP';
  groupId?: string;
  groupName?: string | null;
  name: string;
  status: string;
};

type ProductPopupRow = {
  id: string;
  name: string;
  status: string;
  internalCode?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  subgroupId?: string | null;
  subgroupName?: string | null;
  unitCode?: string | null;
  currentStock?: number | null;
  tracksInventory?: boolean;
};

type ProductPopupColumnKey = 'name' | 'internalCode' | 'groupName' | 'subgroupName' | 'stock';
type ProductPopupFilters = Record<ProductPopupColumnKey, string>;
type ProductPopupSort = { key: ProductPopupColumnKey | null; direction: 'ASC' | 'DESC' };
type ProductClassificationForm = { product: ProductPopupRow; groupId: string; subgroupId: string };

const PRODUCT_COLUMNS: GridColumnDefinition<ProductPopupRow, ProductPopupColumnKey>[] = [
  { key: 'name', label: 'Produto', getValue: (row) => row.name },
  { key: 'internalCode', label: 'Código interno', getValue: (row) => row.internalCode || '---' },
  { key: 'groupName', label: 'Grupo', getValue: (row) => row.groupName || '---' },
  { key: 'subgroupName', label: 'Subgrupo', getValue: (row) => row.subgroupName || '---' },
  { key: 'stock', label: 'Estoque', getValue: (row) => row.tracksInventory ? `${row.currentStock ?? 0} ${row.unitCode || 'UN'}` : 'SEM CONTROLE' },
];

const EMPTY_FILTERS: ProductPopupFilters = {
  name: '', internalCode: '', groupName: '', subgroupName: '', stock: '',
};

function normalizeFilter(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function rowValue(row: ProductPopupRow, key: ProductPopupColumnKey) {
  return PRODUCT_COLUMNS.find((column) => column.key === key)?.getValue(row) || '';
}

function statusDot(status: string) {
  return status === 'ACTIVE' ? 'bg-emerald-500 shadow-emerald-300' : 'bg-rose-500 shadow-rose-300';
}

function ProductClassificationEditPopup({
  form,
  rows,
  runtimeContext,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  form: ProductClassificationForm | null;
  rows: ClassificationRow[];
  runtimeContext: FinanceRuntimeContext;
  saving: boolean;
  onChange: (next: ProductClassificationForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!form) return null;

  const groups = rows.filter((row) => row.type === 'GROUP' && (row.status === 'ACTIVE' || row.id === form.groupId));
  const subgroups = rows.filter((row) => row.type === 'SUBGROUP' && row.groupId === form.groupId && (row.status === 'ACTIVE' || row.id === form.subgroupId));

  return (
    <AuditedPopupShell
      isOpen
      screenId={PRODUCT_CLASSIFICATION_EDIT_SCREEN_ID}
      eyebrow="Classificação do produto"
      title="Alterar grupo e subgrupo"
      description={`Produto: ${form.product.name}`}
      brandingName={runtimeContext.companyName}
      logoUrl={runtimeContext.logoUrl}
      onClose={onClose}
      panelClassName="max-w-2xl"
      headerTheme="blue"
      screenIdRightAligned
      footerActions={
        <div className="flex w-full justify-start">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M5 4h12l2 2v14H5V4Z" strokeLinejoin="round" />
              <path d="M8 4v6h8V4M8 20v-6h8v6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {saving ? 'Salvando...' : 'Salvar classificação'}
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Grupo</span>
          <select
            value={form.groupId}
            onChange={(event) => onChange({ ...form, groupId: event.target.value, subgroupId: '' })}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          >
            <option value="">Selecione o grupo</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Subgrupo</span>
          <select
            value={form.subgroupId}
            disabled={!form.groupId}
            onChange={(event) => onChange({ ...form, subgroupId: event.target.value })}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          >
            <option value="">Sem subgrupo</option>
            {subgroups.map((subgroup) => <option key={subgroup.id} value={subgroup.id}>{subgroup.name}</option>)}
          </select>
        </label>
      </div>
    </AuditedPopupShell>
  );
}

export default function GroupProductsPopup({
  classification,
  rows,
  runtimeContext,
  brandingName,
  logoUrl,
  onClose,
  onChanged,
}: {
  classification: ClassificationRow | null;
  rows: ClassificationRow[];
  runtimeContext: FinanceRuntimeContext;
  brandingName: string | null;
  logoUrl: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [products, setProducts] = useState<ProductPopupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  const [filters, setFilters] = useState<ProductPopupFilters>({ ...EMPTY_FILTERS });
  const [filterDrafts, setFilterDrafts] = useState<ProductPopupFilters>({ ...EMPTY_FILTERS });
  const [openFilter, setOpenFilter] = useState<ProductPopupColumnKey | null>(null);
  const [sort, setSort] = useState<ProductPopupSort>({ key: null, direction: 'ASC' });
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState(buildDefaultExportColumns(PRODUCT_COLUMNS));
  const [editingProduct, setEditingProduct] = useState<ProductClassificationForm | null>(null);
  const [savingClassification, setSavingClassification] = useState(false);
  const [pendingInactivation, setPendingInactivation] = useState<ProductPopupRow | null>(null);
  const [statusProductId, setStatusProductId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!classification || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    setLoading(true);
    setError(null);
    try {
      const query = buildFinanceApiQueryString(runtimeContext, {
        groupId: classification.type === 'GROUP' ? classification.id : classification.groupId,
        subgroupId: classification.type === 'SUBGROUP' ? classification.id : null,
        status: 'ALL',
      });
      setProducts(await getJson<ProductPopupRow[]>(`/products${query}`));
    } catch (currentError) {
      setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível carregar os produtos da classificação.'));
    } finally {
      setLoading(false);
    }
  }, [classification, runtimeContext]);

  useEffect(() => {
    setStatusFilter('ACTIVE');
    setFilters({ ...EMPTY_FILTERS });
    setFilterDrafts({ ...EMPTY_FILTERS });
    setQuickSearch('');
    setPage(1);
    void loadProducts();
  }, [classification?.id, loadProducts]);

  const filteredProducts = useMemo(() => {
    const search = normalizeFilter(quickSearch);
    const result = products.filter((product) => {
      if (statusFilter !== 'ALL' && product.status !== statusFilter) return false;
      if (search && ![product.name, product.internalCode, product.groupName, product.subgroupName].some((value) => normalizeFilter(value).includes(search))) return false;
      return PRODUCT_COLUMNS.every((column) => {
        const filter = normalizeFilter(filters[column.key]);
        return !filter || normalizeFilter(rowValue(product, column.key)).includes(filter);
      });
    });
    if (!sort.key) return result;
    return [...result].sort((left, right) => {
      const comparison = normalizeFilter(rowValue(left, sort.key!)).localeCompare(normalizeFilter(rowValue(right, sort.key!)), 'pt-BR', { numeric: true });
      return sort.direction === 'DESC' ? -comparison : comparison;
    });
  }, [filters, products, quickSearch, sort, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [filters, pageSize, quickSearch, sort, statusFilter]);

  async function saveClassification() {
    if (!editingProduct || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    if (!editingProduct.groupId) {
      setError('Selecione o grupo do produto.');
      return;
    }
    setSavingClassification(true);
    setError(null);
    setSuccess(null);
    try {
      await requestJson(`/products/${editingProduct.product.id}/classification`, {
        method: 'PATCH',
        body: JSON.stringify({
          requestedBy: runtimeContext.cashierDisplayName || runtimeContext.userRole || 'FINANCEIRO_ESTOQUE',
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          groupId: editingProduct.groupId,
          subgroupId: editingProduct.subgroupId || null,
        }),
        fallbackMessage: 'Não foi possível alterar a classificação do produto.',
      });
      setEditingProduct(null);
      setSuccess('Grupo e subgrupo do produto alterados com sucesso.');
      await loadProducts();
      onChanged();
    } catch (currentError) {
      setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível alterar a classificação do produto.'));
    } finally {
      setSavingClassification(false);
    }
  }

  async function inactivateProduct(password: string, reason: string) {
    if (!pendingInactivation || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    setStatusProductId(pendingInactivation.id);
    setError(null);
    try {
      await requestJson(`/products/${pendingInactivation.id}/inactivate`, {
        method: 'POST',
        body: JSON.stringify({
          requestedBy: runtimeContext.cashierDisplayName || runtimeContext.userRole || 'FINANCEIRO_ESTOQUE',
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          password,
          reason,
        }),
        fallbackMessage: 'Não foi possível inativar o produto.',
      });
      setPendingInactivation(null);
      setSuccess('Produto inativado com sucesso.');
      await loadProducts();
      onChanged();
    } catch (currentError) {
      setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível inativar o produto.'));
    } finally {
      setStatusProductId(null);
    }
  }

  if (!classification) return null;

  const classificationLabel = classification.type === 'GROUP' ? 'grupo' : 'subgrupo';
  const classificationFilter = classification.type === 'GROUP' ? classification.name : `${classification.groupName || 'Grupo'} / ${classification.name}`;

  return (
    <>
      <AuditedPopupShell
        isOpen
        screenId={GROUP_PRODUCTS_POPUP_SCREEN_ID}
        eyebrow="Consulta do estoque"
        title="Produtos da classificação"
        description={`Produtos do ${classificationLabel}: ${classificationFilter}`}
        brandingName={brandingName}
        logoUrl={logoUrl}
        originText="Origem: Sistema Financeiro - consulta de produtos filtrada pela classificação selecionada."
        auditText="Grade exclusiva de produtos vinculados ao grupo ou subgrupo selecionado; não permite inclusão de novos produtos."
        sqlText="SELECT P.* FROM products P WHERE P.groupId = :groupId AND (:subgroupId IS NULL OR P.subgroupId = :subgroupId) ORDER BY P.name ASC;"
        onClose={onClose}
        panelClassName="max-w-7xl"
        headerTheme="blue"
        screenIdRightAligned
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
            placeholder="Pesquisar produto, código, grupo ou subgrupo"
            aria-label="Pesquisar produtos da classificação"
            className={`${FINANCE_GRID_PAGE_LAYOUT.input} flex-1`}
          />
          <button type="button" onClick={() => void loadProducts()} className="rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">Atualizar</button>
        </div>

        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}
        {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</div> : null}

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[980px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
              <tr>
                {PRODUCT_COLUMNS.map((column) => (
                  <th key={column.key} className="relative border-b border-slate-200 px-4 py-3">
                    <GridColumnFilterHeader
                      label={column.label}
                      filterType="text"
                      isOpen={openFilter === column.key}
                      isActive={Boolean(filters[column.key])}
                      filterValue={filterDrafts[column.key]}
                      sortDirection={sort.key === column.key ? sort.direction : null}
                      onToggle={() => setOpenFilter(openFilter === column.key ? null : column.key)}
                      onSort={(direction) => { setSort({ key: column.key, direction }); setOpenFilter(null); }}
                      onFilterValueChange={(value) => setFilterDrafts((current) => ({ ...current, [column.key]: value }))}
                      onApply={() => { setFilters((current) => ({ ...current, [column.key]: filterDrafts[column.key] })); setOpenFilter(null); }}
                      onClear={() => { setFilterDrafts((current) => ({ ...current, [column.key]: '' })); setFilters((current) => ({ ...current, [column.key]: '' })); setOpenFilter(null); }}
                    />
                  </th>
                ))}
                <th className="border-b border-slate-200 px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={PRODUCT_COLUMNS.length + 1} className="px-4 py-12 text-center font-bold text-slate-500">Carregando produtos...</td></tr> : null}
              {!loading && !visibleProducts.length ? <tr><td colSpan={PRODUCT_COLUMNS.length + 1} className="px-4 py-12 text-center font-bold text-slate-500">Nenhum produto encontrado para este filtro.</td></tr> : null}
              {!loading ? visibleProducts.map((product, index) => (
                <tr key={product.id} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                  {PRODUCT_COLUMNS.map((column) => column.key === 'name' ? (
                    <td key={column.key} className="px-4 py-3 font-black text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full shadow-md ${statusDot(product.status)}`} title={product.status === 'ACTIVE' ? 'Ativo' : 'Inativo'} />
                        <span>{product.name}</span>
                      </div>
                    </td>
                  ) : (
                    <td key={column.key} className="px-4 py-3 font-semibold text-slate-600">{column.getValue(product)}</td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingProduct({ product, groupId: product.groupId || '', subgroupId: product.subgroupId || '' })}
                        title={`Alterar grupo e subgrupo de ${product.name}`}
                        aria-label={`Alterar grupo e subgrupo de ${product.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100 hover:text-blue-900"
                      >
                        ✎
                      </button>
                      {product.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => setPendingInactivation(product)}
                          title={`Inativar produto ${product.name}`}
                          aria-label={`Inativar produto ${product.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 transition hover:bg-rose-100 hover:text-rose-900"
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>

        <GridStandardFooter
          statusFilter={statusFilter}
          totalRecords={filteredProducts.length}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onExport={() => setIsExportOpen(true)}
          onStatusFilterChange={setStatusFilter}
          onPageSizeChange={setPageSize}
          onPageChange={setPage}
        />
      </AuditedPopupShell>

      <ProductClassificationEditPopup
        form={editingProduct}
        rows={rows}
        runtimeContext={runtimeContext}
        saving={savingClassification}
        onChange={setEditingProduct}
        onClose={() => setEditingProduct(null)}
        onSave={() => void saveClassification()}
      />

      <InactivationConfirmationPopup
        isOpen={Boolean(pendingInactivation)}
        screenId="POPUP_FINANCEIRO_ESTOQUE_PRODUTO_INATIVAR"
        title="Inativar produto"
        targetName={pendingInactivation?.name || ''}
        description="Ao inativar o produto, o histórico de estoque e financeiro será preservado."
        brandingName={brandingName}
        logoUrl={logoUrl}
        onClose={() => setPendingInactivation(null)}
        onConfirm={(password, reason) => void inactivateProduct(password, reason)}
        isSaving={Boolean(pendingInactivation && statusProductId === pendingInactivation.id)}
      />

      <GridExportModal
        isOpen={isExportOpen}
        title="Exportar produtos da classificação"
        description={`A exportação respeita os filtros atuais e inclui ${filteredProducts.length} registro(s).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={PRODUCT_COLUMNS}
        selectedColumns={exportColumns}
        storageKey={`financeiro:estoque-grupo-produtos:export:${classification.id}`}
        onClose={() => setIsExportOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: filteredProducts,
            columns: PRODUCT_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            fileBaseName: 'produtos-da-classificacao',
            branding: { title: `Produtos - ${classificationFilter}`, schoolName: brandingName || 'FINANCEIRO', logoUrl },
            pdfOptions: config.pdfOptions,
          });
          setExportColumns(config.selectedColumns);
          setIsExportOpen(false);
        }}
      />
    </>
  );
}
