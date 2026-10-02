// Crée une souscription pour le site appelant, après contrôle de son administrateur.
// La plateforme reste seule à confirmer son statut et à créer la facture.

import { NextResponse } from "next/server";
import { z } from "zod";

import { callAgenceAvecDetail } from "@/lib/agency/client";
import { purgerCacheAgence } from "@/lib/agency/space";
import {
  champsEnErreur,
  lireSessionAdmin,
  premierMessage,
  repErreur,
  repRefus,
  verifierOriginePost,
} from "../../_interne/securite";

const corps = z.object({ plan_id: z.string().uuid("Forfait inconnu.") }).strict();

export async function POST(request: Request) {
  const origine = verifierOriginePost(request);
  if (!origine.ok) return repErreur(origine.erreur, 403);

  const session = await lireSessionAdmin();
  if (!session.ok) return repRefus(session);

  const brut = await request.json().catch(() => null);
  const analyse = corps.safeParse(brut);
  if (!analyse.success) {
    return repErreur(
      premierMessage(analyse.error.issues, "Forfait inconnu."),
      400,
      champsEnErreur(analyse.error.issues),
    );
  }

  const resultat = await callAgenceAvecDetail<unknown>("/api/v1/billing/abonnement", {
    method: "POST",
    body: JSON.stringify({ plan_id: analyse.data.plan_id }),
  });
  if (resultat === null) {
    return repErreur("La facturation ne répond pas. Réessayez dans un instant.", 503);
  }
  if (!resultat.ok) {
    const erreur = commeObjet(resultat.corps)?.error;
    return repErreur(
      typeof erreur === "string" && erreur.trim()
        ? erreur.trim().slice(0, 300)
        : "Le forfait n’a pas pu être sélectionné.",
      resultat.statut,
    );
  }

  const reponse = commeObjet(resultat.valeur);
  const factureBrute = commeObjet(reponse?.invoice);
  const facture = factureBrute
    ? {
        id: texteCourt(factureBrute.id, 64),
        number: texteCourt(factureBrute.number, 60),
      }
    : null;
  if (
    reponse?.ok !== true
    || typeof reponse.created !== "boolean"
    || typeof reponse.payment_required !== "boolean"
    || typeof reponse.can_pay_online !== "boolean"
    || (reponse.payment_required && (!facture?.id || !facture.number))
  ) {
    return repErreur("La réponse de facturation est incomplète. Contactez l’agence.", 502);
  }

  await purgerCacheAgence();
  return NextResponse.json(
    {
      ok: true,
      created: reponse.created,
      invoice: facture?.id && facture.number ? facture : null,
      payment_required: reponse.payment_required,
      can_pay_online: reponse.can_pay_online,
      billing_message: texteCourt(reponse.billing_message, 300) || null,
    },
    { status: reponse.created ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

function commeObjet(valeur: unknown): Record<string, unknown> | null {
  return valeur && typeof valeur === "object" && !Array.isArray(valeur)
    ? valeur as Record<string, unknown>
    : null;
}

function texteCourt(valeur: unknown, max: number): string {
  return typeof valeur === "string" ? valeur.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
