'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_ESTOQUE';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\estoque\\page.tsx';

type CompanyItem = {
  id: string;
  name: string;
};

type BranchInventoryConfig = {
  id?: string;
  branchCode: number;
  name?: string;
  inventoryControlType: 'TRADITIONAL' | 'COLOR_SIZE' | 'LOT';
  quantityPrecision: 'INTEGER_ONLY' | 'DECIMAL_ALLOWED' | 'PRODUCT_DEFINED';
};

type MenuItem = {
  id: string;
  label: string;
  href?: string;
  accent: string;
  icon: ReactNode;
  visibleWhen?: 'ALWAYS' | 'COLOR_SIZE';
};

const DEFAULT_BRANCH_INVENTORY_CONFIG: BranchInventoryConfig = {
  branchCode: 1,
  inventoryControlType: 'TRADITIONAL',
  quantityPrecision: 'INTEGER_ONLY',
};

const auditText = `--- LOGICA DA TELA ---
Esta tela centraliza os atalhos operacionais do modulo de estoque do Financeiro.

TABELAS PRINCIPAIS:
- companies (CO) - empresa financeira resolvida por sourceSystem + sourceTenantId.
- company_branches (CB) - filial atual e parametrizacao de estoque.
- products (PR) - cadastro base de produtos compartilhados.
- product_stock_balances (PSB) - saldo preparado por produto, filial, variacao e lote.

RELACIONAMENTOS:
- company_branches.companyId -> companies.id
- products.companyId -> companies.id
- product_stock_balances.companyId -> companies.id
- product_stock_balances.productId -> products.id

METRICAS / CAMPOS EXIBIDOS:
- atalhos de produtos
- atalho de historico de movimentacao do estoque
- atalhos de cores, numeros e grades quando a filial usa grade cor/numero
- identificacao da filial operacional atual

FILTROS APLICADOS AGORA:
- sourceSystem e sourceTenantId informados pela vertical consumidora
- sourceBranchCode da filial operacional atual

ORDENACAO:
- Nao aplicavel nesta tela de menu.

OBSERVACAO:
- Quando inventoryControlType = COLOR_SIZE, a tela exibe os cadastros auxiliares de cores, numeros e grade. Em outros tipos de estoque, esses atalhos ficam ocultos para nao poluir a operacao.`;

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'produtos',
    label: 'Produtos',
    href: '/produtos',
    accent: 'from-blue-500 to-blue-600',
    icon: (
      <svg className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </svg>
    ),
  },
  {
    id: 'historico-movimentacao',
    label: 'Histórico Movimentação do Estoque',
    href: '/estoque/historico-movimentacao',
    accent: 'from-emerald-500 to-emerald-600',
    icon: (
      <svg className="h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m16 9 3 3-3 3" />
      </svg>
    ),
  },
  {
    id: 'cores',
    label: 'Cores',
    accent: 'from-fuchsia-500 to-fuchsia-600',
    visibleWhen: 'COLOR_SIZE',
    icon: (
      <svg className="h-12 w-12 text-fuchsia-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 1 0 0 18 1.8 1.8 0 0 0 1.25-3.1 1.8 1.8 0 0 1 1.25-3.1H16a5 5 0 0 0 0-10H12z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 10h.01M9.5 6.8h.01M14 6.8h.01" />
      </svg>
    ),
  },
  {
    id: 'numeros',
    label: 'Números',
    accent: 'from-cyan-500 to-cyan-600',
    visibleWhen: 'COLOR_SIZE',
    icon: (
      <svg className="h-12 w-12 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M7 17h10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v10M16 7v10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 12h3" />
      </svg>
    ),
  },
  {
    id: 'grade',
    label: 'Grade',
    accent: 'from-indigo-500 to-indigo-600',
    visibleWhen: 'COLOR_SIZE',
    icon: (
      <svg className="h-12 w-12 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h16M4 15h16M9 5v14M15 5v14" />
      </svg>
    ),
  },
];

function shouldShowMenuItem(item: MenuItem, branchInventoryConfig: BranchInventoryConfig) {
  if (!item.visibleWhen || item.visibleWhen === 'ALWAYS') return true;
  return branchInventoryConfig.inventoryControlType === item.visibleWhen;
}

function StockMenuCard({
  item,
  preservedQueryString,
}: {
  item: MenuItem;
  preservedQueryString: string;
}) {
  const content = (
    <>
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
    </>
  );

  if (item.href) {
    return (
      <Link
        href={`${item.href}${preservedQueryString}`}
        title={item.label}
        className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md"
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      title={item.label}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:shadow-md"
    >
      {content}
    </button>
  );
}

export default function FinanceiroEstoquePage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [branchInventoryConfig, setBranchInventoryConfig] = useState<BranchInventoryConfig>(
    DEFAULT_BRANCH_INVENTORY_CONFIG,
  );

  const loadBranchInventoryConfig = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setBranchInventoryConfig(DEFAULT_BRANCH_INVENTORY_CONFIG);
      return;
    }

    try {
      const companies = await getJson<CompanyItem[]>(
        `/companies${buildFinanceApiQueryString(runtimeContext)}`,
      );
      const company = companies[0];
      if (!company) {
        setBranchInventoryConfig(DEFAULT_BRANCH_INVENTORY_CONFIG);
        return;
      }

      const branches = await getJson<BranchInventoryConfig[]>(
        `/companies/${company.id}/branches${buildFinanceApiQueryString(runtimeContext)}`,
      );
      const currentBranch =
        branches.find((branch) => branch.branchCode === runtimeContext.sourceBranchCode) ||
        branches.find((branch) => branch.branchCode === 1) ||
        branches[0];

      setBranchInventoryConfig(currentBranch || DEFAULT_BRANCH_INVENTORY_CONFIG);
    } catch {
      setBranchInventoryConfig(DEFAULT_BRANCH_INVENTORY_CONFIG);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadBranchInventoryConfig();
  }, [loadBranchInventoryConfig]);

  const visibleMenuItems = useMemo(
    () => MENU_ITEMS.filter((item) => shouldShowMenuItem(item, branchInventoryConfig)),
    [branchInventoryConfig],
  );

  return (
    <div className="space-y-6">
      <section className={`${cardClass} p-6`}>
        <div className="rounded-[30px] border border-slate-200 bg-slate-50 px-5 py-6 shadow-inner">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {visibleMenuItems.map((item) => (
              <StockMenuCard
                key={item.id}
                item={item}
                preservedQueryString={preservedQueryString}
              />
            ))}
          </div>
        </div>
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={SCREEN_ID}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText={auditText}
          />
        </section>
      ) : null}
    </div>
  );
}
