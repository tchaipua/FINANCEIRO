'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import { formatCurrency, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type SaleItem = {
  id: string;
  productId: string;
  productName: string;
  productCode?: string | null;
  unitCode: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  tracksInventory: boolean;
  allowFraction?: boolean;
  returnedQuantity?: number;
  availableReturnQuantity?: number;
};

type SaleItemForReturn = {
  id: string;
  companyName?: string | null;
  branchCode: number;
  saleNumber: string;
  status: string;
  customerName: string;
  customerDocument?: string | null;
  totalAmount: number;
  paidAmount: number;
  receivableAmount: number;
  paymentSummary?: string | null;
  confirmedAt?: string | null;
  items?: SaleItem[];
};

type SaleReturnResult = {
  id: string;
  returnNumber: string;
  totalAmount: number;
  credit?: {
    id: string;
    originalAmount: number;
    availableAmount: number;
  } | null;
  message?: string;
};

type ReturnFilters = {
  dateFrom: string;
  dateTo: string;
  search: string;
};

type ReturnTabKey = 'sale' | 'products' | 'summary';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_DEVOLUCAO_MERCADORIAS';
const RETURN_TABS: Array<{ key: ReturnTabKey; label: string }> = [
  { key: 'sale', label: 'Venda' },
  { key: 'products', label: 'Produtos' },
  { key: 'summary', label: 'Resumo' },
];

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultFilters(): ReturnFilters {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    dateFrom: toDateInputValue(firstDay),
    dateTo: toDateInputValue(today),
    search: '',
  };
}

function normalizeUpperInput(value: string) {
  return String(value || '').toUpperCase();
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getFriendlyPasswordMessage(message?: string | null) {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage || normalizedMessage.includes('confirm-cash-cancellation-password')) {
    return 'Confira a senha do operador ou supervisor.';
  }
  return normalizedMessage;
}

function confirmReturnPassword(password: string) {
  return new Promise<{
    authorizedBy?: string;
    authorizedUserId?: string | null;
    authorizedUserName?: string | null;
    supervisorName?: string | null;
  }>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.parent) {
      reject(new Error('Abra esta tela pelo sistema da Escola para validar a senha.'));
      return;
    }

    const requestId = `sale-return-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Tempo esgotado para validação da senha.'));
    }, 20000);

    function handleMessage(event: MessageEvent) {
      const payload = event.data as {
        type?: string;
        requestId?: string;
        ok?: boolean;
        message?: string;
        authorizedBy?: string;
        authorizedUserId?: string | null;
        authorizedUserName?: string | null;
        supervisorName?: string | null;
      } | null;

      if (
        payload?.type !== 'MSINFOR_CONFIRM_CASH_CANCELLATION_PASSWORD_RESULT' ||
        payload.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);

      if (!payload.ok) {
        reject(new Error(getFriendlyPasswordMessage(payload.message)));
        return;
      }

      resolve({
        authorizedBy: payload.authorizedBy,
        authorizedUserId: payload.authorizedUserId || null,
        authorizedUserName: payload.authorizedUserName || null,
        supervisorName: payload.supervisorName || null,
      });
    }

    window.addEventListener('message', handleMessage);
    window.parent.postMessage(
      {
        type: 'MSINFOR_CONFIRM_CASH_CANCELLATION_PASSWORD',
        requestId,
        password,
      },
      '*',
    );
  });
}

export default function SaleReturnPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [filters, setFilters] = useState<ReturnFilters>(getDefaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<ReturnFilters>(getDefaultFilters);
  const [sales, setSales] = useState<SaleItemForReturn[]>([]);
  const [selectedSale, setSelectedSale] = useState<SaleItemForReturn | null>(null);
  const [activeTab, setActiveTab] = useState<ReturnTabKey>('sale');
  const [quantityByItemId, setQuantityByItemId] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [isLoadingSale, setIsLoadingSale] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [lastReturn, setLastReturn] = useState<SaleReturnResult | null>(null);

  const loadSales = useCallback(async () => {
    if (!runtimeContext.sourceTenantId) {
      setSales([]);
      return;
    }

    try {
      setIsLoadingSales(true);
      setAlert(null);
      const data = await getJson<SaleItemForReturn[]>(
        `/sales${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
          dateFrom: appliedFilters.dateFrom,
          dateTo: appliedFilters.dateTo,
          status: 'CONFIRMED',
          search: appliedFilters.search,
        })}`,
      );
      setSales(Array.isArray(data) ? data : []);
    } catch (error) {
      setSales([]);
      setAlert({
        type: 'error',
        message: getFriendlyRequestErrorMessage(error, 'Não foi possível carregar as vendas.'),
      });
    } finally {
      setIsLoadingSales(false);
    }
  }, [appliedFilters, runtimeContext]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') return;
    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  const selectedReturnLines = useMemo(() => {
    return (selectedSale?.items || [])
      .map((item) => {
        const quantity = Number(String(quantityByItemId[item.id] || '').replace(',', '.'));
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        const availableQuantity = Number(item.availableReturnQuantity ?? item.quantity ?? 0);
        const safeQuantity = Math.min(quantity, availableQuantity);
        const unitReturnPrice = Number(item.totalAmount || 0) / Number(item.quantity || 1);
        return {
          item,
          quantity: safeQuantity,
          totalAmount: roundMoney(unitReturnPrice * safeQuantity),
        };
      })
      .filter((line): line is { item: SaleItem; quantity: number; totalAmount: number } => Boolean(line));
  }, [quantityByItemId, selectedSale]);

  const returnTotal = useMemo(
    () => roundMoney(selectedReturnLines.reduce((total, line) => total + line.totalAmount, 0)),
    [selectedReturnLines],
  );

  const auditText = useMemo(
    () => `--- LOGICA DA TELA ---
