'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type ManualFiscalKind = 'NFE' | 'NFSE';

type PartyOption = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
};

type ReadinessCheck = {
  code: string;
  ok: boolean;
  label: string;
  message: string;
};

type RecentDocument = {
  id: string;
  environment: string;
  series: number;
  number: number;
  status: string;
  statusMessage?: string | null;
  issuedAt?: string | null;
  recipientName?: string | null;
  takerName?: string | null;
  totalAmount?: number;
  netAmount?: number;
  receivableTitleId?: string | null;
  hasReceivable?: boolean;
};

type NfeOverview = {
  branch: {
    branchCode: number;
    name: string;
    fiscalLegalName: string | null;
  } | null;
  profile: {
    environment: string;
    series: number;
    nextNumber: number;
  } | null;
  operations: Array<{
    id: string;
    code: string;
    name: string;
    cfopCode: string;
    isDefault: boolean;
  }>;
  parties: PartyOption[];
  products: Array<{
    id: string;
    name: string;
    internalCode: string | null;
    unitCode: string;
    salePrice: number | null;
    ncmCode: string | null;
  }>;
  documents: RecentDocument[];
  readiness: {
    ready: boolean;
    checks: ReadinessCheck[];
  };
};

type NfseOverview = {
  branch: {
    branchCode: number;
    name: string;
    fiscalLegalName: string | null;
    municipalRegistration: string | null;
    fiscalCity: string | null;
  };
  profile: {
    environment: string;
    series: number;
    nextNumber: number;
  } | null;
  services: Array<{
    id: string;
    internalCode: string;
    name: string;
    description: string;
    nationalTaxCode: string;
    isDefault: boolean;
  }>;
  parties: PartyOption[];
  documents: RecentDocument[];
  readiness: {
    ready: boolean;
    municipalityEnabled: boolean;
    checks: ReadinessCheck[];
  };
};

type NfeLine = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
};

type InstallmentLine = {
  dueDate: string;
  amount: string;
};

type IssueResult = {
  id?: string;
  status: string;
  statusCode?: string | null;
  statusMessage?: string | null;
  lastError?: string | null;
  series?: number;
  number?: number;
  accessKey?: string | null;
  nationalNfseNumber?: string | null;
  receivableTitleId?: string | null;
  receivable?: {
    id?: string;
    status?: string;
    installmentCount?: number;
    errorMessage?: string;
  } | null;
};

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const fieldClass =
  'mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const labelClass =
  'text-[10px] font-black uppercase tracking-[0.16em] text-slate-500';

