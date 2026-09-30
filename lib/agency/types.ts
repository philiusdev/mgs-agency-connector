// Types du connecteur MGS : ce que la plateforme renvoie, ce que le site affiche.
//
// Deux règles gouvernent ce fichier, et les deux sont la raison d'être du
// connecteur :
//
//  1. AUCUN type affichable n'est réécrit ici. Tout ce qui se voit à l'écran
//     (identité, bouton flottant, offres, prestations, demandes, abonnement)
//     est défini dans `contrat-partage.ts`, copie verbatim du contrat partagé
//     de la plateforme. On le RÉ-EXPORTE au lieu de le redéclarer : redéclarer
//     un type, c'est garantir qu'il divergera un jour.
//  2. Ce qui n'est PAS dans le contrat est déclaré ici, et nommé comme tel : les
//     annonces et la facturation. La plateforme n'a jamais fait passer ces deux
//     lectures par le contrat ; elles n'ont donc aucune forme officielle à
//     recopier, et il vaut mieux le dire que le deviner.
//
// Ce fichier ne lit aucune variable d'environnement : il peut être importé
// côté serveur comme côté navigateur sans exposer une clé. La lecture est dans
// `space.ts`.
//
// Les identifiants de type gardent le préfixe historique `Agency*` : c'est le
// vocabulaire du fichier, repris tel quel par `INSTALLATION-CONNECTEUR.md`
// §5.3 (`AgencySpace`) et par les composants. Tous les CHAMPS sont en français.

import type {
  AbonnementAffiche,
  ActeurAffiche,
  BoutonFlottantAffiche,
  CodePeriodeFacturation,
  CodeStatutAbonnement,
  CodeStatutDemande,
  CodeTypeActeur,
  CodeTypeEvenement,
  ContexteBoutonFlottant,
  DemandeAffiche,
  EtatPrix,
  EvenementAffiche,
  IdentiteAgence,
  NiveauUrgenceBouton,
  OffreAffiche,
  PaiementAffiche,
  PositionBouton,
  PrestationAffiche,
  PrixAffiche,
  ReponseAbonnement,
  ReponseAgence,
  ReponseCreationDemande,
  ReponseDemandes,
  ReponsePrestations,
} from "./contrat-partage";

/* -------------------------------------------------------------------------- *
 * Ce que le contrat partagé définit — ré-exporté, jamais redéclaré.
 * -------------------------------------------------------------------------- */

export type {
  AbonnementAffiche,
  ActeurAffiche,
  BoutonFlottantAffiche,
  CodePeriodeFacturation,
  CodeStatutAbonnement,
  CodeStatutDemande,
  CodeTypeActeur,
  CodeTypeEvenement,
  ContexteBoutonFlottant,
  DemandeAffiche,
  EtatPrix,
  EvenementAffiche,
  IdentiteAgence,
  NiveauUrgenceBouton,
  OffreAffiche,
  OffreAffiche as AgencyOffer,
  PaiementAffiche,
  PositionBouton,
  PrestationAffiche,
  PrixAffiche,
  ReponseAbonnement,
  ReponseAgence,
  ReponseCreationDemande,
  ReponseDemandes,
  ReponsePrestations,
} from "./contrat-partage";

/* -------------------------------------------------------------------------- *
 * Ce que la plateforme renvoie, avant normalisation.
 *
 * `space.ts` ne fait PAS confiance à un payload : `loadAgencySpace` dégrade
 * silencieusement quand la plateforme tombe, et la seule façon que ce silence
 * reste inoffensif est qu'aucune valeur inattendue n'atteigne un composant. La
 * forme ENTRÉE est donc typed « ce que le réseau a renvoyé » — champs
 * facultatifs, `unknown` — et la forme SORTIE est typée par le contrat. Le
 * contrat porte la forme affichable ; il ne peut pas porter la forme réseau,
 * qui par définition n'est pas garantie.
 * -------------------------------------------------------------------------- */

/** Réponse de `GET /api/v1/agency` : l'enveloppe agrégée de l'espace. */
export type ReponseEspaceAgenceBrut = {
  agence?: { identite?: unknown; bouton_flottant?: unknown } | null;
  /** Repli de compatibilité : c'est `agence.identite` qui fait foi. */
  identite?: unknown;
  prestations?: unknown;
  offres?: unknown;
  abonnement?: unknown;
  demandes?: unknown;
};

/** Réponse de `GET /api/v1/agency/requests`. */
export type ReponseDemandesBrut = { demandes?: unknown };

/** `GET /api/v1/announcements` renvoie un tableau nu, sans enveloppe. */
export type ReponseAnnoncesBrut = unknown;

/** Réponse de `GET /api/v1/billing`. */
export type ReponseFacturationBrut = {
  site_name?: unknown;
  unpaid_invoices?: unknown;
  portal_url?: unknown;
  can_pay_online?: unknown;
  payment_endpoint?: unknown;
  billing_available?: unknown;
  billing_message?: unknown;
};

/* -------------------------------------------------------------------------- *
 * Ce que le contrat ne définit pas : les annonces.
 * -------------------------------------------------------------------------- */

