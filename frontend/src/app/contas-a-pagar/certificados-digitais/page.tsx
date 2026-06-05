'use client';
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
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
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import type { FiscalCertificateItem } from '../payables-types';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

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

FILTROS APLICADOS AGORA:
- company resolvida por sourceSystem + sourceTenantId
- status opcional: ACTIVE | INACTIVE | ALL
- busca opcional por aliasName, holderName, holderDocument e serialNumber

ORDENACAO:
- order by isDefault desc, aliasName asc`;

type CertificadosAuditParams = {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  status: CertificateStatusFilter;
  search: string;
  displayedRowsCount: number;
};

function buildCertificadosAuditSql(params: CertificadosAuditParams) {
  const search = params.search.trim().toUpperCase();
  const status = String(params.status || 'ALL').toUpperCase();

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :status = ${toSqlLiteral(status)}
-- :search = ${toSqlLiteral(search)}

SELECT FC.*
FROM fiscal_certificates FC
INNER JOIN companies CO ON CO.id = FC.companyId
WHERE CO.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND (${toSqlLiteral(status)} = 'ALL' OR FC.status = ${toSqlLiteral(status)})
  AND (
    ${toSqlLiteral(search)} = ''
    OR UPPER(COALESCE(FC.aliasName, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(FC.holderName, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(FC.holderDocument, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(FC.serialNumber, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
  )
ORDER BY FC.isDefault DESC, FC.aliasName ASC;`;
}

