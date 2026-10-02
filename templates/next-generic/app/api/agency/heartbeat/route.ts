// Déclaration de la version du template, au nom du site connecté.
// Route serveur : la clé du site et le secret de la plateforme restent ici.

import { NextResponse } from "next/server";

import { callAgency } from "@/lib/agency/client";
import { lireSessionAdmin, repErreur, repRefus } from "../_interne/securite";

/**
 * Battement de cœur : garder pour compatibilité, sans changer le contrat.
 *
 * La question « mon site est-il en ligne ? » a déjà une réponse, et elle n'est
 * pas ici. Côté plateforme, `authenticateSite` (`lib/site-auth.ts`) rafraîchit
 * `sites.last_seen_at` à CHAQUE requête authentifiée, sur toutes les routes
 * `/api/v1/*`. Une boutique qui consulte son onglet « Mon agence » est donc
 * déjà notée présente : c'était précisément le défaut que cette route corrigeait
 * avant que l'authentification ne le fasse toute seule.
 *
 * Ce que cette route fait encore, et qu'il faut préserver tel quel :
 *
 *  - ELLE DÉCLARE `template_version`. C'est la seule information qu'elle transmet
 *    à la plateforme, et c'est la seule que celle-ci n'obtient pas ailleurs. Le
 *    tableau de bord de l'agence s'en sert pour savoir quels sites ont été
 *    mis à jour — donc le silence n'est pas ici une option : une boutique dont
 *    la version n'est pas déclarée passe pour une boutique jamais déployée.
 *  - ELLE EST FERMÉE AUX VISITEURS. Administrateur du site connecté, sinon `403`.
 *    Déclarer la version d'un site est une information sur son déploiement :
 *    elle ne se dépose pas depuis une page tierce.
 *  - ELLE NE DÉCIDE RIEN. Elle renvoie `ok: true` quand la plateforme a
 *    enregistré, `503` quand elle n'a rien dit. Elle ne se déclare jamais
 *    « en ligne » elle-même, et ne laisse pas croire qu'un échec ici empêche le
 *    site de fonctionner : les lectures de l'onglet « Mon agence » ne dépendent
 *    pas de cette route.
 *
 * Elle ne supprime donc rien, et ne remplace rien : si le tableau de bord de la
 * plateforme refuse un jour cette route, ce sera parce qu'elle ne sert plus à
 * rien — pas parce qu'elle aurait été mal écrite.
 */

export const dynamic = "force-dynamic";

/** Version déclarée quand `MGS_TEMPLATE_VERSION` est absente. */
const VERSION_INCONNUE = "0.0.0";

export async function POST() {
  const lecture = await lireSessionAdmin();
  if (!lecture.ok) return repRefus(lecture);

  const version = process.env.MGS_TEMPLATE_VERSION?.trim() || VERSION_INCONNUE;
  const resultat = await callAgency<{ ok?: unknown }>("/api/v1/heartbeat", {
    method: "POST",
    body: JSON.stringify({ template_version: version.slice(0, 30) }),
  });

  if (resultat === null) {
    return repErreur("La plateforme n’a pas enregistré la version du site.", 503);
  }
  return NextResponse.json(
    { ok: true, version },
    { headers: { "Cache-Control": "no-store" } },
  );
}