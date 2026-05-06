'use client';

import ScreenNameCopy from '@/app/components/screen-name-copy';

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

type FinanceiroModulePlaceholderPageProps = {
  title: string;
  eyebrow: string;
  description: string;
  screenId: string;
  originText: string;
  auditText: string;
  showHero?: boolean;
};

export default function FinanceiroModulePlaceholderPage({
  title,
  eyebrow,
  description,
  screenId,
  originText,
  auditText,
  showHero = true,
}: FinanceiroModulePlaceholderPageProps) {
  return (
    <div className="space-y-6">
      {showHero ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                  {eyebrow}
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                  {description}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-8 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            Modulo em preparacao
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{title}</div>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-medium text-slate-600">
            Esta area ja esta reservada dentro do Financeiro e pronta para receber a operacao
            completa sem mudar o layout aprovado.
          </p>
        </div>
      </section>

      <section className={`${cardClass} px-6 py-4`}>
        <ScreenNameCopy
          screenId={screenId}
          className="justify-end"
          originText={originText}
          auditText={auditText}
        />
      </section>
    </div>
  );
}
