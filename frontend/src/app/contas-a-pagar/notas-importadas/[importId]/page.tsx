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
const PRODUCT_POPUP_SCREEN_ID =
  'POPUP_PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_APROVACAO_NOTA_PRODUTO_NOVO';

type ApprovalActionPreset = Exclude<ApprovalItemState['action'], ''>;

const APPROVAL_ACTION_PRESETS: Array<{
  action: ApprovalActionPreset;
  label: string;
}> = [
  { action: 'LINK_EXISTING', label: 'Vincular' },
  { action: 'IGNORE_STOCK', label: 'Sem estoque' },
];

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

FILTROS APLICADOS AGORA:
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

const productPopupAuditText = `--- LOGICA DO POPUP ---
Este popup concentra as informacoes do produto novo que sera criado ao aprovar a nota.

TABELAS PRINCIPAIS:
- payable_invoice_import_items (PIIT) - item da nota importada.
- products (PR) - produto criado durante a aprovacao.
- stock_movements (SM) - entrada de estoque vinculada ao item aprovado.

CAMPOS AJUSTADOS:
- nome do produto
- codigo interno
- codigo de barras
- unidade
- parametros de estoque por produto quando a filial estiver configurada para tratar por produto`;

const productPopupSqlText = `SELECT
  PIIT.id,
  PIIT.lineNumber,
  PIIT.description,
  PIIT.supplierItemCode,
  PIIT.barcode,
  PIIT.unitCode,
  PIIT.quantity,
  PIIT.totalPrice
FROM payable_invoice_import_items PIIT
WHERE PIIT.invoiceImportId = :importId
  AND PIIT.id = :itemId
  AND PIIT.canceledAt IS NULL;

-- Na aprovacao da nota:
INSERT INTO products (
  companyId,
  name,
  internalCode,
  barcode,
  unitCode,
  tracksInventory,
  allowFraction,
  usesLotControl,
  usesExpirationControl,
  usesColorSize,
  allowsNegativeStock,
  createdBy
) VALUES (
  :companyId,
  :productName,
  :internalCode,
  :barcode,
  :unitCode,
  :tracksInventory,
  :allowFraction,
  :usesLotControl,
  :usesExpirationControl,
  :usesColorSize,
  :allowsNegativeStock,
  :requestedBy
);`;

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

