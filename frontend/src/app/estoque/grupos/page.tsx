'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import { formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildDefaultExportColumns, exportGridRows, type GridColumnDefinition, type GridExportFormat } from '@/app/lib/grid-export-utils';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import { buildFinanceApiQueryString, buildFinanceNavigationQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type ClassificationRow = {
  id: string;
  type: 'GROUP' | 'SUBGROUP';
  groupId?: string;
  groupName?: string | null;
  code?: string | null;
  name: string;
  description?: string | null;
  status: string;
  subgroupCount: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

type ClassificationForm = {
  id: string | null;
  type: 'GROUP' | 'SUBGROUP';
  groupId: string;
  code: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
};

type ClassificationColumnKey = 'type' | 'name' | 'groupName' | 'code' | 'subgroupCount' | 'productCount' | 'updatedAt';
type ClassificationFilters = Record<ClassificationColumnKey, string>;
type ClassificationSort = { key: ClassificationColumnKey | null; direction: 'ASC' | 'DESC' };

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_ESTOQUE_GRUPOS_SUBGRUPOS';
const ORIGIN_TEXT = 'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\estoque\\grupos\\page.tsx';
const EMPTY_FILTERS: ClassificationFilters = {
  type: '', name: '', groupName: '', code: '', subgroupCount: '', productCount: '', updatedAt: '',
};
const EMPTY_FORM: ClassificationForm = {
  id: null, type: 'GROUP', groupId: '', code: '', name: '', description: '', status: 'ACTIVE',
};

const GRID_COLUMNS: GridColumnDefinition<ClassificationRow, ClassificationColumnKey>[] = [
  { key: 'type', label: 'Tipo', getValue: (row) => row.type === 'GROUP' ? 'GRUPO' : 'SUBGRUPO' },
  { key: 'name', label: 'Nome', getValue: (row) => row.name },
  { key: 'groupName', label: 'Grupo pai', getValue: (row) => row.groupName || (row.type === 'GROUP' ? '---' : 'SEM GRUPO') },
  { key: 'code', label: 'Código', getValue: (row) => row.code || '---' },
  { key: 'subgroupCount', label: 'Subgrupos', getValue: (row) => String(row.subgroupCount) },
  { key: 'productCount', label: 'Produtos', getValue: (row) => String(row.productCount) },
  { key: 'updatedAt', label: 'Alterado em', getValue: (row) => formatDateLabel(row.updatedAt) },
];

