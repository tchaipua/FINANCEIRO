export const FINANCE_GRID_PAGE_LAYOUT = {
  shell: 'space-y-6',
  card: 'rounded-3xl border border-slate-200 bg-white shadow-sm',
  pageGrid: 'grid gap-6',
  toolbarGrid: 'grid gap-4 xl:grid-cols-[auto_1fr_auto_auto]',
  footerGrid: 'flex items-center justify-between gap-4',
  primaryButton:
    'rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700',
  secondaryButton:
    'inline-flex items-center justify-center rounded-2xl bg-rose-500 px-6 py-3 text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600',
  iconButton:
    'inline-flex items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700',
  dangerIconButton:
    'inline-flex items-center justify-center rounded-2xl bg-rose-500 text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600',
  footerActionButton:
    'inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50',
  footerIconButton:
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-600',
  input:
    'rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100',
  modalOverlay:
    'fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm',
  modalPanel:
    'flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl',
  modalHeader:
    'flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5',
  modalBody:
    'flex min-h-0 flex-1 flex-col p-6',
  modalSummaryCard:
    'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4',
  modalListItem:
    'flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 transition',
  modalActiveItem: 'border-emerald-300 bg-emerald-100/90 ring-2 ring-emerald-300',
  modalInactiveItem: 'border-slate-200 bg-white',
  modalToggleOn:
    'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-500 text-white shadow-sm shadow-emerald-200/80 transition-transform hover:scale-105',
  modalToggleOff:
    'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-rose-200 bg-rose-500 text-white shadow-sm shadow-rose-200/80 transition-transform hover:scale-105',
} as const;

export type FinanceGridPageLayout = typeof FINANCE_GRID_PAGE_LAYOUT;
