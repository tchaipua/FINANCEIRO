'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import type {
  ApprovalItemState,
  PayableInvoiceImportDetail,
  ProductOption,
} from '../../payables-types';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_APROVACAO_NOTA';

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

function getStatusClass(status: string) {
  return status === 'APPROVED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
}

function buildInitialApprovalState(item: PayableInvoiceImportDetail['items'][number]): ApprovalItemState {
  return {
    action: item.approvalAction || item.recommendedAction,
    productId: item.productId || '',
    productName: item.productName || item.description,
    internalCode: item.supplierItemCode || '',
    sku: '',
    barcode: item.barcode || '',
    unitCode: item.unitCode || 'UN',
    productType: 'GOODS',
    tracksInventory: item.productTracksInventory ?? item.tracksInventory,
    allowFraction: false,
    minimumStock: '0',
    notes: '',
  };
}

export default function FinanceiroAprovacaoNotaPage() {
  const params = useParams<{ importId: string }>();
  const importId = String(params?.importId || '');
  const runtimeContext = useFinanceRuntimeContext();
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
  const [detail, setDetail] = useState<PayableInvoiceImportDetail | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalItems, setApprovalItems] = useState<Record<string, ApprovalItemState>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadPageData = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !importId) {
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
          `/payables/invoice-imports/${importId}${importQueryString}`,
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
  }, [importId, runtimeContext]);

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

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={FINANCE_GRID_PAGE_LAYOUT.card}>
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
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
              <Link
                href={`/contas-a-pagar/notas-importadas${navigationQuery}`}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Voltar para a lista
              </Link>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
            Carregando dados da nota importada...
          </div>
        ) : detail ? (
          <div className="grid gap-6 p-6">
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

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-4">
                <span className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${getStatusClass(detail.status)}`}>
                  {detail.statusLabel}
                </span>
                <span className="text-sm font-semibold text-slate-500">
                  {detail.items.length} item(ns) e {detail.installments.length} duplicata(s) importada(s)
                </span>
              </div>

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
                <div className="text-sm font-black uppercase tracking-[0.16em] text-emerald-700">
                  Aprovada em {formatDateLabel(detail.approvedAt || null)}
                </div>
              )}
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
              <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                Duplicatas importadas
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {detail.installments.map((installment) => (
                  <div key={installment.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
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
                      Valor: {formatCurrency(installment.amount)}
                    </div>
                  </div>
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
          </div>
        ) : (
          <div className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
            Nenhum dado encontrado para esta nota.
          </div>
        )}
      </section>
    </div>
  );
}
