'use client';

import Link from 'next/link';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import { formatCurrency, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type ProductItem = {
  id: string;
  name: string;
  internalCode?: string | null;
  sku?: string | null;
  barcode?: string | null;
  unitCode: string;
  tracksInventory: boolean;
  allowFraction: boolean;
  usesColorSize: boolean;
  usesLotControl: boolean;
  currentStock: number;
  purchasePrice?: number | null;
  salePrice?: number | null;
  inventorySituation: 'OK' | 'LOW' | 'OUT' | 'WITHOUT_CONTROL';
};

type SaleCompanyItem = {
  id: string;
};

type SaleBranchItem = {
  branchCode: number;
  allowSaleUnitPriceEdit?: boolean | null;
  allowSaleItemDiscount?: boolean | null;
};

type SaleBranchConfig = {
  allowSaleUnitPriceEdit: boolean;
  allowSaleItemDiscount: boolean;
};

type CartItem = {
  lineId: string;
  itemNumber: number;
  product: ProductItem;
  description: string;
  quantity: string;
  unitCost: string;
  unitPrice: string;
  discountAmount: string;
  colorCode: string;
  colorName: string;
  sizeCode: string;
  lotNumber: string;
  lotExpirationDate: string;
};

type PaymentMethod =
  | 'CASH'
  | 'PIX'
  | 'DEBIT_CARD'
  | 'CREDIT_CARD'
  | 'BOLETO'
  | 'TERM';

type PaymentRow = {
  id: string;
  paymentMethod: PaymentMethod;
  amount: string;
  dueDate: string;
  installmentCount: string;
  cardInstallmentCount: string;
  notes: string;
};

type PaymentAmountModalState = {
  paymentMethod: PaymentMethod;
  amount: string;
  installmentCount: string;
  dueDate: string;
  installments: PaymentInstallmentDraft[];
};

type PaymentInstallmentDraft = {
  number: number;
  dueDate: string;
  amount: string;
};

type CheckoutFeedbackState = {
  type: 'success' | 'error';
  title: string;
  message: string;
  details?: Array<{
    label: string;
    value: string;
    tone?: 'neutral' | 'success' | 'warning' | 'danger';
  }>;
  paymentBreakdown?: Array<{
    label: string;
    value: string;
  }>;
  closeCheckoutOnOk?: boolean;
};

type CreatedSale = {
  id: string;
  saleNumber: string;
  message?: string;
};

type CashSessionResponse = {
  id: string;
  cashierDisplayName: string;
  status: string;
  openingAmount: number;
  totalReceivedAmount: number;
  expectedClosingAmount: number;
  openedAt: string;
  movementCount: number;
  settlementCount: number;
};

type CustomerState = {
  name: string;
  document: string;
  email: string;
  phone: string;
  referenceName: string;
};

type PersonLookupResult = {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  sourceType?: string | null;
};

type QuickCashSaleState = {
  amountPaid: string;
  document: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  personSearch: string;
  personResults: PersonLookupResult[];
  isSearchingPeople: boolean;
  isPeopleSearchOpen: boolean;
  futureDelivery: boolean;
  feedback: CheckoutFeedbackState | null;
};

type EditableCartItemField = Exclude<keyof CartItem, 'lineId' | 'itemNumber' | 'product'>;

type GenericProductDraft = {
  product: ProductItem;
  description: string;
  quantity: string;
  unitCost: string;
  unitPrice: string;
};

type CheckoutTab = 'payment' | 'customer';

const SCREEN_ID = 'FINANCEIRO_VENDAS_PDV_GERAL';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_VENDAS';
const CHECKOUT_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_VENDAS_FINALIZACAO';
const QUICK_CASH_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_VENDAS_ATALHO_A_VISTA';
const QUICK_CASH_PEOPLE_SEARCH_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_VENDAS_ATALHO_A_VISTA_PESQUISAR_PESSOAS';
const SALE_DRAFT_STORAGE_PREFIX = 'financeiro:vendas:rascunho:';
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const compactInputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const DEFAULT_SALE_BRANCH_CONFIG: SaleBranchConfig = {
  allowSaleUnitPriceEdit: true,
  allowSaleItemDiscount: true,
};

const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  shortLabel: string;
  tone: string;
  description: string;
}> = [
  {
    id: 'CASH',
    label: 'Dinheiro',
    shortLabel: 'DINHEIRO',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    description: 'À vista no caixa',
  },
  {
    id: 'PIX',
    label: 'Pix',
    shortLabel: 'PIX',
    tone: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    description: 'Recebido agora',
  },
  {
    id: 'DEBIT_CARD',
    label: 'Cartão débito',
    shortLabel: 'DÉBITO',
    tone: 'border-sky-200 bg-sky-50 text-sky-700',
    description: 'À vista no cartão',
  },
  {
    id: 'CREDIT_CARD',
    label: 'Cartão crédito',
    shortLabel: 'CARTÃO CRÉDITO',
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    description: 'Crédito recebido',
  },
  {
    id: 'BOLETO',
    label: 'Boleto',
    shortLabel: 'BOLETO',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    description: 'Gera parcela aberta',
  },
  {
    id: 'TERM',
    label: 'Prazo',
    shortLabel: 'PRAZO',
    tone: 'border-orange-200 bg-orange-50 text-orange-700',
    description: 'Uma cobrança futura',
  },
];

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseDecimal(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDocumentDigits(value: string) {
  return String(value || '').replace(/\D+/g, '');
}

function isValidCpf(value: string) {
  const cpf = normalizeDocumentDigits(value);
  if (!cpf || cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number.parseInt(cpf.charAt(index), 10) * (10 - index);
  }
  let remainder = 11 - (sum % 11);
  if (remainder >= 10) remainder = 0;
  if (remainder !== Number.parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number.parseInt(cpf.charAt(index), 10) * (11 - index);
  }
  remainder = 11 - (sum % 11);
  if (remainder >= 10) remainder = 0;

  return remainder === Number.parseInt(cpf.charAt(10), 10);
}

function isValidCnpj(value: string) {
  const cnpj = normalizeDocumentDigits(value);
  if (!cnpj || cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const validateDigit = (base: string, weights: number[]) => {
    const sum = weights.reduce(
      (total, weight, index) => total + Number.parseInt(base.charAt(index), 10) * weight,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = validateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = validateDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return (
    firstDigit === Number.parseInt(cnpj.charAt(12), 10) &&
    secondDigit === Number.parseInt(cnpj.charAt(13), 10)
  );
}

function validateOptionalBrazilDocument(value: string) {
  const digits = normalizeDocumentDigits(value);
  if (!digits) return null;
  if (digits.length === 11 && isValidCpf(digits)) return null;
  if (digits.length === 14 && isValidCnpj(digits)) return null;
  return 'CPF/CNPJ inválido. Confira o documento informado.';
}

function formatNumberInput(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return value.toFixed(2).replace('.', ',');
}

function formatMoneyInputValue(value: string) {
  if (!String(value || '').trim()) return '';
  return formatNumberInput(parseDecimal(value));
}

function formatOptionalMoneyInputValue(value: string) {
  return String(value || '').trim() ? formatMoneyInputValue(value) : '';
}

function formatLookupValue(value: string | null | undefined) {
  return String(value || '').trim() || '---';
}

function getTodayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function getNextMonthDateInput() {
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);
  return nextDate.toISOString().slice(0, 10);
}

function isDeferredPayment(method: PaymentMethod) {
  return method === 'BOLETO' || method === 'TERM';
}

function isImmediatePayment(method: PaymentMethod) {
  return !isDeferredPayment(method);
}

function supportsPaymentInstallments(method: PaymentMethod) {
  return method === 'CREDIT_CARD' || method === 'BOLETO' || method === 'TERM';
}

function addMonthsToDateInput(dateInput: string, months: number) {
  const [year, month, day] = dateInput.split('-').map((part) => Number.parseInt(part, 10));
  const baseDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : new Date();
  baseDate.setMonth(baseDate.getMonth() + months);
  return baseDate.toISOString().slice(0, 10);
}

function buildPaymentInstallmentDrafts(amount: number, installmentCount: number, firstDueDate: string) {
  const safeInstallmentCount = Math.max(1, installmentCount || 1);
  const baseAmount = Math.round((amount / safeInstallmentCount) * 100) / 100;
  let distributedAmount = 0;

  return Array.from({ length: safeInstallmentCount }, (_, index) => {
    const isLast = index === safeInstallmentCount - 1;
    const installmentAmount = isLast
      ? Math.round((amount - distributedAmount) * 100) / 100
      : baseAmount;
    distributedAmount = Math.round((distributedAmount + installmentAmount) * 100) / 100;

    return {
      number: index + 1,
      dueDate: addMonthsToDateInput(firstDueDate, index),
      amount: formatNumberInput(installmentAmount),
    };
  });
}

function recalculateFollowingInstallmentAmounts(
  installments: PaymentInstallmentDraft[],
  totalAmount: number,
  changedIndex: number,
) {
  const fixedAmount = installments
    .slice(0, changedIndex + 1)
    .reduce((sum, installment) => sum + parseDecimal(installment.amount), 0);
  const remainingCount = installments.length - changedIndex - 1;
  if (remainingCount <= 0) return installments;

  const remainingAmount = Math.max(0, Math.round((totalAmount - fixedAmount) * 100) / 100);
  const baseAmount = Math.round((remainingAmount / remainingCount) * 100) / 100;
  let distributedAmount = 0;

  return installments.map((installment, index) => {
    if (index <= changedIndex) return installment;

    const isLast = index === installments.length - 1;
    const nextAmount = isLast
      ? Math.round((remainingAmount - distributedAmount) * 100) / 100
      : baseAmount;
    distributedAmount = Math.round((distributedAmount + nextAmount) * 100) / 100;

    return {
      ...installment,
      amount: formatNumberInput(nextAmount),
    };
  });
}

function sumPaymentInstallmentDrafts(installments: PaymentInstallmentDraft[]) {
  return Math.round(
    installments.reduce((sum, installment) => sum + parseDecimal(installment.amount), 0) * 100,
  ) / 100;
}

function isGenericProduct(product: ProductItem) {
  return String(product.internalCode || '').trim() === '1';
}

function parseProductSearchCommand(value: string) {
  const trimmed = value.trim();
  const starIndex = trimmed.indexOf('*');

  if (starIndex <= 0) {
    return { quantity: 1, term: trimmed };
  }

  const quantity = parseDecimal(trimmed.slice(0, starIndex));

  if (quantity <= 0) {
    return { quantity: 1, term: trimmed };
  }

  return {
    quantity,
    term: trimmed.slice(starIndex + 1).trim(),
  };
}

function formatQuantityInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '1';
  return Number.isInteger(value) ? String(value) : formatNumberInput(value);
}

function findExactProductMatch(products: ProductItem[], term: string) {
  const normalizedTerm = term.trim().toUpperCase();
  const digitTerm = term.replace(/\D+/g, '');

  if (!normalizedTerm) return null;

  return (
    products.find((product) =>
      [product.internalCode, product.sku, product.barcode]
        .filter(Boolean)
        .some((code) => String(code).trim().toUpperCase() === normalizedTerm),
    ) ||
    products.find(
      (product) => digitTerm && String(product.barcode || '').trim() === digitTerm,
    ) ||
    null
  );
}

function getPaymentMethodLabel(method: PaymentMethod | string) {
  return PAYMENT_METHODS.find((item) => item.id === method)?.shortLabel || method;
}

function getStockLabel(product: ProductItem) {
  if (!product.tracksInventory) return 'SEM CONTROLE';
  return `${product.currentStock.toLocaleString('pt-BR', {
    minimumFractionDigits: product.allowFraction && !Number.isInteger(product.currentStock) ? 2 : 0,
    maximumFractionDigits: product.allowFraction ? 2 : 0,
  })} ${product.unitCode || 'UN'}`;
}

function getStockTone(product: ProductItem) {
  if (!product.tracksInventory) return 'border-slate-200 bg-slate-50 text-slate-500';
  if (product.inventorySituation === 'OUT') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (product.inventorySituation === 'LOW') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function buildSalesAuditSql(params: {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  sourceBranchCode: number;
  saleChannel: string;
  productSearch: string;
}) {
  return `-- PARAMETROS ATUAIS
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :sourceBranchCode = ${params.sourceBranchCode}
-- :saleChannel = ${toSqlLiteral(params.saleChannel)}
-- :productSearch = ${toSqlLiteral(params.productSearch.trim().toUpperCase())}

SELECT
  S.id,
  S.saleNumber,
  S.saleChannel,
  S.customerNameSnapshot,
  S.totalAmount,
  S.paidAmount,
  S.receivableAmount,
  S.paymentSummary,
  S.confirmedAt
FROM sales S
INNER JOIN companies CO
  ON CO.id = S.companyId
 AND CO.canceledAt IS NULL
WHERE S.canceledAt IS NULL
  AND CO.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND S.branchCode = ${params.sourceBranchCode}
  AND (${toSqlLiteral(params.saleChannel)} = 'ALL' OR S.saleChannel = ${toSqlLiteral(params.saleChannel)})
ORDER BY S.confirmedAt DESC
LIMIT 100;`;
}

function buildSalesAuditText(params: {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  companyName?: string | null;
  sourceBranchCode: number;
  saleChannel: string;
  productSearch: string;
  cartCount: number;
  paymentCount: number;
}) {
  return `--- LOGICA DA TELA ---
Tela operacional de venda de produtos do Financeiro.

TABELAS PRINCIPAIS:
- sales (S) - cabeçalho das vendas confirmadas.
- sale_items (SI) - itens e snapshots dos produtos vendidos.
- sale_payments (SP) - formas de pagamento da venda.
- products (PR) - catálogo de produtos.
- stock_movements (SM) - baixa de estoque gerada por venda.
- receivable_titles (RT) e receivable_installments (RI) - contas a receber quando houver boleto/prazo/parcelado.
- cash_sessions (CS) e cash_movements (CM) - caixa usado em dinheiro, PIX ou cartões.

RELACIONAMENTOS:
- sale_items.saleId -> sales.id
- sale_items.productId -> products.id
- sale_payments.saleId -> sales.id
- sales.receivableTitleId -> receivable_titles.id
- stock_movements.sourceType = 'SALE' e sourceId = sales.id

FILTROS / CONTEXTO APLICADOS AGORA:
- tenant financeiro: ${formatTenantAuditValue(params.sourceTenantId, params.companyName)}
- sistema origem: ${formatAuditValue(params.sourceSystem)}
- filial operacional: ${params.sourceBranchCode}
- canal selecionado: ${params.saleChannel}
- busca de produto: ${formatAuditValue(params.productSearch.trim().toUpperCase())}
- itens no carrinho: ${params.cartCount}
- formas de pagamento: ${params.paymentCount}

REGRAS DE NEGOCIO:
- o backend recalcula a regra efetiva da filial + produto antes de confirmar
- quantidade inteira, estoque negativo, cor/número, lote e validade são validados no backend
- pagamentos à vista exigem caixa aberto
- boleto/prazo/parcelado geram título e parcelas no contas a receber
- nenhuma baixa de estoque é editada fisicamente; a venda gera movimentação histórica.`;
}

function createDefaultPayment(totalAmount: number): PaymentRow {
  return {
    id: generateId('pay'),
    paymentMethod: 'CASH',
    amount: formatNumberInput(totalAmount),
    dueDate: getNextMonthDateInput(),
    installmentCount: '1',
    cardInstallmentCount: '1',
    notes: '',
  };
}

function createQuickCashSaleState(totalAmount = 0): QuickCashSaleState {
  return {
    amountPaid: formatNumberInput(totalAmount),
    document: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    personSearch: '',
    personResults: [],
    isSearchingPeople: false,
    isPeopleSearchOpen: false,
    futureDelivery: false,
    feedback: null,
  };
}

function buildSalePayload(params: {
  runtimeContext: ReturnType<typeof useFinanceRuntimeContext>;
  saleChannel: string;
  customer: CustomerState;
  cartItems: CartItem[];
  paymentRows: PaymentRow[];
  saleDiscount: string;
  notes: string;
  allowSaleItemDiscount: boolean;
}) {
  const {
    runtimeContext,
    saleChannel,
    customer,
    cartItems,
    paymentRows,
    saleDiscount,
    notes,
    allowSaleItemDiscount,
  } = params;

  return {
    sourceSystem: runtimeContext.sourceSystem,
    sourceTenantId: runtimeContext.sourceTenantId,
    sourceBranchCode: runtimeContext.sourceBranchCode,
    companyName: runtimeContext.companyName || undefined,
    saleChannel,
    sourceEntityType: customer.referenceName ? 'REFERENCE' : undefined,
    sourceEntityId: customer.document || undefined,
    sourceEntityName: customer.referenceName || undefined,
    requestedBy: runtimeContext.cashierUserId || undefined,
    cashierUserId: runtimeContext.cashierUserId || undefined,
    cashierDisplayName: runtimeContext.cashierDisplayName || undefined,
    customer: customer.name
      ? {
          externalEntityType: 'CUSTOMER',
          externalEntityId: customer.document || customer.name,
          name: customer.name,
          document: customer.document || undefined,
          email: customer.email || undefined,
          phone: customer.phone || undefined,
        }
      : undefined,
    items: cartItems.map((item) => ({
      productId: item.product.id,
      description: item.description || undefined,
      quantity: parseDecimal(item.quantity),
      unitCost: item.unitCost ? parseDecimal(item.unitCost) : undefined,
      unitPrice: parseDecimal(item.unitPrice),
      discountAmount: allowSaleItemDiscount
        ? parseDecimal(item.discountAmount) * parseDecimal(item.quantity)
        : 0,
      colorCode: item.colorCode || undefined,
      colorName: item.colorName || undefined,
      sizeCode: item.sizeCode || undefined,
      lotNumber: item.lotNumber || undefined,
      lotExpirationDate: item.lotExpirationDate || undefined,
    })),
    payments: paymentRows.filter((payment) => parseDecimal(payment.amount) > 0).map((payment) => ({
      paymentMethod: payment.paymentMethod,
      amount: parseDecimal(payment.amount),
      dueDate: isDeferredPayment(payment.paymentMethod) ? payment.dueDate : undefined,
      installmentCount:
        isDeferredPayment(payment.paymentMethod)
          ? Number.parseInt(payment.installmentCount || '1', 10)
          : undefined,
      cardInstallmentCount:
        payment.paymentMethod === 'CREDIT_CARD'
          ? Number.parseInt(payment.cardInstallmentCount || '1', 10)
          : undefined,
      notes: payment.notes || undefined,
    })),
    discountAmount: parseDecimal(saleDiscount),
    notes: notes || undefined,
  };
}

function getSaleDraftStorageKey(runtimeContext: ReturnType<typeof useFinanceRuntimeContext>) {
  if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return null;

  return `${SALE_DRAFT_STORAGE_PREFIX}${encodeURIComponent(runtimeContext.sourceSystem)}:${encodeURIComponent(
    runtimeContext.sourceTenantId,
  )}:${encodeURIComponent(String(runtimeContext.sourceBranchCode || 1))}`;
}

function readSaleDraftCart(storageKey: string): CartItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const rawDraft = window.localStorage.getItem(storageKey);
    if (!rawDraft) return [];
    const parsed = JSON.parse(rawDraft) as { cartItems?: CartItem[] } | null;
    if (!Array.isArray(parsed?.cartItems)) return [];

    const validItems = parsed.cartItems.filter((item) => item?.lineId && item?.product?.id);
    return validItems.map((item, index) => ({
      ...item,
      itemNumber: Number.isFinite(Number(item.itemNumber))
        ? Number(item.itemNumber)
        : validItems.length - index,
      unitCost: formatOptionalMoneyInputValue(item.unitCost),
      unitPrice: formatMoneyInputValue(item.unitPrice),
      discountAmount: formatOptionalMoneyInputValue(item.discountAmount),
    }));
  } catch {
    return [];
  }
}

function writeSaleDraftCart(storageKey: string, cartItems: CartItem[]) {
  if (typeof window === 'undefined') return;

  try {
    if (!cartItems.length) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        cartItems,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // O rascunho e apenas uma conveniencia local; erro de storage nao bloqueia a venda.
  }
}

export default function SalesPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  const paymentAmountInputRef = useRef<HTMLInputElement | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [branchSaleConfig, setBranchSaleConfig] = useState<SaleBranchConfig>(
    DEFAULT_SALE_BRANCH_CONFIG,
  );
  const [productSearch, setProductSearch] = useState('');
  const [cartDescriptionSearch, setCartDescriptionSearch] = useState('');
  const saleChannel = 'GENERAL';
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [productLookupOpen, setProductLookupOpen] = useState(false);
  const [productLookupSearch, setProductLookupSearch] = useState('');
  const [productLookupQuantity, setProductLookupQuantity] = useState(1);
  const [genericProductDraft, setGenericProductDraft] = useState<GenericProductDraft | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTab, setCheckoutTab] = useState<CheckoutTab>('payment');
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [paymentAmountModal, setPaymentAmountModal] = useState<PaymentAmountModalState | null>(null);
  const [checkoutFeedback, setCheckoutFeedback] = useState<CheckoutFeedbackState | null>(null);
  const [quickCashSale, setQuickCashSale] = useState<QuickCashSaleState | null>(null);
  const [saleDiscount, setSaleDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [currentCashSession, setCurrentCashSession] = useState<CashSessionResponse | null>(null);
  const [isLoadingCashSession, setIsLoadingCashSession] = useState(false);
  const [customer, setCustomer] = useState<CustomerState>({
    name: '',
    document: '',
    email: '',
    phone: '',
    referenceName: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successSale, setSuccessSale] = useState<CreatedSale | null>(null);

  const screenId = runtimeContext.embedded ? EMBEDDED_SCREEN_ID : SCREEN_ID;

  const focusProductSearchInput = useCallback(() => {
    window.setTimeout(() => {
      productSearchInputRef.current?.focus();
      productSearchInputRef.current?.select();
    }, 0);
  }, []);

  const focusPaymentAmountInput = useCallback(() => {
    window.setTimeout(() => {
      paymentAmountInputRef.current?.focus();
      paymentAmountInputRef.current?.select();
    }, 0);
  }, []);

  useEffect(() => {
    if (checkoutOpen || productLookupOpen || genericProductDraft || paymentAmountModal || quickCashSale) return;
    focusProductSearchInput();
  }, [
    checkoutOpen,
    focusProductSearchInput,
    genericProductDraft,
    paymentAmountModal,
    productLookupOpen,
    quickCashSale,
  ]);

  const canLoadContext = Boolean(runtimeContext.sourceSystem && runtimeContext.sourceTenantId);
  const cashierUserId = runtimeContext.cashierUserId || 'USUARIO';
  const cashierDisplayName = runtimeContext.cashierDisplayName || cashierUserId;
  const saleDraftStorageKey = useMemo(
    () => getSaleDraftStorageKey(runtimeContext),
    [runtimeContext],
  );
  const [hydratedSaleDraftKey, setHydratedSaleDraftKey] = useState<string | null>(null);

  const queryString = useMemo(
    () =>
      buildFinanceApiQueryString(runtimeContext, {
        status: 'ACTIVE',
        sourceBranchCode: runtimeContext.sourceBranchCode,
      }),
    [runtimeContext],
  );
  const preservedNavigationQueryString = useMemo(
    () => buildFinanceNavigationQueryString(runtimeContext),
    [runtimeContext],
  );

  const cashSessionDetailHref = currentCashSession?.id
    ? `/caixa/${currentCashSession.id}${preservedNavigationQueryString}`
    : null;
  const cashSessionButtonTitle = isLoadingCashSession
    ? 'CARREGANDO CAIXA DO OPERADOR'
    : cashSessionDetailHref
      ? 'ABRIR DETALHE DO CAIXA'
      : 'NENHUM CAIXA ABERTO PARA ESTE OPERADOR';
  const footerBottomClass = runtimeContext.embedded ? 'bottom-0' : 'bottom-2';
  const pageBottomPaddingClass = runtimeContext.embedded ? 'pb-20 lg:pb-16' : 'pb-40 lg:pb-28';

  const loadData = useCallback(async () => {
    if (!canLoadContext) return;

    setErrorMessage('');

    try {
      const [loadedProducts, companies] = await Promise.all([
        getJson<ProductItem[]>(`/products${queryString}`),
        getJson<SaleCompanyItem[]>(`/companies${buildFinanceApiQueryString(runtimeContext)}`),
      ]);
      const company = companies[0];
      let nextBranchSaleConfig = DEFAULT_SALE_BRANCH_CONFIG;

      if (company?.id) {
        const branches = await getJson<SaleBranchItem[]>(
          `/companies/${company.id}/branches${buildFinanceApiQueryString(runtimeContext)}`,
        );
        const branch =
          branches.find((item) => item.branchCode === runtimeContext.sourceBranchCode) ||
          branches.find((item) => item.branchCode === 1) ||
          branches[0];

        if (branch) {
          nextBranchSaleConfig = {
            allowSaleUnitPriceEdit: branch.allowSaleUnitPriceEdit !== false,
            allowSaleItemDiscount: branch.allowSaleItemDiscount !== false,
          };
        }
      }

      setProducts(loadedProducts);
      setBranchSaleConfig(nextBranchSaleConfig);
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(error, 'Não foi possível carregar produtos.'),
      );
    }
  }, [canLoadContext, queryString, runtimeContext]);

  const loadCurrentCashSession = useCallback(async () => {
    if (!canLoadContext || !runtimeContext.cashierUserId) {
      setCurrentCashSession(null);
      setIsLoadingCashSession(false);
      return;
    }

    try {
      setIsLoadingCashSession(true);
      const payload = await getJson<CashSessionResponse | null>(
        `/cash-sessions/current${buildFinanceApiQueryString(runtimeContext, {
          cashierUserId,
          cashierDisplayName,
        })}`,
      );
      setCurrentCashSession(
        String(payload?.status || '').toUpperCase() === 'OPEN' ? payload : null,
      );
    } catch {
      setCurrentCashSession(null);
    } finally {
      setIsLoadingCashSession(false);
    }
  }, [canLoadContext, cashierDisplayName, cashierUserId, runtimeContext]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadCurrentCashSession();
  }, [loadCurrentCashSession]);

  useEffect(() => {
    if (!saleDraftStorageKey) return;

    setCartItems(readSaleDraftCart(saleDraftStorageKey));
    setHydratedSaleDraftKey(saleDraftStorageKey);
  }, [saleDraftStorageKey]);

  useEffect(() => {
    if (!saleDraftStorageKey || hydratedSaleDraftKey !== saleDraftStorageKey) return;

    writeSaleDraftCart(saleDraftStorageKey, cartItems);
  }, [cartItems, hydratedSaleDraftKey, saleDraftStorageKey]);

  const productSearchCommand = useMemo(
    () => parseProductSearchCommand(productSearch),
    [productSearch],
  );

  const productLookupResults = useMemo(() => {
    const search = productLookupSearch.trim().toUpperCase();
    if (!search) return products.slice(0, 80);

    return products
      .filter((product) =>
        [
          product.name,
          product.internalCode || '',
          product.sku || '',
          product.barcode || '',
        ]
          .join(' ')
          .toUpperCase()
          .includes(search),
      )
      .slice(0, 80);
  }, [productLookupSearch, products]);

  const cartTotals = useMemo(() => {
    const subtotal = cartItems.reduce(
      (total, item) => total + parseDecimal(item.quantity) * parseDecimal(item.unitPrice),
      0,
    );
    const itemDiscount = branchSaleConfig.allowSaleItemDiscount
      ? cartItems.reduce(
          (total, item) =>
            total + parseDecimal(item.discountAmount) * parseDecimal(item.quantity),
          0,
        )
      : 0;
    const total = Math.max(0, subtotal - itemDiscount - parseDecimal(saleDiscount));

    return {
      subtotal,
      discount: itemDiscount + parseDecimal(saleDiscount),
      total,
      paymentTotal: paymentRows.reduce((sum, payment) => sum + parseDecimal(payment.amount), 0),
      immediateTotal: paymentRows
        .filter((payment) => isImmediatePayment(payment.paymentMethod))
        .reduce((sum, payment) => sum + parseDecimal(payment.amount), 0),
      deferredTotal: paymentRows
        .filter((payment) => isDeferredPayment(payment.paymentMethod))
        .reduce((sum, payment) => sum + parseDecimal(payment.amount), 0),
    };
  }, [branchSaleConfig.allowSaleItemDiscount, cartItems, paymentRows, saleDiscount]);

  const paymentAmountByMethod = useMemo(() => {
    return paymentRows.reduce((amountByMethod, payment) => {
      const amount = parseDecimal(payment.amount);
      if (amount <= 0) return amountByMethod;

      amountByMethod.set(
        payment.paymentMethod,
        (amountByMethod.get(payment.paymentMethod) || 0) + amount,
      );
      return amountByMethod;
    }, new Map<PaymentMethod, number>());
  }, [paymentRows]);

  const auditSql = useMemo(
    () =>
      buildSalesAuditSql({
        sourceSystem: runtimeContext.sourceSystem,
        sourceTenantId: runtimeContext.sourceTenantId,
        sourceBranchCode: runtimeContext.sourceBranchCode,
        saleChannel,
        productSearch,
      }),
    [productSearch, runtimeContext, saleChannel],
  );

  const auditText = useMemo(
    () =>
      buildSalesAuditText({
        sourceSystem: runtimeContext.sourceSystem,
        sourceTenantId: runtimeContext.sourceTenantId,
        companyName: runtimeContext.companyName,
        sourceBranchCode: runtimeContext.sourceBranchCode,
        saleChannel,
        productSearch,
        cartCount: cartItems.length,
        paymentCount: paymentRows.length,
      }),
    [cartItems.length, paymentRows.length, productSearch, runtimeContext, saleChannel],
  );

  const cartGridTemplate = branchSaleConfig.allowSaleItemDiscount
    ? '52px minmax(280px,1.6fr) 130px 150px 110px 140px 44px'
    : '52px minmax(280px,1.6fr) 130px 110px 140px 44px';

  const sortedCartItems = useMemo(
    () => [...cartItems].sort((first, second) => second.itemNumber - first.itemNumber),
    [cartItems],
  );

  const visibleCartItems = useMemo(() => {
    const search = cartDescriptionSearch.trim().toUpperCase();
    if (!search) return sortedCartItems;

    return sortedCartItems.filter((item) =>
      [
        item.description,
        item.product.name,
        item.product.internalCode || '',
        item.product.sku || '',
        item.product.barcode || '',
      ]
        .join(' ')
        .toUpperCase()
        .includes(search),
    );
  }, [cartDescriptionSearch, sortedCartItems]);

  const getNextCartItemNumber = useCallback((current: CartItem[]) => {
    return current.reduce((max, item) => Math.max(max, item.itemNumber || 0), 0) + 1;
  }, []);

  const addProductToCart = useCallback((product: ProductItem, quantity = 1) => {
    const quantityText = formatQuantityInput(quantity);

    if (isGenericProduct(product)) {
      setGenericProductDraft({
        product,
        description: '',
        quantity: quantityText,
        unitCost: formatNumberInput(product.purchasePrice || 0),
        unitPrice: formatNumberInput(product.salePrice || 0),
      });
      setErrorMessage('');
      return;
    }

    setCartItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing && !product.usesColorSize && !product.usesLotControl) {
        const updatedItem = {
          ...existing,
          quantity: formatQuantityInput(parseDecimal(existing.quantity) + quantity),
          unitCost: formatOptionalMoneyInputValue(existing.unitCost),
          unitPrice: formatMoneyInputValue(existing.unitPrice),
          discountAmount: formatOptionalMoneyInputValue(existing.discountAmount),
        };
        return [
          updatedItem,
          ...current.filter((item) => item.lineId !== existing.lineId),
        ];
      }

      return [
        {
          lineId: generateId('item'),
          itemNumber: getNextCartItemNumber(current),
          product,
          description: '',
          quantity: quantityText,
          unitCost: product.purchasePrice ? formatNumberInput(product.purchasePrice) : '',
          unitPrice: formatNumberInput(product.salePrice || 0),
          discountAmount: '',
          colorCode: '',
          colorName: '',
          sizeCode: '',
          lotNumber: '',
          lotExpirationDate: '',
        },
        ...current,
      ];
    });
    setErrorMessage('');
    focusProductSearchInput();
  }, [focusProductSearchInput, getNextCartItemNumber]);

  const addGenericProductToCart = useCallback(() => {
    if (!genericProductDraft) return;

    const description = genericProductDraft.description.trim();
    const quantity = parseDecimal(genericProductDraft.quantity);
    const unitCost = parseDecimal(genericProductDraft.unitCost);
    const unitPrice = parseDecimal(genericProductDraft.unitPrice);

    if (!description) {
      setErrorMessage('Informe a descrição do produto genérico.');
      return;
    }

    if (quantity <= 0) {
      setErrorMessage('Informe a quantidade do produto genérico.');
      return;
    }

    if (!genericProductDraft.unitCost.trim() || unitCost < 0) {
      setErrorMessage('Informe o custo do produto genérico.');
      return;
    }

    if (unitPrice <= 0) {
      setErrorMessage('Informe o preço de venda do produto genérico.');
      return;
    }

    setCartItems((current) => [
      {
        lineId: generateId('item'),
        itemNumber: getNextCartItemNumber(current),
        product: genericProductDraft.product,
        description,
        quantity: formatQuantityInput(quantity),
        unitCost: formatMoneyInputValue(genericProductDraft.unitCost),
        unitPrice: formatMoneyInputValue(genericProductDraft.unitPrice),
        discountAmount: '',
        colorCode: '',
        colorName: '',
        sizeCode: '',
        lotNumber: '',
        lotExpirationDate: '',
      },
      ...current,
    ]);
    setGenericProductDraft(null);
    setErrorMessage('');
    focusProductSearchInput();
  }, [focusProductSearchInput, genericProductDraft, getNextCartItemNumber]);

  const openProductLookup = useCallback((quantity: number, searchTerm: string) => {
    setProductLookupQuantity(quantity > 0 ? quantity : 1);
    setProductLookupSearch(searchTerm.trim() === '0' ? '' : searchTerm.trim());
    setProductLookupOpen(true);
    setErrorMessage('');
  }, []);

  const executeProductSearchCommand = useCallback(() => {
    const term = productSearchCommand.term.trim();
    if (term.toUpperCase() === 'VV') {
      if (!cartItems.length) {
        setErrorMessage('Inclua ao menos um produto antes de finalizar a venda à vista.');
        focusProductSearchInput();
        return;
      }

      if (cartTotals.total <= 0) {
        setErrorMessage('O total final da venda precisa ser maior que zero.');
        focusProductSearchInput();
        return;
      }

      setQuickCashSale(createQuickCashSaleState(cartTotals.total));
      setProductSearch('');
      setErrorMessage('');
      setSuccessSale(null);
      return;
    }

    if (!term || term === '0') {
      openProductLookup(productSearchCommand.quantity, term);
      return;
    }

    const exactProduct = findExactProductMatch(products, term);

    if (exactProduct) {
      addProductToCart(exactProduct, productSearchCommand.quantity);
      setProductSearch('');
      focusProductSearchInput();
      return;
    }

    openProductLookup(productSearchCommand.quantity, term);
  }, [
    addProductToCart,
    cartItems.length,
    cartTotals.total,
    focusProductSearchInput,
    openProductLookup,
    productSearchCommand,
    products,
  ]);

  const handleProductSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      executeProductSearchCommand();
    },
    [executeProductSearchCommand],
  );

  const selectLookupProduct = useCallback(
    (product: ProductItem) => {
      addProductToCart(product, productLookupQuantity);
      setProductLookupOpen(false);
      setProductSearch('');
      focusProductSearchInput();
    },
    [addProductToCart, focusProductSearchInput, productLookupQuantity],
  );

  const handleProductLookupKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;

      const exactProduct =
        findExactProductMatch(products, productLookupSearch) ||
        (productLookupSearch.trim() && productLookupResults.length === 1
          ? productLookupResults[0]
          : null);

      if (!exactProduct) return;

      event.preventDefault();
      selectLookupProduct(exactProduct);
    },
    [productLookupResults, productLookupSearch, products, selectLookupProduct],
  );

  const updateCartItem = useCallback((lineId: string, field: EditableCartItemField, value: string) => {
    setCartItems((current) =>
      current.map((item) =>
        item.lineId === lineId ? ({ ...item, [field]: value } as CartItem) : item,
      ),
    );
  }, []);

  const removeCartItem = useCallback((lineId: string) => {
    setCartItems((current) => current.filter((item) => item.lineId !== lineId));
  }, []);

  const handlePaymentMethodCardClick = useCallback(
    (paymentMethod: PaymentMethod) => {
      const currentAmount = paymentAmountByMethod.get(paymentMethod) || 0;
      if (currentAmount > 0) {
        setPaymentRows((current) =>
          current.filter((payment) => payment.paymentMethod !== paymentMethod),
        );
        setPaymentAmountModal(null);
        return;
      }

      const remainingAmount = Math.max(0, cartTotals.total - cartTotals.paymentTotal);
      const nextAmount = remainingAmount || cartTotals.total;
      const nextDueDate = supportsPaymentInstallments(paymentMethod) ? getNextMonthDateInput() : getTodayDateInput();
      setPaymentAmountModal({
        paymentMethod,
        amount: formatNumberInput(nextAmount),
        installmentCount: '1',
        dueDate: nextDueDate,
        installments: buildPaymentInstallmentDrafts(nextAmount, 1, nextDueDate),
      });
    },
    [cartTotals.paymentTotal, cartTotals.total, paymentAmountByMethod],
  );

  const confirmPaymentAmount = useCallback(() => {
    if (!paymentAmountModal) return;

    const supportsInstallments = supportsPaymentInstallments(paymentAmountModal.paymentMethod);
    const amount = supportsInstallments
      ? sumPaymentInstallmentDrafts(paymentAmountModal.installments)
      : parseDecimal(paymentAmountModal.amount);
    const installmentCount = Math.max(
      1,
      Number.parseInt(paymentAmountModal.installmentCount || '1', 10) || 1,
    );
    if (amount <= 0) {
      setCheckoutFeedback({
        type: 'error',
        title: 'VALOR INVÁLIDO !!!',
        message: 'Informe o valor da forma de pagamento.',
      });
      focusPaymentAmountInput();
      return;
    }

    const nextPayments: PaymentRow[] =
      supportsInstallments && isDeferredPayment(paymentAmountModal.paymentMethod)
        ? paymentAmountModal.installments.map((installment) => ({
            ...createDefaultPayment(parseDecimal(installment.amount)),
            paymentMethod: paymentAmountModal.paymentMethod,
            dueDate: installment.dueDate,
            installmentCount: '1',
            cardInstallmentCount: '1',
          }))
        : [{
        ...createDefaultPayment(amount),
        paymentMethod: paymentAmountModal.paymentMethod,
        dueDate: isDeferredPayment(paymentAmountModal.paymentMethod)
          ? paymentAmountModal.dueDate
          : getTodayDateInput(),
        installmentCount: isDeferredPayment(paymentAmountModal.paymentMethod)
          ? String(installmentCount)
          : '1',
        cardInstallmentCount: paymentAmountModal.paymentMethod === 'CREDIT_CARD'
          ? String(installmentCount)
          : '1',
      }];

    setPaymentRows((current) => [
      ...current.filter((payment) => payment.paymentMethod !== paymentAmountModal.paymentMethod),
      ...nextPayments,
    ]);
    setPaymentAmountModal(null);
    setErrorMessage('');
    setCheckoutFeedback(null);
  }, [focusPaymentAmountInput, paymentAmountModal]);

  const clearSale = useCallback(() => {
    setCartItems([]);
    if (saleDraftStorageKey) {
      writeSaleDraftCart(saleDraftStorageKey, []);
    }
    setPaymentRows([]);
    setPaymentAmountModal(null);
    setSaleDiscount('');
    setNotes('');
    setCustomer({
      name: '',
      document: '',
      email: '',
      phone: '',
      referenceName: '',
    });
  }, [saleDraftStorageKey]);

  const clearWholeSale = useCallback(() => {
    clearSale();
    setProductSearch('');
    setProductLookupOpen(false);
    setProductLookupSearch('');
    setGenericProductDraft(null);
    setCheckoutOpen(false);
    setCheckoutFeedback(null);
    setQuickCashSale(null);
    setErrorMessage('');
    setSuccessSale(null);
  }, [clearSale]);

  const searchExternalPeople = useCallback(
    async (search: string) => {
      const normalizedSearch = search.trim();
      if (!normalizedSearch || typeof window === 'undefined' || window.parent === window) {
        return [];
      }

      const requestId = generateId('people-search');

      return new Promise<PersonLookupResult[]>((resolve) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener('message', handleResult);
          resolve([]);
        }, 8000);

        function handleResult(event: MessageEvent) {
          const payload = event.data;
          if (!payload || payload.type !== 'MSINFOR_PEOPLE_SEARCH_RESULT' || payload.requestId !== requestId) {
            return;
          }

          window.clearTimeout(timeout);
          window.removeEventListener('message', handleResult);

          const results = Array.isArray(payload.results)
            ? payload.results.map((item: any, index: number) => ({
                id: [
                  item.id,
                  item.document || item.cpf || item.cnpj,
                  item.email,
                  item.phone || item.whatsapp || item.cellphone1,
                  item.sourceType || item.role,
                  index,
                ].filter(Boolean).join(':') || generateId('person'),
                name: String(item.name || ''),
                document: item.document || item.cpf || item.cnpj || null,
                email: item.email || null,
                phone: item.phone || item.whatsapp || item.cellphone1 || null,
                sourceType: item.sourceType || item.role || null,
              })).filter((item: PersonLookupResult) => item.name)
            : [];

          resolve(results.slice(0, 12));
        }

        window.addEventListener('message', handleResult);
        window.parent.postMessage(
          {
            type: 'MSINFOR_PEOPLE_SEARCH',
            requestId,
            search: normalizedSearch,
            sourceSystem: runtimeContext.sourceSystem,
          },
          '*',
        );
      });
    },
    [runtimeContext.sourceSystem],
  );

  const performQuickCashPeopleSearch = useCallback(async (rawSearch: string) => {
    const search = rawSearch.trim();
    if (!search) {
      setQuickCashSale((current) =>
        current
          ? {
              ...current,
              feedback: {
                type: 'error',
                title: 'PESQUISA VAZIA !!!',
                message: 'Informe um nome, CPF, CNPJ ou e-mail para pesquisar no cadastro de pessoas.',
              },
            }
          : current,
      );
      return;
    }

    setQuickCashSale((current) =>
      current ? { ...current, personSearch: search, isSearchingPeople: true, feedback: null } : current,
    );

    const results = await searchExternalPeople(search);

    setQuickCashSale((current) =>
      current
        ? {
            ...current,
            isSearchingPeople: false,
            personResults: results,
            feedback: results.length
              ? null
              : {
                  type: 'error',
                  title: 'NENHUMA PESSOA !!!',
                  message: 'Nenhum cadastro de pessoa foi encontrado para a pesquisa informada.',
                },
          }
        : current,
    );
  }, [searchExternalPeople]);

  const openQuickCashPeopleSearch = useCallback(() => {
    setQuickCashSale((current) =>
      current ? { ...current, isPeopleSearchOpen: true, feedback: null } : current,
    );
  }, []);

  useEffect(() => {
    if (!quickCashSale?.isPeopleSearchOpen) return;

    const search = quickCashSale.personSearch.trim();
    if (search.length < 2) {
      setQuickCashSale((current) =>
        current ? { ...current, personResults: [], isSearchingPeople: false } : current,
      );
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(() => {
      setQuickCashSale((current) =>
        current ? { ...current, isSearchingPeople: true, feedback: null } : current,
      );

      void searchExternalPeople(search).then((results) => {
        if (!isActive) return;
        setQuickCashSale((current) =>
          current
            ? {
                ...current,
                isSearchingPeople: false,
                personResults: results,
              }
            : current,
        );
      });
    }, 350);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [quickCashSale?.isPeopleSearchOpen, quickCashSale?.personSearch, searchExternalPeople]);

  const selectQuickCashPerson = useCallback((person: PersonLookupResult) => {
    setQuickCashSale((current) =>
      current
        ? {
            ...current,
            customerName: person.name,
            document: person.document || current.document,
            customerEmail: person.email || '',
            customerPhone: person.phone || '',
            personResults: [],
            personSearch: person.name,
            isPeopleSearchOpen: false,
            feedback: null,
          }
        : current,
    );
  }, []);

  const confirmQuickCashSale = useCallback(async () => {
    if (!quickCashSale) return;

    if (!canLoadContext) {
      setQuickCashSale((current) =>
        current
          ? {
              ...current,
              feedback: {
                type: 'error',
                title: 'ATENÇÃO !!!',
                message: 'Abra a tela pelo sistema consumidor para carregar empresa e filial.',
              },
            }
          : current,
      );
      return;
    }

    if (!cartItems.length || cartTotals.total <= 0) {
      setQuickCashSale((current) =>
        current
          ? {
              ...current,
              feedback: {
                type: 'error',
                title: 'VENDA VAZIA !!!',
                message: 'Inclua ao menos um produto com valor antes de finalizar à vista.',
              },
            }
          : current,
      );
      return;
    }

    const amountPaid = parseDecimal(quickCashSale.amountPaid);
    if (amountPaid < cartTotals.total) {
      setQuickCashSale((current) =>
        current
          ? {
              ...current,
              feedback: {
                type: 'error',
                title: 'VALOR INSUFICIENTE !!!',
                message: 'O valor pago precisa ser igual ou maior que o total final da venda.',
                details: [
                  { label: 'Total final', value: formatCurrency(cartTotals.total), tone: 'neutral' },
                  { label: 'Valor pago', value: formatCurrency(amountPaid), tone: 'warning' },
                  { label: 'Faltando', value: formatCurrency(cartTotals.total - amountPaid), tone: 'danger' },
                ],
              },
            }
          : current,
      );
      return;
    }

    const documentError = validateOptionalBrazilDocument(quickCashSale.document);
    if (documentError) {
      setQuickCashSale((current) =>
        current
          ? {
              ...current,
              feedback: {
                type: 'error',
                title: 'DOCUMENTO INVÁLIDO !!!',
                message: documentError,
              },
            }
          : current,
      );
      return;
    }

    const changeAmount = Math.max(0, amountPaid - cartTotals.total);
    const quickCustomer: CustomerState = {
      name: quickCashSale.customerName.trim() || (quickCashSale.document.trim() ? 'CONSUMIDOR' : ''),
      document: quickCashSale.document,
      email: quickCashSale.customerEmail,
      phone: quickCashSale.customerPhone,
      referenceName: '',
    };
    const quickNotes = [
      notes,
      'ATALHO VV - VENDA À VISTA',
      `VALOR PAGO: ${formatCurrency(amountPaid)}`,
      `TROCO: ${formatCurrency(changeAmount)}`,
      quickCashSale.futureDelivery ? 'ENTREGA FUTURA: SIM - NÃO EMITIR NOTA/CUPOM FISCAL AUTOMATICAMENTE' : '',
    ]
      .filter(Boolean)
      .join(' | ');

    setIsSubmitting(true);
    setQuickCashSale((current) => (current ? { ...current, feedback: null } : current));

    try {
      const payload = buildSalePayload({
        runtimeContext,
        saleChannel,
        customer: quickCustomer,
        cartItems,
        paymentRows: [
          {
            ...createDefaultPayment(cartTotals.total),
            paymentMethod: 'CASH',
            amount: formatNumberInput(cartTotals.total),
            dueDate: getTodayDateInput(),
          },
        ],
        saleDiscount,
        notes: quickNotes,
        allowSaleItemDiscount: branchSaleConfig.allowSaleItemDiscount,
      });
      const created = await requestJson<CreatedSale>('/sales', {
        method: 'POST',
        body: JSON.stringify(payload),
        fallbackMessage: 'Não foi possível confirmar a venda à vista.',
      });

      clearSale();
      setSuccessSale(created);
      setQuickCashSale((current) =>
        current
          ? {
              ...current,
              feedback: {
                type: 'success',
                title: 'VENDA À VISTA CONFIRMADA !!!',
                message: `Venda ${created.saleNumber} confirmada com sucesso.`,
                details: [
                  { label: 'Total final', value: formatCurrency(cartTotals.total), tone: 'success' },
                  { label: 'Valor pago', value: formatCurrency(amountPaid), tone: 'neutral' },
                  { label: 'Troco', value: formatCurrency(changeAmount), tone: 'warning' },
                ],
                closeCheckoutOnOk: true,
              },
            }
          : current,
      );
      await loadData();
    } catch (error) {
      setQuickCashSale((current) =>
        current
          ? {
              ...current,
              feedback: {
                type: 'error',
                title: 'ERRO AO CONFIRMAR !!!',
                message: getFriendlyRequestErrorMessage(error, 'Não foi possível confirmar a venda à vista.'),
              },
            }
          : current,
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    branchSaleConfig.allowSaleItemDiscount,
    canLoadContext,
    cartItems,
    cartTotals.total,
    clearSale,
    loadData,
    notes,
    quickCashSale,
    runtimeContext,
    saleChannel,
    saleDiscount,
  ]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!canLoadContext) {
        setCheckoutFeedback({
          type: 'error',
          title: 'ATENÇÃO !!!',
          message: 'Abra a tela pelo sistema consumidor para carregar empresa e filial.',
        });
        return;
      }

      if (!cartItems.length) {
        setCheckoutFeedback({
          type: 'error',
          title: 'ATENÇÃO !!!',
          message: 'Inclua ao menos um produto no carrinho.',
        });
        return;
      }

      if (cartTotals.total <= 0) {
        setCheckoutFeedback({
          type: 'error',
          title: 'ATENÇÃO !!!',
          message: 'O total final da venda precisa ser maior que zero.',
        });
        return;
      }

      if (Math.abs(cartTotals.paymentTotal - cartTotals.total) > 0.01) {
        const difference = cartTotals.total - cartTotals.paymentTotal;
        const selectedPayments = paymentRows
          .filter((payment) => parseDecimal(payment.amount) > 0)
          .map((payment) => ({
            label: getPaymentMethodLabel(payment.paymentMethod),
            value: formatCurrency(parseDecimal(payment.amount)),
          }));

        setCheckoutFeedback({
          type: 'error',
          title: 'PAGAMENTO DIVERGENTE !!!',
          message: 'A soma das formas de pagamento precisa fechar o total final da venda.',
          details: [
            {
              label: 'Total esperado',
              value: formatCurrency(cartTotals.total),
              tone: 'neutral',
            },
            {
              label: 'Total informado',
              value: formatCurrency(cartTotals.paymentTotal),
              tone: cartTotals.paymentTotal > cartTotals.total ? 'danger' : 'warning',
            },
            {
              label: difference > 0 ? 'Valor faltante' : 'Valor excedente',
              value: formatCurrency(Math.abs(difference)),
              tone: difference > 0 ? 'warning' : 'danger',
            },
          ],
          paymentBreakdown: selectedPayments.length
            ? selectedPayments
            : [{ label: 'Nenhuma forma selecionada', value: formatCurrency(0) }],
        });
        setCheckoutOpen(true);
        setCheckoutTab('payment');
        return;
      }

      setIsSubmitting(true);
      setErrorMessage('');
      setSuccessSale(null);
      setCheckoutFeedback(null);

      try {
        const payload = buildSalePayload({
          runtimeContext,
          saleChannel,
          customer,
          cartItems,
          paymentRows,
          saleDiscount,
          notes,
          allowSaleItemDiscount: branchSaleConfig.allowSaleItemDiscount,
        });
        const created = await requestJson<CreatedSale>('/sales', {
          method: 'POST',
          body: JSON.stringify(payload),
          fallbackMessage: 'Não foi possível confirmar a venda.',
        });

        clearSale();
        setSuccessSale(created);
        setCheckoutFeedback({
          type: 'success',
          title: 'VENDA CONFIRMADA !!!',
          message: `Venda ${created.saleNumber} confirmada com sucesso.`,
          closeCheckoutOnOk: true,
        });
        await loadData();
      } catch (error) {
        setCheckoutFeedback({
          type: 'error',
          title: 'ERRO AO CONFIRMAR !!!',
          message: getFriendlyRequestErrorMessage(error, 'Não foi possível confirmar a venda.'),
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      canLoadContext,
      cartItems,
      clearSale,
      customer,
      loadData,
      notes,
      paymentRows,
      runtimeContext,
      saleChannel,
      saleDiscount,
      branchSaleConfig.allowSaleItemDiscount,
      cartTotals.paymentTotal,
      cartTotals.total,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className={`flex h-[100dvh] min-h-0 flex-col overflow-hidden ${pageBottomPaddingClass}`}>
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-0 flex-1 flex-col gap-3 bg-slate-50 p-3">
          <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
              <input
                ref={productSearchInputRef}
                className={`${inputClass} py-1.5`}
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                onKeyDown={handleProductSearchKeyDown}
                placeholder="Ex.: 10*2, 3*BARRAS, SKU ou 0 para pesquisar"
              />
              <button
                type="button"
                onClick={executeProductSearchCommand}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100"
              >
                Pesquisar
              </button>
              <button
                type="button"
                onClick={clearWholeSale}
                disabled={!cartItems.length}
                title="limpar toda a venda"
                aria-label="limpar toda a venda"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M6 6l1 15h10l1-15" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
            {productSearchCommand.quantity > 1 && (
              <div className="mt-2 inline-flex rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                Quantidade: {formatQuantityInput(productSearchCommand.quantity)}
              </div>
            )}
          </section>

          <div className="min-h-0 flex-1">
          <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="min-h-0 flex-1 overflow-x-auto">
                <div className="flex h-full min-w-[920px] flex-col">
                  <div
                    className="grid shrink-0 items-center gap-2 bg-blue-700 px-3 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-white"
                    style={{ gridTemplateColumns: cartGridTemplate }}
                  >
                    <div className="text-left">Item</div>
                    <div>
                      <div>Produto/Serviço</div>
                      <label className="mt-1 flex h-7 items-center gap-1.5 rounded-lg bg-white/15 px-2 text-white ring-1 ring-white/25 focus-within:bg-white/20">
                        <svg
                          className="h-3.5 w-3.5 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.3-4.3" />
                        </svg>
                        <input
                          value={cartDescriptionSearch}
                          onChange={(event) => setCartDescriptionSearch(event.target.value)}
                          className="h-full min-w-0 flex-1 bg-transparent text-[10px] font-bold uppercase tracking-normal text-white placeholder:text-blue-100/80 focus:outline-none"
                          placeholder="PESQUISAR"
                        />
                      </label>
                    </div>
                    <div className="text-right">
                      <span className="block">Valor</span>
                      <span className="block">Unitário</span>
                    </div>
                    {branchSaleConfig.allowSaleItemDiscount ? (
                      <div className="text-right">
                        <span className="block">Desconto</span>
                        <span className="block">unitário</span>
                      </div>
                    ) : null}
                    <div className="text-right">Quantidade</div>
                    <div className="text-right">Valor Total</div>
                    <div />
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto">
                  {visibleCartItems.map((item, index) => {
                    const quantity = parseDecimal(item.quantity);
                    const unitPrice = parseDecimal(item.unitPrice);
                    const unitDiscount = branchSaleConfig.allowSaleItemDiscount
                      ? parseDecimal(item.discountAmount)
                      : 0;
                    const lineTotal = Math.max(0, quantity * unitPrice - quantity * unitDiscount);
                    const genericItem = isGenericProduct(item.product);
                    const canEditUnitPrice =
                      branchSaleConfig.allowSaleUnitPriceEdit || genericItem;
                    const itemName = genericItem && item.description ? item.description : item.product.name;
                    const rowTone = index % 2 === 0 ? 'bg-blue-50' : 'bg-slate-50';

                    return (
                      <div key={item.lineId} className={`border-t border-slate-200 ${rowTone}`}>
                        <div
                          className="grid items-center gap-2 px-3 py-2"
                          style={{ gridTemplateColumns: cartGridTemplate }}
                        >
                          <div className="text-left text-xs font-black text-blue-700">
                            {item.itemNumber}
                          </div>

                          <div className="min-w-0">
                            {genericItem ? (
                              <input
                                className={`${compactInputClass} bg-white/90`}
                                value={item.description}
                                onChange={(event) => updateCartItem(item.lineId, 'description', event.target.value)}
                                placeholder="DESCRIÇÃO DO ITEM"
                              />
                            ) : (
                              <div className="truncate text-sm font-black text-slate-900">{itemName}</div>
                            )}
                            <div className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                              {genericItem ? 'PRODUTO GENÉRICO' : item.product.internalCode || item.product.sku || 'PRODUTO'} · Estoque: {getStockLabel(item.product)}
                            </div>
                          </div>

                          <input
                            className={`${compactInputClass} bg-white/90 text-right disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`}
                            value={item.unitPrice}
                            disabled={!canEditUnitPrice}
                            onChange={(event) => updateCartItem(item.lineId, 'unitPrice', event.target.value)}
                            onBlur={(event) =>
                              updateCartItem(item.lineId, 'unitPrice', formatMoneyInputValue(event.target.value))
                            }
                          />

                          {branchSaleConfig.allowSaleItemDiscount ? (
                            <input
                              className={`${compactInputClass} bg-white/90 text-right`}
                              value={item.discountAmount}
                              onChange={(event) =>
                                updateCartItem(item.lineId, 'discountAmount', event.target.value)
                              }
                              onBlur={(event) =>
                                updateCartItem(item.lineId, 'discountAmount', formatMoneyInputValue(event.target.value))
                              }
                            />
                          ) : null}

                          <input
                            className={`${compactInputClass} bg-white/90 text-right`}
                            value={item.quantity}
                            onChange={(event) => updateCartItem(item.lineId, 'quantity', event.target.value)}
                          />

                          <div className="text-right text-sm font-black text-slate-950">
                            {formatCurrency(lineTotal)}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeCartItem(item.lineId)}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                            title="Remover item"
                            aria-label="Remover item"
                          >
                            ×
                          </button>
                        </div>

                        {(item.product.usesColorSize || item.product.usesLotControl) && (
                          <div className="grid gap-2 border-t border-white/70 px-3 pb-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
                            {item.product.usesColorSize && (
                              <>
                                <label>
                                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Cor</span>
                                  <input
                                    className={`${compactInputClass} bg-white/90`}
                                    value={item.colorName}
                                    onChange={(event) => updateCartItem(item.lineId, 'colorName', event.target.value)}
                                    placeholder="Ex.: AZUL"
                                  />
                                </label>
                                <label>
                                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Número</span>
                                  <input
                                    className={`${compactInputClass} bg-white/90`}
                                    value={item.sizeCode}
                                    onChange={(event) => updateCartItem(item.lineId, 'sizeCode', event.target.value)}
                                    placeholder="Ex.: 34"
                                  />
                                </label>
                              </>
                            )}
                            {item.product.usesLotControl && (
                              <>
                                <label>
                                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Lote</span>
                                  <input
                                    className={`${compactInputClass} bg-white/90`}
                                    value={item.lotNumber}
                                    onChange={(event) => updateCartItem(item.lineId, 'lotNumber', event.target.value)}
                                  />
                                </label>
                                <label>
                                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Validade</span>
                                  <input
                                    type="date"
                                    className={`${compactInputClass} bg-white/90`}
                                    value={item.lotExpirationDate}
                                    onChange={(event) => updateCartItem(item.lineId, 'lotExpirationDate', event.target.value)}
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {cartItems.length > 0 && !visibleCartItems.length && (
                    <div className="border-t border-slate-200 bg-slate-50 p-8 text-center">
                      <div className="text-sm font-black text-slate-700">Nenhum item encontrado</div>
                      <div className="mt-1 text-xs font-semibold text-slate-400">A venda continua com os itens lançados.</div>
                    </div>
                  )}

                  {!cartItems.length && (
                    <div className="border-t border-slate-200 bg-slate-50 p-10 text-center">
                      <div className="text-sm font-black text-slate-700">Carrinho vazio</div>
                      <div className="mt-1 text-xs font-semibold text-slate-400">Selecione um produto para iniciar a venda.</div>
                    </div>
                  )}
                  </div>
                </div>
              </div>
            </div>

          </section>
          </div>
        </div>
      </section>

      <section className={`fixed inset-x-3 z-40 sm:inset-x-4 ${footerBottomClass}`}>
        <div className="mx-auto max-w-[1540px] rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl shadow-slate-950/20 backdrop-blur">
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-[200px_minmax(140px,1fr)_minmax(140px,1fr)_minmax(240px,0.95fr)_58px]">
            <button
              type="button"
              disabled={!cartItems.length}
              onClick={() => {
                setCheckoutTab('payment');
                setCheckoutOpen(true);
              }}
              className="flex min-h-10 w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-1.5 text-center text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              Finalizar venda
            </button>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Subtotal</div>
              <div className="text-lg font-black leading-tight text-slate-950">{formatCurrency(cartTotals.subtotal)}</div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Descontos</div>
              <div className="text-lg font-black leading-tight text-amber-700">{formatCurrency(cartTotals.discount)}</div>
            </div>

            <div className="rounded-xl border border-blue-600 bg-blue-700 px-3 py-1.5 text-white shadow-lg shadow-blue-900/20">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-100">Total final</div>
              <div className="text-2xl font-black leading-tight text-white">{formatCurrency(cartTotals.total)}</div>
            </div>

            {cashSessionDetailHref ? (
              <Link
                href={cashSessionDetailHref}
                title={cashSessionButtonTitle}
                aria-label={cashSessionButtonTitle}
                className="flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
              >
                <span aria-hidden="true" className="text-3xl font-black leading-none">$</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title={cashSessionButtonTitle}
                aria-label={cashSessionButtonTitle}
                className="flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400"
              >
                <span aria-hidden="true" className="text-3xl font-black leading-none">$</span>
              </button>
            )}
          </div>

          {!runtimeContext.embedded && (
            <ScreenNameCopy
              screenId={screenId}
              className="ml-auto mt-2 max-w-full justify-end rounded-2xl bg-slate-50 px-3 py-2 text-right"
              originText="Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/vendas/page.tsx"
              auditText={auditText}
              sqlText={auditSql}
            />
          )}
        </div>
      </section>

      {quickCashSale && (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-3 py-4 backdrop-blur-sm">
          <div className="relative flex max-h-[calc(100vh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25">
            <div className="bg-blue-700 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white">
                    {runtimeContext.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={runtimeContext.logoUrl} alt="Logotipo" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs font-black text-slate-900">MS</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-3xl font-black uppercase leading-tight">VENDA A VISTA</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickCashSale(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-lg font-black text-white transition hover:bg-white/20"
                  title="Fechar"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="mb-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Total final</div>
                  <div className="mt-1 text-lg font-black">{formatCurrency(cartTotals.total)}</div>
                </div>
                <label className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  <span className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">
                    Valor pago
                  </span>
                  <input
                    className="mt-1 w-full border-0 bg-transparent p-0 text-right text-lg font-black text-amber-800 outline-none"
                    value={quickCashSale.amountPaid}
                    onChange={(event) =>
                      setQuickCashSale((current) =>
                        current ? { ...current, amountPaid: event.target.value, feedback: null } : current,
                      )
                    }
                    onBlur={(event) =>
                      setQuickCashSale((current) =>
                        current
                          ? { ...current, amountPaid: formatMoneyInputValue(event.target.value) }
                          : current,
                      )
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    autoFocus
                  />
                </label>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Troco</div>
                  <div className="mt-1 text-lg font-black">
                    {formatCurrency(Math.max(0, parseDecimal(quickCashSale.amountPaid) - cartTotals.total))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_0.85fr]">
                <div className="space-y-3 lg:col-span-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                        Documento fiscal futuro
                      </div>
                      <button
                        type="button"
                        onClick={openQuickCashPeopleSearch}
                        disabled={quickCashSale.isSearchingPeople}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {quickCashSale.isSearchingPeople ? 'Buscando...' : 'Buscar cadastro'}
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <label className="flex min-h-9 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">
                        <input
                          type="checkbox"
                          checked={quickCashSale.futureDelivery}
                          onChange={(event) =>
                            setQuickCashSale((current) =>
                              current ? { ...current, futureDelivery: event.target.checked } : current,
                            )
                          }
                          className="h-4 w-4 accent-amber-600"
                        />
                        Entrega futura
                      </label>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          { label: 'CPF/CNPJ', value: quickCashSale.document },
                          { label: 'Nome', value: quickCashSale.customerName },
                          { label: 'Telefone', value: quickCashSale.customerPhone },
                          { label: 'E-mail', value: quickCashSale.customerEmail },
                        ].map((item) => (
                          <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                            <div className="mt-1 truncate text-xs font-black uppercase text-slate-800">
                              {formatLookupValue(item.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <ScreenNameCopy
                  screenId={QUICK_CASH_SCREEN_ID}
                  className="min-w-0 max-w-full flex-1 overflow-hidden rounded-xl bg-white px-2 py-1 text-left text-[8px] tracking-[0.12em] sm:max-w-[calc(100%-17rem)]"
                  originText="Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/vendas/page.tsx"
                  auditText="Popup exclusivo do atalho VV para finalizar venda à vista, calcular troco e registrar documento fiscal futuro."
                />
                <div className="flex shrink-0 justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickCashSale(null)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 hover:bg-slate-50"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={confirmQuickCashSale}
                    disabled={isSubmitting}
                    className="min-w-36 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSubmitting ? 'Confirmando...' : 'Confirmar à vista'}
                  </button>
                </div>
              </div>
            </div>

            {quickCashSale.isPeopleSearchOpen ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30">
                  <div className="bg-blue-700 px-5 py-4 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white">
                          {runtimeContext.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={runtimeContext.logoUrl} alt="Logotipo" className="h-full w-full object-contain" />
                          ) : (
                            <span className="text-xs font-black text-slate-900">MS</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-2xl font-black uppercase leading-tight">PESQUISAR PESSOAS</h3>
                          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100">
                            Cadastro vinculado ao documento fiscal futuro
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setQuickCashSale((current) =>
                            current ? { ...current, isPeopleSearchOpen: false } : current,
                          )
                        }
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg font-black text-white transition hover:bg-white/20"
                        title="Fechar"
                        aria-label="Fechar"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="p-4">
                    <div>
                      <input
                        className={`${inputClass} text-sm`}
                        value={quickCashSale.personSearch}
                        onChange={(event) =>
                          setQuickCashSale((current) =>
                            current ? { ...current, personSearch: event.target.value } : current,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          void performQuickCashPeopleSearch(quickCashSale.personSearch);
                        }}
                        placeholder="NOME, CPF, CNPJ OU E-MAIL"
                        autoFocus
                      />
                    </div>

                    <div className="mt-4 max-h-64 space-y-2 overflow-auto pr-1">
                      {quickCashSale.isSearchingPeople ? (
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center text-xs font-black uppercase tracking-[0.12em] text-blue-700">
                          FILTRANDO CADASTRO...
                        </div>
                      ) : null}
                      {quickCashSale.personResults.map((person, index) => (
                        <button
                          type="button"
                          key={`${person.id}:${index}`}
                          onClick={() => selectQuickCashPerson(person)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                        >
                          <div className="truncate text-sm font-black uppercase text-slate-900">{person.name}</div>
                          <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                            {[person.document, person.phone, person.email, person.sourceType].filter(Boolean).join(' · ') || 'CADASTRO'}
                          </div>
                        </button>
                      ))}
                      {!quickCashSale.isSearchingPeople && !quickCashSale.personResults.length ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
                          {quickCashSale.personSearch.trim().length >= 2
                            ? 'NENHUMA PESSOA ENCONTRADA.'
                            : 'DIGITE PELO MENOS 2 CARACTERES PARA FILTRAR.'}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <ScreenNameCopy
                      screenId={QUICK_CASH_PEOPLE_SEARCH_SCREEN_ID}
                      className="max-w-full justify-start rounded-xl bg-white px-2 py-1 text-left text-[8px] tracking-[0.12em]"
                      originText="Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/vendas/page.tsx"
                      auditText="Popup exclusivo de pesquisa de pessoas do atalho de venda à vista."
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {quickCashSale.feedback ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30">
                  <div className={`px-5 py-4 text-white ${quickCashSale.feedback.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white">
                        {runtimeContext.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={runtimeContext.logoUrl} alt="Logotipo" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-xs font-black text-slate-900">MS</span>
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                          {quickCashSale.feedback.type === 'success' ? 'Sucesso' : 'Atenção'}
                        </div>
                        <div className="mt-1 text-lg font-black uppercase tracking-[0.04em]">
                          {quickCashSale.feedback.title}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-5">
                    <p className="text-sm font-bold leading-6 text-slate-700">{quickCashSale.feedback.message}</p>
                    {quickCashSale.feedback.details?.length ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {quickCashSale.feedback.details.map((detail) => (
                          <div key={detail.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                            <div className="text-[9px] font-black uppercase tracking-[0.14em] opacity-75">{detail.label}</div>
                            <div className="mt-1 text-base font-black leading-tight">{detail.value}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const shouldClose = quickCashSale.feedback?.closeCheckoutOnOk;
                          setQuickCashSale((current) => (current ? { ...current, feedback: null } : current));
                          if (shouldClose) {
                            setQuickCashSale(null);
                            setSuccessSale(null);
                          }
                        }}
                        className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg ${
                          quickCashSale.feedback.type === 'success'
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
        </section>
      )}

      {checkoutOpen && (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-2 py-2">
          <div className="relative flex max-h-[calc(100vh-1rem)] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600">Finalização</div>
                  <h2 className="mt-0.5 truncate text-lg font-black leading-tight text-slate-950">Fechamento da venda</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                title="Fechar"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setCheckoutTab('payment')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition ${
                  checkoutTab === 'payment'
                    ? 'bg-blue-700 text-white shadow-lg shadow-blue-900/15'
                    : 'text-slate-500 hover:bg-white hover:text-slate-800'
                }`}
              >
                1° Forma de pagamento
              </button>
              <button
                type="button"
                onClick={() => setCheckoutTab('customer')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition ${
                  checkoutTab === 'customer'
                    ? 'bg-blue-700 text-white shadow-lg shadow-blue-900/15'
                    : 'text-slate-500 hover:bg-white hover:text-slate-800'
                }`}
              >
                2° Cliente
              </button>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-auto pr-1">
              {checkoutTab === 'customer' ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Cliente</div>
                <h2 className="text-base font-black text-slate-900">Pagador e referência</h2>
                <div className="mt-2 grid gap-1.5">
                  <input
                    className={compactInputClass}
                    value={customer.name}
                    onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Cliente / pagador"
                  />
                  <input
                    className={compactInputClass}
                    value={customer.document}
                    onChange={(event) => setCustomer((current) => ({ ...current, document: event.target.value }))}
                    placeholder="CPF/CNPJ"
                  />
                  <input
                    className={compactInputClass}
                    value={customer.referenceName}
                    onChange={(event) => setCustomer((current) => ({ ...current, referenceName: event.target.value }))}
                    placeholder="Referência opcional"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      className={compactInputClass}
                      value={customer.phone}
                      onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="Telefone"
                    />
                    <input
                      className={compactInputClass}
                      value={customer.email}
                      onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))}
                      placeholder="E-mail"
                    />
                  </div>
                </div>
              </div>
              ) : null}

              {checkoutTab === 'payment' ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Pagamento</div>
                    <h2 className="text-base font-black text-slate-900">Forma de pagamento</h2>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                    Math.abs(cartTotals.paymentTotal - cartTotals.total) <= 0.01
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}>
                    {formatCurrency(cartTotals.paymentTotal)}
                  </span>
                </div>

                <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-3">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Subtotal</div>
                    <div className="text-sm font-black text-slate-950">{formatCurrency(cartTotals.subtotal)}</div>
                  </div>
                  <label>
                    <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Desconto venda</span>
                    <input
                      className={`${compactInputClass} mt-1`}
                      value={saleDiscount}
                      onChange={(event) => setSaleDiscount(event.target.value)}
                      onBlur={(event) => setSaleDiscount(formatMoneyInputValue(event.target.value))}
                      placeholder="0,00"
                    />
                  </label>
                  <div className="rounded-xl border border-emerald-500 bg-emerald-600 px-3 py-2 text-white shadow-lg shadow-emerald-900/15">
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-100">Total final</div>
                    <div className="text-xl font-black leading-tight text-white">{formatCurrency(cartTotals.total)}</div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {PAYMENT_METHODS.map((method) => {
                    const selectedAmount = paymentAmountByMethod.get(method.id) || 0;
                    const isSelected = selectedAmount > 0;

                    return (
                      <button
                        type="button"
                        key={method.id}
                        onClick={() => handlePaymentMethodCardClick(method.id)}
                        className={`rounded-xl border p-2 text-left transition hover:shadow-sm ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-900/10'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                        title={method.description}
                      >
                        <div className="text-[10px] font-black uppercase tracking-[0.13em]">{method.shortLabel}</div>
                        <div className="mt-0.5 text-[10px] font-semibold opacity-80">
                          {isSelected ? formatCurrency(selectedAmount) : method.description}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <textarea
                  className={`${compactInputClass} mt-2 min-h-12 resize-none`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Observações"
                />

                <button
                  type="submit"
                  disabled={isSubmitting || !cartItems.length}
                  className="mt-2 flex h-10 w-full items-center justify-center rounded-xl bg-blue-700 px-4 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {isSubmitting ? 'Confirmando...' : 'Confirmar venda'}
                </button>
              </div>
              ) : null}
            </div>

            {paymentAmountModal ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/25">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-600">
                        Forma de pagamento
                      </div>
                      <h3 className="mt-1 text-lg font-black text-slate-950">
                        {getPaymentMethodLabel(paymentAmountModal.paymentMethod)}
                      </h3>
                    </div>
                  </div>
                  <label className="mt-3 block">
                    <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Valor
                    </span>
                    <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                      <input
                        ref={paymentAmountInputRef}
                        className={`${compactInputClass} text-right`}
                        value={paymentAmountModal.amount}
                        onChange={(event) =>
                          setPaymentAmountModal((current) => {
                            if (!current) return current;
                            const amount = parseDecimal(event.target.value);
                            const installmentCount = Math.max(
                              1,
                              Number.parseInt(current.installmentCount || '1', 10) || 1,
                            );
                            return {
                              ...current,
                              amount: event.target.value,
                              installments: buildPaymentInstallmentDrafts(
                                amount,
                                installmentCount,
                                current.dueDate || getNextMonthDateInput(),
                              ),
                            };
                          })
                        }
                        onBlur={(event) =>
                          setPaymentAmountModal((current) =>
                            current
                              ? { ...current, amount: formatMoneyInputValue(event.target.value) }
                              : current,
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          confirmPaymentAmount();
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentAmountModal((current) => {
                            if (!current) return current;
                            return {
                              ...current,
                              amount: '0',
                              installments: current.installments.map((installment) => ({
                                ...installment,
                                amount: '0',
                              })),
                            };
                          });
                          focusPaymentAmountInput();
                        }}
                        className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-black uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-100"
                        title="Zerar valor"
                      >
                        X
                      </button>
                    </div>
                  </label>
                  {supportsPaymentInstallments(paymentAmountModal.paymentMethod) ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                            Parcelas
                          </span>
                          <input
                            className={`${compactInputClass} mt-1 text-right`}
                            value={paymentAmountModal.installmentCount}
                            onChange={(event) =>
                              setPaymentAmountModal((current) => {
                                if (!current) return current;
                                const installmentCount = Math.max(
                                  1,
                                  Number.parseInt(event.target.value || '1', 10) || 1,
                                );
                                return {
                                  ...current,
                                  installmentCount: event.target.value,
                                  installments: buildPaymentInstallmentDrafts(
                                    parseDecimal(current.amount),
                                    installmentCount,
                                    current.dueDate || getNextMonthDateInput(),
                                  ),
                                };
                              })
                            }
                          />
                        </label>
                        <label>
                          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                            1° vencimento
                          </span>
                          <input
                            type="date"
                            className={`${compactInputClass} mt-1`}
                            value={paymentAmountModal.dueDate}
                            onChange={(event) =>
                              setPaymentAmountModal((current) => {
                                if (!current) return current;
                                return {
                                  ...current,
                                  dueDate: event.target.value,
                                  installments: current.installments.map((installment, index) => ({
                                    ...installment,
                                    dueDate: addMonthsToDateInput(event.target.value, index),
                                  })),
                                };
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="grid grid-cols-[70px_1fr_1fr] bg-blue-700 px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-white">
                          <div>Parc.</div>
                          <div>Vencimento</div>
                          <div className="text-right">Valor</div>
                        </div>
                        {paymentAmountModal.installments.map((installment, index) => (
                          <div
                            key={installment.number}
                            className="grid grid-cols-[70px_1fr_1fr] items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            <div>{installment.number}</div>
                            <input
                              type="date"
                              className={`${compactInputClass} px-2 py-1 text-[11px]`}
                              value={installment.dueDate}
                              onChange={(event) =>
                                setPaymentAmountModal((current) => {
                                  if (!current) return current;
                                  return {
                                    ...current,
                                    installments: current.installments.map((currentInstallment) =>
                                      currentInstallment.number === installment.number
                                        ? { ...currentInstallment, dueDate: event.target.value }
                                        : currentInstallment,
                                    ),
                                  };
                                })
                              }
                              onBlur={(event) =>
                                setPaymentAmountModal((current) => {
                                  if (!current) return current;
                                  return {
                                    ...current,
                                    installments: current.installments.map((currentInstallment) =>
                                      currentInstallment.number === installment.number
                                        ? {
                                            ...currentInstallment,
                                            amount: formatMoneyInputValue(event.target.value),
                                          }
                                        : currentInstallment,
                                    ),
                                  };
                                })
                              }
                            />
                            <input
                              className={`${compactInputClass} px-2 py-1 text-right text-[11px] font-black`}
                              value={installment.amount}
                              onChange={(event) =>
                                setPaymentAmountModal((current) => {
                                  if (!current) return current;
                                  const nextInstallments = current.installments.map((currentInstallment) =>
                                    currentInstallment.number === installment.number
                                      ? { ...currentInstallment, amount: event.target.value }
                                      : currentInstallment,
                                  );
                                  const recalculatedInstallments = recalculateFollowingInstallmentAmounts(
                                    nextInstallments,
                                    parseDecimal(current.amount),
                                    index,
                                  );
                                  return {
                                    ...current,
                                    amount: formatNumberInput(
                                      sumPaymentInstallmentDrafts(recalculatedInstallments),
                                    ),
                                    installments: recalculatedInstallments,
                                  };
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentAmountModal(null)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmPaymentAmount}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-700"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {checkoutFeedback ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/30">
                  <div
                    className={`px-5 py-4 text-white ${
                      checkoutFeedback.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white">
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
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                          {checkoutFeedback.type === 'success' ? 'Sucesso' : 'Atenção'}
                        </div>
                        <div className="mt-1 text-lg font-black uppercase tracking-[0.04em]">
                          {checkoutFeedback.title}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-5">
                    <p className="text-sm font-bold leading-6 text-slate-700">
                      {checkoutFeedback.message}
                    </p>
                    {checkoutFeedback.details?.length ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        {checkoutFeedback.details.map((detail) => {
                          const toneClass =
                            detail.tone === 'danger'
                              ? 'border-rose-200 bg-rose-50 text-rose-700'
                              : detail.tone === 'warning'
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : detail.tone === 'success'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-700';

                          return (
                            <div key={detail.label} className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
                              <div className="text-[9px] font-black uppercase tracking-[0.14em] opacity-75">
                                {detail.label}
                              </div>
                              <div className="mt-1 text-base font-black leading-tight">
                                {detail.value}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                    {checkoutFeedback.paymentBreakdown?.length ? (
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Formas selecionadas
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {checkoutFeedback.paymentBreakdown.map((payment) => (
                            <div
                              key={`${payment.label}-${payment.value}`}
                              className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700"
                            >
                              <span className="truncate uppercase tracking-[0.08em]">{payment.label}</span>
                              <span className="text-slate-950">{payment.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const shouldCloseCheckout = checkoutFeedback.closeCheckoutOnOk;
                          setCheckoutFeedback(null);
                          if (shouldCloseCheckout) {
                            setCheckoutOpen(false);
                            setSuccessSale(null);
                          }
                        }}
                        className={`rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg ${
                          checkoutFeedback.type === 'success'
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

            <div className="mt-2 border-t border-slate-100 pt-2">
              <ScreenNameCopy
                screenId={CHECKOUT_SCREEN_ID}
                className="max-w-full justify-end rounded-xl bg-slate-50 px-2 py-1 text-right"
                originText="Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/vendas/page.tsx"
                auditText="Popup exclusivo de finalização da venda, separado em abas de pagamento e cliente."
              />
            </div>
          </div>
        </section>
      )}

      {productLookupOpen && (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
          <div className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Pesquisa de produto</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Selecionar produto</h2>
              </div>
              <button
                type="button"
                onClick={() => setProductLookupOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                title="Fechar"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto]">
              <input
                className={inputClass}
                value={productLookupSearch}
                onChange={(event) => setProductLookupSearch(event.target.value)}
                onKeyDown={handleProductLookupKeyDown}
                placeholder="Pesquisar por nome, código interno, SKU ou barras"
              />
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-blue-700">
                Qtd: {formatQuantityInput(productLookupQuantity)}
              </div>
            </div>

            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
              {productLookupResults.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => selectLookupProduct(product)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">{product.name}</div>
                      <div className="mt-1 truncate text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        {product.internalCode || product.sku || product.barcode || 'SEM CÓDIGO'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-blue-700">{formatCurrency(product.salePrice || 0)}</div>
                      <div className={`mt-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${getStockTone(product)}`}>
                        {getStockLabel(product)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              {!productLookupResults.length && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">
                  Nenhum produto encontrado.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {genericProductDraft && (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Código interno 1</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">Produto genérico</h2>
              </div>
              <button
                type="button"
                onClick={() => setGenericProductDraft(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
                title="Fechar"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Descrição</span>
                <input
                  className={inputClass}
                  value={genericProductDraft.description}
                  onChange={(event) =>
                    setGenericProductDraft((current) =>
                      current ? { ...current, description: event.target.value } : current,
                    )
                  }
                  placeholder="Ex.: PRODUTO AVULSO"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label>
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Quantidade</span>
                  <input
                    className={inputClass}
                    value={genericProductDraft.quantity}
                    onChange={(event) =>
                      setGenericProductDraft((current) =>
                        current ? { ...current, quantity: event.target.value } : current,
                      )
                    }
                    placeholder="1"
                  />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Custo</span>
                  <input
                    className={inputClass}
                    value={genericProductDraft.unitCost}
                    onChange={(event) =>
                      setGenericProductDraft((current) =>
                        current ? { ...current, unitCost: event.target.value } : current,
                      )
                    }
                    onBlur={(event) =>
                      setGenericProductDraft((current) =>
                        current ? { ...current, unitCost: formatMoneyInputValue(event.target.value) } : current,
                      )
                    }
                    placeholder="0,00"
                  />
                </label>
                <label>
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Preço de venda</span>
                  <input
                    className={inputClass}
                    value={genericProductDraft.unitPrice}
                    onChange={(event) =>
                      setGenericProductDraft((current) =>
                        current ? { ...current, unitPrice: event.target.value } : current,
                      )
                    }
                    onBlur={(event) =>
                      setGenericProductDraft((current) =>
                        current ? { ...current, unitPrice: formatMoneyInputValue(event.target.value) } : current,
                      )
                    }
                    placeholder="0,00"
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGenericProductDraft(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={addGenericProductToCart}
                className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-800"
              >
                Adicionar
              </button>
            </div>
          </div>
        </section>
      )}

      {!checkoutOpen && (errorMessage || successSale) && (
        <section
          className={`rounded-2xl border p-4 text-sm font-bold shadow-sm ${
            errorMessage
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {errorMessage || `Venda ${successSale?.saleNumber} confirmada com sucesso.`}
        </section>
      )}

    </form>
  );
}
