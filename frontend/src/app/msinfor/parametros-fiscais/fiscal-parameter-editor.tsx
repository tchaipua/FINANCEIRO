'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestJson } from '@/app/lib/api';
import { normalizeBrazilTaxIdInput } from '@/app/lib/brazil-tax-id';
import { getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type FiscalBranch = {
  fiscalLegalName?: string | null;
  fiscalTradeName?: string | null;
  fiscalDocument?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  taxRegimeCode?: string | null;
  fiscalStreet?: string | null;
  fiscalNumber?: string | null;
  fiscalComplement?: string | null;
  fiscalNeighborhood?: string | null;
  fiscalCity?: string | null;
  fiscalCityCode?: string | null;
  fiscalState?: string | null;
  fiscalStateCode?: string | null;
  fiscalPostalCode?: string | null;
  fiscalCountryCode?: string | null;
  fiscalCountryName?: string | null;
  fiscalPhone?: string | null;
  fiscalEmail?: string | null;
};

type FiscalOperation = {
  id: string;
  code: string;
  name: string;
  documentModel: string;
  operationType: string;
  destinationType: string;
  purposeCode: string;
  cfopCode: string;
  finalConsumer: boolean;
  presenceIndicator: string;
  intermediaryIndicator?: string | null;
  freightMode: string;
  isDefault: boolean;
  additionalInformation?: string | null;
};

type FiscalTaxRule = {
  id: string;
  operationNatureId: string;
  operationNature?: { code?: string; name?: string };
  productId?: string | null;
  product?: { id?: string; name?: string } | null;
  name: string;
  priority: number;
  originCode: string;
  icmsCsosnCode?: string | null;
  icmsCstCode?: string | null;
  icmsBaseMode?: string | null;
  icmsRate?: number | null;
  icmsBaseReductionRate?: number | null;
  fiscalBenefitCode?: string | null;
  fiscalBenefitRequired: boolean;
  fiscalBenefitLegalBasis?: string | null;
  pisCstCode: string;
  pisRate?: number | null;
  cofinsCstCode: string;
  cofinsRate?: number | null;
  ipiCstCode?: string | null;
  ipiFrameworkCode?: string | null;
  ipiRate?: number | null;
  ibsCbsEnabled: boolean;
  ibsCbsCstCode?: string | null;
  ibsCbsClassCode?: string | null;
  ibsStateRate?: number | null;
  ibsMunicipalRate?: number | null;
  cbsRate?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
};

type FiscalBenefit = {
  id: string;
  stateCode: string;
  code: string;
  catalogVersion: string;
  description: string;
  legalBasis?: string | null;
  observations?: string | null;
  simpleNationalEligible: boolean;
  cstCodesJson?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  sourceUrl?: string | null;
};

type FiscalCertificate = {
  id: string;
  aliasName: string;
  holderName?: string | null;
  holderDocument?: string | null;
  validTo?: string | null;
};

type NfeProfile = {
  id: string;
  certificateId: string;
  certificateAlias?: string | null;
  defaultOperationNatureId?: string | null;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  autoIssueOnSale: boolean;
  series: number;
  nextNumber: number;
  emissionType: string;
  danfeLayout: string;
  softwareVersion?: string | null;
  schemaVersion?: string | null;
  cbenefCatalogVersion?: string | null;
  sendEmailToRecipient: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure: boolean;
  smtpAuthenticate: boolean;
  smtpUsername?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  smtpTimeoutSeconds?: number | null;
  homologationEmailRecipient?: string | null;
  hasSmtpPassword?: boolean;
  additionalInformation?: string | null;
  technicalResponsibleCnpj?: string | null;
  technicalResponsibleName?: string | null;
  technicalResponsibleEmail?: string | null;
  technicalResponsiblePhone?: string | null;
  csrtId?: string | null;
  hasCsrtHash?: boolean;
};

type FiscalOverview = {
  branch: FiscalBranch;
  profile: NfeProfile | null;
  operations: FiscalOperation[];
  rules: FiscalTaxRule[];
  benefits: FiscalBenefit[];
  certificates: FiscalCertificate[];
  readiness: {
    ready: boolean;
    schemaVersion: string;
    cbenefCatalogVersion: string;
    checks: Array<{ code: string; label: string; ready: boolean }>;
  };
};

type BranchForm = Required<{
  [Key in keyof FiscalBranch]: string;
}>;

type OperationForm = {
  id: string;
  code: string;
  name: string;
  documentModel: string;
  operationType: string;
  destinationType: string;
  purposeCode: string;
  cfopCode: string;
  finalConsumer: boolean;
  presenceIndicator: string;
  intermediaryIndicator: string;
  freightMode: string;
  isDefault: boolean;
  additionalInformation: string;
};

type TaxRuleForm = {
  id: string;
  operationNatureId: string;
  productId: string;
  name: string;
  priority: string;
  originCode: string;
  icmsCsosnCode: string;
  icmsCstCode: string;
  icmsBaseMode: string;
  icmsRate: string;
  icmsBaseReductionRate: string;
  fiscalBenefitCode: string;
  fiscalBenefitRequired: boolean;
  fiscalBenefitLegalBasis: string;
  pisCstCode: string;
  pisRate: string;
  cofinsCstCode: string;
  cofinsRate: string;
  ipiCstCode: string;
  ipiFrameworkCode: string;
  ipiRate: string;
  ibsCbsEnabled: boolean;
  ibsCbsCstCode: string;
  ibsCbsClassCode: string;
  ibsStateRate: string;
  ibsMunicipalRate: string;
  cbsRate: string;
  validFrom: string;
  validTo: string;
};

type BenefitForm = {
  id: string;
  stateCode: string;
  code: string;
  catalogVersion: string;
  description: string;
  legalBasis: string;
  observations: string;
  simpleNationalEligible: boolean;
  cstCodes: string;
  validFrom: string;
  validTo: string;
  sourceUrl: string;
};

type ProfileForm = {
  certificateId: string;
  defaultOperationNatureId: string;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  autoIssueOnSale: boolean;
  series: string;
  nextNumber: string;
  emissionType: string;
  danfeLayout: string;
  softwareVersion: string;
  sendEmailToRecipient: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpAuthenticate: boolean;
  smtpUsername: string;
  smtpPassword: string;
  smtpFromEmail: string;
  smtpFromName: string;
  smtpTimeoutSeconds: string;
  homologationEmailRecipient: string;
  additionalInformation: string;
  technicalResponsibleCnpj: string;
  technicalResponsibleName: string;
  technicalResponsibleEmail: string;
  technicalResponsiblePhone: string;
  csrtId: string;
  csrtHash: string;
};

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold uppercase text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100';
const labelClass =
  'mb-1 block text-[10px] font-black uppercase tracking-[0.15em] text-slate-500';
const sectionClass = 'rounded-2xl border border-slate-200 bg-slate-50 p-4';
const primaryButton =
  'rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300';
const secondaryButton =
  'rounded-xl border border-slate-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-blue-300 hover:text-blue-700';

const emptyBranchForm: BranchForm = {
  fiscalLegalName: '',
  fiscalTradeName: '',
  fiscalDocument: '',
  stateRegistration: '',
  municipalRegistration: '',
  taxRegimeCode: '1',
  fiscalStreet: '',
  fiscalNumber: '',
  fiscalComplement: '',
  fiscalNeighborhood: '',
  fiscalCity: '',
  fiscalCityCode: '',
  fiscalState: 'SP',
  fiscalStateCode: '35',
  fiscalPostalCode: '',
  fiscalCountryCode: '1058',
  fiscalCountryName: 'BRASIL',
  fiscalPhone: '',
  fiscalEmail: '',
};

const emptyOperationForm: OperationForm = {
  id: '',
  code: '',
  name: '',
  documentModel: '55',
  operationType: 'OUTBOUND',
  destinationType: 'INTERNAL',
  purposeCode: '1',
  cfopCode: '',
  finalConsumer: true,
  presenceIndicator: '1',
  intermediaryIndicator: '0',
  freightMode: '9',
  isDefault: false,
  additionalInformation: '',
};

const emptyTaxRuleForm: TaxRuleForm = {
  id: '',
  operationNatureId: '',
  productId: '',
  name: '',
  priority: '100',
  originCode: '0',
  icmsCsosnCode: '102',
  icmsCstCode: '',
  icmsBaseMode: '3',
  icmsRate: '0',
  icmsBaseReductionRate: '0',
  fiscalBenefitCode: '',
  fiscalBenefitRequired: false,
  fiscalBenefitLegalBasis: '',
  pisCstCode: '49',
  pisRate: '0',
  cofinsCstCode: '49',
  cofinsRate: '0',
  ipiCstCode: '',
  ipiFrameworkCode: '',
  ipiRate: '0',
  ibsCbsEnabled: false,
  ibsCbsCstCode: '',
  ibsCbsClassCode: '',
  ibsStateRate: '0',
  ibsMunicipalRate: '0',
  cbsRate: '0',
  validFrom: '',
  validTo: '',
};

const emptyBenefitForm: BenefitForm = {
  id: '',
  stateCode: 'SP',
  code: '',
  catalogVersion: '20260626',
  description: '',
  legalBasis: '',
  observations: '',
  simpleNationalEligible: false,
  cstCodes: '',
  validFrom: '',
  validTo: '',
  sourceUrl: 'https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/cBenef.aspx',
};

const emptyProfileForm: ProfileForm = {
  certificateId: '',
  defaultOperationNatureId: '',
  environment: 'HOMOLOGATION',
  autoIssueOnSale: false,
  series: '1',
  nextNumber: '1',
  emissionType: 'NORMAL',
  danfeLayout: 'PORTRAIT',
  softwareVersion: 'MSINFOR FIN 1.0',
  sendEmailToRecipient: false,
  smtpHost: 'smtp.gmail.com',
  smtpPort: '465',
  smtpSecure: true,
  smtpAuthenticate: true,
  smtpUsername: '',
  smtpPassword: '',
  smtpFromEmail: '',
  smtpFromName: '',
  smtpTimeoutSeconds: '60',
  homologationEmailRecipient: '',
  additionalInformation: '',
  technicalResponsibleCnpj: '',
  technicalResponsibleName: '',
  technicalResponsibleEmail: '',
  technicalResponsiblePhone: '',
  csrtId: '',
  csrtHash: '',
};

function optional(value: string) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function numberValue(value: string) {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : '';
}

function cstCodesLabel(value?: string | null) {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join(', ') : String(value);
  } catch {
    return String(value);
  }
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className={labelClass}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} ${type === 'password' ? 'normal-case' : ''}`}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className={labelClass}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        {children}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-blue-600"
      />
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-700">
        {label}
      </span>
    </label>
  );
}

export default function FiscalParameterEditor({ itemSlug }: { itemSlug: string }) {
  const runtimeContext = useFinanceRuntimeContext();
  const [overview, setOverview] = useState<FiscalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<{
    statusCode?: string | null;
    statusMessage?: string | null;
    available?: boolean;
  } | null>(null);
  const [branchForm, setBranchForm] = useState<BranchForm>(emptyBranchForm);
  const [operationForm, setOperationForm] =
    useState<OperationForm>(emptyOperationForm);
  const [taxRuleForm, setTaxRuleForm] =
    useState<TaxRuleForm>(emptyTaxRuleForm);
  const [benefitForm, setBenefitForm] =
    useState<BenefitForm>(emptyBenefitForm);
  const [profileForm, setProfileForm] =
    useState<ProfileForm>(emptyProfileForm);

  const contextPayload = useMemo(
    () => ({
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceBranchCode: runtimeContext.sourceBranchCode,
      requestedBy:
        runtimeContext.cashierUserId ||
        runtimeContext.cashierDisplayName ||
        'ADMIN_FINANCEIRO',
    }),
    [runtimeContext],
  );

  const hydrateForms = useCallback((data: FiscalOverview) => {
    const branch = data.branch || {};
    setBranchForm({
      fiscalLegalName: branch.fiscalLegalName || '',
      fiscalTradeName: branch.fiscalTradeName || '',
      fiscalDocument: branch.fiscalDocument || '',
      stateRegistration: branch.stateRegistration || '',
      municipalRegistration: branch.municipalRegistration || '',
      taxRegimeCode: branch.taxRegimeCode || '1',
      fiscalStreet: branch.fiscalStreet || '',
      fiscalNumber: branch.fiscalNumber || '',
      fiscalComplement: branch.fiscalComplement || '',
      fiscalNeighborhood: branch.fiscalNeighborhood || '',
      fiscalCity: branch.fiscalCity || '',
      fiscalCityCode: branch.fiscalCityCode || '',
      fiscalState: branch.fiscalState || 'SP',
      fiscalStateCode: branch.fiscalStateCode || '35',
      fiscalPostalCode: branch.fiscalPostalCode || '',
      fiscalCountryCode: branch.fiscalCountryCode || '1058',
      fiscalCountryName: branch.fiscalCountryName || 'BRASIL',
      fiscalPhone: branch.fiscalPhone || '',
      fiscalEmail: branch.fiscalEmail || '',
    });
    const operation = data.operations[0];
    setOperationForm(
      operation
        ? {
            id: operation.id,
            code: operation.code,
            name: operation.name,
            documentModel: operation.documentModel || '55',
            operationType: operation.operationType,
            destinationType: operation.destinationType,
            purposeCode: operation.purposeCode,
            cfopCode: operation.cfopCode,
            finalConsumer: Boolean(operation.finalConsumer),
            presenceIndicator: operation.presenceIndicator || '1',
            intermediaryIndicator: operation.intermediaryIndicator || '0',
            freightMode: operation.freightMode || '9',
            isDefault: Boolean(operation.isDefault),
            additionalInformation: operation.additionalInformation || '',
          }
        : emptyOperationForm,
    );
    const rule = data.rules[0];
    setTaxRuleForm(
      rule
        ? {
            id: rule.id,
            operationNatureId: rule.operationNatureId,
            productId: rule.productId || '',
            name: rule.name,
            priority: String(rule.priority ?? 100),
            originCode: rule.originCode || '0',
            icmsCsosnCode: rule.icmsCsosnCode || '',
            icmsCstCode: rule.icmsCstCode || '',
            icmsBaseMode: rule.icmsBaseMode || '3',
            icmsRate: String(rule.icmsRate ?? 0),
            icmsBaseReductionRate: String(rule.icmsBaseReductionRate ?? 0),
            fiscalBenefitCode: rule.fiscalBenefitCode || '',
            fiscalBenefitRequired: Boolean(rule.fiscalBenefitRequired),
            fiscalBenefitLegalBasis: rule.fiscalBenefitLegalBasis || '',
            pisCstCode: rule.pisCstCode || '49',
            pisRate: String(rule.pisRate ?? 0),
            cofinsCstCode: rule.cofinsCstCode || '49',
            cofinsRate: String(rule.cofinsRate ?? 0),
            ipiCstCode: rule.ipiCstCode || '',
            ipiFrameworkCode: rule.ipiFrameworkCode || '',
            ipiRate: String(rule.ipiRate ?? 0),
            ibsCbsEnabled: Boolean(rule.ibsCbsEnabled),
            ibsCbsCstCode: rule.ibsCbsCstCode || '',
            ibsCbsClassCode: rule.ibsCbsClassCode || '',
            ibsStateRate: String(rule.ibsStateRate ?? 0),
            ibsMunicipalRate: String(rule.ibsMunicipalRate ?? 0),
            cbsRate: String(rule.cbsRate ?? 0),
            validFrom: dateInput(rule.validFrom),
            validTo: dateInput(rule.validTo),
          }
        : {
            ...emptyTaxRuleForm,
            operationNatureId: data.operations[0]?.id || '',
          },
    );
    const benefit = data.benefits[0];
    setBenefitForm(
      benefit
        ? {
            id: benefit.id,
            stateCode: benefit.stateCode,
            code: benefit.code,
            catalogVersion: benefit.catalogVersion,
            description: benefit.description,
            legalBasis: benefit.legalBasis || '',
            observations: benefit.observations || '',
            simpleNationalEligible: Boolean(benefit.simpleNationalEligible),
            cstCodes: cstCodesLabel(benefit.cstCodesJson),
            validFrom: dateInput(benefit.validFrom),
            validTo: dateInput(benefit.validTo),
            sourceUrl:
              benefit.sourceUrl ||
              'https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/cBenef.aspx',
          }
        : {
            ...emptyBenefitForm,
            catalogVersion: data.readiness.cbenefCatalogVersion || '20260626',
          },
    );
    const profile = data.profile;
    setProfileForm(
      profile
        ? {
            certificateId: profile.certificateId,
            defaultOperationNatureId: profile.defaultOperationNatureId || '',
            environment: profile.environment,
            autoIssueOnSale: Boolean(profile.autoIssueOnSale),
            series: String(profile.series),
            nextNumber: String(profile.nextNumber),
            emissionType: profile.emissionType || 'NORMAL',
            danfeLayout: profile.danfeLayout || 'PORTRAIT',
            softwareVersion: profile.softwareVersion || 'MSINFOR FIN 1.0',
            sendEmailToRecipient: Boolean(profile.sendEmailToRecipient),
            smtpHost: profile.smtpHost || 'smtp.gmail.com',
            smtpPort: String(profile.smtpPort || 465),
            smtpSecure: Boolean(profile.smtpSecure),
            smtpAuthenticate: Boolean(profile.smtpAuthenticate),
            smtpUsername: profile.smtpUsername || '',
            smtpPassword: '',
            smtpFromEmail: profile.smtpFromEmail || '',
            smtpFromName: profile.smtpFromName || '',
            smtpTimeoutSeconds: String(profile.smtpTimeoutSeconds || 60),
            homologationEmailRecipient:
              profile.homologationEmailRecipient || '',
            additionalInformation: profile.additionalInformation || '',
            technicalResponsibleCnpj: profile.technicalResponsibleCnpj || '',
            technicalResponsibleName: profile.technicalResponsibleName || '',
            technicalResponsibleEmail: profile.technicalResponsibleEmail || '',
            technicalResponsiblePhone: profile.technicalResponsiblePhone || '',
            csrtId: profile.csrtId || '',
            csrtHash: '',
          }
        : {
            ...emptyProfileForm,
            certificateId: data.certificates[0]?.id || '',
            defaultOperationNatureId: data.operations[0]?.id || '',
          },
    );
  }, []);

  const loadOverview = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<FiscalOverview>(
        `/fiscal-parameters/overview${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
          environment: 'HOMOLOGATION',
        })}`,
      );
      setOverview(data);
      hydrateForms(data);
    } catch (requestError) {
      setError(
        getFriendlyRequestErrorMessage(
          requestError,
          'Não foi possível carregar os parâmetros fiscais.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [hydrateForms, runtimeContext]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const saveParameter = useCallback(
    async (key: string, path: string, payload: Record<string, unknown>) => {
      setSaving(key);
      setMessage(null);
      setError(null);
      try {
        await requestJson(path, {
          method: 'PUT',
          body: JSON.stringify({ ...contextPayload, ...payload }),
          fallbackMessage: 'Não foi possível salvar o parâmetro fiscal.',
        });
        setMessage('PARÂMETRO FISCAL SALVO COM SUCESSO.');
        await loadOverview();
      } catch (requestError) {
        setError(
          getFriendlyRequestErrorMessage(
            requestError,
            'Não foi possível salvar o parâmetro fiscal.',
          ),
        );
      } finally {
        setSaving('');
      }
    },
    [contextPayload, loadOverview],
  );

  const checkServiceStatus = useCallback(async () => {
    setSaving('status');
    setError(null);
    try {
      const result = await requestJson<{
        statusCode?: string | null;
        statusMessage?: string | null;
        available?: boolean;
      }>(
        `/fiscal-documents/nfe/status${buildFinanceApiQueryString(runtimeContext, {
          sourceBranchCode: runtimeContext.sourceBranchCode,
          environment: 'HOMOLOGATION',
        })}`,
      );
      setServiceStatus(result);
    } catch (requestError) {
      setError(
        getFriendlyRequestErrorMessage(
          requestError,
          'Não foi possível consultar a SEFAZ.',
        ),
      );
    } finally {
      setSaving('');
    }
  }, [runtimeContext]);

  if (loading) {
    return (
      <div className={`${sectionClass} text-center text-sm font-bold text-slate-600`}>
        CARREGANDO CADASTROS FISCAIS...
      </div>
    );
  }

  if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
        Abra a tela pelo sistema consumidor para identificar empresa e filial.
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">
        {error || 'Os parâmetros fiscais não puderam ser carregados.'}
      </div>
    );
  }

  const editOperation = (operation: FiscalOperation) =>
    setOperationForm({
      id: operation.id,
      code: operation.code,
      name: operation.name,
      documentModel: operation.documentModel || '55',
      operationType: operation.operationType,
      destinationType: operation.destinationType,
      purposeCode: operation.purposeCode,
      cfopCode: operation.cfopCode,
      finalConsumer: Boolean(operation.finalConsumer),
      presenceIndicator: operation.presenceIndicator || '1',
      intermediaryIndicator: operation.intermediaryIndicator || '0',
      freightMode: operation.freightMode || '9',
      isDefault: Boolean(operation.isDefault),
      additionalInformation: operation.additionalInformation || '',
    });

  const editRule = (rule: FiscalTaxRule) =>
    setTaxRuleForm({
      id: rule.id,
      operationNatureId: rule.operationNatureId,
      productId: rule.productId || '',
      name: rule.name,
      priority: String(rule.priority ?? 100),
      originCode: rule.originCode || '0',
      icmsCsosnCode: rule.icmsCsosnCode || '',
      icmsCstCode: rule.icmsCstCode || '',
      icmsBaseMode: rule.icmsBaseMode || '3',
      icmsRate: String(rule.icmsRate ?? 0),
      icmsBaseReductionRate: String(rule.icmsBaseReductionRate ?? 0),
      fiscalBenefitCode: rule.fiscalBenefitCode || '',
      fiscalBenefitRequired: Boolean(rule.fiscalBenefitRequired),
      fiscalBenefitLegalBasis: rule.fiscalBenefitLegalBasis || '',
      pisCstCode: rule.pisCstCode || '49',
      pisRate: String(rule.pisRate ?? 0),
      cofinsCstCode: rule.cofinsCstCode || '49',
      cofinsRate: String(rule.cofinsRate ?? 0),
      ipiCstCode: rule.ipiCstCode || '',
      ipiFrameworkCode: rule.ipiFrameworkCode || '',
      ipiRate: String(rule.ipiRate ?? 0),
      ibsCbsEnabled: Boolean(rule.ibsCbsEnabled),
      ibsCbsCstCode: rule.ibsCbsCstCode || '',
      ibsCbsClassCode: rule.ibsCbsClassCode || '',
      ibsStateRate: String(rule.ibsStateRate ?? 0),
      ibsMunicipalRate: String(rule.ibsMunicipalRate ?? 0),
      cbsRate: String(rule.cbsRate ?? 0),
      validFrom: dateInput(rule.validFrom),
      validTo: dateInput(rule.validTo),
    });

  const editBenefit = (benefit: FiscalBenefit) =>
    setBenefitForm({
      id: benefit.id,
      stateCode: benefit.stateCode,
      code: benefit.code,
      catalogVersion: benefit.catalogVersion,
      description: benefit.description,
      legalBasis: benefit.legalBasis || '',
      observations: benefit.observations || '',
      simpleNationalEligible: Boolean(benefit.simpleNationalEligible),
      cstCodes: cstCodesLabel(benefit.cstCodesJson),
      validFrom: dateInput(benefit.validFrom),
      validTo: dateInput(benefit.validTo),
      sourceUrl:
        benefit.sourceUrl ||
        'https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/cBenef.aspx',
    });

  const showOperations = ['naturezas-operacao', 'cfops'].includes(itemSlug);
  const showProfile = ['series-numeracao', 'ambientes-sefaz', 'automacao-emissao'].includes(
    itemSlug,
  );

  return (
    <div className="mt-6 space-y-5">
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">
              Prontidão NF-e modelo 55
            </div>
            <div className="mt-1 text-sm font-black text-slate-900">
              {overview.readiness.ready
                ? 'FILIAL PRONTA PARA EMISSÃO'
                : 'EXISTEM CONFIGURAÇÕES PENDENTES'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void checkServiceStatus()}
            disabled={saving === 'status'}
            className={secondaryButton}
          >
            {saving === 'status' ? 'Consultando...' : 'Consultar SEFAZ'}
          </button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {overview.readiness.checks.map((check) => (
            <div
              key={check.code}
              className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] ${
                check.ready
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {check.ready ? '✓' : '×'} {check.label}
            </div>
          ))}
        </div>
        {serviceStatus ? (
          <div
            className={`mt-3 rounded-xl border px-4 py-3 text-xs font-bold ${
              serviceStatus.available
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            SEFAZ: {serviceStatus.statusCode || '---'} —{' '}
            {serviceStatus.statusMessage || 'SEM MENSAGEM'}
          </div>
        ) : null}
      </div>

      {itemSlug === 'filial-emitente' ? (
        <div className={sectionClass}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field
              label="Razão social"
              value={branchForm.fiscalLegalName}
              onChange={(value) =>
                setBranchForm((current) => ({ ...current, fiscalLegalName: value.toUpperCase() }))
              }
              className="md:col-span-2"
              required
            />
            <Field
              label="Nome fantasia"
              value={branchForm.fiscalTradeName}
              onChange={(value) =>
                setBranchForm((current) => ({ ...current, fiscalTradeName: value.toUpperCase() }))
              }
            />
            <Field
              label="CNPJ"
              value={branchForm.fiscalDocument}
              onChange={(value) =>
                setBranchForm((current) => ({
                  ...current,
                  fiscalDocument: normalizeBrazilTaxIdInput(value),
                }))
              }
              required
            />
            <Field
              label="Inscrição estadual"
              value={branchForm.stateRegistration}
              onChange={(value) =>
                setBranchForm((current) => ({ ...current, stateRegistration: value.toUpperCase() }))
              }
              required
            />
            <Field
              label="Inscrição municipal"
              value={branchForm.municipalRegistration}
              onChange={(value) =>
                setBranchForm((current) => ({ ...current, municipalRegistration: value.toUpperCase() }))
              }
            />
            <SelectField
              label="Regime tributário"
              value={branchForm.taxRegimeCode}
              onChange={(value) =>
                setBranchForm((current) => ({ ...current, taxRegimeCode: value }))
              }
            >
              <option value="1">1 - Simples Nacional</option>
              <option value="2">2 - Simples Nacional, excesso de sublimite</option>
              <option value="3">3 - Regime normal</option>
              <option value="4">4 - MEI</option>
            </SelectField>
            {(
              [
                ['fiscalStreet', 'Logradouro'],
                ['fiscalNumber', 'Número'],
                ['fiscalComplement', 'Complemento'],
                ['fiscalNeighborhood', 'Bairro'],
                ['fiscalCity', 'Município'],
                ['fiscalCityCode', 'Código IBGE município'],
                ['fiscalState', 'UF'],
                ['fiscalStateCode', 'Código IBGE UF'],
                ['fiscalPostalCode', 'CEP'],
                ['fiscalCountryCode', 'Código do país'],
                ['fiscalCountryName', 'País'],
                ['fiscalPhone', 'Telefone'],
                ['fiscalEmail', 'E-mail fiscal'],
              ] as Array<[keyof BranchForm, string]>
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={branchForm[key]}
                type={key === 'fiscalEmail' ? 'email' : 'text'}
                onChange={(value) =>
                  setBranchForm((current) => ({
                    ...current,
                    [key]: key === 'fiscalEmail' ? value : value.toUpperCase(),
                  }))
                }
              />
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={primaryButton}
              disabled={saving === 'branch'}
              onClick={() =>
                void saveParameter('branch', '/fiscal-parameters/branch', {
                  ...branchForm,
                  fiscalTradeName: optional(branchForm.fiscalTradeName),
                  municipalRegistration: optional(branchForm.municipalRegistration),
                  fiscalComplement: optional(branchForm.fiscalComplement),
                  fiscalPhone: optional(branchForm.fiscalPhone),
                  fiscalEmail: optional(branchForm.fiscalEmail),
                })
              }
            >
              {saving === 'branch' ? 'Salvando...' : 'Salvar filial emitente'}
            </button>
          </div>
        </div>
      ) : null}

      {showOperations ? (
        <>
          <div className={sectionClass}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">
                Natureza e CFOP
              </div>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setOperationForm(emptyOperationForm)}
              >
                Nova natureza
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field
                label="Código interno"
                value={operationForm.code}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, code: value.toUpperCase() }))
                }
                required
              />
              <Field
                label="Descrição da natureza"
                value={operationForm.name}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, name: value.toUpperCase() }))
                }
                className="md:col-span-2"
                required
              />
              <Field
                label="CFOP"
                value={operationForm.cfopCode}
                onChange={(value) =>
                  setOperationForm((current) => ({
                    ...current,
                    cfopCode: value.replace(/\D+/g, '').slice(0, 4),
                  }))
                }
                required
              />
              <SelectField
                label="Modelo"
                value={operationForm.documentModel}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, documentModel: value }))
                }
              >
                <option value="55">55 - NF-e</option>
                <option value="65">65 - NFC-e</option>
              </SelectField>
              <SelectField
                label="Movimento"
                value={operationForm.operationType}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, operationType: value }))
                }
              >
                <option value="OUTBOUND">Saída</option>
                <option value="INBOUND">Entrada</option>
              </SelectField>
              <SelectField
                label="Destino"
                value={operationForm.destinationType}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, destinationType: value }))
                }
              >
                <option value="INTERNAL">Dentro do estado</option>
                <option value="INTERSTATE">Interestadual</option>
                <option value="FOREIGN">Exterior</option>
              </SelectField>
              <SelectField
                label="Finalidade"
                value={operationForm.purposeCode}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, purposeCode: value }))
                }
              >
                <option value="1">1 - Normal</option>
                <option value="2">2 - Complementar</option>
                <option value="3">3 - Ajuste</option>
                <option value="4">4 - Devolução</option>
              </SelectField>
              <Field
                label="Indicador de presença"
                value={operationForm.presenceIndicator}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, presenceIndicator: value }))
                }
              />
              <Field
                label="Indicador intermediador"
                value={operationForm.intermediaryIndicator}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, intermediaryIndicator: value }))
                }
              />
              <Field
                label="Modalidade do frete"
                value={operationForm.freightMode}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, freightMode: value }))
                }
              />
              <ToggleField
                label="Consumidor final"
                checked={operationForm.finalConsumer}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, finalConsumer: value }))
                }
              />
              <ToggleField
                label="Natureza padrão"
                checked={operationForm.isDefault}
                onChange={(value) =>
                  setOperationForm((current) => ({ ...current, isDefault: value }))
                }
              />
              <Field
                label="Informações adicionais"
                value={operationForm.additionalInformation}
                onChange={(value) =>
                  setOperationForm((current) => ({
                    ...current,
                    additionalInformation: value.toUpperCase(),
                  }))
                }
                className="md:col-span-2"
              />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className={primaryButton}
                disabled={saving === 'operation'}
                onClick={() =>
                  void saveParameter('operation', '/fiscal-parameters/operations', {
                    ...operationForm,
                    id: optional(operationForm.id),
                    intermediaryIndicator: optional(operationForm.intermediaryIndicator),
                    additionalInformation: optional(operationForm.additionalInformation),
                  })
                }
              >
                {saving === 'operation' ? 'Salvando...' : 'Salvar natureza e CFOP'}
              </button>
            </div>
          </div>
          <div className={sectionClass}>
            <div className="space-y-2">
              {overview.operations.map((operation) => (
                <div
                  key={operation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-black text-slate-900">{operation.name}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                      {operation.code} · CFOP {operation.cfopCode} · MODELO {operation.documentModel}
                      {operation.isDefault ? ' · PADRÃO' : ''}
                    </div>
                  </div>
                  <button type="button" className={secondaryButton} onClick={() => editOperation(operation)}>
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {itemSlug === 'regras-tributarias' ? (
        <>
          <div className={sectionClass}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">
                Regra tributária
              </div>
              <button
                type="button"
                className={secondaryButton}
                onClick={() =>
                  setTaxRuleForm({
                    ...emptyTaxRuleForm,
                    operationNatureId: overview.operations[0]?.id || '',
                  })
                }
              >
                Nova regra
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SelectField
                label="Natureza de operação"
                value={taxRuleForm.operationNatureId}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, operationNatureId: value }))
                }
                className="md:col-span-2"
              >
                <option value="">Selecione</option>
                {overview.operations.map((operation) => (
                  <option key={operation.id} value={operation.id}>
                    {operation.name} - CFOP {operation.cfopCode}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Nome da regra"
                value={taxRuleForm.name}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, name: value.toUpperCase() }))
                }
                className="md:col-span-2"
              />
              <Field
                label="Produto específico (ID, opcional)"
                value={taxRuleForm.productId}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, productId: value }))
                }
              />
              <Field
                label="Prioridade"
                value={taxRuleForm.priority}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, priority: value }))
                }
                type="number"
              />
              <Field
                label="Origem da mercadoria"
                value={taxRuleForm.originCode}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, originCode: value }))
                }
              />
              <Field
                label="CSOSN"
                value={taxRuleForm.icmsCsosnCode}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, icmsCsosnCode: value }))
                }
              />
              <Field
                label="CST ICMS"
                value={taxRuleForm.icmsCstCode}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, icmsCstCode: value }))
                }
              />
              <Field
                label="Modalidade BC ICMS"
                value={taxRuleForm.icmsBaseMode}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, icmsBaseMode: value }))
                }
              />
              <Field
                label="Alíquota ICMS (%)"
                value={taxRuleForm.icmsRate}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, icmsRate: value }))
                }
              />
              <Field
                label="Redução BC ICMS (%)"
                value={taxRuleForm.icmsBaseReductionRate}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({
                    ...current,
                    icmsBaseReductionRate: value,
                  }))
                }
              />
              <Field
                label="cBenef"
                value={taxRuleForm.fiscalBenefitCode}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({
                    ...current,
                    fiscalBenefitCode: value.toUpperCase(),
                  }))
                }
                placeholder="VAZIO QUANDO NÃO HOUVER BENEFÍCIO"
              />
              <ToggleField
                label="cBenef obrigatório"
                checked={taxRuleForm.fiscalBenefitRequired}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({
                    ...current,
                    fiscalBenefitRequired: value,
                  }))
                }
              />
              <Field
                label="Base legal do benefício"
                value={taxRuleForm.fiscalBenefitLegalBasis}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({
                    ...current,
                    fiscalBenefitLegalBasis: value.toUpperCase(),
                  }))
                }
              />
              {(
                [
                  ['pisCstCode', 'CST PIS'],
                  ['pisRate', 'Alíquota PIS (%)'],
                  ['cofinsCstCode', 'CST COFINS'],
                  ['cofinsRate', 'Alíquota COFINS (%)'],
                  ['ipiCstCode', 'CST IPI'],
                  ['ipiFrameworkCode', 'Enquadramento IPI'],
                  ['ipiRate', 'Alíquota IPI (%)'],
                ] as Array<[keyof TaxRuleForm, string]>
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  value={String(taxRuleForm[key])}
                  onChange={(value) =>
                    setTaxRuleForm((current) => ({ ...current, [key]: value }))
                  }
                />
              ))}
              <ToggleField
                label="Calcular IBS/CBS"
                checked={taxRuleForm.ibsCbsEnabled}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, ibsCbsEnabled: value }))
                }
              />
              {taxRuleForm.ibsCbsEnabled
                ? (
                    [
                      ['ibsCbsCstCode', 'CST IBS/CBS'],
                      ['ibsCbsClassCode', 'Classificação tributária'],
                      ['ibsStateRate', 'Alíquota IBS UF (%)'],
                      ['ibsMunicipalRate', 'Alíquota IBS município (%)'],
                      ['cbsRate', 'Alíquota CBS (%)'],
                    ] as Array<[keyof TaxRuleForm, string]>
                  ).map(([key, label]) => (
                    <Field
                      key={key}
                      label={label}
                      value={String(taxRuleForm[key])}
                      onChange={(value) =>
                        setTaxRuleForm((current) => ({ ...current, [key]: value }))
                      }
                    />
                  ))
                : null}
              <Field
                label="Vigência inicial"
                type="date"
                value={taxRuleForm.validFrom}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, validFrom: value }))
                }
              />
              <Field
                label="Vigência final"
                type="date"
                value={taxRuleForm.validTo}
                onChange={(value) =>
                  setTaxRuleForm((current) => ({ ...current, validTo: value }))
                }
              />
            </div>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
              Em São Paulo, não use “SEM CBENEF”. Quando a operação normal não possuir
              benefício fiscal, deixe o campo vazio. Códigos informados precisam estar no
              catálogo ativo da filial.
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className={primaryButton}
                disabled={saving === 'rule'}
                onClick={() =>
                  void saveParameter('rule', '/fiscal-parameters/tax-rules', {
                    ...taxRuleForm,
                    id: optional(taxRuleForm.id),
                    productId: optional(taxRuleForm.productId),
                    priority: numberValue(taxRuleForm.priority),
                    icmsCsosnCode: optional(taxRuleForm.icmsCsosnCode),
                    icmsCstCode: optional(taxRuleForm.icmsCstCode),
                    icmsBaseMode: optional(taxRuleForm.icmsBaseMode),
                    icmsRate: numberValue(taxRuleForm.icmsRate),
                    icmsBaseReductionRate: numberValue(taxRuleForm.icmsBaseReductionRate),
                    fiscalBenefitCode: optional(taxRuleForm.fiscalBenefitCode),
                    fiscalBenefitLegalBasis: optional(taxRuleForm.fiscalBenefitLegalBasis),
                    pisRate: numberValue(taxRuleForm.pisRate),
                    cofinsRate: numberValue(taxRuleForm.cofinsRate),
                    ipiCstCode: optional(taxRuleForm.ipiCstCode),
                    ipiFrameworkCode: optional(taxRuleForm.ipiFrameworkCode),
                    ipiRate: numberValue(taxRuleForm.ipiRate),
                    ibsCbsCstCode: optional(taxRuleForm.ibsCbsCstCode),
                    ibsCbsClassCode: optional(taxRuleForm.ibsCbsClassCode),
                    ibsStateRate: numberValue(taxRuleForm.ibsStateRate),
                    ibsMunicipalRate: numberValue(taxRuleForm.ibsMunicipalRate),
                    cbsRate: numberValue(taxRuleForm.cbsRate),
                    validFrom: optional(taxRuleForm.validFrom),
                    validTo: optional(taxRuleForm.validTo),
                  })
                }
              >
                {saving === 'rule' ? 'Salvando...' : 'Salvar regra tributária'}
              </button>
            </div>
          </div>
          <div className={sectionClass}>
            <div className="space-y-2">
              {overview.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-black text-slate-900">{rule.name}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                      {rule.operationNature?.name || 'OPERAÇÃO'} · CSOSN{' '}
                      {rule.icmsCsosnCode || '---'} · cBenef{' '}
                      {rule.fiscalBenefitCode || 'NÃO APLICÁVEL'}
                    </div>
                  </div>
                  <button type="button" className={secondaryButton} onClick={() => editRule(rule)}>
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {itemSlug === 'beneficios-fiscais' ? (
        <>
          <div className={sectionClass}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">
                Catálogo cBenef da filial
              </div>
              <button
                type="button"
                className={secondaryButton}
                onClick={() =>
                  setBenefitForm({
                    ...emptyBenefitForm,
                    catalogVersion: overview.readiness.cbenefCatalogVersion,
                  })
                }
              >
                Novo código
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field
                label="UF"
                value={benefitForm.stateCode}
                onChange={(value) =>
                  setBenefitForm((current) => ({
                    ...current,
                    stateCode: value.toUpperCase().slice(0, 2),
                  }))
                }
              />
              <Field
                label="Código cBenef"
                value={benefitForm.code}
                onChange={(value) =>
                  setBenefitForm((current) => ({ ...current, code: value.toUpperCase() }))
                }
              />
              <Field
                label="Versão do catálogo"
                value={benefitForm.catalogVersion}
                onChange={(value) =>
                  setBenefitForm((current) => ({ ...current, catalogVersion: value }))
                }
              />
              <Field
                label="CST/CSOSN aplicáveis"
                value={benefitForm.cstCodes}
                onChange={(value) =>
                  setBenefitForm((current) => ({ ...current, cstCodes: value }))
                }
                placeholder="40, 41, 102"
              />
              <Field
                label="Descrição"
                value={benefitForm.description}
                onChange={(value) =>
                  setBenefitForm((current) => ({
                    ...current,
                    description: value.toUpperCase(),
                  }))
                }
                className="md:col-span-2"
              />
              <Field
                label="Base legal"
                value={benefitForm.legalBasis}
                onChange={(value) =>
                  setBenefitForm((current) => ({
                    ...current,
                    legalBasis: value.toUpperCase(),
                  }))
                }
                className="md:col-span-2"
              />
              <Field
                label="Vigência inicial"
                type="date"
                value={benefitForm.validFrom}
                onChange={(value) =>
                  setBenefitForm((current) => ({ ...current, validFrom: value }))
                }
              />
              <Field
                label="Vigência final"
                type="date"
                value={benefitForm.validTo}
                onChange={(value) =>
                  setBenefitForm((current) => ({ ...current, validTo: value }))
                }
              />
              <ToggleField
                label="Aplicável ao Simples Nacional"
                checked={benefitForm.simpleNationalEligible}
                onChange={(value) =>
                  setBenefitForm((current) => ({
                    ...current,
                    simpleNationalEligible: value,
                  }))
                }
              />
              <Field
                label="Observações"
                value={benefitForm.observations}
                onChange={(value) =>
                  setBenefitForm((current) => ({
                    ...current,
                    observations: value.toUpperCase(),
                  }))
                }
              />
              <Field
                label="Fonte oficial"
                value={benefitForm.sourceUrl}
                onChange={(value) =>
                  setBenefitForm((current) => ({ ...current, sourceUrl: value }))
                }
                className="md:col-span-2 xl:col-span-4"
              />
            </div>
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">
              Catálogo SP carregado: {overview.readiness.cbenefCatalogVersion}. O código “SEM
              CBENEF” é bloqueado. CSOSN 102 sem benefício fiscal deve ficar sem cBenef.
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className={primaryButton}
                disabled={saving === 'benefit'}
                onClick={() =>
                  void saveParameter('benefit', '/fiscal-parameters/benefits', {
                    ...benefitForm,
                    id: optional(benefitForm.id),
                    legalBasis: optional(benefitForm.legalBasis),
                    observations: optional(benefitForm.observations),
                    cstCodes: optional(benefitForm.cstCodes),
                    validFrom: optional(benefitForm.validFrom),
                    validTo: optional(benefitForm.validTo),
                    sourceUrl: optional(benefitForm.sourceUrl),
                  })
                }
              >
                {saving === 'benefit' ? 'Salvando...' : 'Salvar código cBenef'}
              </button>
            </div>
          </div>
          <div className={sectionClass}>
            {overview.benefits.length ? (
              <div className="space-y-2">
                {overview.benefits.map((benefit) => (
                  <div
                    key={benefit.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-black text-slate-900">
                        {benefit.code} — {benefit.description}
                      </div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                        {benefit.stateCode} · CATÁLOGO {benefit.catalogVersion} · CST/CSOSN{' '}
                        {cstCodesLabel(benefit.cstCodesJson) || 'NÃO INFORMADO'}
                      </div>
                    </div>
                    <button type="button" className={secondaryButton} onClick={() => editBenefit(benefit)}>
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm font-semibold text-slate-600">
                Nenhum benefício cadastrado. Para a regra atual CSOSN 102 sem benefício, isso
                está correto.
              </div>
            )}
          </div>
        </>
      ) : null}

      {showProfile ? (
        <div className={sectionClass}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Ambiente"
              value={profileForm.environment}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  environment: value as 'HOMOLOGATION' | 'PRODUCTION',
                }))
              }
            >
              <option value="HOMOLOGATION">Homologação</option>
              <option value="PRODUCTION">Produção</option>
            </SelectField>
            <SelectField
              label="Certificado A1"
              value={profileForm.certificateId}
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, certificateId: value }))
              }
              className="md:col-span-2"
            >
              <option value="">Selecione</option>
              {overview.certificates.map((certificate) => (
                <option key={certificate.id} value={certificate.id}>
                  {certificate.aliasName} - VÁLIDO ATÉ {dateInput(certificate.validTo)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Natureza padrão"
              value={profileForm.defaultOperationNatureId}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  defaultOperationNatureId: value,
                }))
              }
            >
              <option value="">Selecione</option>
              {overview.operations.map((operation) => (
                <option key={operation.id} value={operation.id}>
                  {operation.name} - {operation.cfopCode}
                </option>
              ))}
            </SelectField>
            <Field
              label="Série"
              type="number"
              value={profileForm.series}
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, series: value }))
              }
            />
            <Field
              label="Próximo número"
              type="number"
              value={profileForm.nextNumber}
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, nextNumber: value }))
              }
            />
            <SelectField
              label="Layout DANFE"
              value={profileForm.danfeLayout}
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, danfeLayout: value }))
              }
            >
              <option value="PORTRAIT">Retrato</option>
              <option value="LANDSCAPE">Paisagem</option>
            </SelectField>
            <Field
              label="Versão do sistema"
              value={profileForm.softwareVersion}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  softwareVersion: value.toUpperCase(),
                }))
              }
            />
            <ToggleField
              label="Emitir NF-e automaticamente ao finalizar venda"
              checked={profileForm.autoIssueOnSale}
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, autoIssueOnSale: value }))
              }
            />
            <ToggleField
              label="Enviar XML/DANFE por e-mail"
              checked={profileForm.sendEmailToRecipient}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  sendEmailToRecipient: value,
                }))
              }
            />
            {profileForm.sendEmailToRecipient ? (
              <>
                <Field
                  label="Servidor SMTP"
                  value={profileForm.smtpHost}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, smtpHost: value }))
                  }
                />
                <Field
                  label="Porta SMTP"
                  type="number"
                  value={profileForm.smtpPort}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, smtpPort: value }))
                  }
                />
                <ToggleField
                  label="Conexão SMTP segura (SSL)"
                  checked={profileForm.smtpSecure}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, smtpSecure: value }))
                  }
                />
                <ToggleField
                  label="Autenticar no SMTP"
                  checked={profileForm.smtpAuthenticate}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      smtpAuthenticate: value,
                    }))
                  }
                />
                <Field
                  label="Usuário SMTP"
                  value={profileForm.smtpUsername}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      smtpUsername: value,
                    }))
                  }
                />
                <Field
                  label={
                    overview.profile?.hasSmtpPassword
                      ? 'Senha SMTP (já cadastrada)'
                      : 'Senha SMTP'
                  }
                  type="password"
                  placeholder={
                    overview.profile?.hasSmtpPassword
                      ? 'Deixe em branco para manter'
                      : undefined
                  }
                  value={profileForm.smtpPassword}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      smtpPassword: value,
                    }))
                  }
                />
                <Field
                  label="E-mail remetente"
                  type="email"
                  value={profileForm.smtpFromEmail}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      smtpFromEmail: value,
                    }))
                  }
                />
                <Field
                  label="Nome do remetente"
                  value={profileForm.smtpFromName}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      smtpFromName: value.toUpperCase(),
                    }))
                  }
                />
                <Field
                  label="Tempo limite SMTP (segundos)"
                  type="number"
                  value={profileForm.smtpTimeoutSeconds}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      smtpTimeoutSeconds: value,
                    }))
                  }
                />
                {profileForm.environment === 'HOMOLOGATION' ? (
                  <Field
                    label="E-mail fixo para testes em homologação"
                    type="email"
                    value={profileForm.homologationEmailRecipient}
                    onChange={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        homologationEmailRecipient: value,
                      }))
                    }
                  />
                ) : null}
              </>
            ) : null}
            <Field
              label="Informações adicionais"
              value={profileForm.additionalInformation}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  additionalInformation: value.toUpperCase(),
                }))
              }
              className="md:col-span-2"
            />
            <Field
              label="CNPJ responsável técnico"
              value={profileForm.technicalResponsibleCnpj}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  technicalResponsibleCnpj: normalizeBrazilTaxIdInput(value),
                }))
              }
            />
            <Field
              label="Responsável técnico"
              value={profileForm.technicalResponsibleName}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  technicalResponsibleName: value.toUpperCase(),
                }))
              }
            />
            <Field
              label="E-mail técnico"
              type="email"
              value={profileForm.technicalResponsibleEmail}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  technicalResponsibleEmail: value,
                }))
              }
            />
            <Field
              label="Telefone técnico"
              value={profileForm.technicalResponsiblePhone}
              onChange={(value) =>
                setProfileForm((current) => ({
                  ...current,
                  technicalResponsiblePhone: value,
                }))
              }
            />
            <Field
              label="ID CSRT"
              value={profileForm.csrtId}
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, csrtId: value }))
              }
            />
            <Field
              label="Hash CSRT (não é reexibido)"
              value={profileForm.csrtHash}
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, csrtHash: value }))
              }
            />
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700">
            Schema: {overview.readiness.schemaVersion} · Catálogo cBenef:{' '}
            {overview.readiness.cbenefCatalogVersion}. A emissão manual permanece disponível
            na venda mesmo quando a automação está desligada.
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={primaryButton}
              disabled={saving === 'profile'}
              onClick={() =>
                void saveParameter('profile', '/fiscal-parameters/nfe-profile', {
                  ...profileForm,
                  defaultOperationNatureId: optional(
                    profileForm.defaultOperationNatureId,
                  ),
                  series: numberValue(profileForm.series),
                  nextNumber: numberValue(profileForm.nextNumber),
                  smtpHost: optional(profileForm.smtpHost),
                  smtpPort: profileForm.smtpHost
                    ? numberValue(profileForm.smtpPort)
                    : undefined,
                  smtpUsername: optional(profileForm.smtpUsername),
                  smtpPassword: optional(profileForm.smtpPassword),
                  smtpFromEmail: optional(profileForm.smtpFromEmail),
                  smtpFromName: optional(profileForm.smtpFromName),
                  smtpTimeoutSeconds: numberValue(
                    profileForm.smtpTimeoutSeconds,
                  ),
                  homologationEmailRecipient: optional(
                    profileForm.homologationEmailRecipient,
                  ),
                  additionalInformation: optional(profileForm.additionalInformation),
                  technicalResponsibleCnpj: optional(
                    profileForm.technicalResponsibleCnpj,
                  ),
                  technicalResponsibleName: optional(
                    profileForm.technicalResponsibleName,
                  ),
                  technicalResponsibleEmail: optional(
                    profileForm.technicalResponsibleEmail,
                  ),
                  technicalResponsiblePhone: optional(
                    profileForm.technicalResponsiblePhone,
                  ),
                  csrtId: optional(profileForm.csrtId),
                  csrtHash: optional(profileForm.csrtHash),
                })
              }
            >
              {saving === 'profile' ? 'Salvando...' : 'Salvar perfil NF-e'}
            </button>
          </div>
        </div>
      ) : null}

      {itemSlug === 'formas-pagamento' ? (
        <div className={sectionClass}>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['DINHEIRO', '01', 'À vista'],
              ['CARTÃO DE CRÉDITO', '03', 'SuperTEF'],
              ['CARTÃO DE DÉBITO', '04', 'SuperTEF'],
              ['VENDA A PRAZO / DUPLICATA', '14', 'Com fatura e parcelas'],
              ['BOLETO', '15', 'Cobrança bancária'],
              ['PIX', '17', 'Confirmar antes do cartão'],
            ].map(([name, code, detail]) => (
              <div key={name} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="text-xs font-black text-slate-900">{name}</div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  tPag {code} · {detail}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">
            Em venda mista, o Financeiro confirma e envia primeiro o PIX; depois processa cartão
            de crédito ou débito no SuperTEF. A ordem também é preservada no XML da NF-e.
          </div>
        </div>
      ) : null}
    </div>
  );
}
