'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getJson, requestJson } from '@/app/lib/api';
import { formatCurrency, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type CashSessionDetail = {
  id: string;
  cashierUserId: string;
  cashierDisplayName: string;
  status: string;
  openingAmount: number;
  totalReceivedAmount: number;
  expectedClosingAmount: number;
  declaredClosingAmount?: number | null;
  openedAt: string;
  closedAt?: string | null;
  receivedByPaymentMethod: {
    cash: number;
    pix: number;
    creditCard: number;
    debitCard: number;
    check: number;
  };
  movementCount: number;
  settlementCount: number;
  movements: Array<{
    id: string;
    movementType: string;
    direction: string;
    paymentMethod?: string | null;
    amount: number;
    description: string;
    occurredAt: string;
    referenceType?: string | null;
    referenceId?: string | null;
  }>;
};

type CashMovementModalState = {
  movementType: 'ENTRY' | 'EXIT' | 'ADJUSTMENT';
  direction: 'IN' | 'OUT';
  title: string;
  amountInput: string;
  notes: string;
};

type MovementFilter = {
  label: string;
  predicate: (movement: CashSessionDetail['movements'][number]) => boolean;
};

const SCREEN_ID = 'FINANCEIRO_CAIXA_DETALHE';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CAIXA_DETALHE';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const SCREEN_ORIGIN_TEXT =
  'Origem: Sistema Financeiro - C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\caixa\\[sessionId]\\page.tsx';
function buildAuditSqlText({
  sessionId,
  sourceTenantId,
  sourceSystem,
  movementFilterLabel,
}: {
  sessionId?: string | null;
  sourceTenantId?: string | null;
  sourceSystem?: string | null;
  movementFilterLabel?: string | null;
}) {
  const sessionFilterText = sessionId
    ? `- Caixa atual por :sessionId (${sessionId})`
    : '- Caixa atual por :sessionId';
  const originContext = [sourceSystem, sourceTenantId].filter(Boolean).join(' / ');
  const originFilterText = originContext
    ? `- Empresa/escola por contexto de origem (${originContext})`
    : '- Empresa/escola por contexto de origem';
  const visualFilterText = movementFilterLabel
    ? `- Filtros visuais por grupo, forma de pagamento ou descrição (${movementFilterLabel})`
    : '- Filtros visuais por grupo, forma de pagamento ou descrição';

  return `--- ESTRUTURA SQL: PRINCIPAL_FINANCEIRO_CAIXA_DETALHE ---
TABELAS PRINCIPAIS:
- cash_sessions (CS) - sessões de caixa abertas/fechadas por operador.
- cash_movements (CM) - movimentos registrados no caixa, como recebimentos, entradas, saídas e ajustes.
- installment_settlements (ISS) - baixas/recebimentos realizados sobre parcelas.
- receivable_installments (RI) - parcelas/títulos a receber vinculados aos recebimentos.

RELACIONAMENTOS:
- cash_movements.cash_session_id = cash_sessions.id
- installment_settlements.cash_session_id = cash_sessions.id
- installment_settlements.installment_id = receivable_installments.id

MÉTRICAS / CAMPOS EXIBIDOS:
- Troco inicial: cash_sessions.opening_amount
- Valor movimentado:
  opening_amount
  + recebimento dinheiro
  + recebimento cheque
  + venda dinheiro
  + venda cheque
  + entrada dinheiro
  - saída dinheiro
  +/- ajustes caixa
- Troco final: cálculo local de fechamento previsto
- Recebimentos por forma: cash_movements.payment_method
- Movimentos: cash_movements.description, direction, amount, occurred_at

FILTROS APLICADOS:
${sessionFilterText}
${originFilterText}
${visualFilterText}

ORDENAÇÃO:
- Movimentos exibidos conforme retorno da API do detalhe do caixa

--------------------------------------------------------

SELECT
  cs.id AS cash_session_id,
  cs.cashier_display_name,
  cs.status,
  cs.opening_amount,
  cs.expected_closing_amount,
  cm.occurred_at,
  cm.description,
  cm.movement_type,
  cm.direction,
  cm.payment_method,
  cm.amount,
  cm.reference_type,
  cm.reference_id
FROM cash_sessions cs
LEFT JOIN cash_movements cm
  ON cm.cash_session_id = cs.id
WHERE cs.id = :sessionId
ORDER BY cm.occurred_at DESC;`;
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function getStatusLabel(status?: string | null) {
  return status === 'OPEN' ? 'ABERTO' : 'FECHADO';
}

function getStatusTone(status?: string | null) {
  return status === 'OPEN'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
}

function getPaymentMethodLabel(paymentMethod?: string | null) {
  if (paymentMethod === 'CASH') return 'DINHEIRO';
  if (paymentMethod === 'PIX') return 'PIX';
  if (paymentMethod === 'CREDIT_CARD') return 'CARTÃO CRÉDITO';
  if (paymentMethod === 'DEBIT_CARD') return 'CARTÃO DÉBITO';
  if (paymentMethod === 'CHECK') return 'CHEQUE';
  return paymentMethod || '---';
}

function getDirectionLabel(direction?: string | null) {
  if (direction === 'IN') return 'ENTRADA';
  if (direction === 'OUT') return 'SAÍDA';
  return 'INFORMATIVO';
}

function parseCurrencyInput(value: string) {
  const normalized = String(value || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined' || !document.body) return;

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function AuditSqlContent({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => {
        const tableMatch = line.match(/^(-\s)(cash_sessions|cash_movements|installment_settlements|receivable_installments)(\s\([A-Z]+\))(\s-\s.*)$/);
        if (tableMatch) {
          return (
            <div key={`${line}-${index}`} className="text-[13px] leading-5">
              {tableMatch[1]}
              <strong className="text-[15px] font-black text-slate-950">{tableMatch[2]}</strong>
              <strong className="font-black text-slate-950">{tableMatch[3]}</strong>
              {tableMatch[4]}
            </div>
          );
        }

        return (
          <div key={`${line}-${index}`} className="leading-4">
            {line || '\u00A0'}
          </div>
        );
      })}
    </>
  );
}

export default function FinanceiroCashDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const sessionId = String(params?.sessionId || '').trim();
  const [session, setSession] = useState<CashSessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCashMovement, setIsSavingCashMovement] = useState(false);
  const [cashMovementModal, setCashMovementModal] = useState<CashMovementModalState | null>(null);
  const [movementFilter, setMovementFilter] = useState<MovementFilter | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditCopyStatus, setAuditCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!sessionId || !runtimeContext.sourceTenantId) {
      setSession(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSession(
        await getJson<CashSessionDetail>(
          `/cash-sessions/${sessionId}${buildFinanceApiQueryString(runtimeContext)}`,
        ),
      );
    } catch (currentError) {
      setSession(null);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar o detalhe do caixa.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext, sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') {
      return;
    }

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: EMBEDDED_SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') {
      return;
    }

    const handleAuditRequest = (event: MessageEvent) => {
      const data = event.data as { type?: string; screenId?: string } | null;
      if (
        data?.type === 'MSINFOR_OPEN_SCREEN_AUDIT' &&
        data.screenId === EMBEDDED_SCREEN_ID
      ) {
        void handleOpenAuditModal();
      }
    };

    window.addEventListener('message', handleAuditRequest);
    return () => window.removeEventListener('message', handleAuditRequest);
  }, [runtimeContext.embedded]);

  const cashSummary = useMemo(() => {
    if (!session) {
      return {
        cashEntryAmount: 0,
        cashEntryCount: 0,
        cashExitAmount: 0,
        cashExitCount: 0,
        cashAdjustmentAmount: 0,
        cashAdjustmentCount: 0,
        cashReceivedAmount: 0,
        cashReceivedCount: 0,
        checkReceivedAmount: 0,
        checkReceivedCount: 0,
        finalChangeAmount: 0,
      };
    }
    const movements = session.movements || [];
    const cashEntries = movements.filter((item) => item.movementType === 'ENTRY' && item.direction === 'IN');
    const cashExits = movements.filter((item) => item.movementType === 'EXIT' && item.direction === 'OUT');
    const cashAdjustments = movements.filter((item) => item.movementType === 'ADJUSTMENT');
    const cashReceipts = movements.filter((item) => item.movementType === 'SETTLEMENT' && item.paymentMethod === 'CASH');
    const checkReceipts = movements.filter((item) => item.movementType === 'SETTLEMENT' && item.paymentMethod === 'CHECK');
    const cashEntryAmount = cashEntries.reduce((total, item) => total + Number(item.amount || 0), 0);
    const cashExitAmount = cashExits.reduce((total, item) => total + Number(item.amount || 0), 0);
    const cashAdjustmentAmount = cashAdjustments
      .reduce((total, item) => total + (item.direction === 'OUT' ? -Number(item.amount || 0) : Number(item.amount || 0)), 0);
    const cashReceivedAmount = session.receivedByPaymentMethod?.cash || 0;
    const checkReceivedAmount = session.receivedByPaymentMethod?.check || 0;
    const finalChangeAmount =
      Number(session.openingAmount || 0) +
      cashReceivedAmount +
      cashEntryAmount -
      cashExitAmount +
      checkReceivedAmount +
      cashAdjustmentAmount;

    return {
      cashEntryAmount,
      cashEntryCount: cashEntries.length,
      cashExitAmount,
      cashExitCount: cashExits.length,
      cashAdjustmentAmount,
      cashAdjustmentCount: cashAdjustments.length,
      cashReceivedAmount,
      cashReceivedCount: cashReceipts.length,
      checkReceivedAmount,
      checkReceivedCount: checkReceipts.length,
      finalChangeAmount,
    };
  }, [session]);

  const paymentCards = useMemo(() => {
    const totals = session?.receivedByPaymentMethod;
    const movements = session?.movements || [];
    return [
      { label: 'Dinheiro', value: totals?.cash || 0, paymentMethod: 'CASH' },
      { label: 'PIX', value: totals?.pix || 0, paymentMethod: 'PIX' },
      { label: 'Cartão Crédito', value: totals?.creditCard || 0, paymentMethod: 'CREDIT_CARD' },
      { label: 'Cartão Débito', value: totals?.debitCard || 0, paymentMethod: 'DEBIT_CARD' },
      { label: 'Cheque', value: totals?.check || 0, paymentMethod: 'CHECK' },
    ].map((item) => ({
      ...item,
      count: movements.filter((movement) => movement.paymentMethod === item.paymentMethod).length,
    }));
  }, [session]);

  const saleCards = useMemo(() => {
    return [
      { label: 'Dinheiro', value: 0, count: 0, paymentMethod: 'CASH' },
      { label: 'PIX', value: 0, count: 0, paymentMethod: 'PIX' },
      { label: 'Cartão Crédito', value: 0, count: 0, paymentMethod: 'CREDIT_CARD' },
      { label: 'Cartão Débito', value: 0, count: 0, paymentMethod: 'DEBIT_CARD' },
      { label: 'Cheque', value: 0, count: 0, paymentMethod: 'CHECK' },
    ];
  }, []);

  const totalSaleAmount = useMemo(() => {
    return saleCards.reduce((total, item) => total + Number(item.value || 0), 0);
  }, [saleCards]);

  const saleCashAmount = useMemo(() => {
    return saleCards.find((item) => item.paymentMethod === 'CASH')?.value || 0;
  }, [saleCards]);

  const saleCheckAmount = useMemo(() => {
    return saleCards.find((item) => item.paymentMethod === 'CHECK')?.value || 0;
  }, [saleCards]);

  const movedAmount = useMemo(() => {
    return (
      Number(session?.openingAmount || 0) +
      cashSummary.cashReceivedAmount +
      cashSummary.checkReceivedAmount +
      saleCashAmount +
      saleCheckAmount +
      cashSummary.cashEntryAmount -
      cashSummary.cashExitAmount +
      cashSummary.cashAdjustmentAmount
    );
  }, [
    cashSummary.cashAdjustmentAmount,
    cashSummary.cashEntryAmount,
    cashSummary.cashExitAmount,
    cashSummary.cashReceivedAmount,
    cashSummary.checkReceivedAmount,
    saleCashAmount,
    saleCheckAmount,
    session?.openingAmount,
  ]);

  const allMovementCount = useMemo(() => {
    return session?.movements?.length || 0;
  }, [session]);

  const otherCards = useMemo(() => {
    return [
      {
        label: 'Entrada dinheiro',
        value: cashSummary.cashEntryAmount,
        count: cashSummary.cashEntryCount,
        toneClass: 'text-emerald-700',
        filterLabel: 'Entrada dinheiro',
        predicate: (movement: CashSessionDetail['movements'][number]) =>
          movement.movementType === 'ENTRY' && movement.direction === 'IN',
      },
      {
        label: 'Saída dinheiro',
        value: cashSummary.cashExitAmount,
        count: cashSummary.cashExitCount,
        toneClass: 'text-rose-700',
        filterLabel: 'Saída dinheiro',
        predicate: (movement: CashSessionDetail['movements'][number]) =>
          movement.movementType === 'EXIT' && movement.direction === 'OUT',
      },
      {
        label: 'Ajustes caixa',
        value: cashSummary.cashAdjustmentAmount,
        count: cashSummary.cashAdjustmentCount,
        toneClass: 'text-slate-900',
        filterLabel: 'Ajustes caixa',
        predicate: (movement: CashSessionDetail['movements'][number]) =>
          movement.movementType === 'ADJUSTMENT',
      },
      {
        label: 'Previsto sistema',
        value: session?.expectedClosingAmount || 0,
        count: allMovementCount,
        toneClass: 'text-slate-900',
        filterLabel: 'Previsto sistema',
        predicate: () => true,
      },
    ];
  }, [allMovementCount, cashSummary, session?.expectedClosingAmount]);

  function formatCardLabel(label: string, count: number) {
    return `${label} (${count})`;
  }

  const filteredMovements = useMemo(() => {
    const movements = session?.movements || [];
    if (!movementFilter) return movements;
    return movements.filter(movementFilter.predicate);
  }, [movementFilter, session]);

  const auditSqlText = useMemo(() => {
    return buildAuditSqlText({
      sessionId,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceSystem: runtimeContext.sourceSystem,
      movementFilterLabel: movementFilter?.label || null,
    });
  }, [
    movementFilter?.label,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    sessionId,
  ]);

  function handleSetMovementFilter(filter: MovementFilter) {
    setMovementFilter((current) => (current?.label === filter.label ? null : filter));
  }

  function getFilterCardClass(isActive: boolean) {
    return [
      'w-full rounded-lg border px-2.5 py-2 text-left transition',
      isActive
        ? 'border-emerald-900 bg-emerald-900 text-white shadow-sm'
        : 'border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-white',
    ].join(' ');
  }

  function getGroupFilterClass(isActive: boolean) {
    return [
      'flex flex-col justify-center rounded-lg border px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.12em] transition lg:w-32',
      isActive
        ? 'border-emerald-900 bg-emerald-900 text-white shadow-sm'
        : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-blue-200 hover:bg-white',
    ].join(' ');
  }

  function handleOpenCashMovementModal(
    movementType: CashMovementModalState['movementType'],
    direction: CashMovementModalState['direction'],
    title: string,
  ) {
    if (session?.status !== 'OPEN') {
      setError('Este caixa não está aberto para lançamento.');
      return;
    }

    setCashMovementModal({
      movementType,
      direction,
      title,
      amountInput: '',
      notes: '',
    });
  }

  async function handleSaveCashMovement() {
    if (!session || !cashMovementModal || isSavingCashMovement) return;

    const parsedAmount = parseCurrencyInput(cashMovementModal.amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Informe um valor maior que zero para o movimento do caixa.');
      return;
    }

    try {
      setIsSavingCashMovement(true);
      setError(null);
      setSession(
        await requestJson<CashSessionDetail>('/cash-sessions/current/movements', {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            cashierUserId: session.cashierUserId || runtimeContext.cashierUserId,
            cashierDisplayName: session.cashierDisplayName || runtimeContext.cashierDisplayName,
            movementType: cashMovementModal.movementType,
            direction: cashMovementModal.direction,
            amount: parsedAmount,
            notes: cashMovementModal.notes.trim() || undefined,
          }),
          fallbackMessage: 'Não foi possível lançar o movimento no caixa.',
        }),
      );
      setCashMovementModal(null);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível lançar o movimento no caixa.',
        ),
      );
    } finally {
      setIsSavingCashMovement(false);
    }
  }

  async function handleOpenAuditModal() {
    try {
      await copyText(EMBEDDED_SCREEN_ID);
      setAuditCopyStatus('copied');
    } catch {
      setAuditCopyStatus('error');
    } finally {
      setIsAuditModalOpen(true);
    }
  }

  async function handleCopyAuditSql() {
    try {
      await copyText(auditSqlText);
      setAuditCopyStatus('copied');
    } catch {
      setAuditCopyStatus('error');
    }
  }

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                  Operação de caixa
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">
                  Detalhe do caixa
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Consulte os valores e movimentos registrados neste caixa.
                </p>
              </div>
              <Link
                href={`/caixa${preservedQueryString}`}
                className="inline-flex items-center self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar aos caixas
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <div className="flex items-center justify-end gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
              <span className="truncate">
                Tela:{' '}
                <span className="font-normal text-[10px] tracking-[0.35em] text-slate-500">{SCREEN_ID}</span>
              </span>
              <button
                type="button"
                onClick={() => void handleOpenAuditModal()}
                className="flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                title="Copiar nome da tela e abrir auditoria SQL"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
              <span className="min-w-[48px] text-[9px] font-semibold uppercase tracking-[0.4em] text-emerald-600">
                {auditCopyStatus === 'copied' ? 'COPIADO' : auditCopyStatus === 'error' ? 'FALHA' : ''}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {runtimeContext.embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href={`/caixa${preservedQueryString}`}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-50"
          >
            Voltar aos caixas
          </Link>
        </div>
      ) : null}

      {error ? (
        <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Operador</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoading ? 'Carregando...' : session?.cashierDisplayName || '---'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Situação</div>
            <div className="mt-2">
              <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${getStatusTone(session?.status)}`}>
                {isLoading ? 'CARREGANDO' : getStatusLabel(session?.status)}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Abertura</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoading ? 'Carregando...' : formatDateTimeLabel(session?.openedAt)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Fechamento</div>
            <div className="mt-2 text-base font-black text-slate-900">
              {isLoading ? 'Carregando...' : formatDateTimeLabel(session?.closedAt)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className={`${cardClass} p-6`}>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Troco inicial</div>
          <div className="mt-3 text-2xl font-black text-slate-900">
            {formatCurrency(session?.openingAmount)}
          </div>
        </div>
        <div className={`${cardClass} p-6`}>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Valor Movimentado</div>
          <div className="mt-3 text-2xl font-black text-slate-900">
            {formatCurrency(movedAmount)}
          </div>
        </div>
        <div className={`${cardClass} p-6`}>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Troco final</div>
          <div className="mt-3 text-2xl font-black text-slate-900">
            {formatCurrency(cashSummary.finalChangeAmount)}
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-3`}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <button
            type="button"
            onClick={() => handleSetMovementFilter({
              label: 'Recebimentos',
              predicate: (movement) => Boolean(movement.paymentMethod),
            })}
            className={getGroupFilterClass(movementFilter?.label === 'Recebimentos')}
          >
            <span>Recebimentos</span>
            <span className={`mt-1 text-xs tracking-normal ${movementFilter?.label === 'Recebimentos' ? 'text-white' : 'text-slate-900'}`}>
              {formatCurrency(session?.totalReceivedAmount)}
            </span>
          </button>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {paymentCards.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleSetMovementFilter({
                label: item.label,
                predicate: (movement) => movement.paymentMethod === item.paymentMethod,
              })}
              className={getFilterCardClass(movementFilter?.label === item.label)}
            >
              <div className={`truncate text-[9px] font-black uppercase tracking-[0.08em] ${movementFilter?.label === item.label ? 'text-emerald-100' : 'text-slate-500'}`}>{formatCardLabel(item.label, item.count)}</div>
              <div className={`mt-1 text-sm font-black ${movementFilter?.label === item.label ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(item.value)}</div>
            </button>
          ))}
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <button
            type="button"
            onClick={() => handleSetMovementFilter({
              label: 'Vendas',
              predicate: () => false,
            })}
            className={getGroupFilterClass(movementFilter?.label === 'Vendas')}
          >
            <span>Vendas</span>
            <span className={`mt-1 text-xs tracking-normal ${movementFilter?.label === 'Vendas' ? 'text-white' : 'text-slate-900'}`}>
              {formatCurrency(totalSaleAmount)}
            </span>
          </button>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {saleCards.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleSetMovementFilter({
                label: `Vendas ${item.label}`,
                predicate: () => false,
              })}
              className={getFilterCardClass(movementFilter?.label === `Vendas ${item.label}`)}
            >
              <div className={`truncate text-[9px] font-black uppercase tracking-[0.08em] ${movementFilter?.label === `Vendas ${item.label}` ? 'text-emerald-100' : 'text-slate-500'}`}>{formatCardLabel(item.label, item.count)}</div>
              <div className={`mt-1 text-sm font-black ${movementFilter?.label === `Vendas ${item.label}` ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(item.value)}</div>
            </button>
          ))}
          </div>
        </div>
        <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <button
            type="button"
            onClick={() => handleSetMovementFilter({
              label: 'Outros',
              predicate: (movement) =>
                movement.movementType === 'ENTRY' ||
                movement.movementType === 'EXIT' ||
                movement.movementType === 'ADJUSTMENT',
            })}
            className={getGroupFilterClass(movementFilter?.label === 'Outros')}
          >
            Outros:
          </button>
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {otherCards.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleSetMovementFilter({
                label: item.filterLabel,
                predicate: item.predicate,
              })}
              className={getFilterCardClass(movementFilter?.label === item.filterLabel)}
            >
              <div className={`truncate text-[9px] font-black uppercase tracking-[0.08em] ${movementFilter?.label === item.filterLabel ? 'text-emerald-100' : 'text-slate-500'}`}>{formatCardLabel(item.label, item.count)}</div>
              <div className={`mt-1 text-sm font-black ${movementFilter?.label === item.filterLabel ? 'text-white' : item.toneClass}`}>{formatCurrency(item.value)}</div>
            </button>
          ))}
          </div>
        </div>

        {session?.status === 'OPEN' ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleOpenCashMovementModal('ENTRY', 'IN', 'Entrada dinheiro')}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-sm shadow-emerald-600/15 transition hover:bg-emerald-700"
            >
              Entrada $
            </button>
            <button
              type="button"
              onClick={() => handleOpenCashMovementModal('EXIT', 'OUT', 'Saída dinheiro')}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-sm shadow-rose-600/15 transition hover:bg-rose-700"
            >
              Saída $
            </button>
            <button
              type="button"
              onClick={() => handleOpenCashMovementModal('ADJUSTMENT', 'IN', 'Ajuste caixa')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 transition hover:bg-slate-100"
            >
              Ajuste caixa
            </button>
          </div>
        ) : null}
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        {movementFilter ? (
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-blue-50 px-4 py-3">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">
              Filtro: {movementFilter.label}
            </div>
            <button
              type="button"
              onClick={() => setMovementFilter(null)}
              className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 transition hover:bg-blue-100"
            >
              Limpar
            </button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Forma</th>
                <th className="px-4 py-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map((movement) => (
                <tr key={movement.id} className="border-t border-slate-100">
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {formatDateTimeLabel(movement.occurredAt)}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => handleSetMovementFilter({
                        label: movement.description,
                        predicate: (currentMovement) => currentMovement.description === movement.description,
                      })}
                      className="text-left font-semibold text-slate-700 transition hover:text-blue-700 hover:underline"
                    >
                      {movement.description}
                    </button>
                  </td>
                  <td className="px-4 py-4">{getDirectionLabel(movement.direction)}</td>
                  <td className="px-4 py-4">{getPaymentMethodLabel(movement.paymentMethod)}</td>
                  <td className="px-4 py-4 font-black text-slate-900">{formatCurrency(movement.amount)}</td>
                </tr>
              ))}

              {!isLoading && !filteredMovements.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum movimento foi localizado para este caixa.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {cashMovementModal ? (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">Movimento do caixa</div>
                  <h3 className="mt-1 text-xl font-black text-slate-900">{cashMovementModal.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => !isSavingCashMovement && setCashMovementModal(null)}
                  className="rounded-full bg-white px-3 py-2 text-sm font-black text-slate-500 shadow-sm hover:text-slate-900"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-6">
              {cashMovementModal.movementType === 'ADJUSTMENT' ? (
                <label>
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Tipo do ajuste</span>
                  <select
                    value={cashMovementModal.direction}
                    onChange={(event) => setCashMovementModal((current) => current ? { ...current, direction: event.target.value as 'IN' | 'OUT' } : current)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                  >
                    <option value="IN">SOMAR NO CAIXA</option>
                    <option value="OUT">SUBTRAIR DO CAIXA</option>
                  </select>
                </label>
              ) : null}

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Valor</span>
                <input
                  value={cashMovementModal.amountInput}
                  onChange={(event) => setCashMovementModal((current) => current ? { ...current, amountInput: event.target.value } : current)}
                  inputMode="decimal"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="0,00"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Observação</span>
                <textarea
                  value={cashMovementModal.notes}
                  onChange={(event) => setCashMovementModal((current) => current ? { ...current, notes: event.target.value } : current)}
                  className="min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="OBSERVAÇÃO DO LANÇAMENTO"
                />
              </label>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCashMovementModal(null)}
                  disabled={isSavingCashMovement}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveCashMovement()}
                  disabled={isSavingCashMovement}
                  className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                >
                  {isSavingCashMovement ? 'Salvando...' : 'Salvar movimento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAuditModalOpen ? (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/40 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-800 to-blue-900 px-6 py-4 text-white">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200">
                  Auditoria SQL
                </div>
                <div className="mt-1 text-sm font-black">
                  {EMBEDDED_SCREEN_ID}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl leading-none text-white transition hover:bg-white/20"
                aria-label="Fechar auditoria SQL"
              >
                ×
              </button>
            </div>

            <div className="bg-slate-100 px-6 py-6">
              <div className="mb-5">
                <div className="mb-4 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <img
                    src="/logo-msinfor.jpg"
                    alt="MSINFOR Sistemas"
                    className="h-24 w-24 rounded-full border-4 border-white object-contain shadow-lg shadow-slate-950/15"
                  />
                  <div className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-black uppercase tracking-[0.12em] text-blue-700 shadow-sm">
                    Lógica Usada nessa Tela
                  </div>
                </div>
                <div className="mx-auto mt-3 max-w-4xl rounded-full border border-red-100 bg-red-50 px-4 py-2 text-center text-xs font-black text-red-700">
                  {SCREEN_ORIGIN_TEXT}
                </div>
              </div>

              <div className="max-h-[55vh] overflow-auto rounded-2xl border border-slate-200 bg-white px-6 py-6 font-mono text-[12px] text-slate-950 shadow-inner">
                <AuditSqlContent text={auditSqlText} />
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <button
                  type="button"
                  onClick={() => void handleCopyAuditSql()}
                  className="rounded-xl bg-emerald-700 px-10 py-3 text-sm font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-800"
                >
                  Copiar SQL
                </button>
                <button
                  type="button"
                  onClick={() => setIsAuditModalOpen(false)}
                  className="rounded-xl bg-slate-700 px-12 py-3 text-sm font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-slate-700/20 transition hover:bg-slate-800"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
