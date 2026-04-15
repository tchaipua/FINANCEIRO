'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_GRID_PDF_OPTIONS,
  type GridExportFormat,
  type GridPdfOptions,
  normalizeGridPdfOptions,
} from '@/app/lib/grid-export-utils';

type ExportColumn<ColumnKey extends string> = { key: ColumnKey; label: string };

type GridExportModalProps<ColumnKey extends string> = {
  isOpen: boolean;
  title: string;
  description: string;
  format: GridExportFormat;
  onFormatChange: (format: GridExportFormat) => void;
  columns: ExportColumn<ColumnKey>[];
  selectedColumns: Record<ColumnKey, boolean>;
  storageKey?: string;
  brandingName?: string | null;
  brandingLogoUrl?: string | null;
  onClose: () => void;
  onExport: (config: {
    selectedColumns: Record<ColumnKey, boolean>;
    orderedColumns: ColumnKey[];
    orderedVisibleColumns: ExportColumn<ColumnKey>[];
    pdfOptions: GridPdfOptions;
  }) => void;
};

type StoredExportConfig = {
  order?: string[];
  selected?: Record<string, boolean>;
  pdfOptions?: Partial<GridPdfOptions>;
};

function defaultStorageKey(title: string) {
  if (typeof window === 'undefined') return null;
  return `financeiro:grid-export:${window.location.pathname}:${title.toLowerCase().replace(/[^\w]+/g, '-')}`;
}

function readStored(storageKey: string | null) {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StoredExportConfig) : null;
  } catch {
    return null;
  }
}

function writeStored<ColumnKey extends string>(
  storageKey: string,
  order: ColumnKey[],
  selected: Record<ColumnKey, boolean>,
  pdfOptions: GridPdfOptions,
) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ order, selected, pdfOptions } satisfies StoredExportConfig),
  );
}

function normalizeOrder<ColumnKey extends string>(order: string[] | undefined, all: ColumnKey[]) {
  const valid = order?.filter((item): item is ColumnKey => all.includes(item as ColumnKey)) || [];
  return [...valid, ...all.filter((key) => !valid.includes(key))];
}

function normalizeSelected<ColumnKey extends string>(
  selected: Record<string, boolean> | undefined,
  base: Record<ColumnKey, boolean>,
  all: ColumnKey[],
) {
  const next = { ...base };
  all.forEach((key) => {
    if (typeof selected?.[key] === 'boolean') next[key] = Boolean(selected[key]);
  });
  return next;
}

function initials(value: string | null | undefined) {
  const tokens = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 'FIN';
  return tokens.slice(0, 3).map((token) => token[0]?.toUpperCase()).join('');
}

