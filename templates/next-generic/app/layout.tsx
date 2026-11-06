import type { Metadata } from "next";
import type { ReactNode } from "react";

import { chargerModeleSite, normaliserNomSite } from "@/lib/site-starters";

import "../components/agency.css";
import "./site.css";

export function generateMetadata(): Metadata {
  const modele = chargerModeleSite(process.env.MGS_SITE_TYPE);
  const nomSite = normaliserNomSite(process.env.MGS_SITE_NAME);
  const urlSite = lireUrlSite(process.env.MGS_WEBSITE_URL);

  return {
    title: `${nomSite} · ${modele.libelle}`,
    description: modele.description,
    ...(urlSite
      ? {
          metadataBase: urlSite,
          alternates: { canonical: "/" },
        }
      : {}),
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: nomSite,
      title: `${nomSite} · ${modele.libelle}`,
      description: modele.description,
      ...(urlSite
        ? {
            images: [{
              url: "/opengraph-image",
              width: 1200,
              height: 630,
              alt: `${nomSite} — ${modele.libelle}`,
            }],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${nomSite} · ${modele.libelle}`,
      description: modele.description,
      ...(urlSite ? { images: ["/opengraph-image"] } : {}),
    },
  };
}

function lireUrlSite(valeur: string | undefined): URL | undefined {
  if (!valeur) return undefined;
  try {
    const url = new URL(valeur);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
