'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
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
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';
import type { PayableSupplierSummary } from '../payables-types';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_FORNECEDORES';
const EXPORT_STORAGE_KEY = 'financeiro:contas-a-pagar:fornecedores:export';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type SuppliersAuditParams = {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  status: 'ALL' | 'ACTIVE' | 'INACTIVE';
  search: string;
  displayedRowsCount: number;
};

function buildSuppliersAuditSql(params: SuppliersAuditParams) {
  const search = params.search.trim().toUpperCase();
  const status = String(params.status || 'ALL').toUpperCase();

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :status = ${toSqlLiteral(status)}
-- :search = ${toSqlLiteral(search)}

SELECT SU.*
FROM suppliers SU
INNER JOIN companies CO ON CO.id = SU.companyId
WHERE CO.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND SU.canceledAt IS NULL
  AND (${toSqlLiteral(status)} = 'ALL' OR SU.status = ${toSqlLiteral(status)})
  AND (
    ${toSqlLiteral(search)} = ''
    OR UPPER(COALESCE(SU.legalName, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(SU.tradeName, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(SU.document, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(SU.email, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(SU.phone, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
  )
ORDER BY SU.legalName ASC;`;
}

function buildSuppliersAuditText(params: SuppliersAuditParams) {
  const search = params.search.trim().toUpperCase();
  const status = String(params.status || 'ALL').toUpperCase();

  return `--- LOGICA DA TELA ---
Esta tela lista os fornecedores do contas a pagar do Financeiro.

TABELAS PRINCIPAIS:
- suppliers (SU) - cadastro de fornecedores
- companies (CO) - empresa financeira resolvida por origem
- payable_invoice_imports (PII) - notas vinculadas ao fornecedor
- payable_titles (PT) - titulos vinculados ao fornecedor

RELACIONAMENTOS:
- suppliers.companyId = companies.id
- payable_invoice_imports.supplierId = suppliers.id
- payable_titles.supplierId = suppliers.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- status selecionado (:status): ${status}
- busca digitada (:search): ${formatAuditValue(search)}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: nome do fornecedor ASC

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- CO.sourceSystem e CO.sourceTenantId isolam os dados da empresa/sistema de origem
- fornecedores cancelados logicamente nao aparecem no grid`;
}

type ExportColumnKey =
  | 'status'
  | 'legalName'
  | 'tradeName'
  | 'document'
  | 'email'
  | 'phone'
  | 'invoiceImportsCount'
  | 'payableTitlesCount'
  | 'updatedAt';

type SupplierColumnFilterKey = ExportColumnKey;
type SupplierGridSort = {
  key: SupplierColumnFilterKey;
  direction: 'ASC' | 'DESC';
};

const DEFAULT_COLUMN_FILTERS: Record<SupplierColumnFilterKey, string> = {
  status: '',
  legalName: '',
  tradeName: '',
  document: '',
  email: '',
  phone: '',
  invoiceImportsCount: '',
  payableTitlesCount: '',
  updatedAt: '',
};

const EXPORT_COLUMNS: GridColumnDefinition<PayableSupplierSummary, ExportColumnKey>[] = [
  { key: 'status', label: 'Situação', getValue: (item) => item.status },
  { key: 'legalName', label: 'Fornecedor', getValue: (item) => item.legalName },
  { key: 'tradeName', label: 'Fantasia', getValue: (item) => item.tradeName || '---' },
  { key: 'document', label: 'Documento', getValue: (item) => item.document || '---' },
  { key: 'email', label: 'E-mail', getValue: (item) => item.email || '---' },
  { key: 'phone', label: 'Telefone', getValue: (item) => item.phone || '---' },
  { key: 'invoiceImportsCount', label: 'Notas importadas', getValue: (item) => String(item.invoiceImportsCount) },
  { key: 'payableTitlesCount', label: 'Títulos', getValue: (item) => String(item.payableTitlesCount) },
  { key: 'updatedAt', label: 'Atualizado em', getValue: (item) => formatDateLabel(item.updatedAt) },
];

function getStatusClass(status: string) {
  return status === 'ACTIVE'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-50 text-slate-600';
}

function getStatusLabel(status: string) {
  return status === 'ACTIVE' ? 'ATIVO' : status || '---';
}

function normalizeGridText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function matchesGridText(value: string, filter: string) {
  const normalizedFilter = normalizeGridText(filter);
  if (!normalizedFilter) return true;
  return normalizeGridText(value).includes(normalizedFilter);
}

export default function FinanceiroFornecedoresPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
  const [items, setItems] = useState<PayableSupplierSummary[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GridStatusFilterValue>('ACTIVE');
  const [columnFilters, setColumnFilters] = useState<Record<SupplierColumnFilterKey, string>>(DEFAULT_COLUMN_FILTERS);
  const [columnFilterDrafts, setColumnFilterDrafts] = useState<Record<SupplierColumnFilterKey, string>>(DEFAULT_COLUMN_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] = useState<SupplierColumnFilterKey | null>(null);
  const [gridSort, setGridSort] = useState<SupplierGridSort>({ key: 'legalName', direction: 'ASC' });
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<ExportColumnKey, boolean>>(
    buildDefaultExportColumns(EXPORT_COLUMNS),
  );

  const loadItems = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const queryString = buildFinanceApiQueryString(runtimeContext, {
        status: statusFilter,
        search: appliedSearch || null,
      });
      const response = await getJson<PayableSupplierSummary[]>(`/payables/suppliers${queryString}`);
      setItems(response);
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar os fornecedores.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, runtimeContext, statusFilter]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') {
      return;
    }

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  const getColumnValue = useCallback((item: PayableSupplierSummary, key: SupplierColumnFilterKey) => {
    if (key === 'status') return getStatusLabel(item.status);
    if (key === 'legalName') return item.legalName || '';
    if (key === 'tradeName') return item.tradeName || '';
    if (key === 'document') return item.document || '';
    if (key === 'email') return item.email || '';
    if (key === 'phone') return item.phone || '';
    if (key === 'invoiceImportsCount') return String(item.invoiceImportsCount || 0);
    if (key === 'payableTitlesCount') return String(item.payableTitlesCount || 0);
    if (key === 'updatedAt') return formatDateLabel(item.updatedAt);
    return '';
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) =>
      (Object.keys(columnFilters) as SupplierColumnFilterKey[]).every((key) =>
        matchesGridText(getColumnValue(item, key), columnFilters[key]),
      ),
    );
  }, [columnFilters, getColumnValue, items]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((left, right) => {
      const leftValue = getColumnValue(left, gridSort.key);
      const rightValue = getColumnValue(right, gridSort.key);
      const result = leftValue.localeCompare(rightValue, 'pt-BR', {
        numeric: true,
        sensitivity: 'base',
      });
      return gridSort.direction === 'ASC' ? result : -result;
    });
  }, [filteredItems, getColumnValue, gridSort]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedItems.slice(startIndex, startIndex + pageSize);
  }, [currentPage, pageSize, sortedItems]);

  const summary = useMemo(() => {
    return sortedItems.reduce(
      (accumulator, current) => {
        if (current.status === 'ACTIVE') {
          accumulator.active += 1;
        } else {
          accumulator.inactive += 1;
        }
        accumulator.invoiceImports += current.invoiceImportsCount || 0;
        return accumulator;
      },
      { active: 0, inactive: 0, invoiceImports: 0 },
    );
  }, [sortedItems]);

  const hasGridFilters = useMemo(
    () =>
      appliedSearch.trim() !== ''
      || statusFilter !== 'ACTIVE'
      || Object.values(columnFilters).some((value) => value.trim() !== '')
      || gridSort.key !== 'legalName'
      || gridSort.direction !== 'ASC',
    [appliedSearch, columnFilters, gridSort.direction, gridSort.key, statusFilter],
  );

  const suppliersAuditContext = useMemo(() => {
    const auditParams: SuppliersAuditParams = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      status: statusFilter,
      search: appliedSearch,
      displayedRowsCount: sortedItems.length,
    };

    return {
      auditText: buildSuppliersAuditText(auditParams),
      sqlText: buildSuppliersAuditSql(auditParams),
    };
  }, [
    appliedSearch,
    sortedItems.length,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    statusFilter,
  ]);

  const handleSearchSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  function openColumnFilter(columnKey: SupplierColumnFilterKey) {
    setColumnFilterDrafts((current) => ({
      ...current,
      [columnKey]: columnFilters[columnKey],
    }));
    setActiveFilterColumn((current) => (current === columnKey ? null : columnKey));
  }

  function applyColumnFilter(columnKey: SupplierColumnFilterKey) {
    setColumnFilters((current) => ({
      ...current,
      [columnKey]: columnFilterDrafts[columnKey].trim(),
    }));
    setActiveFilterColumn(null);
    setPage(1);
  }

  function clearColumnFilter(columnKey: SupplierColumnFilterKey) {
    setColumnFilters((current) => ({
      ...current,
      [columnKey]: '',
    }));
    setColumnFilterDrafts((current) => ({
      ...current,
      [columnKey]: '',
    }));
    setActiveFilterColumn(null);
    setPage(1);
  }

  function clearAllGridFilters() {
    setAppliedSearch('');
    setSearchInput('');
    setStatusFilter('ACTIVE');
    setColumnFilters(DEFAULT_COLUMN_FILTERS);
    setColumnFilterDrafts(DEFAULT_COLUMN_FILTERS);
    setGridSort({ key: 'legalName', direction: 'ASC' });
    setActiveFilterColumn(null);
    setPage(1);
  }

  function renderClearAllButton() {
    return (
      <button
        type="button"
        onClick={clearAllGridFilters}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
          hasGridFilters
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

  function renderColumnHeader(column: GridColumnDefinition<PayableSupplierSummary, SupplierColumnFilterKey>, index: number) {
    const isActive = Boolean(columnFilters[column.key].trim()) || gridSort.key === column.key;
    return (
      <div className="flex items-center gap-1.5">
        {index === 0 ? renderClearAllButton() : null}
        <GridColumnFilterHeader
          label={column.label}
          isOpen={activeFilterColumn === column.key}
          isActive={isActive}
          filterValue={columnFilterDrafts[column.key]}
          placeholder={`DIGITE ${column.label.toUpperCase()}`}
          align={['invoiceImportsCount', 'payableTitlesCount', 'updatedAt'].includes(column.key) ? 'right' : 'left'}
          sortDirection={gridSort.key === column.key ? gridSort.direction : null}
          onToggle={() => openColumnFilter(column.key)}
          onSort={(direction) => {
            setGridSort({ key: column.key, direction });
            setActiveFilterColumn(null);
            setPage(1);
          }}
          onFilterValueChange={(value) =>
            setColumnFilterDrafts((current) => ({
              ...current,
              [column.key]: value,
            }))
          }
          onApply={() => applyColumnFilter(column.key)}
          onClear={() => clearColumnFilter(column.key)}
        />
      </div>
    );
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={FINANCE_GRID_PAGE_LAYOUT.card}>
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
                Contas a pagar
              </div>
              <h1 className="mt-1 text-2xl font-black text-slate-900">Fornecedores</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Consulte os fornecedores vinculados às notas e títulos do contas a pagar.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/contas-a-pagar${navigationQuery}`}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Voltar
              </Link>
            </div>
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-6 p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Fornecedores no grid</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{items.length}</div>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Ativos</div>
              <div className="mt-1 text-2xl font-black text-emerald-800">{summary.active}</div>
            </div>
            <div className="rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Notas importadas</div>
              <div className="mt-1 text-2xl font-black text-blue-800">{summary.invoiceImports}</div>
            </div>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <form onSubmit={handleSearchSubmit} className="grid gap-4 xl:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Buscar fornecedor
                </span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="NOME, DOCUMENTO, E-MAIL, TELEFONE..."
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                />
              </label>

              <button type="submit" className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>
                Aplicar
              </button>
            </form>
          </section>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1180px] border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-300 text-[13px] font-bold uppercase tracking-wider">
                    {EXPORT_COLUMNS.map((column, index) => (
                      <th key={column.key} className="sticky top-0 z-20 bg-slate-50 px-4 py-3">
                        {renderColumnHeader(column, index)}
                      </th>
                    ))}
                  </tr>
                  {activeFilterColumn ? (
                    <tr aria-hidden="true">
                      <th colSpan={EXPORT_COLUMNS.length} className="h-56 bg-white p-0" />
                    </tr>
                  ) : null}
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={EXPORT_COLUMNS.length} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Carregando fornecedores...
                      </td>
                    </tr>
                  ) : sortedItems.length ? (
                    paginatedItems.map((item, rowIndex) => (
                      <tr key={item.id} className={`${rowIndex % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-100/80 hover:bg-slate-200/70'} transition-colors`}>
                        <td className="px-4 py-4 align-top">
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getStatusClass(item.status)}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div className="font-black text-slate-900">{item.legalName}</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.tradeName || 'SEM NOME FANTASIA'}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div>{item.document || 'SEM DOCUMENTO'}</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            IE: {item.stateRegistration || '---'}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div>{item.email || 'SEM E-MAIL'}</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.phone || 'SEM TELEFONE'}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-black text-slate-900">{item.invoiceImportsCount}</td>
                        <td className="px-4 py-4 align-top text-sm font-black text-slate-900">{item.payableTitlesCount}</td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{formatDateLabel(item.updatedAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={EXPORT_COLUMNS.length} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Nenhum fornecedor encontrado com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <GridStandardFooter
              statusFilter={statusFilter}
              totalRecords={sortedItems.length}
              pageSize={pageSize}
              currentPage={currentPage}
              totalPages={totalPages}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              aggregateSummaries={[
                { label: 'Ativos', value: new Intl.NumberFormat('pt-BR').format(summary.active) },
                { label: 'Notas', value: new Intl.NumberFormat('pt-BR').format(summary.invoiceImports) },
              ]}
              showColumnSettings={false}
              onExport={() => setIsExportModalOpen(true)}
              onStatusFilterChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
              onPageChange={setPage}
            >
              <ScreenNameCopy
                screenId={SCREEN_ID}
                className="justify-end"
                originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/fornecedores/page.tsx"
                auditText={suppliersAuditContext.auditText}
                sqlText={suppliersAuditContext.sqlText}
              />
            </GridStandardFooter>
          </div>
        </div>
      </section>

      <GridExportModal
        isOpen={isExportModalOpen}
        title="Exportar fornecedores"
        description={`A exportação considera ${sortedItems.length} registro(s) do filtro atual.`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={EXPORT_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={EXPORT_STORAGE_KEY}
        brandingName={runtimeContext.companyName || 'FINANCEIRO'}
        brandingLogoUrl={runtimeContext.logoUrl}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: sortedItems,
            columns: EXPORT_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            fileBaseName: 'fornecedores-contas-a-pagar',
            branding: {
              title: 'Fornecedores',
              subtitle: 'Exportação dos fornecedores filtrados no contas a pagar.',
              schoolName:
                runtimeContext.companyName ||
                sortedItems[0]?.companyName ||
                'FINANCEIRO',
              logoUrl: runtimeContext.logoUrl,
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
