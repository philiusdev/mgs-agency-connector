// Charge, côté serveur uniquement, tout ce que l'onglet « Mon agence » affiche.
// Aucune clé secrète ne sort d'ici : ce module lit MGS_SITE_KEY / MGS_SITE_SECRET
// et ne renvoie que des données de présentation au navigateur.

import { callAgency, ETIQUETTE_CACHE_AGENCE } from "./client";
import {
  LIBELLE_ABONNEMENT_AUCUN,
  LIBELLE_ABONNEMENT_INCONNU,
  LIBELLE_BOUTON_ACCESSIBLE,
  LIBELLE_BOUTON_DEFAUT,
  LIBELLE_NOM_INCONNU,
  LIBELLE_OBJET_INCONNU,
  NOM_AGENCE_PAR_DEFAUT,
  STATUTS_ABONNEMENT,
  STATUTS_DEMANDE,
  TYPES_ACTEUR,
  TYPES_EVENEMENT,
  construireReponseAbonnement,
  decrireActeur,
  decrireEvenement,
  decrirePrix,
  decrireStatut,
  decrireStatutAbonnement,
  formaterDate,
  formaterEmail,
  formaterSiteWeb,
  formaterTelephone,
  initiales,
  lienEmail,
  lienWhatsapp,
  normaliserDevise,
  normaliserPositionBouton,
  normaliserUrgenceBouton,
  presenterBoutonFlottant,
  presenterIdentite,
} from "./contrat-partage";
import type {
  AbonnementAffiche,
  ActeurAffiche,
  AgencyAnnouncement,
  AgencyAnnouncementSeverity,
  AgencyBilling,
  AgencyBillingPlan,
  AgencyBillingSubscription,
  AgencyInvoice,
  AgencySpace,
  BoutonFlottantAffiche,
  CodeStatutAbonnement,
  CodeStatutDemande,
  CodeTypeActeur,
  CodeTypeEvenement,
  DemandeAffiche,
  EtatPrix,
  EvenementAffiche,
  IdentiteAgence,
  OffreAffiche,
  PaiementAffiche,
  PrestationAffiche,
  PrixAffiche,
  ReponseAnnoncesBrut,
  ReponseEspaceAgenceBrut,
  ReponseFacturationBrut,
  SectionAgence,
} from "./types";

/**
 * Lecture de l'espace « Mon agence », et sa normalisation défensive.
 *
 * Trois règles, non négociables :
 *
 *  - DÉGRADATION SILENCIEUSE. `callAgency` ne lève jamais, et ce fichier non
 *    plus. Plateforme down, clé absente, 503, HTML au lieu de JSON : dans tous
 *    les cas le site client rend normalement, et perd au pire l'onglet « Mon
 *    agence ». Une exception ici remonterait dans le rendu d'une page de
 *    boutique et casserait le site du commerçant pour un problème de l'agence.
 *  - LES MOTS VIENNENT DU CONTRAT, JAMAIS D'ICI. Aucun libellé n'est écrit,
 *    traduit ou deviné dans ce fichier. Les fonctions de `contrat-partage.ts`
 *    servent à rejouer la décision de la plateforme quand une valeur manque, et
 *    à reconstruire les liens (`lienWhatsapp`, `lienEmail`, `formaterSiteWeb`)
 *    pour qu'un lien ne puisse pas pointer ailleurs que vers le numéro validé.
 *  - UNE VALEUR INATTENDUE EST ÉLIMINÉE, PAS AFFICHÉE. Un titre vide, un
 *    identifiant absent, un statut hors vocabulaire : l'entrée part, elle ne
 *    s'affiche pas. Une carte sans titre se lit comme une panne de l'agence.
 *  - UNE SECTION MUETTE EST DÉCLARÉE, JAMAIS DÉGUISÉE. Le vide laissé par une
 *    lecture qui n'a pas répondu est reporté dans `indisponibles` (voir
 *    `sectionsIndisponibles`) : une liste vide se lit comme une phrase sur
 *    l'agence — « vous n'avez pas encore de demande », « aucune facture
 *    impayée » — et le connecteur n'a pas le droit de laisser une panne écrire
 *    cette phrase à la place de l'agence. Une réponse 200 valide qui porte une
 *    liste vide n'est PAS une indisponibilité : là, la plateforme a parlé, et ce
 *    qu'elle a dit est vrai.
 *
 * Sur l'identité, la plateforme l'emporte TOUJOURS quand elle répond : aucune
 * variable d'environnement n'est lue si `/api/v1/agency` a répondu, même pour
 * dire « je n'ai pas de coordonnées ». Les variables `MGS_AGENCY_*` ne servent
 * qu'au cas « plateforme muette », où elles donnent encore un contact au
 * commerçant.
 */

