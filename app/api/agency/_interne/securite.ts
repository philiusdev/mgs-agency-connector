// Contrôles que TOUTES les routes du connecteur refont à l'identique.
// Dossier `_interne` : le routeur Next l'ignore (segment privé), il n'existe
// donc aucune URL `/api/agency/_interne`. Aucun secret n'est lu ici.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

/**
 * Les contrôles communs, réunis ici parce qu'ils doivent être IDENTIQUES
 * partout : une règle de sécurité copiée quatre fois est une règle qui sera
 * corrigée trois fois.
 *
 * Ce fichier tient cinq verrous :
 *
 *  - L'IDENTITÉ VIENT DE LA SESSION, JAMAIS DU CORPS DE LA REQUÊTE. Un email
 *    dans un corps JSON est une chaîne que l'appelant choisit ; l'email d'une
 *    session est une chaîne que le serveur a vérifiée. Les routes qui écrivent
 *    chez l'agence prennent donc le demandeur dans la session, et ignorent tout
 *    email venu du navigateur.
 *  - LE RÔLE EST VÉRIFIÉ SÉPARÉMENT DE L'AUTHENTIFICATION. « Connecté » et
 *    « administrateur du site » sont deux questions ; la route qui purge le
 *    cache ou relit la facturation n'a pas le droit de les confondre.
 *  - L'ORIGINE EST COMPARÉE, JAMAIS DEVINÉE. Une route qui purge le cache est
 *    déclenchable par un formulaire forgé sur un site tiers si l'on se contente
 *    du cookie de session. D'où la comparaison à `MGS_WEBSITE_URL`, et l'en-tête
 *    non simple exigé quand cette origine est inconnue.
 *  - LES MOTS SONT FRANÇAIS ET BORNÉS. `texte()` reproduit le nettoyage de la
 *    plateforme (`agency-validation.ts` `texteSaisi`) AVANT tout appel réseau :
 *    le commerçant ne paie pas un aller-retour pour avoir mis des balises dans
 *    le champ « objet », et l'agence ne reçoit jamais de code à afficher.
 *  - AUCUNE EXCEPTION NE REMONTE. `createClient()` lève si la configuration
 *    Supabase manque, `getUser()` peut échouer, `profiles` peut ne pas exister :
 *    chaque cas devient un statut HTTP nommé, jamais une page en 500.
 *
 * Dépendances hors du dépôt : `next/server`, `zod` (>= 4) et
 * `@/lib/supabase/server`, fourni par le site client. Rien d'autre.
 */

/** Rôles autorisés à administrer l'espace « Mon agence » d'un site. */
export const ROLES_ADMINISTRATION: readonly string[] = ["admin"];

/** Longueur maximale d'un nom de demandeur, celle du schéma de la plateforme. */
const NOM_MAX = 120;

/** Caractères de contrôle retirés d'une saisie : ils cassent les journaux. */
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Un début de balise : la plateforme le refuse, on le refuse avant elle. */
const BALISE = /<[a-zA-Z!/?]/;

/* ========================================================================== *
 * Session
 * ========================================================================== */

/** Ce qu'on sait de l'appelant une fois la session lue. */
export type SessionLue = {
  utilisateurId: string;
  /** Jamais `null` quand la session existe et que le compte porte un email. */
  email: string | null;
  /** Nom d'affichage éventuel, non fiable : c'est une métadonnée libre. */
  nom: string | null;
  /** Rôle lu dans `profiles`, `null` si la route n'a pas exigé de rôle. */
  role: string | null;
};

/**
 * Pourquoi l'accès est refusé.
 *
 * La distinction existe pour une seule route, mais elle vaut dans toutes :
 * « personne n'est connecté » et « je n'arrive pas à lire qui vous êtes » ne
 * se soignent pas de la même façon. La première autorise parfois une reprise
 * sans session ; la seconde ne doit jamais être prise pour une absence de
 * connexion, sinon une boutique mal configurée croirait que ses clients
 * n'ont pas de compte.
 */
export type MotifRefus = "non_connecte" | "technique" | "role";

/** Résultat de la lecture de session : une session, ou un refus nommé. */
export type ResultatSession =
  | { ok: true; session: SessionLue }
  | { ok: false; statut: 401 | 403; motif: MotifRefus; erreur: string };

