import { ImageResponse } from "next/og";

import { chargerModeleSite, normaliserNomSite } from "@/lib/site-starters";

export const alt = "Aperçu du site client";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const modele = chargerModeleSite(process.env.MGS_SITE_TYPE);
  const nomSite = normaliserNomSite(process.env.MGS_SITE_NAME);
  const { fond, accent, texte } = modele.palette;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "58px",
        background: `linear-gradient(135deg, ${fond}, #fffefa)`,
        color: texte,
        fontFamily: "Arial, sans-serif",
      }}>
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 56px",
          border: `1px solid ${accent}33`,
          borderRadius: "28px",
          background: "#fffefa",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", color: accent, fontSize: 24, fontWeight: 700 }}>
          <div style={{ display: "flex", width: 34, height: 34, borderRadius: 17, background: accent }} />
          {nomSite}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ color: accent, fontSize: 22, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {modele.libelle}
          </div>
          <div style={{ maxWidth: 950, fontFamily: "Georgia, serif", fontSize: 68, lineHeight: 1.08, letterSpacing: "-0.04em" }}>
            {nomSite}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: accent, fontSize: 20 }}>
          <div style={{ width: 44, height: 3, background: accent }} />
          Découvrez notre univers
        </div>
      </div>
    </div>,
    size,
  );
}