/** Bornes d'affichage. Elles protègent le rendu, elles ne décident de rien. */
const MAX_ANNONCES = 5;
const MAX_OFFRES = 24;
const MAX_PRESTATIONS = 60;
const MAX_DEMANDES = 50;
const MAX_EVENEMENTS = 100;
const MAX_FACTURES = 20;
const MAX_FORFAITS = 50;

/** Statuts de facture que la plateforme sélectionne elle-même. */
const STATUTS_FACTURE = ["open", "uncollectible"];

/* ========================================================================== *
 * Lecture brute
 * ========================================================================== */

function commeObjet(valeur: unknown): Record<string, unknown> | null {
  return valeur && typeof valeur === "object" && !Array.isArray(valeur)
    ? (valeur as Record<string, unknown>)
    : null;
}

function commeListe(valeur: unknown): unknown[] {
  return Array.isArray(valeur) ? valeur : [];
}

/** Texte borné, espaces réduits. Jamais `undefined` : chaîne vide si absent. */
function texteCourt(valeur: unknown, max = 200): string {
  return typeof valeur === "string" ? valeur.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Texte long, paragraphes conservés. Repli `null` : l'appelant n'affiche rien. */
function texteLong(valeur: unknown, max = 4000): string | null {
  if (typeof valeur !== "string") return null;
  return valeur
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max) || null;
}

