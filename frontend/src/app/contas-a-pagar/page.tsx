'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

type MenuItem = {
  id: string;
  label: string;
  href?: string;
  accent: string;
  icon: ReactNode;
};

const auditText = `--- LOGICA DA TELA ---
Esta tela centraliza os atalhos operacionais do modulo de contas a pagar do Financeiro.

TABELAS PRINCIPAIS:
- Nenhuma tabela fisica consultada diretamente nesta entrega visual inicial.

RELACIONAMENTOS:
- Nao aplicavel nesta etapa.

METRICAS / CAMPOS EXIBIDOS:
- atalhos de importacao de notas
- atalhos de certificados digitais
- atalhos de fornecedores
- atalhos de consulta de parcelas
- atalhos de consulta de notas importadas
- atalho de lancamento manual de contas a pagar

FILTROS APLICADOS:
- Nao aplicavel.

ORDENACAO:
- Nao aplicavel.

OBSERVACAO:
- Esta tela funciona como menu operacional do contas a pagar dentro do sistema Financeiro, preservando o layout aprovado e preparando a futura navegacao detalhada do modulo.`;

const MENU_ITEMS = [
  {
    id: 'importacao-notas',
    label: 'Importação de Notas',
    href: '/contas-a-pagar/importacao-notas',
    accent: 'from-blue-500 to-blue-600',
    icon: (
      <svg className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 17V9m0 0-3 3m3-3 3 3" />
      </svg>
    ),
  },
  {
    id: 'certificados-digitais',
    label: 'Certificados Digitais',
    href: '/contas-a-pagar/certificados-digitais',
    accent: 'from-violet-500 to-violet-600',
    icon: (
      <svg className="h-12 w-12 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 11a5 5 0 1 1 9.9 1H19a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-2 2h-2v-3h-2.1A5 5 0 0 1 7 11z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.5h.01" />
      </svg>
    ),
  },
  {
    id: 'fornecedores',
    label: 'Fornecedores',
    accent: 'from-indigo-500 to-indigo-600',
    icon: (
      <svg className="h-12 w-12 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 20h18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 20V8l7-4 7 4v12" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
      </svg>
    ),
  },
  {
    id: 'consultar-parcelas',
    label: 'Consultar Parcelas',
    accent: 'from-cyan-500 to-cyan-600',
    icon: (
      <svg className="h-12 w-12 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 17l1.5 1.5L22 16" />
      </svg>
    ),
  },
  {
    id: 'notas-importadas',
    label: 'Consultar Notas Importadas',
    href: '/contas-a-pagar/notas-importadas',
    accent: 'from-emerald-500 to-emerald-600',
    icon: (
      <svg className="h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h6M9 9h2" />
      </svg>
    ),
  },
  {
    id: 'lancamento-manual',
    label: 'Lançamento Manual',
    accent: 'from-green-500 to-green-600',
    icon: (
      <svg className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8M12 10v6M9 13h6" />
      </svg>
    ),
  },
] satisfies MenuItem[];

export default function FinanceiroContasAPagarPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);

  return (
    <div className="space-y-6">
      <section className={`${cardClass} p-6`}>
        <div className="rounded-[30px] border border-slate-200 bg-slate-50 px-5 py-6 shadow-inner">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {MENU_ITEMS.map((item) => (
              item.href ? (
                <Link
                  key={item.id}
                  href={`${item.href}${preservedQueryString}`}
                  title={item.label}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md"
                >
                  <div className="flex h-24 items-center justify-center overflow-hidden bg-slate-100 px-3">
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${item.accent} shadow-lg shadow-slate-300/50`}
                    >
                      <div className="rounded-2xl bg-white/95 p-2.5 shadow-sm">
                        {item.icon}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-h-14 items-center justify-center px-3 py-3 text-center">
                    <div className="text-sm font-black text-slate-800">{item.label}</div>
                  </div>
                </Link>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md"
                >
                  <div className="flex h-24 items-center justify-center overflow-hidden bg-slate-100 px-3">
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${item.accent} shadow-lg shadow-slate-300/50`}
                    >
                      <div className="rounded-2xl bg-white/95 p-2.5 shadow-sm">
                        {item.icon}
                      </div>
                    </div>
                  </div>

                  <div className="flex min-h-14 items-center justify-center px-3 py-3 text-center">
                    <div className="text-sm font-black text-slate-800">{item.label}</div>
                  </div>
                </button>
              )
            ))}
          </div>
        </div>
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId="PRINCIPAL_FINANCEIRO_CONTAS_A_PAGAR"
            className="justify-end"
            originText="Origem: Sistema Financeiro - frontend/src/app/contas-a-pagar/page.tsx"
            auditText={auditText}
          />
        </section>
      ) : null}
    </div>
  );
}
