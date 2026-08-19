'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import GridColumnFilterHeader, { matchesGridDateRange } from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
import GridStatusFilter from '@/app/components/grid-status-filter';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import InactivationConfirmationPopup from '@/app/components/inactivation-confirmation-popup';
import GroupProductsPopup from '@/app/estoque/grupos/group-products-popup';
import { getJson, requestJson } from '@/app/lib/api';
import { formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildDefaultExportColumns, exportGridRows, type GridColumnDefinition, type GridExportFormat } from '@/app/lib/grid-export-utils';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import { withFinanceBasePath } from '@/app/lib/public-path';
import { buildFinanceApiQueryString, buildFinanceNavigationQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';
import { isTrustedMessageEvent, postMessageToTrustedParent } from '@/app/lib/trusted-messaging';

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
const SUBGROUPS_POPUP_SCREEN_ID = 'POPUP_FINANCEIRO_ESTOQUE_GRUPO_SUBGRUPOS_CONSULTA';
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

function postEmbeddedScreenContext(screenId: string) {
  const message = { type: 'MSINFOR_SCREEN_CONTEXT', screenId };
  postMessageToTrustedParent(message);
}

function GroupSubgroupsPopup({
  group,
  rows,
  brandingName,
  logoUrl,
  onClose,
  onEdit,
  onOpenProducts,
}: {
  group: ClassificationRow | null;
  rows: ClassificationRow[];
  brandingName: string | null;
  logoUrl: string | null;
  onClose: () => void;
  onEdit: (row: ClassificationRow) => void;
  onOpenProducts: (row: ClassificationRow) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');

  if (!group) return null;

  const subgroups = rows.filter((row) => row.type === 'SUBGROUP' && row.groupId === group.id);
  const visibleSubgroups = subgroups.filter((row) => statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? row.status === 'ACTIVE' : row.status === 'INACTIVE'));

  return (
    <AuditedPopupShell
      isOpen
      screenId={SUBGROUPS_POPUP_SCREEN_ID}
      eyebrow="Consulta do estoque"
      title="Subgrupos do grupo"
      description={`${group.name} · ${subgroups.length} subgrupo(s) encontrado(s).`}
      brandingName={brandingName}
      logoUrl={logoUrl}
      originText="Origem: Sistema Financeiro - consulta de subgrupos aberta a partir da grid de grupos."
      auditText="Popup exclusivo para consultar os subgrupos vinculados ao grupo selecionado, respeitando empresa e filial do contexto financeiro."
      sqlText="SELECT PS.* FROM product_subgroups PS WHERE PS.groupId = :groupId AND PS.canceledAt IS NULL ORDER BY PS.name ASC;"
      onClose={onClose}
      panelClassName="max-w-5xl"
      headerTheme="blue"
      screenIdRightAligned
    >
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[720px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3">Nome</th>
              <th className="border-b border-slate-200 px-4 py-3">Código</th>
              <th className="border-b border-slate-200 px-4 py-3">Produtos</th>
              <th className="border-b border-slate-200 px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visibleSubgroups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center font-bold text-slate-500">
                  {subgroups.length === 0 ? 'Nenhum subgrupo cadastrado para este grupo.' : 'Nenhum subgrupo corresponde ao semáforo selecionado.'}
                </td>
              </tr>
            ) : visibleSubgroups.map((row, index) => (
              <tr key={row.id} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                <td className="px-4 py-3 font-black text-slate-900">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full shadow-md ${rowFarolClass(row.status)}`}
                      title={row.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                      aria-label={row.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    />
                    <span>{row.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-600">{row.code || '---'}</td>
                <td className="px-4 py-3 font-semibold text-slate-600">{row.productCount}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenProducts(row)}
                    title={`Consultar produtos do subgrupo ${row.name}`}
                    aria-label={`Consultar produtos do subgrupo ${row.name}`}
                    className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-900"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" strokeLinejoin="round" />
                      <path d="M4.5 7.5 12 12l7.5-4.5M12 12v9" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    title={`Editar subgrupo ${row.name}`}
                    aria-label={`Editar subgrupo ${row.name}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100 hover:text-blue-900"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 20h9" strokeLinecap="round" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="mt-3 flex justify-start rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      >
        <GridStatusFilter
          value={statusFilter}
          onChange={setStatusFilter}
          activeLabel="Mostrar somente subgrupos ativos"
          allLabel="Mostrar subgrupos ativos e inativos"
          inactiveLabel="Mostrar somente subgrupos inativos"
        />
      </div>
    </AuditedPopupShell>
  );
}

function ClassificationFormPopup({
  form,
  groups,
  saving,
  brandingName,
  logoUrl,
  onClose,
  onChange,
  onSave,
}: {
  form: ClassificationForm;
  groups: ClassificationRow[];
  saving: boolean;
  brandingName: string | null;
  logoUrl: string | null;
  onClose: () => void;
  onChange: (next: ClassificationForm) => void;
  onSave: () => void;
}) {
  return (
    <AuditedPopupShell
      isOpen
      screenId="POPUP_FINANCEIRO_ESTOQUE_GRUPOS_CADASTRO"
      eyebrow="Cadastro do estoque"
      title={`${form.id ? 'Alterar' : 'Cadastrar'} ${form.type === 'GROUP' ? 'grupo' : 'subgrupo'}`}
      description={brandingName || 'Cadastro exclusivo da empresa/filial atual.'}
      brandingName={brandingName}
      logoUrl={logoUrl}
      onClose={onClose}
      panelClassName="max-w-3xl"
      headerTheme="blue"
      bodyClassName="gap-4"
      footerActions={
        <div className="flex w-full justify-start">
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M5 4h12l2 2v14H5V4Z" strokeLinejoin="round" />
              <path d="M8 4v6h8V4M8 20v-6h8v6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {saving ? 'Salvando...' : 'Salvar cadastro'}
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Tipo</span>
          <select
            value={form.type}
            disabled={Boolean(form.id)}
            onChange={(event) => onChange({ ...form, type: event.target.value as 'GROUP' | 'SUBGROUP', groupId: '' })}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          >
            <option value="GROUP">GRUPO</option>
            <option value="SUBGROUP">SUBGRUPO</option>
          </select>
        </label>

        {form.type === 'SUBGROUP' ? (
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Grupo pai</span>
            <select
              value={form.groupId}
              onChange={(event) => onChange({ ...form, groupId: event.target.value })}
              className={FINANCE_GRID_PAGE_LAYOUT.input}
            >
              <option value="">Selecione o grupo</option>
              {groups.filter((group) => group.status === 'ACTIVE').map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Código</span>
            <input value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value })} className={FINANCE_GRID_PAGE_LAYOUT.input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Situação</span>
            <select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value as 'ACTIVE' | 'INACTIVE' })} className={FINANCE_GRID_PAGE_LAYOUT.input}>
              <option value="ACTIVE">ATIVO</option>
              <option value="INACTIVE">INATIVO</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Nome</span>
          <input autoFocus value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} className={FINANCE_GRID_PAGE_LAYOUT.input} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">Descrição</span>
          <textarea value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} className={`${FINANCE_GRID_PAGE_LAYOUT.input} min-h-24`} />
        </label>
      </div>
    </AuditedPopupShell>
  );
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
  const [subgroupsPopupGroup, setSubgroupsPopupGroup] = useState<ClassificationRow | null>(null);
  const [groupProductsPopupClassification, setGroupProductsPopupClassification] = useState<ClassificationRow | null>(null);
  const [pendingClassificationInactivation, setPendingClassificationInactivation] = useState<ClassificationRow | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState(buildDefaultExportColumns(GRID_COLUMNS));
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);

  useEffect(() => {
    if (!runtimeContext.embedded) return;

    postEmbeddedScreenContext(SCREEN_ID);
    const retryTimer = window.setTimeout(() => postEmbeddedScreenContext(SCREEN_ID), 250);

    return () => window.clearTimeout(retryTimer);
  }, [runtimeContext.embedded]);

  useEffect(() => {
    const handleEmbeddedBackNavigation = (event: MessageEvent) => {
      if (!isTrustedMessageEvent(event)) return;
      if (event.source !== window.parent) return;

      const data = event.data as { type?: string; screenId?: string } | null;
      if (
        !data ||
        data.type !== 'MSINFOR_FINANCEIRO_NAVIGATE_BACK' ||
        data.screenId !== SCREEN_ID
      ) return;

      window.location.replace(withFinanceBasePath(`/estoque${navigationQuery}`));
    };

    window.addEventListener('message', handleEmbeddedBackNavigation);
    return () => window.removeEventListener('message', handleEmbeddedBackNavigation);
  }, [navigationQuery]);

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
    const scopedRows = rows.filter((row) => row.type === 'GROUP');
    const result = scopedRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (normalizedQuick && ![row.name, row.code, row.groupName].some((value) => normalizeFilter(value).includes(normalizedQuick))) return false;
      return GRID_COLUMNS.every((column) => {
        const filter = filters[column.key];
        if (column.key === 'updatedAt') return matchesGridDateRange(getRowValue(row, column.key), filter);
        const normalizedFilter = normalizeFilter(filter);
        return !normalizedFilter || normalizeFilter(getRowValue(row, column.key)).includes(normalizedFilter);
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
    if (form.id && form.status === 'INACTIVE') {
      const current = rows.find((row) => row.id === form.id && row.type === form.type);
      if (current?.status === 'ACTIVE') {
        setPendingClassificationInactivation(current);
        return;
      }
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

  async function confirmClassificationInactivation(password: string, reason: string) {
    if (!pendingClassificationInactivation || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const path = pendingClassificationInactivation.type === 'GROUP' ? 'groups' : 'subgroups';
      await requestJson(`/product-classifications/${path}/${pendingClassificationInactivation.id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          requestedBy: runtimeContext.cashierUserId || runtimeContext.userRole || 'FINANCEIRO_ESTOQUE',
          status: 'INACTIVE',
          password,
          reason,
        }),
      });
      setPendingClassificationInactivation(null);
      setForm(null);
      setMessage(`${pendingClassificationInactivation.type === 'GROUP' ? 'Grupo' : 'Subgrupo'} inativado com sucesso.`);
      await load();
    } catch (currentError) {
      setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível inativar o cadastro.'));
    } finally {
      setSaving(false);
    }
  }

  function openNewGroupForm() {
    setError(null);
    setForm(emptyFormFor('GROUP'));
  }

  function openNewSubgroupForm(groupId: string) {
    setError(null);
    setForm({ ...emptyFormFor('SUBGROUP'), groupId });
  }

  function consultGroupSubgroups(group: ClassificationRow) {
    setSubgroupsPopupGroup(group);
  }

  function consultGroupProducts(classification: ClassificationRow) {
    setGroupProductsPopupClassification(classification);
  }

  function openEditForm(row: ClassificationRow) {
    setError(null);
    setForm({
      id: row.id,
      type: row.type,
      groupId: row.groupId || '',
      code: row.code || '',
      name: row.name,
      description: row.description || '',
      status: row.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
  }

  const exportRows = filteredRows;
  if (runtimeContext.userRole && runtimeContext.userRole !== 'ADMIN') {
    return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center font-bold text-amber-800">Esta tela exige perfil ADMIN no Financeiro.</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row">
          <button
            type="button"
            onClick={openNewGroupForm}
            title="Novo grupo"
            aria-label="Novo grupo"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black leading-none text-white transition hover:bg-blue-700"
          >
            +
          </button>
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
                    <GridColumnFilterHeader label={column.label} filterType={column.key === 'updatedAt' ? 'date-range' : 'text'} isOpen={openFilter === column.key} isActive={Boolean(filters[column.key])} filterValue={filterDrafts[column.key]} sortDirection={sort.key === column.key ? sort.direction : null} onToggle={() => setOpenFilter(openFilter === column.key ? null : column.key)} onSort={(direction) => { setSort({ key: column.key, direction }); setOpenFilter(null); }} onFilterValueChange={(value) => setFilterDrafts((current) => ({ ...current, [column.key]: value }))} onApply={() => { setFilters((current) => ({ ...current, [column.key]: filterDrafts[column.key] })); setOpenFilter(null); }} onClear={() => { setFilterDrafts((current) => ({ ...current, [column.key]: '' })); setFilters((current) => ({ ...current, [column.key]: '' })); setOpenFilter(null); }} />
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
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {row.type === 'GROUP' ? (
                        <button
                          type="button"
                          onClick={() => consultGroupSubgroups(row)}
                          title={`Consultar subgrupos de ${row.name}`}
                          aria-label={`Consultar subgrupos de ${row.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition hover:bg-slate-200 hover:text-slate-900"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="12" cy="12" r="2.5" />
                          </svg>
                        </button>
                      ) : null}
                      {row.type === 'GROUP' ? (
                        <button
                          type="button"
                          onClick={() => consultGroupProducts(row)}
                          title={`Consultar produtos do grupo ${row.name}`}
                          aria-label={`Consultar produtos do grupo ${row.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-900"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" strokeLinejoin="round" />
                            <path d="M4.5 7.5 12 12l7.5-4.5M12 12v9" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ) : null}
                      {row.type === 'GROUP' && row.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          onClick={() => openNewSubgroupForm(row.id)}
                          title={`Incluir subgrupo em ${row.name}`}
                          aria-label={`Incluir subgrupo em ${row.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700 transition hover:bg-violet-100 hover:text-violet-900"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                          </svg>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openEditForm(row)}
                        title={`Editar ${row.type === 'GROUP' ? 'grupo' : 'subgrupo'} ${row.name}`}
                        aria-label={`Editar ${row.type === 'GROUP' ? 'grupo' : 'subgrupo'} ${row.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100 hover:text-blue-900"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M12 20h9" strokeLinecap="round" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
        <GridStandardFooter statusFilter={statusFilter} totalRecords={filteredRows.length} pageSize={pageSize} currentPage={page} totalPages={totalPages} onStatusFilterChange={setStatusFilter} onPageSizeChange={setPageSize} onPageChange={setPage} onExport={() => setIsExportOpen(true)} />
      </section>

      {!runtimeContext.embedded ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-3 shadow-sm"><ScreenNameCopy screenId={SCREEN_ID} className="justify-end" originText={ORIGIN_TEXT} auditText="Cadastro financeiro por empresa e filial de grupos e subgrupos do estoque." sqlText="SELECT * FROM product_groups UNION ALL SELECT * FROM product_subgroups;" /></section>
      ) : null}

      <GroupSubgroupsPopup
        group={subgroupsPopupGroup}
        rows={rows}
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => setSubgroupsPopupGroup(null)}
        onEdit={openEditForm}
        onOpenProducts={consultGroupProducts}
      />

      <GroupProductsPopup
        classification={groupProductsPopupClassification}
        rows={rows}
        runtimeContext={runtimeContext}
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => setGroupProductsPopupClassification(null)}
        onChanged={() => void load()}
      />

      <GridExportModal isOpen={isExportOpen} title="Exportar grupos e subgrupos" description={`A exportação considera ${exportRows.length} registro(s) do filtro atual.`} format={exportFormat} onFormatChange={setExportFormat} columns={GRID_COLUMNS} selectedColumns={exportColumns} storageKey={`financeiro:estoque-grupos:export:${runtimeContext.sourceTenantId || 'default'}`} brandingName={runtimeContext.companyName || 'FINANCEIRO'} brandingLogoUrl={runtimeContext.logoUrl} onClose={() => setIsExportOpen(false)} onExport={async (config) => { await exportGridRows({ rows: exportRows, columns: GRID_COLUMNS, selectedColumns: config.selectedColumns, format: exportFormat, fileBaseName: 'grupos-subgrupos-estoque', branding: { title: 'Grupos e subgrupos de estoque', schoolName: runtimeContext.companyName || 'FINANCEIRO', logoUrl: runtimeContext.logoUrl }, pdfOptions: config.pdfOptions }); setExportColumns(config.selectedColumns); setIsExportOpen(false); }} />

      <InactivationConfirmationPopup
        isOpen={Boolean(pendingClassificationInactivation)}
        screenId="POPUP_FINANCEIRO_ESTOQUE_GRUPOS_INATIVAR"
        title={`Inativar ${pendingClassificationInactivation?.type === 'GROUP' ? 'grupo' : 'subgrupo'}`}
        targetName={pendingClassificationInactivation?.name || ''}
        description="Ao inativar esta classificação, os produtos e o histórico de estoque serão preservados."
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => setPendingClassificationInactivation(null)}
        onConfirm={confirmClassificationInactivation}
        isSaving={saving}
      />

      {form ? (
        <ClassificationFormPopup
          form={form}
          groups={groups}
          saving={saving}
          brandingName={runtimeContext.companyName}
          logoUrl={runtimeContext.logoUrl}
          onClose={() => setForm(null)}
          onChange={(next) => setForm(next)}
          onSave={() => void saveForm()}
        />
      ) : null}
    </div>
  );
}
