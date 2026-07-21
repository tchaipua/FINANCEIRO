'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import GridColumnFilterHeader from '@/app/components/grid-column-filter-header';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter from '@/app/components/grid-standard-footer';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import { formatCurrency, formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
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

type BankItem = {
  id: string;
  bankName: string;
  branchNumber: string;
  branchDigit?: string | null;
  accountNumber: string;
  accountDigit?: string | null;
  status: string;
};

type OpenDdaItem = {
  id: string;
  dueDate?: string | null;
  issueDate?: string | null;
  beneficiaryName: string;
  beneficiaryDocument?: string | null;
  payerName?: string | null;
  payerDocument?: string | null;
  documentNumber?: string | null;
  digitableLine?: string | null;
  barcode?: string | null;
  amount: number;
  status: string;
  bankStatus?: string | null;
  localNotes?: string | null;
  statusChangedAt?: string | null;
  statusChangedBy?: string | null;
  paidAt?: string | null;
};

type OpenDdaResponse = {
  ddaCount: number;
  pulledAt?: string | null;
  items: OpenDdaItem[];
  message?: string;
};

type DdaColumnKey = 'dueDate' | 'beneficiaryName' | 'documentNumber' | 'payerName' | 'amount' | 'paidAt' | 'status';
type DdaFilters = Record<DdaColumnKey, string>;
type DdaSort = { key: DdaColumnKey; direction: 'ASC' | 'DESC' };
type DdaStatusFilter = 'OPEN' | 'CLOSED' | 'CANCELED' | 'ALL';
type DdaLocalAction = 'CLOSE' | 'CANCEL';
type DdaActionModalState = { action: DdaLocalAction; item: OpenDdaItem } | null;

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_BANCOS_DDAS_ABERTOS';
const COLUMN_CONFIG_POPUP_ID = 'POPUP_PRINCIPAL_FINANCEIRO_BANCOS_DDAS_ABERTOS_COLUNAS';
const CLOSE_DDA_POPUP_ID = 'POPUP_PRINCIPAL_FINANCEIRO_BANCOS_DDAS_ABERTOS_BAIXA_LOCAL';
const CANCEL_DDA_POPUP_ID = 'POPUP_PRINCIPAL_FINANCEIRO_BANCOS_DDAS_ABERTOS_CANCELAMENTO_LOCAL';
const GRID_STORAGE_PREFIX = 'financeiro:bancos-ddas-abertos:grid-columns:';
const EXPORT_STORAGE_PREFIX = 'financeiro:bancos-ddas-abertos:export-config:';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const cardClass = FINANCE_GRID_PAGE_LAYOUT.card;
const DEFAULT_FILTERS: DdaFilters = {
  dueDate: '',
  beneficiaryName: '',
  documentNumber: '',
  payerName: '',
  amount: '',
  paidAt: '',
  status: '',
};
const DDA_COLUMNS: GridColumnDefinition<OpenDdaItem, DdaColumnKey>[] = [
  { key: 'dueDate', label: 'Vencimento', getValue: (item) => formatDateOnlyLabel(item.dueDate), align: 'center' },
  { key: 'beneficiaryName', label: 'Beneficiário', getValue: (item) => `${item.beneficiaryName || '---'} ${item.beneficiaryDocument || ''}`.trim() },
  { key: 'documentNumber', label: 'Documento', getValue: (item) => item.documentNumber || '---' },
  { key: 'payerName', label: 'Pagador', getValue: (item) => `${item.payerName || '---'} ${item.payerDocument || ''}`.trim() },
  { key: 'amount', label: 'Valor', getValue: (item) => formatCurrency(item.amount), align: 'right' },
  { key: 'paidAt', label: 'Data pagamento', getValue: (item) => item.paidAt ? formatDateOnlyLabel(item.paidAt) : '---', align: 'center' },
  { key: 'status', label: 'Situação', getValue: (item) => getDdaStatusLabel(item.status), align: 'center' },
];

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

