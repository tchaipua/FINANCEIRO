'use client';

export type GridStatusFilterValue = 'ACTIVE' | 'ALL' | 'INACTIVE';

type GridStatusFilterProps = {
  value: GridStatusFilterValue;
  onChange: (value: GridStatusFilterValue) => void;
  activeLabel?: string;
  allLabel?: string;
  inactiveLabel?: string;
};

type StatusSwitchProps = {
  selected: boolean;
  title: string;
  tone: 'green' | 'yellow' | 'red';
  marker: 'left' | 'center' | 'right';
  onClick: () => void;
};

function StatusSwitch({ selected, title, tone, marker, onClick }: StatusSwitchProps) {
  const baseTone = {
    green: selected ? 'border-emerald-700 bg-emerald-600 shadow-emerald-200/80' : 'border-transparent bg-emerald-100',
    yellow: selected ? 'border-amber-600 bg-amber-400 shadow-amber-200/80' : 'border-transparent bg-amber-100',
    red: selected ? 'border-rose-800 bg-rose-600 shadow-rose-200/80' : 'border-transparent bg-rose-100',
  }[tone];

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
      className={`relative h-5 w-12 rounded-full border transition duration-200 ${baseTone} ${selected ? 'shadow-sm ring-2 ring-offset-1 ring-offset-slate-50' : 'opacity-80 hover:opacity-100'}`}
    >
      <span
        className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-sm transition-all duration-200 ${selected ? marker === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-1' : 'left-1'}`}
      />
    </button>
  );
}

export default function GridStatusFilter({
  value,
  onChange,
  activeLabel = 'Mostrar somente ativos',
  allLabel = 'Mostrar ativos e inativos',
  inactiveLabel = 'Mostrar somente inativos',
}: GridStatusFilterProps) {
  return (
    <div className="flex items-center gap-2" aria-label="Semáforo de situação dos registros">
      <StatusSwitch
        selected={value === 'ACTIVE'}
        title={activeLabel}
        tone="green"
        marker="left"
        onClick={() => onChange('ACTIVE')}
      />
      <StatusSwitch
        selected={value === 'ALL'}
        title={allLabel}
        tone="yellow"
        marker="center"
        onClick={() => onChange('ALL')}
      />
      <StatusSwitch
        selected={value === 'INACTIVE'}
        title={inactiveLabel}
        tone="red"
        marker="right"
        onClick={() => onChange('INACTIVE')}
      />
    </div>
  );
}
