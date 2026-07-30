const DEVELOPMENT_TRUSTED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3100',
  'http://localhost:3003',
] as const;

function parseOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.origin === value ? url.origin : null;
  } catch {
    return null;
  }
}

export function getTrustedMessageOrigins() {
  const configuredOrigins = String(
    process.env.NEXT_PUBLIC_FINANCEIRO_PARENT_ORIGINS || '',
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(parseOrigin)
    .filter((value): value is string => Boolean(value));

  const developmentOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : [...DEVELOPMENT_TRUSTED_ORIGINS];
  const currentOrigin =
    typeof window !== 'undefined' ? [window.location.origin] : [];

  return new Set([
    ...configuredOrigins,
    ...developmentOrigins,
    ...currentOrigin,
  ]);
}

export function getTrustedParentOrigin() {
  if (typeof window === 'undefined' || window.parent === window) {
    return null;
  }

  const trustedOrigins = getTrustedMessageOrigins();
  const candidates = [
    document.referrer,
    window.location.ancestorOrigins?.[0] || '',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const origin = new URL(candidate).origin;
      if (trustedOrigins.has(origin)) {
        return origin;
      }
    } catch {
      // Uma origem inválida é ignorada e nenhuma mensagem é enviada.
    }
  }

  return null;
}

export function postMessageToTrustedParent(message: unknown) {
  const parentOrigin = getTrustedParentOrigin();
  if (!parentOrigin) {
    return false;
  }

  window.parent.postMessage(message, parentOrigin);
  return true;
}

export function isTrustedMessageEvent(event: MessageEvent) {
  return getTrustedMessageOrigins().has(event.origin);
}
