'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_ESTOQUE_IMAGENS_PRODUTOS';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:\\Sistemas\\IA\\Financeiro\\frontend\\src\\app\\estoque\\imagens-produtos\\page.tsx';
const LOCAL_IMAGE_BASE_URL = 'http://127.0.0.1:47821/imagens';
const IMAGE_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'bmp'] as const;
const LOCAL_IMAGE_AGENT_URL = 'http://127.0.0.1:47821';
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

type S3Configuration = {
  imagesFolder?: string;
};

type LocalImageAgentConfiguration = {
  imagesDirectory?: string;
};

type ImageSearchItem = {
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
};

function normalizeBarcode(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeProductCode(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
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
  productCode,
  productName,
  imageUrlOverride,
  noImage,
  onPreview,
  onResolved,
}: {
  productCode: string | null | undefined;
  productName: string;
  imageUrlOverride?: string | null;
  noImage?: boolean;
  onPreview: (imageUrl: string) => void;
  onResolved: (state: LocalImageState) => void;
}) {
  const normalizedProductCode = normalizeProductCode(productCode);
  const [extensionIndex, setExtensionIndex] = useState(0);
  const [cacheBuster] = useState(() => Date.now());

  useEffect(() => {
    setExtensionIndex(0);
  }, [normalizedProductCode]);

  useEffect(() => {
    if (!normalizedProductCode) {
      onResolved({ available: false, url: null });
    }
  }, [normalizedProductCode, onResolved]);

  const defaultImageUrl = normalizedProductCode
    ? `${buildImageUrl(normalizedProductCode, IMAGE_EXTENSIONS[extensionIndex])}?t=${cacheBuster}`
    : null;
  const imageUrl = imageUrlOverride || defaultImageUrl;

  if (!imageUrl || noImage) {
    return (
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${noImage ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
        {noImage ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
            <path strokeLinecap="round" d="M6 6 18 18M18 6 6 18" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m4 18 5-5 3.5 3.5 2.5-2.5L20 18" />
          </svg>
        )}
      </div>
    );
  }

  return (
    <button type="button" onClick={() => onPreview(imageUrl)} className="rounded-xl" title="Ampliar imagem" aria-label={`Ampliar imagem de ${productName}`}>
      <img
        src={imageUrl}
        alt={`Imagem de ${productName}`}
        className="h-10 w-10 rounded-xl border border-slate-200 bg-white object-contain p-1 shadow-sm transition hover:border-violet-400 hover:ring-2 hover:ring-violet-100"
        onLoad={() => onResolved({ available: true, url: imageUrl })}
        onError={() => {
          if (extensionIndex < IMAGE_EXTENSIONS.length - 1) {
            setExtensionIndex((current) => current + 1);
            return;
          }
          onResolved({ available: false, url: null });
        }}
      />
    </button>
  );
}

