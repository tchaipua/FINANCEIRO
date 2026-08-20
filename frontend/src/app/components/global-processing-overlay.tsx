'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import DependencyRecoveryScreen from './dependency-recovery-screen';
import { API_BASE_URL } from '@/app/lib/api';
import { withFinanceBasePath } from '@/app/lib/public-path';

const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 320;
const MAX_VISIBLE_MS = 15_000;
const RECOVERY_MAX_ATTEMPTS = 5;

function isServiceUnavailableMessage(value: unknown) {
  return /failed to fetch|networkerror|err_connection_refused|bad gateway|service unavailable|temporariamente indispon[ií]vel|internal server error|application error/i.test(String(value || ''));
}

async function responseMessage(response: Response) {
  try {
    const raw = (await response.clone().text()).trim();
    if (!raw) return `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
    const payload = JSON.parse(raw) as { message?: unknown; error?: unknown };
    const message = payload?.message ?? payload?.error;
    return Array.isArray(message)
      ? message.map(String).join('; ')
      : String(message || raw).slice(0, 600);
  } catch {
    return `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
  }
}

export default function GlobalProcessingOverlay() {
  const pathname = usePathname();
  const pendingCount = useRef(0);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const maximumVisibleTimer = useRef<number | null>(null);
  const visibleSince = useRef(0);
  const visibleRef = useRef(false);
  const recoveryRef = useRef<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);

  const clearShowTimer = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };

  const clearMaximumVisibleTimer = () => {
    if (maximumVisibleTimer.current !== null) {
      window.clearTimeout(maximumVisibleTimer.current);
      maximumVisibleTimer.current = null;
    }
  };

  const clearHideTimer = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const show = () => {
    if (visibleRef.current) {
      clearHideTimer();
      return;
    }
    if (showTimer.current !== null) return;
    showTimer.current = window.setTimeout(() => {
      visibleSince.current = Date.now();
      visibleRef.current = true;
      setIsVisible(true);
      showTimer.current = null;
      clearMaximumVisibleTimer();
      maximumVisibleTimer.current = window.setTimeout(() => {
        // Não interrompe a requisição em andamento; somente devolve a tela ao
        // usuário caso um serviço externo não responda.
        pendingCount.current = 0;
        visibleRef.current = false;
        visibleSince.current = 0;
        setIsVisible(false);
        maximumVisibleTimer.current = null;
      }, MAX_VISIBLE_MS);
    }, SHOW_DELAY_MS);
  };

  const hide = () => {
    clearShowTimer();
    clearMaximumVisibleTimer();
    if (!visibleRef.current) return;
    clearHideTimer();
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - visibleSince.current));
    hideTimer.current = window.setTimeout(() => {
      visibleRef.current = false;
      visibleSince.current = 0;
      setIsVisible(false);
      hideTimer.current = null;
    }, remaining);
  };

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      pendingCount.current += 1;
      show();
      try {
        const response = await originalFetch(...args);
        if (!response.ok && (response.status >= 500 || isServiceUnavailableMessage(await responseMessage(response)))) {
          const message = await responseMessage(response);
          recoveryRef.current = message;
          setRecovery(message);
          clearShowTimer();
          clearHideTimer();
          clearMaximumVisibleTimer();
          visibleRef.current = true;
          visibleSince.current = Date.now();
          setIsVisible(true);
        }
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível alcançar o serviço Financeiro.';
        recoveryRef.current = message;
        setRecovery(message);
        clearShowTimer();
        clearHideTimer();
        clearMaximumVisibleTimer();
        visibleRef.current = true;
        visibleSince.current = Date.now();
        setIsVisible(true);
        throw error;
      } finally {
        pendingCount.current -= 1;
        if (pendingCount.current <= 0) hide();
      }
    };

    const openForNavigation = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === '_blank') return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin === window.location.origin && `${destination.pathname}${destination.search}` !== `${window.location.pathname}${window.location.search}`) show();
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args) => { show(); return originalPushState(...args); };
    window.history.replaceState = (...args) => { show(); return originalReplaceState(...args); };
    window.addEventListener('click', openForNavigation, true);

    return () => {
      window.fetch = originalFetch;
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('click', openForNavigation, true);
      clearShowTimer();
      clearHideTimer();
      clearMaximumVisibleTimer();
    };
  }, []);

  useEffect(() => {
    recoveryRef.current = null;
    setRecovery(null);
    hide();
  }, [pathname]);

  if (recovery) {
    return (
      <div aria-live="polite" aria-busy="true" className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/90">
        <DependencyRecoveryScreen
          dependencyName="Financeiro"
          dependencyUrl={`${API_BASE_URL}/health/ready`}
          maxAttempts={RECOVERY_MAX_ATTEMPTS}
          fallbackTitle="O Financeiro continua indisponível"
          fallbackMessage="O Financeiro tentou restabelecer a conexão automaticamente, mas o serviço ainda não respondeu. Verifique se o serviço está ligado e tente novamente."
          onAvailable={() => window.location.reload()}
          onCancel={() => window.location.reload()}
          cancelLabel="Tentar novamente agora"
        />
      </div>
    );
  }

  if (!isVisible) return null;

  return <div aria-live="polite" aria-busy="true" className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]">
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/35 border-t-blue-500" />
        <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-white shadow-2xl"><img src={withFinanceBasePath('/logo-msinfor.jpg')} alt="MSINFOR" className="h-full w-full object-cover" /></div>
      </div>
      <div className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-white drop-shadow">Processando</div>
      <div className="mt-1 text-xs font-semibold text-white/85">Aguarde um instante</div>
    </div>
  </div>;
}
