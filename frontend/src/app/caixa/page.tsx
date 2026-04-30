'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { API_BASE_URL, getJson } from '@/app/lib/api';
import { formatCurrency, getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type CashSessionItem = {
  id: string;
  companyName?: string;
  cashierUserId: string;
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

const SCREEN_ID = 'FINANCEIRO_CAIXA_SESSOES_GERAL';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CAIXA';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '---';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

export default function FinanceiroCashPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [sessions, setSessions] = useState<CashSessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runtimeTenantReady = Boolean(runtimeContext.sourceTenantId);
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const canViewAllCashiers =
    runtimeContext.userRole === 'ADMIN' || runtimeContext.userRole === 'SOFTHOUSE_ADMIN';

  const loadSessions = useCallback(async () => {
    if (!runtimeTenantReady) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const queryParams = canViewAllCashiers
        ? undefined
        : { cashierUserId: runtimeContext.cashierUserId };

      let loadedSessions = await getJson<CashSessionItem[]>(
        `/cash-sessions${buildFinanceApiQueryString(runtimeContext, queryParams)}`,
      );

      const currentCashierHasOpenSession = loadedSessions.some(
        (session) =>
          session.status === 'OPEN' &&
          session.cashierUserId === runtimeContext.cashierUserId,
      );

      if (
        runtimeContext.sourceSystem &&
        runtimeContext.sourceTenantId &&
        runtimeContext.cashierUserId &&
        runtimeContext.cashierDisplayName &&
        !currentCashierHasOpenSession
      ) {
        const response = await fetch(`${API_BASE_URL}/cash-sessions/open`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceSystem: runtimeContext.sourceSystem,
            sourceTenantId: runtimeContext.sourceTenantId,
            cashierUserId: runtimeContext.cashierUserId,
            cashierDisplayName: runtimeContext.cashierDisplayName,
            openingAmount: 0,
          }),
        });

        if (response.ok) {
          loadedSessions = await getJson<CashSessionItem[]>(
            `/cash-sessions${buildFinanceApiQueryString(runtimeContext, queryParams)}`,
          );
        }
      }

      setSessions(loadedSessions);
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
  }, [canViewAllCashiers, runtimeContext, runtimeTenantReady]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!runtimeContext.embedded || typeof window === 'undefined') {
      return;
    }

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: EMBEDDED_SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  async function handleCloseSession(session: CashSessionItem) {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId || !session.cashierUserId) {
      setError('Não foi possível identificar a escola e o operador para fechar o caixa.');
      return;
    }

    try {
      setClosingSessionId(session.id);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/cash-sessions/close-current`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceSystem: runtimeContext.sourceSystem,
          sourceTenantId: runtimeContext.sourceTenantId,
          cashierUserId: session.cashierUserId,
          declaredClosingAmount: session.expectedClosingAmount,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || 'Não foi possível fechar o caixa.');
      }

      await loadSessions();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível fechar o caixa.',
        ),
      );
    } finally {
      setClosingSessionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Operação de caixa</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">Sessões de Caixa</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  Abra e feche caixas por operador e empresa de origem, mantendo o histórico financeiro centralizado.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar ao Menu
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
          </div>
        </section>
      ) : null}

      {error ? (
        <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      <section className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Operador</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Abertura</th>
                <th className="px-4 py-3">Fechamento</th>
                <th className="px-4 py-3">Recebido</th>
                <th className="px-4 py-3">Previsto</th>
                <th className="px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-4 font-semibold text-slate-700">{item.cashierDisplayName}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${item.status === 'OPEN' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                      {item.status === 'OPEN' ? 'ABERTO' : 'FECHADO'}
                    </span>
                  </td>
                  <td className="px-4 py-4">{formatDateTimeLabel(item.openedAt)}</td>
                  <td className="px-4 py-4">{formatDateTimeLabel(item.closedAt)}</td>
                  <td className="px-4 py-4 font-black text-slate-900">{formatCurrency(item.totalReceivedAmount)}</td>
                  <td className="px-4 py-4 font-black text-slate-900">{formatCurrency(item.expectedClosingAmount)}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/caixa/${item.id}${preservedQueryString}`}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100"
                      >
                        Detalhar
                      </Link>
                      {item.status === 'OPEN' ? (
                      <button
                        type="button"
                        disabled={closingSessionId === item.id}
                        onClick={() => void handleCloseSession(item)}
                        className="rounded-xl bg-slate-800 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-slate-900 disabled:opacity-60"
                      >
                        {closingSessionId === item.id ? 'Fechando...' : 'Fechar'}
                      </button>
                      ) : (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">---</span>
                      )}
                    </div>
                  </td>
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
