import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../components/agency.css";
import "./site.css";

export const metadata: Metadata = {
  title: "Nouveau site",
  description: "Site web créé avec MindGraphixSolution.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
