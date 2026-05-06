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
import GridExportModal from '@/app/components/grid-export-modal';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson, requestJson } from '@/app/lib/api';
import {
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
import type { FiscalCertificateItem } from '../payables-types';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS';
const CREATE_MODAL_SCREEN_ID =
  'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS_INCLUIR_CERTIFICADO_A1';
const EDIT_MODAL_SCREEN_ID =
  'PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS_ALTERAR_CERTIFICADO_A1';
const EXPORT_STORAGE_KEY =
  'financeiro:contas-a-pagar:certificados-digitais:export';

const auditText = `--- LOGICA DA TELA ---
Esta tela lista e mantem os certificados digitais do contas a pagar no Financeiro.

TABELAS PRINCIPAIS:
- fiscal_certificates (FC) - certificados A1 cadastrados por empresa.
- companies (CO) - empresa financeira dona do certificado.

RELACIONAMENTOS:
- fiscal_certificates.companyId -> companies.id

METRICAS / CAMPOS EXIBIDOS:
- apelido do certificado
- titular e documento
- ambiente
- finalidade
- validade
- situacao cadastral
- certificado padrao
- ultima sincronizacao

FILTROS APLICADOS:
- company resolvida por sourceSystem + sourceTenantId
- status opcional: ACTIVE | INACTIVE | ALL
- busca opcional por aliasName, holderName, holderDocument e serialNumber

ORDENACAO:
- order by isDefault desc, aliasName asc`;

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

type SaveSuccessState = {
  title: string;
  message: string;
};

type CertificateExportColumnKey =
  | 'aliasName'
  | 'holder'
  | 'environment'
  | 'purpose'
  | 'validTo'
  | 'status'
  | 'default'
  | 'lastSyncAt';

const CERTIFICATE_EXPORT_COLUMNS: GridColumnDefinition<
  FiscalCertificateItem,
  CertificateExportColumnKey
>[] = [
  { key: 'aliasName', label: 'Apelido', getValue: (item) => item.aliasName },
  {
    key: 'holder',
    label: 'Titular',
    getValue: (item) => `${item.holderName} - ${item.holderDocument}`,
  },
  {
    key: 'environment',
    label: 'Ambiente',
    getValue: (item) =>
      item.environment === 'PRODUCTION' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO',
  },
  { key: 'purpose', label: 'Finalidade', getValue: (item) => item.purpose },
  {
    key: 'validTo',
    label: 'Validade',
    getValue: (item) => formatDateLabel(item.validTo || null),
  },
  {
    key: 'status',
    label: 'Situação',
    getValue: (item) =>
      item.status === 'ACTIVE'
        ? item.expired
          ? 'VENCIDO'
          : 'ATIVO'
        : 'INATIVO',
  },
  {
    key: 'default',
    label: 'Padrão',
    getValue: (item) => (item.isDefault ? 'SIM' : 'NÃO'),
  },
  {
    key: 'lastSyncAt',
    label: 'Última sincronização',
    getValue: (item) => formatDateLabel(item.lastSyncAt || null),
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

function getStatusClass(certificate: FiscalCertificateItem) {
  if (certificate.status !== 'ACTIVE') {
    return 'border-slate-200 bg-slate-100 text-slate-600';
  }

  if (certificate.expired) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function getSemaphoreClass(certificate: FiscalCertificateItem) {
  if (certificate.status !== 'ACTIVE') {
    return 'bg-slate-400';
  }

  if (certificate.expired) {
    return 'bg-rose-500';
  }

  return 'bg-emerald-500';
}

function buildCertificateForm(
  certificate: FiscalCertificateItem,
): CertificateFormState {
  return {
    id: certificate.id,
    aliasName: certificate.aliasName,
    authorStateCode: certificate.authorStateCode,
    environment: certificate.environment,
    purpose: certificate.purpose,
    isDefault: certificate.isDefault,
    pfxBase64: '',
    certificatePassword: certificate.certificatePassword || '',
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
  logoUrl,
  companyName,
  showPassword,
  onToggleShowPassword,
  onClose,
  onChange,
  onFileSelected,
  onSubmit,
}: {
  isOpen: boolean;
  formState: CertificateFormState;
  saving: boolean;
  logoUrl?: string | null;
  companyName?: string | null;
  showPassword: boolean;
  onToggleShowPassword: () => void;
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
      <div className={FINANCE_GRID_PAGE_LAYOUT.modalPanel}>
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalHeader}>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white bg-white shadow-md">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`Logo de ${companyName || 'FINANCEIRO'}`}
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="text-base font-black uppercase tracking-[0.22em] text-slate-500">
                  {String(companyName || 'FINANCEIRO').slice(0, 3).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
                Certificados digitais
              </div>
              <h2 className="mt-1 text-2xl font-black text-slate-900">
                {formState.id ? 'Alterar certificado A1' : 'Incluir certificado A1'}
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                O PFX e a senha ficam protegidos no Financeiro e a chave de
                descriptografia permanece no backend.
              </p>
            </div>
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
                    onChange={(event) =>
                      onChange({ aliasName: event.target.value })
                    }
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
                    onChange={(event) =>
                      onChange({ authorStateCode: event.target.value })
                    }
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
                        environment: event.target.value as
                          | 'PRODUCTION'
                          | 'HOMOLOGATION',
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
                      ? 'Envie um novo PFX apenas se quiser substituir o certificado atual.'
                      : 'Envie o arquivo PFX e a senha do certificado digital.'}
                  </div>
                </div>

                <label className="inline-flex cursor-pointer items-center rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100">
                  Selecionar PFX
                  <input
                    type="file"
                    accept=".pfx,application/x-pkcs12"
                    className="hidden"
                    onChange={(event) => void onFileSelected(event)}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  {formState.fileName ||
                    (formState.id
                      ? 'Mantendo certificado já gravado.'
                      : 'Nenhum arquivo selecionado.')}
                </div>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Senha do certificado
                  </span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formState.certificatePassword}
                      onChange={(event) =>
                        onChange({ certificatePassword: event.target.value })
                      }
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm font-semibold tracking-[0.05em] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      required={!formState.id}
                    />
                    <button
                      type="button"
                      onClick={onToggleShowPassword}
                      className="absolute inset-y-0 right-3 flex items-center text-slate-500 transition hover:text-slate-700"
                      aria-label={showPassword ? 'Ocultar senha do certificado' : 'Mostrar senha do certificado'}
                      title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3l18 18" />
                          <path d="M10.58 10.58A2 2 0 0 0 13.42 13.42" />
                          <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a18.27 18.27 0 0 1-4.23 5.42" />
                          <path d="M6.61 6.61C3.61 8.79 2 12 2 12s3 7 10 7a10.9 10.9 0 0 0 5.39-1.44" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
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
                    : 'Ative se este for o padrão da empresa para consulta automática.'}
                </div>
              </button>
            </section>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm">
              <ScreenNameCopy
                screenId={formState.id ? EDIT_MODAL_SCREEN_ID : CREATE_MODAL_SCREEN_ID}
                className="justify-end"
                originText="Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\certificados-digitais\\page.tsx"
                auditText={auditText}
              />
            </div>

            <div className="flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
            >
              {saving ? 'Salvando...' : 'Salvar certificado'}
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FinanceiroCertificadosDigitaisPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const navigationQuery = buildFinanceNavigationQueryString(runtimeContext);
  const [items, setItems] = useState<FiscalCertificateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>(
    'ALL',
  );
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<
    Record<CertificateExportColumnKey, boolean>
  >(buildDefaultExportColumns(CERTIFICATE_EXPORT_COLUMNS));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savingCertificate, setSavingCertificate] = useState(false);
  const [actionCertificateId, setActionCertificateId] = useState<string | null>(null);
  const [showCertificatePassword, setShowCertificatePassword] = useState(false);
  const [saveSuccessState, setSaveSuccessState] = useState<SaveSuccessState | null>(null);
  const [certificateForm, setCertificateForm] = useState<CertificateFormState>(
    emptyCertificateForm,
  );

  const loadCertificates = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setItems([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const queryString = buildFinanceApiQueryString(runtimeContext, {
        status: statusFilter,
      });
      const response = await getJson<FiscalCertificateItem[]>(
        `/fiscal-certificates${queryString}`,
      );

      const normalizedSearch = searchInput.trim().toUpperCase();
      const filtered = normalizedSearch
        ? response.filter((item) =>
            [
              item.aliasName,
              item.holderName,
              item.holderDocument,
              item.serialNumber || '',
            ]
              .join(' ')
              .toUpperCase()
              .includes(normalizedSearch),
          )
        : response;

      setItems(filtered);
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível carregar os certificados digitais.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [runtimeContext, searchInput, statusFilter]);

  useEffect(() => {
    void loadCertificates();
  }, [loadCertificates]);

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

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.isDefault) acc.defaults += 1;
        if (item.status === 'ACTIVE' && !item.expired) acc.active += 1;
        if (item.expired) acc.expired += 1;
        return acc;
      },
      { total: 0, defaults: 0, active: 0, expired: 0 },
    );
  }, [items]);

  const handleFileSelected = useCallback(
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

  const handleOpenCreate = useCallback(() => {
    setCertificateForm(emptyCertificateForm);
    setShowCertificatePassword(false);
    setIsModalOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, []);

  const handleOpenEdit = useCallback((certificate: FiscalCertificateItem) => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setErrorMessage(
        'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
      );
      return;
    }

    setActionCertificateId(certificate.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    void (async () => {
      try {
        const queryString = buildFinanceApiQueryString(runtimeContext);
        const detail = await getJson<FiscalCertificateItem>(
          `/fiscal-certificates/${certificate.id}${queryString}`,
        );
        setCertificateForm(buildCertificateForm(detail));
        setShowCertificatePassword(false);
        setIsModalOpen(true);
      } catch (error) {
        setErrorMessage(
          getFriendlyRequestErrorMessage(
            error,
            'Não foi possível carregar o certificado para alteração.',
          ),
        );
      } finally {
        setActionCertificateId(null);
      }
    })();
  }, [runtimeContext]);

  const handleCloseSaveSuccess = useCallback(() => {
    setSaveSuccessState(null);
    setIsModalOpen(false);
    setShowCertificatePassword(false);
    setCertificateForm(emptyCertificateForm);
  }, []);

  const handleSave = useCallback(
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
            'Não foi possível salvar o certificado digital.',
        });

        setIsModalOpen(false);
        setShowCertificatePassword(false);
        setCertificateForm(emptyCertificateForm);
        setSaveSuccessState({
          title: certificateForm.id
            ? 'Certificado alterado com sucesso'
            : 'Certificado incluído com sucesso',
          message: certificateForm.id
            ? 'As alterações do certificado digital foram gravadas no Financeiro.'
            : 'O novo certificado digital foi gravado no Financeiro.',
        });
        void loadCertificates();
      } catch (error) {
        setErrorMessage(
          getFriendlyRequestErrorMessage(
            error,
            'Não foi possível salvar o certificado digital.',
          ),
        );
      } finally {
        setSavingCertificate(false);
      }
    },
    [certificateForm, loadCertificates, runtimeContext],
  );

  const handleStatusChange = useCallback(
    async (certificate: FiscalCertificateItem, action: 'activate' | 'inactivate') => {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
        setErrorMessage(
          'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
        );
        return;
      }

      setActionCertificateId(certificate.id);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        await requestJson<FiscalCertificateItem>(
          `/fiscal-certificates/${certificate.id}/${action}`,
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
              action === 'activate'
                ? 'Não foi possível ativar o certificado.'
                : 'Não foi possível excluir o certificado.',
          },
        );

        setSuccessMessage(
          action === 'activate'
            ? 'Certificado ativado com sucesso.'
            : 'Certificado excluído com sucesso.',
        );
        void loadCertificates();
      } catch (error) {
        setErrorMessage(
          getFriendlyRequestErrorMessage(
            error,
            action === 'activate'
              ? 'Não foi possível ativar o certificado.'
              : 'Não foi possível excluir o certificado.',
          ),
        );
      } finally {
        setActionCertificateId(null);
      }
    },
    [loadCertificates, runtimeContext],
  );

  const handleSetDefault = useCallback(
    async (certificate: FiscalCertificateItem) => {
      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
        setErrorMessage(
          'Abra esta tela a partir do sistema de origem para informar o tenant do Financeiro.',
        );
        return;
      }

      setActionCertificateId(certificate.id);
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
      } finally {
        setActionCertificateId(null);
      }
    },
    [loadCertificates, runtimeContext],
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
                Certificados Digitais
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Cadastre e mantenha os certificados A1 usados na integração fiscal do
                Financeiro.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleOpenCreate}
                className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
              >
                Incluir
              </button>
              <Link
                href={`/contas-a-pagar${navigationQuery}`}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Voltar
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Certificados</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{summary.total}</div>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Ativos</div>
              <div className="mt-1 text-2xl font-black text-emerald-800">{summary.active}</div>
            </div>
            <div className="rounded-3xl border border-blue-200 bg-blue-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Padrão</div>
              <div className="mt-1 text-2xl font-black text-blue-800">{summary.defaults}</div>
            </div>
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-600">Vencidos</div>
              <div className="mt-1 text-2xl font-black text-rose-800">{summary.expired}</div>
            </div>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <form className="grid gap-4 xl:grid-cols-[1fr_auto_auto]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  Buscar certificado
                </span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="APELIDO, TITULAR, DOCUMENTO..."
                  className={FINANCE_GRID_PAGE_LAYOUT.input}
                />
              </label>

              <button
                type="button"
                onClick={() => void loadCertificates()}
                className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
              >
                Aplicar
              </button>

              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Exportar
              </button>
            </form>
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

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Semáforo</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Apelido</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Titular</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Ambiente</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Validade</th>
                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Padrão</th>
                    <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Carregando certificados digitais...
                      </td>
                    </tr>
                  ) : items.length ? (
                    items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex h-3.5 w-3.5 rounded-full ${getSemaphoreClass(item)}`} />
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getStatusClass(item)}`}>
                              {item.status === 'ACTIVE'
                                ? item.expired
                                  ? 'VENCIDO'
                                  : 'ATIVO'
                                : 'INATIVO'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div className="font-black text-slate-900">{item.aliasName}</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.purpose}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div>{item.holderName}</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.holderDocument}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div>{item.environment === 'PRODUCTION' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            UF {item.authorStateCode}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div>{formatDateLabel(item.validTo || null)}</div>
                          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {item.lastSyncAt
                              ? `ÚLT. SINCRONIZAÇÃO ${formatDateLabel(item.lastSyncAt)}`
                              : 'SEM SINCRONIZAÇÃO'}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          {item.isDefault ? 'SIM' : 'NÃO'}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              disabled={actionCertificateId === item.id}
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-50"
                            >
                              Alterar
                            </button>
                            {!item.isDefault ? (
                              <button
                                type="button"
                                onClick={() => void handleSetDefault(item)}
                                disabled={actionCertificateId === item.id}
                                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                              >
                                Padrão
                              </button>
                            ) : null}
                            {item.status === 'ACTIVE' ? (
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(item, 'inactivate')}
                                disabled={actionCertificateId === item.id}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                              >
                                Excluir
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(item, 'activate')}
                                disabled={actionCertificateId === item.id}
                                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                              >
                                Ativar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Nenhum certificado digital encontrado com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(true)}
                    aria-label="Exportar"
                    title="Exportar"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-600"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9V4h12v5" />
                      <path d="M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1" />
                      <path d="M6 14h12v6H6z" />
                      <path d="M17 12h.01" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center justify-center gap-2">
                  {[
                    {
                      value: 'ACTIVE',
                      label: 'Ativos',
                      tone: 'bg-emerald-500',
                      activeTone: 'bg-emerald-700',
                      dot: 'bg-white',
                    },
                    {
                      value: 'ALL',
                      label: 'Ambos',
                      tone: 'bg-amber-200',
                      activeTone: 'bg-amber-400',
                      dot: 'bg-white',
                    },
                    {
                      value: 'INACTIVE',
                      label: 'Inativos',
                      tone: 'bg-rose-200',
                      activeTone: 'bg-rose-400',
                      dot: 'bg-white',
                    },
                  ].map((item) => {
                    const isActive = statusFilter === item.value;

                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          setStatusFilter(item.value as 'ALL' | 'ACTIVE' | 'INACTIVE')
                        }
                        aria-label={item.label}
                        title={item.label}
                        aria-pressed={isActive}
                        className={`relative h-6 w-14 rounded-full border transition duration-200 ${
                          isActive
                            ? `${item.activeTone} border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35),0_8px_24px_rgba(15,23,42,0.22)] ring-4 ring-slate-400 ring-offset-2 ring-offset-slate-100 scale-105`
                            : `${item.tone} border-transparent opacity-55 hover:opacity-85`
                        }`}
                      >
                        <span
                          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm ${item.dot} ${
                            isActive ? 'right-1' : 'left-1'
                          }`}
                        />
                        <span className="sr-only">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right text-sm font-black uppercase tracking-[0.14em] text-slate-700">
                    Registros exibidos ({items.length})
                  </div>

                  {!runtimeContext.embedded ? (
                    <ScreenNameCopy
                      screenId={SCREEN_ID}
                      className="justify-end"
                      originText="Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\certificados-digitais\\page.tsx"
                      auditText={auditText}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <GridExportModal
        isOpen={isExportModalOpen}
        title="Exportar certificados digitais"
        description={`A exportação considera ${items.length} registro(s) do filtro atual.`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={CERTIFICATE_EXPORT_COLUMNS.map((column) => ({
          key: column.key,
          label: column.label,
        }))}
        selectedColumns={exportColumns}
        storageKey={EXPORT_STORAGE_KEY}
        brandingName={runtimeContext.companyName || 'FINANCEIRO'}
        brandingLogoUrl={runtimeContext.logoUrl}
        onClose={() => setIsExportModalOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: items,
            columns: CERTIFICATE_EXPORT_COLUMNS,
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            fileBaseName: 'certificados-digitais',
            branding: {
              title: 'Certificados digitais',
              subtitle: 'Exportação da listagem atual de certificados.',
              schoolName: runtimeContext.companyName || 'FINANCEIRO',
              logoUrl: runtimeContext.logoUrl,
            },
            pdfOptions: config.pdfOptions,
          });
          setExportColumns(config.selectedColumns);
          setIsExportModalOpen(false);
        }}
      />

      <CertificateModal
        isOpen={isModalOpen}
        formState={certificateForm}
        saving={savingCertificate}
        logoUrl={runtimeContext.logoUrl}
        companyName={runtimeContext.companyName}
        showPassword={showCertificatePassword}
        onToggleShowPassword={() =>
          setShowCertificatePassword((current) => !current)
        }
        onClose={() => {
          setIsModalOpen(false);
          setShowCertificatePassword(false);
          setCertificateForm(emptyCertificateForm);
        }}
        onChange={(patch) =>
          setCertificateForm((current) => ({
            ...current,
            ...patch,
          }))
        }
        onFileSelected={handleFileSelected}
        onSubmit={handleSave}
      />

      {saveSuccessState ? (
        <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
          <div className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-cyan-50 to-blue-50 px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white bg-white shadow-md">
                  {runtimeContext.logoUrl ? (
                    <img
                      src={runtimeContext.logoUrl}
                      alt={`Logo de ${runtimeContext.companyName || 'FINANCEIRO'}`}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-base font-black uppercase tracking-[0.22em] text-emerald-700">
                      {String(runtimeContext.companyName || 'FINANCEIRO').slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">
                    Certificados digitais
                  </div>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">
                    {saveSuccessState.title}
                  </h2>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    {saveSuccessState.message}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm">
                <ScreenNameCopy
                  screenId="PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR_CERTIFICADOS_DIGITAIS_SUCESSO_SALVAR"
                  className="justify-end"
                  originText="Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\certificados-digitais\\page.tsx"
                  auditText={auditText}
                />
              </div>

              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleCloseSaveSuccess}
                  className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
