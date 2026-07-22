'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 320;

export default function GlobalProcessingOverlay() {
  const pathname = usePathname();
  const pendingCount = useRef(0);
  const showTimer = useRef<number | null>(null);
  const visibleSince = useRef(0);
  const [isVisible, setIsVisible] = useState(false);

  const clearShowTimer = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };

  const show = () => {
    if (isVisible || showTimer.current !== null) return;
    showTimer.current = window.setTimeout(() => {
      visibleSince.current = Date.now();
      setIsVisible(true);
      showTimer.current = null;
    }, SHOW_DELAY_MS);
  };

  const hide = () => {
    clearShowTimer();
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - visibleSince.current));
    window.setTimeout(() => setIsVisible(false), remaining);
  };

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      pendingCount.current += 1;
      show();
      try {
        return await originalFetch(...args);
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
    };
  }, [isVisible]);

  useEffect(() => { hide(); }, [pathname]);

  if (!isVisible) return null;

  return <div aria-live="polite" aria-busy="true" className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]">
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/35 border-t-blue-500" />
        <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-white shadow-2xl"><img src="/logo-msinfor.jpg" alt="MSINFOR" className="h-full w-full object-cover" /></div>
      </div>
      <div className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-white drop-shadow">Processando</div>
      <div className="mt-1 text-xs font-semibold text-white/85">Aguarde um instante</div>
    </div>
  </div>;
}