/**
 * Forme minimale d'un client Supabase pour ce fichier.
 *
 * On ne dépend pas des types de `@supabase/supabase-js` : une boutique peut
 * être sur une version différente de `select()` ou de `maybeSingle()`, et le
 * connecteur ne doit pas casser à l'installation pour ça. On ne garde que les
 * deux appels réellement faits, et on vérifie leur forme à l'exécution.
 */
type ClientSupabaseMinimal = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null } | null;
      error: unknown;
    }>;
  };
  from: (table: string) => {
    select: (colonnes: string) => {
      eq: (colonne: string, valeur: string) => {
        maybeSingle: () => Promise<{ data: { role?: string | null } | null; error: unknown }>;
      };
    };
  };
};

const CONTROLE_SESSION = "Authentification indisponible. Réessayez dans un instant.";

/**
 * Session seule : n'importe quel compte connecté a une identité vérifiée.
 *
 * Le rôle est laissé à `null` sans le lire : une route qui n'exige pas de rôle
 * ne doit pas payer une requête `profiles` pour rien.
 */
export async function lireSession(): Promise<ResultatSession> {
  return lireSessionInterne(false);
}

/** Session ET rôle d'administration du site. */
export async function lireSessionAdmin(): Promise<ResultatSession> {
  return lireSessionInterne(true);
}

/**
 * La lecture de session, une seule fois, avec ou sans exigence de rôle.
 *
 * Un `401` signifie « on ne sait pas qui vous êtes », un `403` « je sais qui
 * vous êtes, et ce n'est pas un administrateur ». Les confondre ferait croire à
 * un bug de session au commerçant qui n'a simplement pas le droit.
 */
async function lireSessionInterne(exigerRole: boolean): Promise<ResultatSession> {
  let client: ClientSupabaseMinimal;
  try {
    client = (await createClient()) as unknown as ClientSupabaseMinimal;
  } catch (erreur) {
    // Site sans configuration Supabase : c'est une faute d'installation, pas
    // une intrusion. On ne la traite donc pas comme une absence de connexion,
    // mais le journal doit la nommer — sinon elle se perd dans les 401.
    console.error("[mgs-agency] Configuration d'authentification illisible.", erreur);
    return { ok: false, statut: 401, motif: "technique", erreur: CONTROLE_SESSION };
  }

  let utilisateur: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null = null;
  try {
    const reponse = await client.auth.getUser();
    utilisateur = reponse?.data?.user ?? null;
  } catch (erreur) {
    console.error("[mgs-agency] Lecture de session impossible.", erreur);
    return { ok: false, statut: 401, motif: "technique", erreur: CONTROLE_SESSION };
  }
  if (!utilisateur?.id) {
    return { ok: false, statut: 401, motif: "non_connecte", erreur: "Connexion requise." };
  }

  const session: SessionLue = {
    utilisateurId: utilisateur.id,
    email: typeof utilisateur.email === "string" ? utilisateur.email.trim() || null : null,
    nom: nomDepuisMetadonnees(utilisateur.user_metadata),
    role: null,
  };
  if (!exigerRole) return { ok: true, session };

  let profil: { role?: string | null } | null = null;
  try {
    const reponse = await client.from("profiles").select("role").eq("id", utilisateur.id).maybeSingle();
    profil = reponse?.data ?? null;
  } catch (erreur) {
    console.error("[mgs-agency] Rôle du compte illisible.", erreur);
    return { ok: false, statut: 403, motif: "technique", erreur: "Rôle du compte illisible." };
  }
  if (!profil?.role || !ROLES_ADMINISTRATION.includes(profil.role)) {
    return { ok: false, statut: 403, motif: "role", erreur: "Accès réservé à l’administration." };
  }
  return { ok: true, session: { ...session, role: profil.role } };
}

/**
 * Nom d'affichage repris des métadonnées du compte, s'il y en a une.
 *
 * Ce nom n'est JAMAIS une autorité : une métadonnée est un champ que
 * l'utilisateur écrit lui-même. Il sert donc uniquement de suggestion, et il
 * repassera par `texte()` avant d'être envoyé — c'est-à-dire qu'il perdra ses
 * balises comme n'importe quelle saisie.
 */
function nomDepuisMetadonnees(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  for (const cle of ["full_name", "nom_complet", "name", "nom"]) {
    const valeur = metadata[cle];
    if (typeof valeur === "string") {
      const nettoye = valeur.replace(CONTROLE, "").replace(/\s+/g, " ").trim().slice(0, NOM_MAX);
      if (nettoye.length >= 2) return nettoye;
    }
  }
  return null;
}

