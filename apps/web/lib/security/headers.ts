const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !["http:", "https:"].includes(url.protocol)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function requestCorrelationId(value: string | null, fallback: () => string): string {
  const supplied = value?.trim();
  return supplied && UUID_PATTERN.test(supplied) ? supplied.toLowerCase() : fallback();
}

export function contentSecurityPolicy(input: {
  nonce: string;
  production: boolean;
  supabaseUrl?: string;
}): string {
  const supabaseOrigin = normalizeOrigin(input.supabaseUrl);
  const connectSources = [
    "'self'",
    "https://challenges.cloudflare.com",
    ...(supabaseOrigin ? [supabaseOrigin, supabaseOrigin.replace(/^http/, "ws")] : []),
  ];
  const imageSources = [
    "'self'",
    "blob:",
    "data:",
    "https://cards.scryfall.io",
    ...(supabaseOrigin ? [supabaseOrigin] : []),
  ];
  const scriptSources = [
    "'self'",
    `'nonce-${input.nonce}'`,
    "'strict-dynamic'",
    "https://challenges.cloudflare.com",
    ...(!input.production ? ["'unsafe-eval'"] : []),
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src https://challenges.cloudflare.com",
    `img-src ${imageSources.join(" ")}`,
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(" ")}`,
    `script-src-elem 'self' 'nonce-${input.nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    ...(input.production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function applySecurityHeaders(
  headers: Headers,
  input: {
    contentSecurityPolicy: string;
    production: boolean;
    requestId: string;
  },
): void {
  headers.set("Content-Security-Policy", input.contentSecurityPolicy);
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Request-Id", input.requestId);
  if (input.production) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}
