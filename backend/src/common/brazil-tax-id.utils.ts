import { BadRequestException } from "@nestjs/common";

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;
const CNPJ_BASE_LENGTH = 12;
const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/;
const ACCESS_KEY_BASE_PATTERN = /^[0-9]{6}[0-9A-Z]{12}[0-9]{25}$/;

function characterValue(character: string) {
  return character.charCodeAt(0) - 48;
}

function modulo11Digit(base: string, weights: number[]) {
  const sum = base
    .split("")
    .reduce(
      (total, character, index) =>
        total + characterValue(character) * weights[index],
      0,
    );
  const remainder = sum % 11;
  return remainder < 2 ? "0" : String(11 - remainder);
}

export function normalizeTaxId(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]+/g, "");
  return normalized || null;
}

export function calculateCnpjCheckDigits(baseValue: string) {
  const base = normalizeTaxId(baseValue);
  if (!base || base.length !== CNPJ_BASE_LENGTH || !/^[0-9A-Z]{12}$/.test(base)) {
    throw new BadRequestException(
      "A base do CNPJ deve possuir 12 caracteres alfanuméricos.",
    );
  }

  const firstDigit = modulo11Digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = modulo11Digit(
    `${base}${firstDigit}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return `${firstDigit}${secondDigit}`;
}

export function isValidCnpj(value?: string | null) {
  const cnpj = normalizeTaxId(value);
  if (!cnpj || !CNPJ_PATTERN.test(cnpj)) return false;
  return calculateCnpjCheckDigits(cnpj.slice(0, CNPJ_BASE_LENGTH)) === cnpj.slice(-2);
}

export function isValidCpf(value?: string | null) {
  const cpf = String(value || "").replace(/\D+/g, "");
  if (cpf.length !== CPF_LENGTH || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split("")
      .reduce(
        (total, digit, index) => total + Number(digit) * (length + 1 - index),
        0,
      );
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function isValidBrazilTaxId(value?: string | null) {
  const normalized = normalizeTaxId(value);
  if (!normalized) return false;
  return normalized.length === CPF_LENGTH
    ? /^\d{11}$/.test(normalized) && isValidCpf(normalized)
    : isValidCnpj(normalized);
}

export function extractCnpjFromText(value?: string | null) {
  const normalized = normalizeTaxId(value);
  if (!normalized || normalized.length < CNPJ_LENGTH) return null;

  for (
    let index = normalized.length - CNPJ_LENGTH;
    index >= 0;
    index -= 1
  ) {
    const candidate = normalized.slice(index, index + CNPJ_LENGTH);
    if (isValidCnpj(candidate)) return candidate;
  }

  return null;
}

export function assertValidCnpj(value?: string | null, label = "CNPJ") {
  const normalized = normalizeTaxId(value);
  if (!normalized || !isValidCnpj(normalized)) {
    throw new BadRequestException(`Informe ${label} válido.`);
  }
  return normalized;
}

export function assertValidBrazilTaxId(
  value?: string | null,
  label = "CPF/CNPJ",
) {
  const normalized = normalizeTaxId(value);
  if (!normalized || !isValidBrazilTaxId(normalized)) {
    throw new BadRequestException(`Informe ${label} válido.`);
  }
  return normalized;
}

export function calculateFiscalAccessKeyDigit(baseValue: string) {
  const base = normalizeTaxId(baseValue);
  if (!base || !ACCESS_KEY_BASE_PATTERN.test(base)) {
    throw new BadRequestException("A base da chave fiscal deve possuir 43 caracteres válidos.");
  }

  let weight = 2;
  let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += characterValue(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const digit = 11 - (sum % 11);
  return digit === 10 || digit === 11 ? "0" : String(digit);
}

export function isCnpj(value?: string | null) {
  return normalizeTaxId(value)?.length === CNPJ_LENGTH;
}

export function isCpf(value?: string | null) {
  const normalized = normalizeTaxId(value);
  return Boolean(normalized && /^\d{11}$/.test(normalized));
}