/**
 * Partie locale d'un email, utilisée en dernier recours comme nom.
 *
 * Un site dont la base clients n'a qu'un email n'a pas de nom à demander : le
 * demander ferait échouer la demande pour un détail que l'appelant ne peut pas
 * fournir. On ne l'utilise que si la session en a un, et seulement s'il en
 * reste assez de caractères pour les bornes de la plateforme.
 */
export function nomDepuisEmail(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const partie = email.slice(0, email.indexOf("@")).replace(/[._\-+]+/g, " ").trim();
  return partie.length >= 2 ? partie.slice(0, NOM_MAX) : null;
}

/* ========================================================================== *
 * Nettoyage des saisies — le même travail que la plateforme, avant elle
 * ========================================================================== */

/**
 * Champ texte nettoyé puis borné, comme `texteSaisi` côté plateforme.
 *
 * L'ordre est celui de la plateforme et il compte : on retire les caractères de
 * contrôle AVANT de mesurer, sinon la longueur mesurée ne correspond pas à la
 * longueur stockée. Les balises sont refusées parce que le suivi d'une demande
 * est relu dans plusieurs tableaux de bord, dont aucun n'a besoin de code.
 *
 * Les messages sont en français et citent la borne : un champ qui refuse une
 * saisie doit dire ce qu'il attend, sinon le commerçant recommence au hasard.
 */
export function texte(libelle: string, min: number, max: number, multiligne = false) {
  return z
    .string({ error: `${libelle} est obligatoire.` })
    .transform((valeur) => {
      const sansControle = valeur.replace(CONTROLE, "");
      if (!multiligne) return sansControle.replace(/\s+/g, " ").trim();
      return sansControle
        .replace(/[^\S\r\n]+/g, " ")
        .replace(/[ \t]*\r?\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    })
    .pipe(
      z
        .string()
        .min(min, `${libelle} : ${min} caractères minimum.`)
        .max(max, `${libelle} : ${max} caractères au maximum.`)
        .refine((valeur) => !BALISE.test(valeur), `${libelle} : les balises ne sont pas acceptées.`),
    );
}

/**
 * Un numéro burkinabé, normalisé en `+226 XX XX XX XX` comme la plateforme.
 *
 * C'est une RÉPLIQUE de `normaliserTelephoneBurkinabe`
 * (`plateforme/lib/agency-validation.ts`), pas une deuxième règle : le
 * connecteur n'importe rien de la plateforme, donc la seule façon d'envoyer un
 * numéro que la plateforme acceptera est de reproduire son tri. Un numéro
 * refusé ici ne coûte pas d'aller-retour réseau ; refusé là-bas, il se
 * ramènerait en `503`, parce que `callAgency` transforme tout refus HTTP en
 * `null` — le commerçant relirait « service indisponible » au lieu de « numéro
 * invalide », et ne pourrait pas distinguer les deux cas.
 */
export function normaliserTelephoneBurkinabe(valeur: string): string | null {
  if (!/^[+\d][\d\s.-]{7,23}$/.test(valeur)) return null;
  let chiffres = valeur.replace(/\D/g, "");
  if (chiffres.startsWith("00226")) chiffres = chiffres.slice(5);
  else if (chiffres.length === 11 && chiffres.startsWith("226")) chiffres = chiffres.slice(3);
  else if (chiffres.length === 9 && chiffres.startsWith("0")) chiffres = chiffres.slice(1);
  if (!/^[2567]\d{7}$/.test(chiffres)) return null;
  return `+226 ${chiffres.slice(0, 2)} ${chiffres.slice(2, 4)} ${chiffres.slice(4, 6)} ${chiffres.slice(6, 8)}`;
}

/* ========================================================================== *
 * Erreurs : toujours la même forme JSON
 * ========================================================================== */

/** Un problème de validation, décrit sans dépendre de la version de zod. */
type Probleme = { path?: readonly PropertyKey[]; message?: string };

/** Message d'erreur destiné au commerçant, jamais un texte anglais de zod. */
export function premierMessage(problemes: readonly Probleme[], repli: string): string {
  const premier = problemes[0];
  const message = typeof premier?.message === "string" ? premier.message.trim() : "";
  return message || repli;
}

/** Champs fautifs, pour que le formulaire surligne ce qu'il doit corriger. */
export function champsEnErreur(problemes: readonly Probleme[]): string[] {
  const champs = problemes.map((probleme) => (probleme.path ?? []).map(String).join(".")).filter(Boolean);
  return [...new Set(champs)];
}

/**
 * Toute erreur métier a la même forme : `{ error, champs }`.
 *
 * `champs` est TOUJOURS présent, même vide. Un formulaire qui fait
 * `if (corps.champs?.length)` n'a alors pas à deviner si un `400` venait d'une
 * validation ou d'un refus métier.
 */
export function repErreur(erreur: string, statut: number, champs: string[] = [], entetes?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { error: erreur, champs },
    entetes ? { status: statut, headers: entetes } : { status: statut },
  );
}

