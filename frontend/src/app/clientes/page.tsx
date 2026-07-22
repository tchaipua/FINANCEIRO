'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import GridExportModal from '@/app/components/grid-export-modal';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import {
  formatBrazilTaxId,
  normalizeBrazilTaxId,
  normalizeBrazilTaxIdInput,
} from '@/app/lib/brazil-tax-id';
import { getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
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
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES';
const CUSTOMER_MODAL_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES_CADASTRO_MODAL';
const CUSTOMER_DETAILS_MODAL_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES_DETALHES_MODAL';
const CUSTOMER_STATUS_MODAL_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES_STATUS_MODAL';
const CUSTOMER_COLUMNS_MODAL_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES_COLUNAS_MODAL';
const CUSTOMER_EXPORT_MODAL_ID = 'PRINCIPAL_FINANCEIRO_CLIENTES_EXPORTACAO_MODAL';

type Customer = {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  origin: 'ESCOLA' | 'FINANCEIRO';
  canManageLocally: boolean;
  externalEntityType: string;
  externalEntityId: string;
  name: string;
  document?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  stateRegistrationIndicator?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  cityCode?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  updatedAt: string;
};

type CustomersResponse = {
  sourceSystem: string;
  registrationMode: 'LOCAL' | 'INTEGRATED_ONLY';
  canCreateLocally: boolean;
  items: Customer[];
};

type CustomerGridColumnKey = 'name' | 'document' | 'contact' | 'city' | 'origin';
type CustomerExportColumnKey = CustomerGridColumnKey | 'status' | 'updatedAt';

type CustomerForm = {
  name: string;
  document: string;
  stateRegistration: string;
  municipalRegistration: string;
  stateRegistrationIndicator: string;
  email: string;
  phone: string;
  addressLine1: string;
  street: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  cityCode: string;
  state: string;
  postalCode: string;
  countryCode: string;
  countryName: string;
};

const EMPTY_FORM: CustomerForm = {
  name: '',
  document: '',
  stateRegistration: '',
  municipalRegistration: '',
  stateRegistrationIndicator: '9',
  email: '',
  phone: '',
  addressLine1: '',
  street: '',
  addressNumber: '',
  addressComplement: '',
  neighborhood: '',
  city: '',
  cityCode: '',
  state: '',
  postalCode: '',
  countryCode: '1058',
  countryName: 'BRASIL',
};

function formatDocument(value?: string | null) {
  return formatBrazilTaxId(value);
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

const CUSTOMER_GRID_COLUMNS: Array<{ key: CustomerGridColumnKey; label: string }> = [
  { key: 'name', label: 'Cliente' },
  { key: 'document', label: 'CPF/CNPJ' },
  { key: 'contact', label: 'Contato' },
  { key: 'city', label: 'Cidade' },
  { key: 'origin', label: 'Origem' },
];

const CUSTOMER_EXPORT_COLUMNS: GridColumnDefinition<Customer, CustomerExportColumnKey>[] = [
  { key: 'name', label: 'Cliente', getValue: (customer) => customer.name },
  { key: 'document', label: 'CPF/CNPJ', getValue: (customer) => formatDocument(customer.document) },
  { key: 'contact', label: 'Contato', getValue: (customer) => [customer.phone, customer.email].filter(Boolean).join(' / ') || '---' },
  { key: 'city', label: 'Cidade', getValue: (customer) => [customer.city, customer.state].filter(Boolean).join(' / ') || '---' },
  { key: 'origin', label: 'Origem', getValue: (customer) => customer.origin },
  { key: 'status', label: 'Situação', getValue: (customer) => customer.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO' },
  { key: 'updatedAt', label: 'Atualizado em', getValue: (customer) => formatDateTime(customer.updatedAt) },
];

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
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [hiddenColumns, setHiddenColumns] = useState<CustomerGridColumnKey[]>([]);
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<CustomerExportColumnKey, boolean>>(
    buildDefaultExportColumns(CUSTOMER_EXPORT_COLUMNS),
  );
  const syncedScopeRef = useRef<string | null>(null);

  const isSchool = runtimeContext.sourceSystem === 'ESCOLA';
  const scopeReady = Boolean(runtimeContext.sourceSystem && runtimeContext.sourceTenantId);
  const visibleGridColumns = useMemo(
    () => CUSTOMER_GRID_COLUMNS.filter((column) => !hiddenColumns.includes(column.key)),
    [hiddenColumns],
  );
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const normalizedCurrentPage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(
    () => items.slice((normalizedCurrentPage - 1) * pageSize, normalizedCurrentPage * pageSize),
    [items, normalizedCurrentPage, pageSize],
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), totalPages));
  }, [totalPages]);

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
    OR COALESCE(PA.document, '') LIKE '%' || ${toSqlLiteral(normalizeBrazilTaxId(search))} || '%')
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
      stateRegistration: customer.stateRegistration || '',
      municipalRegistration: customer.municipalRegistration || '',
      stateRegistrationIndicator: customer.stateRegistrationIndicator || '9',
      email: customer.email || '',
      phone: customer.phone || '',
      addressLine1: customer.addressLine1 || '',
      street: customer.street || '',
      addressNumber: customer.addressNumber || '',
      addressComplement: customer.addressComplement || '',
      neighborhood: customer.neighborhood || '',
      city: customer.city || '',
      cityCode: customer.cityCode || '',
      state: customer.state || '',
      postalCode: customer.postalCode || '',
      countryCode: customer.countryCode || '1058',
      countryName: customer.countryName || 'BRASIL',
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
        document: normalizeBrazilTaxId(form.document) || undefined,
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
    <div className="flex h-[calc(100vh-1rem)] min-h-[520px] flex-col gap-4">
      {!runtimeContext.embedded ? (
        <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} shrink-0 px-6 py-5`}>
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
        </section>
      ) : null}

      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} shrink-0 p-4`}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCurrentPage(1);
            setAppliedSearch(searchInput.trim());
          }}
          className="flex items-center gap-3"
        >
          {!isSchool && canCreateLocally ? (
            <button
              type="button"
              onClick={openNewCustomer}
              title="Incluir novo cliente"
              aria-label="Incluir novo cliente"
              className={`${FINANCE_GRID_PAGE_LAYOUT.iconButton} h-11 w-11 shrink-0 text-2xl font-black`}
            >
              +
            </button>
          ) : null}
          {isSchool ? (
            <button
              type="button"
              onClick={() => void synchronizeSchoolCustomers(true)}
              disabled={synchronizing}
              title="Sincronizar clientes da Escola"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
            >
              <svg className={`h-4 w-4 ${synchronizing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6v5h-5M4 18v-5h5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M18.5 9A7 7 0 0 0 6.6 6.6L4 9M5.5 15A7 7 0 0 0 17.4 17.4L20 15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {synchronizing ? 'Sincronizando' : 'Sincronizar Escola'}
            </button>
          ) : null}
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value.toUpperCase())}
            placeholder="PESQUISAR NOME, CPF/CNPJ, E-MAIL, TELEFONE OU CIDADE"
            aria-label="Pesquisar clientes"
            className={`${FINANCE_GRID_PAGE_LAYOUT.input} h-11 min-w-0 flex-1 py-2.5`}
          />
          <button
            type="submit"
            title="Pesquisar clientes"
            aria-label="Pesquisar clientes"
            className={`${FINANCE_GRID_PAGE_LAYOUT.iconButton} h-11 w-11 shrink-0`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
          </button>
        </form>

        {successMessage ? (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
            <span>{successMessage}</span>
            <button type="button" onClick={() => setSuccessMessage(null)} className="font-black" aria-label="Fechar mensagem">×</button>
          </div>
        ) : null}
        {errorMessage ? (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
            <span>{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="font-black" aria-label="Fechar mensagem">×</button>
          </div>
        ) : null}
      </section>

      <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_rgba(226,232,240,1)]">
              <tr>
                {visibleGridColumns.map((column) => (
                  <th key={column.key} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    {column.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading || synchronizing ? (
                <tr>
                  <td colSpan={visibleGridColumns.length + 1} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    {synchronizing ? 'Sincronizando clientes da Escola...' : 'Carregando clientes...'}
                  </td>
                </tr>
              ) : paginatedItems.length ? (
                paginatedItems.map((customer, index) => {
                  const isSelected = selectedCustomerId === customer.id;
                  const zebraClass = customer.status === 'ACTIVE'
                    ? index % 2 ? 'bg-slate-200/70' : 'bg-white'
                    : index % 2 ? 'bg-rose-200/70' : 'bg-rose-100/80';

                  return (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      aria-selected={isSelected}
                      className={`cursor-pointer transition hover:bg-blue-50 ${isSelected ? 'bg-blue-100 ring-2 ring-inset ring-blue-300' : zebraClass}`}
                    >
                      {visibleGridColumns.map((column) => {
                        if (column.key === 'name') {
                          return (
                            <td key={column.key} className="px-4 py-3 align-middle">
                              <div className="flex items-center gap-2 font-black text-slate-900">
                                <span
                                  className={`h-3 w-3 shrink-0 rounded-full ${customer.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                  title={customer.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'}
                                  aria-label={customer.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'}
                                />
                                <span>{customer.name}</span>
                              </div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">ATUALIZADO EM {formatDateTime(customer.updatedAt)}</div>
                            </td>
                          );
                        }
                        if (column.key === 'document') {
                          return <td key={column.key} className="px-4 py-3 align-middle text-sm font-semibold text-slate-700">{formatDocument(customer.document)}</td>;
                        }
                        if (column.key === 'contact') {
                          return (
                            <td key={column.key} className="px-4 py-3 align-middle text-sm font-semibold text-slate-700">
                              <div>{customer.phone || 'SEM TELEFONE'}</div>
                              <div className="mt-1 text-xs text-slate-500">{customer.email || 'SEM E-MAIL'}</div>
                            </td>
                          );
                        }
                        if (column.key === 'city') {
                          return <td key={column.key} className="px-4 py-3 align-middle text-sm font-semibold text-slate-700">{[customer.city, customer.state].filter(Boolean).join(' / ') || '---'}</td>;
                        }
                        return (
                          <td key={column.key} className="px-4 py-3 align-middle">
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${customer.origin === 'ESCOLA' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>
                              {customer.origin}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); setViewingCustomer(customer); }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                            title="Visualizar cliente"
                            aria-label={`Visualizar cliente ${customer.name}`}
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                              <circle cx="12" cy="12" r="2.5" />
                            </svg>
                          </button>
                          {customer.canManageLocally ? (
                            <>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); openEditCustomer(customer); }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition hover:bg-blue-100 hover:text-blue-800"
                                title="Editar cliente"
                                aria-label={`Editar cliente ${customer.name}`}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); setStatusCustomer(customer); }}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${customer.status === 'ACTIVE' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-800' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800'}`}
                                title={customer.status === 'ACTIVE' ? 'Inativar cliente' : 'Reativar cliente'}
                                aria-label={`${customer.status === 'ACTIVE' ? 'Inativar' : 'Reativar'} cliente ${customer.name}`}
                              >
                                {customer.status === 'ACTIVE' ? '⊘' : '↺'}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={visibleGridColumns.length + 1} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum cliente encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <GridStandardFooter
          statusFilter={status as GridStatusFilterValue}
          totalRecords={items.length}
          pageSize={pageSize}
          currentPage={normalizedCurrentPage}
          totalPages={totalPages}
          typographyVariant="school"
          onColumnSettings={() => setColumnsModalOpen(true)}
          onExport={() => setExportModalOpen(true)}
          onStatusFilterChange={(value) => { setCurrentPage(1); setStatus(value); }}
          onPageSizeChange={(value) => { setPageSize(value); setCurrentPage(1); }}
          onPageChange={setCurrentPage}
        >
          {!runtimeContext.embedded ? (
            <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" originText="Origem: Sistema Financeiro - frontend/src/app/clientes/page.tsx" auditText={auditContext.auditText} sqlText={auditContext.sqlText} />
          ) : null}
        </GridStandardFooter>
      </section>

      {columnsModalOpen ? (
        <div data-system-message-root>
          <AuditedPopupShell
            isOpen
            screenId={CUSTOMER_COLUMNS_MODAL_ID}
            title="Alterar colunas do grid"
            eyebrow="Configuração do grid"
            description="Escolha quais informações devem permanecer visíveis na listagem de clientes."
            brandingName={runtimeContext.companyName}
            logoUrl={runtimeContext.logoUrl}
            originText="Origem: Sistema Financeiro - frontend/src/app/clientes/page.tsx"
            auditText="Configuração visual local das colunas do grid de clientes. Não altera dados financeiros."
            sqlText="-- Configuração visual do grid; nenhuma consulta SQL adicional é executada."
            onClose={() => setColumnsModalOpen(false)}
            panelClassName="max-w-2xl" headerTheme="blue" footerScreenIdCompact
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {CUSTOMER_GRID_COLUMNS.map((column) => {
                const visible = !hiddenColumns.includes(column.key);
                const required = column.key === 'name';
                return (
                  <button
                    key={column.key}
                    type="button"
                    disabled={required}
                    onClick={() => setHiddenColumns((current) => visible ? [...current, column.key] : current.filter((key) => key !== column.key))}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition ${visible ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'} disabled:cursor-not-allowed disabled:opacity-80`}
                  >
                    <span className="text-sm font-black uppercase tracking-[0.1em]">{column.label}</span>
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-white ${visible ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                      {visible ? '✓' : '×'}
                    </span>
                  </button>
                );
              })}
            </div>
          </AuditedPopupShell>
        </div>
      ) : null}

      {exportModalOpen ? (
        <div data-system-message-root>
          <GridExportModal
            isOpen
            title="Exportar clientes"
            description={`A exportação respeita os filtros atuais e inclui ${items.length} registro(s).`}
            format={exportFormat}
            onFormatChange={setExportFormat}
            columns={CUSTOMER_EXPORT_COLUMNS.map((column) => ({ key: column.key, label: column.label }))}
            selectedColumns={exportColumns}
            storageKey={`financeiro:clientes:export:${runtimeContext.sourceTenantId || 'sem-tenant'}`}
            brandingName={runtimeContext.companyName}
            brandingLogoUrl={runtimeContext.logoUrl}
            blueHeader
            onClose={() => setExportModalOpen(false)}
            onExport={async (config) => {
              try {
                await exportGridRows({
                  rows: items,
                  columns: config.orderedColumns
                    .map((key) => CUSTOMER_EXPORT_COLUMNS.find((column) => column.key === key))
                    .filter((column): column is GridColumnDefinition<Customer, CustomerExportColumnKey> => Boolean(column)),
                  selectedColumns: config.selectedColumns,
                  format: exportFormat,
                  fileBaseName: 'clientes',
                  branding: {
                    title: 'Clientes',
                    subtitle: 'Exportação com os filtros atualmente aplicados.',
                    schoolName: runtimeContext.companyName || 'FINANCEIRO',
                    logoUrl: runtimeContext.logoUrl,
                  },
                  pdfOptions: config.pdfOptions,
                });
                setExportColumns(config.selectedColumns);
                setExportModalOpen(false);
              } catch (error) {
                setErrorMessage(getFriendlyRequestErrorMessage(error, 'Não foi possível exportar os clientes.'));
              }
            }}
          />
        </div>
      ) : null}

      <AuditedPopupShell
        isOpen={canCreateLocally && editorOpen}
        screenId={CUSTOMER_MODAL_ID}
        title={editingCustomer ? 'Editar cliente' : 'Cadastrar cliente'}
        eyebrow="Cadastro local"
        description="Cadastro utilizado pelas vendas e pelo contas a receber desta empresa."
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={closeEditor}
        panelClassName="max-w-4xl" headerTheme="blue" footerScreenIdCompact
      >
        <form onSubmit={saveCustomer} className="grid gap-4 md:grid-cols-2">
          {([
            ['name', 'Nome / razão social', 'md:col-span-2'],
            ['document', 'CPF / CNPJ', ''],
            ['stateRegistration', 'Inscrição estadual', ''],
            ['stateRegistrationIndicator', 'Indicador IE (1, 2 ou 9)', ''],
            ['municipalRegistration', 'Inscrição municipal', ''],
            ['phone', 'Telefone', ''],
            ['email', 'E-mail', 'md:col-span-2'],
            ['street', 'Logradouro fiscal', ''],
            ['addressNumber', 'Número', ''],
            ['addressComplement', 'Complemento', ''],
            ['neighborhood', 'Bairro', ''],
            ['postalCode', 'CEP', ''],
            ['city', 'Cidade', ''],
            ['cityCode', 'Código IBGE do município', ''],
            ['state', 'UF', ''],
            ['countryCode', 'Código do país', ''],
            ['countryName', 'País', ''],
            ['addressLine1', 'Endereço completo legado', 'md:col-span-2'],
          ] as const).map(([field, label, className]) => (
            <label key={field} className={className}>
              <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
              <input
                required={field === 'name'}
                value={form[field]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [field]:
                      field === 'document'
                        ? normalizeBrazilTaxIdInput(event.target.value)
                        : event.target.value.toUpperCase(),
                  }))
                }
                className={`${FINANCE_GRID_PAGE_LAYOUT.input} w-full`}
              />
            </label>
          ))}
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900 md:col-span-2">
            Para NF-e, informe logradouro, número, bairro, município, código IBGE, UF e CEP.
            Consumidor sem inscrição estadual usa indicador 9.
          </div>
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
        panelClassName="max-w-3xl" headerTheme="blue" footerScreenIdCompact
      >
        {viewingCustomer ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Cliente', viewingCustomer.name],
              ['CPF / CNPJ', formatDocument(viewingCustomer.document)],
              ['Inscrição estadual', viewingCustomer.stateRegistration || '---'],
              ['Indicador IE', viewingCustomer.stateRegistrationIndicator || '9'],
              ['Telefone', viewingCustomer.phone || '---'],
              ['E-mail', viewingCustomer.email || '---'],
              [
                'Endereço',
                [
                  viewingCustomer.street || viewingCustomer.addressLine1,
                  viewingCustomer.addressNumber,
                  viewingCustomer.addressComplement,
                ]
                  .filter(Boolean)
                  .join(', ') || '---',
              ],
              ['Bairro', viewingCustomer.neighborhood || '---'],
              [
                'Cidade / UF / IBGE',
                [
                  viewingCustomer.city,
                  viewingCustomer.state,
                  viewingCustomer.cityCode,
                ]
                  .filter(Boolean)
                  .join(' / ') || '---',
              ],
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
        panelClassName="max-w-xl" headerTheme="blue" footerScreenIdCompact
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