Tela de devolução de mercadorias por venda.

TABELAS PRINCIPAIS:
- sales (S) - venda original confirmada.
- sale_items (SI) - itens vendidos e disponíveis para devolução.
- sale_returns (SR) - documento de devolução.
- sale_return_items (SRI) - produtos devolvidos.
- customer_credits (CC) - crédito gerado para uso em baixa de parcelas.
- stock_movements (SM) - entrada de estoque pela devolução.

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(runtimeContext.sourceTenantId, selectedSale?.companyName)}
- sistema origem (:sourceSystem): ${formatAuditValue(runtimeContext.sourceSystem)}
- período inicial (:dateFrom): ${formatAuditValue(appliedFilters.dateFrom)}
- período final (:dateTo): ${formatAuditValue(appliedFilters.dateTo)}
- busca (:search): ${formatAuditValue(appliedFilters.search)}
- venda selecionada: ${selectedSale?.saleNumber || '---'}
- total selecionado para devolução: ${formatCurrency(returnTotal)}`,
    [appliedFilters, returnTotal, runtimeContext.sourceSystem, runtimeContext.sourceTenantId, selectedSale],
  );

  const sqlText = useMemo(
    () => `SELECT
  S.id,
  S.saleNumber,
  S.customerNameSnapshot,
  SI.id AS saleItemId,
  SI.productNameSnapshot,
  SI.quantity,
  SI.totalAmount
FROM sales S
INNER JOIN sale_items SI
  ON SI.saleId = S.id
  AND SI.canceledAt IS NULL
WHERE S.canceledAt IS NULL
  AND S.status = ${toSqlLiteral('CONFIRMED')}
  AND S.sourceSystem = ${toSqlLiteral(runtimeContext.sourceSystem || '')}
  AND S.sourceTenantId = ${toSqlLiteral(runtimeContext.sourceTenantId || '')}
  AND DATE(S.confirmedAt) >= DATE(${toSqlLiteral(appliedFilters.dateFrom)})
  AND DATE(S.confirmedAt) <= DATE(${toSqlLiteral(appliedFilters.dateTo)})