function readBankIdFromUrl() {
  if (typeof window === 'undefined') return '';
  return String(new URLSearchParams(window.location.search).get('bankId') || '').trim();
}

function buildReturnQueryStringFromUrl() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  params.delete('bankId');
  const query = params.toString();
  return query ? `?${query}` : '';
}

function formatDateOnlyLabel(value?: string | null) {
  const normalized = String(value || '').trim();
  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
  return formatDateLabel(normalized);
}

function normalizeGridText(value: unknown) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function getTodayDateInputValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function isDdaOverdue(item: OpenDdaItem) {
  const normalized = String(item.dueDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day) < todayOnly;
}

function getDdaStatusTone(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'CLOSED') return 'border-amber-300 bg-amber-100 text-amber-800';
  if (normalized === 'CANCELED') return 'border-rose-300 bg-rose-100 text-rose-800';
  if (normalized.includes('VENC')) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'OPEN' || normalized.includes('ABERTO') || normalized.includes('PEND')) return 'border-emerald-300 bg-emerald-100 text-emerald-800';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

function getDdaStatusLabel(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'CLOSED') return 'FECHADO';
  if (normalized === 'CANCELED') return 'CANCELADO';
  return 'ABERTO';
}

function getColumnStorageKey(tenantId: string | null) {
  return `${GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getExportStorageKey(tenantId: string | null) {
  return `${EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function readHiddenColumns(tenantId: string | null): DdaColumnKey[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(getColumnStorageKey(tenantId)) || '[]');
    const keys = DDA_COLUMNS.map((column) => column.key);
    return Array.isArray(stored) ? stored.filter((key): key is DdaColumnKey => keys.includes(key)) : [];
  } catch {
    return [];
  }
}

function ClearFiltersIcon() {
  return <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 15l3 3m0-3-3 3" /></svg>;
}

function DdaColumnConfigModal({
  isOpen,
  hiddenColumns,
  companyName,
  logoUrl,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  hiddenColumns: DdaColumnKey[];
  companyName: string | null;
  logoUrl: string | null;
  onClose: () => void;
  onSave: (hidden: DdaColumnKey[]) => void;
}) {
  const [draftHidden, setDraftHidden] = useState<DdaColumnKey[]>(hiddenColumns);
  useEffect(() => { if (isOpen) setDraftHidden(hiddenColumns); }, [hiddenColumns, isOpen]);
  if (!isOpen) return null;

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <section className={`${FINANCE_GRID_PAGE_LAYOUT.modalPanel} max-w-xl`} aria-modal="true" role="dialog" aria-labelledby="dda-column-config-title">
        <header className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
              {logoUrl ? <img src={logoUrl} alt={companyName || 'Empresa'} className="h-full w-full object-contain" /> : <span className="text-xs font-black text-blue-700">FIN</span>}
            </div>
            <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Grid de DDAs</div><h2 id="dda-column-config-title" className="mt-1 text-lg font-black text-slate-900">Alterar colunas</h2></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-600">Fechar</button>
        </header>
        <div className="grid gap-2 p-6">
          {DDA_COLUMNS.map((column) => {
            const visible = !draftHidden.includes(column.key);
            return <button key={column.key} type="button" onClick={() => setDraftHidden((current) => visible ? [...current, column.key] : current.filter((key) => key !== column.key))} className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold ${visible ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{visible ? '✓ ' : '○ '}{column.label}</button>;
          })}
        </div>
        <footer className="border-t border-slate-100 bg-slate-50 px-6 py-4"><div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-600">Cancelar</button><button type="button" onClick={() => { onSave(draftHidden); onClose(); }} className="rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white">Aplicar</button></div><div className="mt-4 border-t border-slate-200 pt-3"><ScreenNameCopy screenId={COLUMN_CONFIG_POPUP_ID} className="justify-end" /></div></footer>
      </section>
    </div>
  );
}

