// Liste des demandes de prestation du site, pour le panneau « Mon agence ».
// Route serveur : elle ne renvoie que des données de présentation.

import { NextResponse } from "next/server";

import { callAgency } from "@/lib/agency/client";
import type { DemandeAffiche, ReponseDemandesBrut } from "@/lib/agency/types";
import { lireSessionAdmin, repErreur, repRefus } from "../_interne/securite";

/**
 * Les demandes du site, relues à la demande.
 *
 * Elle sert à une chose : après un envoi, un rechargement de l'onglet, ou une
 * revalidation, l'écran doit relire la plateforme au lieu de recalculer une
 * liste à partir de ce qu'il a déjà. D'où le `no-store` côté navigateur — le
 * cache du navigateur ne doit jamais servir à cette route un suivi d'il y a une
 * heure, alors qu'elle existe justement pour être fraîche.
 *
 * Trois décisions, et leurs raisons :
 *
 *  - ELLE APPELLE `callAgency`, PAS `chargerDemandesAgence`. La différence est un
 *    `null` : `chargerDemandesAgence` renvoie `[]` pour une liste vide ET pour
 *    une plateforme muette, donc le panneau afficherait « aucune demande » au
 *    moment précis où il ne sait rien. Ici, `null` reste un `503` et la liste
 *    vide reste une liste vide. C'est le seul écart à la dégradation muette du
 *    connecteur, et il est voulu : une liste lue par rafraîchissement se distingue
 *    d'une liste lue au rendu, où le silence reste la bonne réponse.
 *  - ELLE EXIGE LE RÔLE D'ADMINISTRATION, PLUS QUE LES AUTRES ROUTES. La liste
 *    contient l'email et le téléphone des clients de la boutique : ce sont des
 *    données personnelles de tiers, pas le dossier du commerçant. Un compte
 *    connecté sans droit d'administration lit donc `403`, et non « la liste est
 *    vide ». Pour ouvrir à d'autres rôles, c'est `ROLES_ADMINISTRATION` dans
 *    `_interne/securite.ts` qu'il faut étendre — une seule ligne, ici.
 *  - ELLE NE RE-NORMALISE PAS. `/api/v1/agency/requests` est déjà sérialisé par
 *    `construireReponseDemandes`, donc chaque entrée est un `DemandeAffiche` du
 *    CONTRAT partagé. Refaire la normalisation ici perdrait des champs au lieu
 *    d'en gagner, et la règle du connecteur est inverse : ce que le contrat a
 *    mis en forme ne se réécrit pas sur le site. Seule la forme est vérifiée :
 *    une entrée qui n'est pas un objet part.
 *
 * Le cache de 60 s s'applique ici comme partout (`MGS_CACHE_REVALIDATE_S`) :
 * `callAgency` décide seul, et le connecteur n'a pas le droit de le contourner.
 * C'est pourquoi le rafraîchissement se fait en DEUX appels — `POST
 * /api/agency/revalidate` puis ce `GET` — et c'est pourquoi le premier ne
 * coûte aucune requête à la plateforme.
 */

export const dynamic = "force-dynamic";

/**
 * Nombre maximum de demandes renvoyées, aligné sur la borne de `space.ts`.
 *
 * Une liste plus longue ne s'affichera pas mieux, elle sera plus lente à
 * sérialiser et plus facile à exploiter en mémoire. La plateforme, elle, reste
 * la source : au-delà de la borne, la demande est absente, pas tronquée en
 * silence.
 */
const MAX_DEMANDES = 50;

export async function GET() {
  const lecture = await lireSessionAdmin();
  if (!lecture.ok) return repRefus(lecture);

  const brut = await callAgency<ReponseDemandesBrut>("/api/v1/agency/requests");
  if (brut === null) {
    return repErreur("Vos demandes sont momentanément indisponibles.", 503);
  }

  const demandes = garderLesObjets(brut?.demandes);
  return NextResponse.json(
    { ok: true, demandes },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Les entrées de la plateforme qui sont bien des objets, dans la borne. */
function garderLesObjets(brut: unknown): DemandeAffiche[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((entree): entree is DemandeAffiche => typeof entree === "object" && entree !== null && !Array.isArray(entree))
    .slice(0, MAX_DEMANDES);
}