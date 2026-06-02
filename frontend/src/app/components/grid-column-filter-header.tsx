'use client';

type GridColumnSortDirection = 'ASC' | 'DESC';

type GridColumnFilterHeaderProps = {
  label: string;
  isOpen: boolean;
  isActive?: boolean;
  filterValue: string;
  placeholder?: string;
  align?: 'left' | 'right';
  sortDirection?: GridColumnSortDirection | null;
  onToggle: () => void;
  onSort: (direction: GridColumnSortDirection) => void;
  onFilterValueChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
};

function SearchIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"
      />
    </svg>
  );
}

export default function GridColumnFilterHeader({
  label,
  isOpen,
  isActive = false,
  filterValue,
  placeholder = 'DIGITE O FILTRO',
  align = 'left',
  sortDirection = null,
  onToggle,
  onSort,
  onFilterValueChange,
  onApply,
  onClear,
}: GridColumnFilterHeaderProps) {
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
          isActive
            ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
        }`}
        title={`Filtrar ${label}`}
        aria-label={`Filtrar ${label}`}
        aria-expanded={isOpen}
      >
        <SearchIcon />
      </button>

      {isOpen ? (
        <div
          className={`absolute top-8 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-left normal-case tracking-normal text-slate-700 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="mb-3 space-y-2 border-b border-slate-100 pb-3">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Ordenar coluna
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSort('ASC')}
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
                onClick={() => onSort('DESC')}
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

          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Filtrar {label}
            </div>
            <input
              value={filterValue}
              onChange={(event) => onFilterValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onApply();
                }
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={onApply}
              className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100"
            >
              Filtrar
            </button>
            <button
              type="button"
              onClick={onClear}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100"
            >
              Limpar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
