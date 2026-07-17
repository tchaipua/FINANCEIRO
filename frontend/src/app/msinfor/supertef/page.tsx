'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type SuperTefTabId =
  | 'configuracao'
  | 'maquinas'
  | 'roteamento'
  | 'operacoes'
  | 'estornos'
  | 'auditoria';

type SuperTefConfiguration = {
  id: string;
  active: boolean;
  status: string;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  clientKey: string;
  tokenConfigured: boolean;
  tokenHint: string | null;
  tokenFingerprint: string | null;
  printReceipt: boolean;
  operationTimeoutSeconds: number;
  pollIntervalSeconds: number;
  apiBaseUrl: string;
  lastConnectionTestAt: string | null;
  lastConnectionStatus: string | null;
  lastConnectionMessage: string | null;
  lastPosSyncAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type SuperTefTerminal = {
  id: string;
  providerPosId: number;
  operationalStatus: 'ACTIVE' | 'OUT_OF_SERVICE';
  providerStatus: number | null;
  name: string;
  brand: string | null;
  model: string | null;
  bank: string | null;
  activatedAt: string | null;
  lastSyncedAt: string | null;
  routeCount: number;
};

type SuperTefCheckoutRoute = {
  id: string;
  priority: number;
  terminalId: string;
  terminal: SuperTefTerminal | null;
};

type SuperTefCheckout = {
  id: string;
  code: string;
  name: string;
  status: string;
  routes: SuperTefCheckoutRoute[];
  updatedAt: string | null;
  updatedBy: string | null;
};

type SuperTefAuditEvent = {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  summary: string;
  occurredAt: string;
  performedBy: string | null;
};

type SuperTefPayment = {
  id: string;
  terminalId: string;
  terminalName: string | null;
  providerPosId: number | null;
  checkoutId: string | null;
  checkoutCode: string | null;
  operationId: string;
  providerPaymentUniqueId: string | null;
  providerPaymentStatus: number | null;
  status: 'PENDING_SEND' | 'PENDING' | 'PAID' | 'REJECTED' | 'ERROR';
  transactionType: 'DEBIT' | 'CREDIT';
  installmentCount: number;
  amount: number;
  orderId: string;
  description: string;
  paymentMessage: string | null;
  paymentData: {
    brand?: string | null;
    nsu?: string | null;
    authorizationCode?: string | null;
    acquirerBank?: string | null;
  } | null;
  requestedAt: string | null;
  lastPolledAt: string | null;
  completedAt: string | null;
};

type ConfigurationForm = {
  clientKey: string;
  accessToken: string;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  active: boolean;
  printReceipt: boolean;
  operationTimeoutSeconds: number;
  pollIntervalSeconds: number;
};

type CheckoutForm = {
  id: string | null;
  code: string;
  name: string;
  terminalIds: string[];
};

type PaymentForm = {
  terminalId: string;
  transactionType: 'DEBIT' | 'CREDIT';
  installmentCount: number;
  amount: number;
  orderId: string;
  description: string;
};

type Feedback = {
  tone: 'success' | 'error' | 'info';
  text: string;
} | null;

const TABS = [
  {
    id: 'configuracao' as const,
    label: 'Configuração',
    description: 'Cliente SuperTEF, ambiente e parâmetros da integração.',
  },
  {
    id: 'maquinas' as const,
    label: 'Máquinas POS',
    description: 'Sincronização e situação das SmartPOS disponíveis.',
  },
  {
    id: 'roteamento' as const,
    label: 'Checkouts e roteamento',
    description: 'Máquinas preferenciais, alternativas e contingência.',
  },
  {
    id: 'operacoes' as const,
    label: 'Operações',
    description: 'Pagamentos atuais, filas e pendências de comunicação.',
  },
  {
    id: 'estornos' as const,
    label: 'Estornos',
    description: 'Solicitações e acompanhamento de estornos.',
  },
  {
    id: 'auditoria' as const,
    label: 'Auditoria',
    description: 'Histórico técnico e operacional da integração.',
  },
];

const EMPTY_CONFIGURATION_FORM: ConfigurationForm = {
  clientKey: '',
  accessToken: '',
  environment: 'HOMOLOGATION',
  active: false,
  printReceipt: true,
  operationTimeoutSeconds: 120,
  pollIntervalSeconds: 4,
};

const EMPTY_CHECKOUT_FORM: CheckoutForm = {
  id: null,
  code: '',
  name: '',
  terminalIds: [],
};

const EMPTY_PAYMENT_FORM: PaymentForm = {
  terminalId: '',
  transactionType: 'DEBIT',
  installmentCount: 1,
  amount: 1,
  orderId: 'TESTE-SUPERTEF',
  description: 'PAGAMENTO DE HOMOLOGAÇÃO',
};

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500';
const labelClass =
  'mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-600';
const primaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-[0.1em] text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300';
const secondaryButtonClass =
  'inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.1em] text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const FINANCE_SCREEN_ID = 'FINANCEIRO_MSINFOR_SUPERTEF';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_MSINFOR_SUPERTEF';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/supertef/page.tsx';

function normalizeTab(value: string | null): SuperTefTabId {
  const normalized = String(value || '').trim().toLowerCase();
  return TABS.some((tab) => tab.id === normalized)
    ? (normalized as SuperTefTabId)
    : 'configuracao';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'NÃO INFORMADO';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'NÃO INFORMADO'
    : parsed.toLocaleString('pt-BR');
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function StatusCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] opacity-75">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-black">{value}</div>
    </div>
  );
}

