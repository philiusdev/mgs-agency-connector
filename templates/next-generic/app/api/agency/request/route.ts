// Enregistrement d'une demande de prestation, pour le client connecté du site.
// Route serveur : la clé du site et le secret de la plateforme restent ici.

import { NextResponse } from "next/server";
import { z } from "zod";

import { callAgency } from "@/lib/agency/client";
import { loadAgencySpace, purgerCacheAgence } from "@/lib/agency/space";
import { MESSAGE_DEMANDE_ENVOYEE, type ReponseCreationDemande } from "@/lib/agency/contrat-partage";
import {
  champsEnErreur,
  lireSession,
  nomDepuisEmail,
  normaliserTelephoneBurkinabe,
  premierMessage,
  repErreur,
  repRefus,
  texte,
} from "../_interne/securite";
import { autoriserAppel, cleAppel, entetesLimite } from "../_interne/limite";

/**
 * La demande du commerçant, transmise à la plateforme.
 *
 * Cette route remplace une version qui déposait la demande chez l'agence en
 * tant que visiteur anonyme : n'importe quel visiteur pouvait fabriquer une
 * demande chez le client, avec un email choisi à la main, et l'agence
 * répondait au mauvais destinataire. Quatre règles ferment cette porte :
 *
 *  - LE DEMANDEUR VIENT DE LA SESSION. `requester_email` est lu dans
 *    `user.email`, jamais dans le corps. Même connecté, un email venu du
 *    navigateur est IGNORÉ : la seule exception est l'absence totale de
 *    session, et cette porte-là est fermée par défaut
 *    (`MGS_AGENCY_REQUIRER_SESSION`), donc éteinte sur une boutique classique.
 *  - LA VALIDATION EST LOCALE ET STRICTE. Le schéma est celui de la plateforme,
 *    nettoyage des caractères de contrôle et refus des balises compris : le
 *    commerçant ne paie jamais un aller-retour réseau pour un champ mal saisi,
 *    et un refus de la plateforme ne peut pas se déguiser en panne de service.
 *    C'est aussi pourquoi le téléphone est normalisé ici : `callAgency`
 *    transforme TOUT statut HTTP en `null`, donc un numéro rejeté par la
 *    plateforme reviendrait au commerçant en `503`.
 *  - LA RÉPONSE DE LA PLATEFORME EST REPRISE ENTIÈRE.
 *    `construireReponseCreationDemande` rend `{ demande, message }` : la
 *    demande déjà mise en forme par le CONTRAT partagé, et le message qui dit
 *    s'il faut attendre un devis. On ne réécrit ni l'un ni l'autre, on ne les
 *    tronque pas, et le seul mot de repli est `MESSAGE_DEMANDE_ENVOYEE`, qui
 *    vient du contrat lui-même. Répondre `ok: true` sans la demande priverait
 *    l'écran de la référence, et le commerçant n'aurait plus qu'à la chercher.
 *  - LE CATALOGUE EST VÉRIFIÉ CÔTÉ SITE, EN PARALLÈLE. « Prestation inconnue »
 *    (404) et « prestation retirée de la vente » (409) sont les deux seuls
 *    refus que le commerçant peut corriger lui-même ; les nommer vaut mieux que
 *    « réessayez », qui le ferait retenter indéfiniment. Un catalogue illisible ne
 *    prouve rien, donc ne bloque rien : la plateforme reste seule juge.
 */

export const dynamic = "force-dynamic";

/**
 * Corps maximal accepté : au-delà, on refuse avant même de l'interpréter.
 *
 * 32 Ko, pas 8 : une description de 4000 caractères tient largement dedans, mais
 * seulement si elle est en français. 4000 caractères en écriture non latine pèsent
 * quatre fois plus en octets, et un commerçant qui écrit dans sa langue doit voir
 * sa demande partir, pas se faire refuser pour une question d'encodage. La
 * longueur est mesurée en caractères, donc la limite suit la saisie et non
 * l'encodage ; le schéma borne les champs de toute façon — ce garde-fou n'est
 * qu'un filet, pas une règle de métier.
 */
const CORPS_MAX = 32 * 1024;

/**
 * Le corps brut, déjà mesuré, en objet exploitable — ou `{}`.
 *
 * Un corps vide est une saisie sans rien dedans, pas une panne : les deux se
 * traduisent par le même `400` à champs nommés, que `safeParse` sait produire.
 * Ici, aucun `try/catch` ne serait nécessaire au sens strict — `JSON.parse` est
 * le seul point qui peut jeter, et c'est exactement ce que ce `catch` attrape :
 * une entrée illisible reste une saisie à corriger, jamais une exception.
 */
