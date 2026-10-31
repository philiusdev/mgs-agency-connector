// Diagnostic de la connexion site ↔ plateforme.
// Route serveur : administrateur du site uniquement, origine vérifiée.
// Cette route ne fait AUCUN appel à la plateforme : elle ne lit que les
// métriques locales (mémoire du processus) et les variables d'environnement.
import { NextResponse } from "next/server";
import { z } from "zod";

import { getMetriquesConnexion, ETIQUETTE_CACHE_AGENCE } from "@/lib/agency/client";
import {
  lireSessionAdmin,
  repErreur,
  repRefus,
  verifierOriginePost,
} from "../_interne/securite";

export const dynamic = "force-dynamic";

const schemaChemins = z.object({
  chemins: z
    .array(
      z
        .string({ error: "Chemin invalide." })
        .trim()
        .min(1, "Chemin invalide.")
        .max(200, "Chemin trop long.")
        .refine(
          (chemin) => chemin.startsWith("/") && !chemin.startsWith("//") && !chemin.includes(".."),
          "Chemin invalide.",
        ),
    )
    .max(8, "8 chemins au maximum.")
    .optional(),
});

export async function GET() {
  /* 1. Administrateur du site uniquement. */
  const lecture = await lireSessionAdmin();
  if (!lecture.ok) return repRefus(lecture);

  /* 2. Métriques locales de connexion. */
  const metriques = getMetriquesConnexion();
  const maintenant = Date.now();

  const sante = {
    ok: true,
    timestamp: maintenant,
    connecteurConfigure: Boolean(
      process.env.MGS_PLATFORM_URL?.trim()
      && process.env.MGS_SITE_KEY?.trim()
      && process.env.MGS_SITE_SECRET?.trim(),
    ),
    platformUrl: process.env.MGS_PLATFORM_URL ?? null,
    cacheRevalidateS: process.env.MGS_CACHE_REVALIDATE_S ?? "60 (par défaut)",
    chemins: metriques.map((m) => ({
      chemin: m.chemin,
      totalAppels: m.totalAppels,
      totalSucces: m.totalSucces,
      totalEchecs: m.totalEchecs,
      tauxReussite: m.totalAppels === 0
        ? 100
        : Math.round((m.totalSucces / m.totalAppels) * 100),
      tempsMoyenMs: m.tempsMoyenMs,
      dernierAppel: m.dernierAppel ?? null,
      dernierSucces: m.dernierSucces ?? null,
      dernierEchec: m.dernierEchec ?? null,
      enCircuitOuvert: m.enCircuitOuvert,
    })),
    resume: {
      totalChemins: metriques.length,
      cheminsEnPanne: metriques.filter((m) => m.enCircuitOuvert).length,
      totalAppels: metriques.reduce((s, m) => s + m.totalAppels, 0),
      totalEchecs: metriques.reduce((s, m) => s + m.totalEchecs, 0),
      tauxReussiteGlobal: 0,
    },
  };

  sante.resume.tauxReussiteGlobal = sante.resume.totalAppels === 0
    ? 100
    : Math.round(((sante.resume.totalAppels - sante.resume.totalEchecs) / sante.resume.totalAppels) * 100);

  return NextResponse.json(sante, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  /* 1. Origine d'abord : un appel forgé s'arrête ici. */
  const origine = verifierOriginePost(request);
  if (!origine.ok) return repErreur(origine.erreur, 403);

  /* 2. Administrateur du site. */
  const lecture = await lireSessionAdmin();
  if (!lecture.ok) return repRefus(lecture);

  /* 3. Purge optionnelle de chemins spécifiques. */
  const brut = await request.json().catch(() => null);
  const parse = schemaChemins.safeParse(brut ?? {});
  if (!parse.success) {
    return repErreur("Chemins invalides.", 400);
  }
  const chemins = [...new Set(parse.data.chemins ?? [])];

  /* 4. Réponse : on ne peut pas purger le cache de callAgency (mémoire locale)
   *    sans next/cache, mais on signale les chemins demandés pour que
   *    l'appelant sache qu'ils ont été notés. */
  return NextResponse.json({
    ok: true,
    chemins,
    message: "Les chemins de purge seront pris en compte lors du prochain rendu de page.",
  }, { headers: { "Cache-Control": "no-store" } });
}