function EmptyPanel({
  eyebrow,
  title,
  description,
  items,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-xl font-black text-slate-900">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm font-medium text-slate-600">{description}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-600 shadow-sm"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SuperTefPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<SuperTefTabId>('configuracao');
  const [configuration, setConfiguration] = useState<SuperTefConfiguration | null>(null);
  const [configurationForm, setConfigurationForm] =
    useState<ConfigurationForm>(EMPTY_CONFIGURATION_FORM);
  const [terminals, setTerminals] = useState<SuperTefTerminal[]>([]);
  const [checkouts, setCheckouts] = useState<SuperTefCheckout[]>([]);
  const [auditEvents, setAuditEvents] = useState<SuperTefAuditEvent[]>([]);
  const [payments, setPayments] = useState<SuperTefPayment[]>([]);
  const [checkoutForm, setCheckoutForm] =
    useState<CheckoutForm>(EMPTY_CHECKOUT_FORM);
  const [paymentForm, setPaymentForm] =
    useState<PaymentForm>(EMPTY_PAYMENT_FORM);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const screenId = runtimeContext.embedded ? EMBEDDED_SCREEN_ID : FINANCE_SCREEN_ID;
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const activeTabDefinition = TABS.find((tab) => tab.id === activeTab) || TABS[0];
  const actor =
    runtimeContext.cashierDisplayName ||
    runtimeContext.cashierUserId ||
    runtimeContext.userRole ||
    'ADMIN_FINANCEIRO';

  const apiQueryString = useMemo(
    () =>
      buildFinanceApiQueryString(runtimeContext, {
        sourceBranchCode: runtimeContext.sourceBranchCode,
        userRole: runtimeContext.userRole,
      }),
    [runtimeContext],
  );

  const mutationContext = useMemo(
    () => ({
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceBranchCode: runtimeContext.sourceBranchCode,
      userRole: runtimeContext.userRole,
      requestedBy: actor,
    }),
    [actor, runtimeContext],
  );

  const loadData = useCallback(async () => {
    if (
      runtimeContext.userRole !== 'ADMIN' ||
      !runtimeContext.sourceSystem ||
      !runtimeContext.sourceTenantId
    ) {
      return;
    }

    setLoading(true);
    try {
      const [
        loadedConfiguration,
        loadedTerminals,
        loadedCheckouts,
        loadedPayments,
        loadedAudit,
      ] =
        await Promise.all([
          requestJson<SuperTefConfiguration | null>(
            `/supertef/configuration${apiQueryString}`,
          ),
          requestJson<SuperTefTerminal[]>(`/supertef/terminals${apiQueryString}`),
          requestJson<SuperTefCheckout[]>(`/supertef/checkouts${apiQueryString}`),
          requestJson<SuperTefPayment[]>(
            `/supertef/payments${buildFinanceApiQueryString(runtimeContext, {
              sourceBranchCode: runtimeContext.sourceBranchCode,
              userRole: runtimeContext.userRole,
              take: 30,
            })}`,
          ),
          requestJson<SuperTefAuditEvent[]>(
            `/supertef/audit${buildFinanceApiQueryString(runtimeContext, {
              sourceBranchCode: runtimeContext.sourceBranchCode,
              userRole: runtimeContext.userRole,
              take: 100,
            })}`,
          ),
        ]);

      setConfiguration(loadedConfiguration);
      setTerminals(loadedTerminals);
      setCheckouts(loadedCheckouts);
      setPayments(loadedPayments);
      setAuditEvents(loadedAudit);
      setPaymentForm((current) => ({
        ...current,
        terminalId:
          current.terminalId ||
          loadedTerminals.find(
            (terminal) => terminal.operationalStatus === 'ACTIVE',
          )?.id ||
          '',
      }));
      setConfigurationForm(
        loadedConfiguration
          ? {
              clientKey: loadedConfiguration.clientKey,
              accessToken: '',
              environment: loadedConfiguration.environment,
              active: loadedConfiguration.active,
              printReceipt: loadedConfiguration.printReceipt,
              operationTimeoutSeconds: loadedConfiguration.operationTimeoutSeconds,
              pollIntervalSeconds: loadedConfiguration.pollIntervalSeconds,
            }
          : EMPTY_CONFIGURATION_FORM,
      );
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'NÃO FOI POSSÍVEL CARREGAR A CONFIGURAÇÃO SUPERTEF.',
      });
    } finally {
      setLoading(false);
    }
  }, [apiQueryString, runtimeContext]);

  useEffect(() => {
    const syncTabFromUrl = () => {
      setActiveTab(normalizeTab(new URLSearchParams(window.location.search).get('aba')));
    };

    syncTabFromUrl();
    setIsMounted(true);
    window.addEventListener('popstate', syncTabFromUrl);
    return () => window.removeEventListener('popstate', syncTabFromUrl);
  }, []);

  useEffect(() => {
    if (!runtimeContext.embedded || window.parent === window) return;
    window.parent.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: EMBEDDED_SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectTab = (tabId: SuperTefTabId) => {
    setActiveTab(tabId);
    setFeedback(null);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('aba', tabId);
    window.history.replaceState(window.history.state, '', nextUrl);
  };

  const refreshAudit = async () => {
    const loadedAudit = await requestJson<SuperTefAuditEvent[]>(
      `/supertef/audit${buildFinanceApiQueryString(runtimeContext, {
        sourceBranchCode: runtimeContext.sourceBranchCode,
        userRole: runtimeContext.userRole,
        take: 100,
      })}`,
    );
    setAuditEvents(loadedAudit);
  };

  const saveConfiguration = async () => {
    setBusyAction('save-configuration');
    setFeedback(null);
    try {
      const saved = await requestJson<SuperTefConfiguration>(
        '/supertef/configuration',
        {
          method: 'PUT',
          body: JSON.stringify({
            ...mutationContext,
            companyName: runtimeContext.companyName,
            ...configurationForm,
            accessToken: configurationForm.accessToken || undefined,
          }),
        },
      );
      setConfiguration(saved);
      setConfigurationForm((current) => ({ ...current, accessToken: '' }));
      await refreshAudit();
      setFeedback({
        tone: 'success',
        text: 'CONFIGURAÇÃO SUPERTEF GRAVADA COM SEGURANÇA.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'NÃO FOI POSSÍVEL GRAVAR A CONFIGURAÇÃO.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const testConnection = async () => {
    setBusyAction('test-connection');
    setFeedback(null);
    try {
      const result = await requestJson<{ message: string }>(
        '/supertef/test-connection',
        {
          method: 'POST',
          body: JSON.stringify(mutationContext),
        },
      );
      await loadData();
      setFeedback({ tone: 'success', text: result.message });
    } catch (error) {
      await loadData();
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'FALHA NO TESTE DE CONEXÃO COM O SUPERTEF.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const syncTerminals = async () => {
    setBusyAction('sync-terminals');
    setFeedback(null);
    try {
      const result = await requestJson<{
        message: string;
        terminals: SuperTefTerminal[];
      }>('/supertef/terminals/sync', {
        method: 'POST',
        body: JSON.stringify(mutationContext),
      });
      setTerminals(result.terminals);
      await Promise.all([
        refreshAudit(),
        requestJson<SuperTefConfiguration | null>(
          `/supertef/configuration${apiQueryString}`,
        ).then(setConfiguration),
      ]);
      setFeedback({ tone: 'success', text: result.message });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'NÃO FOI POSSÍVEL SINCRONIZAR AS POS.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const changeTerminalStatus = async (terminal: SuperTefTerminal) => {
    const nextStatus =
      terminal.operationalStatus === 'ACTIVE' ? 'OUT_OF_SERVICE' : 'ACTIVE';
    setBusyAction(`terminal-${terminal.id}`);
    setFeedback(null);
    try {
      const saved = await requestJson<SuperTefTerminal>(
        `/supertef/terminals/${terminal.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...mutationContext,
            operationalStatus: nextStatus,
          }),
        },
      );
      setTerminals((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      await refreshAudit();
      setFeedback({
        tone: 'success',
        text:
          nextStatus === 'ACTIVE'
            ? 'MÁQUINA POS LIBERADA PARA ROTEAMENTO.'
            : 'MÁQUINA POS MARCADA COMO FORA DE SERVIÇO.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'NÃO FOI POSSÍVEL ALTERAR A SITUAÇÃO DA POS.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleCheckoutTerminal = (terminalId: string) => {
    setCheckoutForm((current) => ({
      ...current,
      terminalIds: current.terminalIds.includes(terminalId)
        ? current.terminalIds.filter((id) => id !== terminalId)
        : [...current.terminalIds, terminalId],
    }));
  };

  const moveCheckoutTerminal = (terminalId: string, direction: -1 | 1) => {
    setCheckoutForm((current) => {
      const index = current.terminalIds.indexOf(terminalId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.terminalIds.length) {
        return current;
      }
      const next = [...current.terminalIds];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return { ...current, terminalIds: next };
    });
  };

  const editCheckout = (checkout: SuperTefCheckout) => {
    setCheckoutForm({
      id: checkout.id,
      code: checkout.code,
      name: checkout.name,
      terminalIds: checkout.routes.map((route) => route.terminalId),
    });
    setFeedback({ tone: 'info', text: `EDITANDO O CHECKOUT ${checkout.code}.` });
  };

  const saveCheckout = async () => {
    setBusyAction('save-checkout');
    setFeedback(null);
    try {
      const endpoint = checkoutForm.id
        ? `/supertef/checkouts/${checkoutForm.id}`
        : '/supertef/checkouts';
      await requestJson<SuperTefCheckout>(endpoint, {
        method: checkoutForm.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...mutationContext,
          code: checkoutForm.code,
          name: checkoutForm.name,
          terminalIds: checkoutForm.terminalIds,
        }),
      });
      const loadedCheckouts = await requestJson<SuperTefCheckout[]>(
        `/supertef/checkouts${apiQueryString}`,
      );
      setCheckouts(loadedCheckouts);
      setCheckoutForm(EMPTY_CHECKOUT_FORM);
      await refreshAudit();
      setFeedback({
        tone: 'success',
        text: 'CHECKOUT E ROTEAMENTO GRAVADOS COM SUCESSO.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'NÃO FOI POSSÍVEL GRAVAR O CHECKOUT.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const inactivateCheckout = async (checkout: SuperTefCheckout) => {
    setBusyAction(`checkout-${checkout.id}`);
    setFeedback(null);
    try {
      await requestJson<{ message: string }>(
        `/supertef/checkouts/${checkout.id}/inactivate`,
        {
          method: 'POST',
          body: JSON.stringify(mutationContext),
        },
      );
      setCheckouts((current) => current.filter((item) => item.id !== checkout.id));
      if (checkoutForm.id === checkout.id) setCheckoutForm(EMPTY_CHECKOUT_FORM);
      await refreshAudit();
      setFeedback({ tone: 'success', text: 'CHECKOUT INATIVADO COM SUCESSO.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'NÃO FOI POSSÍVEL INATIVAR O CHECKOUT.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const createPayment = async () => {
    setBusyAction('create-payment');
    setFeedback(null);
    try {
      const operationId =
        globalThis.crypto?.randomUUID?.() ||
        `SUPERTEF-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const created = await requestJson<SuperTefPayment>('/supertef/payments', {
        method: 'POST',
        body: JSON.stringify({
          ...mutationContext,
          operationId,
          terminalId: paymentForm.terminalId,
          transactionType: paymentForm.transactionType,
          installmentCount:
            paymentForm.transactionType === 'DEBIT'
              ? 1
              : paymentForm.installmentCount,
          amount: paymentForm.amount,
          orderId: paymentForm.orderId,
          description: paymentForm.description,
        }),
      });
      setPayments((current) => [
        created,
        ...current.filter((payment) => payment.id !== created.id),
      ]);
      await refreshAudit();
      setFeedback({
        tone: 'success',
        text:
          created.paymentMessage ||
          'PAGAMENTO ENVIADO AO SUPERTEF PARA HOMOLOGAÇÃO.',
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'NÃO FOI POSSÍVEL SOLICITAR O PAGAMENTO NO SUPERTEF.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const refreshPayment = async (payment: SuperTefPayment, silent = false) => {
    if (!silent) {
      setBusyAction(`refresh-payment-${payment.id}`);
      setFeedback(null);
    }
    try {
      const updated = await requestJson<SuperTefPayment>(
        `/supertef/payments/${payment.id}/refresh`,
        {
          method: 'POST',
          body: JSON.stringify(mutationContext),
        },
      );
      setPayments((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (!silent) {
        await refreshAudit();
        setFeedback({
          tone: updated.status === 'PAID' ? 'success' : 'info',
          text: updated.paymentMessage || 'SITUAÇÃO DO PAGAMENTO ATUALIZADA.',
        });
      }
    } catch (error) {
      if (!silent) {
        setFeedback({
          tone: 'error',
          text:
            error instanceof Error
              ? error.message
              : 'NÃO FOI POSSÍVEL CONSULTAR O PAGAMENTO NO SUPERTEF.',
        });
      }
    } finally {
      if (!silent) setBusyAction(null);
    }
  };

  useEffect(() => {
    if (activeTab !== 'operacoes' || !configuration?.active) return;
    const pendingPayment = payments.find(
      (payment) =>
        payment.status === 'PENDING' &&
        Boolean(payment.providerPaymentUniqueId),
    );
    if (!pendingPayment) return;
    const timeout = window.setTimeout(() => {
      void refreshPayment(pendingPayment, true);
    }, Math.max(2, configuration.pollIntervalSeconds) * 1000);
    return () => window.clearTimeout(timeout);
  }, [activeTab, configuration, payments]);

  const configurationPanel = (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard label="Provedor" value="SUPERTEF" tone="blue" />
        <StatusCard
          label="Situação"
          value={configuration?.active ? 'ATIVA' : 'INATIVA'}
          tone={configuration?.active ? 'emerald' : 'amber'}
        />
        <StatusCard
          label="Credencial"
          value={
            configuration?.tokenConfigured
              ? `CONFIGURADA - ${configuration.tokenHint || 'PROTEGIDA'}`
              : 'NÃO CONFIGURADA'
          }
          tone={configuration?.tokenConfigured ? 'emerald' : 'amber'}
        />
        <StatusCard
          label="Última conexão"
          value={configuration?.lastConnectionStatus || 'NÃO TESTADA'}
          tone={
            configuration?.lastConnectionStatus === 'SUCCESS'
              ? 'emerald'
              : configuration?.lastConnectionStatus === 'ERROR'
                ? 'rose'
                : 'slate'
          }
        />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label>
            <span className={labelClass}>Chave do cliente SuperTEF</span>
            <input
              value={configurationForm.clientKey}
              onChange={(event) =>
                setConfigurationForm((current) => ({
                  ...current,
                  clientKey: event.target.value,
                }))
              }
              className={inputClass}
              placeholder="INFORME A CLIENTE_CHAVE"
              autoComplete="off"
            />
          </label>

          <label>
            <span className={labelClass}>
              Token da Software House
              {configuration?.tokenConfigured ? ' - deixe vazio para manter' : ''}
            </span>
            <input
              type="password"
              value={configurationForm.accessToken}
              onChange={(event) =>
                setConfigurationForm((current) => ({
                  ...current,
                  accessToken: event.target.value,
                }))
              }
              className={inputClass}
              placeholder={
                configuration?.tokenConfigured
                  ? 'TOKEN JÁ PROTEGIDO'
                  : 'INFORME O TOKEN BEARER'
              }
              autoComplete="new-password"
            />
          </label>

          <label>
            <span className={labelClass}>Ambiente operacional</span>
            <select
              value={configurationForm.environment}
              onChange={(event) =>
                setConfigurationForm((current) => ({
                  ...current,
                  environment: event.target.value as ConfigurationForm['environment'],
                }))
              }
              className={inputClass}
            >
              <option value="HOMOLOGATION">HOMOLOGAÇÃO / EMULADOR</option>
              <option value="PRODUCTION">PRODUÇÃO</option>
            </select>
          </label>

          <label>
            <span className={labelClass}>Tempo limite da operação</span>
            <input
              type="number"
              min={30}
              max={300}
              value={configurationForm.operationTimeoutSeconds}
              onChange={(event) =>
                setConfigurationForm((current) => ({
                  ...current,
                  operationTimeoutSeconds: Number(event.target.value),
                }))
              }
              className={inputClass}
            />
            <span className="mt-1 block text-[10px] font-semibold text-slate-500">
              ENTRE 30 E 300 SEGUNDOS
            </span>
          </label>

          <label>
            <span className={labelClass}>Intervalo de consulta</span>
            <input
              type="number"
              min={2}
              max={15}
              value={configurationForm.pollIntervalSeconds}
              onChange={(event) =>
                setConfigurationForm((current) => ({
                  ...current,
                  pollIntervalSeconds: Number(event.target.value),
                }))
              }
              className={inputClass}
            />
            <span className="mt-1 block text-[10px] font-semibold text-slate-500">
              PADRÃO RECOMENDADO: 4 SEGUNDOS
            </span>
          </label>

          <div>
            <span className={labelClass}>Parâmetros da integração</span>
            <div className="flex min-h-11 flex-col justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
              <label className="flex items-center gap-2 text-xs font-black text-slate-700">
                <input
                  type="checkbox"
                  checked={configurationForm.active}
                  onChange={(event) =>
                    setConfigurationForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-blue-600"
                />
                INTEGRAÇÃO ATIVA
              </label>
              <label className="flex items-center gap-2 text-xs font-black text-slate-700">
                <input
                  type="checkbox"
                  checked={configurationForm.printReceipt}
                  onChange={(event) =>
                    setConfigurationForm((current) => ({
                      ...current,
                      printReceipt: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-blue-600"
                />
                IMPRIMIR COMPROVANTE
              </label>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800">
          API OFICIAL FIXA: {configuration?.apiBaseUrl || 'https://api.supertef.com.br/api'}.
          O token é criptografado no backend e nunca retorna ao navegador.
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void saveConfiguration()}
            disabled={Boolean(busyAction)}
            className={primaryButtonClass}
          >
            {busyAction === 'save-configuration'
              ? 'Gravando...'
              : 'Gravar configuração'}
          </button>
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={!configuration || Boolean(busyAction)}
            className={secondaryButtonClass}
          >
            {busyAction === 'test-connection' ? 'Testando...' : 'Testar conexão'}
          </button>
        </div>
      </div>

      {configuration ? (
        <div className="grid gap-3 md:grid-cols-3">
          <StatusCard
            label="Teste realizado em"
            value={formatDateTime(configuration.lastConnectionTestAt)}
          />
          <StatusCard
            label="Última sincronização POS"
            value={formatDateTime(configuration.lastPosSyncAt)}
          />
          <StatusCard
            label="Retorno da conexão"
            value={configuration.lastConnectionMessage || 'NÃO TESTADA'}
          />
        </div>
      ) : null}
    </div>
  );

  const terminalsPanel = (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          <StatusCard label="POS sincronizadas" value={String(terminals.length)} tone="blue" />
          <StatusCard
            label="Disponíveis"
            value={String(
              terminals.filter((terminal) => terminal.operationalStatus === 'ACTIVE').length,
            )}
            tone="emerald"
          />
          <StatusCard
            label="Fora de serviço"
            value={String(
              terminals.filter(
                (terminal) => terminal.operationalStatus === 'OUT_OF_SERVICE',
              ).length,
            )}
            tone="amber"
          />
        </div>
        <button
          type="button"
          onClick={() => void syncTerminals()}
          disabled={!configuration?.active || Boolean(busyAction)}
          className={primaryButtonClass}
        >
          {busyAction === 'sync-terminals' ? 'Sincronizando...' : 'Sincronizar POS'}
        </button>
      </div>

      {!configuration?.active ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-amber-800">
          Grave e ative a configuração antes de sincronizar as máquinas.
        </div>
      ) : null}

      {terminals.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {terminals.map((terminal) => (
            <div
              key={terminal.id}
              className={`rounded-3xl border p-5 ${
                terminal.operationalStatus === 'ACTIVE'
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-amber-200 bg-amber-50/50'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
                    POS #{terminal.providerPosId}
                  </div>
                  <h3 className="mt-1 text-lg font-black text-slate-900">{terminal.name}</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {[terminal.bank, terminal.brand, terminal.model].filter(Boolean).join(' • ') ||
                      'BANCO E MODELO NÃO INFORMADOS PELO SUPERTEF'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                    terminal.operationalStatus === 'ACTIVE'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-white'
                  }`}
                >
                  {terminal.operationalStatus === 'ACTIVE'
                    ? 'Disponível'
                    : 'Fora de serviço'}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600">
                  VINCULADA: {terminal.activatedAt ? 'SIM' : 'AGUARDANDO CONFIRMAÇÃO'}
                </div>
                <div className="rounded-xl border border-white bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600">
                  CHECKOUTS VINCULADOS: {terminal.routeCount}
                </div>
                <div className="rounded-xl border border-white bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 sm:col-span-2">
                  ÚLTIMA SINCRONIZAÇÃO: {formatDateTime(terminal.lastSyncedAt)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void changeTerminalStatus(terminal)}
                disabled={Boolean(busyAction)}
                className={`mt-4 ${secondaryButtonClass}`}
              >
                {busyAction === `terminal-${terminal.id}`
                  ? 'Gravando...'
                  : terminal.operationalStatus === 'ACTIVE'
                    ? 'Marcar fora de serviço'
                    : 'Liberar máquina'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          eyebrow="Máquinas POS"
          title="Nenhuma SmartPOS sincronizada"
          description="Depois de gravar a credencial, use Sincronizar POS para importar as máquinas ativadas no cliente SuperTEF."
          items={[
            'IDENTIFICADOR SUPERTEF',
            'BANCO, MARCA E MODELO',
            'SITUAÇÃO OPERACIONAL LOCAL',
            'HISTÓRICO PRESERVADO',
          ]}
        />
      )}
    </div>
  );

  const routingPanel = (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
              {checkoutForm.id ? 'Editar checkout' : 'Novo checkout'}
            </div>
            <h2 className="mt-1 text-lg font-black text-slate-900">
              Identificação e ordem das máquinas
            </h2>
          </div>
          {checkoutForm.id ? (
            <button
              type="button"
              onClick={() => setCheckoutForm(EMPTY_CHECKOUT_FORM)}
              className={secondaryButtonClass}
            >
              Cancelar edição
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className={labelClass}>Código do checkout</span>
            <input
              value={checkoutForm.code}
              onChange={(event) =>
                setCheckoutForm((current) => ({
                  ...current,
                  code: event.target.value.toUpperCase(),
                }))
              }
              className={inputClass}
              placeholder="EX.: CAIXA 01"
            />
          </label>
          <label>
            <span className={labelClass}>Nome do checkout</span>
            <input
              value={checkoutForm.name}
              onChange={(event) =>
                setCheckoutForm((current) => ({
                  ...current,
                  name: event.target.value.toUpperCase(),
                }))
              }
              className={inputClass}
              placeholder="EX.: CHECKOUT FRENTE"
            />
          </label>
        </div>

        <div className="mt-4">
          <span className={labelClass}>Selecione as POS que este checkout poderá usar</span>
          {terminals.length ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {terminals.map((terminal) => {
                const selected = checkoutForm.terminalIds.includes(terminal.id);
                return (
                  <label
                    key={terminal.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleCheckoutTerminal(terminal.id)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-black">{terminal.name}</span>
                      <span className="block text-[10px] font-semibold uppercase text-slate-500">
                        POS #{terminal.providerPosId} •{' '}
                        {terminal.operationalStatus === 'ACTIVE'
                          ? 'DISPONÍVEL'
                          : 'FORA DE SERVIÇO'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
              SINCRONIZE PELO MENOS UMA POS ANTES DE CADASTRAR O CHECKOUT.
            </div>
          )}
        </div>

        {checkoutForm.terminalIds.length ? (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className={labelClass}>Ordem de tentativa</div>
            <div className="space-y-2">
              {checkoutForm.terminalIds.map((terminalId, index) => {
                const terminal = terminals.find((item) => item.id === terminalId);
                if (!terminal) return null;
                return (
                  <div
                    key={terminalId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white px-3 py-2"
                  >
                    <div className="text-xs font-black text-slate-800">
                      {index + 1}. {terminal.name}{' '}
                      <span className="font-semibold text-slate-500">
                        {index === 0 ? '— PREFERENCIAL' : '— ALTERNATIVA'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveCheckoutTerminal(terminalId, -1)}
                        disabled={index === 0}
                        className="h-8 w-9 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700 disabled:text-slate-300"
                        title="Subir prioridade"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCheckoutTerminal(terminalId, 1)}
                        disabled={index === checkoutForm.terminalIds.length - 1}
                        className="h-8 w-9 rounded-lg border border-slate-200 bg-white text-sm font-black text-slate-700 disabled:text-slate-300"
                        title="Descer prioridade"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void saveCheckout()}
          disabled={
            Boolean(busyAction) ||
            !checkoutForm.code.trim() ||
            !checkoutForm.name.trim() ||
            !checkoutForm.terminalIds.length
          }
          className={`mt-4 ${primaryButtonClass}`}
        >
          {busyAction === 'save-checkout'
            ? 'Gravando...'
            : checkoutForm.id
              ? 'Atualizar checkout'
              : 'Gravar checkout'}
        </button>
      </div>

      {checkouts.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {checkouts.map((checkout) => (
            <div key={checkout.id} className="rounded-3xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
                    {checkout.code}
                  </div>
                  <h3 className="mt-1 text-lg font-black text-slate-900">{checkout.name}</h3>
                </div>
                <span className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                  Ativo
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {checkout.routes.map((route) => (
                  <div
                    key={route.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="text-xs font-black text-slate-800">
                      {route.priority}. {route.terminal?.name || 'POS NÃO LOCALIZADA'}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      {route.priority === 1 ? 'PREFERENCIAL' : 'ALTERNATIVA'} •{' '}
                      {route.terminal?.operationalStatus === 'ACTIVE'
                        ? 'DISPONÍVEL'
                        : 'FORA DE SERVIÇO'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => editCheckout(checkout)}
                  disabled={Boolean(busyAction)}
                  className={secondaryButtonClass}
                >
                  Editar roteamento
                </button>
                <button
                  type="button"
                  onClick={() => void inactivateCheckout(checkout)}
                  disabled={Boolean(busyAction)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black uppercase tracking-[0.1em] text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  {busyAction === `checkout-${checkout.id}` ? 'Inativando...' : 'Inativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanel
          eyebrow="Checkouts e roteamento"
          title="Nenhum checkout vinculado"
          description="Cadastre cada checkout e ordene as máquinas. A primeira será a preferencial; as demais ficam como alternativas para contingência."
          items={[
            'POS PREFERENCIAL',
            'ALTERNATIVAS ORDENADAS',
            'COMPARTILHAMENTO EM CONTINGÊNCIA',
            'INATIVAÇÃO SEM EXCLUSÃO',
          ]}
        />
      )}
    </div>
  );

  const operationsPanel = (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <StatusCard
          label="Ambiente"
          value={
            configuration?.environment === 'HOMOLOGATION'
              ? 'HOMOLOGAÇÃO / EMULADOR'
              : 'PRODUÇÃO BLOQUEADA NESTE TESTE'
          }
          tone={
            configuration?.environment === 'HOMOLOGATION' ? 'emerald' : 'rose'
          }
        />
        <StatusCard
          label="Pagamentos em andamento"
          value={String(
            payments.filter((payment) =>
              ['PENDING_SEND', 'PENDING'].includes(payment.status),
            ).length,
          )}
          tone="amber"
        />
        <StatusCard
          label="Pagamentos aprovados"
          value={String(
            payments.filter((payment) => payment.status === 'PAID').length,
          )}
          tone="emerald"
        />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="mb-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
            Emissão de homologação
          </div>
          <h2 className="mt-1 text-lg font-black text-slate-900">
            Solicitar pagamento na SmartPOS
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            A POS fica bloqueada para novas cobranças até o SuperTEF devolver pago
            ou rejeitado.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label>
            <span className={labelClass}>Máquina POS</span>
            <select
              value={paymentForm.terminalId}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  terminalId: event.target.value,
                }))
              }
              className={inputClass}
            >
              <option value="">SELECIONE A POS</option>
              {terminals
                .filter((terminal) => terminal.operationalStatus === 'ACTIVE')
                .map((terminal) => (
                  <option key={terminal.id} value={terminal.id}>
                    {terminal.name} — POS {terminal.providerPosId}
                  </option>
                ))}
            </select>
          </label>

          <label>
            <span className={labelClass}>Modalidade</span>
            <select
              value={paymentForm.transactionType}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  transactionType: event.target
                    .value as PaymentForm['transactionType'],
                  installmentCount:
                    event.target.value === 'DEBIT'
                      ? 1
                      : current.installmentCount,
                }))
              }
              className={inputClass}
            >
              <option value="DEBIT">CARTÃO DÉBITO</option>
              <option value="CREDIT">CARTÃO CRÉDITO</option>
            </select>
          </label>

          <label>
            <span className={labelClass}>Valor</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={paymentForm.amount}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  amount: Number(event.target.value),
                }))
              }
              className={inputClass}
            />
          </label>

          <label>
            <span className={labelClass}>Parcelas</span>
            <input
              type="number"
              min={1}
              max={99}
              value={
                paymentForm.transactionType === 'DEBIT'
                  ? 1
                  : paymentForm.installmentCount
              }
              disabled={paymentForm.transactionType === 'DEBIT'}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  installmentCount: Number(event.target.value),
                }))
              }
              className={inputClass}
            />
          </label>

          <label>
            <span className={labelClass}>Pedido / referência</span>
            <input
              value={paymentForm.orderId}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  orderId: event.target.value,
                }))
              }
              className={inputClass}
              maxLength={100}
            />
          </label>

          <label>
            <span className={labelClass}>Descrição</span>
            <input
              value={paymentForm.description}
              onChange={(event) =>
                setPaymentForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className={inputClass}
              maxLength={200}
            />
          </label>
        </div>

        {!configuration?.active ||
        configuration?.environment !== 'HOMOLOGATION' ||
        !terminals.some(
          (terminal) => terminal.operationalStatus === 'ACTIVE',
        ) ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-amber-800">
            Ative a configuração em homologação, teste a conexão e sincronize ao
            menos uma POS antes de emitir.
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void createPayment()}
          disabled={
            Boolean(busyAction) ||
            !configuration?.active ||
            configuration?.environment !== 'HOMOLOGATION' ||
            !paymentForm.terminalId ||
            paymentForm.amount <= 0 ||
            !paymentForm.orderId.trim() ||
            !paymentForm.description.trim()
          }
          className={`mt-4 ${primaryButtonClass}`}
        >
          {busyAction === 'create-payment'
            ? 'Enviando...'
            : 'Solicitar pagamento'}
        </button>
      </div>

      {payments.length ? (
        <div className="space-y-3">
          {payments.map((payment) => {
            const statusClass =
              payment.status === 'PAID'
                ? 'bg-emerald-600'
                : payment.status === 'REJECTED' || payment.status === 'ERROR'
                  ? 'bg-rose-600'
                  : 'bg-amber-500';
            const statusLabel = {
              PENDING_SEND: 'PREPARANDO',
              PENDING: 'EM ANDAMENTO',
              PAID: 'PAGO',
              REJECTED: 'REJEITADO',
              ERROR: 'ERRO',
            }[payment.status];
            return (
              <div
                key={payment.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">
                      {payment.transactionType === 'DEBIT'
                        ? 'CARTÃO DÉBITO'
                        : 'CARTÃO CRÉDITO'}{' '}
                      • {payment.orderId}
                    </div>
                    <div className="mt-1 text-lg font-black text-slate-900">
                      {formatCurrency(payment.amount)}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">
                      {payment.terminalName || 'POS'} •{' '}
                      {payment.installmentCount} PARCELA(S) •{' '}
                      {formatDateTime(payment.requestedAt)}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white ${statusClass}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700">
                  {payment.paymentMessage || 'AGUARDANDO RETORNO DO SUPERTEF.'}
                  {payment.providerPaymentUniqueId
                    ? ` • ID SUPERTEF ${payment.providerPaymentUniqueId}`
                    : ''}
                </div>

                {payment.status === 'PAID' && payment.paymentData ? (
                  <div className="mt-3 grid gap-2 text-[10px] font-bold uppercase text-slate-600 sm:grid-cols-4">
                    <div>BANDEIRA: {payment.paymentData.brand || 'NÃO INFORMADA'}</div>
                    <div>NSU: {payment.paymentData.nsu || 'NÃO INFORMADO'}</div>
                    <div>
                      AUTORIZAÇÃO:{' '}
                      {payment.paymentData.authorizationCode || 'NÃO INFORMADA'}
                    </div>
                    <div>
                      ADQUIRENTE:{' '}
                      {payment.paymentData.acquirerBank || 'NÃO INFORMADA'}
                    </div>
                  </div>
                ) : null}

                {payment.status === 'PENDING' ? (
                  <button
                    type="button"
                    onClick={() => void refreshPayment(payment)}
                    disabled={Boolean(busyAction)}
                    className={`mt-3 ${secondaryButtonClass}`}
                  >
                    {busyAction === `refresh-payment-${payment.id}`
                      ? 'Consultando...'
                      : 'Atualizar status'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyPanel
          eyebrow="Operações"
          title="Nenhum pagamento emitido"
          description="Use o formulário acima para testar cartão de débito ou crédito no emulador SuperTEF."
          items={[
            'TRAVA EXCLUSIVA POR POS',
            'CONSULTA AUTOMÁTICA',
            'IDEMPOTÊNCIA',
            'AUDITORIA APPEND-ONLY',
          ]}
        />
      )}
    </div>
  );

  const auditPanel = auditEvents.length ? (
    <div className="space-y-3">
      {auditEvents.map((event) => (
        <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
                {event.entityType} • {event.action}
              </div>
              <div className="mt-1 text-sm font-black text-slate-800">{event.summary}</div>
            </div>
            <div className="text-right text-[10px] font-semibold uppercase text-slate-500">
              <div>{formatDateTime(event.occurredAt)}</div>
              <div>{event.performedBy || 'ADMIN_FINANCEIRO'}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <EmptyPanel
      eyebrow="Auditoria"
      title="Nenhum evento registrado"
      description="As gravações de configuração, testes, sincronizações e alterações de roteamento aparecerão aqui."
      items={[
        'CREDENCIAL SEM CONTEÚDO SECRETO',
        'EMPRESA E FILIAL',
        'USUÁRIO E DATA',
        'ANTES E DEPOIS PRESERVADOS',
      ]}
    />
  );

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm font-black text-slate-600">
          CARREGANDO CONFIGURAÇÃO SUPERTEF...
        </div>
      );
    }
    if (activeTab === 'configuracao') return configurationPanel;
    if (activeTab === 'maquinas') return terminalsPanel;
    if (activeTab === 'roteamento') return routingPanel;
    if (activeTab === 'auditoria') return auditPanel;
    if (activeTab === 'operacoes') return operationsPanel;
    return (
      <EmptyPanel
        eyebrow="Estornos"
        title="Pronta para a próxima etapa"
        description="A trilha de auditoria já está disponível. A operação de estorno será ligada depois do primeiro pagamento homologado no emulador."
        items={[
          'LOCALIZAR PAGAMENTO',
          'SOLICITAR ESTORNO',
          'ACOMPANHAR RETORNO',
          'NUNCA APAGAR O ORIGINAL',
        ]}
      />
    );
  }, [
    activeTab,
    auditPanel,
    configurationPanel,
    loading,
    operationsPanel,
    routingPanel,
    terminalsPanel,
  ]);

  if (!isMounted) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className={`${cardClass} px-8 py-6 text-center text-sm font-bold text-slate-600`}>
          CARREGANDO SUPERTEF...
        </div>
      </div>
    );
  }

  if (runtimeContext.userRole !== 'ADMIN') {
    return (
      <div className="space-y-6">
        <section className={`${cardClass} border-amber-200 p-8 text-center`}>
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-600">
            Acesso restrito
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900">SuperTEF</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Esta área está disponível somente para usuários com perfil ADMIN.
          </p>
        </section>
        {!runtimeContext.embedded ? (
          <section className={`${cardClass} px-6 py-4`}>
            <ScreenNameCopy
              screenId={screenId}
              className="justify-end"
              originText={ORIGIN_TEXT}
              auditText="Acesso negado porque o contexto atual não possui perfil ADMIN."
              sqlText="-- ESTA TELA NÃO CONSULTA DADOS QUANDO O ACESSO É NEGADO."
            />
          </section>
        ) : null}
      </div>
    );
  }

  const auditText = `Administração persistente da integração SuperTEF em tela única com abas.

Contexto operacional:
- sistema de origem: ${runtimeContext.sourceSystem || 'NÃO INFORMADO'}
- tenant de origem: ${runtimeContext.sourceTenantId || 'NÃO INFORMADO'}
- filial: ${runtimeContext.sourceBranchCode}
- aba atual: ${activeTabDefinition.label.toUpperCase()}
- perfil exigido: ADMIN

Regras aplicadas:
- isolamento por sourceSystem + sourceTenantId + sourceBranchCode
- token AES-256-GCM somente no backend e nunca devolvido ao navegador
- sincronização de POS pela API oficial https://api.supertef.com.br/api/pos
- checkout com POS preferencial e alternativas ordenadas
- máquina fora de serviço permanece no histórico e será ignorada no roteamento
- emissão de débito/crédito limitada à configuração HOMOLOGATION
- operação idempotente e bloqueio de uma cobrança simultânea por POS
- consulta automática do pagamento conforme pollIntervalSeconds
- toda mutação gera evento append-only em supertef_audit_events`;

  const sqlText = `-- CONFIGURAÇÃO SUPERTEF DA EMPRESA E FILIAL ATUAIS
SELECT
  c.sourceSystem,
  c.sourceTenantId,
  stc.branchCode,
  stc.provider,
  stc.status,
  stc.environment,
  stc.clientKey,
  stc.tokenFingerprint,
  stc.tokenHint,
  stc.printReceipt,
  stc.operationTimeoutSeconds,
  stc.pollIntervalSeconds,
  stc.lastConnectionStatus,
  stc.lastPosSyncAt
FROM supertef_configurations stc
INNER JOIN companies c ON c.id = stc.companyId
WHERE c.sourceSystem = '${runtimeContext.sourceSystem || ':sourceSystem'}'
  AND c.sourceTenantId = '${runtimeContext.sourceTenantId || ':sourceTenantId'}'
  AND stc.branchCode = ${runtimeContext.sourceBranchCode}
  AND stc.canceledAt IS NULL;

-- PAGAMENTOS SUPERTEF MAIS RECENTES
SELECT
  stp.operationId,
  stp.providerPaymentUniqueId,
  stp.providerPaymentStatus,
  stp.status,
  stp.transactionType,
  stp.installmentCount,
  stp.amount,
  stp.orderId,
  stp.paymentMessage,
  stp.requestedAt,
  stp.completedAt
FROM supertef_payments stp
INNER JOIN companies c ON c.id = stp.companyId
WHERE c.sourceSystem = '${runtimeContext.sourceSystem || ':sourceSystem'}'
  AND c.sourceTenantId = '${runtimeContext.sourceTenantId || ':sourceTenantId'}'
  AND stp.branchCode = ${runtimeContext.sourceBranchCode}
  AND stp.canceledAt IS NULL
ORDER BY stp.requestedAt DESC;

-- O CAMPO accessTokenEncrypted NÃO É EXIBIDO NEM DEVOLVIDO PELA API.`;

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white p-1 shadow-lg">
                  <img
                    src="/principal-financeiro/supertef.svg"
                    alt="SuperTEF"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                    MSINFOR
                  </div>
                  <h1 className="mt-1 text-2xl font-black tracking-tight">SuperTEF</h1>
                  <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                    Configuração e acompanhamento das operações de cartão do Financeiro.
                  </p>
                </div>
              </div>
              <Link
                href={`/msinfor${preservedQueryString}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/20"
              >
                Voltar para MSINFOR
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {feedback ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.06em] ${
            feedback.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : feedback.tone === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-200 bg-slate-50 px-3 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  title={tab.description}
                  className={`shrink-0 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] transition ${
                    isActive
                      ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-900/15'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          <div className="mb-5">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
              {activeTabDefinition.label}
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {activeTabDefinition.description}
            </p>
          </div>
          {content}
        </div>
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText={auditText}
            sqlText={sqlText}
          />
        </section>
      ) : null}
    </div>
  );
}
