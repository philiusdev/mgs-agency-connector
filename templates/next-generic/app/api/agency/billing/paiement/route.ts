// Ouvre le paiement d'une facture après avoir vérifié l'administrateur du site.
// Le statut de facture reste à la plateforme et à sa notification signée.

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

const corps = z.object({ invoice_id: z.string().uuid("Facture inconnue.") }).strict();

export async function POST(request: Request) {
  const origine = verifierOriginePost(request);
  if (!origine.ok) return repErreur(origine.erreur, 403);

  const session = await lireSessionAdmin();
  if (!session.ok) return repRefus(session);

  const brut = await request.json().catch(() => null);
  const analyse = corps.safeParse(brut);
  if (!analyse.success) {
    return repErreur(
      premierMessage(analyse.error.issues, "Facture inconnue."),
      400,
      champsEnErreur(analyse.error.issues),
    );
  }

  const resultat = await callAgenceAvecDetail<unknown>("/api/v1/billing/paiement", {
    method: "POST",
    body: JSON.stringify({ invoice_id: analyse.data.invoice_id }),
  });
  if (resultat === null) {
    return repErreur("La plateforme de paiement ne répond pas. Réessayez dans un instant.", 503);
  }
  if (!resultat.ok) {
    const erreur = commeObjet(resultat.corps)?.error;
    return repErreur(
      typeof erreur === "string" && erreur.trim()
        ? erreur.trim().slice(0, 300)
        : "Le paiement n’a pas pu être ouvert.",
      resultat.statut,
    );
  }

  const reponse = commeObjet(resultat.valeur);
  const numero = texteCourt(reponse?.invoice, 60);
  const url = urlPaiement(reponse?.pay_url);
  if (!reponse || typeof reponse.can_pay_online !== "boolean") {
    return repErreur("La réponse de paiement est incomplète. Contactez l’agence.", 502);
  }
  if (reponse.pay_url !== null && url === null) {
    return repErreur("L’adresse de paiement n’est pas sécurisée. Contactez l’agence.", 502);
  }

  // Le cache de l'agence est purgé AVANT de répondre, comme dans la route
  // d'abonnement. `/api/v1/billing` est une lecture mise en cache pendant 60 s,
  // et cette route est précisément le moment où ce cache devient un mensonge : le
  // commerçant vient de payer, la plateforme a écrit la référence de rapprochement,
  // et le prochain rendu lui servirait l'état d'avant paiement s'il n'était pas
  // invalidé. Sans cette purge, il revient du prestataire, rouvre son tableau de
  // bord et voit sa facture toujours impayée — puis la règle à nouveau.
  //
  // La purge ne préjuge pas du résultat : rien n'est encore payé, seul le
  // prestataire peut le dire. Elle garantit seulement que l'écran ne sert pas
  // une information périmée, et c'est le seul effet honnête ici.
  await purgerCacheAgence();

  return NextResponse.json(
    {
      pay_url: url,
      can_pay_online: url !== null && reponse.can_pay_online === true,
      ...(numero ? { invoice: numero } : {}),
      billing_message: texteCourt(reponse.billing_message, 300) || null,
    },
    { headers: { "Cache-Control": "no-store" } },
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

function urlPaiement(valeur: unknown): string | null {
  if (typeof valeur !== "string" || valeur.trim() === "") return null;
  try {
    const url = new URL(valeur);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
