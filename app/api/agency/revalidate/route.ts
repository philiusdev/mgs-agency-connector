// Purge immédiate du cache « Mon agence » après un changement côté plateforme.
// Route serveur, administrateur du site uniquement, origine vérifiée.

import { NextResponse } from "next/server";
import { z } from "zod";

import { purgerCacheAgence } from "@/lib/agency/space";
import {
  champsEnErreur,
  lireSessionAdmin,
  premierMessage,
  repErreur,
  repRefus,
  verifierOriginePost,
} from "../_interne/securite";

/**
 * « J'ai changé un numéro dans le dashboard, le site ne l'a pas encore. »
 *
 * C'est le symptôme que cette route fait disparaître. Le délai venait du cache
 * des lectures authentifiées : sans revalidation, une modification faite dans
 * l'administration de la plateforme mettait jusqu'à `MGS_CACHE_REVALIDATE_S`
 * (60 s par défaut, 300 s au pire) à apparaître sur le site. Ce n'est pas une
 * question de confort : un numéro de WhatsApp périmé affiché en gros caractères
 * dans un pied de page fait perdre des clients, et une offre retirée que l'on
 * continue d'annoncer est une promesse que le site ne tient pas.
 *
 *  - ELLE PURGE, ELLE SEUL. `purgerCacheAgence()` vide l'étiquette
 *    `mgs-agence` — les quatre lectures authentifiées — et les chemins demandés,
 *    donc les pages déjà rendues. Elle ne fait AUCUN appel à la plateforme : la
 *    purge est locale, ne coûte rien du quota de 60 requêtes par minute de la
 *    boutique, et ne peut pas échouer parce que la plateforme est lente.
 *  - ELLE NE NOTIFIE PAS LES AUTRES SITES, ET CE N'EST PAS UN MANQUE.
 *    `POST /api/v1/heartbeat` a été lu ligne à ligne côté plateforme : il
 *    n'écrit que `template_version` et n'a aucun périmètre de diffusion.
 *    L'appeler ici écraserait la version déclarée du site sans prévenir
 *    personne. Il n'existe donc aucun appel « prévenir tous les sites » à
 *    brancher : la configuration instantanée sur TOUS les sites se décide côté
 *    plateforme. Ce que le connecteur garantit, c'est qu'une fois la purge
 *    faite, le prochain rendu du site est le plus récent possible.
 *  - ELLE EST FERMÉE AUX APPELS FORGÉS. Un `POST` authentifié par le seul cookie
 *    de session est déclenchable par un formulaire sur n'importe quel site
 *    tiers. D'où le double verrou : origine comparée à `MGS_WEBSITE_URL`, et
 *    en-tête `X-MGS-Revalidate` exigé dès que cette origine est inconnue.
 *
 * Contrôles dans cet ordre, volontairement : origine, session, purge — une
 * requête forgée ne doit pas coûter une lecture de base de données.
 *
 * Appel navigateur (l'en-tête devient obligatoire si `MGS_WEBSITE_URL` est
 * absente, ou si l'appel ne porte pas d'`Origin`) :
 *   fetch("/api/agency/revalidate", { method: "POST", headers: { "X-MGS-Revalidate": "1" }, body: JSON.stringify({ chemins: ["/", "/dashboard"] }) })
 *
 * Il n'y a PAS de `GET /api/agency/space`, et il n'y en aura pas : le panneau
 * reçoit déjà l'espace par son Server Component, une lecture complète depuis le
 * navigateur exposerait la facturation à plus de monde, et elle ne serait pas
 * plus fraîche — le rafraîchissement passe par `GET /api/agency/requests`.
 */

export const dynamic = "force-dynamic";

/** Nombre de chemins revalidés au plus par appel. */
const MAX_CHEMINS = 8;

/** Longueur maximale d'un chemin, pour qu'un `chemins` reste lisible. */
const CHEMIN_MAX = 200;

/**
 * Un chemin de page du SITE, pas une URL.
 *
 * `purgerCacheAgence` ne teste que le `/` initial, ce qui laisserait passer
 * `//ailleurs.fr` : un chemin qui ressemble à un chemin mais qui est une URL est
 * exactement le genre d'entrée qu'il ne faut pas transmettre à une fonction de
 * revalidation. On exige un `/` simple, sans `..`, et une longueur bornée.
 */
const schemaChemins = z.object({
  chemins: z
    .array(
      z
        .string({ error: "Chemin invalide." })
        .trim()
        .min(1, "Chemin invalide.")
        .max(CHEMIN_MAX, "Chemin trop long.")
        .refine(
          (chemin) => chemin.startsWith("/") && !chemin.startsWith("//") && !chemin.includes(".."),
          "Chemin invalide.",
        ),
    )
    .max(MAX_CHEMINS, `${MAX_CHEMINS} chemins au maximum.`)
    .optional(),
});

export async function POST(request: Request) {
  /* 1. Origine d'abord : un appel forgé s'arrête ici, sans toucher la base. */
  const origine = verifierOriginePost(request);
  if (!origine.ok) return repErreur(origine.erreur, 403);

  /* 2. Administrateur du site, comme `heartbeat`. */
  const lecture = await lireSessionAdmin();
  if (!lecture.ok) return repRefus(lecture);

  /* 3. Chemins demandés. Un corps absent ou illisible vaut « purge des données
   *    seulement » : c'est le cas le plus courant (purge du panneau), et refuser
   *    parce qu'un appelant a envoyé du texte à la place de JSON punirait un
   *    appel légitime. */
  const brut = await request.json().catch(() => null);
  const parse = schemaChemins.safeParse(brut ?? {});
  if (!parse.success) {
    return repErreur(
      premierMessage(parse.error.issues, "Chemins invalides."),
      400,
      champsEnErreur(parse.error.issues),
    );
  }
  const chemins = [...new Set(parse.data.chemins ?? [])];

  /* 4. La purge. `false` signifie « pas dans un contexte Next » — un script, un
   *    test, une application mobile : le site client n'est pas concerné, et le
   *    dire honnêtement vaut mieux qu'un `ok: true` qui n'a rien fait. */
  const purge = await purgerCacheAgence(chemins);
  if (!purge) {
    return repErreur("Le cache n’a pas pu être purgé dans ce contexte.", 503);
  }

  return NextResponse.json(
    { ok: true, chemins },
    { headers: { "Cache-Control": "no-store" } },
  );
}