import FinanceAnalyticsDashboard from '@/app/components/finance-analytics-dashboard';

export default async function FinanceAnalyticsViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  return <FinanceAnalyticsDashboard view={String(view || '').toLowerCase()} />;
}
