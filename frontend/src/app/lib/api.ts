export const API_BASE_URL =
  process.env.NEXT_PUBLIC_FINANCEIRO_API_URL ||
  "http://localhost:3002/api/v1";

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message || "Não foi possível carregar os dados do Financeiro.",
    );
  }

  return payload as T;
}
