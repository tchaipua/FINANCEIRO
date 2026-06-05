'use client';

import { ReactNode } from 'react';

export type GridStatusFilterValue = 'ACTIVE' | 'INACTIVE' | 'ALL';

type GridStandardFooterProps = {
  statusFilter: GridStatusFilterValue;
  totalRecords: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  pageSizeOptions?: number[];
  aggregateSummaries?: Array<{ label: string; value: string }>;
  showRecordSummary?: boolean;
  onColumnSettings: () => void;
  onExport: () => void;
  onStatusFilterChange: (value: GridStatusFilterValue) => void;
  onPageSizeChange: (value: number) => void;
  onPageChange: (value: number) => void;
  children?: ReactNode;
};

function ColumnsIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={2} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5v14M15 5v14" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9V4h12v5" />
      <path d="M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1" />
      <path d="M6 14h12v6H6z" />
      <path d="M17 12h.01" />
    </svg>
  );
}

function StatusSwitches({
  value,
  onChange,
}: {
  value: GridStatusFilterValue;
  onChange: (value: GridStatusFilterValue) => void;
}) {
  return (
    <div className="flex items-center gap-2">
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
          tone: 'bg-amber-200',
          activeTone: 'bg-amber-400',
        },
        {
          value: 'INACTIVE' as const,
          label: 'Inativos',
          tone: 'bg-rose-200',
          activeTone: 'bg-rose-400',
        },
      ].map((item) => {
        const isActive = value === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-label={item.label}
            title={item.label}
            aria-pressed={isActive}
            className={`relative h-6 w-14 rounded-full border transition duration-200 ${
              isActive
                ? `${item.activeTone} scale-105 border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35),0_8px_24px_rgba(15,23,42,0.22)] ring-4 ring-slate-400 ring-offset-2 ring-offset-slate-100`
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
  );
}

export default function GridStandardFooter({
  statusFilter,
  totalRecords,
  pageSize,
  currentPage,
  totalPages,
  pageSizeOptions = [10, 20, 50, 100],
  aggregateSummaries = [],
  showRecordSummary = true,
  onColumnSettings,
  onExport,
  onStatusFilterChange,
  onPageSizeChange,
  onPageChange,
  children,
}: GridStandardFooterProps) {
  const normalizedTotalPages = Math.max(1, totalPages);
  const normalizedCurrentPage = Math.min(Math.max(1, currentPage), normalizedTotalPages);

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onColumnSettings}
            title="ALTERAR COLUNAS GRID"
            aria-label="ALTERAR COLUNAS GRID"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ColumnsIcon />
          </button>
          <button
            type="button"
            onClick={onExport}
            title="Imprimir ou exportar"
            aria-label="Imprimir ou exportar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-600"
          >
            <PrintIcon />
          </button>
          <StatusSwitches value={statusFilter} onChange={onStatusFilterChange} />
          {showRecordSummary ? (
            <>
              <div className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">
                Total registros: {totalRecords}
              </div>
              {aggregateSummaries.map((summary) => (
                <div
                  key={summary.label}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-600"
                >
                  {summary.label}: <span className="text-slate-900">{summary.value}</span>
                </div>
              ))}
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {children}
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            title="Registros por página"
            aria-label="Registros por página"
            className="h-10 rounded-full border border-slate-300 bg-white px-3 text-sm font-black text-slate-700 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={normalizedCurrentPage <= 1}
              title="Voltar para o início"
              aria-label="Voltar para o início"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &lt;&lt;
            </button>
            <button
              type="button"
              onClick={() => onPageChange(normalizedCurrentPage - 1)}
              disabled={normalizedCurrentPage <= 1}
              title="Voltar uma página"
              aria-label="Voltar uma página"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &lt;
            </button>
            <span className="min-w-16 text-center text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              {normalizedCurrentPage}/{normalizedTotalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(normalizedCurrentPage + 1)}
              disabled={normalizedCurrentPage >= normalizedTotalPages}
              title="Avançar uma página"
              aria-label="Avançar uma página"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &gt;
            </button>
            <button
              type="button"
              onClick={() => onPageChange(normalizedTotalPages)}
              disabled={normalizedCurrentPage >= normalizedTotalPages}
              title="Avançar para o final"
              aria-label="Avançar para o final"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &gt;&gt;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
