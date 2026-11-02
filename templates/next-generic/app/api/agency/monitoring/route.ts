import { NextResponse } from "next/server";

import { collecterMetriquesConnecteur } from "@/lib/agency/monitoring";
import { repErreur, repRefus, lireSessionAdmin } from "../_interne/securite";

export const dynamic = "force-dynamic";

export async function GET() {
  const lecture = await lireSessionAdmin();
  if (!lecture.ok) return repRefus(lecture);

  const siteId = process.env.MGS_SITE_KEY?.trim();
  if (!siteId) return repErreur("Configuration du site indisponible.", 503);

  const metriques = collecterMetriquesConnecteur(siteId);
  return NextResponse.json(metriques, { headers: { "Cache-Control": "no-store" } });
}
