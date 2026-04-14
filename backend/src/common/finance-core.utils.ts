export function normalizeText(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  return normalized || null;
}

export function normalizeDigits(value?: string | null) {
  const normalized = String(value || "").replace(/\D+/g, "");
  return normalized || null;
}

export function normalizeEmail(value?: string | null) {
  return normalizeText(value);
}

export function normalizePhone(value?: string | null) {
  const normalized = String(value || "").replace(/[^\d+]/g, "");
  return normalized || null;
}

export function roundMoney(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

export function parseIsoDate(value?: string | null, label = "data") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Informe ${label} válida.`);
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Informe ${label} válida.`);
  }

  return parsed;
}

export function dateToDateOnly(value?: string | Date | null) {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10);
}

export function serializeJson(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}

export function parseJson<T>(value?: string | null, fallback?: T) {
  if (!value) {
    return fallback ?? null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback ?? null;
  }
}

export function isOverdueDate(value?: string | Date | null) {
  if (!value) return false;

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return parsed < today;
}
