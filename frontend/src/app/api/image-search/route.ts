const MAX_RESULTS = 10;

type ImageSearchItem = {
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
};

function decodeBingValue(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('\\u002f', '/')
    .replaceAll('\\u0026', '&')
    .replaceAll('\\u003a', ':');
}

function getImageResults(page: string, excludedUrls: Set<string>) {
  const results: ImageSearchItem[] = [];
  const seen = new Set<string>();
  const resultPattern = /murl&quot;:&quot;(.*?)&quot;,&quot;turl&quot;:&quot;(.*?)&quot;/g;

  for (const match of page.matchAll(resultPattern)) {
    const imageUrl = decodeBingValue(match[1]);
    const thumbnailUrl = decodeBingValue(match[2]);
    const sourceUrl = imageUrl;

    if (!/^https?:\/\//i.test(imageUrl) || !/^https?:\/\//i.test(thumbnailUrl) || seen.has(imageUrl) || excludedUrls.has(imageUrl)) {
      continue;
    }

    seen.add(imageUrl);
    results.push({ imageUrl, thumbnailUrl, sourceUrl });
    if (results.length === MAX_RESULTS) break;
  }

  return results;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get('q')?.trim() ?? '';
  const requestedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
  const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 && requestedOffset <= 200
    ? requestedOffset
    : 0;
  const excludedUrls = new Set(
    searchParams
      .getAll('exclude')
      .filter((url) => /^https?:\/\//i.test(url)),
  );

  if (!/^[A-Z0-9_-]{1,120}$/i.test(query)) {
    return Response.json({ message: 'Código de pesquisa inválido.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=${offset + 1}&form=HDRSC3`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MSINFOR-IMAGENS/1.0)' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('SEARCH_UNAVAILABLE');
    }

    return Response.json({ items: getImageResults(await response.text(), excludedUrls) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ message: 'Não foi possível buscar imagens agora.' }, { status: 502 });
  }
}
