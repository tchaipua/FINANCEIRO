'use client';

import Link from 'next/link';
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
  FiscalCertificateItem,
  PayableInvoiceImportDetail,
  PayableInvoiceImportSummary,
} from '../payables-types';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_IMPORTACAO_NOTAS';

const auditText = `--- LOGICA DA TELA ---
Esta tela centraliza a importação de notas do contas a pagar por XML manual e por consulta automática na SEFAZ.

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
- prévia da última nota importada

FILTROS APLICADOS:
- company resolvida por sourceSystem + sourceTenantId
- lista lateral mostra apenas importações pendentes de aprovação
- certificados carregados apenas do tenant atual

ORDENACAO:
- certificados por padrão, ambiente e alias
- notas pendentes por createdAt desc`;

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
};

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

function getStatusClass(status: string) {
  return status === 'APPROVED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
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

export default function FinanceiroImportacaoNotasPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
  const [xmlContent, setXmlContent] = useState('');
  const [recentImports, setRecentImports] = useState<PayableInvoiceImportSummary[]>([]);
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
      setRecentImports(response.slice(0, 6));
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
    async (certificate: FiscalCertificateItem) => {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;

      setSyncingCertificateId(certificate.id);
      setErrorMessage(null);
      setSuccessMessage(null);
      setImportResult(null);

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
              maxBatches: 5,
            }),
            fallbackMessage:
              'Não foi possível consultar a SEFAZ com este certificado.',
          },
        );

        setSyncResult(response);
        setSuccessMessage(response.message);
        await Promise.all([loadRecentImports(), loadCertificates()]);
      } catch (error) {
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

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={FINANCE_GRID_PAGE_LAYOUT.card}>
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
                Contas a pagar
              </div>
              <h1 className="mt-1 text-2xl font-black text-slate-900">
                Importação de Notas
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Importe notas por XML manual ou consulte a SEFAZ com certificado fiscal A1.
              </p>
            </div>

            <Link
              href={`/contas-a-pagar${navigationQuery}`}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Voltar
            </Link>
          </div>
        </div>

        <div className="grid gap-6 p-6 xl:grid-cols-[1.22fr_0.78fr]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                    Importação automática pela SEFAZ
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-500">
                    Use o certificado fiscal A1 da empresa para buscar DF-e e importar NF-e completas.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCertificateForm(emptyCertificateForm);
                    setIsCertificateModalOpen(true);
                  }}
                  className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
                >
                  Novo certificado
                </button>
              </div>

              {defaultCertificate ? (
                <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                  Certificado padrão atual: <span className="font-black">{defaultCertificate.aliasName}</span>
                </div>
              ) : null}

              <div className="space-y-4">
                {loadingCertificates ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-500">
                    Carregando certificados fiscais...
                  </div>
                ) : certificates.length ? (
                  certificates.map((certificate) => (
                    <div
                      key={certificate.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="text-lg font-black text-slate-900">
                              {certificate.aliasName}
                            </div>
                            {certificate.isDefault ? (
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
                                Padrão
                              </span>
                            ) : null}
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getCertificateStatusClass(certificate)}`}>
                              {certificate.status === 'ACTIVE'
                                ? certificate.expired
                                  ? 'VENCIDO'
                                  : 'ATIVO'
                                : 'INATIVO'}
                            </span>
                          </div>

                          <div className="mt-2 text-sm font-semibold text-slate-600">
                            {certificate.holderName} • {certificate.holderDocument}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <span>{certificate.environment === 'PRODUCTION' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}</span>
                            <span>UF {certificate.authorStateCode}</span>
                            <span>{certificate.purpose}</span>
                            <span>Validade: {formatDateLabel(certificate.validTo || null)}</span>
                          </div>

                          <div className="mt-3 text-xs font-semibold text-slate-500">
                            Última sincronização: {formatDateLabel(certificate.lastSyncAt || null)}{' '}
                            {certificate.lastSyncStatus ? `• status ${certificate.lastSyncStatus}` : ''}
                            {certificate.lastSyncMessage ? ` • ${certificate.lastSyncMessage}` : ''}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setCertificateForm(buildCertificateForm(certificate));
                              setIsCertificateModalOpen(true);
                            }}
                            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
                          >
                            Editar
                          </button>

                          {!certificate.isDefault ? (
                            <button
                              type="button"
                              onClick={() => void handleSetDefaultCertificate(certificate)}
                              className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
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
                            className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
                          >
                            {syncingCertificateId === certificate.id
                              ? 'Consultando...'
                              : 'Importar SEFAZ'}
                          </button>
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

            <form onSubmit={handleImportXml} className="space-y-6">
              <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                      Importação manual por XML
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-500">
                      Você pode colar o XML ou selecionar um arquivo quando precisar importar manualmente.
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
                  className="min-h-[280px] w-full rounded-3xl border border-slate-300 bg-white px-4 py-4 font-mono text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            {syncResult ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                      Resultado da última sincronização SEFAZ
                    </div>
                    <div className="mt-1 text-xl font-black text-slate-900">
                      Status {syncResult.statusCode}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-500">
                      {syncResult.statusMessage}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Notas importadas</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{syncResult.importedNotes}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Duplicadas</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{syncResult.duplicateNotes}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Somente resumo</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{syncResult.summaryOnlyDocuments}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Outros documentos</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{syncResult.otherDocuments}</div>
                  </div>
                </div>
              </section>
            ) : null}

            {importResult ? (
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
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
          </div>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                    Pendentes de aprovação
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-500">
                    Últimas notas aguardando estoque e duplicatas.
                  </div>
                </div>

                <Link
                  href={`/contas-a-pagar/notas-importadas${navigationQuery}`}
                  className="text-sm font-bold uppercase tracking-[0.14em] text-blue-600"
                >
                  Consultar tudo
                </Link>
              </div>

              <div className="mt-4 space-y-3">
                {loadingRecent ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">
                    Carregando notas pendentes...
                  </div>
                ) : recentImports.length ? (
                  recentImports.map((item) => (
                    <Link
                      key={item.id}
                      href={`/contas-a-pagar/notas-importadas/${item.id}${navigationQuery}`}
                      className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-800">
                            NF-e {item.invoiceNumber}
                            {item.series ? ` / ${item.series}` : ''}
                          </div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.supplierName || 'FORNECEDOR'}
                          </div>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getStatusClass(item.status)}`}>
                          {item.statusLabel}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
                        <span>{formatDateLabel(item.issueDate)}</span>
                        <span>{formatCurrency(item.totalInvoiceAmount)}</span>
                        <span>{item.installmentsCount} duplicata(s)</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">
                    Nenhuma nota pendente encontrada para este tenant.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <ScreenNameCopy
                screenId={SCREEN_ID}
                className="justify-end"
                originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/importacao-notas/page.tsx"
                auditText={auditText}
              />
            </section>
          </aside>
        </div>
      </section>

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
