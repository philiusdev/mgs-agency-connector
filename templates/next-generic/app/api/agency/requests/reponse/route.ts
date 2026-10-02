// Réponse d'un client à un devis : il l'accepte, ou il le refuse.
// Route serveur : elle relaie la décision vers la plateforme, sans jamais
// décider à la place de la plateforme.

import { NextResponse } from "next/server";

import { callAgenceAvecDetail } from "@/lib/agency/client";
import type { ReponseDemandesBrut } from "@/lib/agency/types";
import {
  lireSessionAdmin,
  premierMessage,
  champsEnErreur,
  repErreur,
  repRefus,
  texte,
  verifierOriginePost,
} from "../../_interne/securite";
import { z } from "zod";

/**
 * Le client répond-il à son devis.
 *
 * Elle répond à une absence, pas à un oubli : jusqu'ici, un devis reçu ne pouvait
 * être traité que par un agent. Le commerçant lisait « En attente du client » et
 * n'avait aucun moyen d'y mettre fin, sinon par un appel téléphonique — ce qui
 * transforme une formalité en obstacle, et laisse une demande en attente le temps
 * que quelqu'un décroche.
 *
 * Cinq décisions, et leurs raisons :
 *
 *  - ELLE EXIGE LE RÔLE D'ADMINISTRATION, comme `/api/agency/requests`. Le
 *    dossier contient l'objet, le téléphone et le nom du demandeur : ce sont des
 *    données personnelles. Un compte connecté sans droit d'administration obtient
 *    `403`, et non « la liste est vide ».
 *  - ELLE NE RELAIS QUE CE QUE LE CORPS PORTE. La plateforme décide de la
 *    transition, du statut atteint et du motif de refus ; cette route ne
 *    transforme rien, ne complète rien et ne déduit aucun état. Elle ne connaît
 *    même pas la liste des statuts : la seule règle locale est « le corps
 *    envoyé par le client », et tout le reste vient du contrat côté plateforme.
 *  - ELLE VALIDE AVANT L'APPEL RÉSEAU, avec le même schéma que la plateforme :
 *    un motif trop long, une balise, un refus sans motif ou une acceptation
 *    avec motif sont refusés ici. Un aller-retour évité est un aller-retour que le
 *    commerçant ne paie pas en temps d'attente, et surtout un refus dont il voit le
 *    vrai motif au lieu d'un « service indisponible » — ce que `callAgency` aurait
 *    produit.
 *  - ELLE CONSERVE LE REFUS DE LA PLATEFORME. `callAgency` transforme tout
 *    statut non-2xx en `null`, ce qui est juste au rendu d'une page et faux ici :
 *    « ce devis est déjà refusé » et « la plateforme ne répond pas » ne se
 *    distinguent pas devant un bouton pressé. D'où `callAgenceAvecDetail`.
 *  - ELLE NE RENVOIE QUE LA FORME DE LECTURE. La plateforme sérialise déjà la
 *    demande par le CONTRAT ; la route la renvoie telle quelle. Aucune donnée de
 *    l'espace client ne traverse cette route.
 *
 * Elle est aussi protégée contre l'origine comme `POST /api/agency/request` : un
 * formulaire forgé sur un site tiers ne doit pas pouvoir accepter un devis au nom
 * d'un commerçant.
 */

/** Longueur maximale d'un motif : celle de la plateforme, et la même borne ici. */
const MOTIF_MAX = 280;

const corps = z.object({
  id: z.string().min(1, "Demande inconnue."),
  reponse: z.enum(["accepte", "refuse"], { error: "Réponse inconnue." }),
  motif: texte("Le motif", 3, MOTIF_MAX, true).optional(),
});

