export interface PublicSupabaseConfig {
  url: string;
  publishableKey: string;
}

function normalized(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate ? candidate : null;
}

function validServiceUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value);
    const localHostname = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    return parsedUrl.protocol === "https:" || (parsedUrl.protocol === "http:" && localHostname);
  } catch {
    return false;
  }
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = normalized(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey =
    normalized(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalized(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !publishableKey || !validServiceUrl(url)) {
    return null;
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseConfig() !== null;
}

export function getApplicationOrigin(): string | null {
  const publicOrigin = normalized(process.env.NEXT_PUBLIC_APP_ORIGIN);
  const vercelHost = normalized(process.env.VERCEL_URL);
  const configuredOrigin =
    publicOrigin ??
    (vercelHost ? (/^https?:\/\//i.test(vercelHost) ? vercelHost : `https://${vercelHost}`) : null);

  if (!configuredOrigin || !validServiceUrl(configuredOrigin)) {
    return null;
  }

  const parsed = new URL(configuredOrigin);
  return parsed.origin;
}

export function isProductionCaptchaRequired(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getCaptchaSiteKey(): string | null {
  return normalized(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
