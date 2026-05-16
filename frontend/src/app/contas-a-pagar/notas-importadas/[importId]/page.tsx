'use client';

import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import {
  formatCurrency,
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import type {
  ApprovalItemState,
  PayableInvoiceImportDetail,
  PayableInvoiceImportInstallment,
  ProductOption,
} from '../../payables-types';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_APROVACAO_NOTA';
const INSTALLMENT_POPUP_SCREEN_ID =
  'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_APROVACAO_NOTA_DUPLICATA';

const auditText = `--- LOGICA DA TELA ---
Esta tela aprova a nota já importada no contas a pagar do Financeiro.

TABELAS PRINCIPAIS:
- payable_invoice_imports (PII) - nota importada aguardando aprovação.
- payable_invoice_import_items (PIIT) - itens aprovados com vínculo em produto.
- payable_invoice_import_installments (PIIN) - duplicatas lidas do XML.
- payable_titles (PT) - título gerado ao aprovar.
- payable_installments (PINST) - parcelas do contas a pagar criadas na aprovação.
- products (PR) - produto existente ou criado na aprovação.
- stock_movements (SM) - entrada de estoque gerada na aprovação.

RELACIONAMENTOS:
- payable_invoice_import_items.productId -> products.id
- payable_titles.sourceDocumentId -> payable_invoice_imports.id
- payable_installments.titleId -> payable_titles.id
- stock_movements.sourceImportId -> payable_invoice_imports.id
- stock_movements.sourceImportItemId -> payable_invoice_import_items.id

METRICAS / CAMPOS EXIBIDOS:
- fornecedor, emissão e valor da nota
- duplicatas importadas
- itens com ação de aprovação
- parcelas geradas no contas a pagar
- movimentos de estoque gerados

FILTROS APLICADOS:
- company resolvida por sourceSystem + sourceTenantId
- produto existente listado apenas para o tenant atual

ORDENACAO:
- itens por lineNumber asc
- duplicatas por installmentNumber asc
- movimentos por occurredAt asc`;

const installmentPopupAuditText = `--- LOGICA DO POPUP ---
Este popup ajusta uma duplicata importada antes da aprovação final da nota.

TABELAS PRINCIPAIS:
- payable_invoice_import_installments (PIIN) - duplicata importada da nota.
- payable_invoice_imports (PII) - cabeçalho da nota de entrada.
- payable_installments (PINST) - parcela final gerada após aprovação.

CAMPOS AJUSTADOS:
- dueDate
- originalAmount
- additionAmount
- discountAmount
- finalAmount
- status
- paymentMethod
- settledAt
- notes`;

const installmentPopupSqlText = `SELECT
  PIIN.id,
  PIIN.installmentNumber,
  PIIN.installmentLabel,
  PIIN.dueDate,
  PIIN.originalAmount,
  PIIN.additionAmount,
  PIIN.discountAmount,
  PIIN.finalAmount,
  PIIN.status,
  PIIN.paymentMethod,
  PIIN.settledAt,
  PIIN.notes
FROM payable_invoice_import_installments PIIN
INNER JOIN payable_invoice_imports PII ON PII.id = PIIN.invoiceImportId
WHERE PIIN.invoiceImportId = :importId
  AND PIIN.canceledAt IS NULL
ORDER BY PIIN.installmentNumber ASC

UPDATE payable_invoice_import_installments
SET dueDate = :dueDate,
    originalAmount = :originalAmount,
    additionAmount = :additionAmount,
    discountAmount = :discountAmount,
    finalAmount = :finalAmount,
    amount = :finalAmount,
    status = :status,
    paymentMethod = :paymentMethod,
    settledAt = :settledAt,
    notes = :notes,
    updatedBy = :requestedBy
WHERE id = :installmentId;`;

type InstallmentPaymentMethod =
  | 'CASH'
  | 'PIX'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'CHECK';

type InstallmentEditorState = {
  installmentId: string;
  dueDate: string;
  status: 'OPEN' | 'PAID';
  paymentMethod: InstallmentPaymentMethod | '';
  settledAt: string;
  additionAmountInput: string;
  discountAmountInput: string;
  notes: string;
};

const INSTALLMENT_PAYMENT_METHOD_OPTIONS: Array<{
  value: InstallmentPaymentMethod;
  label: string;
}> = [
  { value: 'CASH', label: 'DINHEIRO' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CREDIT_CARD', label: 'CARTÃO CRÉDITO' },
  { value: 'DEBIT_CARD', label: 'CARTÃO DÉBITO' },
  { value: 'CHECK', label: 'CHEQUE' },
];

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parseMoneyInput(value: string) {
  const normalized = String(value || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();

  if (!normalized) return 0;

  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatMoneyInput(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateInput(value?: string | null) {
  if (!value) return '';

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toISOString().slice(0, 10);
}

function buildInstallmentEditorState(
  installment: PayableInvoiceImportInstallment,
): InstallmentEditorState {
  return {
    installmentId: installment.id,
    dueDate: formatDateInput(installment.dueDate),
    status: installment.status === 'PAID' ? 'PAID' : 'OPEN',
    paymentMethod:
      installment.status === 'PAID'
        ? ((installment.paymentMethod as InstallmentPaymentMethod | null) || '')
        : '',
    settledAt: formatDateInput(installment.settledAt || installment.dueDate),
    additionAmountInput: formatMoneyInput(installment.additionAmount || 0),
    discountAmountInput: formatMoneyInput(installment.discountAmount || 0),
    notes: installment.notes || '',
  };
}

function buildInitialApprovalState(item: PayableInvoiceImportDetail['items'][number]): ApprovalItemState {
  return {
    action: item.approvalAction || 'IGNORE_STOCK',
    productId: item.productId || '',
    productName: item.productName || item.description,
    internalCode: item.supplierItemCode || '',
    sku: '',
    barcode: item.barcode || '',
    unitCode: item.unitCode || 'UN',
    productType: 'GOODS',
    tracksInventory: item.productTracksInventory ?? false,
    allowFraction: false,
    minimumStock: '0',
    notes: '',
  };
}

export default function FinanceiroAprovacaoNotaPage() {
  const params = useParams<{ importId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runtimeContext = useFinanceRuntimeContext();
  const [resolvedImportId, setResolvedImportId] = useState('');
  const [detail, setDetail] = useState<PayableInvoiceImportDetail | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalItems, setApprovalItems] = useState<Record<string, ApprovalItemState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingInstallment, setSavingInstallment] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [installmentSuccessMessage, setInstallmentSuccessMessage] =
    useState<string | null>(null);
  const [editingInstallment, setEditingInstallment] =
    useState<InstallmentEditorState | null>(null);

  const loadPageData = useCallback(async () => {
    if (!hydrated) {
      return;
    }

    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setErrorMessage(
        'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
      );
      setLoading(false);
      return;
    }

    if (!resolvedImportId) {
      setErrorMessage(
        'A aprovação da nota foi aberta sem o identificador da importação.',
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const importQueryString = buildFinanceApiQueryString(runtimeContext);
      const productsQueryString = buildFinanceApiQueryString(runtimeContext, {
        status: 'ACTIVE',
      });

      const [detailResponse, productsResponse] = await Promise.all([
        getJson<PayableInvoiceImportDetail>(
          `/payables/invoice-imports/${resolvedImportId}${importQueryString}`,
        ),
        getJson<ProductOption[]>(`/products${productsQueryString}`),
      ]);

      setDetail(detailResponse);
      setProducts(productsResponse);
      setApprovalNotes(detailResponse.approvalNotes || '');
      setApprovalItems(
        detailResponse.items.reduce<Record<string, ApprovalItemState>>((accumulator, item) => {
          accumulator[item.id] = buildInitialApprovalState(item);
          return accumulator;
        }, {}),
      );
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar os dados da nota importada.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [hydrated, resolvedImportId, runtimeContext]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const directParam = String(params?.importId || '').trim();
    const queryImportId =
      String(searchParams?.get('importId') || '').trim() ||
      String(new URLSearchParams(window.location.search).get('importId') || '').trim();

    const pathSegments = String(window.location.pathname || pathname || '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] || '';

    const pathImportId =
      lastSegment &&
      lastSegment.toLowerCase() !== 'notas-importadas' &&
      lastSegment.toLowerCase() !== 'contas-a-pagar'
        ? lastSegment
        : '';

    setResolvedImportId(directParam || queryImportId || pathImportId || '');
  }, [params?.importId, pathname, searchParams]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') {
      return;
    }

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  const updateApprovalItem = useCallback(
    (itemId: string, patch: Partial<ApprovalItemState>) => {
      setApprovalItems((current) => ({
        ...current,
        [itemId]: {
          ...current[itemId],
          ...patch,
        },
      }));
    },
    [],
  );

  const handleApprove = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !detail) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await requestJson<PayableInvoiceImportDetail & { message?: string }>(
        `/payables/invoice-imports/${detail.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy: runtimeContext.cashierDisplayName || runtimeContext.userRole || 'OPERADOR',
            approvalNotes,
            items: detail.items.map((item) => {
              const current = approvalItems[item.id] || buildInitialApprovalState(item);
              return {
                itemId: item.id,
                action: current.action,
                productId: current.action === 'LINK_EXISTING' ? current.productId : undefined,
                productName: current.action === 'CREATE_PRODUCT' ? current.productName : undefined,
                internalCode: current.action === 'CREATE_PRODUCT' ? current.internalCode : undefined,
                sku: current.action === 'CREATE_PRODUCT' ? current.sku : undefined,
                barcode: current.action === 'CREATE_PRODUCT' ? current.barcode : undefined,
                unitCode: current.action === 'CREATE_PRODUCT' ? current.unitCode : undefined,
                productType: current.action === 'CREATE_PRODUCT' ? current.productType : undefined,
                tracksInventory: current.action === 'CREATE_PRODUCT' ? current.tracksInventory : undefined,
                allowFraction: current.action === 'CREATE_PRODUCT' ? current.allowFraction : undefined,
                minimumStock:
                  current.action === 'CREATE_PRODUCT'
                    ? Number(current.minimumStock.replace(',', '.') || '0')
                    : undefined,
                notes: current.action === 'CREATE_PRODUCT' ? current.notes : undefined,
              };
            }),
          }),
          fallbackMessage:
            'Não foi possível aprovar a nota e gerar o estoque com as duplicatas.',
        },
      );

      setDetail(response);
      setApprovalNotes(response.approvalNotes || '');
      setApprovalItems(
        response.items.reduce<Record<string, ApprovalItemState>>((accumulator, item) => {
          accumulator[item.id] = buildInitialApprovalState(item);
          return accumulator;
        }, {}),
      );
      setSuccessMessage(
        response.message ||
          'Nota aprovada com sucesso. Estoque e duplicatas foram gerados.',
      );
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível aprovar a nota e gerar o estoque com as duplicatas.',
        ),
      );
    } finally {
      setSaving(false);
    }
  }, [approvalItems, approvalNotes, detail, runtimeContext]);

  const productOptions = useMemo(() => {
    return products
      .filter((item) => item.status === 'ACTIVE')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [products]);

  const selectedInstallment = useMemo(() => {
    if (!detail || !editingInstallment) {
      return null;
    }

    return (
      detail.installments.find(
        (installment) => installment.id === editingInstallment.installmentId,
      ) || null
    );
  }, [detail, editingInstallment]);

  const editedInstallmentFinalAmount = useMemo(() => {
    if (!selectedInstallment || !editingInstallment) {
      return 0;
    }

    return roundMoney(
      Number(selectedInstallment.originalAmount || 0) +
        parseMoneyInput(editingInstallment.additionAmountInput) -
        parseMoneyInput(editingInstallment.discountAmountInput),
    );
  }, [editingInstallment, selectedInstallment]);

  const openInstallmentEditor = useCallback(
    (installment: PayableInvoiceImportInstallment) => {
      setInstallmentSuccessMessage(null);
      setEditingInstallment(buildInstallmentEditorState(installment));
    },
    [],
  );

  const closeInstallmentEditor = useCallback(() => {
    setInstallmentSuccessMessage(null);
    setEditingInstallment(null);
  }, []);

  const handleAcknowledgeInstallmentSave = useCallback(() => {
    setInstallmentSuccessMessage(null);
    setEditingInstallment(null);
  }, []);

  const handleSaveInstallment = useCallback(async () => {
    if (
      !detail ||
      !editingInstallment ||
      !selectedInstallment ||
      !runtimeContext.sourceSystem ||
      !runtimeContext.sourceTenantId
    ) {
      return;
    }

    const additionAmount = parseMoneyInput(editingInstallment.additionAmountInput);
    const discountAmount = parseMoneyInput(editingInstallment.discountAmountInput);
    const finalAmount = roundMoney(
      Number(selectedInstallment.originalAmount || 0) +
        additionAmount -
        discountAmount,
    );

    if (finalAmount <= 0) {
      setErrorMessage('O valor final da duplicata precisa ser maior que zero.');
      return;
    }

    if (
      editingInstallment.status === 'PAID' &&
      !String(editingInstallment.paymentMethod || '').trim()
    ) {
      setErrorMessage('Selecione o meio de pagamento para baixar a duplicata.');
      return;
    }

    setSavingInstallment(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setInstallmentSuccessMessage(null);

    try {
      const response = await requestJson<PayableInvoiceImportDetail & { message?: string }>(
        `/payables/invoice-imports/${detail.id}/installments`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy:
              runtimeContext.cashierDisplayName ||
              runtimeContext.userRole ||
              'OPERADOR',
            installments: detail.installments.map((installment) => {
              const isCurrent = installment.id === selectedInstallment.id;
              const status = isCurrent
                ? editingInstallment.status
                : installment.status === 'PAID'
                  ? 'PAID'
                  : 'OPEN';

              return {
                id: installment.id,
                installmentLabel: installment.installmentLabel,
                dueDate: isCurrent
                  ? editingInstallment.dueDate
                  : formatDateInput(installment.dueDate),
                amount: installment.originalAmount,
                additionAmount: isCurrent
                  ? additionAmount
                  : installment.additionAmount || 0,
                discountAmount: isCurrent
                  ? discountAmount
                  : installment.discountAmount || 0,
                status,
                paymentMethod:
                  status === 'PAID'
                    ? isCurrent
                      ? editingInstallment.paymentMethod || undefined
                      : installment.paymentMethod || undefined
                    : undefined,
                settledAt:
                  status === 'PAID'
                    ? isCurrent
                      ? editingInstallment.settledAt || editingInstallment.dueDate
                      : formatDateInput(
                          installment.settledAt || installment.dueDate,
                        ) || formatDateInput(installment.dueDate)
                    : undefined,
                notes: isCurrent ? editingInstallment.notes : installment.notes || undefined,
              };
            }),
          }),
          fallbackMessage: 'Não foi possível atualizar a duplicata da nota.',
        },
      );

      setDetail(response);
      setInstallmentSuccessMessage(
        response.message ||
          'Duplicata atualizada com sucesso. Clique para voltar à nota.',
      );
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível atualizar a duplicata da nota.',
        ),
      );
    } finally {
      setSavingInstallment(false);
    }
  }, [detail, editingInstallment, runtimeContext, selectedInstallment]);

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={FINANCE_GRID_PAGE_LAYOUT.card}>
        {loading ? (
          <div className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
            Carregando dados da nota importada...
          </div>
        ) : detail ? (
          <div className="grid gap-6 p-6">
            <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-slate-200 bg-white/95 px-6 pt-6 pb-4 shadow-sm backdrop-blur">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
                    Contas a pagar
                  </div>
                  <h1 className="mt-1 text-2xl font-black text-slate-900">Aprovação da Nota</h1>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    Confira os itens, decida o vínculo com produtos e conclua a entrada no estoque com as duplicatas.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {detail.status !== 'APPROVED' ? (
                    <button
                      type="button"
                      onClick={() => void handleApprove()}
                      disabled={saving}
                      className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
                    >
                      {saving ? 'Aprovando...' : 'Aprovar Nota'}
                    </button>
                  ) : (
                    <div className="flex items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
                      {`Aprovada em ${formatDateLabel(detail.approvedAt || null)}`}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 xl:col-span-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Nota fiscal</div>
                  <div className="mt-1 text-xl font-black text-slate-900">
                    NF-e {detail.invoiceNumber}
                    {detail.series ? ` / Série ${detail.series}` : ''}
                  </div>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {detail.accessKey}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Fornecedor</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{detail.supplierName || '---'}</div>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{detail.supplierDocument || 'SEM DOCUMENTO'}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Emissão</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{formatDateLabel(detail.issueDate)}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Valor total</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{formatCurrency(detail.totalInvoiceAmount)}</div>
                </div>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                  Duplicatas importadas
                </div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Clique em uma duplicata para ajustar vencimento, baixa e valor final
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {detail.installments.map((installment) => (
                  <button
                    key={installment.id}
                    type="button"
                    onClick={() => openInstallmentEditor(installment)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
                  >
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Duplicata {installment.installmentNumber}
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-900">
                      {installment.installmentLabel || 'SEM RÓTULO'}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-600">
                      Vencimento: {formatDateLabel(installment.dueDate)}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-600">
                      Valor original: {formatCurrency(installment.originalAmount)}
                    </div>
                    {(installment.additionAmount || 0) > 0 ? (
                      <div className="mt-1 text-sm font-semibold text-rose-600">
                        Acréscimo: {formatCurrency(installment.additionAmount)}
                      </div>
                    ) : null}
                    {(installment.discountAmount || 0) > 0 ? (
                      <div className="mt-1 text-sm font-semibold text-emerald-600">
                        Desconto: {formatCurrency(installment.discountAmount)}
                      </div>
                    ) : null}
                    <div className="mt-1 text-sm font-semibold text-slate-600">
                      Valor final: {formatCurrency(installment.finalAmount)}
                    </div>
                    <div
                      className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                        installment.status === 'PAID'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                      }`}
                    >
                      {installment.status === 'PAID' ? 'PARCELA PAGA' : 'PARCELA ABERTA'}
                    </div>
                    {installment.notes ? (
                      <div className="mt-3 text-xs font-semibold text-slate-500">
                        Obs.: {installment.notes}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                    Itens e vínculo com produto
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-500">
                    Defina se cada item vai para um produto existente, cria um novo cadastro ou fica sem controle de estoque.
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {detail.items.map((item) => {
                  const approvalState =
                    approvalItems[item.id] || buildInitialApprovalState(item);

                  return (
                    <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                            Item {item.lineNumber}
                          </div>
                          <div className="mt-1 text-lg font-black text-slate-900">{item.description}</div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <span>Cód. fornecedor: {item.supplierItemCode || '---'}</span>
                            <span>EAN: {item.barcode || '---'}</span>
                            <span>Un.: {item.unitCode || 'UN'}</span>
                            <span>Qtd.: {item.quantity}</span>
                            <span>Vl. unit.: {formatCurrency(item.unitPrice)}</span>
                            <span>Vl. total: {formatCurrency(item.totalPrice)}</span>
                          </div>
                        </div>

                        <div className="grid gap-4">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                              Ação na aprovação
                            </span>
                            <select
                              value={approvalState.action}
                              onChange={(event) =>
                                updateApprovalItem(item.id, {
                                  action: event.target.value as ApprovalItemState['action'],
                                })
                              }
                              disabled={detail.status === 'APPROVED'}
                              className={FINANCE_GRID_PAGE_LAYOUT.input}
                            >
                              <option value="LINK_EXISTING">VINCULAR PRODUTO EXISTENTE</option>
                              <option value="CREATE_PRODUCT">CRIAR NOVO PRODUTO</option>
                              <option value="IGNORE_STOCK">SEM CONTROLE DE ESTOQUE</option>
                            </select>
                          </label>

                          {approvalState.action === 'LINK_EXISTING' ? (
                            <label className="block">
                              <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                Produto existente
                              </span>
                              <select
                                value={approvalState.productId}
                                onChange={(event) =>
                                  updateApprovalItem(item.id, { productId: event.target.value })
                                }
                                disabled={detail.status === 'APPROVED'}
                                className={FINANCE_GRID_PAGE_LAYOUT.input}
                              >
                                <option value="">SELECIONE UM PRODUTO</option>
                                {productOptions.map((product) => (
                                  <option key={product.id} value={product.id}>
                                    {product.name}
                                    {product.internalCode ? ` - ${product.internalCode}` : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}

                          {approvalState.action === 'CREATE_PRODUCT' ? (
                            <div className="grid gap-4 md:grid-cols-2">
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                  Nome do produto
                                </span>
                                <input
                                  value={approvalState.productName}
                                  onChange={(event) =>
                                    updateApprovalItem(item.id, { productName: event.target.value })
                                  }
                                  disabled={detail.status === 'APPROVED'}
                                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                                />
                              </label>

                              <label className="block">
                                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                  Código interno
                                </span>
                                <input
                                  value={approvalState.internalCode}
                                  onChange={(event) =>
                                    updateApprovalItem(item.id, { internalCode: event.target.value })
                                  }
                                  disabled={detail.status === 'APPROVED'}
                                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                                />
                              </label>

                              <label className="block">
                                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                  Código de barras
                                </span>
                                <input
                                  value={approvalState.barcode}
                                  onChange={(event) =>
                                    updateApprovalItem(item.id, { barcode: event.target.value })
                                  }
                                  disabled={detail.status === 'APPROVED'}
                                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                                />
                              </label>

                              <label className="block">
                                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                                  Unidade
                                </span>
                                <input
                                  value={approvalState.unitCode}
                                  onChange={(event) =>
                                    updateApprovalItem(item.id, { unitCode: event.target.value })
                                  }
                                  disabled={detail.status === 'APPROVED'}
                                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                Observações da aprovação
              </div>
              <textarea
                value={approvalNotes}
                onChange={(event) => setApprovalNotes(event.target.value)}
                disabled={detail.status === 'APPROVED'}
                className="min-h-28 w-full rounded-3xl border border-slate-300 bg-white px-4 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                placeholder="OBSERVAÇÕES INTERNAS DA APROVAÇÃO..."
              />
            </section>

            {detail.payableTitle ? (
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-emerald-700">
                  Duplicatas geradas no contas a pagar
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {detail.payableTitle.installments.map((installment) => (
                    <div key={installment.id} className="rounded-2xl border border-emerald-200 bg-white px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">
                        Parcela {installment.installmentNumber}/{installment.installmentCount}
                      </div>
                      <div className="mt-1 text-sm font-black text-slate-900">
                        {formatCurrency(installment.amount)}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-600">
                        Vencimento: {formatDateLabel(installment.dueDate)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.stockMovements.length ? (
              <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
                <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-blue-700">
                  Entradas de estoque geradas
                </div>
                <div className="space-y-3">
                  {detail.stockMovements.map((movement) => (
                    <div key={movement.id} className="rounded-2xl border border-blue-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-900">
                          {movement.productName || 'PRODUTO'}
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {formatDateLabel(movement.occurredAt)}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
                        <span>Entrada: {movement.quantity}</span>
                        <span>Anterior: {movement.previousStock}</span>
                        <span>Resultante: {movement.resultingStock}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <ScreenNameCopy
                screenId={SCREEN_ID}
                className="justify-end"
                originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/notas-importadas/[importId]/page.tsx"
                auditText={auditText}
              />
            </section>

            <AuditedPopupShell
              isOpen={Boolean(editingInstallment && selectedInstallment)}
              screenId={INSTALLMENT_POPUP_SCREEN_ID}
              eyebrow="Duplicata importada"
              title={
                selectedInstallment
                  ? `Duplicata ${selectedInstallment.installmentNumber}`
                  : 'Duplicata'
              }
              description="Ajuste o vencimento, os acréscimos, os descontos e defina se a duplicata permanece em aberto ou já sai baixada."
              brandingName={runtimeContext.companyName || 'FINANCEIRO'}
              logoUrl={runtimeContext.logoUrl}
              originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/notas-importadas/[importId]/page.tsx"
              auditText={installmentPopupAuditText}
              sqlText={installmentPopupSqlText}
              onClose={closeInstallmentEditor}
              panelClassName="max-w-[1120px]"
              bodyClassName="overflow-y-auto pb-2"
              footerActions={
                <>
                  <button
                    type="button"
                    onClick={closeInstallmentEditor}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-600 shadow-sm transition hover:bg-slate-50"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveInstallment()}
                    disabled={
                      savingInstallment ||
                      detail.status === 'APPROVED' ||
                      Boolean(installmentSuccessMessage)
                    }
                    className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
                  >
                    {savingInstallment ? 'Salvando...' : 'Salvar duplicata'}
                  </button>
                </>
              }
            >
              {selectedInstallment && editingInstallment ? (
                <div className="relative grid gap-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Valor original
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-900">
                        {formatCurrency(selectedInstallment.originalAmount)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Valor final
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-900">
                        {formatCurrency(editedInstallmentFinalAmount)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Situação
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-900">
                        {editingInstallment.status === 'PAID' ? 'FECHADA' : 'EM ABERTO'}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Data de vencimento
                      </span>
                      <input
                        type="date"
                        value={editingInstallment.dueDate}
                        onChange={(event) =>
                          setEditingInstallment((current) =>
                            current
                              ? {
                                  ...current,
                                  dueDate: event.target.value,
                                  settledAt:
                                    current.status === 'PAID' &&
                                    !current.settledAt
                                      ? event.target.value
                                      : current.settledAt,
                                }
                              : current,
                          )
                        }
                        disabled={detail.status === 'APPROVED'}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Situação da duplicata
                      </span>
                      <select
                        value={editingInstallment.status}
                        onChange={(event) =>
                          setEditingInstallment((current) =>
                            current
                              ? {
                                  ...current,
                                  status: event.target.value as 'OPEN' | 'PAID',
                                  paymentMethod:
                                    event.target.value === 'PAID'
                                      ? current.paymentMethod
                                      : '',
                                  settledAt:
                                    event.target.value === 'PAID'
                                      ? current.settledAt || current.dueDate
                                      : '',
                                }
                              : current,
                          )
                        }
                        disabled={detail.status === 'APPROVED'}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="OPEN">EM ABERTO</option>
                        <option value="PAID">JÁ BAIXADA</option>
                      </select>
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Acréscimos
                      </span>
                      <input
                        value={editingInstallment.additionAmountInput}
                        onChange={(event) =>
                          setEditingInstallment((current) =>
                            current
                              ? {
                                  ...current,
                                  additionAmountInput: event.target.value,
                                }
                              : current,
                          )
                        }
                        disabled={detail.status === 'APPROVED'}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                        placeholder="0,00"
                      />
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Descontos
                      </span>
                      <input
                        value={editingInstallment.discountAmountInput}
                        onChange={(event) =>
                          setEditingInstallment((current) =>
                            current
                              ? {
                                  ...current,
                                  discountAmountInput: event.target.value,
                                }
                              : current,
                          )
                        }
                        disabled={detail.status === 'APPROVED'}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                        placeholder="0,00"
                      />
                    </label>
                  </div>

                  {editingInstallment.status === 'PAID' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                          Meio de pagamento
                        </span>
                        <select
                          value={editingInstallment.paymentMethod}
                          onChange={(event) =>
                            setEditingInstallment((current) =>
                              current
                                ? {
                                    ...current,
                                    paymentMethod: event.target
                                      .value as InstallmentPaymentMethod,
                                  }
                                : current,
                            )
                          }
                          disabled={detail.status === 'APPROVED'}
                          className={FINANCE_GRID_PAGE_LAYOUT.input}
                        >
                          <option value="">SELECIONE O MEIO DE PAGAMENTO</option>
                          {INSTALLMENT_PAYMENT_METHOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                          Data da baixa
                        </span>
                        <input
                          type="date"
                          value={editingInstallment.settledAt}
                          onChange={(event) =>
                            setEditingInstallment((current) =>
                              current
                                ? {
                                    ...current,
                                    settledAt: event.target.value,
                                  }
                                : current,
                            )
                          }
                          disabled={detail.status === 'APPROVED'}
                          className={FINANCE_GRID_PAGE_LAYOUT.input}
                        />
                      </label>
                    </div>
                  ) : null}

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                      Observação da duplicata
                    </span>
                    <textarea
                      value={editingInstallment.notes}
                      onChange={(event) =>
                        setEditingInstallment((current) =>
                          current
                            ? {
                                ...current,
                                notes: event.target.value,
                              }
                            : current,
                        )
                      }
                      disabled={detail.status === 'APPROVED'}
                      className="min-h-20 w-full rounded-3xl border border-slate-300 bg-white px-4 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      placeholder="OBSERVAÇÃO ESPECÍFICA DESTA DUPLICATA..."
                    />
                  </label>

                  {installmentSuccessMessage ? (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-slate-950/35 px-4 backdrop-blur-sm">
                      <div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-2xl">
                        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600">
                          Duplicata salva
                        </div>
                        <div className="mt-3 text-lg font-black text-slate-900">
                          {installmentSuccessMessage}
                        </div>
                        <div className="mt-2 text-sm font-medium text-slate-500">
                          Ao confirmar, você volta para a tela chamadora.
                        </div>
                        <div className="mt-6 flex justify-center">
                          <button
                            type="button"
                            onClick={handleAcknowledgeInstallmentSave}
                            className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
                          >
                            Confirmar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                </div>
              ) : null}
            </AuditedPopupShell>
          </div>
        ) : (
          <div className="px-6 py-10">
            <div
              className={`rounded-2xl px-4 py-4 text-center text-sm font-semibold ${
                errorMessage
                  ? 'border border-rose-200 bg-rose-50 text-rose-700'
                  : 'text-slate-500'
              }`}
            >
              {errorMessage || 'Nenhum dado encontrado para esta nota.'}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