/**
 * Traduit un refus de session en réponse HTTP, `champs` vide par construction.
 *
 * Une seule ligne pour toutes les routes : c'est ce qui garantit qu'un `401`
 * d'`/api/agency/request` et un `401` d'`/api/agency/requests` se ressemblent,
 * et qu'aucun d'eux n'invente son propre format d'erreur.
 */
export function repRefus(refus: { ok: false; statut: 401 | 403; erreur: string }): NextResponse {
  return repErreur(refus.erreur, refus.statut, []);
}

/* ========================================================================== *
 * Origine — le verrou anti-CSRF des routes qui agissent sur le cache
 * ========================================================================== */

/** En-tête non simple exigé quand l'origine du site n'est pas connue. */
export const ENTETE_REVALIDATION = "x-mgs-revalidate";

/** Longueur maximale acceptée pour l'en-tête ci-dessus. */
const ENTETE_MAX = 40;

/**
 * Origine du site client, lue dans `MGS_WEBSITE_URL`.
 *
 * On ne compare JAMAIS des chaînes d'URL : `https://site/` et
 * `https://site` sont la même origine, `https://site.evil` n'est pas la même,
 * et une comparaison naïve accepterait l'une et refuserait l'autre. On passe
 * donc par le parseur, et une URL illisible vaut « origine inconnue » — jamais
 * « origine attendue ».
 */
export function origineDuSite(): string | null {
  const saisie = process.env.MGS_WEBSITE_URL?.trim();
  if (!saisie) return null;
  try {
    const url = new URL(saisie);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Résultat du contrôle d'origine : `ok` ou un message prêt à renvoyer. */
export type VerdictOrigine =
  | { ok: true }
  | { ok: false; erreur: string };

/**
 * Contrôle d'origine des appels qui modifient l'état du site.
 *
 * Deux règles, dans cet ordre :
 *
 *  1. UNE ORIGINE DIFFÉRENTE EST REFUSÉE, TOUT CONTENT-TYPE. Le vecteur d'attaque
 *    réel n'est pas le JSON — c'est le `text/plain` d'un `<form>` forgé, que le
 *    navigateur livre sans préflight. Comparer l'origine avant de regarder le
 *    `Content-Type` ferme donc plus large que la seule règle du JSON.
 *  2. UNE ORIGINE NON PROUVÉE EXIGE UN EN-TÊTE NON SIMPLE. Si `MGS_WEBSITE_URL`
 *    est absente, ou si l'appel ne porte pas d'`Origin` — cas d'un script
 *    serveur, pas d'un navigateur — il faut `X-MGS-Revalidate`. Un en-tête non
 *    simple force un préflight CORS que le site ne répond pas : une page tierce
 *    ne peut donc pas le poser, et l'exigence est réellement contraignante.
 *
 * Conséquence à connaître : un `application/json` sans en-tête `Origin` — donc
 * jamais émis par un navigateur — est refusé tant que `MGS_WEBSITE_URL` n'est
 * pas renseignée, et ne passe que par l'en-tête documenté.
 */
export function verifierOriginePost(request: Request): VerdictOrigine {
  const origineBrute = request.headers.get("origin");
  const site = origineDuSite();
  const origine = normaliserOrigine(origineBrute);

  if (origine && site && origine !== site) {
    return { ok: false, erreur: "Origine non autorisée." };
  }
  if (origine && site) return { ok: true };

  const marqueur = request.headers.get(ENTETE_REVALIDATION);
  if (typeof marqueur === "string" && marqueur.trim().length > 0 && marqueur.length <= ENTETE_MAX) {
    return { ok: true };
  }
  return {
    ok: false,
    erreur: "Origine non vérifiable. Appelez cette route avec un en-tête X-MGS-Revalidate.",
  };
}

/** Origine normalisée, ou `null` si l'en-tête est absent ou illisible. */
function normaliserOrigine(brute: string | null): string | null {
  if (!brute || brute.length > 200) return null;
  try {
    const url = new URL(brute);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}