function interpret(brut: string | null): unknown {
  if (!brut || !brut.trim()) return {};
  try {
    return JSON.parse(brut);
  } catch {
    return {};
  }
}

/**
 * Corps de la demande, aligné sur `schemaDemande`
 * (`plateforme/lib/agency-validation.ts`).
 *
 * `requester_name` et `requester_email` sont facultatifs ICI, et uniquement ici :
 * ils peuvent venir de la session, et une boutique sans nom de compte ne doit
*    pas être bloquée sur un champ qu'elle ne peut pas fournir. Les bornes, elles,
 *    sont celles de la plateforme : c'est elle qui décidera, au dernier mot, de ce
 *    qui est recevable.
 */
const schemaCorps = z.object({
  service_id: z.string({ error: "Choisissez une prestation." }).trim().uuid("Prestation inconnue."),
  requester_name: texte("Le nom", 2, 120).optional(),
  requester_email: z
    .string({ error: "L’adresse email est obligatoire." })
    .trim()
    .toLowerCase()
    .max(254, "Adresse email trop longue.")
    .email("Adresse email invalide.")
    .optional(),
  requester_phone: z.string().trim().max(24, "Numéro de téléphone trop long.").optional(),
  subject: texte("L’objet", 3, 160),
  description: texte("La description", 10, 4000, true),
});

export async function POST(request: Request) {
  /* 1. Qui appelle ? La session passe avant tout le reste : c'est elle qui
   *    décide de l'email, et le corps ne pourra pas la contredire. */
  const lecture = await lireSession();
  const session = lecture.ok ? lecture.session : null;
  if (!lecture.ok && lecture.motif !== "non_connecte") return repRefus(lecture);

  /* 2. Sans session, la route est fermée par défaut. Une boutique qui garde
   *    volontairement un formulaire public de contact le rouvre explicitement. */
  if (!session && sessionExigeSession()) {
    return repErreur("Connectez-vous pour envoyer une demande.", 401, ["session"]);
  }

  /* 3. Le corps, lu en une fois et mesuré AVANT d'être interprété. Le garde-fou
   *    se base sur la longueur réellement lue, pas sur l'en-tête `content-length` :
   *    cet en-tête vient du client, peut être absent (transfert par morceaux) et
   *    serait donc facile à contourner. `request.text()` borne la mémoire, le
   *    refus 413 tombe avant tout travail de validation. */
  const brut = await request.text().catch(() => null);
  if (brut !== null && brut.length > CORPS_MAX) {
    return repErreur("Demande trop volumineuse.", 413);
  }

  /* 4. Un corps illisible ou vide vaut `{}` : la validation tranche juste
   *    après, et le commerçant reçoit le même message qu'un champ manquant. */
  const parse = schemaCorps.safeParse(interpret(brut));
  if (!parse.success) {
    return repErreur(
      premierMessage(parse.error.issues, "Vérifiez les informations saisies."),
      400,
      champsEnErreur(parse.error.issues),
    );
  }

  /* 5. L'identité. Session d'abord, corps ensuite — et le corps n'est lu que
   *    s'il n'y a personne derrière. */
  const email = sessionEmail(session, parse.data.requester_email);
  if (!email) {
    /* Deux refus différents, parce que les remédiations diffèrent. Un
     * compte connecté sans adresse email ne pourra pas en fournir une en se
     * reconnectant : `401`, et le message le dit. Un formulaire anonyme sans
     * adresse est une saisie à corriger : `400`, avec le champ nommé — un `401`
     * lui demanderait de se connecter, ce qui n'est pas le problème. */
    if (session) {
      return repErreur(
        "Votre compte ne porte pas d’adresse email : la demande ne peut pas être traitée.",
        401,
        ["requester_email"],
      );
    }
    return repErreur("L’adresse email est obligatoire.", 400, ["requester_email"]);
  }
  const nom = parse.data.requester_name ?? session?.nom ?? nomDepuisEmail(email);
  if (!nom) {
    return repErreur("Indiquez votre nom.", 400, ["requester_name"]);
  }

  /* 6. Le téléphone, normalisé comme la plateforme le ferait : même tri, même
   *    format stocké. Une chaîne vide vaut absence, pas erreur — la colonne est
   *    nullable et une case vide n'a jamais été un numéro. */
  let telephone: string | undefined;
  if (parse.data.requester_phone) {
    const normalise = normaliserTelephoneBurkinabe(parse.data.requester_phone);
    if (!normalise) {
      return repErreur("Numéro invalide : utilisez le format +226 55 12 34 56.", 400, ["requester_phone"]);
    }
    telephone = normalise;
  }

  /* 7. Limite d'appels, comptée AVANT d'aller sur le réseau : une rafale ne doit
   *    pas consommer le quota de la boutique sur les lectures de son tableau. */
  const decision = autoriserAppel(cleAppel(session, request));
  if (!decision.autorise) {
    return repErreur(
      "Trop de demandes envoyées d’affilée. Réessayez dans un instant.",
      429,
      [],
      entetesLimite(decision),
    );
  }

  /* 8. Envoi et vérification du catalogue EN PARALLÈLE : les deux lectures
   *    partent ensemble, la latence est celle de la plus lente. Le verdict local
   *    ne sert qu'à NOMMER un échec — la plateforme reste seule juge. */
  const charge = {
    service_id: parse.data.service_id,
    requester_name: nom,
    requester_email: email,
    ...(telephone ? { requester_phone: telephone } : {}),
    subject: parse.data.subject,
    description: parse.data.description,
  };
  const [refusCatalogue, creation] = await Promise.all([
    verifierCatalogue(parse.data.service_id),
    callAgency<ReponseCreationDemande>("/api/v1/agency/requests", {
      method: "POST",
      body: JSON.stringify(charge),
    }),
  ]);

  if (creation === null) {
    if (refusCatalogue) return repErreur(refusCatalogue.erreur, refusCatalogue.statut, ["service_id"]);
    /* `callAgency` ne dit pas POURQUOI : plateforme muette, timeout, clé
     * révoquée, `429` de la plateforme, `503` de la plateforme. Ces cas ont une
     * seule vérité pour le client : RIEN N'EST ENREGISTRÉ. On ne prétend donc
     * pas avoir créé une demande qu'on n'a pas vue créer, et on ne présente pas
     * un quota dépassé comme une panne de saisie. */
    return repErreur(
      "Votre demande n’a pas pu être enregistrée. Réessayez dans un instant.",
      503,
      [],
      entetesLimite(decision),
    );
  }

  const demande = creation.demande;
  if (typeof demande !== "object" || demande === null || Array.isArray(demande)) {
    return repErreur("Réponse de l’agence illisible. Réessayez dans un instant.", 503);
  }

  /* 9. La liste affichée vient de devenir fausse : on purge le cache de données,
   *    sans chemin, pour que le prochain `GET /api/agency/requests` relise la
   *    plateforme au lieu de rendre une liste d'avant l'envoi. */
  await purgerCacheAgence();

  return NextResponse.json(
    {
      ok: true,
      demande,
      /* Un mot du contrat, jamais un mot d'ici : message absent, on rejoue le
       * message par défaut du contrat plutôt que d'en inventer un. */
      message: typeof creation.message === "string" ? creation.message : MESSAGE_DEMANDE_ENVOYEE,
    },
    { status: 201, headers: entetesLimite(decision) },
  );
}

