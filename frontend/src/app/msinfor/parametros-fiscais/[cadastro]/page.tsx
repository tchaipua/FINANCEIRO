import { notFound } from 'next/navigation';
import FiscalParameterDetailPage from '../fiscal-parameter-detail-page';
import { findFiscalParameterCatalogItem } from '../fiscal-parameter-catalog';

export default async function FiscalParameterRegistrationPage({
  params,
}: {
  params: Promise<{ cadastro: string }>;
}) {
  const { cadastro } = await params;
  const item = findFiscalParameterCatalogItem(String(cadastro || '').toLowerCase());

  if (!item || item.href) {
    notFound();
  }

  return <FiscalParameterDetailPage item={item} />;
}
