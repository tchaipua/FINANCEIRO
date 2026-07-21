'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import ScreenAuditModal from '@/app/components/screen-audit-modal';
import { getJson, requestJson } from '@/app/lib/api';
import { copyTextToClipboard } from '@/app/lib/clipboard';
import { formatCurrency, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  normalizeFinanceDisplayText,
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
    customerCreditSettlement?: number;
    customerCreditGenerated?: number;
    customerCreditUsed?: number;
  };
  movementCount: number;
  settlementCount: number;
  companyName?: string | null;
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
  confirmAmountInput: string;
  notes: string;
  feedback?: {
    type: 'success' | 'error';
    message: string;
  } | null;
};

type CancelMovementModalState = {
  movement: CashSessionDetail['movements'][number];
  password: string;
  reason: string;
  feedback?: {
    type: 'success' | 'error';
    message: string;
  } | null;
};

type CloseCashSessionModalState = {
  password: string;
  feedback?: {
    type: 'success' | 'error';
    message: string;
  } | null;
};

type MovementFilter = {
  label: string;
  sqlWhere?: string;
  predicate: (movement: CashSessionDetail['movements'][number]) => boolean;
};

const SCREEN_ID = 'FINANCEIRO_CAIXA_DETALHE';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CAIXA_DETALHE';
const CANCEL_MOVEMENT_POPUP_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_CAIXA_DETALHE_CANCELAMENTO';
const CLOSE_CASH_SESSION_POPUP_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_CAIXA_DETALHE_FECHAR_CAIXA';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const SCREEN_ORIGIN_TEXT =
  'Origem: Sistema Financeiro - C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\caixa\\[sessionId]\\page.tsx';

type CashAuditTextInput = {
  sessionId?: string | null;
  sourceTenantId?: string | null;
  sourceSystem?: string | null;
  companyName?: string | null;
  movementFilterLabel?: string | null;
  movementFilterSqlWhere?: string | null;
  filteredMovementCount?: number;
  totalMovementCount?: number;
};

function toSqlLiteral(value?: string | number | null) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function formatAuditValue(value?: string | number | null) {
  const normalized = String(value ?? '').trim();
  return normalized || 'NAO INFORMADO';
}