function normalizeFilter(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function getRowValue(row: ClassificationRow, key: ClassificationColumnKey) {
  const column = GRID_COLUMNS.find((item) => item.key === key);
  return column ? column.getValue(row) : '';
}

function rowFarolClass(status: string) {
  return status === 'ACTIVE' ? 'bg-emerald-500 shadow-emerald-300' : 'bg-rose-500 shadow-rose-300';
}

function emptyFormFor(type: 'GROUP' | 'SUBGROUP'): ClassificationForm {
  return { ...EMPTY_FORM, type };
}

export default function StockGroupsPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [rows, setRows] = useState<ClassificationRow[]>([]);
  const [groups, setGroups] = useState<ClassificationRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
  const [filters, setFilters] = useState<ClassificationFilters>({ ...EMPTY_FILTERS });
  const [filterDrafts, setFilterDrafts] = useState<ClassificationFilters>({ ...EMPTY_FILTERS });
  const [openFilter, setOpenFilter] = useState<ClassificationColumnKey | null>(null);
  const [sort, setSort] = useState<ClassificationSort>({ key: null, direction: 'ASC' });
  const [quickSearch, setQuickSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<ClassificationForm | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState(buildDefaultExportColumns(GRID_COLUMNS));
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);

  const load = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setRows([]); setGroups([]); setLoading(false); return;
    }
    setLoading(true); setError(null);
    try {
      const response = await getJson<{ groups: ClassificationRow[]; subgroups: ClassificationRow[] }>(
        `/product-classifications${buildFinanceApiQueryString(runtimeContext, { status: 'ALL' })}`,
      );
      setGroups(response.groups || []);
      setRows([...(response.groups || []), ...(response.subgroups || [])]);
    } catch (currentError) {
      setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível carregar os grupos e subgrupos.'));
    } finally { setLoading(false); }
  }, [runtimeContext]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters, quickSearch, sort, statusFilter, pageSize]);

  const filteredRows = useMemo(() => {
    const normalizedQuick = normalizeFilter(quickSearch);
    const result = rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (normalizedQuick && ![row.name, row.code, row.groupName].some((value) => normalizeFilter(value).includes(normalizedQuick))) return false;
      return GRID_COLUMNS.every((column) => {
        const filter = normalizeFilter(filters[column.key]);
        return !filter || normalizeFilter(getRowValue(row, column.key)).includes(filter);
      });
    });
    if (!sort.key) return result;
    return [...result].sort((left, right) => {
      const comparison = normalizeFilter(getRowValue(left, sort.key!)).localeCompare(normalizeFilter(getRowValue(right, sort.key!)), 'pt-BR', { numeric: true });
      return sort.direction === 'DESC' ? -comparison : comparison;
    });
  }, [filters, quickSearch, rows, sort, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  async function saveForm() {
    if (!form || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    if (!form.name.trim() || (form.type === 'SUBGROUP' && !form.groupId)) {
      setError(form.type === 'SUBGROUP' ? 'Informe o nome e o grupo pai do subgrupo.' : 'Informe o nome do grupo.');
      return;
    }
    setSaving(true); setError(null); setMessage(null);
    const payload = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      requestedBy: runtimeContext.cashierUserId || runtimeContext.userRole || 'FINANCEIRO_ESTOQUE',
      code: form.code || undefined,
      name: form.name,
      description: form.description || undefined,
      status: form.status,
      ...(form.type === 'SUBGROUP' ? { groupId: form.groupId } : {}),
    };
    try {
      await requestJson(form.type === 'GROUP'
        ? `/product-classifications/groups${form.id ? `/${form.id}` : ''}`
        : `/product-classifications/subgroups${form.id ? `/${form.id}` : ''}`, {
        method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(payload), fallbackMessage: 'Não foi possível salvar o cadastro.',
      });
      setForm(null); setMessage(`${form.type === 'GROUP' ? 'Grupo' : 'Subgrupo'} salvo com sucesso.`); await load();
    } catch (currentError) { setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível salvar o cadastro.')); }
    finally { setSaving(false); }
  }

  const exportRows = filteredRows;
  if (runtimeContext.userRole && runtimeContext.userRole !== 'ADMIN') {
    return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center font-bold text-amber-800">Esta tela exige perfil ADMIN no Financeiro.</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">Estoque • classificação</div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Grupos e subgrupos</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">Cadastro por filial para organizar os produtos do Financeiro.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setError(null); setForm(emptyFormFor('GROUP')); }} className="rounded-2xl bg-blue-600 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-blue-700">Novo grupo</button>
            <button type="button" onClick={() => { setError(null); setForm(emptyFormFor('SUBGROUP')); }} className="rounded-2xl bg-violet-600 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-violet-700">Novo subgrupo</button>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} placeholder="Pesquisar nome, código ou grupo pai" className={`${FINANCE_GRID_PAGE_LAYOUT.input} flex-1`} />
          <button type="button" onClick={() => void load()} className="rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">Atualizar</button>
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}

      <section className="overflow-visible rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-left">
            <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
              <tr>
                {GRID_COLUMNS.map((column) => (
                  <th key={column.key} className="relative border-b border-slate-200 px-4 py-3">
                    <GridColumnFilterHeader label={column.label} isOpen={openFilter === column.key} isActive={Boolean(filters[column.key])} filterValue={filterDrafts[column.key]} sortDirection={sort.key === column.key ? sort.direction : null} onToggle={() => setOpenFilter(openFilter === column.key ? null : column.key)} onSort={(direction) => { setSort({ key: column.key, direction }); setOpenFilter(null); }} onFilterValueChange={(value) => setFilterDrafts((current) => ({ ...current, [column.key]: value }))} onApply={() => { setFilters((current) => ({ ...current, [column.key]: filterDrafts[column.key] })); setOpenFilter(null); }} onClear={() => { setFilterDrafts((current) => ({ ...current, [column.key]: '' })); setFilters((current) => ({ ...current, [column.key]: '' })); setOpenFilter(null); }} />
                  </th>
                ))}
                <th className="border-b border-slate-200 px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? <tr><td colSpan={GRID_COLUMNS.length + 1} className="px-4 py-12 text-center font-bold text-slate-500">Carregando classificações...</td></tr> : null}
              {!loading && visibleRows.length === 0 ? <tr><td colSpan={GRID_COLUMNS.length + 1} className="px-4 py-12 text-center font-bold text-slate-500">Nenhum grupo ou subgrupo encontrado.</td></tr> : null}
              {!loading ? visibleRows.map((row, index) => (
                <tr key={`${row.type}-${row.id}`} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                  <td className="px-4 py-3 font-black text-slate-700"><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full shadow-md ${rowFarolClass(row.status)}`} title={row.status === 'ACTIVE' ? 'Ativo' : 'Inativo'} />{row.type === 'GROUP' ? 'GRUPO' : 'SUBGRUPO'}</td>
                  <td className="px-4 py-3 font-black text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{row.groupName || '---'}</td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{row.code || '---'}</td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{row.subgroupCount}</td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{row.productCount}</td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{formatDateLabel(row.updatedAt)}</td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => setForm({ id: row.id, type: row.type, groupId: row.groupId || '', code: row.code || '', name: row.name, description: row.description || '', status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE' })} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100">Editar</button></td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
        <GridStandardFooter statusFilter={statusFilter} totalRecords={filteredRows.length} pageSize={pageSize} currentPage={page} totalPages={totalPages} onStatusFilterChange={setStatusFilter} onPageSizeChange={setPageSize} onPageChange={setPage} onExport={() => setIsExportOpen(true)} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-3 shadow-sm"><ScreenNameCopy screenId={SCREEN_ID} className="justify-end" originText={ORIGIN_TEXT} auditText="Cadastro financeiro por empresa e filial de grupos e subgrupos do estoque." sqlText="SELECT * FROM product_groups UNION ALL SELECT * FROM product_subgroups;" /></section>

      <GridExportModal isOpen={isExportOpen} title="Exportar grupos e subgrupos" description={`A exportação considera ${exportRows.length} registro(s) do filtro atual.`} format={exportFormat} onFormatChange={setExportFormat} columns={GRID_COLUMNS} selectedColumns={exportColumns} storageKey={`financeiro:estoque-grupos:export:${runtimeContext.sourceTenantId || 'default'}`} brandingName={runtimeContext.companyName || 'FINANCEIRO'} brandingLogoUrl={runtimeContext.logoUrl} onClose={() => setIsExportOpen(false)} onExport={async (config) => { await exportGridRows({ rows: exportRows, columns: GRID_COLUMNS, selectedColumns: config.selectedColumns, format: exportFormat, fileBaseName: 'grupos-subgrupos-estoque', branding: { title: 'Grupos e subgrupos de estoque', schoolName: runtimeContext.companyName || 'FINANCEIRO', logoUrl: runtimeContext.logoUrl }, pdfOptions: config.pdfOptions }); setExportColumns(config.selectedColumns); setIsExportOpen(false); }} />

      {form ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 bg-slate-50 px-6 py-5"><div><div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">Cadastro do estoque</div><h2 className="mt-1 text-2xl font-black text-slate-900">{form.id ? 'Alterar' : 'Cadastrar'} {form.type === 'GROUP' ? 'grupo' : 'subgrupo'}</h2></div><button type="button" onClick={() => setForm(null)} className="text-2xl font-black text-slate-400 hover:text-rose-600">×</button></div><div className="grid gap-4 p-6"><label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Tipo</span><select value={form.type} disabled={Boolean(form.id)} onChange={(event) => setForm((current) => current ? { ...current, type: event.target.value as 'GROUP' | 'SUBGROUP', groupId: '' } : current)} className={FINANCE_GRID_PAGE_LAYOUT.input}><option value="GROUP">GRUPO</option><option value="SUBGROUP">SUBGRUPO</option></select></label>{form.type === 'SUBGROUP' ? <label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Grupo pai</span><select value={form.groupId} onChange={(event) => setForm((current) => current ? { ...current, groupId: event.target.value } : current)} className={FINANCE_GRID_PAGE_LAYOUT.input}><option value="">Selecione o grupo</option>{groups.filter((group) => group.status === 'ACTIVE').map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label> : null}<div className="grid gap-4 md:grid-cols-2"><label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Código</span><input value={form.code} onChange={(event) => setForm((current) => current ? { ...current, code: event.target.value } : current)} className={FINANCE_GRID_PAGE_LAYOUT.input} /></label><label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Situação</span><select value={form.status} onChange={(event) => setForm((current) => current ? { ...current, status: event.target.value as 'ACTIVE' | 'INACTIVE' } : current)} className={FINANCE_GRID_PAGE_LAYOUT.input}><option value="ACTIVE">ATIVO</option><option value="INACTIVE">INATIVO</option></select></label></div><label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Nome</span><input autoFocus value={form.name} onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)} className={FINANCE_GRID_PAGE_LAYOUT.input} /></label><label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Descrição</span><textarea value={form.description} onChange={(event) => setForm((current) => current ? { ...current, description: event.target.value } : current)} className={`${FINANCE_GRID_PAGE_LAYOUT.input} min-h-24`} /></label></div><div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4"><button type="button" onClick={() => setForm(null)} className="rounded-2xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-600">Cancelar</button><button type="button" disabled={saving} onClick={() => void saveForm()} className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-black text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar cadastro'}</button></div></div></div> : null}
    </div>
  );
}
