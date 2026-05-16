'use client';

import type { ReactNode } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';

type AuditedPopupShellProps = {
  isOpen: boolean;
  screenId: string;
  title: string;
  eyebrow?: string;
  description?: string;
  brandingName?: string | null;
  logoUrl?: string | null;
  originText?: string;
  auditText?: string;
  sqlText?: string;
  onClose: () => void;
  children: ReactNode;
  headerActions?: ReactNode;
  footerActions?: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  screenCopyWrapperClassName?: string;
};

function getInitials(value?: string | null) {
  return String(value || 'FINANCEIRO')
    .trim()
    .slice(0, 3)
    .toUpperCase();
}

export default function AuditedPopupShell({
  isOpen,
  screenId,
  title,
  eyebrow = 'Popup auditável',
  description,
  brandingName,
  logoUrl,
  originText,
  auditText,
  sqlText,
  onClose,
  children,
  headerActions,
  footerActions,
  panelClassName = 'max-w-4xl',
  bodyClassName = '',
  screenCopyWrapperClassName = 'mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3',
}: AuditedPopupShellProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={FINANCE_GRID_PAGE_LAYOUT.modalOverlay}>
      <div className={`${FINANCE_GRID_PAGE_LAYOUT.modalPanel} ${panelClassName}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={brandingName || 'Empresa'}
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                <span className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                  {getInitials(brandingName)}
                </span>
              )}
            </div>

            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">
                {eyebrow}
              </div>
              <h2 className="mt-0.5 text-xl font-black text-slate-900">{title}</h2>
              {description ? (
                <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-500">{description}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl font-black text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="Fechar popup"
            >
              ×
            </button>
          </div>
        </div>

        <div className={`${FINANCE_GRID_PAGE_LAYOUT.modalBody} ${bodyClassName}`}>
          {children}

          {footerActions ? (
            <div className="mt-6 flex flex-wrap justify-center gap-4">{footerActions}</div>
          ) : null}

          <div className={screenCopyWrapperClassName}>
            <ScreenNameCopy
              screenId={screenId}
              className="justify-end"
              originText={originText}
              auditText={auditText}
              sqlText={sqlText}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
