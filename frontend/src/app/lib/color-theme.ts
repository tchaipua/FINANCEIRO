export type FinanceColorThemeId = 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'gray';
export type FinanceColorIntensity = 1 | 2 | 3 | 4 | 5;

export type FinanceColorPreference = {
  colorTheme: FinanceColorThemeId;
  colorIntensity: FinanceColorIntensity;
};

const THEME_IDS: FinanceColorThemeId[] = ['blue', 'green', 'purple', 'red', 'orange', 'gray'];
const THEME_COLOR_VARIABLES = [
  '--color-blue-50', '--color-blue-100', '--color-blue-200', '--color-blue-300',
  '--color-blue-400', '--color-blue-500', '--color-blue-600', '--color-blue-700',
  '--color-blue-800', '--color-blue-900', '--color-blue-950',
  '--school-theme-deep', '--school-theme-mid',
] as const;

export function isFinanceColorThemeId(value: unknown): value is FinanceColorThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as FinanceColorThemeId);
}

export function normalizeFinanceColorIntensity(value: unknown): FinanceColorIntensity {
  const parsedValue = Number(value);
  return parsedValue >= 1 && parsedValue <= 5 ? parsedValue as FinanceColorIntensity : 3;
}

function adjustThemeColor(color: string, intensity: FinanceColorIntensity) {
  if (intensity === 1) return `color-mix(in srgb, ${color} 78%, white)`;
  if (intensity === 2) return `color-mix(in srgb, ${color} 90%, white)`;
  if (intensity === 4) return `color-mix(in srgb, ${color} 90%, black)`;
  if (intensity === 5) return `color-mix(in srgb, ${color} 78%, black)`;
  return color;
}

export function applyFinanceColorPreference(preference: FinanceColorPreference) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  THEME_COLOR_VARIABLES.forEach((variableName) => root.style.removeProperty(variableName));
  root.dataset.schoolColorTheme = preference.colorTheme;
  root.dataset.schoolColorIntensity = String(preference.colorIntensity);

  const themeStyles = window.getComputedStyle(root);
  THEME_COLOR_VARIABLES.forEach((variableName) => {
    const color = themeStyles.getPropertyValue(variableName).trim();
    if (color) root.style.setProperty(variableName, adjustThemeColor(color, preference.colorIntensity));
  });
}

export function getFinanceColorStorageKey(
  sourceSystem?: string | null,
  sourceTenantId?: string | null,
  userId?: string | null,
) {
  return `msinfor:finance-color-theme:${sourceSystem || 'FINANCEIRO'}:${sourceTenantId || 'tenant'}:${userId || 'user'}`;
}

export function readFinanceColorPreference(
  sourceSystem?: string | null,
  sourceTenantId?: string | null,
  userId?: string | null,
): FinanceColorPreference {
  const key = getFinanceColorStorageKey(sourceSystem, sourceTenantId, userId);
  const storedTheme = window.localStorage.getItem(key);
  const storedIntensity = window.localStorage.getItem(`${key}:intensity`);
  return {
    colorTheme: isFinanceColorThemeId(storedTheme) ? storedTheme : 'blue',
    colorIntensity: normalizeFinanceColorIntensity(storedIntensity),
  };
}

export function saveFinanceColorPreference(
  preference: FinanceColorPreference,
  sourceSystem?: string | null,
  sourceTenantId?: string | null,
  userId?: string | null,
) {
  const key = getFinanceColorStorageKey(sourceSystem, sourceTenantId, userId);
  window.localStorage.setItem(key, preference.colorTheme);
  window.localStorage.setItem(`${key}:intensity`, String(preference.colorIntensity));
}
