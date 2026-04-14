'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const COPY_FEEDBACK_TIMEOUT = 1800;

type CopyStatus = 'idle' | 'copied' | 'error';

type ScreenNameCopyProps = {
  screenId: string;
  label?: string;
  className?: string;
};

export default function ScreenNameCopy({
  screenId,
  label = 'Tela',
  className = '',
}: ScreenNameCopyProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetStatus = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setStatus('idle'), COPY_FEEDBACK_TIMEOUT);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setStatus('error');
      resetStatus();
      return;
    }

    try {
      await navigator.clipboard.writeText(screenId);
      setStatus('copied');
    } catch {
      setStatus('error');
    } finally {
      resetStatus();
    }
  }, [resetStatus, screenId]);

  return (
    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 ${className}`}>
      <span className="flex-1 truncate">
        {label}:{' '}
        <span className="font-normal text-[10px] tracking-[0.35em] text-slate-500">{screenId}</span>
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
        title="Copiar nome da tela"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
      <span className="min-w-[48px] text-[9px] font-semibold uppercase tracking-[0.4em] text-emerald-600">
        {status === 'copied' ? 'COPIADO' : status === 'error' ? 'FALHA' : ''}
      </span>
    </div>
  );
}