function ImageReplacementModal({
  product,
  productCode,
  imageUrl,
  logoUrl,
  isSaving,
  errorMessage,
  onClose,
  onSave,
}: {
  product: ProductItem;
  productCode: string;
  imageUrl: string;
  logoUrl: string | null;
  isSaving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (url: string) => void;
}) {
  const [url, setUrl] = useState('');

  function openGoogleImages() {
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(productCode)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="image-replacement-title">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
              {logoUrl ? <img src={logoUrl} alt="Logotipo institucional" className="h-full w-full object-contain" /> : <img src="/logo-msinfor.jpg" alt="Logotipo MSINFOR" className="h-full w-full object-cover" />}
            </div>
            <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Manutenção da imagem</p>
            <h2 id="image-replacement-title" className="mt-1 text-lg font-black uppercase text-slate-800">{product.name}</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">Código pesquisado: {productCode}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full border border-slate-200 bg-white text-lg font-black text-slate-500" aria-label="Fechar manutenção da imagem">×</button>
        </header>

        <div className="grid gap-5 p-5 md:grid-cols-[140px_1fr]">
          <div className="flex flex-col items-center gap-2">
            <img src={imageUrl} alt={`Imagem atual de ${product.name}`} className="h-28 w-28 rounded-2xl border border-slate-200 bg-white object-contain p-2 shadow-sm" />
            <span className="text-center text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Imagem atual</span>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs font-bold leading-5 text-violet-900">
              Pesquise no Google Imagens usando o EAN quando ele for válido; caso contrário, use o código do produto. Na imagem escolhida, copie o endereço da imagem e cole abaixo para substituir a imagem atual.
            </div>
            <button type="button" onClick={openGoogleImages} className="w-full rounded-xl bg-violet-700 px-4 py-3 text-xs font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-violet-800">Abrir pesquisa no Google Imagens</button>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">URL da imagem escolhida</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="COLE A URL DA IMAGEM AQUI" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800 outline-none focus:border-violet-400 focus:bg-white" />
            </label>
            {errorMessage ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{errorMessage}</p> : null}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="mr-auto flex min-w-[220px] flex-col gap-1">
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Auditoria visual: gravação local via agente MSINFOR</span>
            <ScreenNameCopy screenId="FINANCEIRO_ESTOQUE_TROCAR_IMAGEM" originText="Origem: Sistema Financeiro - manutenção local de imagens de produtos" auditText="Popup exclusivo para pesquisar e substituir a imagem local do produto pelo código informado." className="justify-start" />
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase text-slate-600">Cancelar</button>
          <button type="button" disabled={isSaving || !url.trim()} onClick={() => onSave(url.trim())} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? 'Salvando...' : 'Sobrepor imagem'}</button>
        </footer>
      </section>
    </div>
  );
}

