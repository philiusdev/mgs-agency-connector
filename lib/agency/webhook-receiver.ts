// Réception et validation des webhooks entrants côté site.
//
// La plateforme peut envoyer des webhooks vers `/api/agency/webhook` du site.
// Ce module valide la signature HMAC et purge le cache de l'agence si nécessaire.

import { verifierSignatureWebhook } from "@/lib/webhooks/signing"; // à adapter selon le chemin
import { purgerCacheAgence } from "./space";

/**
 * Valide la signature d'un webhook entrant depuis la plateforme.
 *
 * Retourne `true` si la signature est valide, `false` sinon.
 */
export function validerWebhookPlateforme(
  enTetes: Record<string, string | string[] | undefined>,
  payload: string,
): { valide: boolean; raison?: string } {
  const secret = process.env.MGS_WEBHOOK_SECRET;
  if (!secret) {
    return { valide: false, raison: "Secret webhook non configuré." };
  }

  return verifierSignatureWebhook(secret, enTetes, payload);
}

/**
 * Traite un webhook reçu de la plateforme.
 *
 * Valide la signature, puis purge le cache de l'agence pour que le changement
 * soit immédiatement visible.
 */
export async function traiterWebhookPlateforme(
  type: string,
  donnees: unknown,
  enTetes: Record<string, string | string[] | undefined>,
  payload: string,
): Promise<{ ok: boolean; raison?: string }> {
  const validation = validerWebhookPlateforme(enTetes, payload);
  if (!validation.valide) {
    console.warn(`[mgs-webhook] Signature invalide pour ${type}: ${validation.raison}`);
    return { ok: false, raison: validation.raison };
  }

  console.log(`[mgs-webhook] Événement reçu : ${type}`, JSON.stringify(donnees).slice(0, 200));

  // Purge immédiate du cache « Mon agence ».
  await purgerCacheAgence(["/espace-client/agence", "/"]);

  return { ok: true };
}