ORDER BY S.confirmedAt DESC, SI.lineNumber ASC;`,
    [appliedFilters, runtimeContext.sourceSystem, runtimeContext.sourceTenantId],
  );

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters({ ...filters, search: filters.search.trim() });
    setSelectedSale(null);
    setQuantityByItemId({});
    setLastReturn(null);
  }

  async function handleSelectSale(sale: SaleItemForReturn) {
    try {
      setIsLoadingSale(true);
      setAlert(null);
      setLastReturn(null);
      const loadedSale = await getJson<SaleItemForReturn>(
        `/sales/${sale.id}/return-context${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
        })}`,
      );
      setSelectedSale(loadedSale);
      setQuantityByItemId({});
      setReason('');
      setPassword('');
      setActiveTab('products');
    } catch (error) {
      setAlert({
        type: 'error',
        message: getFriendlyRequestErrorMessage(error, 'Não foi possível carregar a venda para devolução.'),
      });
    } finally {
      setIsLoadingSale(false);
    }
  }

  async function handleConfirmReturn() {
    if (!selectedSale) return;
    if (!selectedReturnLines.length || returnTotal <= 0) {
      setAlert({ type: 'warning', message: 'Informe ao menos um produto para devolução.' });
      setActiveTab('products');
      return;
    }
    if (!reason.trim()) {
      setAlert({ type: 'warning', message: 'Informe o motivo da devolução.' });
      setActiveTab('summary');
      return;
    }
    if (!password.trim()) {
      setAlert({ type: 'warning', message: 'Informe a senha para autorizar a devolução.' });
      setActiveTab('summary');
      return;
    }

    try {
      setIsSubmitting(true);
      setAlert(null);
      const authorization = await confirmReturnPassword(password.trim());
      const requestedBy =
        authorization.authorizedUserName ||
        authorization.supervisorName ||
        authorization.authorizedUserId ||
        runtimeContext.cashierDisplayName ||
        runtimeContext.cashierUserId ||
        'OPERADOR';

      const createdReturn = await requestJson<SaleReturnResult>(
        `/sales/${selectedSale.id}/returns`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            sourceBranchCode: runtimeContext.sourceBranchCode,
            requestedBy,
            reason: reason.trim(),
            items: selectedReturnLines.map((line) => ({
              saleItemId: line.item.id,
              quantity: line.quantity,
            })),
          }),
          fallbackMessage: 'Não foi possível registrar a devolução.',
        },
      );

      setLastReturn(createdReturn);
      setAlert({
        type: 'success',
        message: createdReturn.message || 'Devolução registrada e crédito gerado para o cliente.',
      });
      setPassword('');
      setReason('');
      setQuantityByItemId({});
      await loadSales();
      const refreshedSale = await getJson<SaleItemForReturn>(
        `/sales/${selectedSale.id}/return-context${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
        })}`,
      );
      setSelectedSale(refreshedSale);
      setActiveTab('summary');
    } catch (error) {
      setAlert({
        type: 'error',
        message: getFriendlyRequestErrorMessage(error, 'Não foi possível registrar a devolução.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} overflow-hidden`}>
        <form onSubmit={handleSearchSubmit} className="grid gap-4 border-b border-slate-100 p-6 lg:grid-cols-[auto_auto_1fr_auto]">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
          />
          <input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: normalizeUpperInput(event.target.value) }))}
            className={FINANCE_GRID_PAGE_LAYOUT.input}
            placeholder="BUSCAR VENDA, CLIENTE OU DOCUMENTO"
          />
          <button type="submit" className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>
            Pesquisar
          </button>
        </form>

        {alert ? (
          <div
            className={`border-b px-6 py-4 text-sm font-semibold ${
              alert.type === 'success'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : alert.type === 'warning'
                  ? 'border-amber-100 bg-amber-50 text-amber-700'
                  : 'border-rose-100 bg-rose-50 text-rose-700'
            }`}
          >
            {alert.message}
          </div>
        ) : null}

        <div className="grid min-h-[520px] gap-0 lg:grid-cols-[360px_1fr]">
          <aside className="border-r border-slate-100 bg-slate-50">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Vendas localizadas</div>
              <div className="mt-1 text-sm font-semibold text-slate-600">
                {isLoadingSales ? 'Carregando...' : `${sales.length} venda(s)`}
              </div>
            </div>
            <div className="max-h-[472px] overflow-y-auto p-3">
              {sales.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => void handleSelectSale(sale)}
                  className={`mb-2 w-full rounded-xl border p-3 text-left transition ${
                    selectedSale?.id === sale.id
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">{sale.saleNumber}</div>
                  <div className="mt-1 truncate text-sm font-black text-slate-900">{sale.customerName || '---'}</div>
                  <div className="mt-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>{formatDateTimeLabel(sale.confirmedAt)}</span>
                    <span>{formatCurrency(sale.totalAmount)}</span>
                  </div>
                </button>
              ))}
              {!isLoadingSales && !sales.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
                  Nenhuma venda encontrada.
                </div>
              ) : null}
            </div>
          </aside>

          <main className="min-w-0 bg-white">
            {!selectedSale ? (
              <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Devolução</div>
                  <div className="mt-2 text-xl font-black text-slate-900">
                    Selecione uma venda para iniciar.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-slate-100 px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                        {selectedSale.saleNumber}
                      </div>
                      <div className="mt-1 text-lg font-black text-slate-900">{selectedSale.customerName}</div>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-black text-blue-800">
                      Crédito: {formatCurrency(returnTotal)}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {RETURN_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition ${
                          activeTab === tab.key
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  {isLoadingSale ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                      Carregando venda...
                    </div>
                  ) : null}

                  {activeTab === 'sale' ? (
                    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 md:grid-cols-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Cliente</div>
                        <div className="mt-1 text-slate-900">{selectedSale.customerName || '---'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Documento</div>
                        <div className="mt-1 text-slate-900">{selectedSale.customerDocument || '---'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Data</div>
                        <div className="mt-1 text-slate-900">{formatDateTimeLabel(selectedSale.confirmedAt)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Total da venda</div>
                        <div className="mt-1 text-slate-900">{formatCurrency(selectedSale.totalAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Recebido</div>
                        <div className="mt-1 text-slate-900">{formatCurrency(selectedSale.paidAmount)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Pagamento</div>
                        <div className="mt-1 text-slate-900">{selectedSale.paymentSummary || '---'}</div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'products' ? (
                    <div className="overflow-auto rounded-2xl border border-slate-200">
                      <table className="min-w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Produto</th>
                            <th className="px-4 py-3 text-right">Vendida</th>
                            <th className="px-4 py-3 text-right">Devolvida</th>
                            <th className="px-4 py-3 text-right">Disponível</th>
                            <th className="px-4 py-3 text-right">Qtd devolver</th>
                            <th className="px-4 py-3 text-right">Crédito</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedSale.items || []).map((item) => {
                            const availableQuantity = Number(item.availableReturnQuantity ?? item.quantity ?? 0);
                            const inputValue = quantityByItemId[item.id] || '';
                            const currentQuantity = Number(String(inputValue).replace(',', '.')) || 0;
                            const unitReturnPrice = Number(item.totalAmount || 0) / Number(item.quantity || 1);
                            const lineTotal = roundMoney(Math.min(currentQuantity, availableQuantity) * unitReturnPrice);

                            return (
                              <tr key={item.id} className="border-t border-slate-100">
                                <td className="px-4 py-3 font-semibold text-slate-900">
                                  {item.productName || '---'}
                                  {item.productCode ? (
                                    <span className="ml-2 text-xs font-bold text-slate-500">{item.productCode}</span>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3 text-right">{item.quantity}</td>
                                <td className="px-4 py-3 text-right">{item.returnedQuantity || 0}</td>
                                <td className="px-4 py-3 text-right font-black text-slate-900">{availableQuantity}</td>
                                <td className="px-4 py-3 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    max={availableQuantity}
                                    step={item.allowFraction ? '0.01' : '1'}
                                    value={inputValue}
                                    disabled={availableQuantity <= 0}
                                    onChange={(event) =>
                                      setQuantityByItemId((current) => ({
                                        ...current,
                                        [item.id]: event.target.value,
                                      }))
                                    }
                                    className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-right text-sm font-bold text-slate-900 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                                  />
                                </td>
                                <td className="px-4 py-3 text-right font-black text-blue-700">{formatCurrency(lineTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {activeTab === 'summary' ? (
                    <div className="grid gap-5">
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-700">Crédito a gerar</div>
                        <div className="mt-2 text-3xl font-black text-blue-900">{formatCurrency(returnTotal)}</div>
                        <div className="mt-2 text-sm font-semibold text-blue-800">
                          O valor ficará disponível no controle de créditos do cliente para baixa futura de parcelas.
                        </div>
                      </div>

                      <div className="overflow-auto rounded-2xl border border-slate-200">
                        <table className="min-w-full text-left text-sm text-slate-600">
                          <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Produto</th>
                              <th className="px-4 py-3 text-right">Qtd</th>
                              <th className="px-4 py-3 text-right">Crédito</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedReturnLines.map((line) => (
                              <tr key={line.item.id} className="border-t border-slate-100">
                                <td className="px-4 py-3 font-semibold text-slate-900">{line.item.productName}</td>
                                <td className="px-4 py-3 text-right">{line.quantity}</td>
                                <td className="px-4 py-3 text-right font-black text-blue-700">{formatCurrency(line.totalAmount)}</td>
                              </tr>
                            ))}
                            {!selectedReturnLines.length ? (
                              <tr>
                                <td colSpan={3} className="px-4 py-6 text-center font-semibold text-slate-500">
                                  Nenhum produto selecionado para devolução.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>

                      <textarea
                        value={reason}
                        onChange={(event) => setReason(normalizeUpperInput(event.target.value))}
                        className={`${FINANCE_GRID_PAGE_LAYOUT.input} min-h-24`}
                        placeholder="MOTIVO DA DEVOLUÇÃO"
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                        placeholder="SENHA PARA AUTORIZAR"
                      />

                      {lastReturn ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                          {lastReturn.returnNumber} gerada com crédito de {formatCurrency(lastReturn.credit?.availableAmount || lastReturn.totalAmount)}.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-6 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm font-black text-slate-700">
                    Total selecionado: <span className="text-blue-700">{formatCurrency(returnTotal)}</span>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab('summary')}
                      className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100"
                    >
                      Resumo
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmReturn()}
                      disabled={isSubmitting || returnTotal <= 0}
                      className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? 'Confirmando...' : 'Confirmar devolução'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        <div className="border-t border-slate-100 bg-white px-6 py-4">
          <ScreenNameCopy
            screenId={SCREEN_ID}
            label="Copiar tela"
            auditText={auditText}
            sqlText={sqlText}
            originText="Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/vendas/devolucao-mercadorias/page.tsx"
          />
        </div>
      </section>
    </div>
  );
}
