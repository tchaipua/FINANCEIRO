'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import { getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES';
const CUSTOMER_MODAL_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES_CADASTRO_MODAL';
const CUSTOMER_DETAILS_MODAL_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES_DETALHES_MODAL';
const CUSTOMER_STATUS_MODAL_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES_STATUS_MODAL';

type Customer = {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  origin: 'ESCOLA' | 'FINANCEIRO';
  canManageLocally: boolean;
  externalEntityType: string;
  externalEntityId: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  updatedAt: string;
};

type CustomersResponse = {
  sourceSystem: string;
  registrationMode: 'LOCAL' | 'INTEGRATED_ONLY';
  canCreateLocally: boolean;
  items: Customer[];
};

type CustomerForm = {
  name: string;
  document: string;
  email: string;
  phone: string;
  addressLine1: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
};

const EMPTY_FORM: CustomerForm = {
  name: '',
  document: '',
  email: '',
  phone: '',
  addressLine1: '',
  neighborhood: '',
  city: '',
  state: '',
  postalCode: '',
};

function formatDocument(value?: string | null) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return digits || 'SEM DOCUMENTO';
}

function formatDateTime(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '---';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function requestSchoolCustomersSync() {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `clientes-${Date.now()}-${Math.random()}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleResult);
      reject(new Error('A sincronização dos clientes da Escola demorou mais que o esperado.'));
    }, 30000);

    function handleResult(event: MessageEvent) {
      const payload = event.data;
      if (
        !payload ||
        payload.type !== 'MSINFOR_SYNC_FINANCIAL_CUSTOMERS_RESULT' ||
        payload.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener('message', handleResult);
      if (payload.ok) {
        resolve(payload);
      } else {
        reject(new Error(payload.message || 'Não foi possível sincronizar os clientes da Escola.'));
      }
    }

    window.addEventListener('message', handleResult);
    window.parent?.postMessage(
      { type: 'MSINFOR_SYNC_FINANCIAL_CUSTOMERS', requestId },
      '*',
    );
  });
}

export default function CustomersPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [items, setItems] = useState<Customer[]>([]);
  const [canCreateLocally, setCanCreateLocally] = useState(false);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [synchronizing, setSynchronizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [statusCustomer, setStatusCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const syncedScopeRef = useRef<string | null>(null);

  const isSchool = runtimeContext.sourceSystem === 'ESCOLA';
  const scopeReady = Boolean(runtimeContext.sourceSystem && runtimeContext.sourceTenantId);

  const loadCustomers = useCallback(async () => {
    if (!scopeReady) {
      setItems([]);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const query = buildFinanceApiQueryString(runtimeContext, {
        sourceBranchCode: runtimeContext.sourceBranchCode,
        status,
        search: appliedSearch || null,
      });
      const response = await requestJson<CustomersResponse>(`/customers${query}`);
      setItems(response.items || []);
      setCanCreateLocally(Boolean(response.canCreateLocally));
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(error, 'Não foi possível carregar os clientes.'),
      );
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, runtimeContext, scopeReady, status]);

  const synchronizeSchoolCustomers = useCallback(async (showSuccess = false) => {
    if (!isSchool || !runtimeContext.embedded) {
      await loadCustomers();
      return;
    }

    setSynchronizing(true);
    setErrorMessage(null);
    try {
      const result = await requestSchoolCustomersSync();
      if (showSuccess) {
        setSuccessMessage(
          String(result.message || 'Clientes da Escola sincronizados com sucesso.'),
        );
      }
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(
          error,
          'Não foi possível sincronizar os clientes da Escola.',
        ),
      );
    } finally {
      setSynchronizing(false);
      await loadCustomers();
    }
  }, [isSchool, loadCustomers, runtimeContext.embedded]);

  useEffect(() => {
    if (!scopeReady) return;
    const scopeKey = `${runtimeContext.sourceSystem}|${runtimeContext.sourceTenantId}|${runtimeContext.sourceBranchCode}`;
    if (isSchool && runtimeContext.embedded && syncedScopeRef.current !== scopeKey) {
      syncedScopeRef.current = scopeKey;
      void synchronizeSchoolCustomers(false);
      return;
    }
    void loadCustomers();
  }, [
    isSchool,
    loadCustomers,
    runtimeContext.embedded,
    runtimeContext.sourceBranchCode,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    scopeReady,
    synchronizeSchoolCustomers,
  ]);

  const auditContext = useMemo(() => {
    const search = appliedSearch.trim().toUpperCase();
    return {
      auditText: `--- LOGICA DA TELA ---
Tela híbrida de clientes do sistema Financeiro.

REGRAS:
- empresa/tenant: ${formatTenantAuditValue(runtimeContext.sourceTenantId, runtimeContext.companyName)}
- sistema origem: ${formatAuditValue(runtimeContext.sourceSystem)}
- filial: ${runtimeContext.sourceBranchCode}
- modo de cadastro: ${isSchool ? 'ORIGEM ESCOLA E LEGADOS VINCULADOS A TITULOS' : 'CADASTRO LOCAL NO FINANCEIRO'}
- status selecionado: ${status}
- busca aplicada: ${formatAuditValue(search)}
- registros exibidos: ${items.length}
- clientes da Escola e clientes legados vinculados a títulos não podem ser cadastrados ou alterados diretamente no Financeiro
- toda inativação é lógica e preserva os títulos e snapshots históricos`,
      sqlText: `SELECT PA.*
FROM parties PA
INNER JOIN companies CO ON CO.id = PA.companyId
WHERE CO.sourceSystem = ${toSqlLiteral(runtimeContext.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(runtimeContext.sourceTenantId || '')}
  AND PA.branchCode = ${Number(runtimeContext.sourceBranchCode || 1)}
  AND (${toSqlLiteral(status)} = 'ALL'
    OR (${toSqlLiteral(status)} = 'ACTIVE' AND PA.canceledAt IS NULL)
    OR (${toSqlLiteral(status)} = 'INACTIVE' AND PA.canceledAt IS NOT NULL))
  AND (${toSqlLiteral(search)} = ''
    OR UPPER(PA.name) LIKE '%' || ${toSqlLiteral(search)} || '%'
    OR COALESCE(PA.document, '') LIKE '%' || ${toSqlLiteral(search.replace(/\D+/g, ''))} || '%')
ORDER BY PA.name ASC;`,
    };
  }, [appliedSearch, isSchool, items.length, runtimeContext, status]);

  useEffect(() => {
    if (!runtimeContext.embedded) return;
    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
        auditText: auditContext.auditText,
        sqlText: auditContext.sqlText,
      },
      '*',
    );
  }, [auditContext.auditText, auditContext.sqlText, runtimeContext.embedded]);

  const openNewCustomer = () => {
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name || '',
      document: customer.document || '',
      email: customer.email || '',
      phone: customer.phone || '',
      addressLine1: customer.addressLine1 || '',
      neighborhood: customer.neighborhood || '',
      city: customer.city || '',
      state: customer.state || '',
      postalCode: customer.postalCode || '',
    });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingCustomer(null);
    setForm(EMPTY_FORM);
  };

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;

    setSaving(true);
    setErrorMessage(null);
    try {
      const payload = {
        ...form,
        sourceSystem: runtimeContext.sourceSystem,
        sourceTenantId: runtimeContext.sourceTenantId,
        sourceBranchCode: runtimeContext.sourceBranchCode,
        companyName: runtimeContext.companyName || undefined,
        requestedBy: runtimeContext.cashierUserId || 'OPERADOR_FINANCEIRO',
      };
      await requestJson<Customer>(
        editingCustomer ? `/customers/${editingCustomer.id}` : '/customers',
        {
          method: editingCustomer ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      setSuccessMessage(
        editingCustomer ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.',
      );
      closeEditor();
      await loadCustomers();
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(error, 'Não foi possível salvar o cliente.'),
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus() {
    if (!statusCustomer || !runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const action = statusCustomer.status === 'ACTIVE' ? 'inactivate' : 'activate';
      await requestJson<Customer>(`/customers/${statusCustomer.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          sourceBranchCode: runtimeContext.sourceBranchCode,
          requestedBy: runtimeContext.cashierUserId || 'OPERADOR_FINANCEIRO',
        }),
      });
      setSuccessMessage(
        statusCustomer.status === 'ACTIVE'
          ? 'Cliente inativado com sucesso.'
          : 'Cliente reativado com sucesso.',
      );
      setStatusCustomer(null);
      await loadCustomers();
    } catch (error) {
      setErrorMessage(
        getFriendlyRequestErrorMessage(error, 'Não foi possível alterar a situação do cliente.'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.shell}>
      <section className={FINANCE_GRID_PAGE_LAYOUT.card}>
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {runtimeContext.logoUrl ? (
                  <img src={runtimeContext.logoUrl} alt={runtimeContext.companyName || 'Empresa'} className="h-full w-full object-contain p-1.5" />
                ) : (
                  <img src="/logo-msinfor.jpg" alt="MSINFOR" className="h-full w-full object-cover" />
                )}
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">Contas a receber</div>
                <h1 className="mt-1 text-2xl font-black text-slate-900">Clientes</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {isSchool
                    ? 'Pagadores sincronizados da Escola e clientes vinculados aos títulos a receber.'
                    : 'Cadastre e mantenha os clientes utilizados nas vendas e contas a receber.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {isSchool ? (
                <button
                  type="button"
                  onClick={() => void synchronizeSchoolCustomers(true)}
                  disabled={synchronizing}
                  className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                >
                  {synchronizing ? 'Sincronizando...' : 'Sincronizar Escola'}
                </button>
              ) : canCreateLocally ? (
                <button type="button" onClick={openNewCustomer} className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>
                  Novo cliente
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-5 p-6">
          {isSchool ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm font-semibold text-blue-800">
              O cadastro oficial é mantido na Escola. A consulta também preserva clientes legados que já estejam vinculados a títulos; pagadores genéricos sem identificação não viram cadastro.
            </div>
          ) : null}

          {successMessage ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <span>{successMessage}</span>
              <button type="button" onClick={() => setSuccessMessage(null)} className="font-black">×</button>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              <span>{errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage(null)} className="font-black">×</button>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearch(searchInput.trim());
            }}
            className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 lg:grid-cols-[1fr_180px_auto]"
          >
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Buscar cliente</span>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value.toUpperCase())}
                placeholder="NOME, CPF/CNPJ, E-MAIL, TELEFONE OU CIDADE"
                className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Situação</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}>
                <option value="ACTIVE">ATIVOS</option>
                <option value="INACTIVE">INATIVOS</option>
                <option value="ALL">TODOS</option>
              </select>
            </label>
            <button type="submit" className={`${FINANCE_GRID_PAGE_LAYOUT.primaryButton} self-end`}>Pesquisar</button>
          </form>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">
                  <tr className="border-b border-slate-300">
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">CPF/CNPJ</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3">Cidade</th>
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading || synchronizing ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">{synchronizing ? 'Sincronizando clientes da Escola...' : 'Carregando clientes...'}</td></tr>
                  ) : items.length ? (
                    items.map((customer, index) => (
                      <tr key={customer.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-100/80'} transition-colors hover:bg-blue-100 hover:shadow-[inset_4px_0_0_#2563eb]`}>
                        <td className="px-4 py-4 align-top">
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${customer.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
                            {customer.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="font-black text-slate-900">{customer.name}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">ATUALIZADO EM {formatDateTime(customer.updatedAt)}</div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{formatDocument(customer.document)}</td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">
                          <div>{customer.phone || 'SEM TELEFONE'}</div>
                          <div className="mt-1 text-xs text-slate-500">{customer.email || 'SEM E-MAIL'}</div>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-semibold text-slate-700">{[customer.city, customer.state].filter(Boolean).join(' / ') || '---'}</td>
                        <td className="px-4 py-4 align-top">
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${customer.origin === 'ESCOLA' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>{customer.origin}</span>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setViewingCustomer(customer)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-50">Visualizar</button>
                            {customer.canManageLocally ? (
                              <>
                                <button type="button" onClick={() => openEditCustomer(customer)} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 hover:bg-blue-100">Editar</button>
                                <button type="button" onClick={() => setStatusCustomer(customer)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 hover:bg-amber-100">{customer.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}</button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">Nenhum cliente encontrado com os filtros atuais.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{items.length} cliente(s) no grid</div>
              <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" originText="Origem: Sistema Financeiro - frontend/src/app/clientes/page.tsx" auditText={auditContext.auditText} sqlText={auditContext.sqlText} />
            </div>
          </div>
        </div>
      </section>

      <AuditedPopupShell
        isOpen={canCreateLocally && editorOpen}
        screenId={CUSTOMER_MODAL_ID}
        title={editingCustomer ? 'Editar cliente' : 'Cadastrar cliente'}
        eyebrow="Cadastro local"
        description="Cadastro utilizado pelas vendas e pelo contas a receber desta empresa."
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={closeEditor}
        panelClassName="max-w-4xl"
      >
        <form onSubmit={saveCustomer} className="grid gap-4 md:grid-cols-2">
          {([
            ['name', 'Nome / razão social', 'md:col-span-2'],
            ['document', 'CPF / CNPJ', ''],
            ['phone', 'Telefone', ''],
            ['email', 'E-mail', 'md:col-span-2'],
            ['addressLine1', 'Endereço', 'md:col-span-2'],
            ['neighborhood', 'Bairro', ''],
            ['postalCode', 'CEP', ''],
            ['city', 'Cidade', ''],
            ['state', 'UF', ''],
          ] as const).map(([field, label, className]) => (
            <label key={field} className={className}>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
              <input
                required={field === 'name'}
                value={form[field]}
                onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value.toUpperCase() }))}
                className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}
              />
            </label>
          ))}
          <div className="md:col-span-2 flex justify-end gap-3 pt-3">
            <button type="button" onClick={closeEditor} className={FINANCE_GRID_PAGE_LAYOUT.secondaryButton}>Cancelar</button>
            <button type="submit" disabled={saving} className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>{saving ? 'Salvando...' : 'Salvar cliente'}</button>
          </div>
        </form>
      </AuditedPopupShell>

      <AuditedPopupShell
        isOpen={Boolean(viewingCustomer)}
        screenId={CUSTOMER_DETAILS_MODAL_ID}
        title="Detalhes do cliente"
        eyebrow={viewingCustomer?.origin === 'ESCOLA' ? 'Cadastro sincronizado' : 'Cadastro local'}
        description={viewingCustomer?.origin === 'ESCOLA' ? 'Os dados principais deste cliente são mantidos no sistema Escola.' : 'Cliente cadastrado diretamente no Financeiro.'}
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => setViewingCustomer(null)}
        panelClassName="max-w-3xl"
      >
        {viewingCustomer ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Cliente', viewingCustomer.name],
              ['CPF / CNPJ', formatDocument(viewingCustomer.document)],
              ['Telefone', viewingCustomer.phone || '---'],
              ['E-mail', viewingCustomer.email || '---'],
              ['Endereço', viewingCustomer.addressLine1 || '---'],
              ['Bairro', viewingCustomer.neighborhood || '---'],
              ['Cidade / UF', [viewingCustomer.city, viewingCustomer.state].filter(Boolean).join(' / ') || '---'],
              ['CEP', viewingCustomer.postalCode || '---'],
              ['Origem', viewingCustomer.origin],
              ['Situação', viewingCustomer.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
                <div className="mt-1 text-sm font-bold text-slate-800">{value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </AuditedPopupShell>

      <AuditedPopupShell
        isOpen={Boolean(statusCustomer)}
        screenId={CUSTOMER_STATUS_MODAL_ID}
        title={statusCustomer?.status === 'ACTIVE' ? 'Inativar cliente' : 'Reativar cliente'}
        eyebrow="Confirmação"
        description="A operação preserva todo o histórico financeiro do cliente."
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => setStatusCustomer(null)}
        panelClassName="max-w-xl"
        footerActions={
          <>
            <button type="button" onClick={() => setStatusCustomer(null)} className={FINANCE_GRID_PAGE_LAYOUT.secondaryButton}>Cancelar</button>
            <button type="button" onClick={() => void changeStatus()} disabled={saving} className={FINANCE_GRID_PAGE_LAYOUT.primaryButton}>{saving ? 'Confirmando...' : 'Confirmar'}</button>
          </>
        }
      >
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-amber-600">Cliente selecionado</div>
          <div className="mt-2 text-xl font-black text-slate-900">{statusCustomer?.name}</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">{formatDocument(statusCustomer?.document)}</div>
        </div>
      </AuditedPopupShell>
    </div>
  );
}