/**
 * Gravité d'une annonce.
 *
 * `announcements.severity` est un `text` libre en base, sans CHECK : la seule
 * liste fiable est donc celle de la feuille de style, `info`, `warning`,
 * `critical`. Toute autre valeur retombe sur `info`, jamais sur elle-même.
 */
export type AgencyAnnouncementSeverity = "info" | "warning" | "critical";

/**
 * Une annonce de l'agence (`announcements`).
 *
 * La plateforme renvoie `{id, title, body, severity, starts_at, ends_at}` :
 * `target_site_ids` est retiré par la route, qui filtre déjà sur le site
 * appelant. `starts_at` est exposé sous le nom `published_at` parce que c'est
 * ce que l'écran affiche ; `ends_at` est conservé tel quel.
 */
export type AgencyAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: AgencyAnnouncementSeverity;
  published_at: string | null;
  ends_at: string | null;
};

/* -------------------------------------------------------------------------- *
 * Ce que le contrat ne définit pas : la facturation.
 *
 * `/api/v1/billing` n'est PAS sérialisé par le contrat. Son `subscription`
 * est redondant, et son `domain` n'apparait que dans la branche degradee de la
 * route, ou il vaut toujours `null` : aucune migration ne porte de colonne
 * d'expiration de domaine. On ne copie NI l'un NI l'autre — l'abonnement est
 * deja dans `AgencySpace.abonnement`, produit par le contrat via
 * `construireReponseAbonnement`. Reconstruire ici une etiquette d'abonnement,
 * ou un bandeau de renouvellement de domaine, serait exactement la
 * duplication que le contrat interdit.
 * -------------------------------------------------------------------------- */

/**
 * Une facture impayée (`billing_invoices`, filtrée sur `open`/`uncollectible`).
 *
 * `statut` reste un CODE et le reste : la plateforme ne fournit aucun libellé de
 * statut de facture et le connecteur n'en invente pas. `statut_connu` dit si le
 * code est l'un des deux que la plateforme sélectionne ; à l'écran, un statut non
 * connu ne s'affiche pas.
 */
export type AgencyInvoice = {
  id: string;
  /** Numéro de facture (`number`), écrit tel que la plateforme l'écrit. */
  numero: string | null;
  statut: string | null;
  statut_connu: boolean;
  /** Montant en centimes, tel quel : c'est la base qui fait foi. */
  montant_cents: number;
  /** Montant formaté par le CONTRAT, jamais par le connecteur. */
  montant_libelle: string;
  devise: string;
  emise_le: string | null;
  echeance_le: string | null;
};

/**
 * Situation de facturation d'un espace, hors abonnement (voir `AgencySpace`).
 *
 * Les noms de champs reprennent ceux de `GET /api/v1/billing` un à un, à une
 * exception : `subscription` a disparu, et `portal_url` n'est conservé que s'il
 * est une vraie URL http(s). Un endpoint hors contrat se lit d'autant mieux
 * qu'il se compare ligne à ligne avec sa route.
 *
 * `billing_available` est le seul signal qui distingue « cet espace n'a pas de
 * facturation » — la route répond alors un 200 complet avec
 * `billing_available: false` — de « la facturation est cassée ». Un `null` ici,
 * lui, veut dire que la route n'a pas répondu du tout.
 */
export type AgencyBilling = {
  site_name: string | null;
  unpaid_invoices: AgencyInvoice[];
  portal_url: string | null;
  can_pay_online: boolean;
  /** Chemin PLATEFORME, jamais une URL du site client : à relayer via `callAgency`. */
  payment_endpoint: string | null;
  billing_available: boolean;
  billing_message: string | null;
};

/* -------------------------------------------------------------------------- *
 * L'espace, tel que le site l'affiche.
 * -------------------------------------------------------------------------- */

/**
 * Tout ce que l'onglet « Mon agence » affiche, chargé côté serveur.
 *
 * Renvoie `null` quand rien n'est joignable ni configuré : le site client
 * fonctionne alors normalement, sans onglet « Mon agence ». C'est la règle d'or
 * du connecteur (`INSTALLATION-CONNECTEUR.md` §1 et §5.3) : plateforme down ou
 * clé absente, le site ne casse jamais.
 */
export type AgencySpace = {
  /** Identité de l'agence, bouton flottant compris, par le contrat. */
  identite: IdentiteAgence;
  /** Catalogue des prestations, par le contrat. Liste vide si indisponible. */
  prestations: PrestationAffiche[];
  /** Offres mises en avant, par le contrat. Liste vide si indisponible. */
  offres: OffreAffiche[];
  /** Abonnement de l'espace, par le contrat. Jamais `null` (voir `space.ts`). */
  abonnement: AbonnementAffiche;
  /** Demandes du site, par le contrat, suivi compris. Liste vide si illisible. */
  demandes: DemandeAffiche[];
  /** Annonces de l'agence. Hors contrat. Liste vide si indisponible. */
  annonces: AgencyAnnouncement[];
  /** Facturation. Hors contrat. `null` si la plateforme ne répond pas. */
  facturation: AgencyBilling | null;
  /** Faux si les trois lectures de la plateforme ont toutes échoué. */
  joignable: boolean;
};