function normalizeBarcodeValue(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function findProductByBarcode(products: ProductOption[], barcode?: string | null) {
  const normalizedBarcode = normalizeBarcodeValue(barcode);
  if (!normalizedBarcode) {
    return null;
  }

  return (
    products.find(
      (product) => normalizeBarcodeValue(product.barcode) === normalizedBarcode,
    ) || null
  );
}

function quantityAllowsFraction(quantity?: number | null) {
  const normalized = Number(quantity || 0);
  return Number.isFinite(normalized) && !Number.isInteger(normalized);
}

function hasProductStockParameters(runtimeContext: ReturnType<typeof useFinanceRuntimeContext>) {
  return (
    runtimeContext.stockControlMode === 'BY_PRODUCT' ||
    runtimeContext.stockIntegerQuantityMode === 'BY_PRODUCT' ||
    runtimeContext.stockLotControlMode === 'BY_PRODUCT' ||
    runtimeContext.stockExpirationControlMode === 'BY_PRODUCT' ||
    runtimeContext.stockGridControlMode === 'BY_PRODUCT' ||
    runtimeContext.stockNegativeControlMode === 'BY_PRODUCT'
  );
}

function stockParameterButtonClass(active: boolean, disabled = false) {
  const activeClass = active
    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
    : 'border-rose-300 bg-rose-50 text-rose-800';
  const disabledClass = disabled ? 'opacity-55' : 'hover:border-blue-300 hover:bg-blue-50';

  return `rounded-3xl border px-4 py-4 text-left transition ${activeClass} ${disabledClass}`;
}

function approvalActionButtonClass(
  action: ApprovalItemState['action'],
  selectedAction: ApprovalItemState['action'],
  disabled = false,
) {
  const selected = action === selectedAction;
  const disabledClass = disabled ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5';

  if (action === 'CREATE_PRODUCT') {
    return `rounded-3xl border px-4 py-3 text-center text-xs font-black uppercase tracking-[0.16em] shadow-sm transition ${disabledClass} ${
      selected
        ? 'border-emerald-600 bg-emerald-500 text-white shadow-emerald-100 ring-4 ring-emerald-100'
        : 'border-emerald-200 bg-emerald-100 text-emerald-800'
    }`;
  }

  if (action === 'LINK_EXISTING') {
    return `rounded-3xl border px-4 py-3 text-center text-xs font-black uppercase tracking-[0.16em] shadow-sm transition ${disabledClass} ${
      selected
        ? 'border-blue-600 bg-blue-500 text-white shadow-blue-100 ring-4 ring-blue-100'
        : 'border-blue-200 bg-blue-50 text-blue-800'
    }`;
  }

  return `rounded-3xl border px-4 py-3 text-center text-xs font-black uppercase tracking-[0.16em] shadow-sm transition ${disabledClass} ${
    selected
      ? 'border-amber-500 bg-amber-400 text-slate-950 shadow-amber-100 ring-4 ring-amber-100'
      : 'border-amber-200 bg-amber-50 text-amber-800'
  }`;
}

function approvalActionCompactButtonClass(
  action: ApprovalItemState['action'],
  selectedAction: ApprovalItemState['action'],
  disabled = false,
) {
  const selected = action === selectedAction;
  const disabledClass = disabled ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-px';
  const baseClass =
    'inline-flex h-8 min-w-[92px] items-center justify-center whitespace-nowrap rounded-full border px-2 text-center text-[10px] font-black uppercase tracking-[0.12em] shadow-sm transition';

  if (action === 'CREATE_PRODUCT') {
    return `${baseClass} ${disabledClass} ${
      selected
        ? 'border-emerald-600 bg-emerald-500 text-white shadow-emerald-100'
        : 'border-emerald-200 bg-emerald-100 text-emerald-800'
    }`;
  }

  if (action === 'LINK_EXISTING') {
    return `${baseClass} ${disabledClass} ${
      selected
        ? 'border-blue-600 bg-blue-500 text-white shadow-blue-100'
        : 'border-blue-200 bg-blue-50 text-blue-800'
    }`;
  }

  return `${baseClass} ${disabledClass} ${
    selected
      ? 'border-amber-500 bg-amber-400 text-slate-950 shadow-amber-100'
      : 'border-amber-200 bg-amber-50 text-amber-800'
  }`;
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

function buildInitialApprovalState(
  item: PayableInvoiceImportDetail['items'][number],
  existingBarcodeProduct?: ProductOption | null,
): ApprovalItemState {
  const savedAction = item.approvalAction || (item.productId ? 'LINK_EXISTING' : '');
  const initialAction =
    existingBarcodeProduct && savedAction === 'CREATE_PRODUCT'
      ? 'LINK_EXISTING'
      : savedAction;

  return {
    action: initialAction,
    productId: item.productId || existingBarcodeProduct?.id || '',
    productName: item.productName || existingBarcodeProduct?.name || item.description,
    internalCode: item.draftInternalCode || item.supplierItemCode || '',
    sku: item.draftSku || '',
    barcode: item.draftBarcode || item.barcode || '',
    unitCode: item.draftUnitCode || item.unitCode || 'UN',
    productType: item.draftProductType || 'GOODS',
    tracksInventory:
      item.draftTracksInventory ??
      item.productTracksInventory ??
      item.tracksInventory ??
      true,
    allowFraction: item.draftAllowFraction ?? quantityAllowsFraction(item.quantity),
    usesLotControl: item.draftUsesLotControl ?? false,
    usesExpirationControl: item.draftUsesExpirationControl ?? false,
    usesColorSize: item.draftUsesColorSize ?? false,
    allowsNegativeStock: item.draftAllowsNegativeStock ?? false,
    minimumStock: String(item.draftMinimumStock ?? 0),
    notes: item.draftNotes || '',
  };
}

function buildApprovalItemsState(
  detail: PayableInvoiceImportDetail,
  products: ProductOption[],
): Record<string, ApprovalItemState> {
  return detail.items.reduce<Record<string, ApprovalItemState>>((accumulator, item) => {
    accumulator[item.id] = buildInitialApprovalState(
      item,
      findProductByBarcode(products, item.barcode),
    );
    return accumulator;
  }, {});
}

function getNextApprovalAction(
  currentAction: ApprovalItemState['action'],
  action: ApprovalItemState['action'],
) {
  return currentAction === action ? '' : action;
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
  const [savingProduct, setSavingProduct] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [installmentSuccessMessage, setInstallmentSuccessMessage] =
    useState<string | null>(null);
  const [editingInstallment, setEditingInstallment] =
    useState<InstallmentEditorState | null>(null);
  const [editingProductItemId, setEditingProductItemId] = useState<string | null>(null);
  const [activeApprovalTab, setActiveApprovalTab] = useState<'overview' | 'products'>(
    'overview',
  );
  const [selectedApprovalPreset, setSelectedApprovalPreset] =
    useState<ApprovalItemState['action']>('');
  const [appliedApprovalPreset, setAppliedApprovalPreset] =
    useState<ApprovalItemState['action']>('');

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
      setApprovalItems(buildApprovalItemsState(detailResponse, productsResponse));
      setSelectedApprovalPreset('');
      setAppliedApprovalPreset('');
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

  const toggleApprovalAction = useCallback(
    (
      item: PayableInvoiceImportDetail['items'][number],
      action: ApprovalItemState['action'],
      existingBarcodeProduct?: ProductOption | null,
    ) => {
      setApprovalItems((current) => {
        const currentState =
          current[item.id] || buildInitialApprovalState(item, existingBarcodeProduct);
        const nextAction = getNextApprovalAction(currentState.action, action);

        return {
          ...current,
          [item.id]: {
            ...buildInitialApprovalState(item, existingBarcodeProduct),
            ...currentState,
            action: nextAction,
            productId:
              nextAction === 'LINK_EXISTING'
                ? currentState.productId || existingBarcodeProduct?.id || ''
                : '',
          },
        };
      });
    },
    [],
  );

  const saveItemApprovalDraft = useCallback(
    async (
      item: PayableInvoiceImportDetail['items'][number],
      state: ApprovalItemState,
      action: ApprovalItemState['action'],
    ) => {
      if (!detail || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
        return null;
      }

      const response = await requestJson<PayableInvoiceImportDetail & { message?: string }>(
        `/payables/invoice-imports/${detail.id}/items/${item.id}/approval-draft`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy: runtimeContext.cashierDisplayName || runtimeContext.userRole || 'OPERADOR',
            action,
            productId: action === 'LINK_EXISTING' ? state.productId : undefined,
            productName: action === 'CREATE_PRODUCT' ? state.productName : undefined,
            internalCode: action === 'CREATE_PRODUCT' ? state.internalCode : undefined,
            sku: action === 'CREATE_PRODUCT' ? state.sku : undefined,
            barcode: action === 'CREATE_PRODUCT' ? state.barcode : undefined,
            unitCode: action === 'CREATE_PRODUCT' ? state.unitCode : undefined,
            productType: action === 'CREATE_PRODUCT' ? state.productType : undefined,
            tracksInventory:
              action === 'CREATE_PRODUCT' ? state.tracksInventory : undefined,
            allowFraction: action === 'CREATE_PRODUCT' ? state.allowFraction : undefined,
            usesLotControl:
              action === 'CREATE_PRODUCT' ? state.usesLotControl : undefined,
            usesExpirationControl:
              action === 'CREATE_PRODUCT' ? state.usesExpirationControl : undefined,
            usesColorSize: action === 'CREATE_PRODUCT' ? state.usesColorSize : undefined,
            allowsNegativeStock:
              action === 'CREATE_PRODUCT' ? state.allowsNegativeStock : undefined,
            minimumStock:
              action === 'CREATE_PRODUCT'
                ? Number(state.minimumStock.replace(',', '.') || '0')
                : undefined,
            notes: action === 'CREATE_PRODUCT' ? state.notes : undefined,
          }),
          fallbackMessage: 'Não foi possível salvar a conferência do produto.',
        },
      );

      setDetail(response);
      setApprovalNotes(response.approvalNotes || '');
      setApprovalItems(buildApprovalItemsState(response, products));

      return response;
    },
    [detail, products, runtimeContext],
  );

  const handleToggleApprovalAction = useCallback(
    (
      item: PayableInvoiceImportDetail['items'][number],
      action: ApprovalItemState['action'],
      existingBarcodeProduct?: ProductOption | null,
    ) => {
      const currentState =
        approvalItems[item.id] || buildInitialApprovalState(item, existingBarcodeProduct);
      const nextAction = getNextApprovalAction(currentState.action, action);
      const nextState: ApprovalItemState = {
        ...buildInitialApprovalState(item, existingBarcodeProduct),
        ...currentState,
        action: nextAction,
        productId:
          nextAction === 'LINK_EXISTING'
            ? currentState.productId || existingBarcodeProduct?.id || ''
            : '',
      };

      toggleApprovalAction(item, action, existingBarcodeProduct);

      if (nextAction === '' || nextAction === 'IGNORE_STOCK') {
        void saveItemApprovalDraft(item, nextState, nextAction).catch((error) => {
          setErrorMessage(
            getFriendlyRequestErrorMessage(
              error,
              'Não foi possível salvar a conferência do produto.',
            ),
          );
        });
      }
    },
    [approvalItems, saveItemApprovalDraft, toggleApprovalAction],
  );

  const applyApprovalPresetToItems = useCallback(
    (action: ApprovalActionPreset) => {
      if (!detail || detail.status === 'APPROVED') {
        return;
      }

      setApprovalItems((current) =>
        detail.items.reduce<Record<string, ApprovalItemState>>((accumulator, item) => {
          const existingBarcodeProduct = findProductByBarcode(products, item.barcode);
          const currentState =
            current[item.id] || buildInitialApprovalState(item, existingBarcodeProduct);
          const nextAction =
            action === 'CREATE_PRODUCT' && existingBarcodeProduct
              ? 'LINK_EXISTING'
              : action;

          accumulator[item.id] = {
            ...buildInitialApprovalState(item, existingBarcodeProduct),
            ...currentState,
            action: nextAction,
            productId:
              nextAction === 'LINK_EXISTING'
                ? currentState.productId || existingBarcodeProduct?.id || ''
                : '',
            productName:
              nextAction === 'CREATE_PRODUCT'
                ? currentState.productName || item.description
                : currentState.productName,
          };

          return accumulator;
        }, {}),
      );
      setEditingProductItemId(null);
    },
    [detail, products],
  );

  const handleApprovalPresetClick = useCallback(
    (action: ApprovalActionPreset) => {
      const nextAction = selectedApprovalPreset === action ? '' : action;

      setSelectedApprovalPreset(nextAction);
      setAppliedApprovalPreset('');

      if (nextAction && activeApprovalTab === 'products') {
        applyApprovalPresetToItems(nextAction);
        setAppliedApprovalPreset(nextAction);
      }
    },
    [activeApprovalTab, applyApprovalPresetToItems, selectedApprovalPreset],
  );

  const handleOpenProductsTab = useCallback(() => {
    setActiveApprovalTab('products');

    if (selectedApprovalPreset && appliedApprovalPreset !== selectedApprovalPreset) {
      applyApprovalPresetToItems(selectedApprovalPreset);
      setAppliedApprovalPreset(selectedApprovalPreset);
    }
  }, [appliedApprovalPreset, applyApprovalPresetToItems, selectedApprovalPreset]);

  const handleApprove = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !detail) {
      return;
    }

    const pendingItems = detail.items.filter((item) => {
      const existingBarcodeProduct = findProductByBarcode(products, item.barcode);
      const current =
        approvalItems[item.id] || buildInitialApprovalState(item, existingBarcodeProduct);
      const action =
        existingBarcodeProduct && current.action === 'CREATE_PRODUCT'
          ? 'LINK_EXISTING'
          : current.action;

      if (!action) {
        return true;
      }

      if (action === 'LINK_EXISTING') {
        return !current.productId && !existingBarcodeProduct?.id;
      }

      if (action === 'CREATE_PRODUCT') {
        return !String(current.productName || '').trim();
      }

      return false;
    });

    if (pendingItems.length) {
      setActiveApprovalTab('products');
      setErrorMessage(
        `Configure todos os produtos antes de aprovar a nota. Item pendente: ${pendingItems[0].lineNumber}.`,
      );
      setSuccessMessage(null);
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
            sourceBranchCode: runtimeContext.sourceBranchCode,
            stockControlMode: runtimeContext.stockControlMode,
            stockIntegerQuantityMode: runtimeContext.stockIntegerQuantityMode,
            stockLotControlMode: runtimeContext.stockLotControlMode,
            stockExpirationControlMode: runtimeContext.stockExpirationControlMode,
            stockGridControlMode: runtimeContext.stockGridControlMode,
            stockNegativeControlMode: runtimeContext.stockNegativeControlMode,
            requestedBy: runtimeContext.cashierDisplayName || runtimeContext.userRole || 'OPERADOR',
            approvalNotes,
            items: detail.items.map((item) => {
              const existingBarcodeProduct = findProductByBarcode(products, item.barcode);
              const current =
                approvalItems[item.id] ||
                buildInitialApprovalState(item, existingBarcodeProduct);
              const action =
                existingBarcodeProduct && current.action === 'CREATE_PRODUCT'
                  ? 'LINK_EXISTING'
                  : current.action;

              return {
                itemId: item.id,
                action,
                productId:
                  action === 'LINK_EXISTING'
                    ? current.productId || existingBarcodeProduct?.id
                    : undefined,
                productName: action === 'CREATE_PRODUCT' ? current.productName : undefined,
                internalCode: action === 'CREATE_PRODUCT' ? current.internalCode : undefined,
                sku: action === 'CREATE_PRODUCT' ? current.sku : undefined,
                barcode: action === 'CREATE_PRODUCT' ? current.barcode : undefined,
                unitCode: action === 'CREATE_PRODUCT' ? current.unitCode : undefined,
                productType: action === 'CREATE_PRODUCT' ? current.productType : undefined,
                tracksInventory: action === 'CREATE_PRODUCT' ? current.tracksInventory : undefined,
                allowFraction: action === 'CREATE_PRODUCT' ? current.allowFraction : undefined,
                usesLotControl: action === 'CREATE_PRODUCT' ? current.usesLotControl : undefined,
                usesExpirationControl:
                  action === 'CREATE_PRODUCT' ? current.usesExpirationControl : undefined,
                usesColorSize: action === 'CREATE_PRODUCT' ? current.usesColorSize : undefined,
                allowsNegativeStock:
                  action === 'CREATE_PRODUCT' ? current.allowsNegativeStock : undefined,
                minimumStock:
                  action === 'CREATE_PRODUCT'
                    ? Number(current.minimumStock.replace(',', '.') || '0')
                    : undefined,
                notes: action === 'CREATE_PRODUCT' ? current.notes : undefined,
              };
            }),
          }),
          fallbackMessage:
            'Não foi possível aprovar a nota e gerar o estoque com as duplicatas.',
        },
      );

      setDetail(response);
      setApprovalNotes(response.approvalNotes || '');
      setApprovalItems(buildApprovalItemsState(response, products));
      setEditingProductItemId(null);
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
  }, [approvalItems, approvalNotes, detail, products, runtimeContext]);

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

  const selectedProductItem = useMemo(() => {
    if (!detail || !editingProductItemId) {
      return null;
    }

    return detail.items.find((item) => item.id === editingProductItemId) || null;
  }, [detail, editingProductItemId]);

  const selectedProductApprovalState = selectedProductItem
    ? approvalItems[selectedProductItem.id] ||
      buildInitialApprovalState(
        selectedProductItem,
        findProductByBarcode(productOptions, selectedProductItem.barcode),
      )
    : null;

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

  const openProductEditor = useCallback(
    (item: PayableInvoiceImportDetail['items'][number]) => {
      const existingBarcodeProduct = findProductByBarcode(products, item.barcode);

      if (existingBarcodeProduct) {
        setApprovalItems((current) => ({
          ...current,
          [item.id]: {
            ...buildInitialApprovalState(item, existingBarcodeProduct),
            ...current[item.id],
            action: 'LINK_EXISTING',
            productId: current[item.id]?.productId || existingBarcodeProduct.id,
          },
        }));
        setEditingProductItemId(null);
        return;
      }

      setApprovalItems((current) => ({
        ...current,
        [item.id]: {
          ...buildInitialApprovalState(item),
          ...current[item.id],
          action: 'CREATE_PRODUCT',
        },
      }));
      setEditingProductItemId(item.id);
    },
    [products],
  );

  const toggleCreateProductAction = useCallback(
    (item: PayableInvoiceImportDetail['items'][number]) => {
      const existingBarcodeProduct = findProductByBarcode(products, item.barcode);
      const currentState =
        approvalItems[item.id] || buildInitialApprovalState(item, existingBarcodeProduct);

      if (currentState.action === 'CREATE_PRODUCT') {
        handleToggleApprovalAction(item, 'CREATE_PRODUCT', existingBarcodeProduct);
        setEditingProductItemId(null);
        return;
      }

      openProductEditor(item);
    },
    [approvalItems, handleToggleApprovalAction, openProductEditor, products],
  );

  const closeProductEditor = useCallback(() => {
    setEditingProductItemId(null);
  }, []);

  const handleConfirmProduct = useCallback(async () => {
    if (!selectedProductItem || !selectedProductApprovalState) {
      return;
    }

    if (!String(selectedProductApprovalState.productName || '').trim()) {
      setErrorMessage('Informe o nome do produto antes de confirmar.');
      return;
    }

    setSavingProduct(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await saveItemApprovalDraft(
        selectedProductItem,
        {
          ...selectedProductApprovalState,
          action: 'CREATE_PRODUCT',
          productId: '',
        },
        'CREATE_PRODUCT',
      );

      setEditingProductItemId(null);
      setSuccessMessage(
        response?.message ||
          'Produto conferido e reservado para criação na aprovação da nota.',
      );
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível salvar a conferência do produto.',
        ),
      );
    } finally {
      setSavingProduct(false);
    }
  }, [saveItemApprovalDraft, selectedProductApprovalState, selectedProductItem]);

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
      <section
        className={`${FINANCE_GRID_PAGE_LAYOUT.card} ${
          activeApprovalTab === 'products' ? 'overflow-hidden' : ''
        }`}
      >
        {loading ? (
          <div className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
            Carregando dados da nota importada...
          </div>
        ) : detail ? (
          <div
            className={
              activeApprovalTab === 'products'
                ? 'flex h-screen min-h-0 flex-col gap-6 overflow-hidden p-6'
                : 'grid gap-6 p-6'
            }
          >
            <div className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">
                      Contas a pagar
                    </span>
                    <h1 className="text-lg font-black text-slate-900">Aprovação da Nota</h1>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-slate-700">
                      NF-e {detail.invoiceNumber}
                      {detail.series ? ` / Série ${detail.series}` : ''}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-slate-700">
                      {formatDateLabel(detail.issueDate)}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-blue-700">
                      {formatCurrency(detail.totalInvoiceAmount)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
                    <div className="min-w-0 truncate" title={`${detail.supplierName || '---'} ${detail.supplierDocument || ''}`}>
                      <span className="text-slate-400">Fornecedor: </span>
                      <span className="text-slate-700">{detail.supplierName || '---'}</span>
                      <span> • {detail.supplierDocument || 'SEM DOCUMENTO'}</span>
                    </div>
                    <div className="min-w-0 truncate" title={detail.accessKey}>
                      <span className="text-slate-400">Chave: </span>
                      <span>{detail.accessKey}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-3">
                  {detail.status !== 'APPROVED' ? (
                    <button
                      type="button"
                      onClick={() => void handleApprove()}
                      disabled={saving}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-blue-600 px-5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? 'Aprovando...' : 'Aprovar Nota'}
                    </button>
                  ) : (
                    <div className="flex h-10 items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                      {`Aprovada em ${formatDateLabel(detail.approvedAt || null)}`}
                    </div>
                  )}
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

            <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveApprovalTab('overview')}
                aria-pressed={activeApprovalTab === 'overview'}
                className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                  activeApprovalTab === 'overview'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                Dados da nota
              </button>
              <button
                type="button"
                onClick={handleOpenProductsTab}
                aria-pressed={activeApprovalTab === 'products'}
                className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                  activeApprovalTab === 'products'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                Produtos
              </button>
            </div>

            {activeApprovalTab === 'products' && detail.status !== 'APPROVED' ? (
              <div className="flex flex-wrap gap-2">
                {APPROVAL_ACTION_PRESETS.map((preset) => (
                  <button
                    key={preset.action}
                    type="button"
                    onClick={() => handleApprovalPresetClick(preset.action)}
                    aria-pressed={selectedApprovalPreset === preset.action}
                    className={approvalActionCompactButtonClass(
                      preset.action,
                      selectedApprovalPreset,
                      detail.status === 'APPROVED',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            ) : null}

            {activeApprovalTab === 'overview' ? (
              <>
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                  Duplicatas importadas
                </div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Clique em uma duplicata para ajustar vencimento, baixa e valor final
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] table-fixed divide-y divide-slate-200">
                    <colgroup>
                      <col className="w-[110px]" />
                      <col className="w-[150px]" />
                      <col className="w-[120px]" />
                      <col className="w-[120px]" />
                      <col className="w-[120px]" />
                      <col className="w-[120px]" />
                      <col className="w-[120px]" />
                      <col className="w-[150px]" />
                      <col className="w-[170px]" />
                    </colgroup>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Duplicata
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Parcela
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Vencimento
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Original
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Acréscimo
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Desconto
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Final
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Situação
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          Observação
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {detail.installments.map((installment) => (
                        <tr
                          key={installment.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openInstallmentEditor(installment)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openInstallmentEditor(installment);
                            }
                          }}
                          className="cursor-pointer transition hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none"
                        >
                          <td className="px-3 py-2 align-middle text-xs font-black text-slate-900">
                            {installment.installmentNumber}
                          </td>
                          <td className="px-3 py-2 align-middle text-xs font-black text-slate-900">
                            <div className="truncate" title={installment.installmentLabel || 'SEM RÓTULO'}>
                              {installment.installmentLabel || 'SEM RÓTULO'}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle text-xs font-semibold text-slate-700">
                            {formatDateLabel(installment.dueDate)}
                          </td>
                          <td className="px-3 py-2 align-middle text-right text-xs font-semibold text-slate-700">
                            {formatCurrency(installment.originalAmount)}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle text-right text-xs font-semibold ${
                              (installment.additionAmount || 0) > 0
                                ? 'text-rose-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {formatCurrency(installment.additionAmount || 0)}
                          </td>
                          <td
                            className={`px-3 py-2 align-middle text-right text-xs font-semibold ${
                              (installment.discountAmount || 0) > 0
                                ? 'text-emerald-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {formatCurrency(installment.discountAmount || 0)}
                          </td>
                          <td className="px-3 py-2 align-middle text-right text-xs font-black text-slate-900">
                            {formatCurrency(installment.finalAmount)}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                                installment.status === 'PAID'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-rose-200 bg-rose-50 text-rose-700'
                              }`}
                            >
                              {installment.status === 'PAID' ? 'PAGA' : 'ABERTA'}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-middle text-xs font-semibold text-slate-500">
                            <div className="truncate" title={installment.notes || '---'}>
                              {installment.notes || '---'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
              </>
            ) : null}

            {activeApprovalTab === 'products' ? (
            <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div
                  className="h-full overflow-auto overscroll-contain pb-2"
                  style={{ scrollbarGutter: 'stable' }}
                >
                  <table className="min-w-[1120px] table-fixed divide-y divide-slate-200">
                    <colgroup>
                      <col className="w-[54px]" />
                      <col />
                      <col className="w-[112px]" />
                      <col className="w-[150px]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Item
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Produto
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Cód.
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          EAN
                        </th>
                      </tr>
                    </thead>
                    {detail.items.map((item, itemIndex) => {
                      const existingBarcodeProduct = findProductByBarcode(
                        productOptions,
                        item.barcode,
                      );
                      const approvalState =
                        approvalItems[item.id] ||
                        buildInitialApprovalState(item, existingBarcodeProduct);
                      const canCreateProduct = !existingBarcodeProduct;
                      const linkedProduct =
                        productOptions.find(
                          (product) =>
                            product.id ===
                            (approvalState.productId || existingBarcodeProduct?.id),
                        ) ||
                        existingBarcodeProduct ||
                        null;
                      const zebraMainClass =
                        itemIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/80';
                      const zebraDetailClass =
                        itemIndex % 2 === 0 ? 'bg-slate-50/60' : 'bg-slate-100/80';
                      const selectedRowAction = approvalState.action;
                      const lockRowToSelectedAction = Boolean(selectedRowAction);
                      const showLinkButton = lockRowToSelectedAction
                        ? selectedRowAction === 'LINK_EXISTING'
                        : true;
                      const showCreateButton = canCreateProduct
                        ? lockRowToSelectedAction
                          ? selectedRowAction === 'CREATE_PRODUCT'
                          : true
                        : false;
                      const showIgnoreButton = lockRowToSelectedAction
                        ? selectedRowAction === 'IGNORE_STOCK'
                        : true;

                      return (
                        <tbody
                          key={item.id}
                          className="border-b border-slate-100 last:border-b-0"
                        >
                          <tr className={`${zebraMainClass} transition hover:bg-blue-50/40`}>
                            <td className="px-2 pb-1 pt-2 align-middle text-xs font-black text-slate-900">
                              {item.lineNumber}
                            </td>
                            <td className="px-2 pb-1 pt-2 align-middle">
                              <div
                                className="truncate text-xs font-black text-slate-900"
                                title={item.description}
                              >
                                {item.description}
                              </div>
                            </td>
                            <td className="px-1 pb-1 pt-2 align-middle text-xs font-semibold text-slate-600">
                              <div
                                className="truncate"
                                title={item.supplierItemCode || '---'}
                              >
                                {item.supplierItemCode || '---'}
                              </div>
                            </td>
                            <td className="px-2 pb-1 pt-2 align-middle text-xs font-semibold text-slate-600">
                              <div className="truncate" title={item.barcode || '---'}>
                                {item.barcode || '---'}
                              </div>
                            </td>
                          </tr>
                          <tr className={`${zebraDetailClass} transition hover:bg-blue-50/40`}>
                            <td colSpan={4} className="px-3 pb-2 pt-1">
                              <div className="grid grid-cols-[minmax(80px,0.7fr)_minmax(92px,0.7fr)_minmax(132px,1fr)_minmax(132px,1fr)_minmax(306px,1.7fr)_minmax(260px,2fr)] items-center gap-3">
                                <div className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-slate-600">
                                  Un.: {item.unitCode || 'UN'}
                                </div>
                                <div className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-slate-700">
                                  Qtd.: {item.quantity}
                                </div>
                                <div className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-slate-700">
                                  Unit.: {formatCurrency(item.unitPrice)}
                                </div>
                                <div className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-slate-900">
                                  Total: {formatCurrency(item.totalPrice)}
                                </div>
                                <div
                                  className={`flex flex-nowrap items-center gap-1.5 ${
                                    approvalState.action === 'IGNORE_STOCK'
                                      ? 'col-span-2 justify-end'
                                      : 'justify-start'
                                  }`}
                                >
                                  {showLinkButton ? (
                                    <button
                                      type="button"
                                      aria-pressed={approvalState.action === 'LINK_EXISTING'}
                                      onClick={() =>
                                        handleToggleApprovalAction(
                                          item,
                                          'LINK_EXISTING',
                                          existingBarcodeProduct,
                                        )
                                      }
                                      disabled={detail.status === 'APPROVED'}
                                      className={approvalActionCompactButtonClass(
                                        'LINK_EXISTING',
                                        approvalState.action,
                                        detail.status === 'APPROVED',
                                      )}
                                    >
                                      Vincular
                                    </button>
                                  ) : null}
                                  {showCreateButton ? (
                                    <button
                                      type="button"
                                      aria-pressed={approvalState.action === 'CREATE_PRODUCT'}
                                      onClick={() => toggleCreateProductAction(item)}
                                      disabled={detail.status === 'APPROVED'}
                                      className={approvalActionCompactButtonClass(
                                        'CREATE_PRODUCT',
                                        approvalState.action,
                                        detail.status === 'APPROVED',
                                      )}
                                    >
                                      Produto
                                    </button>
                                  ) : null}
                                  {showIgnoreButton ? (
                                    <button
                                      type="button"
                                      aria-pressed={approvalState.action === 'IGNORE_STOCK'}
                                      onClick={() =>
                                        handleToggleApprovalAction(
                                          item,
                                          'IGNORE_STOCK',
                                          existingBarcodeProduct,
                                        )
                                      }
                                      disabled={detail.status === 'APPROVED'}
                                      className={approvalActionCompactButtonClass(
                                        'IGNORE_STOCK',
                                        approvalState.action,
                                        detail.status === 'APPROVED',
                                      )}
                                    >
                                      Sem estoque
                                    </button>
                                  ) : null}
                                </div>
                                {approvalState.action === 'LINK_EXISTING' ? (
                                  <select
                                    value={
                                      approvalState.productId ||
                                      existingBarcodeProduct?.id ||
                                      ''
                                    }
                                    onChange={(event) =>
                                      updateApprovalItem(item.id, { productId: event.target.value })
                                    }
                                    disabled={detail.status === 'APPROVED'}
                                    title={
                                      existingBarcodeProduct
                                        ? `EAN já cadastrado no estoque: ${existingBarcodeProduct.name}`
                                        : linkedProduct?.name || 'SELECIONE UM PRODUTO'
                                    }
                                    className="h-8 w-full rounded-xl border border-slate-300 bg-white px-2 text-[11px] font-black uppercase tracking-[0.08em] text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
                                  >
                                    <option value="">SELECIONE UM PRODUTO</option>
                                    {productOptions.map((product) => (
                                      <option key={product.id} value={product.id}>
                                        {product.name}
                                        {product.internalCode ? ` - ${product.internalCode}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                ) : approvalState.action === 'CREATE_PRODUCT' ? (
                                  <button
                                    type="button"
                                    onClick={() => openProductEditor(item)}
                                    disabled={detail.status === 'APPROVED'}
                                    title={approvalState.productName || item.description}
                                    className="flex h-8 w-full items-center rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-left text-[11px] font-black uppercase tracking-[0.08em] text-emerald-800 transition hover:border-emerald-300 disabled:opacity-60"
                                  >
                                    <span className="truncate">
                                      {approvalState.productName || item.description}
                                    </span>
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      );
                    })}
                  </table>
                </div>
              </div>
            </section>
            ) : null}

            {activeApprovalTab === 'overview' ? (
              <>
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
              </>
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
              isOpen={Boolean(selectedProductItem && selectedProductApprovalState)}
              screenId={PRODUCT_POPUP_SCREEN_ID}
              eyebrow="Produto novo"
              title="Cadastro do produto da nota"
              description="Dados do produto que será criado na aprovação da nota."
              brandingName={runtimeContext.companyName || 'FINANCEIRO'}
              logoUrl={runtimeContext.logoUrl}
              originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/notas-importadas/[importId]/page.tsx"
              auditText={productPopupAuditText}
              sqlText={productPopupSqlText}
              onClose={closeProductEditor}
              panelClassName="max-w-[1180px]"
              bodyClassName="overflow-y-auto pb-2"
              footerActions={
                <>
                  <button
                    type="button"
                    onClick={closeProductEditor}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-600 shadow-sm transition hover:bg-slate-50"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmProduct()}
                    disabled={savingProduct || detail.status === 'APPROVED'}
                    className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
                  >
                    {savingProduct ? 'Salvando...' : 'Confirmar produto'}
                  </button>
                </>
              }
            >
              {selectedProductItem && selectedProductApprovalState ? (
                <div className="grid gap-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Item da nota
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-900">
                        {selectedProductItem.lineNumber}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Quantidade
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-900">
                        {selectedProductItem.quantity}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Valor total
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-900">
                        {formatCurrency(selectedProductItem.totalPrice)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      Descrição importada
                    </div>
                    <div className="mt-2 text-lg font-black text-slate-900">
                      {selectedProductItem.description}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Nome do produto
                      </span>
                      <input
                        value={selectedProductApprovalState.productName}
                        onChange={(event) =>
                          updateApprovalItem(selectedProductItem.id, {
                            productName: event.target.value,
                          })
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
                        value={selectedProductApprovalState.internalCode}
                        onChange={(event) =>
                          updateApprovalItem(selectedProductItem.id, {
                            internalCode: event.target.value,
                          })
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
                        value={selectedProductApprovalState.barcode}
                        onChange={(event) =>
                          updateApprovalItem(selectedProductItem.id, {
                            barcode: event.target.value,
                          })
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
                        value={selectedProductApprovalState.unitCode}
                        onChange={(event) =>
                          updateApprovalItem(selectedProductItem.id, {
                            unitCode: event.target.value,
                          })
                        }
                        disabled={detail.status === 'APPROVED'}
                        className={FINANCE_GRID_PAGE_LAYOUT.input}
                      />
                    </label>

                    {hasProductStockParameters(runtimeContext) ? (
                      <div className="md:col-span-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {runtimeContext.stockControlMode === 'BY_PRODUCT' ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateApprovalItem(selectedProductItem.id, {
                                tracksInventory:
                                  !selectedProductApprovalState.tracksInventory,
                              })
                            }
                            disabled={detail.status === 'APPROVED'}
                            className={stockParameterButtonClass(
                              selectedProductApprovalState.tracksInventory,
                              detail.status === 'APPROVED',
                            )}
                          >
                            <div className="text-sm font-black uppercase tracking-[0.16em]">
                              Controla estoque
                            </div>
                            <div className="mt-1 text-sm font-medium">
                              {selectedProductApprovalState.tracksInventory
                                ? 'Sim, movimenta estoque.'
                                : 'Não movimenta estoque.'}
                            </div>
                          </button>
                        ) : null}

                        {runtimeContext.stockIntegerQuantityMode === 'BY_PRODUCT' ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateApprovalItem(selectedProductItem.id, {
                                allowFraction:
                                  !selectedProductApprovalState.allowFraction,
                              })
                            }
                            disabled={
                              detail.status === 'APPROVED' ||
                              !selectedProductApprovalState.tracksInventory
                            }
                            className={stockParameterButtonClass(
                              !selectedProductApprovalState.allowFraction,
                              detail.status === 'APPROVED' ||
                                !selectedProductApprovalState.tracksInventory,
                            )}
                          >
                            <div className="text-sm font-black uppercase tracking-[0.16em]">
                              Quantidade inteira
                            </div>
                            <div className="mt-1 text-sm font-medium">
                              {selectedProductApprovalState.allowFraction
                                ? 'Não, aceita fracionar.'
                                : 'Sim, somente inteira.'}
                            </div>
                          </button>
                        ) : null}

                        {runtimeContext.stockLotControlMode === 'BY_PRODUCT' ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateApprovalItem(selectedProductItem.id, {
                                usesLotControl:
                                  !selectedProductApprovalState.usesLotControl,
                              })
                            }
                            disabled={
                              detail.status === 'APPROVED' ||
                              !selectedProductApprovalState.tracksInventory
                            }
                            className={stockParameterButtonClass(
                              selectedProductApprovalState.usesLotControl,
                              detail.status === 'APPROVED' ||
                                !selectedProductApprovalState.tracksInventory,
                            )}
                          >
                            <div className="text-sm font-black uppercase tracking-[0.16em]">
                              Controla lote
                            </div>
                            <div className="mt-1 text-sm font-medium">
                              {selectedProductApprovalState.usesLotControl
                                ? 'Sim, produto por lote.'
                                : 'Não controla lote.'}
                            </div>
                          </button>
                        ) : null}

                        {runtimeContext.stockExpirationControlMode === 'BY_PRODUCT' ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateApprovalItem(selectedProductItem.id, {
                                usesExpirationControl:
                                  !selectedProductApprovalState.usesExpirationControl,
                              })
                            }
                            disabled={
                              detail.status === 'APPROVED' ||
                              !selectedProductApprovalState.tracksInventory
                            }
                            className={stockParameterButtonClass(
                              selectedProductApprovalState.usesExpirationControl,
                              detail.status === 'APPROVED' ||
                                !selectedProductApprovalState.tracksInventory,
                            )}
                          >
                            <div className="text-sm font-black uppercase tracking-[0.16em]">
                              Controla validade
                            </div>
                            <div className="mt-1 text-sm font-medium">
                              {selectedProductApprovalState.usesExpirationControl
                                ? 'Sim, exige validade.'
                                : 'Não controla validade.'}
                            </div>
                          </button>
                        ) : null}

                        {runtimeContext.stockGridControlMode === 'BY_PRODUCT' ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateApprovalItem(selectedProductItem.id, {
                                usesColorSize:
                                  !selectedProductApprovalState.usesColorSize,
                              })
                            }
                            disabled={
                              detail.status === 'APPROVED' ||
                              !selectedProductApprovalState.tracksInventory
                            }
                            className={stockParameterButtonClass(
                              selectedProductApprovalState.usesColorSize,
                              detail.status === 'APPROVED' ||
                                !selectedProductApprovalState.tracksInventory,
                            )}
                          >
                            <div className="text-sm font-black uppercase tracking-[0.16em]">
                              Controla grade
                            </div>
                            <div className="mt-1 text-sm font-medium">
                              {selectedProductApprovalState.usesColorSize
                                ? 'Sim, produto com grade.'
                                : 'Não usa grade.'}
                            </div>
                          </button>
                        ) : null}

                        {runtimeContext.stockNegativeControlMode === 'BY_PRODUCT' ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateApprovalItem(selectedProductItem.id, {
                                allowsNegativeStock:
                                  !selectedProductApprovalState.allowsNegativeStock,
                              })
                            }
                            disabled={
                              detail.status === 'APPROVED' ||
                              !selectedProductApprovalState.tracksInventory
                            }
                            className={stockParameterButtonClass(
                              selectedProductApprovalState.allowsNegativeStock,
                              detail.status === 'APPROVED' ||
                                !selectedProductApprovalState.tracksInventory,
                            )}
                          >
                            <div className="text-sm font-black uppercase tracking-[0.16em]">
                              Permite negativo
                            </div>
                            <div className="mt-1 text-sm font-medium">
                              {selectedProductApprovalState.allowsNegativeStock
                                ? 'Sim, pode ficar negativo.'
                                : 'Não permite negativo.'}
                            </div>
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </AuditedPopupShell>

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
