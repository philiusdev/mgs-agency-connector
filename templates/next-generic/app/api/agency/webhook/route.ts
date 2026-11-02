// Webhook de notification : la plateforme appelle cette route pour avertir
// le site client qu'un changement est survenu (nouvelle offre, prestation,
// demande, facture impayée, etc.).
//
// Route serveur : protégée par un secret partagé (MGS_WEBHOOK_SECRET) et
// par le contrôle d'origine de la plateforme.
import { NextResponse } from "next/server";
import { z } from "zod";

import { purgerCacheAgence } from "@/lib/agency/space";

const schema = z.object({
  type: z.enum(["agence_modifiee", "prestation_ajoutee", "offre_modifiee", "abonnement_modifie", "demande_creee", "message_recu", "facture_impayee"]),
  siteId: z.string().optional(),
  donnees: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  /* 1. Secret partagé pour authentifier l'appel de la plateforme. */
  const secret = request.headers.get("x-mgs-webhook-secret");
  const secretConfigure = process.env.MGS_WEBHOOK_SECRET;
  if (!secretConfigure || secret !== secretConfigure) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  /* 2. Contrôle d'origine : l'appel doit venir de la plateforme. */
  const platformUrl = process.env.MGS_PLATFORM_URL;
  const origine = request.headers.get("origin");
  if (platformUrl && origine) {
    try {
      const urlOrigine = new URL(origine);
      const urlPlatform = new URL(platformUrl);
      if (urlOrigine.origin !== urlPlatform.origin) {
        return NextResponse.json({ error: "Origine non autorisée." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Origine invalide." }, { status: 403 });
    }
  }

  /* 3. Corps de la requête. */
  const brut = await request.json().catch(() => null);
  const parse = schema.safeParse(brut);
  if (!parse.success) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 });
  }

  const { type, donnees, timestamp } = parse.data;

  /* 4. Purge immédiate du cache « Mon agence » pour que le changement
   *    apparaisse au prochain rendu sans attendre l'expiration du cache. */
  await purgerCacheAgence(["/espace-client/agence", "/"]);

  /* 5. Journaliser l'événement pour diagnostic. */
  console.log(
    `[mgs-agency] Webhook reçu : ${type} à ${timestamp}`,
    donnees ? ` (${JSON.stringify(donnees).slice(0, 200)})` : "",
  );

  return NextResponse.json({
    ok: true,
    type,
    cachePurge: true,
  });
}