'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { API_BASE_URL, getJson } from '@/app/lib/api';
import { formatCurrency, formatDateLabel, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import { buildFinanceQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type CashSessionItem = {
  id: string;
  companyName?: string;
  cashierDisplayName: string;
  status: string;
  sourceSystem: string;
  sourceTenantId: string;
  openingAmount: number;
  totalReceivedAmount: number;
  expectedClosingAmount: number;
  openedAt: string;
  closedAt?: string | null;
};

type OpenFormState = {
  sourceSystem: string;
  sourceTenantId: string;
  cashierUserId: string;
  cashierDisplayName: string;
  openingAmount: string;
  notes: string;
};

type CloseFormState = {
  sourceSystem: string;
  sourceTenantId: string;
  cashierUserId: string;
  declaredClosingAmount: string;
  notes: string;
};

const SCREEN_ID = 'FINANCEIRO_CAIXA_SESSOES_GERAL';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

function buildDefaultOpenForm(runtimeContext: ReturnType<typeof useFinanceRuntimeContext>): OpenFormState {
  return {
    sourceSystem: runtimeContext.sourceSystem || 'ESCOLA',
    sourceTenantId: runtimeContext.sourceTenantId || '',
    cashierUserId: runtimeContext.cashierUserId || '',
    cashierDisplayName: runtimeContext.cashierDisplayName || '',
    openingAmount: '',
    notes: '',
  };
}

function buildDefaultCloseForm(runtimeContext: ReturnType<typeof useFinanceRuntimeContext>): CloseFormState {
  return {
    sourceSystem: runtimeContext.sourceSystem || 'ESCOLA',
    sourceTenantId: runtimeContext.sourceTenantId || '',
    cashierUserId: runtimeContext.cashierUserId || '',
    declaredClosingAmount: '',
    notes: '',
  };
}

export default function FinanceiroCashPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const defaultOpenForm = useMemo(
    () => buildDefaultOpenForm(runtimeContext),
    [runtimeContext],
  );
  const defaultCloseForm = useMemo(
    () => buildDefaultCloseForm(runtimeContext),
    [runtimeContext],
  );

  const [sessions, setSessions] = useState<CashSessionItem[]>([]);
  const [openForm, setOpenForm] = useState<OpenFormState>(defaultOpenForm);
  const [closeForm, setCloseForm] = useState<CloseFormState>(defaultCloseForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingOpen, setIsSubmittingOpen] = useState(false);
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const embeddedContextReady = !runtimeContext.embedded || Boolean(
    openForm.sourceSystem && openForm.sourceTenantId && openForm.cashierUserId,
  );

  useEffect(() => {
    setOpenForm(defaultOpenForm);
  }, [defaultOpenForm]);

  useEffect(() => {
    setCloseForm(defaultCloseForm);
  }, [defaultCloseForm]);

  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSessions(
        await getJson<CashSessionItem[]>(
          `/cash-sessions${buildFinanceQueryString(runtimeContext)}`,
        ),
      );
    } catch (currentError) {
      setSessions([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar as sessões de caixa.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function handleOpenSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!embeddedContextReady) {
      setError('Não foi possível identificar a escola e o operador para abrir o caixa.');
      return;
    }

    try {
      setIsSubmittingOpen(true);
      setStatusMessage(null);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/cash-sessions/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceSystem: openForm.sourceSystem.trim().toUpperCase(),
          sourceTenantId: openForm.sourceTenantId.trim().toUpperCase(),
          cashierUserId: openForm.cashierUserId.trim().toUpperCase(),
          cashierDisplayName: openForm.cashierDisplayName.trim().toUpperCase(),
          openingAmount: openForm.openingAmount.trim()
            ? Number(openForm.openingAmount.replace(',', '.'))
            : undefined,
          notes: openForm.notes.trim() || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'Não foi possível abrir o caixa.');
      }

      setStatusMessage('Caixa aberto com sucesso no core financeiro.');
      setOpenForm(defaultOpenForm);
      await loadSessions();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível abrir o caixa.',
        ),
      );
    } finally {
      setIsSubmittingOpen(false);
    }
  }

  async function handleCloseSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!embeddedContextReady) {
      setError('Não foi possível identificar a escola e o operador para fechar o caixa.');
      return;
    }

    try {
      setIsSubmittingClose(true);
      setStatusMessage(null);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/cash-sessions/close-current`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceSystem: closeForm.sourceSystem.trim().toUpperCase(),
          sourceTenantId: closeForm.sourceTenantId.trim().toUpperCase(),
          cashierUserId: closeForm.cashierUserId.trim().toUpperCase(),
          declaredClosingAmount: closeForm.declaredClosingAmount.trim()
            ? Number(closeForm.declaredClosingAmount.replace(',', '.'))
            : undefined,
          notes: closeForm.notes.trim() || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'Não foi possível fechar o caixa.');
      }

      setStatusMessage('Caixa fechado com sucesso no core financeiro.');
      setCloseForm(defaultCloseForm);
      await loadSessions();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível fechar o caixa.',
        ),
      );
    } finally {
      setIsSubmittingClose(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Operação de caixa</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Sessões de Caixa</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
              {runtimeContext.embedded
                ? 'Abra e feche o caixa desta escola com o operador já identificado pelo sistema escolar.'
                : 'Abra e feche caixas por operador e empresa de origem, mantendo o histórico financeiro centralizado.'}
            </p>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
        </div>
      </section>

      {runtimeContext.embedded ? (
        <section className={`${cardClass} p-6`}>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Sistema</div>
              <div className="mt-2 text-base font-black text-slate-900">{openForm.sourceSystem || 'ESCOLA'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Tenant</div>
              <div className="mt-2 break-all text-base font-black text-slate-900">
                {openForm.sourceTenantId || 'NÃO IDENTIFICADO'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Operador atual</div>
              <div className="mt-2 text-base font-black text-slate-900">
                {openForm.cashierDisplayName || 'USUÁRIO NÃO IDENTIFICADO'}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {statusMessage ? (
        <section className={`${cardClass} border-emerald-200 bg-emerald-50 px-6 py-5 text-sm font-semibold text-emerald-700`}>
          {statusMessage}
        </section>
      ) : null}

      {error ? (
        <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleOpenSession} className={`${cardClass} p-6`}>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Abrir caixa</div>
          <h2 className="mt-1 text-xl font-black text-slate-900">Novo caixa operacional</h2>
          <div className="mt-5 grid gap-4">
            {!runtimeContext.embedded ? (
              <>
                <input
                  value={openForm.sourceSystem}
                  onChange={(event) => setOpenForm((current) => ({ ...current, sourceSystem: event.target.value }))}
                  className={inputClass}
                  placeholder="SISTEMA ORIGEM"
                />
                <input
                  value={openForm.sourceTenantId}
                  onChange={(event) => setOpenForm((current) => ({ ...current, sourceTenantId: event.target.value }))}
                  className={inputClass}
                  placeholder="TENANT DE ORIGEM"
                />
                <input
                  value={openForm.cashierUserId}
                  onChange={(event) => setOpenForm((current) => ({ ...current, cashierUserId: event.target.value }))}
                  className={inputClass}
                  placeholder="ID DO OPERADOR"
                />
                <input
                  value={openForm.cashierDisplayName}
                  onChange={(event) => setOpenForm((current) => ({ ...current, cashierDisplayName: event.target.value }))}
                  className={inputClass}
                  placeholder="NOME DO OPERADOR"
                />
              </>
            ) : null}
            <input
              value={openForm.openingAmount}
              onChange={(event) => setOpenForm((current) => ({ ...current, openingAmount: event.target.value }))}
              className={inputClass}
              placeholder="VALOR DE ABERTURA"
            />
            <input
              value={openForm.notes}
              onChange={(event) => setOpenForm((current) => ({ ...current, notes: event.target.value }))}
              className={inputClass}
              placeholder="OBSERVAÇÃO"
            />
            <button
              type="submit"
              disabled={isSubmittingOpen || !embeddedContextReady}
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-70"
            >
              {isSubmittingOpen ? 'Abrindo...' : 'Abrir caixa'}
            </button>
          </div>
        </form>

        <form onSubmit={handleCloseSession} className={`${cardClass} p-6`}>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Fechar caixa</div>
          <h2 className="mt-1 text-xl font-black text-slate-900">Encerrar sessão atual</h2>
          <div className="mt-5 grid gap-4">
            {!runtimeContext.embedded ? (
              <>
                <input
                  value={closeForm.sourceSystem}
                  onChange={(event) => setCloseForm((current) => ({ ...current, sourceSystem: event.target.value }))}
                  className={inputClass}
                  placeholder="SISTEMA ORIGEM"
                />
                <input
                  value={closeForm.sourceTenantId}
                  onChange={(event) => setCloseForm((current) => ({ ...current, sourceTenantId: event.target.value }))}
                  className={inputClass}
                  placeholder="TENANT DE ORIGEM"
                />
                <input
                  value={closeForm.cashierUserId}
                  onChange={(event) => setCloseForm((current) => ({ ...current, cashierUserId: event.target.value }))}
                  className={inputClass}
                  placeholder="ID DO OPERADOR"
                />
              </>
            ) : null}
            <input
              value={closeForm.declaredClosingAmount}
              onChange={(event) => setCloseForm((current) => ({ ...current, declaredClosingAmount: event.target.value }))}
              className={inputClass}
              placeholder="VALOR DECLARADO NO FECHAMENTO"
            />
            <input
              value={closeForm.notes}
              onChange={(event) => setCloseForm((current) => ({ ...current, notes: event.target.value }))}
              className={inputClass}
              placeholder="OBSERVAÇÃO"
            />
            <button
              type="submit"
              disabled={isSubmittingClose || !embeddedContextReady}
              className="rounded-2xl bg-slate-800 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-slate-800/20 transition hover:bg-slate-900 disabled:opacity-70"
            >
              {isSubmittingClose ? 'Fechando...' : 'Fechar caixa'}
            </button>
          </div>
        </form>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Histórico operacional</div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {isLoading ? 'Carregando...' : `${sessions.length} sessão(ões) encontrada(s)`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Operador</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Abertura</th>
                <th className="px-4 py-3">Recebido</th>
                <th className="px-4 py-3">Previsto</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-4 font-black text-slate-900">{item.companyName || 'EMPRESA'}</td>
                  <td className="px-4 py-4 font-semibold text-slate-700">{item.cashierDisplayName}</td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-slate-700">{item.sourceSystem}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {item.sourceTenantId}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${item.status === 'OPEN' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                      {item.status === 'OPEN' ? 'ABERTO' : 'FECHADO'}
                    </span>
                  </td>
                  <td className="px-4 py-4">{formatDateLabel(item.openedAt)}</td>
                  <td className="px-4 py-4 font-black text-slate-900">{formatCurrency(item.totalReceivedAmount)}</td>
                  <td className="px-4 py-4 font-black text-slate-900">{formatCurrency(item.expectedClosingAmount)}</td>
                </tr>
              ))}

              {!isLoading && !sessions.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhuma sessão de caixa foi localizada até o momento.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
