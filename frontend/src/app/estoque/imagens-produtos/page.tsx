'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_ESTOQUE_IMAGENS_PRODUTOS';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\estoque\\imagens-produtos\\page.tsx';
const LOCAL_IMAGE_BASE_URL = 'http://127.0.0.1:47821/imagens';
const IMAGE_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'bmp'] as const;
const PAGE_SIZE = 10;

type ProductItem = {
  id: string;
  name: string;
  internalCode?: string | null;
  sku?: string | null;
  barcode?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | string;
};

type LocalImageState = {
  available: boolean;
  url: string | null;
};

function normalizeBarcode(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '');
}

function getEanType(barcode: string | null | undefined) {
  const normalized = normalizeBarcode(barcode);
  if (normalized.length === 8) return 'EAN-8';
  if (normalized.length === 13) return 'EAN-13';
  return null;
}

function buildImageUrl(barcode: string, extension: (typeof IMAGE_EXTENSIONS)[number]) {
  return `${LOCAL_IMAGE_BASE_URL}/${encodeURIComponent(`${barcode}.${extension}`)}`;
}

function ProductImagePreview({
  barcode,
  productName,
  onResolved,
}: {
  barcode: string | null | undefined;
  productName: string;
  onResolved: (state: LocalImageState) => void;
}) {
  const normalizedBarcode = normalizeBarcode(barcode);
  const [extensionIndex, setExtensionIndex] = useState(0);

  useEffect(() => {
    setExtensionIndex(0);
  }, [normalizedBarcode]);

  useEffect(() => {
    if (!getEanType(normalizedBarcode)) {
      onResolved({ available: false, url: null });
    }
  }, [normalizedBarcode, onResolved]);

  const imageUrl = getEanType(normalizedBarcode)
    ? buildImageUrl(normalizedBarcode, IMAGE_EXTENSIONS[extensionIndex])
    : null;

  if (!imageUrl) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-400" title="Produto sem EAN-8 ou EAN-13">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m4 18 5-5 3.5 3.5 2.5-2.5L20 18" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={`Imagem de ${productName}`}
      className="h-12 w-12 rounded-xl border border-slate-200 bg-white object-contain p-1 shadow-sm"
      onLoad={() => onResolved({ available: true, url: imageUrl })}
      onError={() => {
        if (extensionIndex < IMAGE_EXTENSIONS.length - 1) {
          setExtensionIndex((current) => current + 1);
          return;
        }
        onResolved({ available: false, url: null });
      }}
    />
  );
}

const auditText = `--- LOGICA DA TELA ---
Esta tela confere se cada produto possui imagem disponível no agente local instalado no computador do cliente.

TABELAS PRINCIPAIS:
- companies (CO) - empresa financeira identificada pelo sistema e tenant de origem.
- products (PR) - produtos, códigos internos e códigos de barras.

RELACIONAMENTOS:
- products.companyId -> companies.id.

METRICAS / CAMPOS EXIBIDOS:
- produto, código interno e código de barras.
- identificação EAN-8/EAN-13.
- situação da imagem na pasta configurada pelo agente local.
- atalho para pesquisar imagens pelo EAN na web.

FILTROS APLICADOS AGORA:
- empresa por sourceSystem/sourceTenantId.
- filial atual por sourceBranchCode.
- busca local por produto, código interno ou código de barras.

ORDENACAO:
- products.name ASC.

ENDPOINTS / BASE LOGICA:
- GET /products.
- GET http://127.0.0.1:47821/imagens/{EAN}.{EXTENSAO}.

OBSERVACAO:
- a imagem não é gravada nem enviada para o Financeiro. A tela consulta somente o agente local e aceita WEBP, PNG, JPG, JPEG e BMP com o nome igual ao EAN-8/EAN-13 do produto.`;

