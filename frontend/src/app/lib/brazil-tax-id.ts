const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;
const CNPJ_BASE_LENGTH = 12;
const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/;

export function normalizeBrazilTaxId(value?: string | null) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]+/g, '');
}

function characterValue(character: string) {
  return character.charCodeAt(0) - 48;
}

function modulo11Digit(base: string, weights: number[]) {
  const sum = base
    .split('')
    .reduce(
      (total, character, index) => total + characterValue(character) * weights[index],
      0,
    );
  const remainder = sum % 11;
  return remainder < 2 ? '0' : String(11 - remainder);
}

export function calculateCnpjCheckDigits(baseValue: string) {
  const base = normalizeBrazilTaxId(baseValue);
  if (base.length !== CNPJ_BASE_LENGTH || !/^[0-9A-Z]{12}$/.test(base)) {
    return null;
  }
  const firstDigit = modulo11Digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = modulo11Digit(
    `${base}${firstDigit}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return `${firstDigit}${secondDigit}`;
}

export function isValidCnpj(value?: string | null) {
  const cnpj = normalizeBrazilTaxId(value);
  return (
    CNPJ_PATTERN.test(cnpj) &&
    calculateCnpjCheckDigits(cnpj.slice(0, CNPJ_BASE_LENGTH)) === cnpj.slice(-2)
  );
}

export function isValidCpf(value?: string | null) {
  const cpf = String(value || '').replace(/\D+/g, '');
  if (cpf.length !== CPF_LENGTH || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split('')
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
  const normalized = normalizeBrazilTaxId(value);
  if (normalized.length === CPF_LENGTH && /^\d{11}$/.test(normalized)) {
    return isValidCpf(normalized);
  }
  return normalized.length === CNPJ_LENGTH && isValidCnpj(normalized);
}

export function formatBrazilTaxId(value?: string | null, emptyLabel = 'SEM DOCUMENTO') {
  const normalized = normalizeBrazilTaxId(value);
  if (/^\d{11}$/.test(normalized)) {
    return normalized.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (normalized.length === CNPJ_LENGTH) {
    return normalized.replace(
      /([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  return normalized || emptyLabel;
}

export function normalizeBrazilTaxIdInput(value?: string | null) {
  return normalizeBrazilTaxId(value).slice(0, CNPJ_LENGTH);
}
