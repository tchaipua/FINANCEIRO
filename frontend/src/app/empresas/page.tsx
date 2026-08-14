'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, requestJson } from '@/app/lib/api';
import { getFriendlyRequestErrorMessage } from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import {
  isTrustedMessageEvent,
  postMessageToTrustedParent,
} from '@/app/lib/trusted-messaging';

type Company = { id: string; name: string };
type Branch = { id: string; branchCode: number; name: string };
type EditorScope = { companyId: string; branchId: string; query: string };

const CENTRAL_CLOSED_MESSAGE = 'MSINFOR_CENTRAL_COMPANY_DIRECTORY_CLOSED';
const CENTRAL_SAVED_MESSAGE = 'MSINFOR_CENTRAL_COMPANY_DIRECTORY_SAVED';

export default function EmpresasPage() {
  const router = useRouter();
  const runtimeContext = useFinanceRuntimeContext();
  const centralFrameRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [centralUrl, setCentralUrl] = useState('');
  const [editorScope, setEditorScope] = useState<EditorScope | null>(null);
  const [syncError, setSyncError] = useState('');
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const returnUrl = `/msinfor${buildFinanceNavigationQueryString(runtimeContext)}`;

  const openCentralCompanyScreen = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) return;
    setError('');
    setSyncError('');
    setCentralUrl('');
    setEditorScope(null);
    try {
      const query = buildFinanceApiQueryString(runtimeContext);
      const companies = await getJson<Company[]>(`/companies${query}`);
      if (companies.length !== 1) {
        throw new Error(
          companies.length
            ? 'O contexto financeiro retornou mais de uma empresa.'
            : 'A empresa logada ainda não foi sincronizada com o Financeiro.',
        );
      }
      const company = companies[0];
      const branches = await getJson<Branch[]>(
        `/companies/${company.id}/branches${query}`,
      );
      const branch =
        branches.find(
          (item) => item.branchCode === runtimeContext.sourceBranchCode,
        ) || branches[0];
      if (!branch) {
        throw new Error('A empresa logada não possui filial ativa na Central.');
      }
      const launch = await requestJson<{ editorUrl: string }>(
        `/companies/${company.id}/branches/${branch.id}/central-editor-launch${query}`,
        {
          method: 'POST',
          fallbackMessage: 'Não foi possível abrir a tela de empresas da Central.',
        },
      );
      const editorUrl = new URL(launch.editorUrl);
      setEditorScope({ companyId: company.id, branchId: branch.id, query });
      setCentralUrl(editorUrl.toString());
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível abrir a tela única de empresas da Central.',
        ),
      );
    }
  }, [runtimeContext]);

  const refreshFinanceMirror = useCallback(async (scope: EditorScope) => {
    setIsSynchronizing(true);
    setSyncError('');
    try {
      await requestJson<Branch>(
        `/companies/${scope.companyId}/branches/${scope.branchId}/central-configuration-refresh${scope.query}`,
        {
          method: 'POST',
          body: JSON.stringify({}),
          fallbackMessage:
            'A alteração foi salva na Central, mas o Financeiro não conseguiu atualizar seu espelho.',
        },
      );
    } catch (currentError) {
      setSyncError(
        getFriendlyRequestErrorMessage(
          currentError,
          'A alteração foi salva na Central, mas o Financeiro não conseguiu atualizar seu espelho.',
        ),
      );
    } finally {
      setIsSynchronizing(false);
    }
  }, []);

  useEffect(() => {
    if (!centralUrl) return;

    const expectedOrigin = new URL(centralUrl).origin;
    const handleCentralMessage = (event: MessageEvent) => {
      if (
        !isTrustedMessageEvent(event, {
          origin: expectedOrigin,
          source: centralFrameRef.current?.contentWindow || null,
        }) ||
        !event.data ||
        typeof event.data !== 'object'
      ) {
        return;
      }

      const messageType = (event.data as { type?: unknown }).type;
      if (messageType === CENTRAL_CLOSED_MESSAGE) {
        router.push(returnUrl);
        return;
      }
      if (messageType === CENTRAL_SAVED_MESSAGE && editorScope) {
        void refreshFinanceMirror(editorScope);
      }
    };

    window.addEventListener('message', handleCentralMessage);
    return () => window.removeEventListener('message', handleCentralMessage);
  }, [centralUrl, editorScope, refreshFinanceMirror, returnUrl, router]);

  useEffect(() => {
    if (runtimeContext.embedded && window.parent !== window) {
      postMessageToTrustedParent({
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: 'PRINCIPAL_FINANCEIRO_EMPRESA',
      });
    }
    void openCentralCompanyScreen();
  }, [attempt, openCentralCompanyScreen, runtimeContext.embedded]);

  if (centralUrl) {
    return (
      <main className="relative h-[calc(100vh-1rem)] min-h-[720px] w-full overflow-hidden bg-slate-100 p-2">
        {syncError ? (
          <div
            role="alert"
            className="absolute left-1/2 top-5 z-10 flex w-[min(92%,760px)] -translate-x-1/2 items-center justify-between gap-4 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-bold text-red-800 shadow-xl"
          >
            <span>{syncError}</span>
            <button
              type="button"
              disabled={isSynchronizing || !editorScope}
              onClick={() => editorScope && void refreshFinanceMirror(editorScope)}
              className="shrink-0 rounded-full bg-red-600 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-60"
            >
              {isSynchronizing ? 'SINCRONIZANDO…' : 'TENTAR SINCRONIZAR'}
            </button>
          </div>
        ) : null}
        <iframe
          ref={centralFrameRef}
          src={centralUrl}
          title="Empresa e filiais - MSINFOR Central"
          className="h-full w-full rounded-2xl border-0 bg-white shadow-lg"
          referrerPolicy="origin"
          sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts"
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">
          MSINFOR Central IA · tela única
        </div>
        <h1 className="mt-3 text-2xl font-black text-slate-900">
          Abrindo empresa e filiais
        </h1>
        <p className="mt-3 text-sm font-semibold text-slate-600">
          O Financeiro não mantém uma tela própria de empresas. A tela oficial
          da Central será aberta nesta mesma área, limitada à empresa logada.
        </p>
        {error ? (
          <>
            <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-5 rounded-full bg-blue-600 px-6 py-3 text-xs font-black text-white"
            >
              TENTAR NOVAMENTE
            </button>
          </>
        ) : (
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
            Validando a sessão e o escopo da empresa…
          </p>
        )}
      </section>
    </main>
  );
}