export default function FinanceiroEstoqueImagensProdutosPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [imageStates, setImageStates] = useState<Record<string, LocalImageState>>({});
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setProducts([]);
      setImageStates({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await getJson<ProductItem[]>(
        `/products${buildFinanceApiQueryString(runtimeContext, { status: 'ACTIVE' })}`,
      );
      setProducts([...result].sort((first, second) => first.name.localeCompare(second.name, 'pt-BR')));
      setImageStates({});
    } catch {
      setProducts([]);
      setImageStates({});
      setErrorMessage('Não foi possível carregar os produtos para conferir as imagens.');
    } finally {
      setIsLoading(false);
    }
  }, [runtimeContext]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!runtimeContext.embedded) return;
    window.parent?.postMessage({ type: 'MSINFOR_SCREEN_CONTEXT', screenId: SCREEN_ID }, '*');
  }, [runtimeContext.embedded]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toUpperCase();
    if (!normalizedSearch) return products;
    return products.filter((product) =>
      [product.name, product.internalCode, product.sku, product.barcode]
        .filter(Boolean)
        .some((value) => String(value).toUpperCase().includes(normalizedSearch)),
    );
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const visibleProducts = filteredProducts.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );
  const validEanProducts = filteredProducts.filter((product) => Boolean(getEanType(product.barcode)));
  const availableImageCount = validEanProducts.filter(
    (product) => imageStates[product.id]?.available,
  ).length;

  function handleImageResolved(productId: string, state: LocalImageState) {
    setImageStates((current) => {
      const previous = current[productId];
      if (previous?.available === state.available && previous?.url === state.url) return current;
      return { ...current, [productId]: state };
    });
  }

  function searchImagesOnWeb(barcode: string) {
    const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(barcode)}`;
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-col gap-4 p-4 sm:p-6">
      <section className="shrink-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl bg-violet-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
              Imagens locais dos produtos
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
              EAN válido: {validEanProducts.length}
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
              Imagens localizadas: {availableImageCount}
            </div>
          </div>
          <label className="relative block w-full lg:max-w-md">
            <span className="sr-only">Pesquisar produto ou código</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="PESQUISAR PRODUTO OU CÓDIGO"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 pr-11 text-xs font-bold uppercase tracking-wide text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white"
            />
            <svg className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="6" />
              <path strokeLinecap="round" d="m16 16 4 4" />
            </svg>
          </label>
        </div>
      </section>

      {errorMessage ? (
        <div className="shrink-0 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[780px] w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
              <tr>
                <th className="w-20 px-4 py-3">Imagem</th>
                <th className="px-4 py-3">Produto</th>
                <th className="w-40 px-4 py-3">Código interno</th>
                <th className="w-48 px-4 py-3">Código de barras</th>
                <th className="w-40 px-4 py-3">Situação</th>
                <th className="w-36 px-4 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm font-bold text-slate-500">CARREGANDO PRODUTOS...</td></tr>
              ) : visibleProducts.length ? (
                visibleProducts.map((product, index) => {
                  const eanType = getEanType(product.barcode);
                  const imageState = imageStates[product.id];
                  return (
                    <tr key={product.id} className={index % 2 ? 'bg-slate-100/70' : 'bg-white'}>
                      <td className="px-4 py-3">
                        <ProductImagePreview
                          barcode={product.barcode}
                          productName={product.name}
                          onResolved={(state) => handleImageResolved(product.id, state)}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-black uppercase text-slate-800">{product.name}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-600">{product.internalCode || '---'}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-black text-slate-700">{product.barcode || 'SEM CÓDIGO'}</div>
                        <div className={`mt-1 text-[9px] font-black uppercase tracking-[0.12em] ${eanType ? 'text-blue-600' : 'text-rose-600'}`}>
                          {eanType || 'INFORME EAN-8 OU EAN-13'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {!eanType ? (
                          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">SEM EAN VÁLIDO</span>
                        ) : imageState?.available ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">COM IMAGEM</span>
                        ) : imageState ? (
                          <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700">SEM IMAGEM</span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">CONFERINDO...</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={!eanType}
                          onClick={() => searchImagesOnWeb(normalizeBarcode(product.barcode))}
                          title={eanType ? `Pesquisar imagens do ${eanType} ${product.barcode}` : 'Informe um EAN-8 ou EAN-13 para pesquisar'}
                          aria-label={eanType ? `Pesquisar imagens do produto ${product.name}` : 'Produto sem EAN válido para pesquisar'}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <circle cx="11" cy="11" r="6" />
                            <path strokeLinecap="round" d="m16 16 4 4" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm font-bold text-slate-500">NENHUM PRODUTO FOI LOCALIZADO.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <span className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 shadow-sm">
            Total registros: {filteredProducts.length}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCurrentPage(1)} disabled={safeCurrentPage === 1} className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-600 disabled:opacity-40">&lt;&lt;</button>
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-600 disabled:opacity-40">&lt;</button>
            <span className="min-w-20 text-center text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{safeCurrentPage}/{totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-600 disabled:opacity-40">&gt;</button>
            <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage === totalPages} className="h-8 min-w-8 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-black text-slate-600 disabled:opacity-40">&gt;&gt;</button>
          </div>
        </footer>
      </section>

      {!runtimeContext.embedded ? (
        <section className="shrink-0 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" originText={ORIGIN_TEXT} auditText={auditText} />
        </section>
      ) : null}
    </div>
  );
}
