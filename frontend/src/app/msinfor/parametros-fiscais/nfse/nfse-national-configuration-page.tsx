'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { API_BASE_URL, requestJson } from '@/app/lib/api';
import { formatCurrency, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type NfseProfile = {
  id: string;
  certificateId: string;
  defaultServiceItemId?: string | null;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  autoIssueOnSale: boolean;
  series: number;
  nextNumber: number;
  softwareVersion: string;
  schemaVersion: string;
  simpleNationalOption: number;
  simpleNationalTaxRegime?: number | null;
  specialTaxRegime: number;
  sendEmailToRecipient: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure: boolean;
  smtpAuthenticate: boolean;
  smtpUsername?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  smtpTimeoutSeconds: number;
  homologationEmailRecipient?: string | null;
  hasSmtpPassword: boolean;
  lastMunicipalCheckAt?: string | null;
  lastMunicipalCheckStatus?: string | null;
  lastMunicipalCheckMessage?: string | null;
};

type NfseService = {
  id: string;
  branchCode: number;
  availableToAllBranches: boolean;
  internalCode: string;
  name: string;
  description: string;
  descriptions: Array<{
    id?: string | null;
    text: string;
    sortOrder: number;
  }>;
  cnaeCode?: string | null;
  nationalTaxCode: string;
  municipalTaxCode?: string | null;
  nbsCode?: string | null;
  serviceCityCode: string;
  issTaxationCode: string;
  issWithholdingCode: string;
  issRate?: number | null;
  pisCofinsCst?: string | null;
  pisRate?: number | null;
  cofinsRate?: number | null;
  simpleNationalTotalTaxRate?: number | null;
  ibsCbsEnabled: boolean;
  ibsCbsCst?: string | null;
  ibsCbsClassCode?: string | null;
  isDefault: boolean;
  status: string;
};

type NfseDocument = {
  id: string;
  serviceItemId?: string | null;
  takerPartyId: string;
  environment: string;
  series: number;
  number: number;
  dpsId: string;
  accessKey?: string | null;
  nationalNfseNumber?: string | null;
  status: string;
  statusCode?: string | null;
  statusMessage?: string | null;
  competence: string;
  issuedAt?: string | null;
  grossAmount: number;
  netAmount: number;
  takerName?: string | null;
  takerDocument?: string | null;
  serviceName?: string | null;
  attemptCount: number;
  hasXml: boolean;
  hasDanfse: boolean;
  danfseDownloadUrl?: string | null;
  xmlDownloadUrl?: string | null;
  emailSentAt?: string | null;
  emailError?: string | null;
};

type NfseOverview = {
  company: { id: string; name: string };
  branch: {
    id: string;
    branchCode: number;
    name: string;
    fiscalLegalName?: string | null;
    fiscalTradeName?: string | null;
    fiscalDocument?: string | null;
    municipalRegistration?: string | null;
    fiscalCity?: string | null;
    fiscalCityCode?: string | null;
    fiscalState?: string | null;
    fiscalPostalCode?: string | null;
    fiscalEmail?: string | null;
  };
  profile?: NfseProfile | null;
  services: NfseService[];
  certificates: Array<{
    id: string;
    aliasName: string;
    holderName?: string | null;
    holderDocument?: string | null;
    validTo?: string | null;
  }>;
  parties: Array<{
    id: string;
    name: string;
    document?: string | null;
    email?: string | null;
    city?: string | null;
    recommended: boolean;
  }>;
  lastAuthorizedNfeRecipientPartyId?: string | null;
  documents: NfseDocument[];
  readiness: {
    ready: boolean;
    municipalityEnabled: boolean;
    officialLayoutVersion: string;
    checks: Array<{ code: string; ok: boolean; label: string; message: string }>;
  };
};

type ProfileForm = {
  certificateId: string;
  defaultServiceItemId: string;
  autoIssueOnSale: boolean;
  series: string;
  nextNumber: string;
  softwareVersion: string;
  simpleNationalOption: string;
  simpleNationalTaxRegime: string;
  specialTaxRegime: string;
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
};

type ServiceForm = {
  id: string;
  internalCode: string;
  name: string;
  descriptions: string[];
  cnaeCode: string;
  nationalTaxCode: string;
  municipalTaxCode: string;
  nbsCode: string;
  serviceCityCode: string;
  issTaxationCode: string;
  issWithholdingCode: string;
  issRate: string;
  pisCofinsCst: string;
  pisRate: string;
  cofinsRate: string;
  simpleNationalTotalTaxRate: string;
  isDefault: boolean;
  availableToAllBranches: boolean;
};

type SectionTab = 'readiness' | 'issuer' | 'profile' | 'services' | 'issue' | 'documents';

const SCREEN_ID = 'FINANCEIRO_MSINFOR_PARAMETROS_FISCAIS_NFSE_NACIONAL';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_MSINFOR_PARAMETROS_FISCAIS_NFSE_NACIONAL';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/parametros-fiscais/nfse/page.tsx';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100';
const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500';
const sectionTabs: Array<{ id: SectionTab; label: string }> = [
  { id: 'readiness', label: '1. PRONTIDÃO' },
  { id: 'issuer', label: '2. EMITENTE' },
  { id: 'profile', label: '3. PERFIL NFS-E' },
  { id: 'services', label: '4. SERVIÇOS' },
  { id: 'issue', label: '5. EMISSÃO' },
  { id: 'documents', label: '6. DOCUMENTOS' },
];

const emptyProfile: ProfileForm = {
  certificateId: '',
  defaultServiceItemId: '',
  autoIssueOnSale: false,
  series: '1',
  nextNumber: '1',
  softwareVersion: 'MSINFOR FIN 1.0',
  simpleNationalOption: '3',
  simpleNationalTaxRegime: '1',
  specialTaxRegime: '0',
  sendEmailToRecipient: true,
  smtpHost: '',
  smtpPort: '465',
  smtpSecure: true,
  smtpAuthenticate: true,
  smtpUsername: '',
  smtpPassword: '',
  smtpFromEmail: '',
  smtpFromName: 'MSINFOR',
  smtpTimeoutSeconds: '60',
  homologationEmailRecipient: '',
};

const emptyService: ServiceForm = {
  id: '',
  internalCode: 'SUPORTETI',
  name: 'SUPORTE TÉCNICO EM INFORMÁTICA',
  descriptions: [
    'SERVIÇO DE SUPORTE TÉCNICO EM INFORMÁTICA EM AMBIENTE DE HOMOLOGAÇÃO',
  ],
  cnaeCode: '6209100',
  nationalTaxCode: '010701',
  municipalTaxCode: '',
  nbsCode: '115013000',
  serviceCityCode: '3521309',
  issTaxationCode: '1',
  issWithholdingCode: '1',
  issRate: '',
  pisCofinsCst: '00',
  pisRate: '',
  cofinsRate: '',
  simpleNationalTotalTaxRate: '',
  isDefault: true,
  availableToAllBranches: false,
};

function localDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function optionalNumber(value: string) {
  const normalized = String(value || '').trim().replace(',', '.');
  return normalized ? Number(normalized) : undefined;
}

function registeredServiceDescriptions(service: NfseService) {
  const descriptions = (service.descriptions || [])
    .map((item) => String(item.text || '').trim())
    .filter(Boolean);
  return descriptions.length ? descriptions : [service.description];
}

function serviceFormFrom(service: NfseService): ServiceForm {
  return {
    id: service.id,
    internalCode: service.internalCode,
    name: service.name,
    descriptions: registeredServiceDescriptions(service),
    cnaeCode: service.cnaeCode || '',
    nationalTaxCode: service.nationalTaxCode,
    municipalTaxCode: service.municipalTaxCode || '',
    nbsCode: service.nbsCode || '',
    serviceCityCode: service.serviceCityCode,
    issTaxationCode: service.issTaxationCode,
    issWithholdingCode: service.issWithholdingCode,
    issRate: service.issRate == null ? '' : String(service.issRate),
    pisCofinsCst: service.pisCofinsCst || '00',
    pisRate: service.pisRate == null ? '' : String(service.pisRate),
    cofinsRate: service.cofinsRate == null ? '' : String(service.cofinsRate),
    simpleNationalTotalTaxRate:
      service.simpleNationalTotalTaxRate == null
        ? ''
        : String(service.simpleNationalTotalTaxRate),
    isDefault: Boolean(service.isDefault),
    availableToAllBranches: Boolean(service.availableToAllBranches),
  };
}

function documentStatusClass(status: string) {
  if (status === 'AUTHORIZED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'REJECTED' || status === 'ERROR') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function NfseNationalConfigurationPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [activeTab, setActiveTab] = useState<SectionTab>('readiness');
  const [overview, setOverview] = useState<NfseOverview | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfile);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyService);
  const [isServiceConfigurationOpen, setIsServiceConfigurationOpen] = useState(false);
  const [isServiceSaveSuccess, setIsServiceSaveSuccess] = useState(false);
  const [payerPartyId, setPayerPartyId] = useState('');
  const [issueServiceItemId, setIssueServiceItemId] = useState('');
  const [issueAmount, setIssueAmount] = useState('10.00');
  const [issueCompetence, setIssueCompetence] = useState(localDateInput());
  const [issueDescription, setIssueDescription] = useState(emptyService.descriptions[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const screenId = runtimeContext.embedded ? EMBEDDED_SCREEN_ID : SCREEN_ID;

  const contextPayload = useMemo(
    () => ({
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceBranchCode: runtimeContext.sourceBranchCode,
      environment: 'HOMOLOGATION',
      requestedBy:
        runtimeContext.cashierUserId || runtimeContext.cashierDisplayName || 'ADMIN_FINANCEIRO',
      userRole: runtimeContext.userRole,
      permissions: runtimeContext.permissions.join(','),
    }),
    [runtimeContext],
  );

  const apiQueryString = useCallback(
    () =>
      buildFinanceApiQueryString(runtimeContext, {
        sourceBranchCode: runtimeContext.sourceBranchCode,
        environment: 'HOMOLOGATION',
        userRole: runtimeContext.userRole,
        permissions: runtimeContext.permissions.join(','),
      }),
    [runtimeContext],
  );

  const hydrate = useCallback((data: NfseOverview) => {
    const profile = data.profile;
    setProfileForm(
      profile
        ? {
            certificateId: profile.certificateId,
            defaultServiceItemId: profile.defaultServiceItemId || '',
            autoIssueOnSale: profile.autoIssueOnSale,
            series: String(profile.series),
            nextNumber: String(profile.nextNumber),
            softwareVersion: profile.softwareVersion || 'MSINFOR FIN 1.0',
            simpleNationalOption: String(profile.simpleNationalOption || 3),
            simpleNationalTaxRegime: String(profile.simpleNationalTaxRegime || 1),
            specialTaxRegime: String(profile.specialTaxRegime || 0),
            sendEmailToRecipient: profile.sendEmailToRecipient,
            smtpHost: profile.smtpHost || '',
            smtpPort: String(profile.smtpPort || 465),
            smtpSecure: profile.smtpSecure,
            smtpAuthenticate: profile.smtpAuthenticate,
            smtpUsername: profile.smtpUsername || '',
            smtpPassword: '',
            smtpFromEmail: profile.smtpFromEmail || '',
            smtpFromName: profile.smtpFromName || 'MSINFOR',
            smtpTimeoutSeconds: String(profile.smtpTimeoutSeconds || 60),
            homologationEmailRecipient: profile.homologationEmailRecipient || '',
          }
        : {
            ...emptyProfile,
            certificateId: data.certificates[0]?.id || '',
            defaultServiceItemId: data.services.find((item) => item.isDefault)?.id || '',
          },
    );
    const service = data.services.find((item) => item.isDefault) || data.services[0];
    if (service) {
      const form = serviceFormFrom(service);
      setServiceForm(form);
      setIssueServiceItemId((current) => current || service.id);
      setIssueDescription(form.descriptions[0]);
    } else {
      setServiceForm({
        ...emptyService,
        serviceCityCode:
          data.branch.fiscalCityCode || emptyService.serviceCityCode,
      });
    }
    const recommended =
      data.parties.find((party) => party.recommended) || data.parties[0];
    setPayerPartyId((current) => current || recommended?.id || '');
  }, []);

  const loadOverview = useCallback(async () => {
    if (
      !runtimeContext.sourceSystem ||
      !runtimeContext.sourceTenantId ||
      !runtimeContext.userRole
    ) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await requestJson<NfseOverview>(
        `/fiscal-parameters/nfse/overview${apiQueryString()}`,
      );
      setOverview(data);
      hydrate(data);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar a configuração da NFS-e.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [apiQueryString, hydrate, runtimeContext]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!runtimeContext.embedded || window.parent === window) return;
    window.parent.postMessage(
      { type: 'MSINFOR_SCREEN_CONTEXT', screenId: EMBEDDED_SCREEN_ID },
      '*',
    );
  }, [runtimeContext.embedded]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setSaving(key);
      setMessage('');
      setError('');
      try {
        await action();
      } catch (currentError) {
        setError(
          getFriendlyRequestErrorMessage(currentError, 'Não foi possível concluir a operação.'),
        );
      } finally {
        setSaving('');
      }
    },
    [],
  );

  const saveProfile = useCallback(
    () =>
      runAction('profile', async () => {
        await requestJson('/fiscal-parameters/nfse/profile', {
          method: 'PUT',
          body: JSON.stringify({
            ...contextPayload,
            certificateId: profileForm.certificateId,
            defaultServiceItemId: profileForm.defaultServiceItemId || undefined,
            autoIssueOnSale: profileForm.autoIssueOnSale,
            series: Number(profileForm.series),
            nextNumber: Number(profileForm.nextNumber),
            softwareVersion: profileForm.softwareVersion,
            schemaVersion: '1.01',
            simpleNationalOption: Number(profileForm.simpleNationalOption),
            simpleNationalTaxRegime: Number(profileForm.simpleNationalTaxRegime),
            specialTaxRegime: Number(profileForm.specialTaxRegime),
            sendEmailToRecipient: profileForm.sendEmailToRecipient,
            smtpHost: profileForm.smtpHost || undefined,
            smtpPort: Number(profileForm.smtpPort || 465),
            smtpSecure: profileForm.smtpSecure,
            smtpAuthenticate: profileForm.smtpAuthenticate,
            smtpUsername: profileForm.smtpUsername || undefined,
            smtpPassword: profileForm.smtpPassword || undefined,
            smtpFromEmail: profileForm.smtpFromEmail || undefined,
            smtpFromName: profileForm.smtpFromName || undefined,
            smtpTimeoutSeconds: Number(profileForm.smtpTimeoutSeconds || 60),
            homologationEmailRecipient:
              profileForm.homologationEmailRecipient || undefined,
          }),
          fallbackMessage: 'Não foi possível salvar o perfil NFS-e.',
        });
        setMessage('PERFIL NFS-E SALVO. A CONFIGURAÇÃO SMTP DA NF-E FOI REAPROVEITADA QUANDO NECESSÁRIO.');
        await loadOverview();
      }),
    [contextPayload, loadOverview, profileForm, runAction],
  );

  const saveService = useCallback(
    () =>
      runAction('service', async () => {
        await requestJson('/fiscal-parameters/nfse/services', {
          method: 'PUT',
          body: JSON.stringify({
            ...contextPayload,
            ...serviceForm,
            id: serviceForm.id || undefined,
            description: serviceForm.descriptions[0] || '',
            issRate: optionalNumber(serviceForm.issRate),
            pisRate: optionalNumber(serviceForm.pisRate),
            cofinsRate: optionalNumber(serviceForm.cofinsRate),
            simpleNationalTotalTaxRate: optionalNumber(
              serviceForm.simpleNationalTotalTaxRate,
            ),
            ibsCbsEnabled: false,
          }),
          fallbackMessage: 'Não foi possível salvar o serviço da NFS-e.',
        });
        setMessage('SERVIÇO FISCAL DA NFS-E SALVO COM SUCESSO.');
        await loadOverview();
        setIsServiceSaveSuccess(true);
      }),
    [contextPayload, loadOverview, runAction, serviceForm],
  );

  const startNewService = useCallback(() => {
    setIsServiceSaveSuccess(false);
    setServiceForm({
      ...emptyService,
      serviceCityCode: overview?.branch.fiscalCityCode || emptyService.serviceCityCode,
      isDefault: !overview?.services.length,
    });
    setIsServiceConfigurationOpen(true);
  }, [overview]);

  const addServiceDescription = useCallback(() => {
    setServiceForm((current) => ({
      ...current,
      descriptions:
        current.descriptions.length >= 30
          ? current.descriptions
          : [...current.descriptions, ''],
    }));
  }, []);

  const updateServiceDescription = useCallback((index: number, value: string) => {
    setServiceForm((current) => ({
      ...current,
      descriptions: current.descriptions.map((description, currentIndex) =>
        currentIndex === index ? value.toUpperCase() : description,
      ),
    }));
  }, []);

  const removeServiceDescription = useCallback((index: number) => {
    setServiceForm((current) => ({
      ...current,
      descriptions:
        current.descriptions.length === 1
          ? ['']
          : current.descriptions.filter((_, currentIndex) => currentIndex !== index),
    }));
  }, []);

  const selectService = useCallback((service: NfseService) => {
    setIsServiceSaveSuccess(false);
    setServiceForm(serviceFormFrom(service));
    setIsServiceConfigurationOpen(true);
  }, []);

  const cancelService = useCallback(
    (service: NfseService) =>
      runAction('cancel-service', async () => {
        if (!window.confirm(`Cancelar logicamente o serviço ${service.name}?`)) return;
        await requestJson(`/fiscal-parameters/nfse/services/${service.id}`, {
          method: 'DELETE',
          body: JSON.stringify(contextPayload),
          fallbackMessage: 'Não foi possível cancelar o serviço.',
        });
        setMessage('SERVIÇO CANCELADO LOGICAMENTE.');
        await loadOverview();
      }),
    [contextPayload, loadOverview, runAction],
  );

  const syncMunicipality = useCallback(
    () =>
      runAction('municipality', async () => {
        const result = await requestJson<{ enabled: boolean; message: string }>(
          '/fiscal-parameters/nfse/municipal-parameters/sync',
          {
            method: 'POST',
            body: JSON.stringify({
              ...contextPayload,
              serviceItemId: issueServiceItemId || overview?.services[0]?.id,
              competence: issueCompetence,
            }),
            fallbackMessage: 'Não foi possível consultar o município no Sistema Nacional.',
          },
        );
        setMessage(result.message);
        await loadOverview();
      }),
    [contextPayload, issueCompetence, issueServiceItemId, loadOverview, overview, runAction],
  );

  const issueNfse = useCallback(
    () =>
      runAction('issue', async () => {
        const operationId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        const result = await requestJson<NfseDocument & { emailDelivery?: { status: string } }>(
          '/fiscal-documents/nfse/issue',
          {
            method: 'POST',
            body: JSON.stringify({
              ...contextPayload,
              serviceItemId: issueServiceItemId,
              payerPartyId,
              sourceEntityType: 'MANUAL_NFSE',
              sourceEntityId: operationId,
              idempotencyKey: `MANUAL-${operationId}`,
              competence: issueCompetence,
              amount: Number(String(issueAmount).replace(',', '.')),
              description: issueDescription,
            }),
            fallbackMessage: 'Não foi possível emitir a NFS-e.',
          },
        );
        setMessage(
          result.status === 'AUTHORIZED'
            ? `NFS-E AUTORIZADA. CHAVE ${result.accessKey}. ${
                result.emailDelivery?.status === 'SENT'
                  ? 'XML E DANFSE ENVIADOS POR E-MAIL.'
                  : ''
              }`
            : `A DPS RETORNOU ${result.status}: ${result.statusMessage || 'CONSULTE O DETALHE.'}`,
        );
        await loadOverview();
      }),
    [
      contextPayload,
      issueAmount,
      issueCompetence,
      issueDescription,
      issueServiceItemId,
      loadOverview,
      payerPartyId,
      runAction,
    ],
  );

  const sendEmail = useCallback(
    (documentId: string) =>
      runAction(`email-${documentId}`, async () => {
        await requestJson(`/fiscal-documents/nfse/documents/${documentId}/email`, {
          method: 'POST',
          body: JSON.stringify(contextPayload),
          fallbackMessage: 'Não foi possível enviar o XML e o DANFSe.',
        });
        setMessage('XML E DANFSE DA NFS-E ENVIADOS POR E-MAIL.');
        await loadOverview();
      }),
    [contextPayload, loadOverview, runAction],
  );

  const artifactUrl = useCallback(
    (path?: string | null) => (path ? `${API_BASE_URL}${path}${apiQueryString()}` : null),
    [apiQueryString],
  );
  const issueService = useMemo(
    () => overview?.services.find((service) => service.id === issueServiceItemId) || null,
    [issueServiceItemId, overview],
  );
  const issueDescriptionOptions = useMemo(
    () => (issueService ? registeredServiceDescriptions(issueService) : []),
    [issueService],
  );

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className={`${cardClass} px-8 py-6 text-sm font-black text-slate-600`}>
          CARREGANDO NFS-E NACIONAL...
        </div>
      </div>
    );
  }

  if (runtimeContext.userRole !== 'ADMIN') {
    return (
      <section className={`${cardClass} border-amber-200 p-8 text-center`}>
        <h1 className="text-xl font-black text-amber-800">ACESSO RESTRITO</h1>
        <p className="mt-2 text-sm font-semibold text-amber-700">
          A configuração da NFS-e exige perfil ADMIN.
        </p>
      </section>
    );
  }

  if (!overview) {
    return (
      <section className={`${cardClass} border-rose-200 p-8 text-center text-sm font-bold text-rose-700`}>
        {error || 'A CONFIGURAÇÃO DA NFS-E NÃO PÔDE SER CARREGADA.'}
      </section>
    );
  }

  const auditText = `Configuração e emissão da NFS-e Nacional no Financeiro.

Empresa: ${overview.company.name}
Filial: ${overview.branch.branchCode} - ${overview.branch.name}
Ambiente: PRODUÇÃO RESTRITA
Layout oficial: ${overview.readiness.officialLayoutVersion}

Regras:
- o tomador é o mesmo Party do pagador da duplicata
- não existe cadastro separado de destinatário
- numeração, certificado, parâmetros e auditoria são isolados por empresa e filial
- somente XML autorizado e DANFSe oficial podem ser enviados por e-mail`;

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-5 py-5 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
                <img src="/principal-financeiro/nfse.svg" alt="NFS-e Nacional" className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">
                  Sistema Nacional · Produção restrita
                </div>
                <h1 className="mt-1 text-2xl font-black">NOTA FISCAL DE SERVIÇO</h1>
                <p className="mt-1 text-xs font-semibold text-blue-100">
                  Uma única tela para parâmetros, serviço, teste, XML, DANFSe e e-mail.
                </p>
              </div>
              <Link
                href={`/msinfor/parametros-fiscais${preservedQueryString}`}
                className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-black hover:bg-white/20"
              >
                VOLTAR
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-black text-rose-700">
          {error}
        </div>
      ) : null}

      <nav
        role="tablist"
        aria-label="Seções da configuração NFS-e"
        className={`${cardClass} flex flex-wrap gap-2 p-3`}
      >
        {sectionTabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tabItem.id}
            onClick={() => setActiveTab(tabItem.id)}
            className={`rounded-xl border px-4 py-2.5 text-xs font-black transition ${
              activeTab === tabItem.id
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
            }`}
          >
            {tabItem.label}
          </button>
        ))}
      </nav>

      {activeTab === 'readiness' ? <section className={`${cardClass} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
              1. Prontidão da filial
            </div>
            <h2 className="mt-1 text-lg font-black text-slate-900">
              {overview.readiness.ready ? 'PRONTA PARA EMITIR' : 'CONFIGURAÇÃO PENDENTE'}
            </h2>
          </div>
          <button
            type="button"
            onClick={syncMunicipality}
            disabled={saving === 'municipality' || !overview.profile}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving === 'municipality' ? 'CONSULTANDO...' : 'CONSULTAR MUNICÍPIO NO AMBIENTE NACIONAL'}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overview.readiness.checks.map((check) => (
            <div
              key={check.code}
              className={`rounded-2xl border p-4 ${
                check.ok
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div className={`text-xs font-black ${check.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                {check.ok ? 'OK' : 'PENDENTE'} · {check.label}
              </div>
              {!check.ok ? <p className="mt-1 text-xs font-semibold text-amber-800">{check.message}</p> : null}
            </div>
          ))}
        </div>
      </section> : null}

      {activeTab === 'issuer' ? <section className={`${cardClass} p-6`}>
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
          2. Emitente compartilhado com a NF-e
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><span className={labelClass}>Filial</span><div className={inputClass}>{overview.branch.branchCode} - {overview.branch.name}</div></div>
          <div><span className={labelClass}>Razão social</span><div className={inputClass}>{overview.branch.fiscalLegalName || 'NÃO INFORMADA'}</div></div>
          <div><span className={labelClass}>CNPJ</span><div className={inputClass}>{overview.branch.fiscalDocument || 'NÃO INFORMADO'}</div></div>
          <div><span className={labelClass}>Inscrição municipal</span><div className={`${inputClass} ${overview.branch.municipalRegistration ? '' : 'border-amber-300 bg-amber-50'}`}>{overview.branch.municipalRegistration || 'PENDENTE'}</div></div>
          <div><span className={labelClass}>Município</span><div className={inputClass}>{overview.branch.fiscalCity || 'NÃO INFORMADO'}</div></div>
          <div><span className={labelClass}>Código IBGE</span><div className={inputClass}>{overview.branch.fiscalCityCode || 'NÃO INFORMADO'}</div></div>
          <div><span className={labelClass}>UF</span><div className={inputClass}>{overview.branch.fiscalState || 'NÃO INFORMADA'}</div></div>
          <div><span className={labelClass}>CEP fiscal</span><div className={inputClass}>{overview.branch.fiscalPostalCode || 'NÃO INFORMADO'}</div></div>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">
          Estes dados vêm da filial fiscal já usada pela NF-e. A NFS-e não cria outro emitente.
        </p>
      </section> : null}

      {activeTab === 'profile' ? <section className={`${cardClass} p-6`}>
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
          3. Perfil NFS-e por filial
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className={labelClass}>Certificado A1</span><select className={inputClass} value={profileForm.certificateId} onChange={(event) => setProfileForm((current) => ({ ...current, certificateId: event.target.value }))}><option value="">SELECIONE</option>{overview.certificates.map((certificate) => <option key={certificate.id} value={certificate.id}>{certificate.aliasName} · {certificate.holderDocument}</option>)}</select></label>
          <label><span className={labelClass}>Serviço padrão</span><select className={inputClass} value={profileForm.defaultServiceItemId} onChange={(event) => setProfileForm((current) => ({ ...current, defaultServiceItemId: event.target.value }))}><option value="">SEM PADRÃO</option>{overview.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label><span className={labelClass}>Série DPS</span><input className={inputClass} type="number" min="1" max="49999" value={profileForm.series} onChange={(event) => setProfileForm((current) => ({ ...current, series: event.target.value }))} /></label>
          <label><span className={labelClass}>Próximo número</span><input className={inputClass} type="number" min="1" value={profileForm.nextNumber} onChange={(event) => setProfileForm((current) => ({ ...current, nextNumber: event.target.value }))} /></label>
          <label><span className={labelClass}>Situação Simples Nacional</span><select className={inputClass} value={profileForm.simpleNationalOption} onChange={(event) => setProfileForm((current) => ({ ...current, simpleNationalOption: event.target.value }))}><option value="1">NÃO OPTANTE</option><option value="2">MEI</option><option value="3">ME/EPP OPTANTE</option></select></label>
          <label><span className={labelClass}>Apuração no Simples</span><select className={inputClass} value={profileForm.simpleNationalTaxRegime} disabled={profileForm.simpleNationalOption !== '3'} onChange={(event) => setProfileForm((current) => ({ ...current, simpleNationalTaxRegime: event.target.value }))}><option value="1">FEDERAL E ISS NO SN</option><option value="2">FEDERAL NO SN / ISS FORA</option><option value="3">FEDERAL E ISS FORA</option></select></label>
          <label><span className={labelClass}>Regime especial</span><select className={inputClass} value={profileForm.specialTaxRegime} onChange={(event) => setProfileForm((current) => ({ ...current, specialTaxRegime: event.target.value }))}><option value="0">NENHUM</option><option value="1">ATO COOPERADO</option><option value="2">ESTIMATIVA</option><option value="3">MICROEMPRESA MUNICIPAL</option><option value="4">NOTÁRIO/REGISTRADOR</option><option value="5">PROFISSIONAL AUTÔNOMO</option><option value="6">SOCIEDADE DE PROFISSIONAIS</option><option value="9">OUTROS</option></select></label>
          <label><span className={labelClass}>Versão do aplicativo</span><input className={inputClass} value={profileForm.softwareVersion} onChange={(event) => setProfileForm((current) => ({ ...current, softwareVersion: event.target.value.toUpperCase() }))} /></label>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-xs font-black text-slate-700"><input type="checkbox" checked={profileForm.autoIssueOnSale} onChange={(event) => setProfileForm((current) => ({ ...current, autoIssueOnSale: event.target.checked }))} /> EMITIR AUTOMATICAMENTE AO FINALIZAR VENDA DE SERVIÇO</label>
            <label className="flex items-center gap-2 text-xs font-black text-slate-700"><input type="checkbox" checked={profileForm.sendEmailToRecipient} onChange={(event) => setProfileForm((current) => ({ ...current, sendEmailToRecipient: event.target.checked }))} /> ENVIAR XML E DANFSE APÓS AUTORIZAR</label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className={labelClass}>Servidor SMTP</span><input className={inputClass} placeholder="REAPROVEITA O PERFIL NF-E" value={profileForm.smtpHost} onChange={(event) => setProfileForm((current) => ({ ...current, smtpHost: event.target.value }))} /></label>
            <label><span className={labelClass}>Porta</span><input className={inputClass} type="number" value={profileForm.smtpPort} onChange={(event) => setProfileForm((current) => ({ ...current, smtpPort: event.target.value }))} /></label>
            <label><span className={labelClass}>Usuário SMTP</span><input className={inputClass} value={profileForm.smtpUsername} onChange={(event) => setProfileForm((current) => ({ ...current, smtpUsername: event.target.value }))} /></label>
            <label><span className={labelClass}>Senha SMTP</span><input className={inputClass} type="password" placeholder={overview.profile?.hasSmtpPassword ? 'SENHA JÁ GRAVADA' : 'REAPROVEITA A NF-E'} value={profileForm.smtpPassword} onChange={(event) => setProfileForm((current) => ({ ...current, smtpPassword: event.target.value }))} /></label>
            <label><span className={labelClass}>E-mail remetente</span><input className={inputClass} type="email" value={profileForm.smtpFromEmail} onChange={(event) => setProfileForm((current) => ({ ...current, smtpFromEmail: event.target.value }))} /></label>
            <label><span className={labelClass}>Nome remetente</span><input className={inputClass} value={profileForm.smtpFromName} onChange={(event) => setProfileForm((current) => ({ ...current, smtpFromName: event.target.value.toUpperCase() }))} /></label>
            <label className="sm:col-span-2"><span className={labelClass}>Destinatário fixo em homologação</span><input className={inputClass} type="email" placeholder="REAPROVEITA O E-MAIL DA NF-E" value={profileForm.homologationEmailRecipient} onChange={(event) => setProfileForm((current) => ({ ...current, homologationEmailRecipient: event.target.value }))} /></label>
          </div>
        </div>
        <button type="button" onClick={saveProfile} disabled={saving === 'profile'} className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50">{saving === 'profile' ? 'SALVANDO...' : 'SALVAR PERFIL NFS-E'}</button>
      </section> : null}

      {activeTab === 'services' ? <section className={`${cardClass} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3"><button type="button" onClick={startNewService} title="Cadastrar novo serviço" aria-label="CADASTRAR NOVO SERVIÇO" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-xl font-black text-blue-700 transition hover:border-blue-300 hover:bg-blue-100">+</button><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">4. Catálogo de serviços</div><h2 className="mt-1 text-lg font-black text-slate-900">CLASSIFICAÇÃO DA DPS</h2></div></div>
          <span className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm">REGISTROS EXIBIDOS ({overview.services.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-3">Código interno</th>
                <th className="px-5 py-3">Serviço</th>
                <th className="px-5 py-3">Tributação ISSQN</th>
                <th className="px-5 py-3">Filial</th>
                <th className="px-5 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {overview.services.map((service, index) => (
                <tr key={service.id} onClick={() => selectService(service)} className={`cursor-pointer transition hover:bg-blue-50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-100/70'}`}>
                  <td className="px-5 py-3 text-xs font-black text-slate-700">{service.internalCode}</td>
                  <td className="px-5 py-3"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><span className="h-2 w-2 rounded-full bg-emerald-500" title="ATIVO" aria-label="ATIVO" />{service.name}</div>{service.isDefault ? <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">PADRÃO DA FILIAL</div> : null}</td>
                  <td className="px-5 py-3 text-xs font-bold text-slate-600">{service.issTaxationCode === '1' ? 'TRIBUTÁVEL' : service.issTaxationCode === '2' ? 'IMUNIDADE' : service.issTaxationCode === '3' ? 'EXPORTAÇÃO' : 'NÃO INCIDÊNCIA'}</td>
                  <td className="px-5 py-3 text-xs font-bold text-slate-600">{service.availableToAllBranches ? 'TODAS AS FILIAIS' : `FILIAL ${service.branchCode}`}</td>
                  <td className="px-5 py-3"><div className="flex justify-center gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); selectService(service); }} title="ALTERAR SERVIÇO" aria-label="ALTERAR SERVIÇO" className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-sm font-black text-blue-700 transition hover:bg-blue-100">✎</button><button type="button" onClick={(event) => { event.stopPropagation(); void cancelService(service); }} title="CANCELAR SERVIÇO" aria-label="CANCELAR SERVIÇO" className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-sm font-black text-rose-700 transition hover:bg-rose-100">×</button></div></td>
                </tr>
              ))}
              {!overview.services.length ? <tr><td colSpan={5} className="px-5 py-10 text-center text-xs font-bold text-slate-500">NENHUM SERVIÇO CADASTRADO. USE NOVO SERVIÇO PARA ABRIR A CONFIGURAÇÃO.</td></tr> : null}
            </tbody>
          </table>
        </div>

        {isServiceConfigurationOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-label="Configuração do serviço NFS-e" className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <header className="flex shrink-0 items-center justify-between gap-4 bg-gradient-to-r from-[#10213f] via-[#153a6a] to-[#2563eb] px-6 py-4 text-white">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5">{runtimeContext.logoUrl ? <img src={runtimeContext.logoUrl} alt={`Logotipo de ${runtimeContext.companyName || overview.company.name}`} className="h-full w-full rounded-lg object-contain" /> : <span className="text-xs font-black text-blue-700">{(runtimeContext.companyName || overview.company.name || 'E').slice(0, 2)}</span>}</div><div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">Configuração de serviço</div><h3 className="truncate text-base font-black">{serviceForm.id ? serviceForm.name || 'SERVIÇO FISCAL' : 'NOVO SERVIÇO FISCAL'}</h3></div></div>
              {!isServiceSaveSuccess ? <button type="button" onClick={() => { setIsServiceConfigurationOpen(false); setIsServiceSaveSuccess(false); }} className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-xs font-black transition hover:bg-white/20">FECHAR</button> : null}
            </header>
            {isServiceSaveSuccess ? <div className="flex min-h-72 flex-1 flex-col items-center justify-center p-8 text-center"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl font-black text-emerald-600">✓</div><h4 className="mt-5 text-xl font-black text-slate-900">SERVIÇO SALVO COM SUCESSO</h4><p className="mt-2 text-sm font-semibold text-slate-500">CONFIRA A CONFIRMAÇÃO E CLIQUE EM FECHAR QUANDO CONCLUIR.</p><button type="button" onClick={() => { setIsServiceConfigurationOpen(false); setIsServiceSaveSuccess(false); }} className="mt-5 rounded-xl bg-rose-600 px-6 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-rose-700">FECHAR</button></div> : <div className="min-h-0 overflow-y-auto p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className={labelClass}>Código interno</span><input className={inputClass} maxLength={20} value={serviceForm.internalCode} onChange={(event) => setServiceForm((current) => ({ ...current, internalCode: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} /></label>
          <label className="lg:col-span-2"><span className={labelClass}>Nome</span><input className={inputClass} value={serviceForm.name} onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value.toUpperCase() }))} /></label>
          <label><span className={labelClass}>CNAE</span><input className={inputClass} inputMode="numeric" value={serviceForm.cnaeCode} onChange={(event) => setServiceForm((current) => ({ ...current, cnaeCode: event.target.value.replace(/\D/g, '') }))} /></label>
          <label><span className={labelClass}>Código tributação nacional</span><input className={inputClass} inputMode="numeric" maxLength={6} value={serviceForm.nationalTaxCode} onChange={(event) => setServiceForm((current) => ({ ...current, nationalTaxCode: event.target.value.replace(/\D/g, '') }))} /></label>
          <label><span className={labelClass}>Código municipal</span><input className={inputClass} value={serviceForm.municipalTaxCode} onChange={(event) => setServiceForm((current) => ({ ...current, municipalTaxCode: event.target.value.toUpperCase() }))} /></label>
          <label><span className={labelClass}>NBS</span><input className={inputClass} inputMode="numeric" maxLength={9} value={serviceForm.nbsCode} onChange={(event) => setServiceForm((current) => ({ ...current, nbsCode: event.target.value.replace(/\D/g, '') }))} /></label>
          <label><span className={labelClass}>Município da prestação</span><input className={inputClass} inputMode="numeric" maxLength={7} value={serviceForm.serviceCityCode} onChange={(event) => setServiceForm((current) => ({ ...current, serviceCityCode: event.target.value.replace(/\D/g, '') }))} /></label>
          <label><span className={labelClass}>Tributação ISSQN</span><select className={inputClass} value={serviceForm.issTaxationCode} onChange={(event) => setServiceForm((current) => ({ ...current, issTaxationCode: event.target.value }))}><option value="1">TRIBUTÁVEL</option><option value="2">IMUNIDADE</option><option value="3">EXPORTAÇÃO</option><option value="4">NÃO INCIDÊNCIA</option></select></label>
          <label><span className={labelClass}>Retenção ISSQN</span><select className={inputClass} value={serviceForm.issWithholdingCode} onChange={(event) => setServiceForm((current) => ({ ...current, issWithholdingCode: event.target.value }))}><option value="1">NÃO RETIDO</option><option value="2">RETIDO PELO TOMADOR</option><option value="3">RETIDO PELO INTERMEDIÁRIO</option></select></label>
          <label><span className={labelClass}>Alíquota ISS (%)</span><input className={inputClass} placeholder="AUTOMÁTICA PELO MUNICÍPIO" value={serviceForm.issRate} onChange={(event) => setServiceForm((current) => ({ ...current, issRate: event.target.value }))} /></label>
          <label><span className={labelClass}>CST PIS/COFINS</span><input className={inputClass} maxLength={2} value={serviceForm.pisCofinsCst} onChange={(event) => setServiceForm((current) => ({ ...current, pisCofinsCst: event.target.value.replace(/\D/g, '') }))} /></label>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className={labelClass}>Descrições cadastradas para este serviço</div>
              <p className="text-xs font-semibold text-slate-500">
                A primeira descrição é a padrão. As demais poderão ser escolhidas na emissão.
              </p>
            </div>
            <button
              type="button"
              onClick={addServiceDescription}
              disabled={serviceForm.descriptions.length >= 30}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 disabled:opacity-50"
            >
              ADICIONAR DESCRIÇÃO
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {serviceForm.descriptions.map((description, index) => (
              <div
                key={`service-description-${index}`}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={labelClass}>
                    DESCRIÇÃO {index + 1}{index === 0 ? ' · PADRÃO' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeServiceDescription(index)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-black text-rose-700"
                  >
                    REMOVER
                  </button>
                </div>
                <textarea
                  aria-label={`Descrição ${index + 1} do serviço`}
                  className={`${inputClass} min-h-20 resize-y`}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => updateServiceDescription(index, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-black text-slate-700"><input key={`service-default-${serviceForm.id || 'new'}`} type="checkbox" checked={serviceForm.isDefault} onChange={(event) => setServiceForm((current) => ({ ...current, isDefault: event.target.checked }))} /> USAR COMO SERVIÇO PADRÃO DA FILIAL</label>
        <label className="mt-3 flex items-center gap-2 text-xs font-black text-slate-700"><input key={`service-shared-${serviceForm.id || 'new'}`} type="checkbox" checked={serviceForm.availableToAllBranches} onChange={(event) => setServiceForm((current) => ({ ...current, availableToAllBranches: event.target.checked }))} /> PODE SER USADO EM QUALQUER FILIAL</label>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={saveService} disabled={saving === 'service'} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50">{saving === 'service' ? 'SALVANDO...' : 'SALVAR SERVIÇO'}</button><span className="text-xs font-semibold text-slate-500">IBS/CBS permanece preparado no banco e desligado em 2026 para este optante do Simples.</span></div>
            </div>}
            <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-3"><ScreenNameCopy screenId="POPUP_FINANCEIRO_MSINFOR_PARAMETROS_FISCAIS_NFSE_SERVICO_CONFIGURACAO" className="justify-end" originText={ORIGIN_TEXT} auditText="Popup de configuração visual do serviço fiscal da NFS-e, aberto a partir da grid do catálogo de serviços." sqlText="-- A CONFIGURAÇÃO DO SERVIÇO É PERSISTIDA PELA ROTA /fiscal-parameters/nfse/services, ISOLADA POR EMPRESA E FILIAL." /></footer>
          </section>
        </div> : null}
      </section> : null}

      {activeTab === 'issue' ? <section className={`${cardClass} border-blue-200 p-6`}>
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">5. Emissão manual de teste</div>
        <h2 className="mt-1 text-lg font-black text-slate-900">DPS → NFS-E → DANFSE → E-MAIL</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="lg:col-span-2"><span className={labelClass}>Tomador = pagador (Party)</span><select className={inputClass} value={payerPartyId} onChange={(event) => setPayerPartyId(event.target.value)}><option value="">SELECIONE</option>{overview.parties.map((party) => <option key={party.id} value={party.id}>{party.recommended ? 'ÚLTIMA NF-E · ' : ''}{party.name} · {party.document}</option>)}</select></label>
          <label><span className={labelClass}>Serviço</span><select className={inputClass} value={issueServiceItemId} onChange={(event) => { const id = event.target.value; setIssueServiceItemId(id); const service = overview.services.find((item) => item.id === id); if (service) setIssueDescription(registeredServiceDescriptions(service)[0]); }}><option value="">SELECIONE</option>{overview.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label><span className={labelClass}>Valor</span><input className={inputClass} inputMode="decimal" value={issueAmount} onChange={(event) => setIssueAmount(event.target.value)} /></label>
          <label><span className={labelClass}>Competência</span><input className={inputClass} type="date" value={issueCompetence} onChange={(event) => setIssueCompetence(event.target.value)} /></label>
          <label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Descrição cadastrada</span><select className={inputClass} value={issueDescriptionOptions.includes(issueDescription) ? issueDescription : ''} onChange={(event) => { if (event.target.value) setIssueDescription(event.target.value); }}><option value="">OUTRA DESCRIÇÃO / EDIÇÃO MANUAL</option>{issueDescriptionOptions.map((description) => <option key={description} value={description}>{description}</option>)}</select></label>
          <label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Descrição desta emissão</span><input className={inputClass} value={issueDescription} onChange={(event) => setIssueDescription(event.target.value.toUpperCase())} /></label>
        </div>
        {!overview.readiness.municipalityEnabled ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">IPUÃ/EMITENTE AINDA NÃO FOI CONFIRMADO COMO HABILITADO NO AMBIENTE RESTRITO. A TRANSMISSÃO PODE SER TENTADA, MAS A API NACIONAL PODERÁ REJEITAR; O SISTEMA NÃO ALTERA O MUNICÍPIO DO EMITENTE.</div> : null}
        <button type="button" onClick={issueNfse} disabled={saving === 'issue' || !overview.profile || !payerPartyId || !issueServiceItemId} className="mt-4 rounded-xl bg-emerald-600 px-6 py-3 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">{saving === 'issue' ? 'TRANSMITINDO À API NACIONAL...' : 'EMITIR NFS-E EM PRODUÇÃO RESTRITA'}</button>
      </section> : null}

      {activeTab === 'documents' ? <section className={`${cardClass} p-6`}>
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">6. Documentos e tentativas</div>
        <div className="mt-4 space-y-3">
          {overview.documents.map((document) => (
            <article key={document.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-black text-slate-900">NFS-E {document.series}/{document.number} · {document.serviceName || 'SERVIÇO'}</div><div className="mt-1 text-xs font-semibold text-slate-500">{document.takerName} · {document.takerDocument} · {formatCurrency(document.netAmount)}</div></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black ${documentStatusClass(document.status)}`}>{document.status}</span></div>
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{document.statusMessage || document.dpsId}</div>
              {document.accessKey ? <div className="mt-2 break-all text-[10px] font-bold text-slate-500">CHAVE: {document.accessKey}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2">{artifactUrl(document.danfseDownloadUrl) ? <a href={artifactUrl(document.danfseDownloadUrl) || undefined} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black text-blue-700">BAIXAR DANFSE</a> : null}{artifactUrl(document.xmlDownloadUrl) ? <a href={artifactUrl(document.xmlDownloadUrl) || undefined} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black text-blue-700">BAIXAR XML</a> : null}{document.status === 'AUTHORIZED' && document.hasDanfse && document.hasXml ? <button type="button" onClick={() => sendEmail(document.id)} disabled={saving === `email-${document.id}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-700">{saving === `email-${document.id}` ? 'ENVIANDO...' : document.emailSentAt ? 'REENVIAR E-MAIL' : 'ENVIAR E-MAIL'}</button> : null}</div>
            </article>
          ))}
          {!overview.documents.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-500">NENHUMA DPS FOI TRANSMITIDA POR ESTA FILIAL.</div> : null}
        </div>
      </section> : null}

      {!runtimeContext.embedded ? <section className={`${cardClass} px-6 py-4`}><ScreenNameCopy screenId={screenId} className="justify-end" originText={ORIGIN_TEXT} auditText={auditText} sqlText="-- NFS-E NACIONAL: DADOS ISOLADOS POR COMPANYID E BRANCHCODE; SEM DELETE FÍSICO." /></section> : null}
    </div>
  );
}