function buildAuditInfoText({
  sessionId,
  sourceTenantId,
  sourceSystem,
  companyName,
  movementFilterLabel,
  filteredMovementCount,
  totalMovementCount,
}: CashAuditTextInput) {
  const tenantNameText = companyName ? ` (${companyName})` : '';
  const movementFilterText = movementFilterLabel || 'ALL';
  const filteredCountText = Number.isFinite(filteredMovementCount)
    ? String(filteredMovementCount)
    : '0';
  const totalCountText = Number.isFinite(totalMovementCount)
    ? String(totalMovementCount)
    : '0';

  return `--- LOGICA DA TELA ---
Tela de detalhe do caixa financeiro, com resumo dos valores e grid de movimentos do caixa selecionado.

TABELAS PRINCIPAIS:
- cash_sessions (CS) - sessões de caixa abertas/fechadas por operador.
- cash_movements (CM) - movimentos registrados no caixa, como recebimentos, entradas, saídas e ajustes.
- installment_settlements (ISS) - baixas/recebimentos realizados sobre parcelas.
- receivable_installments (RI) - parcelas/títulos a receber vinculados aos recebimentos.

RELACIONAMENTOS:
- cash_movements.cashSessionId = cash_sessions.id
- installment_settlements.cashSessionId = cash_sessions.id
- installment_settlements.installmentId = receivable_installments.id

MÉTRICAS / CAMPOS EXIBIDOS:
- Troco inicial: cash_sessions.openingAmount
- Valor movimentado:
  recebimento dinheiro
  + recebimento cheque
  + crédito cliente recebido
  + venda dinheiro
  + venda cheque
  + créditos gerados/retidos
  - créditos utilizados
  + entrada dinheiro
  - saída dinheiro
  +/- ajustes caixa
- Troco final: cash_sessions.expectedClosingAmount
- Recebimentos por forma: cash_movements.paymentMethod
- Movimentos: cash_movements.description, direction, amount, occurredAt

FILTROS APLICADOS AGORA:
- caixa atual (:sessionId): ${formatAuditValue(sessionId)}
- empresa/tenant atual (:sourceTenantId): ${formatAuditValue(sourceTenantId)}${tenantNameText}
- sistema de origem (:sourceSystem): ${formatAuditValue(sourceSystem)}
- filtro visual de movimentos: ${movementFilterText}
- registros exibidos apos os filtros: ${filteredCountText}
- registros totais do caixa: ${totalCountText}

ORDENAÇÃO:
- movimentos exibidos por occurredAt DESC, do mais recente para o mais antigo

OBSERVACAO SOBRE O FILTRO DA EMPRESA / TENANT:
- cash_sessions.sourceTenantId e usado para isolar os dados da empresa/escola
- sourceTenantId acima ja esta preenchido com o tenant real recebido do sistema de origem
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

function buildAuditSqlText({
  sessionId,
  sourceTenantId,
  sourceSystem,
  movementFilterLabel,
  movementFilterSqlWhere,
}: CashAuditTextInput) {
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedSourceTenantId = String(sourceTenantId || '').trim();
  const normalizedSourceSystem = String(sourceSystem || '').trim();
  const sourceSystemWhere = normalizedSourceSystem
    ? `\n  AND cs."sourceSystem" = ${toSqlLiteral(normalizedSourceSystem)}`
    : '';
  const movementWhere = movementFilterSqlWhere?.trim()
    ? `\n  AND ${movementFilterSqlWhere.trim()}`
    : '';

  return `-- PARAMETROS ATUAIS DO GRID
-- :sessionId = ${toSqlLiteral(normalizedSessionId)}
-- :sourceTenantId = ${toSqlLiteral(normalizedSourceTenantId)}
-- :sourceSystem = ${normalizedSourceSystem ? toSqlLiteral(normalizedSourceSystem) : 'NAO INFORMADO'}
-- :movementFilter = ${toSqlLiteral(movementFilterLabel || 'ALL')}

SELECT
  cs.id AS cash_session_id,
  cs."cashierDisplayName",
  cs.status,
  cs."openingAmount",
  cs."expectedClosingAmount",
  cm."occurredAt",
  cm.description,
  cm."movementType",
  cm.direction,
  cm."paymentMethod",
  cm.amount,
  cm."referenceType",
  cm."referenceId"
FROM cash_sessions cs
LEFT JOIN cash_movements cm
  ON cm."cashSessionId" = cs.id
  AND cm."canceledAt" IS NULL
WHERE cs.id = ${toSqlLiteral(normalizedSessionId)}
  AND cs."canceledAt" IS NULL
  AND cs."sourceTenantId" = ${toSqlLiteral(normalizedSourceTenantId)}${sourceSystemWhere}${movementWhere}
ORDER BY cm."occurredAt" DESC;`;
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
  if (paymentMethod === 'CUSTOMER_CREDIT') return 'CRÉDITO CLIENTE';
  return paymentMethod || '---';
}

function getDirectionLabel(direction?: string | null) {
  if (direction === 'IN') return 'ENTRADA';
  if (direction === 'OUT') return 'SAÍDA';
  return 'INFORMATIVO';
}

function isOutgoingMovement(direction?: string | null) {
  return String(direction || '').trim().toUpperCase() === 'OUT';
}

function getMovementAmountTone(direction?: string | null) {
  return isOutgoingMovement(direction) ? 'text-rose-700' : 'text-emerald-700';
}

function getMovementAmountSign(direction?: string | null) {
  return isOutgoingMovement(direction) ? '-' : '+';
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

function isSameCurrencyAmount(firstAmount: number, secondAmount: number) {
  return Math.round(firstAmount * 100) === Math.round(secondAmount * 100);
}

function canCancelMovement(
  movement: CashSessionDetail['movements'][number],
  canceledMovementIds?: Set<string>,
) {
  if (movement.referenceType === 'CASH_MOVEMENT_CANCEL') return false;
  if (canceledMovementIds?.has(movement.id)) return false;
  if (movement.referenceType === 'SALE' && movement.referenceId) return true;
  if (movement.movementType === 'SETTLEMENT' && movement.referenceType === 'INSTALLMENT') return true;
  return ['ENTRY', 'EXIT', 'ADJUSTMENT', 'CUSTOMER_CREDIT_GENERATED'].includes(
    String(movement.movementType || ''),
  );
}

function getCancelMovementTitle(movement: CashSessionDetail['movements'][number]) {
  if (movement.referenceType === 'SALE') return 'Cancelar venda';
  if (movement.movementType === 'SETTLEMENT') return 'Cancelar recebimento';
  return 'Cancelar movimento';
}

function getFriendlyCancellationPasswordMessage(message?: string | null) {
  const normalizedMessage = String(message || '').trim();
  if (
    !normalizedMessage ||
    normalizedMessage.includes('Cannot POST') ||
    normalizedMessage.includes('/auth/confirm-cash-cancellation-password') ||
    normalizedMessage.includes('confirm-cash-cancellation-password')
  ) {
    return 'Confira a senha do operador ou supervisor.';
  }

  return normalizedMessage;
}

function confirmCashCancellationPassword(password: string) {
  return new Promise<{ authorizedBy?: string; supervisorName?: string | null }>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.parent) {
      reject(new Error('Abra esta tela pelo sistema da Escola para validar a senha.'));
      return;
    }

    const requestId = `cancel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
        reject(new Error(getFriendlyCancellationPasswordMessage(payload.message)));
        return;
      }

      resolve({
        authorizedBy: payload.authorizedBy,
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

function requestHostLogoutAfterCashClose() {
  if (typeof window === 'undefined' || !window.parent) return;

  window.parent.postMessage(
    {
      type: 'MSINFOR_CASH_SESSION_CLOSED_LOGOUT',
    },
    '*',
  );
}

function wasCloseCashSessionOpenedFromGrid() {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('openCloseCashSession') === '1'
  );
}

function getRequestedCashMovementFromUrl() {
  if (typeof window === 'undefined') return null;

  const requestedMovement = String(
    new URLSearchParams(window.location.search).get('openCashMovement') || '',
  ).toLowerCase();

  if (requestedMovement === 'entry') {
    return {
      movementType: 'ENTRY' as const,
      direction: 'IN' as const,
      title: 'Entrada dinheiro',
    };
  }

  if (requestedMovement === 'exit') {
    return {
      movementType: 'EXIT' as const,
      direction: 'OUT' as const,
      title: 'Saída dinheiro',
    };
  }

  return null;
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
  const [cashMovementConfirmation, setCashMovementConfirmation] = useState<{ amount: number } | null>(null);
  const [cancelMovementModal, setCancelMovementModal] = useState<CancelMovementModalState | null>(null);
  const [closeCashSessionModal, setCloseCashSessionModal] = useState<CloseCashSessionModalState | null>(null);
  const [isCancelingMovement, setIsCancelingMovement] = useState(false);
  const [isClosingCashSession, setIsClosingCashSession] = useState(false);
  const [movementFilter, setMovementFilter] = useState<MovementFilter | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [popupAuditScreenId, setPopupAuditScreenId] = useState<string | null>(null);
  const [auditCopyStatus, setAuditCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [autoCloseCashSessionPopupOpened, setAutoCloseCashSessionPopupOpened] = useState(false);
  const [autoCashMovementPopupOpened, setAutoCashMovementPopupOpened] = useState(false);
  const cashierDisplayName = useMemo(
    () =>
      normalizeFinanceDisplayText(session?.cashierDisplayName) ||
      normalizeFinanceDisplayText(runtimeContext.cashierDisplayName) ||
      null,
    [runtimeContext.cashierDisplayName, session?.cashierDisplayName],
  );

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
    if (
      autoCloseCashSessionPopupOpened ||
      isLoading ||
      !wasCloseCashSessionOpenedFromGrid() ||
      session?.status !== 'OPEN'
    ) {
      return;
    }

    setAutoCloseCashSessionPopupOpened(true);
    setCloseCashSessionModal({
      password: '',
      feedback: null,
    });
  }, [autoCloseCashSessionPopupOpened, isLoading, session?.status]);

  function handleCancelCloseCashSessionModal() {
    if (isClosingCashSession) return;

    if (wasCloseCashSessionOpenedFromGrid()) {
      window.location.href = `/caixa${preservedQueryString}`;
      return;
    }

    setCloseCashSessionModal(null);
  }

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
        customerCreditSettlementAmount: 0,
        customerCreditSettlementCount: 0,
        customerCreditGeneratedAmount: 0,
        customerCreditGeneratedCount: 0,
        customerCreditUsedAmount: 0,
        customerCreditUsedCount: 0,
        finalChangeAmount: 0,
      };
    }
    const movements = session.movements || [];
    const cashEntries = movements.filter((item) => item.movementType === 'ENTRY' && item.direction === 'IN');
    const cashExits = movements.filter((item) => item.movementType === 'EXIT' && item.direction === 'OUT');
    const cashAdjustments = movements.filter((item) => item.movementType === 'ADJUSTMENT');
    const cashReceipts = movements.filter((item) => item.movementType === 'SETTLEMENT' && item.paymentMethod === 'CASH');
    const checkReceipts = movements.filter((item) => item.movementType === 'SETTLEMENT' && item.paymentMethod === 'CHECK');
    const customerCreditSettlements = movements.filter((item) => item.movementType === 'SETTLEMENT' && item.paymentMethod === 'CUSTOMER_CREDIT');
    const customerCreditGenerated = movements.filter((item) => item.movementType === 'CUSTOMER_CREDIT_GENERATED' && item.direction === 'IN');
    const customerCreditUsed = movements.filter((item) => item.movementType === 'CUSTOMER_CREDIT_USAGE' && item.direction === 'OUT');
    const cashEntryAmount = cashEntries.reduce((total, item) => total + Number(item.amount || 0), 0);
    const cashExitAmount = cashExits.reduce((total, item) => total + Number(item.amount || 0), 0);
    const cashAdjustmentAmount = cashAdjustments
      .reduce((total, item) => total + (item.direction === 'OUT' ? -Number(item.amount || 0) : Number(item.amount || 0)), 0);
    const cashReceivedAmount = session.receivedByPaymentMethod?.cash || 0;
    const checkReceivedAmount = session.receivedByPaymentMethod?.check || 0;
    const customerCreditSettlementAmount = session.receivedByPaymentMethod?.customerCreditSettlement || 0;
    const customerCreditGeneratedAmount = session.receivedByPaymentMethod?.customerCreditGenerated || 0;
    const customerCreditUsedAmount = session.receivedByPaymentMethod?.customerCreditUsed || 0;
    const finalChangeAmount =
      Number(session.openingAmount || 0) +
      cashReceivedAmount +
      customerCreditSettlementAmount +
      cashEntryAmount -
      cashExitAmount +
      checkReceivedAmount +
      customerCreditGeneratedAmount -
      customerCreditUsedAmount +
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
      customerCreditSettlementAmount,
      customerCreditSettlementCount: customerCreditSettlements.length,
      customerCreditGeneratedAmount,
      customerCreditGeneratedCount: customerCreditGenerated.length,
      customerCreditUsedAmount,
      customerCreditUsedCount: customerCreditUsed.length,
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
      { label: 'Crédito Cliente', value: totals?.customerCreditSettlement || 0, paymentMethod: 'CUSTOMER_CREDIT' },
    ].map((item) => ({
      ...item,
      count: movements.filter(
        (movement) =>
          movement.movementType === 'SETTLEMENT' &&
          movement.paymentMethod === item.paymentMethod,
      ).length,
    }));
  }, [session]);

  const saleCards = useMemo(() => {
    const movements = session?.movements || [];
    return [
      { label: 'Dinheiro', paymentMethod: 'CASH' },
      { label: 'PIX', paymentMethod: 'PIX' },
      { label: 'Cartão Crédito', paymentMethod: 'CREDIT_CARD' },
      { label: 'Cartão Débito', paymentMethod: 'DEBIT_CARD' },
      { label: 'Cheque', paymentMethod: 'CHECK' },
    ].map((item) => {
      const saleMovements = movements.filter(
        (movement) =>
          movement.movementType === 'SALE_RECEIPT' &&
          movement.paymentMethod === item.paymentMethod,
      );

      return {
        ...item,
        value: saleMovements.reduce((total, movement) => total + Number(movement.amount || 0), 0),
        count: saleMovements.length,
      };
    });
  }, [session?.movements]);

  const totalSaleAmount = useMemo(() => {
    return saleCards.reduce((total, item) => total + Number(item.value || 0), 0);
  }, [saleCards]);

  const movedAmount = useMemo(() => {
    return (
      cashSummary.cashReceivedAmount +
      cashSummary.checkReceivedAmount +
      cashSummary.customerCreditSettlementAmount +
      totalSaleAmount +
      cashSummary.customerCreditGeneratedAmount -
      cashSummary.customerCreditUsedAmount +
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
    cashSummary.customerCreditGeneratedAmount,
    cashSummary.customerCreditSettlementAmount,
    cashSummary.customerCreditUsedAmount,
    totalSaleAmount,
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
        sqlWhere: `cm."movementType" = ${toSqlLiteral('ENTRY')} AND cm.direction = ${toSqlLiteral('IN')}`,
        predicate: (movement: CashSessionDetail['movements'][number]) =>
          movement.movementType === 'ENTRY' && movement.direction === 'IN',
      },
      {
        label: 'Saída dinheiro',
        value: cashSummary.cashExitAmount,
        count: cashSummary.cashExitCount,
        toneClass: 'text-rose-700',
        filterLabel: 'Saída dinheiro',
        sqlWhere: `cm."movementType" = ${toSqlLiteral('EXIT')} AND cm.direction = ${toSqlLiteral('OUT')}`,
        predicate: (movement: CashSessionDetail['movements'][number]) =>
          movement.movementType === 'EXIT' && movement.direction === 'OUT',
      },
      {
        label: 'Ajustes caixa',
        value: cashSummary.cashAdjustmentAmount,
        count: cashSummary.cashAdjustmentCount,
        toneClass: 'text-slate-900',
        filterLabel: 'Ajustes caixa',
        sqlWhere: `cm."movementType" = ${toSqlLiteral('ADJUSTMENT')}`,
        predicate: (movement: CashSessionDetail['movements'][number]) =>
          movement.movementType === 'ADJUSTMENT',
      },
      {
        label: 'Créditos gerados/retidos',
        value: cashSummary.customerCreditGeneratedAmount,
        count: cashSummary.customerCreditGeneratedCount,
        toneClass: 'text-blue-700',
        filterLabel: 'Créditos gerados/retidos',
        sqlWhere: `cm."movementType" = ${toSqlLiteral('CUSTOMER_CREDIT_GENERATED')} AND cm.direction = ${toSqlLiteral('IN')}`,
        predicate: (movement: CashSessionDetail['movements'][number]) =>
          movement.movementType === 'CUSTOMER_CREDIT_GENERATED' && movement.direction === 'IN',
      },
      {
        label: 'Créditos utilizados',
        value: cashSummary.customerCreditUsedAmount,
        count: cashSummary.customerCreditUsedCount,
        toneClass: 'text-rose-700',
        filterLabel: 'Créditos utilizados',
        sqlWhere: `cm."movementType" = ${toSqlLiteral('CUSTOMER_CREDIT_USAGE')} AND cm.direction = ${toSqlLiteral('OUT')}`,
        predicate: (movement: CashSessionDetail['movements'][number]) =>
          movement.movementType === 'CUSTOMER_CREDIT_USAGE' && movement.direction === 'OUT',
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
    const filtered = movementFilter
      ? movements.filter(movementFilter.predicate)
      : movements;

    return [...filtered].sort((left, right) => {
      const dateDifference =
        new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
      if (dateDifference !== 0) return dateDifference;
      return String(right.id).localeCompare(String(left.id), 'pt-BR');
    });
  }, [movementFilter, session]);

  const canceledMovementIds = useMemo(() => {
    return new Set(
      (session?.movements || [])
        .filter((movement) => movement.referenceType === 'CASH_MOVEMENT_CANCEL')
        .map((movement) => String(movement.referenceId || ''))
        .filter(Boolean),
    );
  }, [session?.movements]);

  const auditInfoText = useMemo(() => {
    return buildAuditInfoText({
      sessionId,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceSystem: runtimeContext.sourceSystem,
      companyName: session?.companyName || runtimeContext.companyName,
      movementFilterLabel: movementFilter?.label || null,
      filteredMovementCount: filteredMovements.length,
      totalMovementCount: allMovementCount,
    });
  }, [
    allMovementCount,
    filteredMovements.length,
    movementFilter?.label,
    runtimeContext.companyName,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    session?.companyName,
    sessionId,
  ]);

  const auditSqlText = useMemo(() => {
    return buildAuditSqlText({
      sessionId,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceSystem: runtimeContext.sourceSystem,
      movementFilterLabel: movementFilter?.label || null,
      movementFilterSqlWhere: movementFilter?.sqlWhere || null,
    });
  }, [
    movementFilter?.label,
    movementFilter?.sqlWhere,
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
      confirmAmountInput: '',
      notes: '',
      feedback: null,
    });
    setCashMovementConfirmation(null);
  }

  useEffect(() => {
    if (autoCashMovementPopupOpened || !session || isLoading) return;

    const requestedMovement = getRequestedCashMovementFromUrl();
    if (!requestedMovement) return;

    setAutoCashMovementPopupOpened(true);
    handleOpenCashMovementModal(
      requestedMovement.movementType,
      requestedMovement.direction,
      requestedMovement.title,
    );
  }, [autoCashMovementPopupOpened, isLoading, session]);

  function showCashMovementFeedback(type: 'success' | 'error', message: string) {
    setError(null);
    setCashMovementConfirmation(null);
    setCashMovementModal((current) => current ? {
      ...current,
      feedback: {
        type,
        message,
      },
    } : current);
  }

  function handleRequestSaveCashMovement() {
    if (!session || !cashMovementModal || isSavingCashMovement) return;

    const parsedAmount = parseCurrencyInput(cashMovementModal.amountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showCashMovementFeedback('error', 'Informe um valor maior que zero para o movimento do caixa.');
      return;
    }

    if (cashMovementModal.movementType !== 'ADJUSTMENT') {
      const parsedConfirmAmount = parseCurrencyInput(cashMovementModal.confirmAmountInput);
      if (!Number.isFinite(parsedConfirmAmount) || parsedConfirmAmount <= 0) {
        showCashMovementFeedback('error', 'Confirme o valor do movimento antes de continuar.');
        return;
      }

      if (!isSameCurrencyAmount(parsedAmount, parsedConfirmAmount)) {
        showCashMovementFeedback(
          'error',
          'O valor informado e o valor de confirmação precisam ser iguais.',
        );
        return;
      }

      setError(null);
      setCashMovementModal((current) => current ? { ...current, feedback: null } : current);
      setCashMovementConfirmation({ amount: parsedAmount });
      return;
    }

    void handleSaveCashMovement(parsedAmount);
  }

  async function handleSaveCashMovement(parsedAmount: number) {
    if (!session || !cashMovementModal || isSavingCashMovement) return;

    try {
      setIsSavingCashMovement(true);
      setError(null);
      setCashMovementConfirmation(null);
      const updatedSession = await requestJson<CashSessionDetail>('/cash-sessions/current/movements', {
        method: 'POST',
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          cashierUserId: session.cashierUserId || runtimeContext.cashierUserId,
          movementType: cashMovementModal.movementType,
          direction: cashMovementModal.direction,
          amount: parsedAmount,
          notes: cashMovementModal.notes.trim() || undefined,
        }),
        fallbackMessage: 'Não foi possível lançar o movimento no caixa.',
      });
      setSession(updatedSession);
      showCashMovementFeedback('success', `${cashMovementModal.title} lançado com sucesso.`);
    } catch (currentError) {
      showCashMovementFeedback(
        'error',
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível lançar o movimento no caixa.',
        ),
      );
    } finally {
      setIsSavingCashMovement(false);
    }
  }

  function handleConfirmSaveCashMovement() {
    if (!cashMovementConfirmation) return;
    void handleSaveCashMovement(cashMovementConfirmation.amount);
  }

  function handleOpenCancelMovementModal(movement: CashSessionDetail['movements'][number]) {
    if (!canCancelMovement(movement, canceledMovementIds)) {
      setError('Este movimento não possui cancelamento disponível nesta tela.');
      return;
    }

    setCancelMovementModal({
      movement,
      password: '',
      reason: '',
      feedback: null,
    });
  }

  function handleOpenCloseCashSessionModal() {
    if (session?.status !== 'OPEN') {
      setError('Este caixa não está aberto para fechamento.');
      return;
    }

    setCloseCashSessionModal({
      password: '',
      feedback: null,
    });
  }

  async function handleConfirmCloseCashSession() {
    if (!session || !closeCashSessionModal || isClosingCashSession) return;

    const password = closeCashSessionModal.password.trim();
    if (!password) {
      setCloseCashSessionModal((current) => current ? {
        ...current,
        feedback: {
          type: 'error',
          message: 'Informe a senha do usuário do caixa.',
        },
      } : current);
      return;
    }

    if (!runtimeContext.embedded) {
      setCloseCashSessionModal((current) => current ? {
        ...current,
        feedback: {
          type: 'error',
          message: 'Abra esta tela pelo sistema da Escola para validar a senha.',
        },
      } : current);
      return;
    }

    try {
      setIsClosingCashSession(true);
      setError(null);
      const authorization = await confirmCashCancellationPassword(password);
      const requestedBy =
        authorization.supervisorName ||
        cashierDisplayName ||
        session.cashierDisplayName ||
        runtimeContext.cashierDisplayName ||
        runtimeContext.cashierUserId ||
        'OPERADOR';

      await requestJson<CashSessionDetail>('/cash-sessions/close-current', {
        method: 'POST',
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          cashierUserId: session.cashierUserId || runtimeContext.cashierUserId,
          declaredClosingAmount: session.expectedClosingAmount,
          requestedBy,
          notes: 'FECHAMENTO DE CAIXA PELO DETALHE DO CAIXA',
        }),
        fallbackMessage: 'Não foi possível fechar o caixa.',
      });

      setCloseCashSessionModal((current) => current ? {
        ...current,
        password: '',
        feedback: {
          type: 'success',
          message: 'Caixa fechado com sucesso. Você será direcionado para o login.',
        },
      } : current);
      window.setTimeout(() => requestHostLogoutAfterCashClose(), 900);
    } catch (currentError) {
      setCloseCashSessionModal((current) => current ? {
        ...current,
        feedback: {
          type: 'error',
          message: getFriendlyCancellationPasswordMessage(
            getFriendlyRequestErrorMessage(
              currentError,
              'Não foi possível fechar o caixa.',
            ),
          ),
        },
      } : current);
    } finally {
      setIsClosingCashSession(false);
    }
  }

  async function handleConfirmCancelMovement() {
    if (!cancelMovementModal || isCancelingMovement) return;

    const password = cancelMovementModal.password.trim();
    if (!password) {
      setCancelMovementModal((current) => current ? {
        ...current,
        feedback: {
          type: 'error',
          message: 'Informe a senha do operador ou supervisor.',
        },
      } : current);
      return;
    }

    if (!runtimeContext.embedded) {
      setCancelMovementModal((current) => current ? {
        ...current,
        feedback: {
          type: 'error',
          message: 'Abra esta tela pelo sistema da Escola para validar a senha.',
        },
      } : current);
      return;
    }

    try {
      setIsCancelingMovement(true);
      setError(null);
      const authorization = await confirmCashCancellationPassword(password);
      const requestedBy =
        authorization.supervisorName ||
        cashierDisplayName ||
        runtimeContext.cashierDisplayName ||
        runtimeContext.cashierUserId ||
        'OPERADOR';
      const reason =
        cancelMovementModal.reason.trim() ||
        `${getCancelMovementTitle(cancelMovementModal.movement)} autorizado por ${
          authorization.authorizedBy || 'OPERADOR'
        }`;

      if (
        cancelMovementModal.movement.referenceType === 'SALE' &&
        cancelMovementModal.movement.referenceId
      ) {
        await requestJson(`/sales/${cancelMovementModal.movement.referenceId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            cashierUserId: session?.cashierUserId || runtimeContext.cashierUserId,
            requestedBy,
            reason,
          }),
          fallbackMessage: 'Não foi possível cancelar a venda.',
        });
      } else {
        await requestJson(`/cash-sessions/movements/${cancelMovementModal.movement.id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            cashierUserId: session?.cashierUserId || runtimeContext.cashierUserId,
            cashierDisplayName: cashierDisplayName || session?.cashierDisplayName || runtimeContext.cashierDisplayName,
            requestedBy,
            reason,
          }),
          fallbackMessage: 'Não foi possível cancelar o movimento.',
        });
      }

      setCancelMovementModal((current) => current ? {
        ...current,
        password: '',
        feedback: {
          type: 'success',
          message: 'Cancelamento registrado com sucesso.',
        },
      } : current);
      await loadSession();
    } catch (currentError) {
      setCancelMovementModal((current) => current ? {
        ...current,
        feedback: {
          type: 'error',
          message: getFriendlyCancellationPasswordMessage(
            getFriendlyRequestErrorMessage(
              currentError,
              'Não foi possível cancelar o movimento.',
            ),
          ),
        },
      } : current);
    } finally {
      setIsCancelingMovement(false);
    }
  }

  async function handleOpenAuditModal() {
    try {
      const copied = await copyTextToClipboard(EMBEDDED_SCREEN_ID);
      setAuditCopyStatus(copied ? 'copied' : 'error');
    } catch {
      setAuditCopyStatus('error');
    } finally {
      setIsAuditModalOpen(true);
    }
  }

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                  Operação de caixa
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight">
                  Detalhe do caixa
                </h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
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
              {isLoading ? 'Carregando...' : cashierDisplayName || '---'}
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
            {formatCurrency(session?.expectedClosingAmount)}
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-3`}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <button
            type="button"
            onClick={() => handleSetMovementFilter({
              label: 'Recebimentos',
              sqlWhere: `cm."movementType" = ${toSqlLiteral('SETTLEMENT')} AND cm."paymentMethod" IS NOT NULL`,
              predicate: (movement) => movement.movementType === 'SETTLEMENT' && Boolean(movement.paymentMethod),
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
                sqlWhere: `cm."paymentMethod" = ${toSqlLiteral(item.paymentMethod)}`,
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
              sqlWhere: `cm."movementType" = ${toSqlLiteral('SALE_RECEIPT')}`,
              predicate: (movement) => movement.movementType === 'SALE_RECEIPT',
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
                sqlWhere: `cm."movementType" = ${toSqlLiteral('SALE_RECEIPT')} AND cm."paymentMethod" = ${toSqlLiteral(item.paymentMethod)}`,
                predicate: (movement) =>
                  movement.movementType === 'SALE_RECEIPT' &&
                  movement.paymentMethod === item.paymentMethod,
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
              sqlWhere: `cm."movementType" IN (${toSqlLiteral('ENTRY')}, ${toSqlLiteral('EXIT')}, ${toSqlLiteral('ADJUSTMENT')}, ${toSqlLiteral('CUSTOMER_CREDIT_GENERATED')}, ${toSqlLiteral('CUSTOMER_CREDIT_USAGE')})`,
              predicate: (movement) =>
                movement.movementType === 'ENTRY' ||
                movement.movementType === 'EXIT' ||
                movement.movementType === 'ADJUSTMENT' ||
                movement.movementType === 'CUSTOMER_CREDIT_GENERATED' ||
                movement.movementType === 'CUSTOMER_CREDIT_USAGE',
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
                sqlWhere: item.sqlWhere,
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
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <div className="flex flex-wrap gap-1.5">
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
            <button
              type="button"
              onClick={handleOpenCloseCashSessionModal}
              className="ml-auto rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-sm shadow-blue-900/20 transition hover:bg-blue-800"
            >
              Fechar caixa
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
                <th className="px-4 py-3">Forma</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3 text-right">Cancelamento</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map((movement, index) => {
                const rowTone =
                  index % 2 === 0
                    ? 'bg-blue-50/80 hover:bg-blue-100/80'
                    : 'bg-slate-100/80 hover:bg-slate-200/80';

                return (
                <tr key={movement.id} className={`border-t border-white transition ${rowTone}`}>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {formatDateTimeLabel(movement.occurredAt)}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => handleSetMovementFilter({
                        label: movement.description,
                        sqlWhere: `cm.description = ${toSqlLiteral(movement.description)}`,
                        predicate: (currentMovement) => currentMovement.description === movement.description,
                      })}
                      className="text-left font-semibold text-slate-700 transition hover:text-blue-700 hover:underline"
                    >
                      {movement.description}
                    </button>
                  </td>
                  <td className="px-4 py-4">{getPaymentMethodLabel(movement.paymentMethod)}</td>
                  <td className={`px-4 py-4 font-black ${getMovementAmountTone(movement.direction)}`}>
                    <span className="inline-flex items-center gap-2">
                      <span>{formatCurrency(movement.amount)}</span>
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-black ${
                        isOutgoingMovement(movement.direction)
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                          : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      }`}>
                        {getMovementAmountSign(movement.direction)}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    {canCancelMovement(movement, canceledMovementIds) ? (
                      <button
                        type="button"
                        onClick={() => handleOpenCancelMovementModal(movement)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-100"
                        title={getCancelMovementTitle(movement)}
                      >
                        Cancelar
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-slate-300">---</span>
                    )}
                  </td>
                </tr>
                );
              })}

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
          <div className="relative w-full max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
            <div className="border-b border-blue-100 bg-blue-700 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white">
                    {runtimeContext.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={runtimeContext.logoUrl}
                        alt="Logotipo"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-sm font-black text-slate-900">MS</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">Movimento do caixa</div>
                    <h3 className="mt-1 truncate text-xl font-black text-white">{cashMovementModal.title}</h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isSavingCashMovement) return;
                    setCashMovementConfirmation(null);
                    setCashMovementModal(null);
                  }}
                  className="rounded-full bg-white/15 px-3 py-2 text-sm font-black text-white shadow-sm hover:bg-white/25"
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
                  onChange={(event) => {
                    setCashMovementConfirmation(null);
                    setCashMovementModal((current) => current ? { ...current, amountInput: event.target.value, feedback: null } : current);
                  }}
                  inputMode="decimal"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="0,00"
                  autoFocus
                />
              </label>

              {cashMovementModal.movementType !== 'ADJUSTMENT' ? (
                <label>
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Confirmar valor</span>
                  <input
                    value={cashMovementModal.confirmAmountInput}
                    onChange={(event) => {
                      setCashMovementConfirmation(null);
                      setCashMovementModal((current) => current ? { ...current, confirmAmountInput: event.target.value, feedback: null } : current);
                    }}
                    inputMode="decimal"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                    placeholder="0,00"
                  />
                </label>
              ) : null}

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Observação</span>
                <textarea
                  value={cashMovementModal.notes}
                  onChange={(event) => setCashMovementModal((current) => current ? { ...current, notes: event.target.value, feedback: null } : current)}
                  className="min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="OBSERVAÇÃO DO LANÇAMENTO"
                />
              </label>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCashMovementConfirmation(null);
                    setCashMovementModal(null);
                  }}
                  disabled={isSavingCashMovement}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRequestSaveCashMovement}
                  disabled={isSavingCashMovement}
                  className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                >
                  {isSavingCashMovement
                    ? 'Salvando...'
                    : cashMovementModal.movementType === 'ADJUSTMENT'
                      ? 'Salvar movimento'
                      : 'Confirmar movimento'}
                </button>
              </div>
            </div>

            {cashMovementConfirmation ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-sm">
                <div className="w-full max-w-sm overflow-hidden rounded-[28px] border border-blue-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.38)]">
                  <div className="bg-blue-700 px-5 py-5 text-white">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-100">
                      Confirmar valor
                    </div>
                    <div className="mt-1 text-xl font-black">
                      {cashMovementModal.title}
                    </div>
                  </div>
                  <div className="px-5 py-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Valor do movimento
                      </div>
                      <div className={`mt-1 text-3xl font-black ${getMovementAmountTone(cashMovementModal.direction)}`}>
                        {formatCurrency(cashMovementConfirmation.amount)}
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setCashMovementConfirmation(null)}
                        disabled={isSavingCashMovement}
                        className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmSaveCashMovement}
                        disabled={isSavingCashMovement}
                        className="rounded-2xl bg-blue-600 px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
                      >
                        {isSavingCashMovement ? 'Salvando...' : 'Confirmar valor'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {cashMovementModal.feedback ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-sm">
                <div className={`w-full max-w-sm overflow-hidden rounded-[28px] border bg-white shadow-[0_24px_70px_rgba(15,23,42,0.38)] ${
                  cashMovementModal.feedback.type === 'success' ? 'border-emerald-200' : 'border-rose-200'
                }`}>
                  <div className={`px-5 py-5 text-white ${
                    cashMovementModal.feedback.type === 'success'
                      ? 'bg-gradient-to-r from-emerald-600 to-cyan-600'
                      : 'bg-gradient-to-r from-rose-600 to-red-600'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-white shadow-md">
                        {runtimeContext.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={runtimeContext.logoUrl}
                            alt="Logotipo"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="text-sm font-black text-slate-900">MS</span>
                        )}
                      </div>
                      <div>
                        <div className={`text-[10px] font-black uppercase tracking-[0.24em] ${
                          cashMovementModal.feedback.type === 'success' ? 'text-emerald-100' : 'text-rose-100'
                        }`}>
                          {cashMovementModal.feedback.type === 'success' ? 'Sucesso' : 'Atenção'}
                        </div>
                        <div className="mt-1 text-xl font-black">
                          {cashMovementModal.feedback.type === 'success' ? 'Movimento lançado' : 'Confira os valores'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-5">
                    <p className="text-sm font-bold leading-6 text-slate-700">
                      {cashMovementModal.feedback.message}
                    </p>
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (cashMovementModal.feedback?.type === 'success') {
                            setCashMovementModal(null);
                            return;
                          }

                          setCashMovementModal((current) => current ? { ...current, feedback: null } : current);
                        }}
                        className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg transition ${
                          cashMovementModal.feedback.type === 'success'
                            ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
                            : 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700'
                        }`}
                      >
                        {cashMovementModal.feedback.type === 'success' ? 'Fechar' : 'Voltar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {cancelMovementModal ? (
        <div className="fixed inset-0 z-[93] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
            <div className="border-b border-slate-100 bg-slate-950 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white">
                    {runtimeContext.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={runtimeContext.logoUrl}
                        alt="Logotipo"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-sm font-black text-slate-900">MS</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                      Cancelamento financeiro
                    </div>
                    <h3 className="mt-1 text-xl font-black">
                      {getCancelMovementTitle(cancelMovementModal.movement)}
                    </h3>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-300">
                      {cancelMovementModal.movement.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isCancelingMovement && setCancelMovementModal(null)}
                  className="rounded-full bg-white/10 px-3 py-2 text-sm font-black text-white hover:bg-white/20"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Valor</div>
                <div className={`mt-1 text-2xl font-black ${getMovementAmountTone(cancelMovementModal.movement.direction)}`}>
                  {formatCurrency(cancelMovementModal.movement.amount)}
                </div>
              </div>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Senha do operador ou supervisor
                </span>
                <input
                  type="password"
                  value={cancelMovementModal.password}
                  onChange={(event) => setCancelMovementModal((current) => current ? { ...current, password: event.target.value, feedback: null } : current)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                  autoFocus
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Motivo
                </span>
                <textarea
                  value={cancelMovementModal.reason}
                  onChange={(event) => setCancelMovementModal((current) => current ? { ...current, reason: event.target.value, feedback: null } : current)}
                  className="min-h-24 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                  placeholder="MOTIVO DO CANCELAMENTO"
                />
              </label>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCancelMovementModal(null)}
                  disabled={isCancelingMovement}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmCancelMovement()}
                  disabled={isCancelingMovement}
                  className="rounded-2xl bg-rose-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
                >
                  {isCancelingMovement ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 border-t border-slate-200 pt-3 text-center text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">
                <span className="min-w-0 truncate">
                  Tela: {CANCEL_MOVEMENT_POPUP_SCREEN_ID}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void copyTextToClipboard(CANCEL_MOVEMENT_POPUP_SCREEN_ID);
                    setPopupAuditScreenId(CANCEL_MOVEMENT_POPUP_SCREEN_ID);
                    setCancelMovementModal((current) => current ? {
                      ...current,
                      feedback: {
                        type: 'success',
                        message: 'Nome da tela copiado.',
                      },
                    } : current);
                  }}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500 transition hover:bg-slate-100"
                  title="Copiar nome da tela"
                >
                  Copiar
                </button>
              </div>
            </div>

            {cancelMovementModal.feedback ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 p-5 backdrop-blur-sm">
                <div className={`w-full max-w-sm overflow-hidden rounded-[26px] border bg-white shadow-[0_24px_70px_rgba(15,23,42,0.35)] ${
                  cancelMovementModal.feedback.type === 'success'
                    ? 'border-emerald-200'
                    : 'border-rose-200'
                }`}>
                  <div className={`px-5 py-4 text-white ${
                    cancelMovementModal.feedback.type === 'success'
                      ? 'bg-emerald-600'
                      : 'bg-rose-600'
                  }`}>
                    {cancelMovementModal.feedback.type === 'success' ? (
                      <>
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">
                          Sucesso
                        </div>
                        <div className="mt-1 text-lg font-black">
                          Operação confirmada
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white">
                          {runtimeContext.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={runtimeContext.logoUrl}
                              alt="Logotipo"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-xs font-black text-slate-900">MS</span>
                          )}
                        </div>
                        <div className="text-lg font-black uppercase tracking-[0.08em]">
                          SENHA INVÁLIDA !!!
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-5 py-5">
                    <p className="text-sm font-bold leading-6 text-slate-700">
                      {cancelMovementModal.feedback.message}
                    </p>
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (cancelMovementModal.feedback?.type === 'success') {
                            setCancelMovementModal(null);
                            return;
                          }

                          setCancelMovementModal((current) => current ? { ...current, feedback: null } : current);
                        }}
                        className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg ${
                          cancelMovementModal.feedback.type === 'success'
                            ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
                            : 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700'
                        }`}
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {closeCashSessionModal ? (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.4)]">
            <div className="border-b border-blue-100 bg-blue-700 px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white">
                    {runtimeContext.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={runtimeContext.logoUrl}
                        alt="Logotipo"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-sm font-black text-slate-900">MS</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                      Fechamento financeiro
                    </div>
                    <h3 className="mt-1 text-xl font-black">Fechar caixa</h3>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-300">
                      {cashierDisplayName || 'OPERADOR DO CAIXA'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelCloseCashSessionModal}
                  className="rounded-full bg-white/15 px-3 py-2 text-sm font-black text-white hover:bg-white/25"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Troco final</div>
                  <div className="mt-1 text-2xl font-black text-slate-900">
                    {formatCurrency(session?.expectedClosingAmount)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Status</div>
                  <div className="mt-1 text-2xl font-black text-emerald-700">ABERTO</div>
                </div>
              </div>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Senha do usuário do caixa
                </span>
                <input
                  type="password"
                  value={closeCashSessionModal.password}
                  onChange={(event) => setCloseCashSessionModal((current) => current ? { ...current, password: event.target.value, feedback: null } : current)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleConfirmCloseCashSession();
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white"
                  autoFocus
                />
              </label>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelCloseCashSessionModal}
                  disabled={isClosingCashSession}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmCloseCashSession()}
                  disabled={isClosingCashSession}
                  className="rounded-2xl bg-blue-700 px-6 py-3 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-lg shadow-blue-900/25 transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-70"
                >
                  {isClosingCashSession ? 'Fechando...' : 'Confirmar fechamento'}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 border-t border-slate-200 pt-3 text-center text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">
                <span className="min-w-0 truncate">
                  Tela: {CLOSE_CASH_SESSION_POPUP_SCREEN_ID}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void copyTextToClipboard(CLOSE_CASH_SESSION_POPUP_SCREEN_ID);
                    setPopupAuditScreenId(CLOSE_CASH_SESSION_POPUP_SCREEN_ID);
                    setCloseCashSessionModal((current) => current ? {
                      ...current,
                      feedback: {
                        type: 'success',
                        message: 'Nome da tela copiado.',
                      },
                    } : current);
                  }}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500 transition hover:bg-slate-100"
                  title="Copiar nome da tela"
                >
                  Copiar
                </button>
              </div>
            </div>

            {closeCashSessionModal.feedback ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 p-5 backdrop-blur-sm">
                <div className={`w-full max-w-sm overflow-hidden rounded-[26px] border bg-white shadow-[0_24px_70px_rgba(15,23,42,0.35)] ${
                  closeCashSessionModal.feedback.type === 'success'
                    ? 'border-emerald-200'
                    : 'border-rose-200'
                }`}>
                  <div className={`px-5 py-4 text-white ${
                    closeCashSessionModal.feedback.type === 'success'
                      ? 'bg-emerald-600'
                      : 'bg-rose-600'
                  }`}>
                    {closeCashSessionModal.feedback.type === 'success' ? (
                      <>
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">
                          Sucesso
                        </div>
                        <div className="mt-1 text-lg font-black">
                          Caixa fechado
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white">
                          {runtimeContext.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={runtimeContext.logoUrl}
                              alt="Logotipo"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-xs font-black text-slate-900">MS</span>
                          )}
                        </div>
                        <div className="text-lg font-black uppercase tracking-[0.08em]">
                          ATENÇÃO !!!
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-5 py-5">
                    <p className="text-sm font-bold leading-6 text-slate-700">
                      {closeCashSessionModal.feedback.message}
                    </p>
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (closeCashSessionModal.feedback?.type === 'success') {
                            requestHostLogoutAfterCashClose();
                            return;
                          }

                          setCloseCashSessionModal((current) => current ? { ...current, feedback: null } : current);
                        }}
                        className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg ${
                          closeCashSessionModal.feedback.type === 'success'
                            ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
                            : 'bg-rose-600 shadow-rose-600/20 hover:bg-rose-700'
                        }`}
                      >
                        OK
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isAuditModalOpen ? (
        <ScreenAuditModal
          screenId={EMBEDDED_SCREEN_ID}
          systemName="Sistema Financeiro"
          originText={SCREEN_ORIGIN_TEXT}
          auditText={auditInfoText}
          sqlText={auditSqlText}
          onClose={() => setIsAuditModalOpen(false)}
        />
      ) : null}
      {popupAuditScreenId ? (
        <ScreenAuditModal
          screenId={popupAuditScreenId}
          systemName="Sistema Financeiro"
          originText="Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/caixa/[sessionId]/page.tsx"
          onClose={() => setPopupAuditScreenId(null)}
        />
      ) : null}
    </div>
  );
}