function ImageSelectionModal({
  product,
  searchCode,
  logoUrl,
  isSaving,
  onClose,
  onChoose,
}: {
  product: ProductItem;
  searchCode: string;
  logoUrl: string | null;
  isSaving: boolean;
  onClose: () => void;
  onChoose: (imageUrl: string) => void;
}) {
  const [items, setItems] = useState<ImageSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchOffset, setSearchOffset] = useState(0);

  useEffect(() => {
    setSearchOffset(0);
  }, [searchCode]);

  useEffect(() => {
    let active = true;

    async function loadImages() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const params = new URLSearchParams({
          q: searchCode,
          offset: String(searchOffset),
        });
        items.forEach((item) => params.append('exclude', item.imageUrl));
        const response = await fetch(`/api/image-search?${params.toString()}`, { cache: 'no-store' });
        const result = (await response.json().catch(() => null)) as { items?: ImageSearchItem[]; message?: string } | null;
        if (!response.ok) throw new Error(result?.message || 'Não foi possível buscar imagens agora.');
        if (active) setItems(result?.items || []);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Não foi possível buscar imagens agora.');
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadImages();
    return () => { active = false; };
  }, [searchCode, searchOffset]);

  return (
    <div data-system-message-root className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="image-selection-title">
      <section className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
              {logoUrl ? <img src={logoUrl} alt="Logotipo institucional" className="h-full w-full object-contain" /> : <img src="/logo-msinfor.jpg" alt="Logotipo MSINFOR" className="h-full w-full object-cover" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Selecionar imagem encontrada</p>
              <h2 id="image-selection-title" className="mt-1 text-lg font-black uppercase text-slate-800">{product.name}</h2>
              <p className="mt-1 text-xs font-bold text-slate-500">Pesquisa: {searchCode}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} className="h-9 w-9 rounded-full border border-slate-200 bg-white text-lg font-black text-slate-500 disabled:opacity-50" aria-label="Fechar seleção de imagem">×</button>
        </header>

        <div className="p-5">
          <p className="mb-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-xs font-bold leading-5 text-violet-900">
            Selecione uma das 10 imagens encontradas na web. Caso queira outras opções, use Procurar +10. A imagem só será gravada após a sua escolha.
          </p>
          {isLoading ? <p className="py-16 text-center text-sm font-bold text-slate-500">BUSCANDO IMAGENS...</p> : null}
          {errorMessage ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{errorMessage}</p> : null}
          {!isLoading && !errorMessage && !items.length ? <p className="py-16 text-center text-sm font-bold text-slate-500">NENHUMA IMAGEM FOI ENCONTRADA.</p> : null}
          {!isLoading && items.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {items.map((item, index) => (
                <button key={item.imageUrl} type="button" disabled={isSaving} onClick={() => onChoose(item.imageUrl)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-violet-400 hover:ring-2 hover:ring-violet-100 disabled:cursor-wait disabled:opacity-60" title="Usar esta imagem">
                  <img src={item.thumbnailUrl} alt={`Imagem encontrada ${index + 1} para ${product.name}`} className="aspect-square w-full bg-slate-100 object-contain p-2" />
                  <span className="block border-t border-slate-100 px-2 py-2 text-center text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 group-hover:text-violet-700">Usar imagem {index + 1}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <div className="mr-auto flex min-w-[220px] flex-col gap-1">
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Auditoria visual: seleção manual entre imagens encontradas na web</span>
            <ScreenNameCopy screenId="FINANCEIRO_ESTOQUE_SELECIONAR_IMAGEM" originText="Origem: Sistema Financeiro - seleção de imagem encontrada para produto" auditText="Popup exclusivo para consultar imagens encontradas na web e permitir que o operador escolha uma antes da gravação local." className="justify-start" />
          </div>
          <button type="button" onClick={() => setSearchOffset((current) => current + 10)} disabled={isSaving || isLoading} className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-black uppercase text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50">Procurar +10</button>
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase text-slate-600 disabled:opacity-50">Voltar</button>
        </footer>
      </section>
    </div>
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
- identificação do código usado para a imagem local.
- situação da imagem na pasta configurada pelo agente local.
- manutenção da imagem manual e seleção entre até 10 imagens encontradas pelo EAN válido ou, na ausência dele, pelo código interno do produto.

FILTROS APLICADOS AGORA:
- empresa por sourceSystem/sourceTenantId.
- filial atual por sourceBranchCode.
- busca local por produto, código interno ou código de barras.

ORDENACAO:
- products.name ASC.

ENDPOINTS / BASE LOGICA:
- GET /products.
- GET http://127.0.0.1:47821/imagens/{CODIGO}.{EXTENSAO}.
- POST http://127.0.0.1:47821/imagens/{CODIGO}/from-url.
- GET /api/image-search?q={EAN_OU_CODIGO}.

OBSERVACAO:
- a tela consulta e atualiza somente o agente local, aceitando WEBP, PNG, JPG, JPEG e BMP com o nome igual ao código do produto.`;

export default function FinanceiroEstoqueImagensProdutosPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [imageStates, setImageStates] = useState<Record<string, LocalImageState>>({});
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [replacementProduct, setReplacementProduct] = useState<ProductItem | null>(null);
  const [imageSelectionProduct, setImageSelectionProduct] = useState<ProductItem | null>(null);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [s3ImagesFolder, setS3ImagesFolder] = useState('');
  const [localImagesDirectory, setLocalImagesDirectory] = useState('');

  useEffect(() => {
    let active = true;

    const loadImageLocations = async () => {
      const localResult = await fetch(`${LOCAL_IMAGE_AGENT_URL}/configuracao`, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error('Agente local indisponível');
        return response.json() as Promise<LocalImageAgentConfiguration>;
      }).catch(() => null);

      if (!active) return;
      setLocalImagesDirectory(String(localResult?.imagesDirectory || '').trim());

      if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
        setS3ImagesFolder('');
        return;
      }

      const s3Result = await getJson<S3Configuration>(
        `/s3-control/configuration${buildFinanceApiQueryString(runtimeContext)}`,
      ).catch(() => null);
      if (active) setS3ImagesFolder(String(s3Result?.imagesFolder || '').trim());
    };

    void loadImageLocations();

    return () => { active = false; };
  }, [runtimeContext]);

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

  function getProductImageCode(product: ProductItem) {
    return normalizeProductCode(product.internalCode || product.sku || product.barcode);
  }

  function getProductSearchCode(product: ProductItem) {
    const normalizedEan = normalizeBarcode(product.barcode);
    return getEanType(product.barcode) ? normalizedEan : getProductImageCode(product);
  }

  function openImageReplacement(product: ProductItem) {
    setReplacementError(null);
    setImageSelectionProduct(null);
    setReplacementProduct(product);
  }

  function openImageSelection(product: ProductItem) {
    setReplacementError(null);
    setReplacementProduct(null);
    setImageSelectionProduct(product);
  }

  function openProductEdit(product: ProductItem) {
    const params = new URLSearchParams(
      buildFinanceNavigationQueryString(runtimeContext).replace(/^\?/, ''),
    );
    params.set('editProductId', product.id);
    params.set('returnTo', 'IMAGES_PRODUCTS');
    window.location.assign(`/produtos?${params.toString()}`);
  }

  async function replaceProductImage(url: string, product = replacementProduct) {
    if (!product) return;
    const productCode = getProductImageCode(product);
    if (!productCode) {
      setReplacementError('O produto não possui código válido para gravar a imagem.');
      return;
    }

    setIsReplacing(true);
    setReplacementError(null);
    try {
      const response = await fetch(`${LOCAL_IMAGE_AGENT_URL}/imagens/${encodeURIComponent(productCode)}/from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const result = (await response.json().catch(() => null)) as { message?: string; fileName?: string } | null;
      if (!response.ok) {
        throw new Error(result?.message || 'Não foi possível substituir a imagem.');
      }

      setImageStates((current) => ({
        ...current,
        [product.id]: {
          available: true,
          url: `${LOCAL_IMAGE_AGENT_URL}/imagens/${encodeURIComponent(result?.fileName || `${productCode}.webp`)}?t=${Date.now()}`,
        },
      }));
      setReplacementProduct(null);
      setImageSelectionProduct(null);
    } catch (error) {
      setReplacementError(error instanceof Error ? error.message : 'Não foi possível substituir a imagem.');
    } finally {
      setIsReplacing(false);
    }
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
            <div className="max-w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-800" title={localImagesDirectory || 'Diretório não informado pelo agente local'}>
              <span className="font-black uppercase tracking-[0.12em]">Diretório local:</span> {localImagesDirectory || 'NÃO INFORMADO'}
            </div>
            <div className="max-w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800" title={s3ImagesFolder || 'Pasta não configurada no S3'}>
              <span className="font-black uppercase tracking-[0.12em]">Pasta S3:</span> {s3ImagesFolder || 'NÃO INFORMADA'}
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

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table
            className="block h-auto min-w-[860px] w-full border-collapse text-left"
            style={{ height: `${Math.max(1, visibleProducts.length) * 64 + 40}px` }}
          >
            <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
              <tr className="grid w-full grid-cols-[80px_minmax(260px,1fr)_160px_190px_160px_160px]">
                <th className="w-20 px-4 py-3">Imagem</th>
                <th className="px-4 py-3">Produto</th>
                <th className="w-40 px-4 py-3">Código interno</th>
                <th className="w-48 px-4 py-3">Código de barras</th>
                <th className="w-40 px-4 py-3">Situação</th>
                <th className="w-40 px-1 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="block">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm font-bold text-slate-500">CARREGANDO PRODUTOS...</td></tr>
              ) : visibleProducts.length ? (
                visibleProducts.map((product, index) => {
                  const eanType = getEanType(product.barcode);
                  const productImageCode = getProductImageCode(product);
                  const productSearchCode = getProductSearchCode(product);
                  const imageState = imageStates[product.id];
                  return (
                    <tr key={product.id} className={`${index % 2 ? 'bg-slate-100/70' : 'bg-white'} grid w-full grid-cols-[80px_minmax(260px,1fr)_160px_190px_160px_160px] items-center !h-16`}>
                      <td className="px-4 py-1">
                        <ProductImagePreview
                          productCode={productImageCode}
                          productName={product.name}
                          imageUrlOverride={imageState?.available ? imageState.url : null}
                          noImage={imageState?.available === false}
                          onPreview={setPreviewImageUrl}
                          onResolved={(state) => handleImageResolved(product.id, state)}
                        />
                      </td>
                      <td className="px-4 py-1 text-sm font-black uppercase text-slate-800">{product.name}</td>
                      <td className="px-4 py-1 text-xs font-bold text-slate-600">{product.internalCode || '---'}</td>
                      <td className="px-4 py-1">
                        <div className="text-xs font-black text-slate-700">{product.barcode || 'SEM CÓDIGO'}</div>
                        <div className={`mt-1 text-[9px] font-black uppercase tracking-[0.12em] ${eanType ? 'text-blue-600' : 'text-rose-600'}`}>
                          {eanType || 'INFORME EAN-8 OU EAN-13'}
                        </div>
                      </td>
                      <td className="px-4 py-1">
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
                      <td className="flex items-center justify-center gap-2 px-1 py-1 text-center">
                        <button
                          type="button"
                          disabled={!productImageCode}
                          onClick={() => openImageReplacement(product)}
                          title={productImageCode ? `Trocar imagem pelo código ${productImageCode}` : 'Informe um código válido para trocar a imagem'}
                          aria-label={productImageCode ? `Trocar imagem do produto ${product.name}` : 'Produto sem código válido para trocar imagem'}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <circle cx="11" cy="11" r="6" />
                            <path strokeLinecap="round" d="m16 16 4 4" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={!productSearchCode}
                          onClick={() => openImageSelection(product)}
                          title={productSearchCode ? `Selecionar entre imagens encontradas para ${productSearchCode}` : 'Informe um código válido para buscar imagens'}
                          aria-label={productSearchCode ? `Selecionar imagem encontrada para ${product.name}` : 'Produto sem código válido para buscar imagens'}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <rect x="3" y="4" width="18" height="16" rx="2" />
                            <circle cx="8" cy="9" r="1.5" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4 18 5-5 3.5 3.5 2.5-2.5L20 18" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => openProductEdit(product)}
                          title={`Alterar produto ${product.name}`}
                          aria-label={`Alterar produto ${product.name}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 shadow-sm transition hover:bg-amber-100"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4 20 4.5-1L19 8.5a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" />
                            <path strokeLinecap="round" d="m13.5 8 2.5 2.5" />
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

      {replacementProduct ? (
        <ImageReplacementModal
          product={replacementProduct}
          productCode={getProductSearchCode(replacementProduct)}
          imageUrl={imageStates[replacementProduct.id]?.url || `${LOCAL_IMAGE_AGENT_URL}/imagens/${encodeURIComponent(`${getProductImageCode(replacementProduct)}.webp`)}`}
          logoUrl={runtimeContext.logoUrl}
          isSaving={isReplacing}
          errorMessage={replacementError}
          onClose={() => setReplacementProduct(null)}
          onSave={replaceProductImage}
        />
      ) : null}

      {imageSelectionProduct ? (
        <ImageSelectionModal
          product={imageSelectionProduct}
          searchCode={getProductSearchCode(imageSelectionProduct)}
          logoUrl={runtimeContext.logoUrl}
          isSaving={isReplacing}
          onClose={() => setImageSelectionProduct(null)}
          onChoose={(url) => void replaceProductImage(url, imageSelectionProduct)}
        />
      ) : null}
      {previewImageUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6" role="dialog" aria-modal="true" onClick={() => setPreviewImageUrl(null)}>
          <img src={previewImageUrl} alt="Imagem ampliada do produto" className="max-h-full max-w-full rounded-xl bg-white object-contain shadow-2xl" />
        </div>
      ) : null}

      {!runtimeContext.embedded ? (
        <section className="shrink-0 rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" originText={ORIGIN_TEXT} auditText={auditText} />
        </section>
      ) : null}
    </div>
  );
}
