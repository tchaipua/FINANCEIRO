'use client';

import { useEffect, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';

type InactivationConfirmationPopupProps = {
  isOpen: boolean;
  screenId: string;
  title: string;
  targetName: string;
  description?: string;
  brandingName?: string | null;
  logoUrl?: string | null;
  onClose: () => void;
  onConfirm: (password: string, reason: string) => void | Promise<void>;
  isSaving?: boolean;
  auditText?: string;
  sqlText?: string;
};

export default function InactivationConfirmationPopup({
  isOpen,
  screenId,
  title,
  targetName,
  description = 'Ao inativar este registro, o histórico será preservado.',
  brandingName,
  logoUrl,
  onClose,
  onConfirm,
  isSaving = false,
  auditText,
  sqlText,
}: InactivationConfirmationPopupProps) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setReason('');
      setShowPassword(false);
    }
  }, [isOpen, targetName]);

  if (!isOpen) return null;

  const close = () => {
    if (isSaving) return;
    setPassword('');
    setReason('');
    onClose();
  };

  return (
    <AuditedPopupShell
      isOpen={isOpen}
      screenId={screenId}
      title={title}
      eyebrow="Confirmação de inativação"
      description=""
      brandingName={brandingName}
      logoUrl={logoUrl}
      onClose={close}
      panelClassName="finance-inactivation-popup max-w-3xl"
      headerTheme="blue"
      bodyClassName="finance-inactivation-body"
      footerScreenIdCompact
      auditText={auditText}
      sqlText={sqlText}
      footerActions={
        <button
          type="button"
          className="finance-inactivation-confirm"
          disabled={isSaving || !password.trim() || !reason.trim()}
          onClick={() => void onConfirm(password, reason)}
        >
          {isSaving ? 'Inativando...' : 'Confirmar inativação'}
        </button>
      }
    >
      <div className="finance-inactivation-intro">
        <p>{description}</p>
        <strong>{targetName}</strong>
      </div>

      <section className="finance-inactivation-password-panel" aria-label="Senha de inativação obrigatória">
        <div className="finance-inactivation-password-title">
          <span className="finance-inactivation-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <span>SENHA DE INATIVAÇÃO OBRIGATÓRIA</span>
        </div>
        <div className="finance-inactivation-password-field">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            placeholder="Informar senha de inativação"
            autoComplete="current-password"
            aria-label="Senha de inativação obrigatória"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
          </button>
        </div>
      </section>

      <textarea
        className="finance-inactivation-reason"
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Descreva o motivo da inativação"
        aria-label="Motivo da inativação"
      />
    </AuditedPopupShell>
  );
}
