import type { Metadata } from "next";
import type { ReactNode } from "react";

import { chargerModeleSite, normaliserNomSite } from "@/lib/site-starters";

import "../components/agency.css";
import "./site.css";

export function generateMetadata(): Metadata {
  const modele = chargerModeleSite(process.env.MGS_SITE_TYPE);
  const nomSite = normaliserNomSite(process.env.MGS_SITE_NAME);

  return {
    title: `${nomSite} · ${modele.libelle}`,
    description: modele.description,
  };
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