function buildCertificadosAuditText(params: CertificadosAuditParams) {
  const search = params.search.trim().toUpperCase();
  const status = String(params.status || 'ALL').toUpperCase();

  return `--- LOGICA DA TELA ---
Esta tela lista e mantem os certificados digitais do contas a pagar no Financeiro.

TABELAS PRINCIPAIS:
- fiscal_certificates (FC) - certificados A1 cadastrados por empresa
- companies (CO) - empresa financeira dona do certificado

RELACIONAMENTOS:
- fiscal_certificates.companyId = companies.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- status selecionado (:status): ${status}
- busca digitada (:search): ${formatAuditValue(search)}
- registros exibidos apos os filtros: ${params.displayedRowsCount}
- ordenacao atual: certificado padrao DESC, apelido ASC

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- CO.sourceSystem e CO.sourceTenantId isolam os dados da empresa/sistema de origem
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

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

type CertificateGridColumnKey =
  | 'aliasName'
  | 'holder'
  | 'environment'
  | 'validTo'
  | 'default';

type CertificateFilterColumn = 'status' | CertificateGridColumnKey;
type CertificateSortDirection = 'asc' | 'desc';
type CertificateStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
type CertificateDefaultFilter = 'ALL' | 'YES' | 'NO';
type CertificateSortState = {
  column: CertificateFilterColumn;
  direction: CertificateSortDirection;
} | null;

type CertificateFilters = {
  status: CertificateStatusFilter;
  aliasName: string;
  holder: string;
  environment: string;
  validToFrom: string;
  validToTo: string;
  default: CertificateDefaultFilter;
};

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

const CERTIFICATE_GRID_COLUMNS: Array<{
  key: CertificateGridColumnKey;
  label: string;
}> = [
  { key: 'aliasName', label: 'Apelido' },
  { key: 'holder', label: 'Titular' },
  { key: 'environment', label: 'Ambiente' },
  { key: 'validTo', label: 'Validade' },
  { key: 'default', label: 'Padrão' },
];

const EMPTY_CERTIFICATE_FILTERS: CertificateFilters = {
  status: 'ALL',
  aliasName: '',
  holder: '',
  environment: '',
  validToFrom: '',
  validToTo: '',
  default: 'ALL',
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

function buildDateOnlyInputValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, 10);
}

function normalizeCertificateFilterValue(value?: string | number | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizeCertificateDigits(value?: string | number | null) {
  return String(value ?? '').replace(/\D/g, '');
}

function matchesCertificateTextFilter(
  values: Array<string | number | null | undefined>,
  filterValue: string,
) {
  const normalizedFilter = normalizeCertificateFilterValue(filterValue);
  const filterDigits = normalizeCertificateDigits(filterValue);

  if (!normalizedFilter) {
    return true;
  }

  return values.some((value) => {
    const normalizedValue = normalizeCertificateFilterValue(value);

    if (normalizedValue.includes(normalizedFilter)) {
      return true;
    }

    return Boolean(
      filterDigits &&
        normalizeCertificateDigits(value).includes(filterDigits),
    );
  });
}

function getCertificateStatusFilterValue(
  certificate: FiscalCertificateItem,
): Exclude<CertificateStatusFilter, 'ALL'> {
  if (certificate.status !== 'ACTIVE') {
    return 'INACTIVE';
  }

  return certificate.expired ? 'EXPIRED' : 'ACTIVE';
}

function getCertificateStatusLabel(certificate: FiscalCertificateItem) {
  const status = getCertificateStatusFilterValue(certificate);

  if (status === 'INACTIVE') {
    return 'INATIVO';
  }

  return status === 'EXPIRED' ? 'VENCIDO' : 'ATIVO';
}

function getCertificateEnvironmentLabel(certificate: FiscalCertificateItem) {
  return certificate.environment === 'PRODUCTION' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO';
}

function getCertificateSortValue(
  certificate: FiscalCertificateItem,
  column: CertificateFilterColumn,
) {
  if (column === 'status') {
    return getCertificateStatusLabel(certificate);
  }

  if (column === 'aliasName') {
    return `${certificate.aliasName || ''} ${certificate.purpose || ''}`;
  }

  if (column === 'holder') {
    return `${certificate.holderName || ''} ${certificate.holderDocument || ''}`;
  }

  if (column === 'environment') {
    return `${getCertificateEnvironmentLabel(certificate)} ${
      certificate.authorStateCode || ''
    }`;
  }

  if (column === 'validTo') {
    return buildDateOnlyInputValue(certificate.validTo);
  }

  return certificate.isDefault ? 1 : 0;
}

function compareCertificateSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  });
}

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
  return certificate.status === 'ACTIVE' && !certificate.expired
    ? 'bg-emerald-500'
    : 'bg-rose-500';
}

function getCertificateIndicatorLabel(certificate: FiscalCertificateItem) {
  return certificate.status === 'ACTIVE' && !certificate.expired
    ? 'ATIVO'
    : 'INATIVO';
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

function CertificateGridConfigModal({
  isOpen,
  hidden,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  hidden: CertificateGridColumnKey[];
  onSave: (hidden: CertificateGridColumnKey[]) => void;
  onClose: () => void;
}) {
  const [draftHidden, setDraftHidden] =
    useState<CertificateGridColumnKey[]>(hidden);

  useEffect(() => {
    if (isOpen) {
      setDraftHidden(hidden);
    }
  }, [hidden, isOpen]);

  if (!isOpen) {
    return null;
  }

  const visibleCount = CERTIFICATE_GRID_COLUMNS.length - draftHidden.length + 2;

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
              Selecione as colunas informativas da lista de certificados.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            X
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
                  Situação e ações permanecem fixas neste grid.
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
              {CERTIFICATE_GRID_COLUMNS.map((column) => {
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
                      {visible ? '✓' : 'X'}
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

export default function FinanceiroCertificadosDigitaisPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [items, setItems] = useState<FiscalCertificateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<CertificateStatusFilter>('ALL');
  const [certificateFilters, setCertificateFilters] =
    useState<CertificateFilters>(EMPTY_CERTIFICATE_FILTERS);
  const [certificateFilterDrafts, setCertificateFilterDrafts] =
    useState<CertificateFilters>(EMPTY_CERTIFICATE_FILTERS);
  const [certificateSort, setCertificateSort] =
    useState<CertificateSortState>(null);
  const [certificateActiveFilter, setCertificateActiveFilter] =
    useState<CertificateFilterColumn | null>(null);
  const [certificatePageSize, setCertificatePageSize] = useState(10);
  const [certificatePage, setCertificatePage] = useState(1);
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<
    CertificateGridColumnKey[]
  >([]);
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
        status: 'ALL',
      });
      const response = await getJson<FiscalCertificateItem[]>(
        `/fiscal-certificates${queryString}`,
      );

      setItems(response);
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
  }, [runtimeContext]);

  useEffect(() => {
    void loadCertificates();
  }, [loadCertificates]);

  const visibleCertificateGridColumns = useMemo(
    () =>
      CERTIFICATE_GRID_COLUMNS.filter(
        (column) => !hiddenColumns.includes(column.key),
      ),
    [hiddenColumns],
  );

  const isCertificateGridColumnVisible = useCallback(
    (column: CertificateGridColumnKey) =>
      visibleCertificateGridColumns.some((item) => item.key === column),
    [visibleCertificateGridColumns],
  );

  const certificateGridColSpan = visibleCertificateGridColumns.length + 2;

  const filteredCertificates = useMemo(() => {
    const filtered = items.filter((item) => {
      const status = getCertificateStatusFilterValue(item);
      const validTo = buildDateOnlyInputValue(item.validTo);

      if (statusFilter !== 'ALL' && status !== statusFilter) {
        return false;
      }

      if (
        certificateFilters.validToFrom &&
        (!validTo || validTo < certificateFilters.validToFrom)
      ) {
        return false;
      }

      if (
        certificateFilters.validToTo &&
        (!validTo || validTo > certificateFilters.validToTo)
      ) {
        return false;
      }

      if (
        certificateFilters.default !== 'ALL' &&
        (certificateFilters.default === 'YES') !== item.isDefault
      ) {
        return false;
      }

      if (
        !matchesCertificateTextFilter(
          [item.aliasName, item.purpose, item.serialNumber || ''],
          certificateFilters.aliasName,
        )
      ) {
        return false;
      }

      if (
        !matchesCertificateTextFilter(
          [item.holderName, item.holderDocument],
          certificateFilters.holder,
        )
      ) {
        return false;
      }

      return matchesCertificateTextFilter(
        [getCertificateEnvironmentLabel(item), item.authorStateCode],
        certificateFilters.environment,
      );
    });

    if (!certificateSort) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const result = compareCertificateSortValues(
        getCertificateSortValue(left, certificateSort.column),
        getCertificateSortValue(right, certificateSort.column),
      );

      return certificateSort.direction === 'asc' ? result : result * -1;
    });
  }, [certificateFilters, certificateSort, items, statusFilter]);

  const certificateTotalPages = Math.max(
    1,
    Math.ceil(filteredCertificates.length / certificatePageSize),
  );
  const currentCertificatePage = Math.min(
    certificatePage,
    certificateTotalPages,
  );
  const paginatedCertificates = useMemo(() => {
    const startIndex = (currentCertificatePage - 1) * certificatePageSize;
    return filteredCertificates.slice(
      startIndex,
      startIndex + certificatePageSize,
    );
  }, [certificatePageSize, currentCertificatePage, filteredCertificates]);

  const certificateFilterSummary = useMemo(() => {
    const activeFilters = [];

    if (statusFilter !== 'ALL') {
      activeFilters.push(`status=${statusFilter}`);
    }

    if (certificateFilters.aliasName.trim()) {
      activeFilters.push(`apelido=${certificateFilters.aliasName.trim()}`);
    }

    if (certificateFilters.holder.trim()) {
      activeFilters.push(`titular=${certificateFilters.holder.trim()}`);
    }

    if (certificateFilters.environment.trim()) {
      activeFilters.push(`ambiente=${certificateFilters.environment.trim()}`);
    }

    if (certificateFilters.validToFrom || certificateFilters.validToTo) {
      activeFilters.push(
        `validade=${certificateFilters.validToFrom || '*'}..${
          certificateFilters.validToTo || '*'
        }`,
      );
    }

    if (certificateFilters.default !== 'ALL') {
      activeFilters.push(`padrao=${certificateFilters.default}`);
    }

    return activeFilters.join('; ');
  }, [certificateFilters, statusFilter]);

  const certificadosAuditContext = useMemo(() => {
    const auditParams: CertificadosAuditParams = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      status: statusFilter,
      search: certificateFilterSummary,
      displayedRowsCount: filteredCertificates.length,
    };

    return {
      auditText: buildCertificadosAuditText(auditParams),
      sqlText: buildCertificadosAuditSql(auditParams),
    };
  }, [
    certificateFilterSummary,
    filteredCertificates.length,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    statusFilter,
  ]);

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

  useEffect(() => {
    setCertificatePage(1);
  }, [certificateFilters, certificatePageSize, certificateSort, statusFilter]);

  useEffect(() => {
    setCertificatePage((current) =>
      Math.min(Math.max(current, 1), certificateTotalPages),
    );
  }, [certificateTotalPages]);

  const hasCertificateFilters = useMemo(
    () =>
      statusFilter !== 'ALL' ||
      certificateFilters.aliasName !== EMPTY_CERTIFICATE_FILTERS.aliasName ||
      certificateFilters.holder !== EMPTY_CERTIFICATE_FILTERS.holder ||
      certificateFilters.environment !==
        EMPTY_CERTIFICATE_FILTERS.environment ||
      certificateFilters.validToFrom !==
        EMPTY_CERTIFICATE_FILTERS.validToFrom ||
      certificateFilters.validToTo !== EMPTY_CERTIFICATE_FILTERS.validToTo ||
      certificateFilters.default !== EMPTY_CERTIFICATE_FILTERS.default ||
      Boolean(certificateSort),
    [certificateFilters, certificateSort, statusFilter],
  );

  const updateCertificateFilterDrafts = useCallback(
    (patch: Partial<CertificateFilters>) => {
      setCertificateFilterDrafts((current) => ({
        ...current,
        ...patch,
      }));
    },
    [],
  );

  const updateCertificateFilters = useCallback(
    (patch: Partial<CertificateFilters>) => {
      setCertificateFilters((current) => ({
        ...current,
        ...patch,
      }));
    },
    [],
  );

  const setCertificateStatusFilter = useCallback(
    (value: CertificateStatusFilter) => {
      setStatusFilter(value);
      updateCertificateFilters({ status: value });
      updateCertificateFilterDrafts({ status: value });
    },
    [updateCertificateFilterDrafts, updateCertificateFilters],
  );

  const clearCertificateFilters = useCallback(() => {
    setStatusFilter('ALL');
    setCertificateFilters(EMPTY_CERTIFICATE_FILTERS);
    setCertificateFilterDrafts(EMPTY_CERTIFICATE_FILTERS);
    setCertificateSort(null);
    setCertificateActiveFilter(null);
  }, []);

  const openCertificateFilter = useCallback(
    (column: CertificateFilterColumn | null) => {
      if (column) {
        setCertificateFilterDrafts({
          ...certificateFilters,
          status: statusFilter,
        });
      }

      setCertificateActiveFilter(column);
    },
    [certificateFilters, statusFilter],
  );

  const applyCertificateSort = useCallback(
    (column: CertificateFilterColumn, direction: CertificateSortDirection) => {
      setCertificateSort({ column, direction });
      setCertificateActiveFilter(null);
    },
    [],
  );

  const applyCertificateColumnFilter = useCallback(
    (column: CertificateFilterColumn) => {
      if (column === 'status') {
        setCertificateStatusFilter(certificateFilterDrafts.status);
      } else if (column === 'aliasName') {
        updateCertificateFilters({
          aliasName: certificateFilterDrafts.aliasName.trim(),
        });
      } else if (column === 'holder') {
        updateCertificateFilters({
          holder: certificateFilterDrafts.holder.trim(),
        });
      } else if (column === 'environment') {
        updateCertificateFilters({
          environment: certificateFilterDrafts.environment.trim(),
        });
      } else if (column === 'validTo') {
        updateCertificateFilters({
          validToFrom: certificateFilterDrafts.validToFrom,
          validToTo: certificateFilterDrafts.validToTo,
        });
      } else {
        updateCertificateFilters({
          default: certificateFilterDrafts.default,
        });
      }

      setCertificateActiveFilter(null);
    },
    [
      certificateFilterDrafts,
      setCertificateStatusFilter,
      updateCertificateFilters,
    ],
  );

  const clearCertificateColumnFilter = useCallback(
    (column: CertificateFilterColumn) => {
      if (column === 'status') {
        setCertificateStatusFilter('ALL');
      } else if (column === 'aliasName') {
        updateCertificateFilters({
          aliasName: EMPTY_CERTIFICATE_FILTERS.aliasName,
        });
        updateCertificateFilterDrafts({
          aliasName: EMPTY_CERTIFICATE_FILTERS.aliasName,
        });
      } else if (column === 'holder') {
        updateCertificateFilters({ holder: EMPTY_CERTIFICATE_FILTERS.holder });
        updateCertificateFilterDrafts({
          holder: EMPTY_CERTIFICATE_FILTERS.holder,
        });
      } else if (column === 'environment') {
        updateCertificateFilters({
          environment: EMPTY_CERTIFICATE_FILTERS.environment,
        });
        updateCertificateFilterDrafts({
          environment: EMPTY_CERTIFICATE_FILTERS.environment,
        });
      } else if (column === 'validTo') {
        updateCertificateFilters({
          validToFrom: EMPTY_CERTIFICATE_FILTERS.validToFrom,
          validToTo: EMPTY_CERTIFICATE_FILTERS.validToTo,
        });
        updateCertificateFilterDrafts({
          validToFrom: EMPTY_CERTIFICATE_FILTERS.validToFrom,
          validToTo: EMPTY_CERTIFICATE_FILTERS.validToTo,
        });
      } else {
        updateCertificateFilters({
          default: EMPTY_CERTIFICATE_FILTERS.default,
        });
        updateCertificateFilterDrafts({
          default: EMPTY_CERTIFICATE_FILTERS.default,
        });
      }

      setCertificateSort((current) =>
        current?.column === column ? null : current,
      );
      setCertificateActiveFilter(null);
    },
    [
      setCertificateStatusFilter,
      updateCertificateFilterDrafts,
      updateCertificateFilters,
    ],
  );

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

  const certificateFilterInputClass = `${FINANCE_GRID_PAGE_LAYOUT.input} h-9 rounded-xl px-3 py-2 text-xs`;

  const isCertificateColumnFilterActive = (
    column: CertificateFilterColumn,
  ) => {
    if (column === 'status') {
      return statusFilter !== 'ALL';
    }

    if (column === 'aliasName') {
      return certificateFilters.aliasName !== EMPTY_CERTIFICATE_FILTERS.aliasName;
    }

    if (column === 'holder') {
      return certificateFilters.holder !== EMPTY_CERTIFICATE_FILTERS.holder;
    }

    if (column === 'environment') {
      return (
        certificateFilters.environment !==
        EMPTY_CERTIFICATE_FILTERS.environment
      );
    }

    if (column === 'validTo') {
      return (
        certificateFilters.validToFrom !==
          EMPTY_CERTIFICATE_FILTERS.validToFrom ||
        certificateFilters.validToTo !== EMPTY_CERTIFICATE_FILTERS.validToTo
      );
    }

    return certificateFilters.default !== EMPTY_CERTIFICATE_FILTERS.default;
  };

  const buildCertificateSortButtonClass = (
    column: CertificateFilterColumn,
    direction: CertificateSortDirection,
  ) =>
    `inline-flex h-8 w-full items-center justify-center rounded-xl border px-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${
      certificateSort?.column === column && certificateSort.direction === direction
        ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }`;

  const buildCertificateFilterPillClass = (
    active: boolean,
    tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate',
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
        : tone === 'rose'
        ? active
          ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-sm'
          : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
        : tone === 'slate'
        ? active
          ? 'border-slate-300 bg-slate-100 text-slate-700 shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
        : active
        ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
        : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50';

    return `inline-flex h-8 w-full items-center justify-center rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.16em] transition ${toneClass}`;
  };

  const renderCertificateSortControls = (
    column: CertificateFilterColumn,
  ) => (
    <div className="space-y-2">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        Ordenar
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => applyCertificateSort(column, 'asc')}
          className={buildCertificateSortButtonClass(column, 'asc')}
        >
          Crescente
        </button>
        <button
          type="button"
          onClick={() => applyCertificateSort(column, 'desc')}
          className={buildCertificateSortButtonClass(column, 'desc')}
        >
          Decrescente
        </button>
      </div>
    </div>
  );

  const renderCertificateClearColumnButton = (
    column: CertificateFilterColumn,
  ) => (
    <button
      type="button"
      onClick={() => clearCertificateColumnFilter(column)}
      className="inline-flex h-8 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-white"
    >
      Limpar
    </button>
  );

  const renderCertificateClearAllButton = () => (
    <button
      type="button"
      onClick={clearCertificateFilters}
      title="Limpar todos os filtros"
      aria-label="Limpar todos os filtros do grid"
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
        hasCertificateFilters
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

  const renderCertificateTextFilter = (
    column: Extract<
      CertificateFilterColumn,
      'aliasName' | 'holder' | 'environment'
    >,
    placeholder: string,
  ) => (
    <div className="space-y-3">
      {renderCertificateSortControls(column)}
      <div className="space-y-1.5">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Filtrar
        </div>
        <input
          value={certificateFilterDrafts[column]}
          onChange={(event) =>
            updateCertificateFilterDrafts({ [column]: event.target.value })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              applyCertificateColumnFilter(column);
            }
          }}
          placeholder={placeholder}
          className={certificateFilterInputClass}
        />
      </div>
      <button
        type="button"
        onClick={() => applyCertificateColumnFilter(column)}
        className="inline-flex h-8 w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
      >
        Filtrar
      </button>
      {renderCertificateClearColumnButton(column)}
    </div>
  );

  const renderCertificateDateFilter = () => (
    <div className="space-y-3">
      {renderCertificateSortControls('validTo')}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            De
          </span>
          <input
            type="date"
            value={certificateFilterDrafts.validToFrom}
            onChange={(event) =>
              updateCertificateFilterDrafts({
                validToFrom: event.target.value,
              })
            }
            className={certificateFilterInputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Até
          </span>
          <input
            type="date"
            value={certificateFilterDrafts.validToTo}
            onChange={(event) =>
              updateCertificateFilterDrafts({
                validToTo: event.target.value,
              })
            }
            className={certificateFilterInputClass}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => applyCertificateColumnFilter('validTo')}
        className="inline-flex h-8 w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
      >
        Filtrar
      </button>
      {renderCertificateClearColumnButton('validTo')}
    </div>
  );

  const renderCertificateStatusFilter = () => (
    <div className="space-y-3">
      {renderCertificateSortControls('status')}
      <div className="space-y-2">
        <div className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Filtrar status
        </div>
        <div className="grid gap-2">
          {[
            { value: 'ALL', label: 'Ambos', tone: 'blue' },
            { value: 'ACTIVE', label: 'Ativos', tone: 'emerald' },
            { value: 'EXPIRED', label: 'Vencidos', tone: 'rose' },
            { value: 'INACTIVE', label: 'Inativos', tone: 'slate' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                const value = option.value as CertificateStatusFilter;
                setCertificateStatusFilter(value);
                setCertificateActiveFilter(null);
              }}
              className={buildCertificateFilterPillClass(
                statusFilter === option.value,
                option.tone as 'blue' | 'emerald' | 'rose' | 'slate',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {renderCertificateClearColumnButton('status')}
    </div>
  );

  const renderCertificateDefaultFilter = () => (
    <div className="space-y-3">
      {renderCertificateSortControls('default')}
      <div className="space-y-2">
        <div className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Filtrar padrão
        </div>
        <div className="grid gap-2">
          {[
            { value: 'ALL', label: 'Ambos', tone: 'blue' },
            { value: 'YES', label: 'Sim', tone: 'emerald' },
            { value: 'NO', label: 'Não', tone: 'rose' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                updateCertificateFilters({
                  default: option.value as CertificateDefaultFilter,
                });
                updateCertificateFilterDrafts({
                  default: option.value as CertificateDefaultFilter,
                });
                setCertificateActiveFilter(null);
              }}
              className={buildCertificateFilterPillClass(
                certificateFilters.default === option.value,
                option.tone as 'blue' | 'emerald' | 'rose',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {renderCertificateClearColumnButton('default')}
    </div>
  );

  const renderCertificateHeader = (
    column: CertificateFilterColumn,
    label: string,
    filterContent: ReactNode,
    align: 'left' | 'right' = 'left',
  ) => {
    const isOpen = certificateActiveFilter === column;
    const isActive =
      isCertificateColumnFilterActive(column) ||
      certificateSort?.column === column;

    return (
      <div
        className={`relative flex items-center gap-2 ${
          align === 'right' ? 'justify-end' : ''
        }`}
      >
        <span>{label}</span>
        <button
          type="button"
          onClick={() => openCertificateFilter(isOpen ? null : column)}
          aria-label={`Filtrar ${label}`}
          title={`Filtrar ${label}`}
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
            isActive || isOpen
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-400 hover:border-blue-200 hover:text-blue-600'
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
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        {isOpen ? (
          <div
            className={`absolute top-full z-40 mt-2 w-[276px] rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xl ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {filterContent}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={FINANCE_GRID_PAGE_LAYOUT.card}>
        <div className="flex h-[calc(100vh-1.5rem)] min-h-[620px] min-w-0 flex-col gap-3 overflow-hidden p-4">
          <div className="grid shrink-0 justify-center gap-3 md:grid-cols-4">
            <div className="w-full max-w-[220px] rounded-3xl border border-slate-200 bg-slate-50 px-5 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Certificados</div>
              <div className="mt-1 text-2xl font-black text-slate-900">{summary.total}</div>
            </div>
            <div className="w-full max-w-[220px] rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Ativos</div>
              <div className="mt-1 text-2xl font-black text-emerald-800">{summary.active}</div>
            </div>
            <div className="w-full max-w-[220px] rounded-3xl border border-blue-200 bg-blue-50 px-5 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Padrão</div>
              <div className="mt-1 text-2xl font-black text-blue-800">{summary.defaults}</div>
            </div>
            <div className="w-full max-w-[220px] rounded-3xl border border-rose-200 bg-rose-50 px-5 py-3">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-600">Vencidos</div>
              <div className="mt-1 text-2xl font-black text-rose-800">{summary.expired}</div>
            </div>
          </div>

          {errorMessage ? (
            <div className="shrink-0 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="shrink-0 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  aria-label="INCLUIR NOVO CERTIFICADO"
                  title="INCLUIR NOVO CERTIFICADO"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-600">
                  Certificados digitais
                </div>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">
                  {filteredCertificates.length} certificado{filteredCertificates.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {!runtimeContext.embedded ? (
                  <ScreenNameCopy
                    screenId={SCREEN_ID}
                    className="justify-end"
                    originText="Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\contas-a-pagar\\certificados-digitais\\page.tsx"
                    auditText={certificadosAuditContext.auditText || auditText}
                    sqlText={certificadosAuditContext.sqlText}
                  />
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1180px] table-fixed divide-y divide-slate-200">
                <colgroup>
                  <col className="w-[46px]" />
                  {isCertificateGridColumnVisible('aliasName') ? (
                    <col className="w-[260px]" />
                  ) : null}
                  {isCertificateGridColumnVisible('holder') ? (
                    <col />
                  ) : null}
                  {isCertificateGridColumnVisible('environment') ? (
                    <col className="w-[170px]" />
                  ) : null}
                  {isCertificateGridColumnVisible('validTo') ? (
                    <col className="w-[220px]" />
                  ) : null}
                  {isCertificateGridColumnVisible('default') ? (
                    <col className="w-[110px]" />
                  ) : null}
                  <col className="w-[260px]" />
                </colgroup>
                <thead className="bg-slate-50">
                  <tr>
                    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                      <div className="flex items-center">
                        {renderCertificateClearAllButton()}
                      </div>
                    </th>
                    {isCertificateGridColumnVisible('aliasName') ? (
                      <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {renderCertificateHeader(
                          'aliasName',
                          'Apelido',
                          renderCertificateTextFilter(
                            'aliasName',
                            'APELIDO, FINALIDADE OU SÉRIE...',
                          ),
                        )}
                      </th>
                    ) : null}
                    {isCertificateGridColumnVisible('holder') ? (
                      <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {renderCertificateHeader(
                          'holder',
                          'Titular',
                          renderCertificateTextFilter(
                            'holder',
                            'TITULAR OU DOCUMENTO...',
                          ),
                        )}
                      </th>
                    ) : null}
                    {isCertificateGridColumnVisible('environment') ? (
                      <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {renderCertificateHeader(
                          'environment',
                          'Ambiente',
                          renderCertificateTextFilter(
                            'environment',
                            'AMBIENTE OU UF...',
                          ),
                        )}
                      </th>
                    ) : null}
                    {isCertificateGridColumnVisible('validTo') ? (
                      <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {renderCertificateHeader(
                          'validTo',
                          'Validade',
                          renderCertificateDateFilter(),
                        )}
                      </th>
                    ) : null}
                    {isCertificateGridColumnVisible('default') ? (
                      <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                        {renderCertificateHeader(
                          'default',
                          'Padrão',
                          renderCertificateDefaultFilter(),
                        )}
                      </th>
                    ) : null}
                    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-right text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                      Ações
                    </th>
                  </tr>
                  {certificateActiveFilter ? (
                    <tr aria-hidden="true">
                      <th colSpan={certificateGridColSpan} className="h-56 bg-white p-0" />
                    </tr>
                  ) : null}
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={certificateGridColSpan} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Carregando certificados digitais...
                      </td>
                    </tr>
                  ) : paginatedCertificates.length ? (
                    paginatedCertificates.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-3 align-top" />
                        {isCertificateGridColumnVisible('aliasName') ? (
                          <td className="px-3 py-3 align-top text-sm font-semibold text-slate-700">
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-1 inline-flex h-3.5 w-3.5 shrink-0 rounded-full ${getSemaphoreClass(item)}`}
                                title={getCertificateIndicatorLabel(item)}
                                aria-label={getCertificateIndicatorLabel(item)}
                                role="img"
                              />
                              <div className="min-w-0">
                                <div className="font-black text-slate-900">{item.aliasName}</div>
                                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  {item.purpose}
                                </div>
                              </div>
                            </div>
                          </td>
                        ) : null}
                        {isCertificateGridColumnVisible('holder') ? (
                          <td className="px-3 py-3 align-top text-sm font-semibold text-slate-700">
                            <div>{item.holderName}</div>
                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {item.holderDocument}
                            </div>
                          </td>
                        ) : null}
                        {isCertificateGridColumnVisible('environment') ? (
                          <td className="px-3 py-3 align-top text-sm font-semibold text-slate-700">
                            <div>{getCertificateEnvironmentLabel(item)}</div>
                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              UF {item.authorStateCode}
                            </div>
                          </td>
                        ) : null}
                        {isCertificateGridColumnVisible('validTo') ? (
                          <td className="px-3 py-3 align-top text-sm font-semibold text-slate-700">
                            <div>{formatDateLabel(item.validTo || null)}</div>
                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {item.lastSyncAt
                                ? `ÚLT. SINCRONIZAÇÃO ${formatDateLabel(item.lastSyncAt)}`
                                : 'SEM SINCRONIZAÇÃO'}
                            </div>
                          </td>
                        ) : null}
                        {isCertificateGridColumnVisible('default') ? (
                          <td className="px-3 py-3 align-top text-sm font-semibold text-slate-700">
                            {item.isDefault ? 'SIM' : 'NÃO'}
                          </td>
                        ) : null}
                        <td className="px-3 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(item)}
                              disabled={actionCertificateId === item.id}
                              aria-label="Alterar certificado"
                              title="Alterar certificado"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                            {!item.isDefault ? (
                              <button
                                type="button"
                                onClick={() => void handleSetDefault(item)}
                                disabled={actionCertificateId === item.id}
                                aria-label="Definir como certificado padrão"
                                title="Definir como certificado padrão"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.9"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 3l2.7 5.47 6.03.88-4.36 4.25 1.03 6L12 16.76 6.6 19.6l1.03-6-4.36-4.25 6.03-.88Z" />
                                </svg>
                              </button>
                            ) : null}
                            {item.status === 'ACTIVE' ? (
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(item, 'inactivate')}
                                disabled={actionCertificateId === item.id}
                                aria-label="Excluir certificado"
                                title="Excluir certificado"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.9"
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
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(item, 'activate')}
                                disabled={actionCertificateId === item.id}
                                aria-label="Ativar certificado"
                                title="Ativar certificado"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.9"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={certificateGridColSpan} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                        Nenhum certificado digital encontrado com os filtros atuais.
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
                    onClick={() => setIsColumnConfigOpen(true)}
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
                    onClick={() => setIsExportModalOpen(true)}
                    aria-label="Imprimir"
                    title="Imprimir"
                    className={FINANCE_GRID_PAGE_LAYOUT.footerIconButton}
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
                            setCertificateStatusFilter(
                              item.value as CertificateStatusFilter,
                            )
                          }
                          aria-label={item.label}
                          title={item.label}
                          aria-pressed={isActive}
                          className={`relative h-6 w-14 rounded-full border transition duration-200 ${
                            isActive
                              ? `${item.activeTone} scale-105 border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35),0_8px_24px_rgba(15,23,42,0.22)] ring-4 ring-slate-400 ring-offset-2 ring-offset-slate-100`
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
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <select
                    value={certificatePageSize}
                    onChange={(event) =>
                      setCertificatePageSize(Number(event.target.value))
                    }
                    aria-label="Registros por página"
                    className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 outline-none transition hover:bg-slate-50 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  >
                    {[10, 20, 50, 100].map((pageSize) => (
                      <option key={pageSize} value={pageSize}>
                        {pageSize}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    aria-label="Voltar para o início"
                    title="Voltar para o início"
                    onClick={() => setCertificatePage(1)}
                    disabled={currentCertificatePage <= 1}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'<<'}
                  </button>
                  <button
                    type="button"
                    aria-label="Voltar uma página"
                    title="Voltar uma página"
                    onClick={() =>
                      setCertificatePage((current) => Math.max(1, current - 1))
                    }
                    disabled={currentCertificatePage <= 1}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'<'}
                  </button>
                  <div className="min-w-20 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    {currentCertificatePage}/{certificateTotalPages}
                  </div>
                  <button
                    type="button"
                    aria-label="Avançar uma página"
                    title="Avançar uma página"
                    onClick={() =>
                      setCertificatePage((current) =>
                        Math.min(certificateTotalPages, current + 1),
                      )
                    }
                    disabled={currentCertificatePage >= certificateTotalPages}
                    className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {'>'}
                  </button>
                  <button
                    type="button"
                    aria-label="Ir para o fim"
                    title="Ir para o fim"
                    onClick={() => setCertificatePage(certificateTotalPages)}
                    disabled={currentCertificatePage >= certificateTotalPages}
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

      <GridExportModal
        isOpen={isExportModalOpen}
        title="Exportar certificados digitais"
        description={`A exportação considera ${filteredCertificates.length} registro(s) do filtro atual.`}
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
            rows: filteredCertificates,
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

      <CertificateGridConfigModal
        isOpen={isColumnConfigOpen}
        hidden={hiddenColumns}
        onSave={setHiddenColumns}
        onClose={() => setIsColumnConfigOpen(false)}
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
