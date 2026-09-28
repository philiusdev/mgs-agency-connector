const PLATFORM_URL = process.env.MGS_PLATFORM_URL?.replace(/\/$/, "");
const SITE_KEY = process.env.MGS_SITE_KEY;
const SITE_SECRET = process.env.MGS_SITE_SECRET;

export async function callAgency<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!PLATFORM_URL || !SITE_KEY || !SITE_SECRET) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${PLATFORM_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Site-Key": SITE_KEY,
        Authorization: `Bearer ${SITE_SECRET}`,
        ...init?.headers,
      },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch (error) {
    console.error("Connexion MindGraphixSolution indisponible :", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