/** Entier fini, borné, ou `null`. */
function entier(valeur: unknown, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number | null {
  if (typeof valeur !== "number" || !Number.isFinite(valeur)) return null;
  return Math.min(max, Math.max(min, Math.trunc(valeur)));
}

/** Montant en centimes, négatif interdit — un prix négatif est illisible. */
function centimes(valeur: unknown): number | null {
  return entier(valeur, 0, 100_000_000);
}

function instantIso(valeur: unknown): string | null {
  if (typeof valeur !== "string" && typeof valeur !== "number") return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Repli `null` : mieux vaut rien afficher qu'une date illisible. */
function libelleDate(valeur: unknown): string | null {
  const instant = instantIso(valeur);
  return instant === null ? null : formaterDate(instant);
}

function estCodeStatut(valeur: string): valeur is CodeStatutDemande {
  return (STATUTS_DEMANDE as readonly string[]).includes(valeur);
}

function estCodeEvenement(valeur: string): valeur is CodeTypeEvenement {
  return (TYPES_EVENEMENT as readonly string[]).includes(valeur);
}

function estCodeActeur(valeur: string): valeur is CodeTypeActeur {
  return (TYPES_ACTEUR as readonly string[]).includes(valeur);
}

function estCodeAbonnement(valeur: string): valeur is CodeStatutAbonnement {
  return (STATUTS_ABONNEMENT as readonly string[]).includes(valeur);
}

/* ========================================================================== *
 * Normalisation — ce que la plateforme a décidé, borné pour l'affichage
 * ========================================================================== */

function normaliserIdentite(brut: unknown, secours: boolean): IdentiteAgence {
  const record = commeObjet(brut);
  if (!record) return secours ? identiteDeSecours() : presenterIdentite(null);

  const whatsapp = texteCourt(record.whatsapp, 40) || null;
  const email = formaterEmail(typeof record.email === "string" ? record.email : null);
  return {
    nom: texteCourt(record.nom, 160) || NOM_AGENCE_PAR_DEFAUT,
    whatsapp,
    // Reconstruit depuis le numéro validé : un lien ne peut pas pointer vers un
    // autre numéro que celui que l'écran affiche.
    lien_whatsapp: lienWhatsapp(whatsapp),
    email,
    lien_email: lienEmail(email),
    site_web: formaterSiteWeb(typeof record.site_web === "string" ? record.site_web : null),
    bouton_flottant: normaliserBoutonFlottant(record.bouton_flottant, whatsapp),
    mis_a_jour_le: instantIso(record.mis_a_jour_le),
    mis_a_jour_libelle: libelleDate(record.mis_a_jour_le),
  };
}

function normaliserBoutonFlottant(brut: unknown, whatsapp: string | null): BoutonFlottantAffiche {
  const record = commeObjet(brut);
  if (!record) return presenterBoutonFlottant(null, whatsapp);
  return {
    visible: record.visible === true,
    libelle: texteCourt(record.libelle, 60) || LIBELLE_BOUTON_DEFAUT,
    libelle_accessible: texteCourt(record.libelle_accessible, 80) || LIBELLE_BOUTON_ACCESSIBLE,
    bulle_libelle: texteLong(record.bulle_libelle, 1000),
    // Positions et urgences sont des vocabulaires fermés : une valeur inconnue
    // retombe sur le repli du contrat, jamais sur elle-même.
    position: normaliserPositionBouton(typeof record.position === "string" ? record.position : null),
    urgence: normaliserUrgenceBouton(typeof record.urgence === "string" ? record.urgence : null),
    lien_whatsapp: lienWhatsapp(whatsapp),
  };
}

/**
 * Identité de repli, plateforme muette.
 *
 * Chaque valeur passe par le contrat : le nom est borné comme lui le fait, le
 * téléphone par `formaterTelephone`, l'email par `formaterEmail`, l'adresse par
 * `formaterSiteWeb`. Le bouton flottant est décidé par
 * `presenterBoutonFlottant(null, …)`, c'est-à-dire par la même règle que sur
 * une plateforme qui répond — le connecteur n'invente pas de disponibilité.
 */
function identiteDeSecours(): IdentiteAgence {
  const base = presenterIdentite(null);
  const whatsapp = formaterTelephone(process.env.MGS_AGENCY_WHATSAPP);
  const emailBrut = process.env.MGS_AGENCY_EMAIL ?? null;
  return {
    ...base,
    nom: texteCourt(process.env.MGS_AGENCY_NAME, 160) || base.nom,
    whatsapp,
    lien_whatsapp: lienWhatsapp(whatsapp),
    email: formaterEmail(emailBrut),
    lien_email: lienEmail(emailBrut),
    site_web: formaterSiteWeb(process.env.MGS_WEBSITE_URL ?? null),
    bouton_flottant: presenterBoutonFlottant(null, whatsapp),
  };
}

function normaliserOffres(brut: unknown, whatsapp: string | null): OffreAffiche[] {
  return commeListe(brut)
    .map((item) => {
      const record = commeObjet(item);
      const id = texteCourt(record?.id, 64);
      const titre = texteCourt(record?.titre, 120);
      if (!id || !titre) return null;
      const message = texteCourt(record?.message_whatsapp, 500);
      return {
        id,
        titre,
        description: texteLong(record?.description, 280),
        message_whatsapp: message,
        prix_libelle: texteCourt(record?.prix_libelle, 120) || "Prestation payante · sur devis",
        active: record?.active === true,
        ordre: entier(record?.ordre, 0, 10_000) ?? 0,
        lien_whatsapp: lienWhatsapp(whatsapp, message),
      } satisfies OffreAffiche;
    })
    .filter((offre): offre is OffreAffiche => offre !== null)
    .slice(0, MAX_OFFRES);
}

function normaliserPrestations(brut: unknown): PrestationAffiche[] {
  return commeListe(brut)
    .map((item) => normaliserPrestation(item))
    .filter((prestation): prestation is PrestationAffiche => prestation !== null)
    .slice(0, MAX_PRESTATIONS);
}

/** Une prestation, ou `null` si elle n'a ni identifiant ni titre. */
function normaliserPrestation(brut: unknown): PrestationAffiche | null {
  const record = commeObjet(brut);
  const id = texteCourt(record?.id, 64);
  const titre = texteCourt(record?.titre, 160);
  if (!id || !titre) return null;
  return {
    id,
    code: texteCourt(record?.code, 64),
    titre,
    description: texteLong(record?.description, 4000),
    gratuit: record?.gratuit === true,
    prix: normaliserPrix(record?.prix),
    // Fait de catalogue : ce n'est pas une promesse faite au client.
    couverte_par_abonnement: record?.couverte_par_abonnement === true,
    // Fait de lecteur : c'est la seule que l'écran a le droit d'afficher.
    couverture_abonnement: record?.couverture_abonnement === true,
    couverture_libelle: texteCourt(record?.couverture_libelle, 80) || null,
    achat_creation_site: record?.achat_creation_site === true,
    formation_gestion: record?.formation_gestion === true,
    delai_heures: entier(record?.delai_heures, 0, 100_000),
    delai_libelle: texteCourt(record?.delai_libelle, 80) || null,
    active: record?.active === true,
    ordre: entier(record?.ordre, 0, 10_000) ?? 0,
  };
}

/**
 * Un prix, tel que la plateforme l'a décrit.
 *
 * Le contrat a déjà tranché « Inclus » / « Devis en attente » / montant. On ne
 * réécrit pas cette décision : on vérifie qu'elle est cohérente, et on laisse
 * le contrat la reprendre si un champ manque. Un prix « chiffré » sans montant
 * n'est jamais affiché tel quel : c'est un mensonge d'écran.
 */
function normaliserPrix(brut: unknown): PrixAffiche {
  const record = commeObjet(brut);
  if (!record) return decrirePrix({ montant_cents: null, devise: null });

  const montant = centimes(record.montant_cents);
  const devise = normaliserDevise(typeof record.devise === "string" ? record.devise : null);
  const brutEtat = texteCourt(record.etat, 24);
  const etat: EtatPrix =
    brutEtat === "inclus" || brutEtat === "devis_en_attente" || brutEtat === "chiffre"
      ? brutEtat
      : montant !== null
        ? "chiffre"
        : "devis_en_attente";
  if (etat === "chiffre" && montant === null) {
    return decrirePrix({ montant_cents: null, devise });
  }
  const gratuit = record.gratuit === true || etat === "inclus";
  return {
    etat,
    gratuit,
    a_payer: etat === "chiffre" && montant !== null,
    montant_cents: etat === "chiffre" ? montant : null,
    devise,
    libelle:
      texteCourt(record.libelle, 40)
      || decrirePrix({ montant_cents: montant, devise, gratuit }).libelle,
  };
}

function normaliserPaiement(brut: unknown, prix: PrixAffiche): PaiementAffiche {
  const record = commeObjet(brut);
  const reglee = record?.reglee === true;
  return {
    reglee,
    // Recalculé sur le prix validé : la plateforme et le connecteur ne peuvent
    // pas dire l'un « à payer » et l'autre « rien à payer ».
    a_payer: prix.a_payer && !reglee,
    payee_le: instantIso(record?.payee_le),
    payee_libelle: texteCourt(record?.payee_libelle, 60) || null,
    echeance: instantIso(record?.echeance),
    echeance_libelle: texteCourt(record?.echeance_libelle, 60) || null,
    echeance_depassee: record?.echeance_depassee === true,
  };
}

function normaliserActeur(brut: unknown): ActeurAffiche {
  const record = commeObjet(brut);
  const brutType = texteCourt(record?.type, 20);
  const type: CodeTypeActeur = estCodeActeur(brutType) ? brutType : "client";
  const nom = texteCourt(record?.nom, 120) || LIBELLE_NOM_INCONNU;
  return {
    nom,
    initiales: texteCourt(record?.initiales, 4) || initiales(nom),
    type,
    type_libelle: texteCourt(record?.type_libelle, 60) || decrireActeur(type),
  };
}

function normaliserEvenement(brut: unknown): EvenementAffiche | null {
  const record = commeObjet(brut);
  const id = texteCourt(record?.id, 64);
  // Un événement sans identifiant n'est ni suivi ni cliquable : il part.
  if (!record || !id) return null;
  const brutType = texteCourt(record.type, 40);
  const connu = estCodeEvenement(brutType);
  return {
    id,
    type: connu ? brutType : "note",
    type_connu: connu,
    libelle: texteCourt(record.libelle, 80) || decrireEvenement(brutType),
    acteur: normaliserActeur(record.acteur),
    detail: texteLong(record.detail, 1000),
    le: instantIso(record.le),
    le_libelle: texteCourt(record.le_libelle, 60) || null,
  };
}

function normaliserDemandes(brut: unknown): DemandeAffiche[] {
  return commeListe(brut)
    .map((item) => normaliserDemande(item))
    .filter((demande): demande is DemandeAffiche => demande !== null)
    .slice(0, MAX_DEMANDES);
}

function normaliserDemande(brut: unknown): DemandeAffiche | null {
  const record = commeObjet(brut);
  const id = texteCourt(record?.id, 64);
  const objet = texteCourt(record?.objet, 160) || LIBELLE_OBJET_INCONNU;
  const prestationLibelle = texteCourt(record?.prestation_libelle, 160);
  // Une demande sans identifiant ne peut pas être suivie ni mise en clé ; une
  // demande sans objet ni prestation n'a rien à afficher. Les deux partent.
  if (!id || (objet === LIBELLE_OBJET_INCONNU && !prestationLibelle)) return null;

  const prix = normaliserPrix(record?.prix);
  const brutStatut = texteCourt(record?.statut, 40);
  return {
    id,
    reference: texteCourt(record?.reference, 16) || id.slice(0, 8).toUpperCase(),
    objet,
    description: texteLong(record?.description, 4000),
    statut: estCodeStatut(brutStatut) ? brutStatut : "nouvelle",
    statut_libelle: texteCourt(record?.statut_libelle, 80) || decrireStatut(brutStatut),
    statut_connu: estCodeStatut(brutStatut),
    terminal: record?.terminal === true,
    site_id: texteCourt(record?.site_id, 64) || null,
    service_id: texteCourt(record?.service_id, 64) || null,
    service_code: texteCourt(record?.service_code, 64) || null,
    service: normaliserPrestation(record?.service),
    couverture_abonnement: record?.couverture_abonnement === true,
    couverture_libelle: texteCourt(record?.couverture_libelle, 80) || null,
    formation_initiale_incluse: record?.formation_initiale_incluse === true,
    prestation_libelle: prestationLibelle || objet,
    prix,
    paiement: normaliserPaiement(record?.paiement, prix),
    demandeur: normaliserDemandeur(record?.demandeur),
    cree_le: instantIso(record?.cree_le),
    cree_libelle: texteCourt(record?.cree_libelle, 60) || null,
    mis_a_jour_le: instantIso(record?.mis_a_jour_le),
    mis_a_jour_libelle: texteCourt(record?.mis_a_jour_libelle, 60) || null,
    evenements: commeListe(record?.evenements)
      .map((evenement) => normaliserEvenement(evenement))
      .filter((evenement): evenement is EvenementAffiche => evenement !== null)
      .slice(0, MAX_EVENEMENTS),
  };
}

function normaliserDemandeur(brut: unknown): DemandeAffiche["demandeur"] {
  const record = commeObjet(brut);
  const base = normaliserActeur(record);
  const email = formaterEmail(typeof record?.email === "string" ? record.email : null);
  const numero = texteCourt(record?.telephone, 40) || null;
  const message = texteCourt(record?.message_whatsapp, 500);
  return {
    // Le demandeur est toujours un client : le type vient du contrat, pas du
    // réseau, pour qu'un acteur malformé ne s'affiche pas dans un suivi.
    ...base,
    type: "client",
    type_libelle: decrireActeur("client"),
    initiales: base.initiales || initiales(base.nom),
    email,
    lien_email: lienEmail(email),
    telephone: numero,
    message_whatsapp: message,
    lien_whatsapp: lienWhatsapp(numero, message),
  };
}

function normaliserAbonnement(brut: unknown): AbonnementAffiche {
  // Le repli est produit par le contrat lui-même : « Aucun abonnement » est un
  // mot du contrat, pas un mot du connecteur.
  const repli = construireReponseAbonnement(null, null).abonnement;
  const record = commeObjet(brut);
  if (!record) return repli;

  const brutStatut = texteCourt(record.statut, 20);
  const statut: AbonnementAffiche["statut"] =
    brutStatut === "aucun" ? "aucun"
      : brutStatut === "inconnu" ? "inconnu"
        : estCodeAbonnement(brutStatut) ? brutStatut
          : record.actif === true ? "active" : "inconnu";
  const statutLibelle =
    texteCourt(record.statut_libelle, 60)
    || (statut === "aucun" ? LIBELLE_ABONNEMENT_AUCUN : decrireStatutAbonnement(statut));

  return {
    actif: record.actif === true,
    statut,
    statut_libelle: statutLibelle || LIBELLE_ABONNEMENT_INCONNU,
    essai: record.essai === true,
    formule: texteCourt(record.formule, 120) || repli.formule,
    formule_code: texteCourt(record.formule_code, 64) || null,
    tarif_libelle: texteCourt(record.tarif_libelle, 60) || null,
    caracteristiques: commeListe(record.caracteristiques)
      .map((ligne) => texteCourt(ligne, 160))
      .filter(Boolean)
      .slice(0, 20),
    periode_debut: instantIso(record.periode_debut),
    periode_fin: instantIso(record.periode_fin),
    periode_libelle: texteCourt(record.periode_libelle, 120) || null,
    fin_libelle: texteCourt(record.fin_libelle, 60) || null,
    jours_restants: entier(record.jours_restants, Number.MIN_SAFE_INTEGER, 100_000),
    se_renouvelle: record.se_renouvelle === true,
    resilie: record.resilie === true,
  };
}

/* ========================================================================== *
 * Annonces et facturation — hors contrat, donc bornées ici
 * ========================================================================== */

function normaliserAnnonces(brut: ReponseAnnoncesBrut): AgencyAnnouncement[] {
  return commeListe(brut)
    .map((item, index) => {
      const record = commeObjet(item);
      const titre = texteCourt(record?.title, 160);
      if (!titre) return null;
      return {
        id: texteCourt(record?.id, 64) || `annonce-${index}`,
        title: titre,
        body: texteCourt(record?.body, 2000),
        severity: normaliserGravite(record?.severity),
        published_at: instantIso(record?.starts_at),
        ends_at: instantIso(record?.ends_at),
      } satisfies AgencyAnnouncement;
    })
    .filter((annonce): annonce is AgencyAnnouncement => annonce !== null)
    .slice(0, MAX_ANNONCES);
}

/** `announcements.severity` est un texte libre : trois valeurs, pas une de plus. */
function normaliserGravite(brut: unknown): AgencyAnnouncementSeverity {
  const valeur = texteCourt(brut, 20);
  return valeur === "warning" || valeur === "critical" ? valeur : "info";
}

function normaliserFacturation(brut: ReponseFacturationBrut | null): AgencyBilling | null {
  const record = commeObjet(brut);
  if (
    !record
    || typeof record.billing_available !== "boolean"
    || !Array.isArray(record.unpaid_invoices)
  ) return null;
  return {
    site_name: texteCourt(record.site_name, 160) || null,
    subscription: normaliserAbonnementFacturation(record.subscription),
    plans: normaliserForfaits(record.plans),
    plans_disponibles: Array.isArray(record.plans),
    plans_truncated: record.plans_truncated === true,
    unpaid_invoices: normaliserFactures(record.unpaid_invoices),
    portal_url: formaterSiteWeb(typeof record.portal_url === "string" ? record.portal_url : null),
    can_pay_online: record.can_pay_online === true,
    payment_endpoint: texteCourt(record.payment_endpoint, 200) || null,
    billing_available: record.billing_available === true,
    billing_message: texteCourt(record.billing_message, 300) || null,
  };
}

/** Le catalogue vient de la facturation; aucune valeur reçue ne part directement à l'écran. */
function normaliserForfaits(brut: unknown): AgencyBillingPlan[] {
  return commeListe(brut)
    .map((item) => {
      const record = commeObjet(item);
      const id = texteCourt(record?.id, 64);
      const nom = texteCourt(record?.name, 120);
      const montant = centimes(record?.price_cents);
      const periode = record?.billing_interval;
      if (!id || !nom || montant === null || (periode !== "month" && periode !== "year")) return null;
      return {
        id,
        code: texteCourt(record?.code, 64),
        name: nom,
        description: texteLong(record?.description, 800),
        price_cents: montant,
        currency: normaliserDevise(typeof record?.currency === "string" ? record.currency : null),
        billing_interval: periode,
        features: commeListe(record?.features)
          .map((feature) => texteCourt(feature, 160))
          .filter(Boolean)
          .slice(0, 20),
        trial_days: entier(record?.trial_days, 0, 365) ?? 0,
      } satisfies AgencyBillingPlan;
    })
    .filter((plan): plan is AgencyBillingPlan => plan !== null)
    .slice(0, MAX_FORFAITS);
}

function normaliserAbonnementFacturation(brut: unknown): AgencyBillingSubscription | null {
  const record = commeObjet(brut);
  if (!record) return null;
  const id = texteCourt(record.id, 64);
  const statut = texteCourt(record.status, 32);
  if (!id || !statut) return null;
  return {
    id,
    status: statut,
    provider: texteCourt(record.provider, 32) || null,
    current_period_start: instantIso(record.current_period_start),
    current_period_end: instantIso(record.current_period_end),
    cancel_at_period_end: record.cancel_at_period_end === true,
    plan: normaliserPlanFacturation(record.plan),
  };
}

function normaliserPlanFacturation(brut: unknown): AgencyBillingPlan | null {
  return normaliserForfaits(brut ? [brut] : [])[0] ?? null;
}

/**
 * Une facture, telle que `billing_invoices` la rend.
 *
 * Le montant passe par `decrirePrix` : une facture à zéro se lit « Inclus » et
 * jamais « 0 F CFA », exactement comme une prestation. Le statut reste un CODE,
 * parce que la plateforme n'en fournit aucun libellé et que le connecteur n'en
 * invente pas : à l'écran, un statut non connu ne s'affiche pas.
 */
function normaliserFactures(brut: unknown): AgencyInvoice[] {
  return commeListe(brut)
    .map((item) => {
      const record = commeObjet(item);
      const id = texteCourt(record?.id, 64);
      if (!id) return null;
      const montant = centimes(record?.amount_cents) ?? 0;
      const devise = normaliserDevise(typeof record?.currency === "string" ? record.currency : null);
      const statut = texteCourt(record?.status, 20) || null;
      return {
        id,
        numero: texteCourt(record?.number, 60) || null,
        statut,
        statut_connu: statut !== null && STATUTS_FACTURE.includes(statut),
        montant_cents: montant,
        montant_libelle: decrirePrix({ montant_cents: montant, devise }).libelle,
        devise,
        emise_le: instantIso(record?.issued_at),
        echeance_le: instantIso(record?.due_at),
      } satisfies AgencyInvoice;
    })
    .filter((facture): facture is AgencyInvoice => facture !== null)
    .slice(0, MAX_FACTURES);
}

/* ========================================================================== *
 * API publique
 * ========================================================================== */

/** URL du site vitrine de l'agence — sert au crédit discret du pied de page. */
export function agencyWebsiteUrl(): string | null {
  return formaterSiteWeb(process.env.MGS_WEBSITE_URL ?? null);
}

/**
 * L'espace « Mon agence », ou `null` s'il n'y a rien à montrer.
 *
 * `null` signifie : la plateforme n'a répondu à aucune des trois lectures, et
 * aucune coordonnée de repli n'est configurée. C'est le cas décrit par
 * `INSTALLATION-CONNECTEUR.md` §1 et §5.3 — le site fonctionne, l'onglet
 * n'existe pas. Toute autre situation renvoie un espace partiel : c'est
 * précisément la raison d'être de la dégradation silencieuse, une page à moitié
 * remplie valant mieux qu'une page absente quand elle reste lisible.
 *
 * Les trois lectures partent EN PARALLÈLE : c'est la latence de la plus lente
 * qui compte, et la page client ne doit pas attendre trois temps d'aller-retour
 * pour afficher un onglet de dashboard. Comme elles partent ensemble, elles
 * n'échouent pas ensemble non plus : c'est pourquoi `indisponibles` est calculé
 * APRÈS les trois lectures, à partir de ce que chacune a réellement rendu.
 */
export async function loadAgencySpace(): Promise<AgencySpace | null> {
  const [espaceBrut, annoncesBrut, facturationBrut] = await Promise.all([
    callAgency<ReponseEspaceAgenceBrut>("/api/v1/agency"),
    callAgency<ReponseAnnoncesBrut>("/api/v1/announcements"),
    callAgency<ReponseFacturationBrut>("/api/v1/billing"),
  ]);

  const plateforme = commeObjet(espaceBrut);
  const agence = commeObjet(plateforme?.agence);
  // `agence.identite` fait foi ; le `identite` de premier niveau n'existe que
  // pour une plateforme plus ancienne, et ne l'emporte jamais.
  const identiteBrut = agence?.identite ?? plateforme?.identite ?? null;
  // Une seule lecture porte le catalogue ET les demandes : `catalogue connu` est
  // donc la réponse de `/api/v1/agency`, rien d'autre. Le filet de repli
  // s'applique exactement dans ce cas, et jamais quand la plateforme a répondu.
  const catalogueConnu = plateforme !== null;
  // La plateforme ignore ici l'environnement : dès qu'elle a répondu, c'est
  // elle qui fait foi, même pour dire « je n'ai pas de coordonnées ».
  const identite = normaliserIdentite(identiteBrut, !catalogueConnu);

  const facturation = normaliserFacturation(facturationBrut);

  const joignable = catalogueConnu || annoncesBrut !== null || facturation !== null;
  if (!joignable && !filetConfigure()) return null;

  return {
    identite,
    prestations: normaliserPrestations(plateforme?.prestations),
    offres: normaliserOffres(plateforme?.offres, identite.whatsapp),
    abonnement: normaliserAbonnement(plateforme?.abonnement),
    demandes: normaliserDemandes(plateforme?.demandes),
    annonces: normaliserAnnonces(annoncesBrut),
    facturation,
    joignable,
    indisponibles: sectionsIndisponibles(
      catalogueConnu,
      annoncesBrut !== null,
      facturation !== null,
    ),
  };
}

/**
 * Les sections que la plateforme n'a pas pu servir, dans l'ordre du type.
 *
 * Le risque que cette liste ferme, c'est qu'un écran dise une FAUSSE nouvelle :
 * sans elle, un 503 sur `/api/v1/billing` — ou sur n'importe quelle lecture,
 * puisque le court-circuit d'échec est désormais par chemin — remplit le
 * panneau de tableaux vides, et l'agent lit « Vous n'avez pas encore de
 * demande », « Aucune facture impayée », « Aucune prestation publiée ». Le
 * commerçant appelle alors l'agence au sujet d'un problème inexistant, et
 * l'agent passe une demi-journée à chercher pourquoi ses données ont disparu
 * alors que la plateforme répond très bien. Un composant qui veut distinguer
 * « rien à afficher » de « je n'ai pas pu le savoir » n'a que ce champ à lire.
 *
 * Règles, et aucune autre :
 *
 *  - `catalogue` et `demandes` se lèvent et se couchent ENSEMBLE. Elles sortent
 *    de la même lecture, donc les déclarer disponibles l'un sans l'autre
 *    afficherait un suivi sur des données que personne n'a lues. L'identité du
 *    filet de repli ne change rien à ce couple : elle aussi n'existe que parce
 *    que la lecture a échoué.
 *  - `annonces` dépend de la seule réponse d'`/api/v1/announcements`, et
 *    `facturation` de la seule réponse d'`/api/v1/billing`.
 *  - `facturation` est déduite du RÉSULTAT NORMALISÉ, pas de la seule présence
 *    de la réponse : un 200 dont le corps n'est pas l'objet attendu ne vaut pas
 *    mieux qu'une absence, et dans les deux cas `facturation` vaut `null`. Les
 *    deux ne peuvent donc pas diverger — pas de « pas de données » et « section
 *    disponible » affichés en même temps.
 *  - Un 200 valide qui porte une liste VIDE est une RÉPONSE : rien n'est
 *    déclaré indisponible, et c'est le comportement qui doit rester le plus
 *    courant. `indisponibles` est la preuve d'une panne, pas le prix d'un
 *    catalogue réellement vide.
 */
function sectionsIndisponibles(
  catalogueConnu: boolean,
  annoncesRepondues: boolean,
  facturationConnue: boolean,
): SectionAgence[] {
  const indisponibles: SectionAgence[] = [];
  if (!catalogueConnu) indisponibles.push("catalogue", "demandes");
  if (!annoncesRepondues) indisponibles.push("annonces");
  if (!facturationConnue) indisponibles.push("facturation");
  return indisponibles;
}

/** Le filet de repli est-il renseigné ? C'est lui qui décide du `null`. */
function filetConfigure(): boolean {
  return (
    texteCourt(process.env.MGS_AGENCY_NAME, 160) !== ""
    || texteCourt(process.env.MGS_AGENCY_WHATSAPP, 40) !== ""
    || texteCourt(process.env.MGS_AGENCY_EMAIL, 254) !== ""
  );
}

/**
 * Les demandes seules, par le chemin court de la plateforme.
 *
 * `loadAgencySpace` les reçoit déjà dans `/api/v1/agency` ; cette fonction sert
 * aux rafraîchissements ciblés — une page qui n'a changé que pour le suivi, ou
 * un agent 3 qui veut relire après une écriture — sans payer les deux autres
 * lectures. Même normalisation, mêmes mots, aucune exception.
 */
export async function chargerDemandesAgence(): Promise<DemandeAffiche[]> {
  const brut = await callAgency<{ demandes?: unknown }>("/api/v1/agency/requests");
  return normaliserDemandes(commeObjet(brut)?.demandes);
}

/**
 * Purge le cache de l'agence, pour qu'un changement fait depuis l'administration
 * apparaisse immédiatement.
 *
 * À appeler depuis la route `revalidate` du site (agent 3), jamais depuis un
 * composant. `revalidateTag` vide le cache des lectures `callAgency`,
 * `revalidatePath` vide les pages déjà rendues : sans `chemins`, seul le cache
 * de données est purgé et une page ISR peut donc encore servir son HTML
 * précédent — d'où le paramètre.
 *
* Le module `next/cache` est importé DYNAMIQUIQUEMENT et tout est enveloppé :
 * hors contexte de requête Next — une application Expo, un script, un test —
 * l'appel ne doit rien casser. La fonction renvoie alors `false` au lieu de
 * lever, et le journal le dit.
 *
 * L'expiration est IMMÉDIATE, pas différée : c'est toute la raison d'être de cette
 * route. Le profil `"max"` sert l'ancienne valeur encore une fois, pendant qu'elle
 * se revalide en arrière-plan — c'est-à-dire qu'un agent qui vient de changer une
 * prestation, qui purge, puis qui recharge voit encore l'ancienne offre. Sur une
 * console d'administration c'est le pire comportement possible : la personne vient
 * de faire le changement, elle le voit échouer, et elle le refait. `{ expire: 0 }`
 * invalide l'entrée au moment de l'appel, et le rendu suivant relit la base.
 *
 * `updateTag` ferait la même chose avec un mot de plus, mais il est réservé aux
 * Server Actions : appelé depuis une Route Handler, il lève. D'où `revalidateTag`,
 * avec son profil d'expiration.
 *
 * `revalidatePath` reste nécessaire en complément : il vide les pages déjà rendues,
 * alors que l'étiquette ne vide que le cache de données. Sans lui, une page ISR peut
 * encore servir son HTML précédent — d'où le paramètre.
 *
 * @param chemins Chemins du site à revalider, par exemple `"/"` ou
 *   `"/dashboard"`. Un chemin qui ne commence pas par `/` est ignoré.
 */
export async function purgerCacheAgence(chemins: readonly string[] = []): Promise<boolean> {
  try {
    const { revalidateTag, revalidatePath } = await import("next/cache");
    revalidateTag(ETIQUETTE_CACHE_AGENCE, { expire: 0 });
    for (const chemin of chemins) {
      if (typeof chemin !== "string" || !chemin.startsWith("/")) continue;
      revalidatePath(chemin);
    }
    return true;
  } catch (erreur) {
    console.warn("[mgs-agency] Cache de l'agence non purgé (hors contexte Next).", erreur);
    return false;
  }
}
