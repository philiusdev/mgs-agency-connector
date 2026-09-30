// Sonde de santé du site, sans secret et sans appel à la plateforme.
// Elle répond vite, elle ne dit rien de la boutique.

import { NextResponse } from "next/server";

/**
 * « Le site répond-il ? » — et rien d'autre.
 *
 * Cette route est le point d'entrée d'une sonde de disponibilité, donc elle est
 * publique par nature : n'importe qui peut l'appeler. D'où la question qu'elle
 * doit poser à chaque champ : est-ce que le divulguer aiderait quelqu'un ?
 *
 *  - `status` — non, cela rassure une sonde et rien d'autre.
 *  - `version` — non. `MGS_TEMPLATE_VERSION` est un numéro de version de
 *    template, écrit par le commerçant dans son `.env.local`, jamais une clé.
 *  - `timestamp` — non, et il sert même : deux appels rapprochés prouvent que la
 *    page n'est pas servie depuis un cache de plusieurs minutes.
 *
 * Ce qu'elle ne fait PAS, et qu'aucune version future ne doit faire :
 *
 *  - PAS D'APPEL À LA PLATEFORME. Une sonde doit répondre même quand la
 *    plateforme est down — c'est le moment où on a besoin d'elle. Interroger
 *    `/api/v1/agency` ici transformerait chaque passage de la sonde en
 *    consommation du quota de 60 requêtes par minute de la boutique.
 *  - PAS DE « LE CONNECTEUR EST-IL CONFIGURÉ ? ». Répondre `configure: false`
 *    dit à un visiteur que le site est branché chez MGS et lui épargne même de
 *    chercher ; exposer `MGS_PLATFORM_URL` ou `MGS_SITE_KEY` serait pire encore.
 *    Une sonde n'a pas à dire ce que le serveur est capable de faire.
 *  - PAS DE SECRET, NI EN RÉPONSE NI EN JOURNAL. Un secret qui sort d'ici sort
 *    d'une réponse HTTP : il est dans l'historique du navigateur de tous ceux
 *    qui ont appelé la route.
 *
 * Le `Cache-Control: no-store` est volontaire : une sonde qui reçoit une
 * réponse d'il y a une heure n'a rien vérifié du tout.
 */

export const dynamic = "force-dynamic";

/** Version déclarée quand `MGS_TEMPLATE_VERSION` est absente. */
const VERSION_INCONNUE = "0.0.0";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: process.env.MGS_TEMPLATE_VERSION?.trim() || VERSION_INCONNUE,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}