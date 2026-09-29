const platformUrl = process.env.MGS_PLATFORM_URL?.replace(/\/+$/, "");
const siteKey = process.env.MGS_SITE_KEY;
const siteSecret = process.env.MGS_SITE_SECRET;

export async function callAgency<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!platformUrl || !siteKey || !siteSecret) return null;

  try {
    const baseUrl = new URL(platformUrl);
    const requestUrl = new URL(path, `${baseUrl.origin}/`);
    if (
      requestUrl.origin !== baseUrl.origin
      || !requestUrl.pathname.startsWith("/api/v1/")
      || (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost")
    ) {
      console.error("[mgs-agency] Adresse de requête non autorisée.");
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const method = init?.method?.toUpperCase() ?? "GET";
    const cachedReadPaths = new Set(["/api/v1/announcements", "/api/v1/agency", "/api/v1/billing"]);
    const isCachedRead = method === "GET" && cachedReadPaths.has(requestUrl.pathname);
    try {
      const response = await fetch(requestUrl, {
        ...init,
        method,
        signal: controller.signal,
        headers: {
          ...init?.headers,
          "Content-Type": "application/json",
          "X-Site-Key": siteKey,
          Authorization: `Bearer ${siteSecret}`,
        },
        ...(isCachedRead ? { next: { revalidate: 300 } } : { cache: "no-store" }),
      });
      if (!response.ok) return null;
      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("[mgs-agency] Plateforme momentanément indisponible.", error);
    return null;
  }
}
