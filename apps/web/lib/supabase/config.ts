export interface PublicSupabaseConfig {
  url: string;
  publishableKey: string;
}

function normalized(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate ? candidate : null;
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = normalized(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey =
    normalized(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalized(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !publishableKey) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const localHostname = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    if (parsedUrl.protocol !== "https:" && !localHostname) {
      return null;
    }
  } catch {
    return null;
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseConfig() !== null;
}
