'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from '@/app/lib/clipboard';
import ScreenAuditModal from './screen-audit-modal';

const COPY_FEEDBACK_TIMEOUT = 1800;

type CopyStatus = 'idle' | 'copied' | 'error';

type ScreenNameCopyProps = {
  screenId: string;
  label?: string;
  className?: string;
  originText?: string;
  auditText?: string;
  sqlText?: string;
};

type ScreenAuditMetadata = {
  originText?: string;
  auditText?: string;
  sqlText?: string;
};

function buildFinanceOriginText(path: string) {
  return `Origem: Sistema Financeiro - caminho fisico: C:/Sistemas/IA/Financeiro/frontend/src/app/${path}`;
}

const FINANCEIRO_AUDIT_METADATA: Record<string, ScreenAuditMetadata> = {
  FINANCEIRO_DASHBOARD_RESUMO_GERAL: {
    originText: buildFinanceOriginText('components/financeiro-resumo-page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Dashboard consolidado do Financeiro para acompanhar empresas, lotes, parcelas, caixas e recebimentos recentes.

TABELAS PRINCIPAIS:
- companies (CO) - empresas/tenants financeiros resolvidos pelo sistema de origem
- receivable_batches (RB) - lotes de parcelas recebidas das verticais
- receivable_installments (RI) - parcelas financeiras abertas, vencidas ou liquidadas
- cash_sessions (CS) - sessões de caixa abertas/fechadas
- installment_settlements (IS) - baixas liquidadas em caixa

RELACIONAMENTOS:
- receivable_batches.companyId = companies.id
- receivable_installments.companyId = companies.id
- cash_sessions.companyId = companies.id
- installment_settlements.companyId = companies.id
- installment_settlements.installmentId = receivable_installments.id

FILTROS APLICADOS AGORA:
- sourceSystem/sourceTenantId/sourceBranchCode vindos do contexto financeiro quando a tela esta embarcada
- empresas sem cancelamento logico: companies.canceledAt IS NULL
- parcelas abertas: receivable_installments.status = 'OPEN'
- caixas abertos: cash_sessions.status = 'OPEN'
- recebimentos do mes corrente em installment_settlements.settledAt
- ordenacao dos recentes: createdAt/openedAt DESC`,
    sqlText: `SELECT
  CO.id AS companyId,
  CO.name AS companyName,
  COUNT(DISTINCT RB.id) AS batchCount,
  COUNT(DISTINCT CASE WHEN RI.status = 'OPEN' THEN RI.id END) AS openInstallmentCount,
  SUM(CASE WHEN RI.status = 'OPEN' THEN RI.amount ELSE 0 END) AS openInstallmentAmount,
  COUNT(DISTINCT CASE WHEN CS.status = 'OPEN' THEN CS.id END) AS openCashSessionCount,
  SUM(CASE WHEN date(IS.settledAt) >= date('now', 'start of month') THEN IS.receivedAmount ELSE 0 END) AS settledAmountThisMonth
FROM companies CO
LEFT JOIN receivable_batches RB
  ON RB.companyId = CO.id
 AND RB.canceledAt IS NULL
LEFT JOIN receivable_installments RI
  ON RI.companyId = CO.id
 AND RI.canceledAt IS NULL
LEFT JOIN cash_sessions CS
  ON CS.companyId = CO.id
 AND CS.canceledAt IS NULL
LEFT JOIN installment_settlements IS
  ON IS.companyId = CO.id
 AND IS.canceledAt IS NULL
WHERE CO.canceledAt IS NULL
  AND (:sourceSystem IS NULL OR CO.sourceSystem = :sourceSystem)
  AND (:sourceTenantId IS NULL OR CO.sourceTenantId = :sourceTenantId)
GROUP BY CO.id, CO.name
ORDER BY CO.name ASC;`,
  },
  FINANCEIRO_RETORNOS_BANCARIOS_LISTAGEM: {
    originText: buildFinanceOriginText('recebiveis/retornos/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Tela de listagem/importacao de retornos bancarios do contas a receber.

TABELAS PRINCIPAIS:
- companies (CO) - empresa financeira resolvida pelo contexto
- bank_accounts (BA) - contas bancarias ativas para importacao
- bank_return_imports (BRI) - importacoes de retorno bancario ja realizadas

RELACIONAMENTOS:
- bank_accounts.companyId = companies.id
- bank_return_imports.companyId = companies.id
- bank_return_imports.bankAccountId = bank_accounts.id

FILTROS APLICADOS AGORA:
- empresa resolvida por sourceSystem/sourceTenantId
- banco selecionado para nova importacao quando informado na tela
- periodo inicial/final digitado para importar retorno
- contas bancarias ativas: bank_accounts.status = 'ACTIVE'
- importacoes sem cancelamento logico
- ordenacao atual: createdAt DESC`,
    sqlText: `SELECT
  BRI.id,
  BRI.provider,
  BRI.status,
  BRI.periodStart,
  BRI.periodEnd,
  BRI.importedItemCount,
  BRI.matchedItemCount,
  BRI.liquidatedItemCount,
  BA.bankName,
  BA.branchNumber,
  BA.accountNumber,
  BRI.createdAt
FROM bank_return_imports BRI
INNER JOIN companies CO
  ON CO.id = BRI.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN bank_accounts BA
  ON BA.id = BRI.bankAccountId
 AND BA.companyId = BRI.companyId
 AND BA.canceledAt IS NULL
WHERE BRI.canceledAt IS NULL
  AND (:sourceSystem IS NULL OR CO.sourceSystem = :sourceSystem)
  AND (:sourceTenantId IS NULL OR CO.sourceTenantId = :sourceTenantId)
ORDER BY BRI.createdAt DESC;`,
  },
  PRINCIPAL_FINANCEIRO_BANCOS_EXTRATO: {
    originText: buildFinanceOriginText('bancos/extrato/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Tela de extrato bancario aberta a partir do grid de bancos.

TABELAS PRINCIPAIS:
- companies (CO) - empresa financeira resolvida pelo contexto da Escola
- bank_accounts (BA) - conta bancaria selecionada para consulta do extrato

RELACIONAMENTOS:
- bank_accounts.companyId = companies.id

FILTROS APLICADOS AGORA:
- empresa por sourceSystem/sourceTenantId
- banco selecionado por bankAccountId
- periodo digitado para consultar extrato bancario
- registros sem cancelamento logico
- endpoint real usado na acao: GET /banks/:bankId/statement
- ordenacao bancaria retornada pela API Sicoob`,
    sqlText: `SELECT
  BA.id,
  BA.bankCode,
  BA.bankName,
  BA.branchNumber,
  BA.branchDigit,
  BA.accountNumber,
  BA.accountDigit,
  BA.billingProvider,
  BA.status,
  BA.updatedAt
FROM bank_accounts BA
INNER JOIN companies CO
  ON CO.id = BA.companyId
 AND CO.canceledAt IS NULL
WHERE BA.canceledAt IS NULL
  AND BA.status = 'ACTIVE'
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:bankAccountId IS NULL OR BA.id = :bankAccountId)
ORDER BY BA.bankName ASC, BA.branchNumber ASC, BA.accountNumber ASC;`,
  },
  PRINCIPAL_FINANCEIRO_BANCOS_MOVIMENTOS_ABERTOS: {
    originText: buildFinanceOriginText('bancos/movimentos-abertos/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Tela de movimentos em aberto para conferencia/conciliacao bancaria.

TABELAS PRINCIPAIS:
- companies (CO) - empresa financeira resolvida pelo contexto da Escola
- bank_accounts (BA) - banco selecionado no grid
- receivable_installments (RI) - parcelas recebidas vinculadas a banco
- receivable_titles (RT) - titulo financeiro da parcela

RELACIONAMENTOS:
- receivable_installments.companyId = companies.id
- receivable_installments.bankAccountId = bank_accounts.id
- receivable_installments.titleId = receivable_titles.id

FILTROS APLICADOS AGORA:
- empresa por sourceSystem/sourceTenantId
- parcelas pagas com banco vinculado
- banco selecionado por bankAccountId quando informado
- busca por pagador, historico ou parcela
- registros sem cancelamento logico
- ordenacao atual: dueDate ASC`,
    sqlText: `SELECT
  RI.id,
  RI.settledAt,
  RI.descriptionSnapshot,
  RI.payerNameSnapshot,
  RI.paidAmount,
  RI.settlementMethod,
  RI.bankAccountId,
  RI.bankAccountLabel,
  RT.businessKey,
  BA.bankName
FROM receivable_installments RI
INNER JOIN companies CO
  ON CO.id = RI.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN receivable_titles RT
  ON RT.id = RI.titleId
 AND RT.companyId = RI.companyId
 AND RT.canceledAt IS NULL
LEFT JOIN bank_accounts BA
  ON BA.id = RI.bankAccountId
 AND BA.companyId = RI.companyId
 AND BA.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
  AND RI.status = 'PAID'
  AND RI.bankAccountId IS NOT NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:bankAccountId IS NULL OR RI.bankAccountId = :bankAccountId)
ORDER BY RI.dueDate ASC, RI.createdAt ASC;`,
  },
  FINANCEIRO_RETORNOS_BANCARIOS_DETALHE: {
    originText: buildFinanceOriginText('recebiveis/retornos/[importId]/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Detalhe do retorno bancario para conferir titulos encontrados, divergencias e baixas prontas para aplicar.

TABELAS PRINCIPAIS:
- bank_return_imports (BRI) - cabecalho da importacao
- bank_return_import_items (BRII) - movimentos/linhas do retorno
- receivable_installments (RI) - parcelas localizadas para baixa
- bank_accounts (BA) - conta bancaria do retorno

RELACIONAMENTOS:
- bank_return_import_items.importId = bank_return_imports.id
- bank_return_import_items.matchedInstallmentId = receivable_installments.id
- bank_return_imports.bankAccountId = bank_accounts.id

FILTROS APLICADOS AGORA:
- importacao aberta na rota (:importId)
- empresa resolvida por sourceSystem/sourceTenantId
- itens sem cancelamento logico
- ordenacao atual: dueDate/paymentDate ASC`,
    sqlText: `SELECT
  BRI.id AS importId,
  BRI.status AS importStatus,
  BRII.id AS itemId,
  BRII.movementStatus,
  BRII.dueDate,
  BRII.paymentDate,
  BRII.settledAmount,
  BRII.yourNumber,
  RI.id AS receivableInstallmentId,
  RI.status AS installmentStatus,
  BA.bankName
FROM bank_return_imports BRI
INNER JOIN bank_return_import_items BRII
  ON BRII.importId = BRI.id
 AND BRII.canceledAt IS NULL
LEFT JOIN receivable_installments RI
  ON RI.id = BRII.matchedInstallmentId
 AND RI.companyId = BRII.companyId
 AND RI.canceledAt IS NULL
LEFT JOIN bank_accounts BA
  ON BA.id = BRI.bankAccountId
 AND BA.companyId = BRI.companyId
 AND BA.canceledAt IS NULL
WHERE BRI.id = :importId
  AND BRI.canceledAt IS NULL
ORDER BY BRII.dueDate ASC, BRII.paymentDate ASC;`,
  },
  FINANCEIRO_RECEBIVEIS_HISTORICO_BAIXAS: {
    originText: buildFinanceOriginText('recebiveis/historico-baixas/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Tela de historico de baixas do contas a receber, agrupando baixas feitas em conjunto.

TABELAS PRINCIPAIS:
- installment_settlements (IS) - baixas registradas nas parcelas
- receivable_installments (RI) - parcelas financeiras baixadas
- cash_sessions (CS) - caixa usado na baixa

RELACIONAMENTOS:
- installment_settlements.installmentId = receivable_installments.id
- installment_settlements.cashSessionId = cash_sessions.id

FILTROS APLICADOS AGORA:
- empresa resolvida por sourceSystem/sourceTenantId
- status ativo/estornado no rodape do grid
- pesquisa geral e filtros por coluna
- ordenacao inicial: settledAt DESC`,
    sqlText: `SELECT
  COALESCE(IS.settlementGroupId, IS.id) AS settlementGroupId,
  MAX(IS.settledAt) AS settledAt,
  SUM(IS.receivedAmount) AS receivedAmount,
  COUNT(IS.id) AS installmentCount,
  CS.cashierDisplayName,
  RI.payerNameSnapshot
FROM installment_settlements IS
INNER JOIN receivable_installments RI
  ON RI.id = IS.installmentId
 AND RI.companyId = IS.companyId
INNER JOIN cash_sessions CS
  ON CS.id = IS.cashSessionId
 AND CS.companyId = IS.companyId
WHERE IS.companyId = :companyId
GROUP BY COALESCE(IS.settlementGroupId, IS.id), CS.cashierDisplayName, RI.payerNameSnapshot
ORDER BY MAX(IS.settledAt) DESC;`,
  },
  POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_BAIXAS_DETALHE: {
    originText: buildFinanceOriginText('recebiveis/historico-baixas/page.tsx'),
    auditText: 'Popup de detalhe das parcelas vinculadas a uma baixa agrupada.',
    sqlText: `SELECT IS.*, RI.descriptionSnapshot, RI.dueDate
FROM installment_settlements IS
INNER JOIN receivable_installments RI
  ON RI.id = IS.installmentId
WHERE COALESCE(IS.settlementGroupId, IS.id) = :settlementGroupId
ORDER BY RI.dueDate ASC;`,
  },
  POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_BAIXAS_ESTORNO: {
    originText: buildFinanceOriginText('recebiveis/historico-baixas/page.tsx'),
    auditText: 'Popup de confirmacao para estornar uma baixa ativa ou um grupo de baixas.',
    sqlText: `UPDATE installment_settlements
SET canceledAt = CURRENT_TIMESTAMP
WHERE COALESCE(settlementGroupId, id) = :settlementGroupId
  AND canceledAt IS NULL;`,
  },
  FINANCEIRO_RECEBIVEIS_HISTORICO_CLIENTE: {
    originText: buildFinanceOriginText('recebiveis/historico-cliente/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Tela de historico financeiro por cliente no contas a receber.

TABELAS PRINCIPAIS:
- receivable_titles (RT) - compras/vendas do cliente, exibidas uma vez mesmo quando parceladas
- receivable_installments (RI) - parcelas abertas e baixadas
- installment_settlements (IS) - baixas das parcelas com juros, multa e desconto

FILTROS APLICADOS AGORA:
- empresa por sourceSystem/sourceTenantId
- pesquisa por cliente/documento
- filtros por coluna e ordenacao do grid
- valores em atraso calculados sobre parcelas abertas vencidas`,
    sqlText: `SELECT
  RI.payerNameSnapshot,
  SUM(RI.amount) AS totalPurchaseAmount,
  SUM(RI.openAmount) AS openAmount,
  MIN(RT.createdAt) AS firstPurchaseDate,
  MAX(IS.settledAt) AS lastPaymentDate
FROM receivable_installments RI
INNER JOIN receivable_titles RT
  ON RT.id = RI.titleId
 AND RT.companyId = RI.companyId
LEFT JOIN installment_settlements IS
  ON IS.installmentId = RI.id
 AND IS.companyId = RI.companyId
 AND IS.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
GROUP BY RI.payerNameSnapshot
ORDER BY RI.payerNameSnapshot ASC;`,
  },
  PRINCIPAL_FINANCEIRO_HISTORICO_CLIENTE: {
    originText: buildFinanceOriginText('recebiveis/historico-cliente/page.tsx'),
  },
  POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_CLIENTE_VENDAS: {
    originText: buildFinanceOriginText('recebiveis/historico-cliente/page.tsx'),
    auditText: 'Popup que lista as compras/vendas do cliente agrupadas por titulo financeiro.',
  },
  POPUP_FINANCEIRO_RECEBIVEIS_HISTORICO_CLIENTE_PARCELAS: {
    originText: buildFinanceOriginText('recebiveis/historico-cliente/page.tsx'),
    auditText: 'Popup que lista parcelas abertas e baixadas do cliente, incluindo juros pagos e juros em aberto.',
  },
  FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL: {
    originText: buildFinanceOriginText('recebiveis/baixa-manual/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Tela para selecionar parcelas em aberto e realizar baixa manual em uma sessao de caixa.

TABELAS PRINCIPAIS:
- receivable_installments (RI) - parcelas em aberto para baixa
- receivable_titles (RT) - titulo financeiro da parcela
- parties (PA) - pagador/aluno/cliente vinculado ao titulo
- cash_sessions (CS) - caixa usado para registrar a baixa
- installment_settlements (IS) - baixa gerada ao confirmar pagamento

RELACIONAMENTOS:
- receivable_installments.titleId = receivable_titles.id
- receivable_titles.payerPartyId = parties.id
- installment_settlements.installmentId = receivable_installments.id
- installment_settlements.cashSessionId = cash_sessions.id

FILTROS APLICADOS AGORA:
- empresa resolvida por sourceSystem/sourceTenantId
- parcelas em aberto: receivable_installments.status = 'OPEN'
- busca e selecao aplicadas na propria tela
- caixa aberto quando a baixa e confirmada
- ordenacao atual: dueDate ASC`,
    sqlText: `SELECT
  RI.id,
  RI.dueDate,
  RI.amount,
  RI.status,
  RT.businessKey,
  RT.description,
  PA.name AS payerName,
  CS.id AS openCashSessionId,
  CS.status AS cashStatus
FROM receivable_installments RI
INNER JOIN receivable_titles RT
  ON RT.id = RI.titleId
 AND RT.companyId = RI.companyId
 AND RT.canceledAt IS NULL
LEFT JOIN parties PA
  ON PA.id = RT.payerPartyId
 AND PA.companyId = RT.companyId
 AND PA.canceledAt IS NULL
LEFT JOIN cash_sessions CS
  ON CS.companyId = RI.companyId
 AND CS.status = 'OPEN'
 AND CS.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
  AND RI.status = 'OPEN'
  AND (:companyId IS NULL OR RI.companyId = :companyId)
ORDER BY RI.dueDate ASC, PA.name ASC;`,
  },
  POPUP_FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_PIX_SICOOB_QRCODE: {
    originText: buildFinanceOriginText('recebiveis/baixa-manual/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Popup do QR Code PIX Sicoob para recebimento de parcelas.

TABELAS PRINCIPAIS:
- receivable_pix_intents (RPI) - intencao PIX, txid, valor e confirmacao bancaria
- receivable_installments (RI) - parcelas autorizadas para a intencao
- installment_settlements (IS) - baixas aplicadas somente apos o PIX pago

REGRAS:
- isolamento por empresa, filial e tenant
- somente status PAID ou APPLIED permite baixar
- valor acumulado das baixas nao pode superar o PIX confirmado
- uma intencao pertence a um unico settlementGroupId`,
  },
  FINANCEIRO_RECEBIVEIS_BAIXA_MANUAL_SUCESSO: {
    originText: buildFinanceOriginText('recebiveis/baixa-manual/page.tsx'),
    auditText: `--- LOGICA DA TELA ---
Popup de sucesso da baixa manual, exibindo o resultado da liquidacao feita no caixa.

TABELAS PRINCIPAIS:
- installment_settlements (IS) - baixa manual registrada
- receivable_installments (RI) - parcela liquidada
- cash_sessions (CS) - caixa que recebeu a baixa

RELACIONAMENTOS:
- installment_settlements.installmentId = receivable_installments.id
- installment_settlements.cashSessionId = cash_sessions.id

FILTROS APLICADOS AGORA:
- baixa recem-confirmada na operacao atual
- empresa do contexto financeiro
- ordenacao: nao aplicavel ao popup`,
    sqlText: `SELECT
  IS.id,
  IS.installmentId,
  IS.cashSessionId,
  IS.receivedAmount,
  IS.paymentMethod,
  IS.settledAt,
  RI.status AS installmentStatus,
  CS.status AS cashStatus
FROM installment_settlements IS
INNER JOIN receivable_installments RI
  ON RI.id = IS.installmentId
 AND RI.companyId = IS.companyId
INNER JOIN cash_sessions CS
  ON CS.id = IS.cashSessionId
 AND CS.companyId = IS.companyId
WHERE IS.id = :settlementId
  AND IS.canceledAt IS NULL
LIMIT 1;`,
  },
  PRINCIPAL_FINANCEIRO_ESTOQUE: {
    originText: buildFinanceOriginText('estoque/page.tsx'),
    sqlText: `SELECT
  CO.id AS companyId,
  CO.name AS companyName,
  CB.branchCode,
  CB.name AS branchName,
  CB.inventoryControlType,
  CB.quantityPrecision,
  COUNT(DISTINCT PR.id) AS productCount,
  COUNT(DISTINCT PSB.id) AS stockBalanceCount
FROM companies CO
LEFT JOIN company_branches CB
  ON CB.companyId = CO.id
 AND CB.canceledAt IS NULL
LEFT JOIN products PR
  ON PR.companyId = CO.id
 AND PR.canceledAt IS NULL
LEFT JOIN product_stock_balances PSB
  ON PSB.companyId = CO.id
 AND PSB.productId = PR.id
 AND PSB.canceledAt IS NULL
WHERE CO.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
  AND (:sourceBranchCode IS NULL OR CB.branchCode = :sourceBranchCode)
GROUP BY CO.id, CO.name, CB.branchCode, CB.name, CB.inventoryControlType, CB.quantityPrecision;`,
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR: {
    originText: buildFinanceOriginText('contas-a-pagar/page.tsx'),
    sqlText: `SELECT
  CO.id AS companyId,
  CO.name AS companyName,
  COUNT(DISTINCT PII.id) AS importedInvoices,
  COUNT(DISTINCT CASE WHEN PII.status = 'PENDING_APPROVAL' THEN PII.id END) AS pendingApproval,
  COUNT(DISTINCT PT.id) AS payableTitles,
  COUNT(DISTINCT PI.id) AS payableInstallments
FROM companies CO
LEFT JOIN payable_invoice_imports PII
  ON PII.companyId = CO.id
 AND PII.canceledAt IS NULL
LEFT JOIN payable_titles PT
  ON PT.companyId = CO.id
 AND PT.canceledAt IS NULL
LEFT JOIN payable_installments PI
  ON PI.companyId = CO.id
 AND PI.canceledAt IS NULL
WHERE CO.canceledAt IS NULL
  AND CO.sourceSystem = :sourceSystem
  AND CO.sourceTenantId = :sourceTenantId
GROUP BY CO.id, CO.name;`,
  },
  PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS_MANUAL: {
    originText: buildFinanceOriginText('contas-a-pagar/importacao-notas/manual/page.tsx'),
    sqlText: `SELECT
  PII.id,
  PII.status,
  PII.invoiceNumber,
  PII.series,
  PII.issueDate,
  PII.totalInvoiceAmount,
  SU.legalName AS supplierName,
  COUNT(DISTINCT PIIT.id) AS itemCount,
  COUNT(DISTINCT PIIN.id) AS installmentCount
FROM payable_invoice_imports PII
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
 AND SU.companyId = PII.companyId
LEFT JOIN payable_invoice_import_items PIIT
  ON PIIT.invoiceImportId = PII.id
 AND PIIT.canceledAt IS NULL
LEFT JOIN payable_invoice_import_installments PIIN
  ON PIIN.invoiceImportId = PII.id
 AND PIIN.canceledAt IS NULL
WHERE PII.companyId = :companyId
  AND PII.canceledAt IS NULL
GROUP BY PII.id, PII.status, PII.invoiceNumber, PII.series, PII.issueDate, PII.totalInvoiceAmount, SU.legalName
ORDER BY PII.createdAt DESC;`,
  },
};

function getScreenAuditMetadata(screenId: string) {
  const normalizedScreenId = String(screenId || '').trim().toUpperCase();
  return FINANCEIRO_AUDIT_METADATA[normalizedScreenId] || null;
}

export default function ScreenNameCopy({
  screenId,
  label = 'Tela',
  className = '',
  originText,
  auditText,
  sqlText,
}: ScreenNameCopyProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auditMetadata = getScreenAuditMetadata(screenId);
  const effectiveOriginText = originText || auditMetadata?.originText;
  const effectiveAuditText = auditText || auditMetadata?.auditText;
  const effectiveSqlText = sqlText || auditMetadata?.sqlText;

  const resetStatus = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setStatus('idle'), COPY_FEEDBACK_TIMEOUT);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      const copied = await copyTextToClipboard(screenId);
      setStatus(copied ? 'copied' : 'error');
      setIsAuditOpen(true);
    } catch {
      setStatus('error');
      setIsAuditOpen(true);
    } finally {
      resetStatus();
    }
  }, [resetStatus, screenId]);

  return (
    <>
      <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 ${className}`}>
        <span className="flex-1 truncate">
          {label}:{' '}
          <span className="font-normal text-[10px] tracking-[0.35em] text-slate-500">{screenId}</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          title="Copiar nome da tela e abrir lógica usada"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
        <span className="min-w-[48px] text-[9px] font-semibold uppercase tracking-[0.4em] text-emerald-600">
          {status === 'copied' ? 'COPIADO' : status === 'error' ? 'FALHA' : ''}
        </span>
      </div>

      {isAuditOpen ? (
        <ScreenAuditModal
          screenId={screenId}
          systemName="Sistema Financeiro"
          originText={effectiveOriginText}
          auditText={effectiveAuditText}
          sqlText={effectiveSqlText}
          onClose={() => setIsAuditOpen(false)}
        />
      ) : null}
    </>
  );
}
