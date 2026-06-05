'use client';

import Link from 'next/link';
import {
  ChangeEvent,
  FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import {
  formatCurrency,
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import {
  buildDefaultExportColumns,
  exportGridRows,
  type GridColumnDefinition,
  type GridExportFormat,
} from '@/app/lib/grid-export-utils';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import type {
  FiscalCertificateItem,
  PayableInvoiceImportDetail,
  PayableInvoiceImportSummary,
} from '../payables-types';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS';
const INSTALLMENTS_MODAL_SCREEN_ID =
  'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS_PARCELAS';
const PRODUCTS_MODAL_SCREEN_ID =
  'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS_PRODUTOS';

const auditText = `--- LOGICA DA TELA ---
Esta tela centraliza a importação de notas do contas a pagar por consulta automática na SEFAZ e o acesso ao fluxo manual em tela dedicada.

TABELAS PRINCIPAIS:
- fiscal_certificates (FC) - certificados fiscais A1 da empresa financeira.
- payable_invoice_imports (PII) - notas importadas para aprovação.
- payable_invoice_import_items (PIIT) - itens da nota fiscal.
- payable_invoice_import_installments (PIIN) - duplicatas importadas da nota.
- suppliers (SU) - fornecedor da nota.

RELACIONAMENTOS:
- fiscal_certificates.companyId -> companies.id
- payable_invoice_imports.companyId -> companies.id
- payable_invoice_imports.fiscalCertificateId -> fiscal_certificates.id
- payable_invoice_imports.supplierId -> suppliers.id
- payable_invoice_import_items.invoiceImportId -> payable_invoice_imports.id

METRICAS / CAMPOS EXIBIDOS:
- certificados disponíveis
- última sincronização DF-e
- notas pendentes de aprovação
- atalho para importação manual por XML

FILTROS APLICADOS AGORA:
- company resolvida por sourceSystem + sourceTenantId
- lista lateral mostra apenas importações pendentes de aprovação
- certificados carregados apenas do tenant atual

ORDENACAO:
- certificados por padrão, ambiente e alias
- notas pendentes por createdAt desc`;

const installmentsModalAuditText = `--- LOGICA DA TELA ---
Esta tela modal centraliza a manutenção das parcelas da nota importada antes da aprovação final.

TABELAS PRINCIPAIS:
- payable_invoice_imports (PII) - cabeçalho da nota importada.
- payable_invoice_import_installments (PIIN) - parcelas importadas e ajustadas antes da aprovação.
- suppliers (SU) - fornecedor vinculado à nota.

RELACIONAMENTOS:
- payable_invoice_import_installments.invoiceImportId -> payable_invoice_imports.id
- payable_invoice_imports.supplierId -> suppliers.id

METRICAS / CAMPOS EXIBIDOS:
- número e série da nota
- fornecedor
- valor total da nota
- quantidade de parcelas
- vencimento e valor de cada parcela

FILTROS APLICADOS AGORA:
- company resolvida por sourceSystem + sourceTenantId
- nota localizada por importId dentro do tenant atual
- edição permitida apenas antes da aprovação

ORDENACAO:
- order by payable_invoice_import_installments.installmentNumber asc

SQL / BASE LOGICA:
SELECT
  PII.id,
  PII.invoiceNumber,
  PII.series,
  PII.totalInvoiceAmount,
  SU.legalName AS supplierName,
  PIIN.id AS installmentId,
  PIIN.installmentNumber,
  PIIN.installmentLabel,
  PIIN.dueDate,
  PIIN.amount
FROM payable_invoice_imports PII
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
LEFT JOIN payable_invoice_import_installments PIIN
  ON PIIN.invoiceImportId = PII.id
  AND PIIN.canceledAt IS NULL
WHERE PII.id = :importId
  AND PII.companyId = :companyId
  AND PII.canceledAt IS NULL
ORDER BY PIIN.installmentNumber ASC;`;

const productsModalAuditText = `--- LOGICA DA TELA ---
Esta tela modal exibe os produtos/itens importados da nota fiscal antes da aprovação final.

TABELAS PRINCIPAIS:
- payable_invoice_imports (PII) - cabeçalho da nota importada.
- payable_invoice_import_items (PIIT) - itens/produtos importados da NF-e.
- suppliers (SU) - fornecedor vinculado à nota.

RELACIONAMENTOS:
- payable_invoice_import_items.invoiceImportId -> payable_invoice_imports.id
- payable_invoice_imports.supplierId -> suppliers.id

METRICAS / CAMPOS EXIBIDOS:
- número e série da nota
- fornecedor
- quantidade de itens
- descrição, unidade, quantidade, valor unitário e valor total por item

FILTROS APLICADOS AGORA:
- company resolvida por sourceSystem + sourceTenantId
- nota localizada por importId dentro do tenant atual

ORDENACAO:
- order by payable_invoice_import_items.lineNumber asc

SQL / BASE LOGICA:
SELECT
  PII.id,
  PII.invoiceNumber,
  PII.series,
  SU.legalName AS supplierName,
  PIIT.id AS itemId,
  PIIT.lineNumber,
  PIIT.description,
  PIIT.unitCode,
  PIIT.quantity,
  PIIT.unitPrice,
  PIIT.totalPrice,
  PIIT.barcode,
  PIIT.ncmCode
FROM payable_invoice_imports PII
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
LEFT JOIN payable_invoice_import_items PIIT
  ON PIIT.invoiceImportId = PII.id
  AND PIIT.canceledAt IS NULL
WHERE PII.id = :importId
  AND PII.companyId = :companyId
  AND PII.canceledAt IS NULL
ORDER BY PIIT.lineNumber ASC;`;

type CertificateFormState = {
  id: string | null;
  aliasName: string;
  authorStateCode: string;
  environment: 'PRODUCTION' | 'HOMOLOGATION';
  purpose: string;
  isDefault: boolean;
  pfxBase64: string;
  certificatePassword: string;
  fileName: string;
};

type SyncResult = {
  certificateId: string;
  statusCode: string;
  statusMessage: string;
  importedNotes: number;
  duplicateNotes: number;
  summaryOnlyDocuments: number;
  otherDocuments: number;
  message: string;
  importedNoteIds: string[];
  resetNsu?: boolean;
};

type SefazSyncModalState = {
  isOpen: boolean;
  phase: 'loading' | 'success' | 'warning';
  certificateAlias: string;
  searchedDateLabel: string;
  foundNotes: number;
  message: string;
  mode: 'standard' | 'historical';
  retryAtLabel: string | null;
};

type InstallmentEditorItem = {
  id?: string;
  installmentLabel: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
};

type RecentImportFilterColumn =
  | 'status'
  | 'invoice'
  | 'supplier'
  | 'issueDate'
  | 'total'
  | 'installments';

type RecentImportSortDirection = 'asc' | 'desc';

type RecentImportSortState = {
  column: RecentImportFilterColumn;
  direction: RecentImportSortDirection;
} | null;

type RecentImportFilters = {
  status: string;
  invoice: string;
  supplier: string;
  issueDateFrom: string;
  issueDateTo: string;
  total: string;
  installments: string;
};

type RecentImportGridColumnKey =
  | 'invoice'
  | 'issueDate'
  | 'total'
  | 'installments';

type RecentImportExportColumnKey =
  | 'status'
  | 'invoice'
  | 'supplier'
  | 'supplierDocument'
  | 'issueDate'
  | 'total'
  | 'installments';

const EMPTY_RECENT_IMPORT_FILTERS: RecentImportFilters = {
  status: 'ALL',
  invoice: '',
  supplier: '',
  issueDateFrom: '',
  issueDateTo: '',
  total: '',
  installments: '',
};

const RECENT_IMPORT_GRID_COLUMNS: Array<{
  key: RecentImportGridColumnKey;
  label: string;
}> = [
  { key: 'invoice', label: 'Nota fiscal' },
  { key: 'issueDate', label: 'Emissão' },
  { key: 'total', label: 'Valor total' },
  { key: 'installments', label: 'Duplicatas' },
];

const RECENT_IMPORT_EXPORT_STORAGE_KEY =
  'financeiro:contas-a-pagar:importacao-notas:pendentes:export';

const RECENT_IMPORT_EXPORT_COLUMNS: GridColumnDefinition<
  PayableInvoiceImportSummary,
  RecentImportExportColumnKey
>[] = [
  {
    key: 'status',
    label: 'Status',
    getValue: (item) => item.statusLabel || item.status || '---',
  },
  {
    key: 'invoice',
    label: 'Nota fiscal',
    getValue: (item) =>
      `NF-e ${item.invoiceNumber || '---'}${item.series ? ` / ${item.series}` : ''}`,
  },
  {
    key: 'supplier',
    label: 'Fornecedor',
    getValue: (item) => item.supplierName || '---',
  },
  {
    key: 'supplierDocument',
    label: 'Documento fornecedor',
    getValue: (item) => item.supplierDocument || '---',
  },
  {
    key: 'issueDate',
    label: 'Emissão',
    getValue: (item) => formatDateLabel(item.issueDate),
  },
  {
    key: 'total',
    label: 'Valor total',
    getValue: (item) => formatCurrency(item.totalInvoiceAmount),
  },
  {
    key: 'installments',
    label: 'Duplicatas',
    getValue: (item) => String(item.installmentsCount || 0),
  },
];

const emptyCertificateForm: CertificateFormState = {
  id: null,
  aliasName: '',
  authorStateCode: '35',
  environment: 'PRODUCTION',
  purpose: 'NFE_DFE',
  isDefault: false,
  pfxBase64: '',
  certificatePassword: '',
  fileName: '',
};

function buildTodaySearchLabel() {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

function buildDateTimeLabel(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function buildDateOnlyInputValue(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, 10);
}

function normalizeRecentImportFilterValue(value?: string | number | null) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeRecentImportDigits(value?: string | number | null) {
  return String(value ?? '').replace(/\D/g, '');
}

function matchesRecentImportTextFilter(
  values: Array<string | number | null | undefined>,
  filterValue: string,
) {
  const normalizedFilter = normalizeRecentImportFilterValue(filterValue);
  const filterDigits = normalizeRecentImportDigits(filterValue);

  if (!normalizedFilter) {
    return true;
  }

  return values.some((value) => {
    const normalizedValue = normalizeRecentImportFilterValue(value);

    if (normalizedValue.includes(normalizedFilter)) {
      return true;
    }

    return Boolean(
      filterDigits &&
        normalizeRecentImportDigits(value).includes(filterDigits),
    );
  });
}

function getRecentImportSortValue(
  item: PayableInvoiceImportSummary,
  column: RecentImportFilterColumn,
) {
  if (column === 'status') {
    return item.statusLabel || item.status || '';
  }

  if (column === 'invoice') {
    return `${item.invoiceNumber || ''} ${item.series || ''}`;
  }

  if (column === 'supplier') {
    return item.supplierName || item.supplierDocument || '';
  }

  if (column === 'issueDate') {
    return buildDateOnlyInputValue(item.issueDate);
  }

  if (column === 'total') {
    return Number(item.totalInvoiceAmount || 0);
  }

  return Number(item.installmentsCount || 0);
}

function compareRecentImportSortValues(
  left: string | number,
  right: string | number,
) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function splitInstallmentAmounts(totalAmount: number, count: number) {
  if (count <= 0) {
    return [];
  }

  const totalInCents = Math.round(Number(totalAmount || 0) * 100);
  const baseAmount = Math.floor(totalInCents / count);
  const remainingCents = totalInCents - baseAmount * count;

  return Array.from({ length: count }, (_, index) => {
    const cents = baseAmount + (index === count - 1 ? remainingCents : 0);
    return cents / 100;
  });
}

function normalizeInstallmentEditorItems(
  installments: InstallmentEditorItem[],
  totalAmount: number,
) {
  const amounts = splitInstallmentAmounts(totalAmount, installments.length);

  return installments.map((installment, index) => ({
    ...installment,
    installmentLabel: `PARCELA ${index + 1}`,
    installmentNumber: index + 1,
    amount: amounts[index] || 0,
  }));
}

function buildNextMonthlyDueDate(baseDueDate: string, installmentIndex: number) {
  const baseDate = baseDueDate
    ? new Date(`${baseDueDate}T12:00:00`)
    : new Date();

  if (Number.isNaN(baseDate.getTime())) {
    const fallbackDate = new Date();
    fallbackDate.setMonth(fallbackDate.getMonth() + installmentIndex);
    return fallbackDate.toISOString().slice(0, 10);
  }

  baseDate.setMonth(baseDate.getMonth() + installmentIndex);
  return baseDate.toISOString().slice(0, 10);
}

function getSefazRetryAt(certificate: FiscalCertificateItem) {
  if (certificate.lastSyncStatus !== '656' || !certificate.lastSyncAt) {
    return null;
  }

  const lastSyncDate = new Date(certificate.lastSyncAt);
  if (Number.isNaN(lastSyncDate.getTime())) {
    return null;
  }

  return new Date(lastSyncDate.getTime() + 60 * 60 * 1000);
}

function SefazSyncProgressModal({
  state,
  logoUrl,
  companyName,
  onClose,
}: {
  state: SefazSyncModalState;
  logoUrl: string | null;
  companyName: string | null;
  onClose: () => void;
}) {
  if (!state.isOpen) {
    return null;
  }

  const isLoading = state.phase === 'loading';
  const isHistorical = state.mode === 'historical';
  const isWarning = state.phase === 'warning';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-lg">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={companyName || 'Empresa'}
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="text-sm font-black uppercase tracking-[0.18em] text-white">
                  SEFAZ
                </span>
              )}
            </div>

            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.26em] text-cyan-200">
                {isHistorical ? 'Varredura histórica SEFAZ' : 'Consulta SEFAZ'}
              </div>
              <div className="mt-1 text-2xl font-black">
                {isWarning
                  ? 'Consulta temporariamente bloqueada'
                  : isLoading
                  ? isHistorical
                    ? 'Buscando histórico...'
                    : 'Buscando notas...'
                  : 'Importação concluída'}
              </div>
              <div className="mt-1 text-sm font-semibold text-blue-100/90">
                Certificado: {state.certificateAlias}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                {isHistorical ? 'Busca iniciada em' : 'Dia consultado'}
              </div>
              <div className="mt-2 text-lg font-black text-slate-900">
                {state.searchedDateLabel}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                Notas encontradas
              </div>
              <div className="mt-2 text-lg font-black text-slate-900">
                {state.foundNotes}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-600">
            {state.message}
          </div>

          {state.retryAtLabel ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-800">
              Nova consulta liberada a partir de: {state.retryAtLabel}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm font-bold text-blue-700">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <span>Aguarde enquanto a SEFAZ retorna os documentos.</span>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black uppercase tracking-[0.16em] text-white transition hover:bg-emerald-500"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getSemaphoreClass(semaphore: 'GREEN' | 'YELLOW') {
  return semaphore === 'GREEN' ? 'bg-emerald-500' : 'bg-amber-400';
}

function getCertificateStatusClass(certificate: FiscalCertificateItem) {
  if (certificate.status !== 'ACTIVE') {
    return 'border-slate-200 bg-slate-100 text-slate-600';
  }

  if (certificate.expired) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function buildCertificateForm(certificate: FiscalCertificateItem): CertificateFormState {
  return {
    id: certificate.id,
    aliasName: certificate.aliasName,
    authorStateCode: certificate.authorStateCode,
    environment: certificate.environment,
    purpose: certificate.purpose,
    isDefault: certificate.isDefault,
    pfxBase64: '',
    certificatePassword: '',
    fileName: '',
  };
}

async function readFileAsBase64(file: File) {
  const bytes = await file.arrayBuffer();
  const uint8Array = new Uint8Array(bytes);
  let binary = '';
  uint8Array.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function CertificateModal({
  isOpen,
  formState,
  saving,
  onClose,
  onChange,
  onFileSelected,
  onSubmit,
}: {
  isOpen: boolean;
  formState: CertificateFormState;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<CertificateFormState>) => void;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
              Certificado fiscal
            </div>
            <h2 className="mt-1 text-2xl font-black text-slate-900">
              {formState.id ? 'Editar certificado A1' : 'Novo certificado A1'}
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              O PFX e a senha são gravados criptografados no Financeiro. A chave fica no backend.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 flex-1 overflow-auto p-6">
          <div className="grid gap-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                Identificação
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Apelido do certificado
                  </span>
                  <input
                    value={formState.aliasName}
                    onChange={(event) => onChange({ aliasName: event.target.value })}
                    className={FINANCE_GRID_PAGE_LAYOUT.input}
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Código IBGE da UF
                  </span>
                  <input
                    value={formState.authorStateCode}
                    onChange={(event) => onChange({ authorStateCode: event.target.value })}
                    className={FINANCE_GRID_PAGE_LAYOUT.input}
                    maxLength={2}
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Ambiente
                  </span>
                  <select
                    value={formState.environment}
                    onChange={(event) =>
                      onChange({
                        environment: event.target.value as 'PRODUCTION' | 'HOMOLOGATION',
                      })
                    }
                    className={FINANCE_GRID_PAGE_LAYOUT.input}
                  >
                    <option value="PRODUCTION">PRODUÇÃO</option>
                    <option value="HOMOLOGATION">HOMOLOGAÇÃO</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Finalidade
                  </span>
                  <input
                    value={formState.purpose}
                    onChange={(event) => onChange({ purpose: event.target.value })}
                    className={FINANCE_GRID_PAGE_LAYOUT.input}
                    required
                  />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                    Arquivo e senha
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-500">
                    {formState.id
                      ? 'Envie um novo PFX apenas se quiser trocar o certificado atual.'
                      : 'Envie o arquivo PFX e a senha do certificado digital.'}
                  </div>
                </div>

                <label className="inline-flex cursor-pointer items-center rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100">
                  Selecionar PFX
                  <input type="file" accept=".pfx,application/x-pkcs12" className="hidden" onChange={(event) => void onFileSelected(event)} />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  {formState.fileName || (formState.id ? 'Mantendo certificado já gravado.' : 'Nenhum arquivo selecionado.')}
                </div>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Senha do certificado
                  </span>
                  <input
                    type="password"
                    value={formState.certificatePassword}
                    onChange={(event) =>
                      onChange({ certificatePassword: event.target.value })
                    }
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold tracking-[0.05em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    required={!formState.id}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => onChange({ isDefault: !formState.isDefault })}
                className={`mt-4 rounded-3xl border px-4 py-4 text-left transition ${
                  formState.isDefault
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <div className="text-sm font-black uppercase tracking-[0.16em]">
                  Certificado padrão
                </div>
                <div className="mt-1 text-sm font-medium">
                  {formState.isDefault
                    ? 'Este certificado ficará como padrão para o ambiente e finalidade.'
                    : 'Ative se este for o padrão para sincronização automática.'}
                </div>
              </button>
            </section>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Fechar
            </button>
            <button type="submit" disabled={saving} className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>
              {saving ? 'Salvando...' : 'Salvar certificado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InstallmentsEditorModal({
  isOpen,
  loading,
  saving,
  note,
  installments,
  errorMessage,
  logoUrl,
  companyName,
  onClose,
  onInstallmentChange,
  onApplyFirstDueDate,
  onAddInstallment,
  onRemoveInstallment,
  onSave,
}: {
  isOpen: boolean;
  loading: boolean;
  saving: boolean;
  note: Pick<PayableInvoiceImportSummary, 'invoiceNumber' | 'series' | 'supplierName' | 'totalInvoiceAmount'> | null;
  installments: InstallmentEditorItem[];
  errorMessage: string | null;
  logoUrl: string | null;
  companyName: string | null;
  onClose: () => void;
  onInstallmentChange: (installmentIndex: number, dueDate: string) => void;
  onApplyFirstDueDate: (firstDueDate: string) => void;
  onAddInstallment: () => void;
  onRemoveInstallment: () => void;
  onSave: () => void;
}) {
  const [firstDueDate, setFirstDueDate] = useState('');

  useEffect(() => {
    setFirstDueDate(installments[0]?.dueDate || '');
  }, [installments]);

  if (!isOpen) {
    return null;
  }

  return (
    <AuditedPopupShell
      isOpen={isOpen}
      screenId={INSTALLMENTS_MODAL_SCREEN_ID}
      eyebrow="Parcelas da nota"
      title={`${note?.supplierName || 'FORNECEDOR'} - NF-e ${note?.invoiceNumber || '---'}${note?.series ? ` / ${note.series}` : ''}`}
      description="Ajuste os vencimentos ou a quantidade de parcelas. Os valores são redistribuídos automaticamente pelo total da nota."
      brandingName={companyName || 'FINANCEIRO'}
      logoUrl={logoUrl}
      originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/importacao-notas/page.tsx"
      auditText={installmentsModalAuditText}
      sqlText={`SELECT
  PII.id,
  PII.invoiceNumber,
  PII.series,
  PII.totalInvoiceAmount,
  SU.legalName AS supplierName,
  PIIN.id AS installmentId,
  PIIN.installmentNumber,
  PIIN.installmentLabel,
  PIIN.dueDate,
  PIIN.amount
FROM payable_invoice_imports PII
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
LEFT JOIN payable_invoice_import_installments PIIN
  ON PIIN.invoiceImportId = PII.id
  AND PIIN.canceledAt IS NULL
WHERE PII.id = :importId
  AND PII.companyId = :companyId
  AND PII.canceledAt IS NULL
ORDER BY PIIN.installmentNumber ASC;`}
      onClose={onClose}
      panelClassName="max-w-4xl"
      bodyClassName="overflow-hidden"
      screenCopyWrapperClassName="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      headerActions={
        <>
          <button
            type="button"
            title="INCLUIR NOVA PARCELA"
            aria-label="INCLUIR NOVA PARCELA"
            onClick={onAddInstallment}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-200 bg-white text-2xl font-black text-emerald-600 shadow-sm transition hover:bg-emerald-50"
          >
            +
          </button>
          <button
            type="button"
            title="EXCLUIR UMA PARCELA"
            aria-label="EXCLUIR UMA PARCELA"
            onClick={onRemoveInstallment}
            disabled={installments.length <= 1}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-white text-2xl font-black text-rose-600 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            -
          </button>
        </>
      }
      footerActions={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={loading || saving || !installments.length}
            className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
          >
            {saving ? 'Salvando...' : 'Salvar parcelas'}
          </button>
        </>
      }
    >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-[0.9fr_0.7fr_1.4fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Valor total da nota
              </div>
              <div className="mt-1.5 text-sm font-black text-slate-900">
                {formatCurrency(note?.totalInvoiceAmount || 0)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Quantidade de parcelas
              </div>
              <div className="mt-1.5 text-sm font-black text-slate-900">
                {installments.length}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-end">
                <div className="flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Data do 1° vencimento
                </div>
                <input
                  type="date"
                  value={firstDueDate}
                  onChange={(event) => setFirstDueDate(event.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
                </div>
                <button
                  type="button"
                  onClick={() => onApplyFirstDueDate(firstDueDate)}
                  disabled={!firstDueDate || loading || !installments.length}
                  className="rounded-2xl border border-blue-200 bg-white px-5 py-2 text-sm font-black uppercase tracking-[0.16em] text-blue-700 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
              Carregando parcelas da nota...
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="max-h-[40vh] overflow-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="sticky top-0 z-[1] bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Parcela
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Vencimento
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {installments.map((installment, index) => (
                      <tr key={installment.id || `draft-${index}`}>
                        <td className="px-4 py-2.5 align-middle text-sm font-black text-slate-900">
                          {installment.installmentNumber}
                        </td>
                        <td className="px-4 py-2.5 align-middle">
                          <input
                            type="date"
                            value={installment.dueDate}
                            onChange={(event) => onInstallmentChange(index, event.target.value)}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          />
                        </td>
                        <td className="px-4 py-2.5 align-middle text-sm font-black text-slate-900">
                          {formatCurrency(installment.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
        </div>
    </AuditedPopupShell>
  );
}

function ProductsPreviewModal({
  isOpen,
  loading,
  note,
  items,
  errorMessage,
  logoUrl,
  companyName,
  onClose,
}: {
  isOpen: boolean;
  loading: boolean;
  note: Pick<
    PayableInvoiceImportSummary,
    'invoiceNumber' | 'series' | 'supplierName' | 'itemsCount' | 'totalProductsAmount'
  > | null;
  items: PayableInvoiceImportDetail['items'];
  errorMessage: string | null;
  logoUrl: string | null;
  companyName: string | null;
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <AuditedPopupShell
      isOpen={isOpen}
      screenId={PRODUCTS_MODAL_SCREEN_ID}
      eyebrow="Produtos da nota"
      title={`${note?.supplierName || 'FORNECEDOR'} - NF-e ${note?.invoiceNumber || '---'}${note?.series ? ` / ${note.series}` : ''}`}
      description="Visualize os produtos importados da nota fiscal antes da aprovação."
      brandingName={companyName || 'FINANCEIRO'}
      logoUrl={logoUrl}
      originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/importacao-notas/page.tsx"
      auditText={productsModalAuditText}
      sqlText={`SELECT
  PII.id,
  PII.invoiceNumber,
  PII.series,
  SU.legalName AS supplierName,
  PIIT.id AS itemId,
  PIIT.lineNumber,
  PIIT.description,
  PIIT.unitCode,
  PIIT.quantity,
  PIIT.unitPrice,
  PIIT.totalPrice,
  PIIT.barcode,
  PIIT.ncmCode
FROM payable_invoice_imports PII
LEFT JOIN suppliers SU
  ON SU.id = PII.supplierId
LEFT JOIN payable_invoice_import_items PIIT
  ON PIIT.invoiceImportId = PII.id
  AND PIIT.canceledAt IS NULL
WHERE PII.id = :importId
  AND PII.companyId = :companyId
  AND PII.canceledAt IS NULL
ORDER BY PIIT.lineNumber ASC;`}
      onClose={onClose}
      panelClassName="max-w-5xl"
      bodyClassName="overflow-hidden"
      screenCopyWrapperClassName="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
      footerActions={
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Fechar
        </button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-[0.75fr_0.95fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Quantidade de itens
              </div>
              <div className="mt-1.5 text-sm font-black text-slate-900">
                {note?.itemsCount || items.length}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Valor total dos produtos
              </div>
              <div className="mt-1.5 text-sm font-black text-slate-900">
                {formatCurrency(note?.totalProductsAmount || 0)}
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
              Carregando produtos da nota...
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="max-h-[48vh] overflow-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="sticky top-0 z-[1] bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Item
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Descrição
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Unidade
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Qtde
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Unitário
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {items.length ? (
                      items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 align-middle text-sm font-black text-slate-900">
                            {item.lineNumber}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-sm font-semibold text-slate-700">
                            <div>{item.description}</div>
                            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {item.barcode || item.ncmCode || 'SEM CÓDIGO'}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 align-middle text-sm font-semibold text-slate-700">
                            {item.unitCode || '---'}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-sm font-semibold text-slate-700">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-sm font-semibold text-slate-700">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-sm font-black text-slate-900">
                            {formatCurrency(item.totalPrice)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                          Nenhum produto encontrado para esta nota.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuditedPopupShell>
  );
}

function RecentImportGridConfigModal({
  isOpen,
  hidden,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  hidden: RecentImportGridColumnKey[];
  onSave: (hidden: RecentImportGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftHidden, setDraftHidden] =
    useState<RecentImportGridColumnKey[]>(hidden);

  useEffect(() => {
    if (isOpen) {
      setDraftHidden(hidden);
    }
  }, [hidden, isOpen]);

  if (!isOpen) {
    return null;
  }

  const visibleCount =
    RECENT_IMPORT_GRID_COLUMNS.length - draftHidden.length + 3;

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <div className={FINANCE_GRID_PAGE_LAYOUT.modalPanel}>
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
              Configuração da tela
            </div>
            <h2 className="mt-1 text-2xl font-black text-slate-900">
              Configurar colunas do grid
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Selecione as colunas informativas da lista de notas pendentes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className={FINANCE_GRID_PAGE_LAYOUT.modalBody}>
          <div className={FINANCE_GRID_PAGE_LAYOUT.modalSummaryCard}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-slate-700">
                  Colunas visíveis: {visibleCount}
                </div>
                <div className="text-xs font-medium text-slate-500">
                  Semáforo, fornecedor e ações permanecem fixos neste grid.
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setDraftHidden([])}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Restaurar padrão
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSave(draftHidden);
                    onClose();
                  }}
                  className="rounded-full bg-blue-600 px-5 py-2 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-auto pr-1">
            <div className="space-y-3">
              {RECENT_IMPORT_GRID_COLUMNS.map((column) => {
                const visible = !draftHidden.includes(column.key);

                return (
                  <div
                    key={column.key}
                    className={`${FINANCE_GRID_PAGE_LAYOUT.modalListItem} ${
                      visible
                        ? FINANCE_GRID_PAGE_LAYOUT.modalActiveItem
                        : FINANCE_GRID_PAGE_LAYOUT.modalInactiveItem
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setDraftHidden((current) =>
                          current.includes(column.key)
                            ? current.filter((item) => item !== column.key)
                            : [...current, column.key],
                        )
                      }
                      className={
                        visible
                          ? FINANCE_GRID_PAGE_LAYOUT.modalToggleOn
                          : FINANCE_GRID_PAGE_LAYOUT.modalToggleOff
                      }
                    >
                      {visible ? '✓' : '✕'}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black uppercase tracking-[0.12em] text-slate-700">
                        {column.label}
                      </div>
                      <div className="mt-1 text-xs font-medium text-slate-500">
                        Controle a visibilidade desta coluna no grid.
                      </div>
                    </div>

                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                      {visible ? 'Visível' : 'Oculta'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinanceiroImportacaoNotasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
  const [xmlContent, setXmlContent] = useState('');
  const [recentImports, setRecentImports] = useState<PayableInvoiceImportSummary[]>([]);
  const [recentImportFilters, setRecentImportFilters] =
    useState<RecentImportFilters>(EMPTY_RECENT_IMPORT_FILTERS);
  const [recentImportFilterDrafts, setRecentImportFilterDrafts] =
    useState<RecentImportFilters>(EMPTY_RECENT_IMPORT_FILTERS);
  const [recentImportActiveFilter, setRecentImportActiveFilter] =
    useState<RecentImportFilterColumn | null>(null);
  const [recentImportSort, setRecentImportSort] =
    useState<RecentImportSortState>(null);
  const [recentImportPageSize, setRecentImportPageSize] = useState(10);
  const [recentImportPage, setRecentImportPage] = useState(1);
  const [isRecentImportColumnConfigOpen, setIsRecentImportColumnConfigOpen] =
    useState(false);
  const [recentImportHiddenColumns, setRecentImportHiddenColumns] = useState<
    RecentImportGridColumnKey[]
  >([]);
  const [isRecentImportExportModalOpen, setIsRecentImportExportModalOpen] =
    useState(false);
  const [recentImportExportFormat, setRecentImportExportFormat] =
    useState<GridExportFormat>('excel');
  const [recentImportExportColumns, setRecentImportExportColumns] = useState(
    () => buildDefaultExportColumns(RECENT_IMPORT_EXPORT_COLUMNS),
  );
  const [certificates, setCertificates] = useState<FiscalCertificateItem[]>([]);
  const [importResult, setImportResult] = useState<PayableInvoiceImportDetail | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [loadingCertificates, setLoadingCertificates] = useState(false);
  const [savingXml, setSavingXml] = useState(false);
  const [savingCertificate, setSavingCertificate] = useState(false);
  const [syncingCertificateId, setSyncingCertificateId] = useState<string | null>(null);
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [isInstallmentsModalOpen, setIsInstallmentsModalOpen] = useState(false);
  const [loadingInstallmentsModal, setLoadingInstallmentsModal] = useState(false);
  const [savingInstallmentsModal, setSavingInstallmentsModal] = useState(false);
  const [installmentsModalError, setInstallmentsModalError] = useState<string | null>(null);
  const [selectedImportForInstallments, setSelectedImportForInstallments] = useState<PayableInvoiceImportSummary | null>(null);
  const [editableInstallments, setEditableInstallments] = useState<InstallmentEditorItem[]>([]);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedImportForCancel, setSelectedImportForCancel] =
    useState<PayableInvoiceImportSummary | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelModalError, setCancelModalError] = useState<string | null>(null);
  const [cancelingImportId, setCancelingImportId] = useState<string | null>(null);
  const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
  const [loadingProductsModal, setLoadingProductsModal] = useState(false);
  const [productsModalError, setProductsModalError] = useState<string | null>(null);
  const [selectedImportForProducts, setSelectedImportForProducts] = useState<PayableInvoiceImportSummary | null>(null);
  const [selectedImportItems, setSelectedImportItems] = useState<PayableInvoiceImportDetail['items']>([]);
  const [sefazSyncModal, setSefazSyncModal] = useState<SefazSyncModalState>({
    isOpen: false,
    phase: 'loading',
    certificateAlias: '',
    searchedDateLabel: '',
    foundNotes: 0,
    message: '',
    mode: 'standard',
    retryAtLabel: null,
  });
  const [certificateForm, setCertificateForm] = useState<CertificateFormState>(
    emptyCertificateForm,
  );

  const loadRecentImports = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setRecentImports([]);
      return;
    }

    setLoadingRecent(true);

    try {
      const queryString = buildFinanceApiQueryString(runtimeContext, {
        status: 'PENDING_APPROVAL',
      });
      const response = await getJson<PayableInvoiceImportSummary[]>(
        `/payables/invoice-imports${queryString}`,
      );
      setRecentImports(response);
    } finally {
      setLoadingRecent(false);
    }
  }, [runtimeContext]);

  const loadCertificates = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setCertificates([]);
      return;
    }

    setLoadingCertificates(true);

    try {
      const queryString = buildFinanceApiQueryString(runtimeContext, {
        status: 'ALL',
      });
      const response = await getJson<FiscalCertificateItem[]>(
        `/fiscal-certificates${queryString}`,
      );
      setCertificates(response);
    } finally {
      setLoadingCertificates(false);
    }
  }, [runtimeContext]);

  const loadSidebarData = useCallback(async () => {
    try {
      await Promise.all([loadRecentImports(), loadCertificates()]);
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar os dados de importação automática.',
        ),
      );
    }
  }, [loadCertificates, loadRecentImports]);

  useEffect(() => {
    void loadSidebarData();
  }, [loadSidebarData]);

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

  const recentImportStatusOptions = useMemo(() => {
    const options = new Map<string, string>();

    recentImports.forEach((item) => {
      if (item.status) {
        options.set(item.status, item.statusLabel || item.status);
      }
    });

    return Array.from(options.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [recentImports]);

  const hasRecentImportFilters = useMemo(
    () =>
      recentImportFilters.status !== EMPTY_RECENT_IMPORT_FILTERS.status ||
      recentImportFilters.invoice !== EMPTY_RECENT_IMPORT_FILTERS.invoice ||
      recentImportFilters.supplier !== EMPTY_RECENT_IMPORT_FILTERS.supplier ||
      recentImportFilters.issueDateFrom !==
        EMPTY_RECENT_IMPORT_FILTERS.issueDateFrom ||
      recentImportFilters.issueDateTo !==
        EMPTY_RECENT_IMPORT_FILTERS.issueDateTo ||
      recentImportFilters.total !== EMPTY_RECENT_IMPORT_FILTERS.total ||
      recentImportFilters.installments !==
        EMPTY_RECENT_IMPORT_FILTERS.installments ||
      Boolean(recentImportSort),
    [recentImportFilters, recentImportSort],
  );

  const visibleRecentImportGridColumns = useMemo(
    () =>
      RECENT_IMPORT_GRID_COLUMNS.filter(
        (column) => !recentImportHiddenColumns.includes(column.key),
      ),
    [recentImportHiddenColumns],
  );
  const isRecentImportGridColumnVisible = useCallback(
    (column: RecentImportGridColumnKey) =>
      visibleRecentImportGridColumns.some((item) => item.key === column),
    [visibleRecentImportGridColumns],
  );
  const recentImportGridColSpan =
    visibleRecentImportGridColumns.length + 3;

  const updateRecentImportFilters = useCallback(
    (patch: Partial<RecentImportFilters>) => {
      setRecentImportFilters((current) => ({
        ...current,
        ...patch,
      }));
    },
    [],
  );

  const updateRecentImportFilterDrafts = useCallback(
    (patch: Partial<RecentImportFilters>) => {
      setRecentImportFilterDrafts((current) => ({
        ...current,
        ...patch,
      }));
    },
    [],
  );

  const clearRecentImportFilters = useCallback(() => {
    setRecentImportFilters(EMPTY_RECENT_IMPORT_FILTERS);
    setRecentImportFilterDrafts(EMPTY_RECENT_IMPORT_FILTERS);
    setRecentImportSort(null);
    setRecentImportActiveFilter(null);
  }, []);

  const applyRecentImportSort = useCallback(
    (column: RecentImportFilterColumn, direction: RecentImportSortDirection) => {
      setRecentImportSort({ column, direction });
      setRecentImportActiveFilter(null);
    },
    [],
  );

  const openRecentImportFilter = useCallback(
    (column: RecentImportFilterColumn | null) => {
      if (column) {
        setRecentImportFilterDrafts(recentImportFilters);
      }

      setRecentImportActiveFilter(column);
    },
    [recentImportFilters],
  );

  const applyRecentImportColumnFilter = useCallback(
    (column: RecentImportFilterColumn) => {
      if (column === 'status') {
        updateRecentImportFilters({ status: recentImportFilterDrafts.status });
      } else if (column === 'invoice') {
        updateRecentImportFilters({
          invoice: recentImportFilterDrafts.invoice.trim(),
        });
      } else if (column === 'supplier') {
        updateRecentImportFilters({
          supplier: recentImportFilterDrafts.supplier.trim(),
        });
      } else if (column === 'issueDate') {
        updateRecentImportFilters({
          issueDateFrom: recentImportFilterDrafts.issueDateFrom,
          issueDateTo: recentImportFilterDrafts.issueDateTo,
        });
      } else if (column === 'total') {
        updateRecentImportFilters({
          total: recentImportFilterDrafts.total.trim(),
        });
      } else {
        updateRecentImportFilters({
          installments: recentImportFilterDrafts.installments.trim(),
        });
      }

      setRecentImportActiveFilter(null);
    },
    [recentImportFilterDrafts, updateRecentImportFilters],
  );

  const clearRecentImportColumnFilter = useCallback(
    (column: RecentImportFilterColumn) => {
      setRecentImportFilters((current) => {
        if (column === 'status') {
          return { ...current, status: EMPTY_RECENT_IMPORT_FILTERS.status };
        }

        if (column === 'invoice') {
          return { ...current, invoice: EMPTY_RECENT_IMPORT_FILTERS.invoice };
        }

        if (column === 'supplier') {
          return { ...current, supplier: EMPTY_RECENT_IMPORT_FILTERS.supplier };
        }

        if (column === 'issueDate') {
          return {
            ...current,
            issueDateFrom: EMPTY_RECENT_IMPORT_FILTERS.issueDateFrom,
            issueDateTo: EMPTY_RECENT_IMPORT_FILTERS.issueDateTo,
          };
        }

        if (column === 'total') {
          return { ...current, total: EMPTY_RECENT_IMPORT_FILTERS.total };
        }

        return {
          ...current,
          installments: EMPTY_RECENT_IMPORT_FILTERS.installments,
        };
      });
      setRecentImportFilterDrafts((current) => {
        if (column === 'status') {
          return { ...current, status: EMPTY_RECENT_IMPORT_FILTERS.status };
        }

        if (column === 'invoice') {
          return { ...current, invoice: EMPTY_RECENT_IMPORT_FILTERS.invoice };
        }

        if (column === 'supplier') {
          return { ...current, supplier: EMPTY_RECENT_IMPORT_FILTERS.supplier };
        }

        if (column === 'issueDate') {
          return {
            ...current,
            issueDateFrom: EMPTY_RECENT_IMPORT_FILTERS.issueDateFrom,
            issueDateTo: EMPTY_RECENT_IMPORT_FILTERS.issueDateTo,
          };
        }

        if (column === 'total') {
          return { ...current, total: EMPTY_RECENT_IMPORT_FILTERS.total };
        }

        return {
          ...current,
          installments: EMPTY_RECENT_IMPORT_FILTERS.installments,
        };
      });
      setRecentImportSort((current) =>
        current?.column === column ? null : current,
      );
      setRecentImportActiveFilter(null);
    },
    [],
  );

  const filteredRecentImports = useMemo(() => {
    const filtered = recentImports.filter((item) => {
      const issueDate = buildDateOnlyInputValue(item.issueDate);

      if (
        recentImportFilters.status !== 'ALL' &&
        item.status !== recentImportFilters.status
      ) {
        return false;
      }

      if (
        recentImportFilters.issueDateFrom &&
        issueDate < recentImportFilters.issueDateFrom
      ) {
        return false;
      }

      if (
        recentImportFilters.issueDateTo &&
        issueDate > recentImportFilters.issueDateTo
      ) {
        return false;
      }

      if (
        !matchesRecentImportTextFilter(
          [item.invoiceNumber, item.series, item.accessKey],
          recentImportFilters.invoice,
        )
      ) {
        return false;
      }

      if (
        !matchesRecentImportTextFilter(
          [item.supplierName, item.supplierDocument],
          recentImportFilters.supplier,
        )
      ) {
        return false;
      }

      if (
        !matchesRecentImportTextFilter(
          [
            item.totalInvoiceAmount,
            formatCurrency(item.totalInvoiceAmount),
          ],
          recentImportFilters.total,
        )
      ) {
        return false;
      }

      return matchesRecentImportTextFilter(
        [item.installmentsCount],
        recentImportFilters.installments,
      );
    });

    if (!recentImportSort) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const result = compareRecentImportSortValues(
        getRecentImportSortValue(left, recentImportSort.column),
        getRecentImportSortValue(right, recentImportSort.column),
      );

      return recentImportSort.direction === 'asc' ? result : result * -1;
    });
  }, [recentImportFilters, recentImportSort, recentImports]);

  const recentImportTotalPages = Math.max(
    1,
    Math.ceil(filteredRecentImports.length / recentImportPageSize),
  );
  const currentRecentImportPage = Math.min(
    recentImportPage,
    recentImportTotalPages,
  );
  const paginatedRecentImports = useMemo(() => {
    const startIndex = (currentRecentImportPage - 1) * recentImportPageSize;
    return filteredRecentImports.slice(
      startIndex,
      startIndex + recentImportPageSize,
    );
  }, [currentRecentImportPage, filteredRecentImports, recentImportPageSize]);
  useEffect(() => {
    setRecentImportPage(1);
  }, [recentImportFilters, recentImportPageSize, recentImportSort]);

  useEffect(() => {
    setRecentImportPage((current) =>
      Math.min(Math.max(current, 1), recentImportTotalPages),
    );
  }, [recentImportTotalPages]);

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

  const handleCertificateFileSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const base64 = await readFileAsBase64(file);
        setCertificateForm((current) => ({
          ...current,
          pfxBase64: base64,
          fileName: file.name,
        }));
        setErrorMessage(null);
      } catch {
        setErrorMessage('Não foi possível ler o arquivo PFX selecionado.');
      } finally {
        event.target.value = '';
      }
    },
    [],
  );

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
      setSyncResult(null);

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
        void loadRecentImports();
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
    [loadRecentImports, runtimeContext, xmlContent],
  );

  const handleSaveCertificate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
        setErrorMessage(
          'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
        );
        return;
      }

      setSavingCertificate(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const path = certificateForm.id
          ? `/fiscal-certificates/${certificateForm.id}`
          : '/fiscal-certificates';
        const method = certificateForm.id ? 'PATCH' : 'POST';

        await requestJson<FiscalCertificateItem>(path, {
          method,
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            companyName: runtimeContext.companyName,
            requestedBy:
              runtimeContext.cashierDisplayName ||
              runtimeContext.userRole ||
              'OPERADOR',
            aliasName: certificateForm.aliasName,
            authorStateCode: certificateForm.authorStateCode,
            environment: certificateForm.environment,
            purpose: certificateForm.purpose,
            isDefault: certificateForm.isDefault,
            pfxBase64: certificateForm.pfxBase64 || undefined,
            certificatePassword:
              certificateForm.certificatePassword || undefined,
          }),
          fallbackMessage:
            'Não foi possível salvar o certificado fiscal no Financeiro.',
        });

        setIsCertificateModalOpen(false);
        setCertificateForm(emptyCertificateForm);
        setSuccessMessage('Certificado fiscal salvo com sucesso.');
        void loadCertificates();
      } catch (error) {
        setErrorMessage(
          getFriendlyRequestErrorMessage(
            error,
            'Não foi possível salvar o certificado fiscal no Financeiro.',
          ),
        );
      } finally {
        setSavingCertificate(false);
      }
    },
    [certificateForm, loadCertificates, runtimeContext],
  );

  const handleSetDefaultCertificate = useCallback(
    async (certificate: FiscalCertificateItem) => {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;

      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        await requestJson<FiscalCertificateItem>(
          `/fiscal-certificates/${certificate.id}/set-default`,
          {
            method: 'POST',
            body: JSON.stringify({
              sourceSystem: runtimeContext.sourceSystem,
              sourceTenantId: runtimeContext.sourceTenantId,
              requestedBy:
                runtimeContext.cashierDisplayName ||
                runtimeContext.userRole ||
                'OPERADOR',
            }),
            fallbackMessage:
              'Não foi possível definir o certificado padrão.',
          },
        );

        setSuccessMessage('Certificado padrão atualizado com sucesso.');
        void loadCertificates();
      } catch (error) {
        setErrorMessage(
          getFriendlyRequestErrorMessage(
            error,
            'Não foi possível definir o certificado padrão.',
          ),
        );
      }
    },
    [loadCertificates, runtimeContext],
  );

  const handleSyncCertificate = useCallback(
    async (
      certificate: FiscalCertificateItem,
      options?: { historical?: boolean },
    ) => {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
      const historical = Boolean(options?.historical);
      const retryAt = getSefazRetryAt(certificate);

      if (retryAt && retryAt.getTime() > Date.now()) {
        setSefazSyncModal({
          isOpen: true,
          phase: 'warning',
          certificateAlias: certificate.aliasName,
          searchedDateLabel: buildTodaySearchLabel(),
          foundNotes: 0,
          message:
            'A SEFAZ pediu aguardo de 1 hora antes da próxima consulta. Esta tentativa foi bloqueada localmente para evitar consumo indevido.',
          mode: historical ? 'historical' : 'standard',
          retryAtLabel: buildDateTimeLabel(retryAt),
        });
        setErrorMessage(null);
        setSuccessMessage(null);
        return;
      }

      setSyncingCertificateId(certificate.id);
      setErrorMessage(null);
      setSuccessMessage(null);
      setImportResult(null);
      setSefazSyncModal({
        isOpen: true,
        phase: 'loading',
        certificateAlias: certificate.aliasName,
        searchedDateLabel: buildTodaySearchLabel(),
        foundNotes: 0,
        message: historical
          ? `Iniciando a varredura histórica da SEFAZ com o certificado ${certificate.aliasName}.`
          : `Consultando a SEFAZ com o certificado ${certificate.aliasName}.`,
        mode: historical ? 'historical' : 'standard',
        retryAtLabel: null,
      });

      try {
        const response = await requestJson<SyncResult>(
          `/fiscal-certificates/${certificate.id}/sync-dfe`,
          {
            method: 'POST',
            body: JSON.stringify({
              sourceSystem: runtimeContext.sourceSystem,
              sourceTenantId: runtimeContext.sourceTenantId,
              requestedBy:
                runtimeContext.cashierDisplayName ||
                runtimeContext.userRole ||
                'OPERADOR',
              maxBatches: historical ? 20 : 5,
              resetNsu: historical,
            }),
            fallbackMessage:
              'Não foi possível consultar a SEFAZ com este certificado.',
          },
        );

        setSyncResult(response);
        setSuccessMessage(
          response.importedNotes > 0
            ? `${response.message} Importação concluída com sucesso.`
            : response.message,
        );
        setSefazSyncModal((current) => ({
          ...current,
          isOpen: true,
          phase: 'success',
          foundNotes: response.importedNotes + response.duplicateNotes,
          message:
            response.importedNotes > 0
              ? `${response.message} Importação concluída com sucesso.`
              : response.message,
          retryAtLabel:
            response.statusCode === '656'
              ? buildDateTimeLabel(new Date(Date.now() + 60 * 60 * 1000))
              : null,
        }));
        await Promise.all([loadRecentImports(), loadCertificates()]);
      } catch (error) {
        setSefazSyncModal((current) => ({
          ...current,
          isOpen: false,
        }));
        setErrorMessage(
          getFriendlyRequestErrorMessage(
            error,
            'Não foi possível consultar a SEFAZ com este certificado.',
          ),
        );
      } finally {
        setSyncingCertificateId(null);
      }
    },
    [loadCertificates, loadRecentImports, runtimeContext],
  );

  const defaultCertificate = useMemo(
    () =>
      certificates.find(
        (item) =>
          item.isDefault &&
          item.status === 'ACTIVE' &&
          !item.expired &&
          item.purpose === 'NFE_DFE',
      ) || null,
    [certificates],
  );

  const handleOpenInstallmentsModal = useCallback(
    async (item: PayableInvoiceImportSummary) => {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
        setInstallmentsModalError(
          'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
        );
        return;
      }

      setSelectedImportForInstallments(item);
      setEditableInstallments([]);
      setInstallmentsModalError(null);
      setIsInstallmentsModalOpen(true);
      setLoadingInstallmentsModal(true);

      try {
        const queryString = buildFinanceApiQueryString(runtimeContext);
        const response = await getJson<PayableInvoiceImportDetail>(
          `/payables/invoice-imports/${item.id}${queryString}`,
        );

        setEditableInstallments(
          normalizeInstallmentEditorItems(
            response.installments.map((installment) => ({
              id: installment.id,
              installmentLabel:
                installment.installmentLabel || `PARCELA ${installment.installmentNumber}`,
              installmentNumber: installment.installmentNumber,
              dueDate: buildDateOnlyInputValue(installment.dueDate),
              amount: installment.amount,
            })),
            response.totalInvoiceAmount,
          ),
        );
      } catch (error) {
        setInstallmentsModalError(
          getFriendlyRequestErrorMessage(
            error,
            'Não foi possível carregar as parcelas da nota selecionada.',
          ),
        );
      } finally {
        setLoadingInstallmentsModal(false);
      }
    },
    [runtimeContext],
  );

  const handleOpenProductsModal = useCallback(
    async (item: PayableInvoiceImportSummary) => {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
        setProductsModalError(
          'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
        );
        return;
      }

      setSelectedImportForProducts(item);
      setSelectedImportItems([]);
      setProductsModalError(null);
      setIsProductsModalOpen(true);
      setLoadingProductsModal(true);

      try {
        const queryString = buildFinanceApiQueryString(runtimeContext);
        const response = await getJson<PayableInvoiceImportDetail>(
          `/payables/invoice-imports/${item.id}${queryString}`,
        );
        setSelectedImportItems(response.items || []);
      } catch (error) {
        setProductsModalError(
          getFriendlyRequestErrorMessage(
            error,
            'Não foi possível carregar os produtos da nota selecionada.',
          ),
        );
      } finally {
        setLoadingProductsModal(false);
      }
    },
    [runtimeContext],
  );

  const handleOpenCancelModal = useCallback((item: PayableInvoiceImportSummary) => {
    setSelectedImportForCancel(item);
    setCancelReason('');
    setCancelModalError(null);
    setIsCancelModalOpen(true);
  }, []);

  const handleCloseCancelModal = useCallback(() => {
    if (cancelingImportId) {
      return;
    }

    setIsCancelModalOpen(false);
    setSelectedImportForCancel(null);
    setCancelReason('');
    setCancelModalError(null);
  }, [cancelingImportId]);

  const handleCancelInvoiceImport = useCallback(async () => {
    if (!selectedImportForCancel) {
      return;
    }

    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setCancelModalError(
        'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
      );
      return;
    }

    const normalizedReason = cancelReason.trim();
    if (!normalizedReason) {
      setCancelModalError('Informe o motivo do cancelamento da nota.');
      return;
    }

    setCancelingImportId(selectedImportForCancel.id);
    setCancelModalError(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await requestJson(
        `/payables/invoice-imports/${selectedImportForCancel.id}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy:
              runtimeContext.cashierDisplayName ||
              runtimeContext.userRole ||
              'OPERADOR',
            cancellationReason: normalizedReason,
          }),
          fallbackMessage: 'Não foi possível cancelar a nota importada.',
        },
      );

      setSuccessMessage('Nota cancelada com sucesso.');
      setIsCancelModalOpen(false);
      setSelectedImportForCancel(null);
      setCancelReason('');
      await loadRecentImports();
    } catch (error) {
      setCancelModalError(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível cancelar a nota importada.',
        ),
      );
    } finally {
      setCancelingImportId(null);
    }
  }, [cancelReason, loadRecentImports, runtimeContext, selectedImportForCancel]);

  const handleInstallmentDueDateChange = useCallback((installmentIndex: number, dueDate: string) => {
    setEditableInstallments((current) =>
      current.map((installment, index) =>
        index === installmentIndex
          ? {
              ...installment,
              dueDate,
            }
          : installment,
      ),
    );
  }, []);

  const handleApplyFirstDueDate = useCallback((firstDueDate: string) => {
    if (!firstDueDate) {
      return;
    }

    setEditableInstallments((current) =>
      current.map((installment, index) => ({
        ...installment,
        dueDate: buildNextMonthlyDueDate(firstDueDate, index),
      })),
    );
  }, []);

  const handleAddInstallment = useCallback(() => {
    setEditableInstallments((current) => {
      const totalAmount = selectedImportForInstallments?.totalInvoiceAmount || 0;
      const firstDueDate = current[0]?.dueDate || new Date().toISOString().slice(0, 10);
      const nextInstallment: InstallmentEditorItem = {
        installmentLabel: '',
        installmentNumber: current.length + 1,
        dueDate: buildNextMonthlyDueDate(firstDueDate, current.length),
        amount: 0,
      };

      return normalizeInstallmentEditorItems(
        [...current, nextInstallment],
        totalAmount,
      );
    });
  }, [selectedImportForInstallments]);

  const handleRemoveInstallment = useCallback(() => {
    setEditableInstallments((current) => {
      if (current.length <= 1) {
        return current;
      }

      const totalAmount = selectedImportForInstallments?.totalInvoiceAmount || 0;
      return normalizeInstallmentEditorItems(
        current.slice(0, -1),
        totalAmount,
      );
    });
  }, [selectedImportForInstallments]);

  const handleSaveInstallments = useCallback(async () => {
    if (
      !runtimeContext.sourceSystem ||
      !runtimeContext.sourceTenantId ||
      !selectedImportForInstallments
    ) {
      setInstallmentsModalError(
        'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
      );
      return;
    }

    if (!editableInstallments.length) {
      setInstallmentsModalError('A nota precisa manter pelo menos uma parcela.');
      return;
    }

    setSavingInstallmentsModal(true);
    setInstallmentsModalError(null);

    try {
      const response = await requestJson<PayableInvoiceImportDetail & { message?: string }>(
        `/payables/invoice-imports/${selectedImportForInstallments.id}/installments`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            requestedBy:
              runtimeContext.cashierDisplayName ||
              runtimeContext.userRole ||
              'OPERADOR',
            installments: editableInstallments.map((installment) => ({
              id: installment.id,
              installmentLabel: installment.installmentLabel,
              dueDate: installment.dueDate,
              amount: installment.amount,
            })),
          }),
          fallbackMessage: 'Não foi possível atualizar as parcelas da nota.',
        },
      );

      setEditableInstallments(
        normalizeInstallmentEditorItems(
          response.installments.map((installment) => ({
            id: installment.id,
            installmentLabel:
              installment.installmentLabel || `PARCELA ${installment.installmentNumber}`,
            installmentNumber: installment.installmentNumber,
            dueDate: buildDateOnlyInputValue(installment.dueDate),
            amount: installment.amount,
          })),
          response.totalInvoiceAmount,
        ),
      );
      setSuccessMessage(
        response.message || 'Parcelas da nota atualizadas com sucesso.',
      );
      await loadRecentImports();
      setIsInstallmentsModalOpen(false);
    } catch (error) {
      setInstallmentsModalError(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível atualizar as parcelas da nota.',
        ),
      );
    } finally {
      setSavingInstallmentsModal(false);
    }
  }, [editableInstallments, loadRecentImports, runtimeContext, selectedImportForInstallments]);

  const recentImportFilterInputClass = `${FINANCE_GRID_PAGE_LAYOUT.input} h-9 rounded-xl px-3 py-2 text-xs`;

  const isRecentImportColumnFilterActive = (
    column: RecentImportFilterColumn,
  ) => {
    if (column === 'status') {
      return recentImportFilters.status !== EMPTY_RECENT_IMPORT_FILTERS.status;
    }

    if (column === 'invoice') {
      return recentImportFilters.invoice !== EMPTY_RECENT_IMPORT_FILTERS.invoice;
    }

    if (column === 'supplier') {
      return recentImportFilters.supplier !== EMPTY_RECENT_IMPORT_FILTERS.supplier;
    }

    if (column === 'issueDate') {
      return (
        recentImportFilters.issueDateFrom !== EMPTY_RECENT_IMPORT_FILTERS.issueDateFrom ||
        recentImportFilters.issueDateTo !== EMPTY_RECENT_IMPORT_FILTERS.issueDateTo
      );
    }

    if (column === 'total') {
      return recentImportFilters.total !== EMPTY_RECENT_IMPORT_FILTERS.total;
    }

    return recentImportFilters.installments !== EMPTY_RECENT_IMPORT_FILTERS.installments;
  };

  const buildRecentImportSortButtonClass = (
    column: RecentImportFilterColumn,
    direction: RecentImportSortDirection,
  ) =>
    `inline-flex h-8 w-full items-center justify-center rounded-xl border px-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${
      recentImportSort?.column === column &&
      recentImportSort.direction === direction
        ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }`;

  const buildRecentImportFilterPillClass = (
    active: boolean,
    tone: 'blue' | 'emerald' | 'amber',
  ) => {
    const toneClass =
      tone === 'emerald'
        ? active
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm'
          : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
        : tone === 'amber'
        ? active
          ? 'border-amber-300 bg-amber-50 text-amber-700 shadow-sm'
          : 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50'
        : active
        ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
        : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50';

    return `inline-flex h-8 w-full items-center justify-center rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.16em] transition ${toneClass}`;
  };

  const renderRecentImportSortControls = (
    column: RecentImportFilterColumn,
  ) => (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        Ordenar
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => applyRecentImportSort(column, 'asc')}
          className={buildRecentImportSortButtonClass(column, 'asc')}
        >
          Crescente
        </button>
        <button
          type="button"
          onClick={() => applyRecentImportSort(column, 'desc')}
          className={buildRecentImportSortButtonClass(column, 'desc')}
        >
          Decrescente
        </button>
      </div>
    </div>
  );

  const renderRecentImportClearColumnButton = (
    column: RecentImportFilterColumn,
  ) => (
    <button
      type="button"
      onClick={() => clearRecentImportColumnFilter(column)}
      className="inline-flex h-8 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-white"
    >
      Limpar
    </button>
  );

  const renderRecentImportClearAllButton = () => (
    <button
      type="button"
      onClick={clearRecentImportFilters}
      title="Limpar todos os filtros"
      aria-label="Limpar todos os filtros do grid"
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
        hasRecentImportFilters
          ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
      }`}
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 6l1 14h10l1-14" />
      </svg>
    </button>
  );

  const renderRecentImportTextFilter = (
    column: RecentImportFilterColumn,
    placeholder: string,
  ) => (
    <div className="space-y-3">
      {renderRecentImportSortControls(column)}
      <div className="space-y-1.5">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Filtrar
        </div>
        <input
          value={
            column === 'invoice'
              ? recentImportFilterDrafts.invoice
              : column === 'supplier'
              ? recentImportFilterDrafts.supplier
              : column === 'total'
              ? recentImportFilterDrafts.total
              : recentImportFilterDrafts.installments
          }
          onChange={(event) => {
            if (column === 'invoice') {
              updateRecentImportFilterDrafts({ invoice: event.target.value });
              return;
            }

            if (column === 'supplier') {
              updateRecentImportFilterDrafts({ supplier: event.target.value });
              return;
            }

            if (column === 'total') {
              updateRecentImportFilterDrafts({ total: event.target.value });
              return;
            }

            updateRecentImportFilterDrafts({ installments: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              applyRecentImportColumnFilter(column);
            }
          }}
          placeholder={placeholder}
          className={recentImportFilterInputClass}
        />
      </div>
      <button
        type="button"
        onClick={() => applyRecentImportColumnFilter(column)}
        className="inline-flex h-8 w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
      >
        Filtrar
      </button>
      {renderRecentImportClearColumnButton(column)}
    </div>
  );

  const renderRecentImportDateFilter = () => (
    <div className="space-y-3">
      {renderRecentImportSortControls('issueDate')}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            De
          </span>
          <input
            type="date"
            value={recentImportFilterDrafts.issueDateFrom}
            onChange={(event) =>
              updateRecentImportFilterDrafts({ issueDateFrom: event.target.value })
            }
            className={recentImportFilterInputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Até
          </span>
          <input
            type="date"
            value={recentImportFilterDrafts.issueDateTo}
            onChange={(event) =>
              updateRecentImportFilterDrafts({ issueDateTo: event.target.value })
            }
            className={recentImportFilterInputClass}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => applyRecentImportColumnFilter('issueDate')}
        className="inline-flex h-8 w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
      >
        Filtrar
      </button>
      {renderRecentImportClearColumnButton('issueDate')}
    </div>
  );

  const renderRecentImportStatusFilter = () => {
    const statusOptions =
      recentImportStatusOptions.length > 0
        ? recentImportStatusOptions
        : [{ value: 'PENDING_APPROVAL', label: 'PENDENTE' }];

    return (
      <div className="space-y-3">
        {renderRecentImportSortControls('status')}
        <div className="space-y-2">
          <div className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Filtrar status
          </div>
          <div className="grid gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setRecentImportFilters((current) => ({
                    ...current,
                    status: option.value,
                  }));
                  setRecentImportFilterDrafts((current) => ({
                    ...current,
                    status: option.value,
                  }));
                  setRecentImportActiveFilter(null);
                }}
                className={buildRecentImportFilterPillClass(
                  recentImportFilters.status === option.value,
                  option.value === 'APPROVED' ? 'emerald' : 'amber',
                )}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setRecentImportFilters((current) => ({
                  ...current,
                  status: 'ALL',
                }));
                setRecentImportFilterDrafts((current) => ({
                  ...current,
                  status: 'ALL',
                }));
                setRecentImportActiveFilter(null);
              }}
              className={buildRecentImportFilterPillClass(
                recentImportFilters.status === 'ALL',
                'blue',
              )}
            >
              Todos
            </button>
          </div>
        </div>
        {renderRecentImportClearColumnButton('status')}
      </div>
    );
  };

  const renderRecentImportHeader = (
    column: RecentImportFilterColumn,
    label: string,
    content: ReactNode,
    align: 'left' | 'right' = 'left',
  ) => {
    const isPanelOpen = recentImportActiveFilter === column;
    const isColumnActive =
      isRecentImportColumnFilterActive(column) ||
      recentImportSort?.column === column;

    return (
      <div
        className={`relative flex items-center gap-1.5 ${
          align === 'right' ? 'justify-end' : ''
        }`}
      >
        <span>{label}</span>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openRecentImportFilter(isPanelOpen ? null : column);
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          title={`FILTRAR ${label}`}
          aria-label={`Filtrar ${label}`}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
            isColumnActive || isPanelOpen
              ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
        {isPanelOpen ? (
          <div
            onClick={(event) => event.stopPropagation()}
            className={`absolute top-full z-40 mt-2 w-[246px] rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xl ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {content}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`${FINANCE_GRID_PAGE_LAYOUT.shell} h-screen overflow-hidden`}>
      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} flex h-full min-h-0 flex-col overflow-hidden`}>
        <SefazSyncProgressModal
          state={sefazSyncModal}
          logoUrl={runtimeContext.logoUrl}
          companyName={runtimeContext.companyName}
          onClose={() =>
            setSefazSyncModal((current) => ({
              ...current,
              isOpen: false,
            }))
          }
        />
        <InstallmentsEditorModal
          isOpen={isInstallmentsModalOpen}
          loading={loadingInstallmentsModal}
          saving={savingInstallmentsModal}
          note={selectedImportForInstallments}
          installments={editableInstallments}
          errorMessage={installmentsModalError}
          logoUrl={runtimeContext.logoUrl}
          companyName={runtimeContext.companyName}
          onClose={() => {
            setIsInstallmentsModalOpen(false);
            setLoadingInstallmentsModal(false);
            setSavingInstallmentsModal(false);
            setInstallmentsModalError(null);
            setSelectedImportForInstallments(null);
            setEditableInstallments([]);
          }}
          onInstallmentChange={handleInstallmentDueDateChange}
          onApplyFirstDueDate={handleApplyFirstDueDate}
          onAddInstallment={handleAddInstallment}
          onRemoveInstallment={handleRemoveInstallment}
          onSave={() => void handleSaveInstallments()}
        />
        <ProductsPreviewModal
          isOpen={isProductsModalOpen}
          loading={loadingProductsModal}
          note={selectedImportForProducts}
          items={selectedImportItems}
          errorMessage={productsModalError}
          logoUrl={runtimeContext.logoUrl}
          companyName={runtimeContext.companyName}
          onClose={() => {
            setIsProductsModalOpen(false);
            setLoadingProductsModal(false);
            setProductsModalError(null);
            setSelectedImportForProducts(null);
            setSelectedImportItems([]);
          }}
        />
        {isCancelModalOpen && selectedImportForCancel ? (
          <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
            <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
              <div className="border-b border-slate-100 bg-rose-50 px-6 py-5">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-600">
                  Cancelamento obrigatório
                </div>
                <div className="mt-2 text-xl font-black text-slate-900">
                  Cancelar NF-e {selectedImportForCancel.invoiceNumber}
                  {selectedImportForCancel.series ? ` / ${selectedImportForCancel.series}` : ''}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-600">
                  {selectedImportForCancel.supplierName || 'FORNECEDOR NÃO INFORMADO'}
                </div>
              </div>

              <div className="space-y-4 p-6">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Motivo do cancelamento
                  </span>
                  <textarea
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    className="min-h-32 w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                    placeholder="INFORME O MOTIVO..."
                    disabled={Boolean(cancelingImportId)}
                  />
                </label>

                {cancelModalError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {cancelModalError}
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCloseCancelModal}
                    disabled={Boolean(cancelingImportId)}
                    className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCancelInvoiceImport()}
                    disabled={Boolean(cancelingImportId)}
                    className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white shadow-lg shadow-rose-600/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cancelingImportId ? 'Cancelando...' : 'Confirmar cancelamento'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-slate-100 p-3">
          <div className="shrink-0 space-y-2">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-2">
              <div className="space-y-1.5">
                {loadingCertificates ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-500">
                    Carregando certificados fiscais...
                  </div>
                ) : certificates.length ? (
                  certificates.map((certificate, index) => (
                    <div
                      key={certificate.id}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-black leading-tight text-slate-900">
                              {certificate.aliasName}
                            </div>
                            {certificate.isDefault ? (
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">
                                Padrão
                              </span>
                            ) : null}
                            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${getCertificateStatusClass(certificate)}`}>
                              {certificate.status === 'ACTIVE'
                                ? certificate.expired
                                  ? 'VENCIDO'
                                  : 'ATIVO'
                                : 'INATIVO'}
                            </span>
                            <span className="truncate text-xs font-semibold text-slate-600">
                              {certificate.holderName} • {certificate.holderDocument}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            <span>{certificate.environment === 'PRODUCTION' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}</span>
                            <span>UF {certificate.authorStateCode}</span>
                            <span>{certificate.purpose}</span>
                            <span>Validade: {formatDateLabel(certificate.validTo || null)}</span>
                            <span>
                              Última sincronização: {formatDateLabel(certificate.lastSyncAt || null)}
                              {certificate.lastSyncStatus ? ` • status ${certificate.lastSyncStatus}` : ''}
                              {certificate.lastSyncMessage ? ` • ${certificate.lastSyncMessage}` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          {!certificate.isDefault ? (
                            <button
                              type="button"
                              onClick={() => void handleSetDefaultCertificate(certificate)}
                              className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100"
                            >
                              Tornar padrão
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => void handleSyncCertificate(certificate)}
                            disabled={
                              syncingCertificateId === certificate.id ||
                              certificate.status !== 'ACTIVE' ||
                              certificate.expired
                            }
                            className="rounded-2xl bg-blue-600 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {syncingCertificateId === certificate.id
                              ? 'Consultando...'
                              : 'Importar SEFAZ'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleSyncCertificate(certificate, {
                                historical: true,
                              })
                            }
                            disabled={
                              syncingCertificateId === certificate.id ||
                              certificate.status !== 'ACTIVE' ||
                              certificate.expired
                            }
                            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {syncingCertificateId === certificate.id
                              ? 'Buscando...'
                              : 'Buscar histórico'}
                          </button>

                          {(certificate.isDefault || (!defaultCertificate && index === 0)) ? (
                            <Link
                              href={`/contas-a-pagar/importacao-notas/manual${navigationQuery}`}
                              className="rounded-2xl border border-rose-400 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-rose-600 shadow-sm transition hover:bg-rose-50"
                            >
                              Importar Manualmente
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-500">
                    Nenhum certificado fiscal cadastrado para este tenant.
                  </div>
                )}
              </div>
            </section>

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

          </div>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                  Pendentes de aprovação
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
                  {recentImports.length} nota{recentImports.length === 1 ? '' : 's'}
                </span>
              </div>

              <Link
                href={`/contas-a-pagar/notas-importadas${navigationQuery}`}
                className="text-sm font-bold uppercase tracking-[0.14em] text-blue-600"
              >
                Consultar Notas Aprovadas
              </Link>
            </div>

            <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                <table className="w-full min-w-[1020px] table-fixed divide-y divide-slate-200">
                  <colgroup>
                    <col className="w-[50px]" />
                    {isRecentImportGridColumnVisible('invoice') ? (
                      <col className="w-[210px]" />
                    ) : null}
                    <col />
                    {isRecentImportGridColumnVisible('issueDate') ? (
                      <col className="w-[98px]" />
                    ) : null}
                    {isRecentImportGridColumnVisible('total') ? (
                      <col className="w-[126px]" />
                    ) : null}
                    {isRecentImportGridColumnVisible('installments') ? (
                      <col className="w-[120px]" />
                    ) : null}
                    <col className="w-[166px]" />
                  </colgroup>
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        <div className="flex items-center">
                          {renderRecentImportClearAllButton()}
                        </div>
                      </th>
                      {isRecentImportGridColumnVisible('invoice') ? (
                        <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          {renderRecentImportHeader(
                            'invoice',
                            'Nota fiscal',
                            renderRecentImportTextFilter(
                              'invoice',
                              'NF-E, SERIE OU CHAVE...',
                            ),
                          )}
                        </th>
                      ) : null}
                      <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {renderRecentImportHeader(
                          'supplier',
                          'Fornecedor',
                          renderRecentImportTextFilter(
                            'supplier',
                            'FORNECEDOR OU CNPJ...',
                          ),
                        )}
                      </th>
                      {isRecentImportGridColumnVisible('issueDate') ? (
                        <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          {renderRecentImportHeader(
                            'issueDate',
                            'Emissão',
                            renderRecentImportDateFilter(),
                          )}
                        </th>
                      ) : null}
                      {isRecentImportGridColumnVisible('total') ? (
                        <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          {renderRecentImportHeader(
                            'total',
                            'Valor total',
                            renderRecentImportTextFilter(
                              'total',
                              'VALOR...',
                            ),
                            'right',
                          )}
                        </th>
                      ) : null}
                      {isRecentImportGridColumnVisible('installments') ? (
                        <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          {renderRecentImportHeader(
                            'installments',
                            'Duplicatas',
                            renderRecentImportTextFilter(
                              'installments',
                              'QTDE...',
                            ),
                            'right',
                          )}
                        </th>
                      ) : null}
                      <th className="sticky top-0 z-20 bg-slate-50 px-2.5 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        Ações
                      </th>
                    </tr>
                    {recentImportActiveFilter ? (
                      <tr aria-hidden="true">
                        <th colSpan={recentImportGridColSpan} className="h-56 bg-white p-0" />
                      </tr>
                    ) : null}
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {loadingRecent ? (
                      <tr>
                        <td colSpan={recentImportGridColSpan} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                          Carregando notas pendentes...
                        </td>
                      </tr>
                    ) : paginatedRecentImports.length ? (
                      paginatedRecentImports.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="px-2.5 py-2 align-middle">
                            <div className="flex items-center">
                              <span
                                className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${getSemaphoreClass(item.semaphore)}`}
                                title={item.statusLabel || 'AGUARDANDO APROVAÇÃO'}
                                aria-label={item.statusLabel || 'AGUARDANDO APROVAÇÃO'}
                                role="img"
                              />
                            </div>
                          </td>
                          {isRecentImportGridColumnVisible('invoice') ? (
                            <td className="px-2.5 py-2 align-middle text-xs font-semibold text-slate-700">
                              <div className="truncate font-black text-slate-900">
                                NF-e {item.invoiceNumber}
                                {item.series ? ` / ${item.series}` : ''}
                              </div>
                            </td>
                          ) : null}
                          <td className="px-2.5 py-2 align-middle text-xs font-semibold text-slate-700">
                            <div className="truncate" title={item.supplierName || '---'}>
                              {item.supplierName || '---'}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                              {item.supplierDocument || 'SEM DOCUMENTO'}
                            </div>
                          </td>
                          {isRecentImportGridColumnVisible('issueDate') ? (
                            <td className="px-2.5 py-2 align-middle text-xs font-semibold text-slate-700">
                              {formatDateLabel(item.issueDate)}
                            </td>
                          ) : null}
                          {isRecentImportGridColumnVisible('total') ? (
                            <td className="px-2.5 py-2 align-middle text-xs font-black text-slate-900">
                              {formatCurrency(item.totalInvoiceAmount)}
                            </td>
                          ) : null}
                          {isRecentImportGridColumnVisible('installments') ? (
                            <td className="px-2.5 py-2 align-middle text-center text-xs font-semibold text-slate-700">
                              {item.installmentsCount}
                            </td>
                          ) : null}
                          <td className="px-2.5 py-2 align-middle">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleOpenProductsModal(item)}
                                title="VISUALIZAR OS PRODUTOS IMPORTADOS DESTA NOTA"
                                aria-label="Visualizar os produtos importados desta nota"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-700 transition hover:bg-emerald-50"
                              >
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 3l7 4-7 4-7-4 7-4z" />
                                  <path d="M5 7v10l7 4 7-4V7" />
                                  <path d="M12 11v10" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCancelModal(item)}
                                title="CANCELAR ESTA NOTA IMPORTADA"
                                aria-label="Cancelar esta nota importada"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300 bg-white text-rose-700 transition hover:bg-rose-50"
                              >
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M18 6 6 18" />
                                  <path d="m6 6 12 12" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleOpenInstallmentsModal(item)}
                                title="VISUALIZAR E AJUSTAR AS PARCELAS DESTA NOTA"
                                aria-label="Visualizar e ajustar as parcelas desta nota"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                              >
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect x="4" y="3" width="16" height="18" rx="2" />
                                  <path d="M8 7h8" />
                                  <path d="M8 11h8" />
                                  <path d="M8 15h5" />
                                </svg>
                              </button>
                              <Link
                                href={`/contas-a-pagar/notas-importadas/${item.id}${navigationQuery}`}
                                title="ABRIR A TELA COMPLETA DE DETALHES E APROVAÇÃO DESTA NOTA"
                                aria-label="Abrir a tela completa de detalhes e aprovação desta nota"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                              >
                                <svg
                                  className="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M14 5h5v5" />
                                  <path d="M10 14L19 5" />
                                  <path d="M19 14v5H5V5h5" />
                                </svg>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={recentImportGridColSpan} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                          Nenhuma nota pendente encontrada para este tenant.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRecentImportColumnConfigOpen(true)}
                    title="ALTERAR COLUNAS GRID"
                    aria-label="ALTERAR COLUNAS GRID"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <rect x="4" y="5" width="16" height="14" rx="2" strokeWidth={2} />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5v14M15 5v14" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRecentImportExportModalOpen(true)}
                    className={FINANCE_GRID_PAGE_LAYOUT.footerIconButton}
                    aria-label="Imprimir"
                    title="Imprimir"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M6 9V3h12v6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 14h12v7H6z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Semáforo AGUARDANDO APROVAÇÃO"
                    title="AGUARDANDO APROVAÇÃO"
                    aria-pressed="true"
                    className="relative h-6 w-14 scale-105 rounded-full border border-white bg-amber-400 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35),0_8px_24px_rgba(15,23,42,0.22)] ring-4 ring-slate-400 ring-offset-2 ring-offset-slate-100 transition duration-200"
                  >
                    <span className="absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm" />
                    <span className="sr-only">AGUARDANDO APROVAÇÃO</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <select
                    value={recentImportPageSize}
                    onChange={(event) =>
                      setRecentImportPageSize(Number(event.target.value))
                    }
                    aria-label="Registros por página"
                    className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 outline-none transition hover:bg-slate-50 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  >
                    {[10, 20, 50, 100].map((pageSize) => (
                      <option
                        key={pageSize}
                        value={pageSize}
                      >
                        {pageSize}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    aria-label="Voltar para o início"
                    title="Voltar para o início"
                    onClick={() => setRecentImportPage(1)}
                    disabled={currentRecentImportPage <= 1}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'<<'}
                  </button>
                  <button
                    type="button"
                    aria-label="Voltar uma página"
                    title="Voltar uma página"
                    onClick={() =>
                      setRecentImportPage((current) => Math.max(1, current - 1))
                    }
                    disabled={currentRecentImportPage <= 1}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'<'}
                  </button>
                  <div className="min-w-20 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    {currentRecentImportPage}/{recentImportTotalPages}
                  </div>
                  <button
                    type="button"
                    aria-label="Avançar uma página"
                    title="Avançar uma página"
                    onClick={() =>
                      setRecentImportPage((current) =>
                        Math.min(recentImportTotalPages, current + 1),
                      )
                    }
                    disabled={currentRecentImportPage >= recentImportTotalPages}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'>'}
                  </button>
                  <button
                    type="button"
                    aria-label="Ir para o fim"
                    title="Ir para o fim"
                    onClick={() => setRecentImportPage(recentImportTotalPages)}
                    disabled={currentRecentImportPage >= recentImportTotalPages}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'>>'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <RecentImportGridConfigModal
        isOpen={isRecentImportColumnConfigOpen}
        hidden={recentImportHiddenColumns}
        onSave={setRecentImportHiddenColumns}
        onClose={() => setIsRecentImportColumnConfigOpen(false)}
      />

      <GridExportModal
        isOpen={isRecentImportExportModalOpen}
        title="Exportar notas pendentes"
        description={`A exportação considera ${filteredRecentImports.length} registro(s) do filtro atual.`}
        format={recentImportExportFormat}
        onFormatChange={setRecentImportExportFormat}
        columns={RECENT_IMPORT_EXPORT_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={recentImportExportColumns}
        storageKey={RECENT_IMPORT_EXPORT_STORAGE_KEY}
        brandingName={runtimeContext.companyName || 'FINANCEIRO'}
        brandingLogoUrl={runtimeContext.logoUrl}
        onClose={() => setIsRecentImportExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: filteredRecentImports,
            columns: (config.orderedColumns || []).length
              ? config.orderedColumns
                  .map((key) =>
                    RECENT_IMPORT_EXPORT_COLUMNS.find(
                      (definition) => definition.key === key,
                    ),
                  )
                  .filter(
                    (
                      column,
                    ): column is GridColumnDefinition<
                      PayableInvoiceImportSummary,
                      RecentImportExportColumnKey
                    > => Boolean(column),
                  )
              : RECENT_IMPORT_EXPORT_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: recentImportExportFormat,
            fileBaseName: 'notas-pendentes-aprovacao',
            branding: {
              title: 'Notas pendentes de aprovação',
              subtitle: 'Exportação das notas pendentes filtradas no contas a pagar.',
              schoolName:
                runtimeContext.companyName ||
                filteredRecentImports[0]?.companyName ||
                recentImports[0]?.companyName ||
                'FINANCEIRO',
              logoUrl: runtimeContext.logoUrl,
            },
            pdfOptions: config.pdfOptions,
          });

          setRecentImportExportColumns(config.selectedColumns);
          setIsRecentImportExportModalOpen(false);
        }}
      />

      <CertificateModal
        isOpen={isCertificateModalOpen}
        formState={certificateForm}
        saving={savingCertificate}
        onClose={() => {
          setIsCertificateModalOpen(false);
          setCertificateForm(emptyCertificateForm);
        }}
        onChange={(patch) =>
          setCertificateForm((current) => ({
            ...current,
            ...patch,
          }))
        }
        onFileSelected={handleCertificateFileSelected}
        onSubmit={handleSaveCertificate}
      />
    </div>
  );
}
