'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_CONTAS_A_RECEBER';
const STANDALONE_SCREEN_ID = 'FINANCEIRO_CONTAS_A_RECEBER_CENTRAL';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/contas-a-receber/page.tsx';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';

const MENU_ITEMS = [
  {
    id: 'clientes',
    label: 'Clientes',
    href: '/clientes',
    description: 'Consulte os pagadores e clientes sincronizados no Financeiro.',
    image: '/principal-financeiro/historico-cliente.svg?v=1',
  },
  {
    id: 'vendas-periodo',
    label: 'Vendas do Período',
    href: '/vendas/periodo',
    description: 'Grid das vendas realizadas por período.',
    image: '/principal-financeiro/vendas.svg?v=2',
  },
  {
    id: 'devolucao-mercadorias',
    label: 'Devolução de Mercadorias',
    href: '/vendas/devolucao-mercadorias',
    description: 'Fluxo de devolução de produtos do Financeiro.',
    image: '/principal-financeiro/vendas.svg?v=2',
  },
  {
    id: 'parcelas',
    label: 'Parcelas a Receber',
    href: '/recebiveis/parcelas',
    description: 'Parcelas abertas, vencidas e baixadas da empresa.',
    image: '/principal-financeiro/parcelas.svg?v=2',
  },
  {
    id: 'creditos',
    label: 'Controle de Créditos',
    href: '/recebiveis/creditos',
    description: 'Controle de créditos em contas a receber.',
    image: '/principal-financeiro/creditos.svg?v=1',
  },
  {
    id: 'recebimentos-por-cliente',
    label: 'Recebimentos por Cliente',
    href: '/recebiveis/recebimentos-por-cliente',
    description: 'Receba parcelas abertas agrupadas por cliente.',
    image: '/principal-financeiro/recebimentos-por-cliente.svg?v=1',
  },
  {
    id: 'historico-cliente',
    label: 'Histórico Cliente',
    href: '/recebiveis/historico-cliente',
    description: 'Consulte compras, parcelas e pagamentos por cliente.',
    image: '/principal-financeiro/historico-cliente.svg?v=1',
  },
  {
    id: 'historico-baixas',
    label: 'Histórico Baixas',
    href: '/recebiveis/historico-baixas',
    description: 'Consulte baixas realizadas e estorne recebimentos.',
    image: '/principal-financeiro/historico-baixas.svg?v=1',
  },
] as const;

const AUDIT_TEXT = `Central de navegação do Contas a Receber pertencente ao Sistema Financeiro.

REGRAS:
- a tela pode ser aberta por qualquer sistema de origem autorizado;
- sourceSystem, sourceTenantId e sourceBranchCode preservam o isolamento da empresa e filial;
- os atalhos navegam somente para rotas do próprio Financeiro;
- esta central não persiste nem altera dados.`;

export default function FinanceiroContasAReceberPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const screenId = runtimeContext.embedded ? SCREEN_ID : STANDALONE_SCREEN_ID;

  useEffect(() => {
    if (!runtimeContext.embedded || window.parent === window) return;
    window.parent.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
        originText: ORIGIN_TEXT,
        auditText: AUDIT_TEXT,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  return (
    <div className="space-y-6">
      <section className={`${cardClass} p-6`}>
        <div className="h-[calc(100vh-14rem)] min-h-[360px] rounded-[28px] border border-slate-200 bg-white p-6 shadow-inner">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
            {MENU_ITEMS.map((item) => (
              <Link
                key={item.id}
                href={`${item.href}${preservedQueryString}`}
                title={item.description}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
              >
                <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3">
                  <img
                    src={item.image}
                    alt={item.label}
                    className="max-h-full max-w-full object-contain opacity-95 transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
                  <div className="text-sm font-black text-slate-800">{item.label}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText={AUDIT_TEXT}
            sqlText="-- CENTRAL DE NAVEGAÇÃO: NÃO EXECUTA CONSULTAS OU MUTAÇÕES."
          />
        </section>
      ) : null}
    </div>
  );
}
