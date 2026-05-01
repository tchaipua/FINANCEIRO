'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ScreenAuditModal from './screen-audit-modal';

const COPY_FEEDBACK_TIMEOUT = 1800;

type CopyStatus = 'idle' | 'copied' | 'error';

type ScreenNameCopyProps = {
  screenId: string;
  label?: string;
  className?: string;
};

function copyTextWithLegacyCommand(value: string) {
  if (typeof document === 'undefined' || !document.body) return false;

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function ScreenNameCopy({
  screenId,
  label = 'Tela',
  className = '',
}: ScreenNameCopyProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const [isAuditOpen, setIsAuditOpen] = useState(false);
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
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(screenId);
        setStatus('copied');
        setIsAuditOpen(true);
        resetStatus();
        return;
      }
    } catch {
      // Em iframe embutido o navegador pode bloquear a Clipboard API por policy.
    }

    try {
      const copied = copyTextWithLegacyCommand(screenId);
      setStatus(copied ? 'copied' : 'error');
      if (copied) {
        setIsAuditOpen(true);
      }
    } finally {
      resetStatus();
    }
  }, [resetStatus, screenId]);

  return (
    <>
      <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 ${className}`}>
        <span className="flex-1 truncate">
          {label}:{' '}
          <span className="font-normal text-[10px] tracking-[0.35em] text-slate-500">{screenId}</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          title="Copiar nome da tela e abrir lógica usada"
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

      {isAuditOpen ? (
        <ScreenAuditModal
          screenId={screenId}
          systemName="Sistema Financeiro"
          onClose={() => setIsAuditOpen(false)}
        />
      ) : null}
    </>
  );
}
