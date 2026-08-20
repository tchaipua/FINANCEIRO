'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { withFinanceBasePath } from '@/app/lib/public-path';

const PROBE_TIMEOUT_MS = 1800;
const RETRY_INTERVAL_MS = 3000;
const SCREEN_ID = 'FINANCEIRO_RECUPERACAO_DEPENDENCIA';

type DependencyRecoveryScreenProps = {
  dependencyName: string;
  dependencyUrl: string;
  probe?: (url: string) => Promise<boolean>;
  maxAttempts?: number;
  fallbackTitle?: string;
  fallbackMessage?: string;
  embedded?: boolean;
  onAvailable: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
};

async function isDependencyAvailable(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.type === 'opaque') return true;
    if (!response.ok) return false;
    const body = (await response.clone().text()).slice(0, 120000);
    return !/internal server error|application error|server error|err_connection_refused|service unavailable/i.test(body);
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function DependencyRecoveryScreen({
  dependencyName,
  dependencyUrl,
  probe,
  maxAttempts,
  fallbackTitle = 'O Financeiro continua indisponível',
  fallbackMessage = 'O Financeiro tentou restabelecer a conexão, mas o serviço ainda não respondeu. Verifique se o serviço está ligado e tente novamente em alguns instantes.',
  embedded = false,
  onAvailable,
  onCancel,
  cancelLabel = 'Tentar novamente agora',
}: DependencyRecoveryScreenProps) {
  const onAvailableRef = useRef(onAvailable);
  const isActiveRef = useRef(true);
  const attemptRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [isChecking, setIsChecking] = useState(true);
  const [hasReachedRetryLimit, setHasReachedRetryLimit] = useState(false);

  useEffect(() => {
    onAvailableRef.current = onAvailable;
  }, [onAvailable]);

  const checkDependency = useCallback(async () => {
    const nextAttempt = attemptRef.current + 1;
    attemptRef.current = nextAttempt;
    setAttempt(nextAttempt);
    setIsChecking(true);

    const isAvailable = await (probe || isDependencyAvailable)(dependencyUrl);
    if (isAvailable && isActiveRef.current) {
      onAvailableRef.current();
      return;
    }

    setIsChecking(false);
    if (maxAttempts && nextAttempt >= maxAttempts) {
      setHasReachedRetryLimit(true);
    }
  }, [dependencyUrl, maxAttempts, probe]);

  useEffect(() => {
    isActiveRef.current = true;
    let isActive = true;
    const runCheck = async () => {
      if (!isActive) return;
      await checkDependency();
    };

    void runCheck();
    const retryTimer = window.setInterval(() => {
      void runCheck();
    }, RETRY_INTERVAL_MS);

    return () => {
      isActive = false;
      isActiveRef.current = false;
      window.clearInterval(retryTimer);
    };
  }, [checkDependency]);

  return (
    <main
      className={`flex w-full items-center justify-center px-6 py-10 text-slate-100 ${embedded ? 'min-h-[520px] bg-white' : 'min-h-screen bg-slate-950'}`}
      aria-busy={isChecking}
      aria-live="polite"
      data-system-message-ignore="true"
    >
      <section className={`w-full max-w-xl overflow-hidden rounded-[32px] border shadow-2xl ${hasReachedRetryLimit ? 'border-red-800/80 bg-[#2b0b0b]/95' : 'border-slate-800 bg-[#2b0b0b]/95'}`}>
        <div className="px-7 py-10 text-center sm:px-12">
          <div className="relative mx-auto flex h-32 w-32 items-center justify-center">
            <div className={`absolute inset-0 animate-spin rounded-full border-4 ${hasReachedRetryLimit ? 'border-red-200/20 border-t-red-300' : 'border-white/20 border-t-blue-400'}`} />
            <div className="h-24 w-24 animate-[spin_1.8s_linear_infinite] overflow-hidden rounded-full border-4 border-white bg-white shadow-2xl">
              <img src={withFinanceBasePath('/logo-msinfor.jpg')} alt="Logotipo MSINFOR" className="h-full w-full object-contain" />
            </div>
          </div>

          <div className="mt-7 text-[11px] font-black uppercase tracking-[0.24em] text-blue-300">Recuperação automática de conexão</div>
          <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">
            {hasReachedRetryLimit ? fallbackTitle : 'Estamos tentando corrigir o acesso'}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-300">
            {hasReachedRetryLimit ? fallbackMessage : (
              <>O serviço <strong className="text-white">{dependencyName}</strong> parece estar parado ou iniciando. O Financeiro está verificando novamente e continuará assim que ele voltar.</>
            )}
          </p>

          <div className={`mt-7 inline-flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] ${hasReachedRetryLimit ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-blue-400/30 bg-blue-400/10 text-blue-200'}`}>
            <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${hasReachedRetryLimit ? 'bg-red-300' : 'bg-blue-300'}`} aria-hidden="true" />
            {isChecking ? 'Tentando conectar...' : hasReachedRetryLimit ? 'Serviço ainda indisponível' : 'Aguardando o serviço voltar...'}
          </div>
          <p className="mt-3 text-xs text-slate-500" aria-label={`Tentativa ${attempt || 1}`}>
            Tentativa {attempt || 1}. Nova verificação automática em alguns segundos.
          </p>

          {onCancel ? (
            <button type="button" onClick={onCancel} className="mt-8 rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-bold text-slate-200 transition hover:border-slate-400 hover:bg-slate-800">
              {cancelLabel}
            </button>
          ) : null}
        </div>

        <footer className={`border-t px-7 py-4 sm:px-12 ${hasReachedRetryLimit ? 'border-red-900 bg-red-950/50' : 'border-slate-800 bg-slate-950/50'}`}>
          <ScreenNameCopy
            screenId={SCREEN_ID}
            label="Tela técnica"
            compact
            className="text-slate-500"
            originText="Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\components\\dependency-recovery-screen.tsx"
            auditText="Tela de recuperação de dependência do Financeiro. Faz verificações HTTP somente leitura e não altera dados."
            sqlText="Não há consulta SQL nem mutação de dados nesta tela."
          />
        </footer>
      </section>
    </main>
  );
}