function DdaLocalActionModal({
  state,
  companyName,
  logoUrl,
  isSaving,
  onClose,
  onConfirm,
}: {
  state: DdaActionModalState;
  companyName: string | null;
  logoUrl: string | null;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (notes: string, paymentDate: string) => void;
}) {
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayDateInputValue);
  useEffect(() => { if (state) { setNotes(''); setPaymentDate(getTodayDateInputValue()); } }, [state]);
  if (!state) return null;
  const isClose = state.action === 'CLOSE';
  const popupId = isClose ? CLOSE_DDA_POPUP_ID : CANCEL_DDA_POPUP_ID;

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <section className={`${FINANCE_GRID_PAGE_LAYOUT.modalPanel} max-w-xl`} aria-modal="true" role="dialog" aria-labelledby="dda-local-action-title">
        <header className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
              {logoUrl ? <img src={logoUrl} alt={companyName || 'Empresa'} className="h-full w-full object-contain" /> : <span className="text-xs font-black text-blue-700">FIN</span>}
            </div>
            <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Controle local de DDA</div><h2 id="dda-local-action-title" className="mt-1 text-lg font-black text-slate-900">{isClose ? 'Baixar DDA' : 'Cancelar DDA'}</h2></div>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-600">Fechar</button>
        </header>
        <div className="space-y-4 p-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">Esta ação altera somente o Financeiro e não envia baixa ou cancelamento ao banco.</div>
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Beneficiário</div><div className="mt-1 font-black text-slate-800">{state.item.beneficiaryName}</div></div><div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Valor</div><div className="mt-1 font-black text-slate-800">{formatCurrency(state.item.amount)}</div></div></div>
          {isClose ? <label className="block w-full space-y-1"><span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Data do pagamento</span><input type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={`${FINANCE_GRID_PAGE_LAYOUT.input} block w-full`} /></label> : null}
          <label className="block w-full space-y-1"><span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Observação</span><textarea value={notes} onChange={(event) => setNotes(event.target.value.toUpperCase())} rows={3} className={`${FINANCE_GRID_PAGE_LAYOUT.input} block w-full`} placeholder="OPCIONAL" /></label>
        </div>
        <footer className="border-t border-slate-100 bg-slate-50 px-6 py-4"><div className="flex justify-end gap-3"><button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-600">Voltar</button><button type="button" onClick={() => onConfirm(notes, paymentDate)} disabled={isSaving || (isClose && !paymentDate)} className={`rounded-xl px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:opacity-60 ${isClose ? 'bg-emerald-600' : 'bg-rose-600'}`}>{isSaving ? 'Gravando...' : isClose ? 'Confirmar baixa local' : 'Confirmar cancelamento local'}</button></div><div className="mt-4 border-t border-slate-200 pt-3"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Auditoria: usuário, data, situação anterior e nova situação serão gravados.</div><ScreenNameCopy screenId={popupId} className="mt-2 justify-end" /></div></footer>
      </section>
    </div>
  );
}