function OptionCard({
  title,
  detail,
  active,
  onClick,
}: {
  title: string;
  detail: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-4 text-left transition ${
        active
          ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm ring-2 ring-blue-100'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="text-sm font-bold">{title}</div>
      <div className="mt-1 text-xs font-medium text-slate-500">{detail}</div>
    </button>
  );
}

export default function GridExportModal<ColumnKey extends string>({
  isOpen,
  title,
  description,
  format,
  onFormatChange,
  columns,
  selectedColumns,
  storageKey,
  brandingName,
  brandingLogoUrl,
  onClose,
  onExport,
}: GridExportModalProps<ColumnKey>) {
  const effectiveStorageKey = useMemo(
    () => storageKey || defaultStorageKey(title),
    [storageKey, title],
  );
  const allKeys = useMemo(() => columns.map((column) => column.key), [columns]);
  const [orderedColumns, setOrderedColumns] = useState<ColumnKey[]>(allKeys);
  const [localSelectedColumns, setLocalSelectedColumns] =
    useState<Record<ColumnKey, boolean>>(selectedColumns);
  const [pdfOptions, setPdfOptions] = useState<GridPdfOptions>(DEFAULT_GRID_PDF_OPTIONS);
  const [viewMode, setViewMode] = useState<'columns' | 'pdf'>('columns');
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setViewMode('columns');
      setDraggedColumn(null);
      return;
    }

    const stored = readStored(effectiveStorageKey);
    setOrderedColumns(normalizeOrder(stored?.order, allKeys));
    setLocalSelectedColumns(normalizeSelected(stored?.selected, selectedColumns, allKeys));
    setPdfOptions(normalizeGridPdfOptions(stored?.pdfOptions));
    setViewMode('columns');
  }, [allKeys, effectiveStorageKey, isOpen, selectedColumns]);

  useEffect(() => {
    if (!isOpen || !effectiveStorageKey) return;
    writeStored(effectiveStorageKey, orderedColumns, localSelectedColumns, pdfOptions);
  }, [effectiveStorageKey, isOpen, localSelectedColumns, orderedColumns, pdfOptions]);

  useEffect(() => {
    if (format !== 'pdf') setViewMode('columns');
  }, [format]);

  const orderedExportColumns = useMemo(
    () =>
      orderedColumns
        .map((key) => columns.find((column) => column.key === key))
        .filter((column): column is ExportColumn<ColumnKey> => Boolean(column)),
    [columns, orderedColumns],
  );
  const displayColumns = useMemo(() => {
    const selected = orderedExportColumns.filter((column) => localSelectedColumns[column.key]);
    const unselected = orderedExportColumns.filter((column) => !localSelectedColumns[column.key]);
    return [...selected, ...unselected];
  }, [localSelectedColumns, orderedExportColumns]);
  const selectedCount = useMemo(
    () => Object.values(localSelectedColumns).filter(Boolean).length,
    [localSelectedColumns],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {brandingLogoUrl ? (
                <img src={brandingLogoUrl} alt={brandingName || 'Financeiro'} className="h-full w-full object-contain" />
              ) : (
                <span className="text-sm font-black tracking-[0.25em] text-[#153a6a]">{initials(brandingName)}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-blue-600">
                {brandingName || 'Financeiro'}
              </div>
              <h2 className="truncate text-xl font-bold text-[#153a6a]">{title}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">{description}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-red-500">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {viewMode === 'columns' ? (
            <div className="space-y-6">
              <div>
                <div className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                  Formato do arquivo
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  {([
                    ['excel', 'Excel (.xls)', 'Planilha pronta para abrir no Excel'],
                    ['csv', 'CSV (.csv)', 'Arquivo leve para importação'],
                    ['pdf', 'PDF', 'Abre a etapa de layout profissional'],
                    ['json', 'JSON (.json)', 'Estrutura de dados em JSON'],
                    ['txt', 'Texto (.txt)', 'Texto simples do grid'],
                  ] as Array<[GridExportFormat, string, string]>).map(([value, label, detail]) => (
                    <OptionCard key={value} title={label} detail={detail} active={format === value} onClick={() => onFormatChange(value)} />
                  ))}
                </div>
              </div>

              <div className="border-b border-slate-100 pb-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
                      Colunas da exportação
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      As colunas selecionadas aparecem primeiro. Desmarque apenas o que não quiser levar.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {selectedCount} coluna(s) ativa(s)
                    </div>
                    <button type="button" onClick={() => setLocalSelectedColumns(Object.fromEntries(allKeys.map((key) => [key, true])) as Record<ColumnKey, boolean>)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      Marcar todas
                    </button>
                    <button type="button" onClick={() => setLocalSelectedColumns(Object.fromEntries(allKeys.map((key) => [key, false])) as Record<ColumnKey, boolean>)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      Limpar todas
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {displayColumns.map((column, index) => (
                  <div
                    key={column.key}
                    draggable
                    onDragStart={() => setDraggedColumn(column.key)}
                    onDragEnd={() => setDraggedColumn(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedColumn || draggedColumn === column.key) return;
                      setOrderedColumns((current) => {
                        const next = [...current];
                        const from = next.indexOf(draggedColumn);
                        const to = next.indexOf(column.key);
                        if (from === -1 || to === -1) return current;
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        return next;
                      });
                      setDraggedColumn(null);
                    }}
                    className={`flex cursor-grab items-center justify-between gap-3 rounded-2xl border px-4 py-4 ${
                      draggedColumn === column.key ? 'border-emerald-300 bg-emerald-100 ring-2 ring-emerald-200' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-xs font-black uppercase tracking-wide text-slate-400">{`${index + 1}º`}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLocalSelectedColumns((current) => ({
                            ...current,
                            [column.key]: !current[column.key],
                          }))
                        }
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-white shadow-sm ${
                          localSelectedColumns[column.key] ? 'border-emerald-200 bg-emerald-500' : 'border-red-200 bg-red-500'
                        }`}
                      >
                        {localSelectedColumns[column.key] ? '✓' : '✕'}
                      </button>
                      <span className="truncate text-sm font-medium text-slate-700">{column.label}</span>
                    </div>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">⋮</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Layout PDF</div>
                  <div className="mt-1.5 text-xl font-bold text-[#153a6a]">Monte o relatório do seu jeito</div>
                  <p className="mt-1.5 text-xs font-medium leading-5 text-slate-500">
                    Estas preferências ficam gravadas no navegador e já voltam prontas na próxima exportação em PDF desta tela.
                  </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Orientação da página</div>
                    <OptionCard title="Retrato" detail="Melhor para poucas colunas e leitura mais vertical." active={pdfOptions.orientation === 'portrait'} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, orientation: 'portrait' }))} />
                    <OptionCard title="Paisagem" detail="Ideal para relatórios mais largos e várias colunas." active={pdfOptions.orientation === 'landscape'} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, orientation: 'landscape' }))} />
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Leitura por registro</div>
                    <OptionCard title="Compacta" detail="Mais registros por página." active={pdfOptions.rowDensity === 'compact'} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, rowDensity: 'compact' }))} />
                    <OptionCard title="Equilibrada" detail="Boa leitura sem desperdiçar espaço." active={pdfOptions.rowDensity === 'comfortable'} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, rowDensity: 'comfortable' }))} />
                    <OptionCard title="Arejada" detail="Mais respiro visual por linha." active={pdfOptions.rowDensity === 'spacious'} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, rowDensity: 'spacious' }))} />
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Linhas por campo</div>
                    {([1, 2, 3, 0] as const).map((value) => (
                      <OptionCard key={`${value}`} title={value === 0 ? 'Livre' : `${value} linha${value > 1 ? 's' : ''}`} detail={value === 0 ? 'Não corta o conteúdo do campo.' : 'Ajuste a altura do conteúdo no PDF.'} active={pdfOptions.lineClamp === value} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, lineClamp: value }))} />
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Apresentação dos campos</div>
                    <OptionCard title="Com cabeçalho de colunas" detail="Mantém o cabeçalho tradicional no topo da tabela." active={pdfOptions.showColumnHeaders} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, showColumnHeaders: true }))} />
                    <OptionCard title="Sem cabeçalho, com descrição no campo" detail="Cada campo sai alinhado com a descrição à esquerda e o conteúdo à direita." active={!pdfOptions.showColumnHeaders} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, showColumnHeaders: false }))} />
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Espaço ocupado pelos campos</div>
                    {([
                      ['compact', 'Compacta', 'Aperta colunas e cabe mais informação na página.'],
                      ['balanced', 'Equilibrada', 'Distribui bem a largura entre os campos.'],
                      ['detailed', 'Detalhada', 'Dá mais liberdade para campos longos ocuparem espaço.'],
                    ] as const).map(([value, label, detail]) => (
                      <OptionCard key={value} title={label} detail={detail} active={pdfOptions.widthStrategy === value} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, widthStrategy: value }))} />
                    ))}
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Escala da fonte</div>
                    {([
                      ['small', 'Pequena'],
                      ['medium', 'Média'],
                      ['large', 'Grande'],
                    ] as const).map(([value, label]) => (
                      <OptionCard key={value} title={label} detail="Ajuste rápido para caber mais ou melhorar a leitura." active={pdfOptions.fontScale === value} onClick={() => setPdfOptions((current) => normalizeGridPdfOptions({ ...current, fontScale: value }))} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Resumo salvo</div>
                  <div className="mt-1.5 text-base font-bold text-[#153a6a]">Prévia do layout</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Orientação</div><div className="mt-1 text-sm font-semibold text-slate-700">{pdfOptions.orientation === 'landscape' ? 'Paisagem' : 'Retrato'}</div></div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Leitura</div><div className="mt-1 text-sm font-semibold text-slate-700">{pdfOptions.rowDensity === 'compact' ? 'Compacta' : pdfOptions.rowDensity === 'spacious' ? 'Arejada' : 'Equilibrada'}</div></div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Linhas por campo</div><div className="mt-1 text-sm font-semibold text-slate-700">{pdfOptions.lineClamp === 0 ? 'Livre' : `${pdfOptions.lineClamp} linha(s)`}</div></div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Apresentação</div><div className="mt-1 text-sm font-semibold text-slate-700">{pdfOptions.showColumnHeaders ? 'Com cabeçalho' : 'Descrição no campo'}</div></div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Largura</div><div className="mt-1 text-sm font-semibold text-slate-700">{pdfOptions.widthStrategy === 'compact' ? 'Compacta' : pdfOptions.widthStrategy === 'detailed' ? 'Detalhada' : 'Equilibrada'}</div></div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Fonte</div><div className="mt-1 text-sm font-semibold text-slate-700">{pdfOptions.fontScale === 'small' ? 'Pequena' : pdfOptions.fontScale === 'large' ? 'Grande' : 'Média'}</div></div>
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="text-sm font-bold text-emerald-800">Dica rápida</div>
                  <p className="mt-1.5 text-xs font-medium leading-5 text-emerald-700">
                    Para relatórios mais largos, combine <strong>Paisagem</strong> com largura <strong>Detalhada</strong>. Para impressão econômica, use leitura <strong>Compacta</strong> com fonte <strong>Pequena</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-between gap-3 border-t border-slate-100 bg-white px-6 py-5">
          <div>
            {viewMode === 'pdf' ? (
              <button type="button" onClick={() => setViewMode('columns')} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Voltar para colunas
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (format === 'pdf' && viewMode === 'columns') {
                  setViewMode('pdf');
                  return;
                }
                onExport({
                  selectedColumns: localSelectedColumns,
                  orderedColumns,
                  orderedVisibleColumns: orderedExportColumns,
                  pdfOptions,
                });
              }}
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-500"
            >
              {format === 'pdf' && viewMode === 'columns' ? 'Avançar para layout PDF' : 'Exportar agora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
