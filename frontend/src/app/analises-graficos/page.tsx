'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type AnalysisArea = {
  id: string;
  label: string;
  description: string;
  href: string;
  hostPath: string;
  image: string;
};

const ANALYSIS_AREAS: AnalysisArea[] = [
  {
    id: 'financeiro',
    label: 'Visão Financeira',
    description: 'Entradas, compromissos, resultados e projeções.',
    href: '/analises-graficos/financeiro',
    hostPath: '/principal/financeiro/analises-graficos/financeiro',
    image: '/principal-financeiro/resumo.svg?v=2',
  },
  {
    id: 'contas-a-receber',
    label: 'Contas a Receber',
    description: 'Carteira, inadimplência, aging e previsões.',
    href: '/analises-graficos/contas-a-receber',
    hostPath: '/principal/financeiro/analises-graficos/contas-a-receber',
    image: '/principal-financeiro/parcelas.svg?v=2',
  },
  {
    id: 'contas-a-pagar',
    label: 'Contas a Pagar',
    description: 'Compromissos, fornecedores e evolução mensal.',
    href: '/analises-graficos/contas-a-pagar',
    hostPath: '/principal/financeiro/analises-graficos/contas-a-pagar',
    image: '/principal-financeiro/contas-a-pagar.svg?v=2',
  },
  {
    id: 'vendas',
    label: 'Vendas',
    description: 'Faturamento, ticket médio, clientes e produtos.',
    href: '/analises-graficos/vendas',
    hostPath: '/principal/financeiro/analises-graficos/vendas',
    image: '/principal-financeiro/vendas.svg?v=1',
  },
  {
    id: 'estoque',
    label: 'Estoque',
    description: 'Disponibilidade, valor, alertas e maior giro.',
    href: '/analises-graficos/estoque',
    hostPath: '/principal/financeiro/analises-graficos/estoque',
    image: '/principal-financeiro/estoque.svg?v=2',
  },
  {
    id: 'curva-abc',
    label: 'Curva ABC',
    description: 'Concentração de receita e classes de produtos.',
    href: '/analises-graficos/curva-abc',
    hostPath: '/principal/financeiro/analises-graficos/curva-abc',
    image: '/principal-financeiro/creditos.svg?v=1',
  },
  {
    id: 'fluxo-caixa',
    label: 'Fluxo de Caixa',
    description: 'Entradas, saídas e saldo acumulado por período.',
    href: '/analises-graficos/fluxo-caixa',
    hostPath: '/principal/financeiro/analises-graficos/fluxo-caixa',
    image: '/principal-financeiro/caixa.svg?v=2',
  },
  {
    id: 'saude-financeira',
    label: 'Saúde da Empresa',
    description: 'Cobertura, risco, liquidez e desempenho geral.',
    href: '/analises-graficos/saude-financeira',
    hostPath: '/principal/financeiro/analises-graficos/saude-financeira',
    image: '/principal-financeiro/bancos.svg?v=1',
  },
];

function resolveHostBaseUrl() {
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

export default function AnalyticsHubPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [hostBaseUrl, setHostBaseUrl] = useState<string | null>(null);

  useEffect(() => {
    setHostBaseUrl(resolveHostBaseUrl());
  }, []);

  useEffect(() => {
    if (!runtimeContext.embedded) return;
    window.parent?.postMessage(
      { type: 'MSINFOR_SCREEN_CONTEXT', screenId: 'PRINCIPAL_FINANCEIRO_ANALISES_GRAFICOS' },
      '*',
    );
  }, [runtimeContext.embedded]);

  return (
    <div className="space-y-4">
      {!runtimeContext.embedded ? (
        <div className="border-b border-slate-200 pb-4">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700">
            Inteligência do negócio
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Análises e gráficos</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Escolha a área para abrir os indicadores e dashboards correspondentes.
          </p>
        </div>
      ) : null}

      <section className="border border-slate-200 bg-white p-5 shadow-sm rounded-lg">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {ANALYSIS_AREAS.map((area) => {
            const shouldReturnToHost = Boolean(runtimeContext.embedded && hostBaseUrl);
            const href = shouldReturnToHost
              ? `${hostBaseUrl}${area.hostPath}`
              : `${area.href}${preservedQueryString}`;
            const content = (
              <>
                <div className="flex h-24 items-center justify-center bg-slate-100 p-4">
                  <img src={area.image} alt={area.label} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-h-20 border-t border-slate-100 px-3 py-3 text-center">
                  <strong className="block text-sm font-black text-slate-800">{area.label}</strong>
                  <span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">
                    {area.description}
                  </span>
                </div>
              </>
            );

            return shouldReturnToHost ? (
              <a
                key={area.id}
                href={href}
                target="_top"
                rel="noreferrer"
                className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                {content}
              </a>
            ) : (
              <Link
                key={area.id}
                href={href}
                className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                {content}
              </Link>
            );
          })}
        </div>
      </section>

      {!runtimeContext.embedded ? (
        <ScreenNameCopy
          screenId="PRINCIPAL_FINANCEIRO_ANALISES_GRAFICOS"
          className="justify-end"
          originText="Origem: Sistema Financeiro - caminho fisico: C:/Sistemas/IA/Financeiro/frontend/src/app/analises-graficos/page.tsx"
        />
      ) : null}
    </div>
  );
}