function newDraftKey(kind: ManualFiscalKind) {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${kind}-MANUAL-${random}`.toUpperCase();
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);
}

function numberValue(value: string | number | null | undefined) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateAfterMonths(months: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 30);
  date.setMonth(date.getMonth() + months);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function splitInstallments(
  total: number,
  count: number,
  previous: InstallmentLine[],
) {
  const normalizedCount = Math.max(1, Math.min(60, Math.trunc(count || 1)));
  const totalCents = Math.max(0, Math.round(total * 100));
  const baseCents = Math.floor(totalCents / normalizedCount);
  let remainder = totalCents - baseCents * normalizedCount;

  return Array.from({ length: normalizedCount }, (_, index) => {
    const cents = baseCents + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return {
      dueDate: previous[index]?.dueDate || dateAfterMonths(index),
      amount: (cents / 100).toFixed(2),
    };
  });
}

function statusClass(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'AUTHORIZED') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (['REJECTED', 'ERROR'].includes(normalized)) {
    return 'border-rose-200 bg-rose-50 text-rose-800';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

export default function ManualFiscalIssuePage({
  kind,
}: {
  kind: ManualFiscalKind;
}) {
  const runtimeContext = useFinanceRuntimeContext();
  const isNfe = kind === 'NFE';
  const embeddedScreenId = isNfe
    ? 'PRINCIPAL_FINANCEIRO_EMISSAO_NFE'
    : 'PRINCIPAL_FINANCEIRO_EMISSAO_NFS';
  const standaloneScreenId = isNfe
    ? 'FINANCEIRO_EMISSAO_NFE_MANUAL'
    : 'FINANCEIRO_EMISSAO_NFS_MANUAL';
  const screenId = runtimeContext.embedded
    ? embeddedScreenId
    : standaloneScreenId;

  const [environment, setEnvironment] = useState<'HOMOLOGATION' | 'PRODUCTION'>(
    'HOMOLOGATION',
  );
  const [overview, setOverview] = useState<NfeOverview | NfseOverview | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IssueResult | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [payerPartyId, setPayerPartyId] = useState('');
  const [createReceivable, setCreateReceivable] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [installments, setInstallments] = useState<InstallmentLine[]>([]);

  const [operationNatureId, setOperationNatureId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('OTHER');
  const [nfeLines, setNfeLines] = useState<NfeLine[]>([]);
  const [notes, setNotes] = useState('');

  const [serviceItemId, setServiceItemId] = useState('');
  const [competence, setCompetence] = useState('');
  const [serviceAmount, setServiceAmount] = useState('0.00');
  const [serviceDiscount, setServiceDiscount] = useState('0.00');
  const [serviceDeduction, setServiceDeduction] = useState('0.00');
  const [serviceDescription, setServiceDescription] = useState('');

  const contextQuery = useMemo(
    () =>
      buildFinanceApiQueryString(runtimeContext, {
        environment,
        requestedBy:
          runtimeContext.cashierDisplayName ||
          runtimeContext.cashierUserId ||
          'OPERADOR',
        userRole: runtimeContext.userRole,
        permissions: runtimeContext.permissions.join(','),
      }),
    [environment, runtimeContext],
  );

  const loadOverview = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const path = isNfe
        ? `/fiscal-documents/nfe/manual/overview${contextQuery}`
        : `/fiscal-documents/nfse/manual/overview${contextQuery}`;
      const data = await requestJson<NfeOverview | NfseOverview>(path);
      setOverview(data);
      const parties = data.parties || [];
      setPayerPartyId((current) => current || parties[0]?.id || '');

      if (isNfe) {
        const nfeData = data as NfeOverview;
        setOperationNatureId(
          (current) =>
            current ||
            nfeData.operations.find((item) => item.isDefault)?.id ||
            nfeData.operations[0]?.id ||
            '',
        );
        setNfeLines((current) => {
          if (current.length) return current;
          const product = nfeData.products[0];
          return product
            ? [
                {
                  key: newDraftKey('NFE'),
                  productId: product.id,
                  quantity: '1',
                  unitPrice: Number(product.salePrice || 0).toFixed(2),
                  discountAmount: '0.00',
                },
              ]
            : [];
        });
      } else {
        const nfseData = data as NfseOverview;
        const defaultService =
          nfseData.services.find((item) => item.isDefault) ||
          nfseData.services[0];
        setServiceItemId((current) => current || defaultService?.id || '');
        setServiceDescription(
          (current) => current || defaultService?.description || '',
        );
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'NÃO FOI POSSÍVEL CARREGAR A EMISSÃO MANUAL.',
      );
      setOverview(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    contextQuery,
    isNfe,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
  ]);

  useEffect(() => {
    setDraftKey(newDraftKey(kind));
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    setCompetence(`${year}-${month}-${day}`);
  }, [kind]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!runtimeContext.embedded || window.parent === window) return;
    window.parent.postMessage(
      { type: 'MSINFOR_SCREEN_CONTEXT', screenId: embeddedScreenId },
      '*',
    );
  }, [embeddedScreenId, runtimeContext.embedded]);

  const nfeTotal = useMemo(
    () =>
      Math.round(
        nfeLines.reduce((sum, line) => {
          const gross =
            numberValue(line.quantity) * numberValue(line.unitPrice);
          return sum + Math.max(0, gross - numberValue(line.discountAmount));
        }, 0) * 100,
      ) / 100,
    [nfeLines],
  );
  const nfseTotal = useMemo(
    () =>
      Math.round(
        Math.max(
          0,
          numberValue(serviceAmount) -
            numberValue(serviceDiscount) -
            numberValue(serviceDeduction),
        ) * 100,
      ) / 100,
    [serviceAmount, serviceDeduction, serviceDiscount],
  );
  const documentTotal = isNfe ? nfeTotal : nfseTotal;

  useEffect(() => {
    if (!createReceivable) {
      setInstallments([]);
      return;
    }
    setInstallments((current) =>
      splitInstallments(documentTotal, installmentCount, current),
    );
  }, [createReceivable, documentTotal, installmentCount]);

  const installmentTotal = useMemo(
    () =>
      Math.round(
        installments.reduce(
          (sum, installment) => sum + numberValue(installment.amount),
          0,
        ) * 100,
      ) / 100,
    [installments],
  );
  const parties = overview?.parties || [];
  const readiness = overview?.readiness;
  const failedChecks = readiness?.checks.filter((check) => !check.ok) || [];

  function updateNfeProduct(lineKey: string, productId: string) {
    const products = (overview as NfeOverview | null)?.products || [];
    const product = products.find((item) => item.id === productId);
    setNfeLines((current) =>
      current.map((line) =>
        line.key === lineKey
          ? {
              ...line,
              productId,
              unitPrice: Number(product?.salePrice || 0).toFixed(2),
            }
          : line,
      ),
    );
  }

  function addNfeLine() {
    const product = (overview as NfeOverview | null)?.products?.[0];
    if (!product) return;
    setNfeLines((current) => [
      ...current,
      {
        key: newDraftKey('NFE'),
        productId: product.id,
        quantity: '1',
        unitPrice: Number(product.salePrice || 0).toFixed(2),
        discountAmount: '0.00',
      },
    ]);
  }

  function updateNfeLine(
    lineKey: string,
    field: 'quantity' | 'unitPrice' | 'discountAmount',
    value: string,
  ) {
    setNfeLines((current) =>
      current.map((line) =>
        line.key === lineKey ? { ...line, [field]: value } : line,
      ),
    );
  }

  function updateService(serviceId: string) {
    const services = (overview as NfseOverview | null)?.services || [];
    const service = services.find((item) => item.id === serviceId);
    setServiceItemId(serviceId);
    if (service) setServiceDescription(service.description);
  }

  function validateForm() {
    if (!payerPartyId) return 'SELECIONE O PAGADOR.';
    if (documentTotal <= 0) return 'O VALOR LÍQUIDO DA NOTA DEVE SER POSITIVO.';
    if (createReceivable) {
      if (!installments.length) return 'INFORME AS PARCELAS.';
      if (Math.abs(installmentTotal - documentTotal) > 0.009) {
        return 'A SOMA DAS PARCELAS DEVE SER IGUAL AO VALOR DA NOTA.';
      }
      if (installments.some((installment) => !installment.dueDate)) {
        return 'INFORME O VENCIMENTO DE TODAS AS PARCELAS.';
      }
    }
    if (isNfe) {
      if (!operationNatureId) return 'SELECIONE A NATUREZA DE OPERAÇÃO.';
      if (!nfeLines.length || nfeLines.some((line) => !line.productId)) {
        return 'INFORME AO MENOS UM PRODUTO.';
      }
    } else {
      if (!serviceItemId) return 'SELECIONE O SERVIÇO FISCAL.';
      if (!competence) return 'INFORME A COMPETÊNCIA.';
      if (!serviceDescription.trim()) return 'INFORME A DESCRIÇÃO DO SERVIÇO.';
    }
    return null;
  }

  async function handleIssue() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    const common = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceBranchCode: runtimeContext.sourceBranchCode,
      environment,
      requestedBy:
        runtimeContext.cashierDisplayName ||
        runtimeContext.cashierUserId ||
        'OPERADOR',
      userRole: runtimeContext.userRole,
      permissions: runtimeContext.permissions.join(','),
      payerPartyId,
      idempotencyKey: draftKey,
      createReceivable,
      installments: createReceivable
        ? installments.map((installment) => ({
            dueDate: installment.dueDate,
            amount: numberValue(installment.amount),
          }))
        : undefined,
    };
    try {
      const response = isNfe
        ? await requestJson<IssueResult>('/fiscal-documents/nfe/manual/issue', {
            method: 'POST',
            body: JSON.stringify({
              ...common,
              operationNatureId,
              paymentMethod,
              items: nfeLines.map((line) => ({
                productId: line.productId,
                quantity: numberValue(line.quantity),
                unitPrice: numberValue(line.unitPrice),
                discountAmount: numberValue(line.discountAmount),
              })),
              notes: notes.trim().toUpperCase() || undefined,
            }),
          })
        : await requestJson<IssueResult>('/fiscal-documents/nfse/issue', {
            method: 'POST',
            body: JSON.stringify({
              ...common,
              serviceItemId,
              sourceEntityType: 'MANUAL_NFSE',
              sourceEntityId: draftKey,
              competence,
              amount: numberValue(serviceAmount),
              discountAmount: numberValue(serviceDiscount),
              deductionAmount: numberValue(serviceDeduction),
              description: serviceDescription.trim().toUpperCase(),
            }),
          });
      setResult(response);
      await loadOverview();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'NÃO FOI POSSÍVEL EMITIR A NOTA.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function startNewDocument() {
    setDraftKey(newDraftKey(kind));
    setResult(null);
    setError(null);
  }

  const auditText = `${isNfe ? 'Emissão manual de NF-e modelo 55' : 'Emissão manual de NFS-e Nacional'}.

Regras:
- o pagador é o mesmo Party usado como destinatário/tomador e no Contas a Receber
- não é criado cadastro fiscal separado
- a emissão manual não cria venda, não movimenta estoque e não movimenta caixa
- o Contas a Receber é opcional e somente nasce após autorização fiscal
- quando solicitado, o título pode conter de 1 a 60 parcelas
- todas as mutações são isoladas por empresa e filial, idempotentes e auditadas`;

  return (
    <div className="space-y-4">
      <section className={`${cardClass} p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
              Emissão fiscal manual
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-900">
              {isNfe ? 'Emissão NF-e' : 'Emissão NFS (Serviço)'}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {isNfe
                ? 'Emita a nota de produtos sem criar uma venda artificial.'
                : 'Emita a nota de serviço no Ambiente Nacional.'}
            </p>
          </div>
          <label className="w-full lg:w-52">
            <span className={labelClass}>Ambiente</span>
            <select
              value={environment}
              onChange={(event) =>
                setEnvironment(
                  event.target.value as 'HOMOLOGATION' | 'PRODUCTION',
                )
              }
              className={fieldClass}
            >
              <option value="HOMOLOGATION">HOMOLOGAÇÃO</option>
              <option value="PRODUCTION">PRODUÇÃO</option>
            </select>
          </label>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
          {error}
        </section>
      ) : null}

      {failedChecks.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs font-black uppercase tracking-[0.14em] text-amber-800">
            Configurações pendentes
          </div>
          <div className="mt-2 grid gap-1 text-xs font-semibold text-amber-900 md:grid-cols-2">
            {failedChecks.map((check) => (
              <div key={check.code}>
                {check.label}: {check.message}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} p-5`}>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="lg:col-span-2">
            <span className={labelClass}>
              {isNfe
                ? 'Pagador / destinatário da NF-e'
                : 'Pagador / tomador da NFS-e'}
            </span>
            <select
              value={payerPartyId}
              onChange={(event) => setPayerPartyId(event.target.value)}
              className={fieldClass}
              disabled={isLoading}
            >
              <option value="">SELECIONE</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name} {party.document ? `- ${party.document}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">
            É o mesmo cadastro usado como pagador das duplicatas. Nenhum
            destinatário ou tomador separado será criado.
          </div>
        </div>
      </section>

      {isNfe ? (
        <section className={`${cardClass} p-5`}>
          <div className="grid gap-4 lg:grid-cols-2">
            <label>
              <span className={labelClass}>Natureza de operação</span>
              <select
                value={operationNatureId}
                onChange={(event) => setOperationNatureId(event.target.value)}
                className={fieldClass}
              >
                <option value="">SELECIONE</option>
                {((overview as NfeOverview | null)?.operations || []).map(
                  (operation) => (
                    <option key={operation.id} value={operation.id}>
                      {operation.code} - {operation.name} - CFOP{' '}
                      {operation.cfopCode}
                    </option>
                  ),
                )}
              </select>
            </label>
            {!createReceivable ? (
              <label>
                <span className={labelClass}>Forma de pagamento fiscal</span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className={fieldClass}
                >
                  <option value="OTHER">OUTROS</option>
                  <option value="CASH">DINHEIRO</option>
                  <option value="PIX">PIX</option>
                  <option value="CREDIT_CARD">CARTÃO DE CRÉDITO</option>
                  <option value="DEBIT_CARD">CARTÃO DE DÉBITO</option>
                  <option value="BOLETO">BOLETO</option>
                  <option value="TERM">A PRAZO</option>
                  <option value="NO_PAYMENT">SEM PAGAMENTO</option>
                </select>
              </label>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                Forma fiscal: a prazo. As duplicatas da NF-e seguirão as
                parcelas informadas abaixo.
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-700">
              Produtos da nota
            </div>
            <button
              type="button"
              onClick={addNfeLine}
              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 transition hover:bg-blue-100"
            >
              Adicionar produto
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {nfeLines.map((line, index) => (
              <div
                key={line.key}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(280px,1fr)_110px_140px_140px_110px]"
              >
                <label>
                  <span className={labelClass}>Produto {index + 1}</span>
                  <select
                    value={line.productId}
                    onChange={(event) =>
                      updateNfeProduct(line.key, event.target.value)
                    }
                    className={fieldClass}
                  >
                    <option value="">SELECIONE</option>
                    {((overview as NfeOverview | null)?.products || []).map(
                      (product) => (
                        <option key={product.id} value={product.id}>
                          {product.internalCode
                            ? `${product.internalCode} - `
                            : ''}
                          {product.name} - NCM {product.ncmCode || 'PENDENTE'}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  <span className={labelClass}>Quantidade</span>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={line.quantity}
                    onChange={(event) =>
                      updateNfeLine(line.key, 'quantity', event.target.value)
                    }
                    className={fieldClass}
                  />
                </label>
                <label>
                  <span className={labelClass}>Valor unitário</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) =>
                      updateNfeLine(line.key, 'unitPrice', event.target.value)
                    }
                    className={fieldClass}
                  />
                </label>
                <label>
                  <span className={labelClass}>Desconto</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.discountAmount}
                    onChange={(event) =>
                      updateNfeLine(
                        line.key,
                        'discountAmount',
                        event.target.value,
                      )
                    }
                    className={fieldClass}
                  />
                </label>
                <div className="flex items-end gap-2">
                  <div className="flex h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-800">
                    {money(
                      Math.max(
                        0,
                        numberValue(line.quantity) *
                          numberValue(line.unitPrice) -
                          numberValue(line.discountAmount),
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setNfeLines((current) =>
                        current.filter((item) => item.key !== line.key),
                      )
                    }
                    disabled={nfeLines.length === 1}
                    className="h-10 rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Remover produto"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          <label className="mt-4 block">
            <span className={labelClass}>Informações complementares</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value.toUpperCase())}
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold uppercase text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </section>
      ) : (
        <section className={`${cardClass} p-5`}>
          <div className="grid gap-4 lg:grid-cols-2">
            <label>
              <span className={labelClass}>Serviço fiscal</span>
              <select
                value={serviceItemId}
                onChange={(event) => updateService(event.target.value)}
                className={fieldClass}
              >
                <option value="">SELECIONE</option>
                {((overview as NfseOverview | null)?.services || []).map(
                  (service) => (
                    <option key={service.id} value={service.id}>
                      {service.internalCode} - {service.name} - CÓDIGO NACIONAL{' '}
                      {service.nationalTaxCode}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              <span className={labelClass}>Competência</span>
              <input
                type="date"
                value={competence}
                onChange={(event) => setCompetence(event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
          <label className="mt-4 block">
            <span className={labelClass}>Descrição do serviço</span>
            <textarea
              value={serviceDescription}
              onChange={(event) =>
                setServiceDescription(event.target.value.toUpperCase())
              }
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold uppercase text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label>
              <span className={labelClass}>Valor do serviço</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={serviceAmount}
                onChange={(event) => setServiceAmount(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label>
              <span className={labelClass}>Desconto</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={serviceDiscount}
                onChange={(event) => setServiceDiscount(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label>
              <span className={labelClass}>Deduções</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={serviceDeduction}
                onChange={(event) => setServiceDeduction(event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
        </section>
      )}

      <section className={`${cardClass} p-5`}>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            checked={createReceivable}
            onChange={(event) => setCreateReceivable(event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-blue-600"
          />
          <span>
            <span className="block text-sm font-black text-slate-800">
              Lançar esta nota no Contas a Receber
            </span>
            <span className="block text-xs font-semibold text-slate-500">
              O título somente será criado depois que a nota estiver autorizada.
            </span>
          </span>
        </label>

        {createReceivable ? (
          <div className="mt-4">
            <label className="block max-w-52">
              <span className={labelClass}>Quantidade de parcelas</span>
              <input
                type="number"
                min="1"
                max="60"
                value={installmentCount}
                onChange={(event) =>
                  setInstallmentCount(
                    Math.max(
                      1,
                      Math.min(60, Number(event.target.value || 1)),
                    ),
                  )
                }
                className={fieldClass}
              />
            </label>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {installments.map((installment, index) => (
                <div
                  key={index}
                  className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <label>
                    <span className={labelClass}>Parcela {index + 1}</span>
                    <input
                      type="date"
                      value={installment.dueDate}
                      onChange={(event) =>
                        setInstallments((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, dueDate: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className={fieldClass}
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Valor</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={installment.amount}
                      onChange={(event) =>
                        setInstallments((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className={fieldClass}
                    />
                  </label>
                </div>
              ))}
            </div>
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-xs font-black ${
                Math.abs(installmentTotal - documentTotal) <= 0.009
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              SOMA DAS PARCELAS: {money(installmentTotal)}
            </div>
          </div>
        ) : null}
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className={labelClass}>Valor líquido da nota</div>
            <div className="mt-1 text-3xl font-black text-slate-900">
              {money(documentTotal)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {result ? (
              <button
                type="button"
                onClick={startNewDocument}
                className="h-11 rounded-xl border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.12em] text-slate-700"
              >
                Nova nota
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleIssue()}
              disabled={isLoading || isSubmitting || !overview}
              className="h-11 rounded-xl bg-blue-600 px-6 text-xs font-black uppercase tracking-[0.12em] text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? 'Emitindo...'
                : isNfe
                  ? 'Emitir NF-e'
                  : 'Emitir NFS-e'}
            </button>
          </div>
        </div>
      </section>

      {result ? (
        <section
          className={`rounded-2xl border px-4 py-4 ${statusClass(result.status)}`}
        >
          <div className="text-sm font-black">
            {isNfe ? 'NF-e' : 'NFS-e'} {result.number || '-'} /
            {result.series || '-'}: {result.status}
          </div>
          <div className="mt-1 text-xs font-semibold">
            {result.statusMessage ||
              result.lastError ||
              'PROCESSAMENTO FISCAL CONCLUÍDO.'}
          </div>
          {result.receivable?.id || result.receivableTitleId ? (
            <div className="mt-2 text-xs font-black">
              CONTAS A RECEBER CRIADO COM{' '}
              {result.receivable?.installmentCount || installmentCount}{' '}
              PARCELA(S).
            </div>
          ) : null}
          {result.receivable?.status === 'ERROR' ? (
            <div className="mt-2 text-xs font-black text-rose-700">
              NOTA AUTORIZADA, MAS O CONTAS A RECEBER NÃO FOI CRIADO:{' '}
              {result.receivable.errorMessage}
            </div>
          ) : null}
        </section>
      ) : null}

      {overview?.documents?.length ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-700">
            Emissões manuais recentes
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nota</th>
                  <th className="px-4 py-3">Pagador</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Contas a receber</th>
                </tr>
              </thead>
              <tbody>
                {overview.documents.map((document) => (
                  <tr key={document.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-black text-slate-800">
                      {document.number}/{document.series}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {document.recipientName || document.takerName || '-'}
                    </td>
                    <td className="px-4 py-3 font-black text-slate-800">
                      {money(
                        Number(document.totalAmount ?? document.netAmount ?? 0),
                      )}
                    </td>
                    <td className="px-4 py-3 font-black">
                      {document.status}
                    </td>
                    <td className="px-4 py-3 font-black">
                      {document.hasReceivable || document.receivableTitleId
                        ? 'SIM'
                        : 'NÃO'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-5 py-4`}>
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={`Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/${isNfe ? 'emissao-nfe' : 'emissao-nfs'}/page.tsx`}
            auditText={auditText}
            sqlText="-- EMISSÃO MANUAL: DOCUMENTO FISCAL E CONTAS A RECEBER ISOLADOS POR COMPANYID E BRANCHCODE; SEM DELETE FÍSICO."
          />
        </section>
      ) : null}
    </div>
  );
}
