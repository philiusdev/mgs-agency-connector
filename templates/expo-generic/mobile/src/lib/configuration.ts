export type ConfigurationMobile = {
  websiteUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  platformUrl: string;
  siteId: string;
};

const websiteUrl = process.env.EXPO_PUBLIC_WEBSITE_URL?.replace(/\/+$/, "");

export async function chargerConfiguration(): Promise<ConfigurationMobile> {
  if (!websiteUrl) {
    throw new Error("L’URL du site n’est pas configurée pour cette application.");
  }

  let siteOrigin: URL;
  try {
    siteOrigin = new URL(websiteUrl);
  } catch {
    throw new Error("L’URL du site n’est pas valide.");
  }
  if (
    siteOrigin.protocol !== "https:" ||
    siteOrigin.username ||
    siteOrigin.password ||
    siteOrigin.pathname !== "/" ||
    siteOrigin.search ||
    siteOrigin.hash
  ) {
    throw new Error("L’application exige l’URL HTTPS publique du site.");
  }

  const response = await fetch(`${siteOrigin.origin}/api/mobile/config`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("La configuration du site est momentanément indisponible.");
  }

  const result: unknown = await response.json();
  if (!result || typeof result !== "object") {
    throw new Error("La configuration reçue du site est invalide.");
  }

  const value = result as Record<string, unknown>;
  if (
    typeof value.supabase_url !== "string" ||
    typeof value.supabase_anon_key !== "string" ||
    typeof value.platform_url !== "string" ||
    typeof value.site_id !== "string" ||
    !value.supabase_url.startsWith("https://") ||
    !value.platform_url.startsWith("https://") ||
    !/^[0-9a-f-]{36}$/i.test(value.site_id) ||
    value.supabase_anon_key.length < 20
  ) {
    throw new Error("La configuration d’authentification du site est incomplète.");
  }

  return {
    websiteUrl: siteOrigin.origin,
    supabaseUrl: value.supabase_url,
    supabaseAnonKey: value.supabase_anon_key,
    platformUrl: value.platform_url.replace(/\/+$/, ""),
    siteId: value.site_id,
  };
}
