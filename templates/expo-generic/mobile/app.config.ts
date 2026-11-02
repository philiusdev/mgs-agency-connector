import type { ExpoConfig } from "expo/config";

function siteSlug(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_WEBSITE_URL;
  if (!configuredUrl) return "client";

  try {
    const hostname = new URL(configuredUrl).hostname.toLowerCase();
    const slug = hostname.split(".")[0]?.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    return slug || "client";
  } catch {
    throw new Error("EXPO_PUBLIC_WEBSITE_URL doit être une URL HTTPS valide.");
  }
}

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const slug = siteSlug();

  return {
    ...config,
    name: `MGS ${slug}`,
    slug: `mgs-${slug}`,
    scheme: `mgs-${slug}`,
    android: {
      ...config.android,
      package: `com.mindgraphixsolution.client.s${slug.replace(/[^a-z0-9]/g, "")}`,
    },
  };
};
