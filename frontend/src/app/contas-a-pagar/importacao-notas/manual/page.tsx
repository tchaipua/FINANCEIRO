'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import {
  formatCurrency,
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import {
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import type { PayableInvoiceImportDetail } from '../../payables-types';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS_MANUAL';

const auditText = `--- LOGICA DA TELA ---
Esta tela executa a importação manual de notas fiscais XML no contas a pagar do Financeiro.

TABELAS PRINCIPAIS:
- payable_invoice_imports (PII) - cabeçalho da nota importada para aprovação.
- payable_invoice_import_items (PIIT) - itens importados do XML.
- payable_invoice_import_installments (PIIN) - duplicatas extraídas do XML.
- suppliers (SU) - fornecedor localizado ou criado durante a importação.

RELACIONAMENTOS:
- payable_invoice_imports.companyId -> companies.id
- payable_invoice_imports.supplierId -> suppliers.id
- payable_invoice_import_items.invoiceImportId -> payable_invoice_imports.id
- payable_invoice_import_installments.invoiceImportId -> payable_invoice_imports.id

METRICAS / CAMPOS EXIBIDOS:
- conteúdo XML informado
- status da última nota importada
- fornecedor, emissão, itens e valor total da importação

FILTROS APLICADOS:
- company resolvida por sourceSystem + sourceTenantId
- importação limitada ao tenant informado pelo sistema de origem

ORDENACAO:
- não aplicável nesta operação manual`;

function getStatusClass(status: string) {
  return status === 'APPROVED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function FinanceiroImportacaoNotasManualPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
  const [xmlContent, setXmlContent] = useState('');
  const [importResult, setImportResult] = useState<PayableInvoiceImportDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingXml, setSavingXml] = useState(false);

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

  const handleXmlFileSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setXmlContent(content);
      setErrorMessage(null);
    } catch {
      setErrorMessage('Não foi possível ler o XML selecionado.');
    } finally {
      event.target.value = '';
    }
  }, []);

  const handleImportXml = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
        setErrorMessage(
          'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
        );
        return;
      }

      setSavingXml(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const response = await requestJson<PayableInvoiceImportDetail & { message?: string }>(
          '/payables/invoice-imports/from-xml',
          {
            method: 'POST',
            body: JSON.stringify({
              sourceSystem: runtimeContext.sourceSystem,
              sourceTenantId: runtimeContext.sourceTenantId,
              companyName: runtimeContext.companyName,
              requestedBy:
                runtimeContext.cashierDisplayName ||
                runtimeContext.userRole ||
                'OPERADOR',
              xmlContent,
            }),
            fallbackMessage:
              'Não foi possível importar a nota a partir do XML informado.',
          },
        );

        setImportResult(response);
        setSuccessMessage(
          response.message ||
            'Nota importada com sucesso e pronta para aprovação.',
        );
      } catch (error) {
        setErrorMessage(
          getFriendlyRequestErrorMessage(
            error,
            'Não foi possível importar a nota a partir do XML informado.',
          ),
        );
      } finally {
        setSavingXml(false);
      }
    },
    [runtimeContext, xmlContent],
  );

  return (
    <div className="space-y-6">
      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} p-6`}>
        <form onSubmit={handleImportXml} className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                  XML da nota fiscal
                </div>
                <div className="mt-1 text-sm font-medium text-slate-500">
                  Você pode colar o XML completo ou selecionar um arquivo salvo no seu computador.
                </div>
              </div>

              <label className="inline-flex cursor-pointer items-center rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100">
                Selecionar XML
                <input
                  type="file"
                  accept=".xml,text/xml"
                  className="hidden"
                  onChange={handleXmlFileSelected}
                />
              </label>
            </div>

            <textarea
              value={xmlContent}
              onChange={(event) => setXmlContent(event.target.value)}
              placeholder="<nfeProc>...</nfeProc>"
              className="min-h-[320px] w-full rounded-3xl border border-slate-300 bg-white px-4 py-4 font-mono text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setXmlContent('');
                  setImportResult(null);
                  setSuccessMessage(null);
                  setErrorMessage(null);
                }}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Limpar
              </button>
              <button
                type="submit"
                disabled={savingXml || !xmlContent.trim()}
                className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
              >
                {savingXml ? 'Importando...' : 'Importar XML'}
              </button>
            </div>
          </section>
        </form>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {importResult ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                  Última nota importada
                </div>
                <div className="mt-1 text-xl font-black text-slate-900">
                  NF-e {importResult.invoiceNumber}
                  {importResult.series ? ` / Série ${importResult.series}` : ''}
                </div>
              </div>

              <span className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${getStatusClass(importResult.status)}`}>
                {importResult.statusLabel}
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Fornecedor
                </div>
                <div className="mt-1 text-sm font-bold text-slate-800">
                  {importResult.supplierName || '---'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Emissão
                </div>
                <div className="mt-1 text-sm font-bold text-slate-800">
                  {formatDateLabel(importResult.issueDate)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Itens
                </div>
                <div className="mt-1 text-sm font-bold text-slate-800">
                  {importResult.itemsCount}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Valor total
                </div>
                <div className="mt-1 text-sm font-bold text-slate-800">
                  {formatCurrency(importResult.totalInvoiceAmount)}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Link
                href={`/contas-a-pagar/notas-importadas/${importResult.id}${navigationQuery}`}
                className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
              >
                Abrir para Aprovação
              </Link>
            </div>
          </section>
        ) : null}
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} px-6 py-4`}>
          <ScreenNameCopy
            screenId={SCREEN_ID}
            className="justify-end"
            originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/importacao-notas/manual/page.tsx"
            auditText={auditText}
          />
        </section>
      ) : null}
    </div>
  );
}