/**
 * `MGS_AGENCY_REQUIRER_SESSION` : seul `0` rouvre le formulaire public.
 *
 * Le refus est appliqué par défaut, pas par confort. Une boutique n'a aucune
 * raison de laisser un visiteur anonyme écrire dans le dossier de ses clients,
 * et une variable qui rend ce refus optionnel doit se lire dans son nom.
 */
function sessionExigeSession(): boolean {
  const saisie = process.env.MGS_AGENCY_REQUIRER_SESSION?.trim().toLowerCase();
  if (!saisie) return true;
  return !(saisie === "0" || saisie === "false" || saisie === "non");
}

/** Email de la session s'il y en a une, celui du corps sinon, jamais le mélange. */
function sessionEmail(session: { email: string | null } | null, fourni: string | undefined): string | null {
  if (session) return session.email && session.email.includes("@") ? session.email : null;
  return fourni ?? null;
}

/**
 * Le catalogue du site dit-il quelque chose de cette prestation ?
 *
 * Deux verdicts seulement : `404` si la prestation n'existe pas dans le
 * catalogue de l'espace, `409` si elle y est mais n'est plus proposée à la vente.
 * Un catalogue ABSENT ne prouve rien — plateforme muette, cache expiré, migration
 * pas encore appliquée — donc on ne dit rien et on laisse la plateforme trancher
 * plutôt que d'inventer un refus que le commerçant ne peut pas corriger.
 */
async function verifierCatalogue(serviceId: string): Promise<{ statut: 404 | 409; erreur: string } | null> {
  const espace = await loadAgencySpace();
  if (!espace || espace.prestations.length === 0) return null;
  const prestation = espace.prestations.find((entree) => entree.id === serviceId);
  if (!prestation) {
    return { statut: 404, erreur: "Cette prestation n’existe pas dans votre catalogue." };
  }
  if (!prestation.active) {
    return { statut: 409, erreur: `La prestation « ${prestation.titre} » n’est plus proposée.` };
  }
  return null;
}