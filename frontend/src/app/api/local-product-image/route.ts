import { readFile } from 'node:fs/promises';

const LOCAL_TEST_IMAGES_DIRECTORY = 'C:\\temp';
const SUPPORTED_IMAGE_FORMATS = [
  { extension: 'webp', contentType: 'image/webp' },
  { extension: 'avif', contentType: 'image/avif' },
  { extension: 'jpg', contentType: 'image/jpeg' },
  { extension: 'jpeg', contentType: 'image/jpeg' },
  { extension: 'png', contentType: 'image/png' },
  { extension: 'bmp', contentType: 'image/bmp' },
] as const;

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ message: 'Imagem local de teste indisponível.' }, { status: 404 });
  }

  const productCode = new URL(request.url).searchParams.get('code')?.trim() ?? '';

  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(productCode)) {
    return Response.json({ message: 'Código de produto inválido.' }, { status: 400 });
  }

  for (const format of SUPPORTED_IMAGE_FORMATS) {
    try {
      const image = await readFile(`${LOCAL_TEST_IMAGES_DIRECTORY}\\${productCode}.${format.extension}`);

      return new Response(image, {
        headers: {
          'Content-Type': format.contentType,
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      // Tenta o próximo formato permitido para o mesmo código do produto.
    }
  }

  return Response.json({ message: 'Imagem local de teste não encontrada.' }, { status: 404 });
}
