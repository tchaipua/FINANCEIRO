export function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(typeof value === "number" ? value : 0);
}

export function formatDateLabel(value?: string | null) {
  if (!value) return "---";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
}

export function getFriendlyRequestErrorMessage(
  error: unknown,
  fallbackMessage: string,
) {
  if (!(error instanceof Error)) return fallbackMessage;

  const normalizedMessage = String(error.message || "").trim();
  if (!normalizedMessage) return fallbackMessage;

  if (normalizedMessage === "Failed to fetch") {
    return "Não foi possível conectar ao backend financeiro. Verifique se a API está ativa.";
  }

  return normalizedMessage;
}
