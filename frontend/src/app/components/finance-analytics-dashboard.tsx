'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type AnalyticsView =
  | 'financeiro'
  | 'contas-a-receber'
  | 'contas-a-pagar'
  | 'vendas'
  | 'estoque'
  | 'curva-abc'
  | 'fluxo-caixa'
  | 'saude-financeira';

type AnalyticsData = {
  generatedAt: string;
  sales: Array<Record<string, any>>;
  receivables: Array<Record<string, any>>;
  payables: Array<Record<string, any>>;
  products: Array<Record<string, any>>;
  unavailable: string[];
};

const VIEW_META: Record<AnalyticsView, { title: string; subtitle: string }> = {
  financeiro: { title: 'Visão Financeira', subtitle: 'Resultados, compromissos e projeções consolidadas' },
  'contas-a-receber': { title: 'Contas a Receber', subtitle: 'Carteira, inadimplência, aging e previsão de entradas' },
  'contas-a-pagar': { title: 'Contas a Pagar', subtitle: 'Compromissos, fornecedores e evolução das obrigações' },
  vendas: { title: 'Vendas', subtitle: 'Faturamento, ticket médio, clientes e produtos' },
  estoque: { title: 'Estoque', subtitle: 'Disponibilidade, valor imobilizado, alertas e giro' },
  'curva-abc': { title: 'Curva ABC', subtitle: 'Concentração do faturamento e relevância dos produtos' },
  'fluxo-caixa': { title: 'Fluxo de Caixa', subtitle: 'Entradas, saídas, saldo mensal e acumulado' },
  'saude-financeira': { title: 'Saúde da Empresa', subtitle: 'Cobertura, liquidez, risco e desempenho geral' },
};

const COLORS = {
  navy: '#153a6a',
  blue: '#2563eb',
  cyan: '#0891b2',
  teal: '#0f766e',
  green: '#16a34a',
  amber: '#d97706',
  orange: '#ea580c',
  rose: '#e11d48',
  violet: '#7c3aed',
  slate: '#64748b',
};

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const compactMoney = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function numeric(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
}

function monthAxis(months: number, future = false) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - (future ? 0 : months - 1), 1);
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth() + index, 1);
    return { key: monthKey(date), label: monthLabel(date) };
  });
}

function overdueDays(date: Date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((today - due) / 86_400_000);
}

function buildDemoData(months: number): AnalyticsData {
  const now = new Date();
  const names = [
    'KIT EXECUTIVO',
    'CAMISETA PREMIUM',
    'GARRAFA TÉRMICA',
    'MOCHILA URBANA',
    'AGENDA CORPORATIVA',
    'CANECA PERSONALIZADA',
    'SUPORTE TÉCNICO',
  ];
  const sales = monthAxis(months).map((_, index) => {
    const base = 9_600 + index * 1_750 + (index % 2) * 2_100;
    return {
      id: `DEMO-SALE-${index}`,
      confirmedAt: new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 12).toISOString(),
      totalAmount: base,
      paidAmount: base * 0.63,
      receivableAmount: base * 0.37,
      customerName: `CLIENTE ${index + 1}`,
      items: [
        { productName: names[index % names.length], quantity: 10 + index * 2, totalAmount: base * 0.58 },
        { productName: names[(index + 2) % names.length], quantity: 6 + index, totalAmount: base * 0.42 },
      ],
      payments: [
        { paymentMethodLabel: index % 3 === 0 ? 'PIX' : index % 3 === 1 ? 'DINHEIRO' : 'BOLETO', amount: base },
      ],
    };
  });
  const receivables = Array.from({ length: 24 }, (_, index) => {
    const dueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (index - 12) * 7);
    const paid = index % 5 === 0;
    const value = 820 + index * 135;
    return {
      id: `DEMO-REC-${index}`,
      payerNameSnapshot: `CLIENTE ${String(index + 1).padStart(2, '0')}`,
      dueDate: dueDate.toISOString(),
      amount: value,
      openAmount: paid ? 0 : value,
      paidAmount: paid ? value : 0,
      status: paid ? 'PAID' : 'OPEN',
      settledAt: paid ? new Date(now.getFullYear(), now.getMonth() - (index % 3), 8 + index).toISOString() : null,
    };
  });
  const payables = monthAxis(months).map((_, index) => ({
    id: `DEMO-PAY-${index}`,
    issueDate: new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 5).toISOString(),
    totalInvoiceAmount: 6_200 + index * 860 + (index % 3) * 800,
    supplierName: ['FORNECEDOR ALFA', 'DISTRIBUIDORA CENTRAL', 'SERVIÇOS BRASIL'][index % 3],
    status: index === months - 1 ? 'PENDING' : 'APPROVED',
  }));
  const products = names.map((name, index) => ({
    id: `DEMO-PRODUCT-${index}`,
    name,
    tracksInventory: index !== 6,
    currentStock: [82, 7, 24, 0, 11, 48, 0][index],
    minimumStock: [20, 12, 8, 5, 10, 15, 0][index],
    purchasePrice: [54, 32, 38, 90, 16, 12, 0][index],
    salePrice: [119, 79, 89, 189, 39, 34, 180][index],
  }));
  return { generatedAt: now.toISOString(), sales, receivables, payables, products, unavailable: [] };
}