export default function FinanceiroOpenDdasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [returnQueryString, setReturnQueryString] = useState('');
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [lockedBankId, setLockedBankId] = useState('');
  const [ddaItems, setDdaItems] = useState<OpenDdaItem[]>([]);
  const [pulledAt, setPulledAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConsulting, setIsConsulting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generalSearch, setGeneralSearch] = useState('');
  const [filterDrafts, setFilterDrafts] = useState<DdaFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DdaFilters>(DEFAULT_FILTERS);
  const [activeFilterColumn, setActiveFilterColumn] = useState<DdaColumnKey | null>(null);
  const [gridSort, setGridSort] = useState<DdaSort>({ key: 'dueDate', direction: 'ASC' });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<DdaColumnKey[]>([]);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<DdaColumnKey, boolean>>(buildDefaultExportColumns(DDA_COLUMNS));
  const [statusFilter, setStatusFilter] = useState<DdaStatusFilter>('OPEN');
  const [actionModal, setActionModal] = useState<DdaActionModalState>(null);
  const [isUpdatingDda, setIsUpdatingDda] = useState(false);

  const scopeReady = Boolean(runtimeContext.sourceSystem && runtimeContext.sourceTenantId);
  const selectedBank = useMemo(() => banks.find((item) => item.id === selectedBankId) || null, [banks, selectedBankId]);
  const banksReturnQueryString = returnQueryString || preservedQueryString;
  const visibleColumns = useMemo(() => DDA_COLUMNS.filter((column) => !hiddenColumns.includes(column.key)), [hiddenColumns]);

  const clearDdas = useCallback(() => { setDdaItems([]); setPulledAt(null); setStatusMessage(null); }, []);
  const handleReturnToBanks = useCallback((event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); window.location.href = `/bancos${buildReturnQueryStringFromUrl() || banksReturnQueryString}`; }, [banksReturnQueryString]);

  const loadOpenDdas = useCallback(async () => {
    if (!scopeReady || !selectedBankId) { clearDdas(); return; }
    try {
      setIsConsulting(true); setError(null); setStatusMessage(null);
      const response = await getJson<OpenDdaResponse>(`/banks/${selectedBankId}/dda/open${buildFinanceApiQueryString(runtimeContext, { sourceBranchCode: runtimeContext.sourceBranchCode, requestedBy: runtimeContext.cashierDisplayName || runtimeContext.cashierUserId || 'SISTEMA' })}`);
      setDdaItems(response.items || []); setPulledAt(response.pulledAt || null); setStatusMessage(null);
    } catch (currentError) { clearDdas(); setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível consultar os DDAs em aberto no banco.')); }
    finally { setIsConsulting(false); }
  }, [clearDdas, runtimeContext, scopeReady, selectedBankId]);

  const loadPageData = useCallback(async () => {
    if (!scopeReady) { setIsLoading(false); return; }
    try {
      setIsLoading(true); setError(null);
      const loadedBanks = await getJson<BankItem[]>(`/banks${buildFinanceApiQueryString(runtimeContext, { status: 'ACTIVE' })}`);
      const activeBanks = loadedBanks.filter((item) => String(item.status || '').trim().toUpperCase() === 'ACTIVE');
      setBanks(activeBanks);
      if (!selectedBankId && !lockedBankId && activeBanks.length) setSelectedBankId(activeBanks[0].id);
    } catch (currentError) { setBanks([]); clearDdas(); setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível carregar os bancos para consultar DDA.')); }
    finally { setIsLoading(false); }
  }, [clearDdas, lockedBankId, runtimeContext, scopeReady, selectedBankId]);

  const handleDdaLocalAction = useCallback(async (notes: string, paymentDate: string) => {
    if (!actionModal || !selectedBankId || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    try {
      setIsUpdatingDda(true); setError(null);
      const endpoint = actionModal.action === 'CLOSE' ? 'close' : 'cancel';
      const updated = await requestJson<OpenDdaItem>(`/banks/${selectedBankId}/dda/${actionModal.item.id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          sourceBranchCode: runtimeContext.sourceBranchCode,
          requestedBy: runtimeContext.cashierDisplayName || runtimeContext.cashierUserId || 'SISTEMA',
          cashierUserId: runtimeContext.cashierUserId || undefined,
          cashierDisplayName: runtimeContext.cashierDisplayName || undefined,
          paymentDate: actionModal.action === 'CLOSE' ? paymentDate : undefined,
          notes: notes || undefined,
        }),
        fallbackMessage: 'Não foi possível atualizar o DDA no controle local.',
      });
      setDdaItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      setStatusMessage(actionModal.action === 'CLOSE' ? 'DDA baixado somente no controle local do Financeiro.' : 'DDA cancelado somente no controle local do Financeiro.');
      setActionModal(null);
    } catch (currentError) {
      setError(getFriendlyRequestErrorMessage(currentError, 'Não foi possível atualizar o DDA no controle local.'));
    } finally {
      setIsUpdatingDda(false);
    }
  }, [actionModal, runtimeContext, selectedBankId]);

  useEffect(() => { if (typeof window !== 'undefined') window.parent?.postMessage({ type: 'MSINFOR_SCREEN_CONTEXT', screenId: SCREEN_ID }, '*'); }, []);
  useEffect(() => { if (typeof window === 'undefined') return; const sync = () => { const bankId = readBankIdFromUrl(); setSelectedBankId(bankId); setLockedBankId(bankId); setReturnQueryString(buildReturnQueryStringFromUrl()); }; sync(); window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync); return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); }; }, []);
  useEffect(() => { void loadPageData(); }, [loadPageData]);
  useEffect(() => { void loadOpenDdas(); }, [loadOpenDdas]);
  useEffect(() => { setHiddenColumns(readHiddenColumns(runtimeContext.sourceTenantId)); }, [runtimeContext.sourceTenantId]);
  useEffect(() => { if (typeof window !== 'undefined') window.localStorage.setItem(getColumnStorageKey(runtimeContext.sourceTenantId), JSON.stringify(hiddenColumns)); }, [hiddenColumns, runtimeContext.sourceTenantId]);
  useEffect(() => { setCurrentPage(1); }, [appliedFilters, generalSearch, pageSize, statusFilter]);

  const getColumnValue = useCallback((item: OpenDdaItem, key: DdaColumnKey) => DDA_COLUMNS.find((column) => column.key === key)?.getValue(item) || '', []);
  const filteredItems = useMemo(() => ddaItems.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    const generalText = DDA_COLUMNS.map((column) => column.getValue(item)).join(' ');
    if (generalSearch.trim() && !normalizeGridText(generalText).includes(normalizeGridText(generalSearch))) return false;
    return (Object.keys(appliedFilters) as DdaColumnKey[]).every((key) => !appliedFilters[key] || normalizeGridText(getColumnValue(item, key)).includes(normalizeGridText(appliedFilters[key])));
  }), [appliedFilters, ddaItems, generalSearch, getColumnValue, statusFilter]);
  const sortedItems = useMemo(() => [...filteredItems].sort((left, right) => {
    let leftValue: string | number = getColumnValue(left, gridSort.key); let rightValue: string | number = getColumnValue(right, gridSort.key);
    if (gridSort.key === 'dueDate') { leftValue = Date.parse(left.dueDate || '') || 0; rightValue = Date.parse(right.dueDate || '') || 0; }
    if (gridSort.key === 'paidAt') { leftValue = Date.parse(left.paidAt || '') || 0; rightValue = Date.parse(right.paidAt || '') || 0; }
    if (gridSort.key === 'amount') { leftValue = Number(left.amount || 0); rightValue = Number(right.amount || 0); }
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return gridSort.direction === 'ASC' ? comparison : -comparison;
  }), [filteredItems, getColumnValue, gridSort]);
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const normalizedCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedItems = useMemo(() => sortedItems.slice((normalizedCurrentPage - 1) * pageSize, normalizedCurrentPage * pageSize), [normalizedCurrentPage, pageSize, sortedItems]);
  const totals = useMemo(() => ({ openAmount: sortedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0), overdueCount: sortedItems.filter(isDdaOverdue).length }), [sortedItems]);
  const statusCounts = useMemo(() => ({
    OPEN: ddaItems.filter((item) => item.status === 'OPEN').length,
    CLOSED: ddaItems.filter((item) => item.status === 'CLOSED').length,
    CANCELED: ddaItems.filter((item) => item.status === 'CANCELED').length,
    ALL: ddaItems.length,
  }), [ddaItems]);
  const hasActiveGridFilters = Boolean(generalSearch.trim()) || Object.values(appliedFilters).some(Boolean) || gridSort.key !== 'dueDate' || gridSort.direction !== 'ASC';

  function clearAllGridFilters() { setGeneralSearch(''); setFilterDrafts(DEFAULT_FILTERS); setAppliedFilters(DEFAULT_FILTERS); setGridSort({ key: 'dueDate', direction: 'ASC' }); setActiveFilterColumn(null); setCurrentPage(1); }
  function renderColumnHeader(column: GridColumnDefinition<OpenDdaItem, DdaColumnKey>, index: number) {
    const isActive = Boolean(appliedFilters[column.key]) || gridSort.key === column.key;
    return <div className="flex items-center gap-1.5">{index === 0 ? <button type="button" onClick={clearAllGridFilters} title="Limpar todos os filtros" aria-label="Limpar todos os filtros" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${hasActiveGridFilters ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-400'}`}><ClearFiltersIcon /></button> : null}<GridColumnFilterHeader label={column.label} isOpen={activeFilterColumn === column.key} isActive={isActive} filterValue={filterDrafts[column.key]} placeholder={`FILTRAR ${column.label.toUpperCase()}`} align={column.align === 'right' ? 'right' : 'left'} sortDirection={gridSort.key === column.key ? gridSort.direction : null} onToggle={() => { setFilterDrafts((current) => ({ ...current, [column.key]: appliedFilters[column.key] })); setActiveFilterColumn((current) => current === column.key ? null : column.key); }} onSort={(direction) => { setGridSort({ key: column.key, direction }); setActiveFilterColumn(null); setCurrentPage(1); }} onFilterValueChange={(value) => setFilterDrafts((current) => ({ ...current, [column.key]: value.toUpperCase() }))} onApply={() => { setAppliedFilters((current) => ({ ...current, [column.key]: filterDrafts[column.key] })); setActiveFilterColumn(null); setCurrentPage(1); }} onClear={() => { setFilterDrafts((current) => ({ ...current, [column.key]: '' })); setAppliedFilters((current) => ({ ...current, [column.key]: '' })); setActiveFilterColumn(null); setCurrentPage(1); }} /></div>;
  }

  return (
    <div className={runtimeContext.embedded ? 'flex h-screen min-h-0 flex-col overflow-hidden' : FINANCE_GRID_PAGE_LAYOUT.shell}>
      {!runtimeContext.embedded ? <section className={`${cardClass} shrink-0 overflow-hidden`}><div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Bancos</div><h1 className="mt-1 text-2xl font-black tracking-tight">DDAs em aberto</h1></div><Link href={`/bancos${banksReturnQueryString}`} onClick={handleReturnToBanks} className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white">Voltar aos bancos</Link></div></div></section> : null}
      {error ? <section className={`${cardClass} shrink-0 border-rose-200 bg-rose-50 px-6 py-4 text-sm font-semibold text-rose-700`}>{error}</section> : null}
      {statusMessage ? <section className={`${cardClass} shrink-0 border-emerald-200 bg-emerald-50 px-6 py-4 text-sm font-semibold text-emerald-700`}>{statusMessage}</section> : null}
      <section className={`${cardClass} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(15rem,1fr)_minmax(28rem,2fr)_auto] xl:items-end"><label className="flex flex-col gap-1"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Banco</span>{lockedBankId ? <div className="flex h-[46px] items-center rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm font-black uppercase text-slate-700">{selectedBank ? buildBankLabel(selectedBank) : 'BANCO SELECIONADO'}</div> : <select value={selectedBankId} onChange={(event) => setSelectedBankId(event.target.value)} className={`${FINANCE_GRID_PAGE_LAYOUT.input} h-[46px] w-full`}><option value="">SELECIONE</option>{banks.map((item) => <option key={item.id} value={item.id}>{buildBankLabel(item)}</option>)}</select>}</label><label className="block"><span className="sr-only">Pesquisar no grid</span><input value={generalSearch} onChange={(event) => setGeneralSearch(event.target.value.toUpperCase())} className={`${FINANCE_GRID_PAGE_LAYOUT.input} h-[46px] w-full`} placeholder="BENEFICIÁRIO, DOCUMENTO, PAGADOR..." /></label><button type="button" onClick={() => void loadOpenDdas()} disabled={isConsulting || !selectedBankId} className="h-[46px] rounded-xl border border-emerald-700 bg-emerald-600 px-4 text-xs font-black uppercase tracking-[0.18em] text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">{isConsulting ? 'Buscando novos DDAs...' : 'Buscar novos DDAs no banco'}</button></div>
          <div className="mt-3 flex flex-wrap items-center gap-2">{([{ value: 'OPEN', label: 'Abertos', tone: 'border-emerald-300 bg-emerald-100 text-emerald-800' }, { value: 'CLOSED', label: 'Fechados', tone: 'border-amber-300 bg-amber-100 text-amber-800' }, { value: 'CANCELED', label: 'Cancelados', tone: 'border-rose-300 bg-rose-100 text-rose-800' }, { value: 'ALL', label: 'Todos', tone: 'border-blue-300 bg-blue-50 text-blue-700' }] as const).map((option) => <button key={option.value} type="button" onClick={() => setStatusFilter(option.value)} aria-pressed={statusFilter === option.value} className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${option.tone} ${statusFilter === option.value ? 'ring-2 ring-slate-400 ring-offset-1' : 'opacity-65 hover:opacity-100'}`}>{option.label} ({statusCounts[option.value]})</button>)}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>{visibleColumns.map((column, index) => <th key={column.key} className={`px-4 py-3 ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}>{renderColumnHeader(column, index)}</th>)}<th className="px-4 py-3 text-center">Ações</th></tr>
              {activeFilterColumn ? <tr aria-hidden="true"><th colSpan={Math.max(visibleColumns.length + 1, 1)} className="h-44 bg-white p-0" /></tr> : null}
            </thead>
            <tbody>
              {paginatedItems.map((item, index) => <tr key={item.id} aria-selected={selectedRowId === item.id} onClick={() => setSelectedRowId(item.id)} className={`cursor-pointer border-t border-slate-100 transition ${selectedRowId === item.id ? 'bg-blue-100 outline outline-1 outline-blue-400' : index % 2 === 0 ? 'bg-white hover:bg-slate-100' : 'bg-slate-200/70 hover:bg-slate-300/70'}`}>{visibleColumns.map((column) => <td key={column.key} className={`px-4 py-4 align-top ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}>{column.key === 'beneficiaryName' ? <><div className="font-black text-slate-900">{item.beneficiaryName || '---'}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{item.beneficiaryDocument || '---'}</div></> : column.key === 'payerName' ? <><div className="font-semibold text-slate-700">{item.payerName || '---'}</div><div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{item.payerDocument || '---'}</div></> : column.key === 'amount' ? <span className="font-black text-slate-900">{formatCurrency(item.amount)}</span> : column.key === 'status' ? <span className={`inline-flex h-[34px] items-center rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.14em] ${getDdaStatusTone(item.status)}`}>{getDdaStatusLabel(item.status)}</span> : column.key === 'dueDate' ? <span className="font-semibold text-slate-700">{formatDateOnlyLabel(item.dueDate)}</span> : column.key === 'paidAt' ? <span className="font-semibold text-slate-700">{item.paidAt ? formatDateOnlyLabel(item.paidAt) : '---'}</span> : <span className="font-semibold text-slate-700">{item.documentNumber || '---'}</span>}</td>)}<td className="px-4 py-4 align-top text-center">{item.status === 'OPEN' ? <div className="flex items-start justify-center gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); setActionModal({ action: 'CLOSE', item }); }} className="h-[34px] rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Baixar</button><button type="button" onClick={(event) => { event.stopPropagation(); setActionModal({ action: 'CANCEL', item }); }} className="h-[34px] rounded-lg border border-rose-300 bg-rose-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700">Cancelar</button></div> : <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Concluído</span>}</td></tr>)}
              {!isLoading && !isConsulting && !paginatedItems.length ? <tr><td colSpan={Math.max(visibleColumns.length + 1, 1)} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">Nenhum DDA foi localizado para a situação e os filtros atuais.</td></tr> : null}
              {(isLoading || isConsulting) && !paginatedItems.length ? <tr><td colSpan={Math.max(visibleColumns.length + 1, 1)} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">Consultando e sincronizando DDAs...</td></tr> : null}
            </tbody>
          </table>
        </div>
        <table className="min-w-full text-left text-sm text-slate-600"><tfoot className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsRow}><tr>{visibleColumns.map((column, index) => <td key={column.key} className={`${FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}>{index === 0 ? <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalRecordsPill}>{sortedItems.length} registro(s)</span> : null}{column.key === 'amount' ? <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{formatCurrency(totals.openAmount)}</span> : null}{column.key === 'status' ? <span className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsValue}>{totals.overdueCount} vencido(s)</span> : null}</td>)}<td className={FINANCE_GRID_PAGE_LAYOUT.gridTotalsCell} /></tr></tfoot></table>
        <GridStandardFooter statusFilter="ALL" totalRecords={sortedItems.length} pageSize={pageSize} currentPage={normalizedCurrentPage} totalPages={totalPages} pageSizeOptions={PAGE_SIZE_OPTIONS} showStatusFilter={false} showRecordSummary={false} onColumnSettings={() => setIsColumnConfigOpen(true)} onExport={() => setIsExportModalOpen(true)} onStatusFilterChange={() => undefined} onPageSizeChange={(value) => { setPageSize(value); setCurrentPage(1); }} onPageChange={setCurrentPage}>{pulledAt ? <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Última consulta: {formatDateLabel(pulledAt)}</span> : null}{!runtimeContext.embedded ? <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" /> : null}</GridStandardFooter>
      </section>
      <DdaColumnConfigModal isOpen={isColumnConfigOpen} hiddenColumns={hiddenColumns} companyName={runtimeContext.companyName} logoUrl={runtimeContext.logoUrl} onClose={() => setIsColumnConfigOpen(false)} onSave={setHiddenColumns} />
      <DdaLocalActionModal state={actionModal} companyName={runtimeContext.companyName} logoUrl={runtimeContext.logoUrl} isSaving={isUpdatingDda} onClose={() => setActionModal(null)} onConfirm={(notes, paymentDate) => void handleDdaLocalAction(notes, paymentDate)} />
      <GridExportModal isOpen={isExportModalOpen} title="Exportar DDAs em aberto" description={`A exportação considera ${sortedItems.length} DDA(s) do filtro atual.`} format={exportFormat} onFormatChange={setExportFormat} columns={DDA_COLUMNS.map((column) => ({ key: column.key, label: column.label }))} selectedColumns={exportColumns} storageKey={getExportStorageKey(runtimeContext.sourceTenantId)} brandingName={runtimeContext.companyName || 'FINANCEIRO'} brandingLogoUrl={runtimeContext.logoUrl} onClose={() => setIsExportModalOpen(false)} onExport={async (config) => { await exportGridRows({ rows: sortedItems, columns: DDA_COLUMNS, selectedColumns: config.selectedColumns, format: exportFormat, fileBaseName: 'ddas-em-aberto', branding: { title: 'DDAs em aberto', subtitle: `Consulta em ${pulledAt ? formatDateLabel(pulledAt) : 'andamento'}.`, schoolName: runtimeContext.companyName || 'FINANCEIRO', logoUrl: runtimeContext.logoUrl }, pdfOptions: config.pdfOptions }); setExportColumns(config.selectedColumns); setIsExportModalOpen(false); }} />
    </div>
  );
}
