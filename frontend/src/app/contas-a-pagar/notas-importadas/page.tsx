'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
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
import type { PayableInvoiceImportSummary } from '../payables-types';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_NOTAS_IMPORTADAS';
const EXPORT_STORAGE_KEY = 'financeiro:contas-a-pagar:notas-importadas:export';

const auditText = `--- LOGICA DA TELA ---
Esta tela lista as notas de entrada importadas no contas a pagar do Financeiro.

TABELAS PRINCIPAIS:
- payable_invoice_imports (PII) - cabeçalho da nota importada.
- suppliers (SU) - fornecedor vinculado à nota.
- payable_titles (PT) - título financeiro gerado após aprovação.
- stock_movements (SM) - movimentos de estoque gerados na aprovação.

RELACIONAMENTOS:
- payable_invoice_imports.companyId -> companies.id
- payable_invoice_imports.supplierId -> suppliers.id
- payable_titles.sourceDocumentId -> payable_invoice_imports.id
- stock_movements.sourceImportId -> payable_invoice_imports.id

METRICAS / CAMPOS EXIBIDOS:
- status da importação
- número e série da nota
- fornecedor
- data de emissão
- valor total
- quantidade de itens
- quantidade de duplicatas
- quantidade de movimentos de estoque gerados

FILTROS APLICADOS:
- company resolvida por sourceSystem + sourceTenantId
- status opcional: PENDING_APPROVAL | APPROVED | ALL
- busca por chave, número, série, fornecedor ou documento

ORDENACAO:
- order by payable_invoice_imports.createdAt desc`;

type ExportColumnKey =
  | 'status'
  | 'invoice'
  | 'supplier'
  | 'issueDate'
  | 'total'
  | 'installments'
  | 'stockMovements'
  | 'approvedAt';

const EXPORT_COLUMNS: GridColumnDefinition<PayableInvoiceImportSummary, ExportColumnKey>[] = [
  { key: 'status', label: 'Situação', getValue: (item) => item.statusLabel },
  {
    key: 'invoice',
    label: 'Nota fiscal',
    getValue: (item) => `NF-e ${item.invoiceNumber}${item.series ? ` / ${item.series}` : ''}`,
  },
  { key: 'supplier', label: 'Fornecedor', getValue: (item) => item.supplierName || '---' },
  { key: 'issueDate', label: 'Emissão', getValue: (item) => formatDateLabel(item.issueDate) },
  { key: 'total', label: 'Valor total', getValue: (item) => formatCurrency(item.totalInvoiceAmount) },
  { key: 'installments', label: 'Duplicatas', getValue: (item) => String(item.installmentsCount) },
  { key: 'stockMovements', label: 'Entradas de estoque', getValue: (item) => String(item.stockMovementCount) },
  { key: 'approvedAt', label: 'Aprovada em', getValue: (item) => formatDateLabel(item.approvedAt || null) },
];

function getStatusClass(status: string) {
  return status === 'APPROVED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
}

function getSemaphoreClass(semaphore: 'GREEN' | 'YELLOW') {
  return semaphore === 'GREEN' ? 'bg-emerald-500' : 'bg-amber-400';
}

export default function FinanceiroNotasImportadasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
  const [items, setItems] = useState<PayableInvoiceImportSummary[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_APPROVAL' | 'APPROVED'>(
    'ALL',
  );
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
      const response = await getJson<PayableInvoiceImportSummary[]>(
        `/payables/invoice-imports${queryString}`,
      );
      setItems(response);
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar as notas importadas.',
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

  const summary = useMemo(() => {
    return items.reduce(
      (accumulator, current) => {
        accumulator.total += current.totalInvoiceAmount || 0;
        if (current.status === 'APPROVED') {
          accumulator.approved += 1;
        } else {
          accumulator.pending += 1;
        }
        return accumulator;
      },
      { total: 0, approved: 0, pending: 0 },
    );
  }, [items]);

  const handleSearchSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
  }, [searchInput]);

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={FINANCE_GRID_PAGE_LAYOUT.card}>
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
                Contas a pagar
              </div>
              <h1 className="mt-1 text-2xl font-black text-slate-900">Notas Importadas</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Consulte o histórico das notas já importadas e abra a aprovação quando necessário.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/contas-a-pagar/importacao-notas${navigationQuery}`}
                className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
              >
                Importar nova nota
              </Link>
              <Link
                href={`/contas-a-pagar${navigationQuery}`}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Voltar
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Notas no grid</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{items.length}</div>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-600">Pendentes</div>
              <div className="mt-1 text-2xl font-black text-amber-800">{summary.pending}</div>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Valor total listado</div>
              <div className="mt-1 text-2xl font-black text-emerald-800">{formatCurrency(summary.total)}</div>
            </div>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <form onSubmit={handleSearchSubmit} className="grid gap-4 xl:grid-cols-[1fr_220px_auto_auto]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Buscar nota ou fornecedor
                </span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="CHAVE, NÚMERO, FORNECEDOR..."
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Situação
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as 'ALL' | 'PENDING_APPROVAL' | 'APPROVED')
                  }
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                >
                  <option value="ALL">TODAS</option>
                  <option value="PENDING_APPROVAL">PENDENTES</option>
                  <option value="APPROVED">APROVADAS</option>
                </select>
              </label>

              <button type="submit" className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>
                Aplicar
              </button>

              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Exportar
              </button>
            </form>
          </section>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Semáforo</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Nota fiscal</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Fornecedor</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Emissão</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor total</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Duplicatas</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Estoque</th>
                    <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Carregando notas importadas...
                      </td>
                    </tr>
                  ) : items.length ? (
                    items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex h-3.5 w-3.5 rounded-full ${getSemaphoreClass(item.semaphore)}`} />
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getStatusClass(item.status)}`}>
                              {item.statusLabel}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div className="font-black text-slate-900">
                            NF-e {item.invoiceNumber}
                            {item.series ? ` / ${item.series}` : ''}
                          </div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.accessKey}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div>{item.supplierName || '---'}</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.supplierDocument || 'SEM DOCUMENTO'}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{formatDateLabel(item.issueDate)}</td>
                        <td className="px-4 py-4 align-top text-sm font-black text-slate-900">{formatCurrency(item.totalInvoiceAmount)}</td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{item.installmentsCount}</td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{item.stockMovementCount}</td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end">
                            <Link
                              href={`/contas-a-pagar/notas-importadas/${item.id}${navigationQuery}`}
                              className="rounded-xl bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                            >
                              Abrir
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Nenhuma nota importada encontrada com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {items.length} registro(s) no resultado
              </div>

              <ScreenNameCopy
                screenId={SCREEN_ID}
                className="justify-end"
                originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/notas-importadas/page.tsx"
                auditText={auditText}
              />
            </div>
          </div>
        </div>
      </section>

      <GridExportModal
        isOpen={isExportModalOpen}
        title="Exportar notas importadas"
        description={`A exportação considera ${items.length} registro(s) do filtro atual.`}
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
            rows: items,
            columns: EXPORT_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            fileBaseName: 'notas-importadas',
            branding: {
              title: 'Notas importadas',
              subtitle: 'Exportação das notas filtradas no contas a pagar.',
              schoolName: runtimeContext.companyName || items[0]?.companyName || 'FINANCEIRO',
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