/**
 * Le motif est-il cohérent avec la réponse ?
 *
 * Deux règles, et elles ne sont pas symétriques :
 *
*  - REFUSER EXIGE UN MOTIF. La plateforme l'exige aussi, mais l'appliquer ici
 *    change tout : un refus sans motif est une faute de formulaire, et le
 *    commerçant peut la corriger. Refusé par le serveur, il ne verrait qu'un 400
 *    ramené à `null` par l'appelant, donc « service indisponible », et il
 *    renverrait sa demande en croyant qu'elle n'est pas partie.
 *  - ACCEPTER INTERDIT UN MOTIF. On ne refuse pas pour ajouter un commentaire : si
 *    un texte arrive sur une acceptation, il ne vient pas de l'écran qui propose
 *    cette action. Le conserver serait relayé tel quel à un agent qui ne l'a pas
 *    demandé, et stocké dans le journal comme si le client l'avait voulu.
 *
 * `superRefine` et non un `.refine` sur le champ : la règle porte sur les DEUX
 * champs ensemble, et c'est la seule forme de Zod qui puisse l'exprimer.
 */
const corpsCoherent = corps.superRefine((valeur, contexte) => {
  const motifPresent = typeof valeur.motif === "string" && valeur.motif !== "";
  if (valeur.reponse === "refuse" && !motifPresent) {
    contexte.addIssue({
      code: "custom",
      path: ["motif"],
      message: "Le motif est obligatoire pour refuser un devis.",
    });
  }
  if (valeur.reponse === "accepte" && motifPresent) {
    contexte.addIssue({
      code: "custom",
      path: ["motif"],
      message: "Un devis accepté n’accepte pas de motif.",
    });
  }
});

export async function POST(request: Request) {
  const origine = verifierOriginePost(request);
  if (!origine.ok) return repErreur(origine.erreur, 403);

  const lecture = await lireSessionAdmin();
  if (!lecture.ok) return repRefus(lecture);

  const brut = await request.json().catch(() => null);
  const analyse = corpsCoherent.safeParse(brut);
  if (!analyse.success) {
    return repErreur(
      premierMessage(analyse.error.issues, "Vérifiez les informations saisies."),
      400,
      champsEnErreur(analyse.error.issues),
    );
  }
  const saisie = analyse.data;

  // L'identifiant entre dans un chemin d'URL : il est validé ici pour qu'une
  // chaîne construite ne puisse pas faire sortir la requête du préfixe autorisé.
  if (!/^[0-9a-fA-F-]{36}$/.test(saisie.id)) {
    return repErreur("Demande inconnue.", 400, ["id"]);
  }

  const reponse = await callAgenceAvecDetail<ReponseDemandesBrut>(
    `/api/v1/agency/requests/${saisie.id}/reponse`,
    {
      method: "POST",
      body: JSON.stringify({ reponse: saisie.reponse, motif: saisie.motif ?? undefined }),
    },
  );

  // `null` = la plateforme n'a pas répondu du tout, ou la configuration du site
  // est absente. Ce n'est pas un refus, et le dire serait demander au commerçant
  // de réessayer une décision qui n'a jamais été transmise.
  if (reponse === null) {
    return repErreur("Votre réponse n’a pas pu être transmise. Réessayez dans un instant.", 503);
  }

  if (!reponse.ok) {
    const corpsPlateforme = reponse.corps as { error?: unknown; champs?: unknown } | null;
    const message =
      typeof corpsPlateforme?.error === "string" && corpsPlateforme.error.trim() !== ""
        ? corpsPlateforme.error
        : "Votre réponse n’a pas pu être enregistrée.";
    const champsFautifs = Array.isArray(corpsPlateforme?.champs)
      ? corpsPlateforme.champs.filter((champ): champ is string => typeof champ === "string")
      : [];
    // Le statut de la plateforme est relayé tel quel : un 409 de séquence doit
    // rester un 409, pour que le composant sache qu'il doit relire plutôt que de
    // proposer de réessayer.
    return repErreur(message, reponse.statut, champsFautifs);
  }

  return NextResponse.json(
    { ok: true, demandes: Array.isArray(reponse.valeur?.demandes) ? reponse.valeur.demandes : [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}