function hasUsefulData(data: AnalyticsData | null) {
  return Boolean(data && [data.sales, data.receivables, data.payables, data.products].some((items) => items.length));
}

function screenId(view: AnalyticsView) {
  return `PRINCIPAL_FINANCEIRO_ANALISES_GRAFICOS_${view.replace(/-/g, '_').toUpperCase()}`;
}

function resolveHostOrigin() {
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    return new URL(document.referrer).origin;
  } catch {
    return null;
  }
}

function ChartPanel({
  title,
  subtitle,
  badge,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex min-h-[330px] min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="flex min-h-[70px] items-start justify-between gap-4 border-b border-slate-100 px-4 py-3.5">
        <div>
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">{subtitle}</p>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[9px] font-black uppercase text-blue-700">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="h-[258px] min-h-0 px-2 py-3">{children}</div>
    </section>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-xs font-bold text-slate-400">
      {label}
    </div>
  );
}

export default function FinanceAnalyticsDashboard({ view: requestedView }: { view: string }) {
  const view = (requestedView in VIEW_META ? requestedView : 'financeiro') as AnalyticsView;
  const meta = VIEW_META[view];
  const runtimeContext = useFinanceRuntimeContext();
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [hostOrigin, setHostOrigin] = useState<string | null>(null);

  useEffect(() => setHostOrigin(resolveHostOrigin()), []);

  useEffect(() => {
    const search = typeof window === 'undefined' ? '' : window.location.search;
    const expectsScope = new URLSearchParams(search).has('sourceSystem');
    if (expectsScope && (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId)) return;

    let active = true;
    const now = new Date();
    const dateFrom = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const baseQuery = buildFinanceApiQueryString(runtimeContext);
    const branchQuery = buildFinanceApiQueryString(runtimeContext, {
      sourceBranchCode: runtimeContext.sourceBranchCode,
    });
    const salesQuery = buildFinanceApiQueryString(runtimeContext, {
      sourceBranchCode: runtimeContext.sourceBranchCode,
      dateFrom: dateFrom.toISOString().slice(0, 10),
      dateTo: now.toISOString().slice(0, 10),
    });

    setLoading(true);
    setError('');
    void Promise.allSettled([
      getJson<Array<Record<string, any>>>(`/sales${salesQuery}`),
      getJson<Array<Record<string, any>>>(`/receivables/installments${baseQuery}`),
      getJson<Array<Record<string, any>>>(`/payables/invoice-imports${baseQuery}`),
      getJson<Array<Record<string, any>>>(`/products${branchQuery}`),
    ]).then((results) => {
      if (!active) return;
      const value = (index: number) => results[index]?.status === 'fulfilled'
        ? (results[index] as PromiseFulfilledResult<Array<Record<string, any>>>).value
        : [];
      const unavailable = ['sales', 'receivables', 'payables', 'products'].filter(
        (_, index) => results[index]?.status === 'rejected',
      );
      setData({
        generatedAt: new Date().toISOString(),
        sales: value(0),
        receivables: value(1),
        payables: value(2),
        products: value(3),
        unavailable,
      });
      if (unavailable.length === 4) setError('Não foi possível consultar o Financeiro agora.');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [months, refresh, runtimeContext.sourceBranchCode, runtimeContext.sourceSystem, runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (!runtimeContext.embedded) return;
    window.parent?.postMessage({ type: 'MSINFOR_SCREEN_CONTEXT', screenId: screenId(view) }, '*');
  }, [runtimeContext.embedded, view]);

  const usingDemo = !loading && !hasUsefulData(data);
  const source = useMemo(() => usingDemo ? buildDemoData(months) : data || buildDemoData(months), [data, months, usingDemo]);
  const { sales, receivables, payables, products } = source;

  const monthly = useMemo(() => monthAxis(months).map((period) => {
    const monthSales = sales.filter((sale) => {
      const date = dateValue(sale.confirmedAt || sale.createdAt);
      return date && monthKey(date) === period.key;
    });
    const revenue = monthSales.reduce((sum, sale) => sum + numeric(sale.totalAmount), 0);
    const immediate = monthSales.reduce((sum, sale) => sum + numeric(sale.paidAmount), 0);
    const settled = receivables.filter((item) => {
      const date = dateValue(item.settledAt);
      return date && monthKey(date) === period.key;
    }).reduce((sum, item) => sum + numeric(item.paidAmount || item.amount), 0);
    const expenses = payables.filter((item) => {
      const date = dateValue(item.issueDate || item.entryDate || item.createdAt);
      return date && monthKey(date) === period.key;
    }).reduce((sum, item) => sum + numeric(item.totalInvoiceAmount), 0);
    const entries = immediate + settled;
    return { month: period.label, revenue, entries, expenses, balance: entries - expenses };
  }), [months, payables, receivables, sales]);

  const accumulatedCash = useMemo(() => {
    let accumulated = 0;
    return monthly.map((item) => {
      accumulated += item.balance;
      return { ...item, accumulated };
    });
  }, [monthly]);

  const receivableSummary = useMemo(() => {
    const totals = { received: 0, open: 0, overdue: 0 };
    const now = new Date();
    receivables.forEach((item) => {
      const status = String(item.status || '').toUpperCase();
      const due = dateValue(item.dueDate);
      if (status === 'PAID' || status === 'SETTLED') totals.received += numeric(item.paidAmount || item.amount);
      else if (due && due < now) totals.overdue += numeric(item.openAmount || item.amount);
      else totals.open += numeric(item.openAmount || item.amount);
    });
    return totals;
  }, [receivables]);

  const receivablePie = [
    { name: 'Recebido', value: receivableSummary.received, color: COLORS.green },
    { name: 'A vencer', value: receivableSummary.open, color: COLORS.blue },
    { name: 'Vencido', value: receivableSummary.overdue, color: COLORS.rose },
  ];

  const aging = useMemo(() => {
    const groups = [
      { name: '1-15 dias', min: 1, max: 15, value: 0 },
      { name: '16-30 dias', min: 16, max: 30, value: 0 },
      { name: '31-60 dias', min: 31, max: 60, value: 0 },
      { name: '61-90 dias', min: 61, max: 90, value: 0 },
      { name: '+90 dias', min: 91, max: Infinity, value: 0 },
    ];
    receivables.forEach((item) => {
      if (String(item.status || '').toUpperCase() !== 'OPEN') return;
      const due = dateValue(item.dueDate);
      if (!due) return;
      const days = overdueDays(due);
      const group = groups.find((candidate) => days >= candidate.min && days <= candidate.max);
      if (group) group.value += numeric(item.openAmount || item.amount);
    });
    return groups;
  }, [receivables]);

  const forecast = useMemo(() => monthAxis(6, true).map((period) => ({
    month: period.label,
    value: receivables.filter((item) => {
      const due = dateValue(item.dueDate);
      return String(item.status || '').toUpperCase() === 'OPEN' && due && monthKey(due) === period.key;
    }).reduce((sum, item) => sum + numeric(item.openAmount || item.amount), 0),
  })), [receivables]);

  const topDebtors = useMemo(() => {
    const totals = new Map<string, number>();
    receivables.forEach((item) => {
      if (String(item.status || '').toUpperCase() !== 'OPEN') return;
      const name = String(item.payerNameSnapshot || item.sourceEntityName || 'CLIENTE').toUpperCase();
      totals.set(name, (totals.get(name) || 0) + numeric(item.openAmount || item.amount));
    });
    return Array.from(totals, ([name, value]) => ({ name: name.slice(0, 22), value })).sort((a, b) => b.value - a.value).slice(0, 7);
  }, [receivables]);

  const payableMonthly = useMemo(() => monthAxis(months).map((period) => ({
    month: period.label,
    value: payables.filter((item) => {
      const date = dateValue(item.issueDate || item.entryDate || item.createdAt);
      return date && monthKey(date) === period.key;
    }).reduce((sum, item) => sum + numeric(item.totalInvoiceAmount), 0),
  })), [months, payables]);

  const payableStatus = useMemo(() => {
    const statuses = new Map<string, number>();
    payables.forEach((item) => {
      const status = String(item.statusLabel || item.status || 'PENDENTE').toUpperCase();
      statuses.set(status, (statuses.get(status) || 0) + numeric(item.totalInvoiceAmount));
    });
    const palette = [COLORS.green, COLORS.amber, COLORS.violet, COLORS.rose];
    return Array.from(statuses, ([name, value], index) => ({ name, value, color: palette[index % palette.length] }));
  }, [payables]);

  const topSuppliers = useMemo(() => {
    const totals = new Map<string, number>();
    payables.forEach((item) => {
      const name = String(item.supplierName || 'FORNECEDOR NÃO INFORMADO').toUpperCase();
      totals.set(name, (totals.get(name) || 0) + numeric(item.totalInvoiceAmount));
    });
    return Array.from(totals, ([name, value]) => ({ name: name.slice(0, 23), value })).sort((a, b) => b.value - a.value).slice(0, 7);
  }, [payables]);

  const productPerformance = useMemo(() => {
    const totals = new Map<string, { name: string; revenue: number; sold: number }>();
    sales.forEach((sale) => (Array.isArray(sale.items) ? sale.items : []).forEach((item: Record<string, any>) => {
      const name = String(item.productName || item.description || 'PRODUTO').toUpperCase();
      const current = totals.get(name) || { name, revenue: 0, sold: 0 };
      current.revenue += numeric(item.totalAmount);
      current.sold += numeric(item.quantity);
      totals.set(name, current);
    }));
    return Array.from(totals.values()).sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  const abc = useMemo(() => {
    const total = productPerformance.reduce((sum, item) => sum + item.revenue, 0) || 1;
    let accumulated = 0;
    return productPerformance.slice(0, 10).map((item) => {
      accumulated += item.revenue;
      const percentage = (accumulated / total) * 100;
      return {
        name: item.name.length > 17 ? `${item.name.slice(0, 16)}…` : item.name,
        revenue: item.revenue,
        sold: item.sold,
        accumulated: percentage,
        class: percentage <= 80 ? 'A' : percentage <= 95 ? 'B' : 'C',
      };
    });
  }, [productPerformance]);

  const abcClasses = ['A', 'B', 'C'].map((className, index) => ({
    name: `Classe ${className}`,
    value: abc.filter((item) => item.class === className).reduce((sum, item) => sum + item.revenue, 0),
    color: [COLORS.green, COLORS.amber, COLORS.rose][index],
  }));

  const stockHealth = useMemo(() => {
    const values = { ok: 0, low: 0, out: 0 };
    products.forEach((product) => {
      if (product.tracksInventory === false) return;
      const stock = numeric(product.currentStock);
      const minimum = numeric(product.minimumStock);
      if (stock <= 0) values.out += 1;
      else if (stock <= minimum) values.low += 1;
      else values.ok += 1;
    });
    return [
      { name: 'Saudável', value: values.ok, color: COLORS.green },
      { name: 'Estoque baixo', value: values.low, color: COLORS.amber },
      { name: 'Sem estoque', value: values.out, color: COLORS.rose },
    ];
  }, [products]);

  const stockValue = useMemo(() => products.filter((item) => item.tracksInventory !== false).map((item) => ({
    name: String(item.name || 'PRODUTO').toUpperCase().slice(0, 22),
    value: numeric(item.currentStock) * numeric(item.purchasePrice),
  })).sort((a, b) => b.value - a.value).slice(0, 7), [products]);

  const lowStock = useMemo(() => products.filter((item) => item.tracksInventory !== false && numeric(item.currentStock) <= numeric(item.minimumStock)).map((item) => ({
    name: String(item.name || 'PRODUTO').toUpperCase().slice(0, 22),
    stock: numeric(item.currentStock),
    minimum: numeric(item.minimumStock),
  })).slice(0, 7), [products]);

  const paymentMethods = useMemo(() => {
    const totals = new Map<string, number>();
    sales.forEach((sale) => (Array.isArray(sale.payments) ? sale.payments : []).forEach((payment: Record<string, any>) => {
      const name = String(payment.paymentMethodLabel || payment.paymentMethod || 'OUTROS').toUpperCase();
      totals.set(name, (totals.get(name) || 0) + numeric(payment.amount));
    }));
    const palette = [COLORS.blue, COLORS.green, COLORS.amber, COLORS.violet, COLORS.cyan];
    return Array.from(totals, ([name, value], index) => ({ name, value, color: palette[index % palette.length] }));
  }, [sales]);

  const topCustomers = useMemo(() => {
    const totals = new Map<string, number>();
    sales.forEach((sale) => {
      const name = String(sale.customerName || sale.sourceEntityName || 'CONSUMIDOR').toUpperCase();
      totals.set(name, (totals.get(name) || 0) + numeric(sale.totalAmount));
    });
    return Array.from(totals, ([name, value]) => ({ name: name.slice(0, 22), value })).sort((a, b) => b.value - a.value).slice(0, 7);
  }, [sales]);

  const totalSales = monthly.reduce((sum, item) => sum + item.revenue, 0);
  const totalReceivable = receivableSummary.open + receivableSummary.overdue;
  const totalPayable = payableMonthly.reduce((sum, item) => sum + item.value, 0);
  const stockAlerts = stockHealth[1].value + stockHealth[2].value;
  const delinquency = totalReceivable ? (receivableSummary.overdue / totalReceivable) * 100 : 0;
  const coverage = totalPayable ? (totalReceivable / totalPayable) * 100 : totalReceivable ? 100 : 0;
  const latestBalance = monthly[monthly.length - 1]?.balance || 0;
  const health = Math.max(0, Math.min(100, Math.round(65 + Math.min(25, coverage / 5) - Math.min(55, delinquency))));
  const averageTicket = sales.length ? totalSales / sales.length : 0;
  const totalStockValue = stockValue.reduce((sum, item) => sum + item.value, 0);

  const kpis = [
    { label: 'Faturamento', value: money.format(totalSales), note: `${sales.length} venda(s)`, color: 'border-blue-500 text-blue-700 bg-blue-50' },
    { label: 'Carteira a receber', value: money.format(totalReceivable), note: `${money.format(receivableSummary.overdue)} vencido`, color: 'border-amber-500 text-amber-700 bg-amber-50' },
    { label: 'Compromissos', value: money.format(totalPayable), note: `${payables.length} documento(s)`, color: 'border-violet-500 text-violet-700 bg-violet-50' },
    { label: 'Alertas de estoque', value: quantity.format(stockAlerts), note: `${products.length} produto(s)`, color: 'border-rose-500 text-rose-700 bg-rose-50' },
  ];

  const chartTooltip = (value: unknown) => money.format(numeric(value));
  const axisMoney = (value: number) => compactMoney.format(value);

  const pieChart = (items: Array<{ name: string; value: number; color: string }>, emptyLabel: string) => items.some((item) => item.value > 0) ? (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={items} dataKey="value" nameKey="name" innerRadius={55} outerRadius={84} paddingAngle={3}>
          {items.map((item) => <Cell key={item.name} fill={item.color} />)}
        </Pie>
        <Tooltip formatter={chartTooltip} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
      </PieChart>
    </ResponsiveContainer>
  ) : <EmptyChart label={emptyLabel} />;

  function chartsForView() {
    if (view === 'contas-a-receber') return (
      <>
        <ChartPanel title="Composição da carteira" subtitle="Recebido, a vencer e vencido" badge={money.format(totalReceivable)}>{pieChart(receivablePie, 'Sem parcelas a receber')}</ChartPanel>
        <ChartPanel title="Aging da inadimplência" subtitle="Valores vencidos por faixa de atraso" badge={`${delinquency.toFixed(1)}%`}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={aging} layout="vertical" margin={{ left: 8, right: 12 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={76} tick={{ fontSize: 9 }} /><Tooltip formatter={chartTooltip} /><Bar dataKey="value" name="Em atraso" fill={COLORS.rose} radius={[0, 4, 4, 0]} maxBarSize={20} /></BarChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Previsão de recebimentos" subtitle="Parcelas abertas pelos próximos seis meses" wide>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={forecast}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Area dataKey="value" name="A receber" stroke={COLORS.blue} fill="#dbeafe" strokeWidth={3} /></AreaChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Maiores carteiras em aberto" subtitle="Clientes com maior saldo a receber" wide>
          {topDebtors.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={topDebtors} layout="vertical" margin={{ left: 20, right: 18 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 9 }} /><Tooltip formatter={chartTooltip} /><Bar dataKey="value" name="Saldo" fill={COLORS.amber} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Sem clientes com saldo em aberto" />}
        </ChartPanel>
      </>
    );

    if (view === 'contas-a-pagar') return (
      <>
        <ChartPanel title="Compromissos por mês" subtitle="Notas e obrigações registradas" badge={money.format(totalPayable)} wide>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={payableMonthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Bar dataKey="value" name="Contas a pagar" fill={COLORS.violet} radius={[4, 4, 0, 0]} maxBarSize={40} /></BarChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Situação dos documentos" subtitle="Distribuição por status">{pieChart(payableStatus, 'Sem documentos no contas a pagar')}</ChartPanel>
        <ChartPanel title="Principais fornecedores" subtitle="Volume financeiro por fornecedor">
          {topSuppliers.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={topSuppliers} layout="vertical" margin={{ left: 20, right: 12 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 9 }} /><Tooltip formatter={chartTooltip} /><Bar dataKey="value" name="Compras" fill={COLORS.orange} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Sem fornecedores no período" />}
        </ChartPanel>
        <ChartPanel title="Tendência dos compromissos" subtitle="Evolução mensal das obrigações" wide>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={payableMonthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Line dataKey="value" name="Compromissos" stroke={COLORS.violet} strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>
        </ChartPanel>
      </>
    );

    if (view === 'vendas') return (
      <>
        <ChartPanel title="Evolução das vendas" subtitle="Faturamento confirmado por mês" badge={money.format(totalSales)} wide>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Area dataKey="revenue" name="Vendas" stroke={COLORS.cyan} fill="#cffafe" strokeWidth={3} /></AreaChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Produtos por faturamento" subtitle="Itens com maior receita">
          {abc.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={abc.slice(0, 7)} layout="vertical" margin={{ left: 15, right: 12 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} /><Tooltip formatter={chartTooltip} /><Bar dataKey="revenue" name="Faturamento" fill={COLORS.teal} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Sem produtos vendidos" />}
        </ChartPanel>
        <ChartPanel title="Formas de pagamento" subtitle="Participação no valor vendido">{pieChart(paymentMethods, 'Sem pagamentos no período')}</ChartPanel>
        <ChartPanel title="Principais clientes" subtitle="Faturamento acumulado por cliente" wide>
          {topCustomers.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={topCustomers} layout="vertical" margin={{ left: 15, right: 12 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} /><Tooltip formatter={chartTooltip} /><Bar dataKey="value" name="Faturamento" fill={COLORS.blue} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Sem clientes no período" />}
        </ChartPanel>
      </>
    );

    if (view === 'estoque') return (
      <>
        <ChartPanel title="Saúde do estoque" subtitle="Disponibilidade dos produtos" badge={`${stockAlerts} alertas`}>{pieChart(stockHealth, 'Nenhum produto com controle de estoque')}</ChartPanel>
        <ChartPanel title="Valor imobilizado" subtitle="Custo estimado por produto" badge={money.format(totalStockValue)}>
          {stockValue.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={stockValue} layout="vertical" margin={{ left: 18, right: 12 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} /><Tooltip formatter={chartTooltip} /><Bar dataKey="value" name="Valor em estoque" fill={COLORS.violet} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Sem valor de estoque calculado" />}
        </ChartPanel>
        <ChartPanel title="Produtos abaixo do mínimo" subtitle="Estoque atual comparado ao mínimo" wide>
          {lowStock.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={lowStock}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="stock" name="Atual" fill={COLORS.rose} radius={[4, 4, 0, 0]} /><Bar dataKey="minimum" name="Mínimo" fill={COLORS.amber} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Nenhum produto abaixo do estoque mínimo" />}
        </ChartPanel>
        <ChartPanel title="Produtos de maior giro" subtitle="Quantidade vendida no período" wide>
          {abc.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={abc.slice(0, 8)} layout="vertical" margin={{ left: 16, right: 12 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 9 }} /><Tooltip formatter={(value) => `${quantity.format(numeric(value))} unidade(s)`} /><Bar dataKey="sold" name="Quantidade" fill={COLORS.blue} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Sem giro no período" />}
        </ChartPanel>
      </>
    );

    if (view === 'curva-abc') return (
      <>
        <ChartPanel title="Curva ABC de produtos" subtitle="Receita e participação acumulada" badge={`${abc.length} produtos`} wide>
          {abc.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={abc} margin={{ bottom: 25 }}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" angle={-18} textAnchor="end" interval={0} height={55} tick={{ fontSize: 8 }} /><YAxis yAxisId="money" tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><YAxis yAxisId="percent" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 9 }} width={42} /><Tooltip formatter={(value, name) => name === 'Acumulado' ? `${numeric(value).toFixed(1)}%` : chartTooltip(value)} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar yAxisId="money" dataKey="revenue" name="Receita" fill={COLORS.teal} radius={[4, 4, 0, 0]} /><Line yAxisId="percent" dataKey="accumulated" name="Acumulado" stroke={COLORS.orange} strokeWidth={3} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer> : <EmptyChart label="Sem vendas para calcular a curva ABC" />}
        </ChartPanel>
        <ChartPanel title="Participação por classe" subtitle="Receita concentrada nas classes A, B e C">{pieChart(abcClasses, 'Sem classificação ABC')}</ChartPanel>
        <ChartPanel title="Ranking de faturamento" subtitle="Produtos mais relevantes">
          {abc.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={abc.slice(0, 7)} layout="vertical" margin={{ left: 14, right: 12 }}><XAxis type="number" tickFormatter={axisMoney} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} /><Tooltip formatter={chartTooltip} /><Bar dataKey="revenue" name="Receita" fill={COLORS.green} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Sem produtos classificados" />}
        </ChartPanel>
        <ChartPanel title="Quantidade por produto" subtitle="Volume vendido no período" wide>
          {abc.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={abc.slice(0, 10)}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 8 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip formatter={(value) => `${quantity.format(numeric(value))} unidade(s)`} /><Bar dataKey="sold" name="Quantidade" fill={COLORS.blue} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart label="Sem quantidades vendidas" />}
        </ChartPanel>
      </>
    );

    if (view === 'fluxo-caixa') return (
      <>
        <ChartPanel title="Entradas x saídas" subtitle="Movimentação mensal consolidada" wide>
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="entries" name="Entradas" fill={COLORS.green} radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Saídas" fill={COLORS.rose} radius={[4, 4, 0, 0]} /><Line dataKey="balance" name="Saldo" stroke={COLORS.navy} strokeWidth={3} /></ComposedChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Saldo mensal" subtitle="Resultado líquido do período">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Bar dataKey="balance" name="Saldo" fill={COLORS.cyan} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Saldo acumulado" subtitle="Efeito progressivo do fluxo de caixa">
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={accumulatedCash}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Area dataKey="accumulated" name="Acumulado" stroke={COLORS.violet} fill="#ede9fe" strokeWidth={3} /></AreaChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Entradas por forma de pagamento" subtitle="Composição dos recebimentos" wide>{pieChart(paymentMethods, 'Sem entradas classificadas')}</ChartPanel>
      </>
    );

    if (view === 'saude-financeira') return (
      <>
        <ChartPanel title="Índice de saúde financeira" subtitle="Cobertura, inadimplência e resultado" badge={`${health}/100`}>
          <div className="relative h-full"><ResponsiveContainer width="100%" height="100%"><RadialBarChart data={[{ value: health, fill: health >= 70 ? COLORS.green : health >= 45 ? COLORS.amber : COLORS.rose }]} innerRadius="72%" outerRadius="100%" startAngle={180} endAngle={0}><PolarAngleAxis type="number" domain={[0, 100]} tick={false} /><RadialBar dataKey="value" background={{ fill: '#e5e7eb' }} cornerRadius={8} /></RadialBarChart></ResponsiveContainer><div className="pointer-events-none absolute inset-x-0 bottom-9 text-center"><strong className="block text-4xl font-black text-slate-900">{health}</strong><span className="text-[10px] font-black uppercase text-slate-500">{health >= 70 ? 'Saudável' : health >= 45 ? 'Atenção' : 'Crítica'}</span></div></div>
        </ChartPanel>
        <ChartPanel title="Indicadores de cobertura" subtitle="Índices financeiros essenciais">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: 'Cobertura', value: Math.min(150, coverage) }, { name: 'Inadimplência', value: delinquency }, { name: 'Estoque em alerta', value: products.length ? (stockAlerts / products.length) * 100 : 0 }]}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} /><YAxis domain={[0, 150]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 9 }} /><Tooltip formatter={(value) => `${numeric(value).toFixed(1)}%`} /><Bar dataKey="value" name="Índice" fill={COLORS.blue} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Risco da carteira" subtitle="Valores a vencer e vencidos">{pieChart(receivablePie, 'Sem carteira financeira')}</ChartPanel>
        <ChartPanel title="Tendência do resultado" subtitle="Saldo operacional ao longo do período" wide>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={monthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Line dataKey="balance" name="Resultado" stroke={COLORS.navy} strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>
        </ChartPanel>
      </>
    );

    return (
      <>
        <ChartPanel title="Entradas, compromissos e saldo" subtitle="Visão financeira consolidada" wide>
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="entries" name="Entradas" fill={COLORS.green} radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Compromissos" fill={COLORS.amber} radius={[4, 4, 0, 0]} /><Line dataKey="balance" name="Saldo" stroke={COLORS.navy} strokeWidth={3} /></ComposedChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Carteira a receber" subtitle="Distribuição dos recebíveis">{pieChart(receivablePie, 'Sem carteira a receber')}</ChartPanel>
        <ChartPanel title="Contas a pagar" subtitle="Compromissos mensais">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={payableMonthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Bar dataKey="value" name="Compromissos" fill={COLORS.violet} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Evolução das vendas" subtitle="Faturamento confirmado" wide>
          <ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly}><CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tickFormatter={axisMoney} tick={{ fontSize: 9 }} width={65} /><Tooltip formatter={chartTooltip} /><Area dataKey="revenue" name="Vendas" stroke={COLORS.cyan} fill="#cffafe" strokeWidth={3} /></AreaChart></ResponsiveContainer>
        </ChartPanel>
      </>
    );
  }

  const preserved = buildFinanceNavigationQueryString(runtimeContext);
  const backHref = runtimeContext.embedded && hostOrigin
    ? `${hostOrigin}/principal/financeiro/analises-graficos`
    : `/analises-graficos${preserved}`;
  const backTarget = runtimeContext.embedded && hostOrigin ? '_top' : undefined;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {backTarget ? (
            <a href={backHref} target={backTarget} rel="noreferrer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-black text-slate-700" title="Voltar à central de análises">←</a>
          ) : (
            <Link href={backHref} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-black text-slate-700" title="Voltar à central de análises">←</Link>
          )}
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-700">Análises e gráficos</div>
            <h1 className="truncate text-xl font-black text-slate-900">{meta.title}</h1>
            <p className="truncate text-[11px] font-semibold text-slate-500">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {usingDemo ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[9px] font-black uppercase text-amber-700">Dados demonstrativos</span> : null}
          {source.unavailable.length ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[9px] font-black uppercase text-rose-700">Integração parcial</span> : null}
          <div className="inline-grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {[3, 6, 12].map((period) => <button key={period} type="button" onClick={() => setMonths(period)} className={`h-9 min-w-16 border-r border-slate-200 px-2 text-[10px] font-black last:border-r-0 ${months === period ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{period} meses</button>)}
          </div>
          <button type="button" onClick={() => setRefresh((value) => value + 1)} className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-base font-black text-blue-700" title="Atualizar análises" aria-label="Atualizar análises">↻</button>
        </div>
      </div>

      {error && !usingDemo ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {kpis.map((item) => (
          <article key={item.label} className={`min-h-28 rounded-lg border border-t-4 bg-white p-3 shadow-sm ${item.color}`}>
            <span className="block text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">{item.label}</span>
            <strong className="mt-3 block truncate text-2xl font-black text-slate-900">{loading ? '—' : item.value}</strong>
            <small className="mt-2 block text-[10px] font-bold text-slate-500">{item.note}</small>
          </article>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{chartsForView()}</div>

      <div className="flex items-center justify-end gap-2 text-[10px] font-semibold text-slate-500">
        Atualizado em {new Date(source.generatedAt).toLocaleString('pt-BR')}
      </div>

      {!runtimeContext.embedded ? (
        <ScreenNameCopy
          screenId={screenId(view)}
          className="justify-end"
          originText={`Origem: Sistema Financeiro - caminho fisico: C:/Sistemas/IA/Financeiro/frontend/src/app/analises-graficos/[view]/page.tsx - area: ${view}`}
        />
      ) : null}
    </div>
  );
}
