'use client';

import { useEffect, type ReactNode } from 'react';

type GridColumnSortDirection = 'ASC' | 'DESC';
export type GridDateRange = { from: string; to: string };
type GridDatePeriodOption = GridDateRange & { value: string; label: string };

type GridColumnFilterHeaderProps = {
  label: string;
  isOpen: boolean;
  isActive?: boolean;
  filterValue: string;
  filterType?: 'text' | 'date-range';
  filterControl?: ReactNode;
  placeholder?: string;
  align?: 'left' | 'right';
  sortDirection?: GridColumnSortDirection | null;
  onToggle: () => void;
  onSort: (direction: GridColumnSortDirection) => void;
  onFilterValueChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
};

const GRID_MONTHS = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

function toDateInputValue(value: string) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function monthDateRange(date: Date): GridDateRange {
  const year = date.getFullYear();
  const month = date.getMonth();
  return { from: `${year}-${String(month + 1).padStart(2, '0')}-01`, to: `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}` };
}

function buildDatePeriodOptions(referenceDate = new Date()): GridDatePeriodOption[] {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 12, 1);
  return Array.from({ length: 19 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const range = monthDateRange(date);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: `${GRID_MONTHS[date.getMonth()]}/${date.getFullYear()}`, ...range };
  });
}

export const buildGridDatePeriodOptions = buildDatePeriodOptions;

export function serializeGridDateRange(range: GridDateRange) { return `${range.from}|${range.to}`; }

export function parseGridDateRange(value: string): GridDateRange {
  const [from = '', to = ''] = String(value || '').split('|');
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

export function matchesGridDateRange(value: unknown, rangeValue: string) {
  const range = parseGridDateRange(rangeValue);
  if (!range.from && !range.to) return true;
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  const brazilianDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const normalized = brazilianDate ? `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}` : toDateInputValue(raw.slice(0, 10));
  if (!normalized) return false;
  return (!range.from || normalized >= range.from) && (!range.to || normalized <= range.to);
}

function SearchIcon() {
  return <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" /></svg>;
}

export default function GridColumnFilterHeader({ label, isOpen, isActive = false, filterValue, filterType = 'text', filterControl, placeholder = 'DIGITE O FILTRO', align = 'left', sortDirection = null, onToggle, onSort, onFilterValueChange, onApply, onClear }: GridColumnFilterHeaderProps) {
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>{label}</span>
      <button type="button" onClick={onToggle} className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${isActive ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'}`} title={`Filtrar ${label}`} aria-label={`Filtrar ${label}`} aria-expanded={isOpen}><SearchIcon /></button>
      {isOpen ? (
        <div className={`absolute top-8 z-50 ${filterType === 'date-range' ? 'w-[360px] max-w-[calc(100vw-2rem)]' : 'w-64'} rounded-2xl border border-slate-200 bg-white p-3 text-left normal-case tracking-normal text-slate-700 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="mb-3 space-y-2 border-b border-slate-100 pb-3"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Ordenar coluna</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => onSort('ASC')} className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${sortDirection === 'ASC' ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>Crescente</button><button type="button" onClick={() => onSort('DESC')} className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${sortDirection === 'DESC' ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>Decrescente</button></div></div>
          <div className="space-y-2"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Filtrar {label}</div>{filterControl ?? (filterType === 'date-range' ? <DateRangeFilter value={filterValue} onChange={onFilterValueChange} onApply={onApply} /> : <input value={filterValue} onChange={(event) => onFilterValueChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onApply(); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500" placeholder={placeholder} />)}<button type="button" onClick={onApply} className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100">Filtrar</button><button type="button" onClick={onClear} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100">Limpar</button></div>
        </div>
      ) : null}
    </div>
  );
}

function DateRangeFilter({ value, onChange, onApply }: { value: string; onChange: (value: string) => void; onApply: () => void }) {
  const options = buildDatePeriodOptions();
  useEffect(() => {
    if (!value && options[12]) onChange(serializeGridDateRange(options[12]));
  }, [onChange, options, value]);
  const range = parseGridDateRange(value);
  const selectedPeriod = options.find((option) => option.from === range.from && option.to === range.to)?.value || 'CUSTOM';
  const updateRange = (nextRange: GridDateRange) => onChange(serializeGridDateRange(nextRange));
  return <div className="space-y-2"><label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Período<select value={selectedPeriod} onChange={(event) => { const option = options.find((item) => item.value === event.target.value); if (option) updateRange(option); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500"><option value="CUSTOM">PERÍODO PERSONALIZADO</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="grid grid-cols-2 gap-2">{(['from', 'to'] as const).map((field) => <label key={field} className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{field === 'from' ? 'De' : 'Até'}<input type="date" value={range[field]} onChange={(event) => updateRange({ ...range, [field]: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') onApply(); }} className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500" /></label>)}</div></div>;
}
