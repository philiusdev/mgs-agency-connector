/**
 * COPIE VERBATIME — NE PAS MODIFIER LOCALEMENT.
 *
 * Copie exacte, au caractere pres, de
 *   plateforme-mindgraphixsolution/lib/agency-shared-contract.ts
 * Point de verite des libelles, prix, dates, statuts et de la disponibilite du
 * bouton flottant, pour la plateforme comme pour les quatre sites clients.
 * Toute divergence avec l'original est le bug que ce fichier existe pour
 * empecher : on ne corrige qu'a la source, puis on recopie. Ce bandeau (21
 * lignes) est la seule partie propre au connecteur ; tout ce qui suit, ligne
 * 22 comprise, est l'original au caractere pres.
 *
 * Recopier (racine de mgs-agency-connector) :
 *   sed -n '1,21p' lib/agency/contrat-partage.ts > /tmp/entete-contrat.ts
 *   cat ../plateforme-mindgraphixsolution/lib/agency-shared-contract.ts >> /tmp/entete-contrat.ts
 *   mv /tmp/entete-contrat.ts lib/agency/contrat-partage.ts
 *
 * Verifier :
 *   diff <(tail -n +22 lib/agency/contrat-partage.ts) \
 *     ../plateforme-mindgraphixsolution/lib/agency-shared-contract.ts
 */
/**
 * Contrat partage de l'agence MindGraphixSolution.
 *
 * Une seule agence, les memes fonctionnalites sur tous les sites : Royal Shop,
 * Faso Mode, la vitrine. Ce fichier en est le point de verite. Il est copie tel
 * quel dans chaque application, et c'est donc lui, et lui seul, qui rend les
 * divergences impossibles : un client qui lit « En attente de devis » sur une
 * boutique doit lire exactement le meme mot sur les trois autres.
 *
 * ---------------------------------------------------------------------------
 * CONTRAINTE ABSOLUE : ZERO IMPORT.
 * ---------------------------------------------------------------------------
 * Ni React, ni Next, ni Node, ni Supabase, ni zod, ni meme un type externe.
 * Ce fichier est compile a l'identique dans un projet Expo et dans un projet
 * Next, sur un serveur et dans un navigateur. Le seul import ajouterait une
 * dependance au projet qui recoit le fichier, et le ferait tomber au premier
 * module manquant. N'en ajoutez jamais un : tout ce dont on a besoin ici est un
 * type local, une fonction pure, ou une constante.
 *
 * Regles tenues par le fichier, en Resume :
 *
 *  - aucun code brut n'est affiche a un client. Un statut inconnu se lit
 *    « Demande en traitement », jamais `en_attente_client` ;
 *  - aucun prix n'est affiche sous la forme « 0 » ni sous forme de chaine
 *    vide : une prestation gratuite se dit « Inclus », une prestation pas
 *    encore chiffree « Devis en attente » ;
 *  - la couverture par abonnement se verifie formule contre formule :
 *    `abonnement.plan_id === prestation.billing_plan_id`, jamais « un
 *    abonnement actif existe donc tout est couvert ». Un abonne a une formule
 *    qui ne couvre pas la prestation voit le prix, et il est facture juste ;
 *  - une demande incluse n'attend aucun devis : le message de confirmation ne
 *    peut pas en annoncer un, sinon le client attend une etape qui n'aura pas
 *    lieu et la lit comme une panne ;
 *  - le bouton flottant disparait seulement si l'agence l'a desactive, ou si
 *    elle n'a rien a montrer : ni contact, ni prestation publiee, ni
 *    abonnement en cours. Un panneau vide est pire que l'absence de bouton ;
 *  - une seule implementation pour la date relative, le telephone, le montant
 *    et l'identite. Quatre sites qui formattent chacun de leur facon
 *    produisent des ecran qui ne se ressemblent pas, et le client le voit ;
 *  - toute fonction est pure : meme entree, meme sortie, aucun effet de bord,
 *    aucun acces reseau, aucun journal. `Date.now()` n'est utilise que comme
 *    valeur par defaut d'un parametre injectable, pour que deux applications
 *    produisent la meme chaine a la meme seconde.
 *
 * Ce que decrivent les types : l'etat REEL de la base. Les colonnes
 * issues des migrations 202609280006 (identite, offres), 202609290010
 * (abonnement), 202609290015 (prestations, demandes, evenements) et
 * 202609290017 (prestation commune a tous les espaces, libelle de prestation
 * recopie sur la demande, bouton flottant). Les colonnes ajoutees par la
 * migration 202609290017 sont declarees facultatives : le fichier reste exact
 * sur une base ou elle n'est pas encore appliquee, comme sur une base a jour.
 *
 * Les listes `COLONNES_*` de la section 3 enumerent, table par table, les
 * colonnes de ces migrations. Elles vivaient auparavant dans la couche de
 * lecture, qui les avait redeclarees de sa main : deux listes pour une meme
 * table finissent toujours par diverger, et la divergence se voit dans un
 * `select` incomplet, c'est-a-dire dans une colonne qui manque a l'ecran.
 */

/* ========================================================================= *
 * 1. Constantes de repli
 *
 * Un libelle de repli n'est jamais un code : c'est la derniere ligne de
 * defense du fichier, celle qui garantit qu'aucune valeur inattendue ne
 * s'affiche telle quelle a un client.
 * ========================================================================= */

/** Devise de reference du projet : le franc CFA (XOF). */
export const DEVISE_PAR_DEFAUT = "XOF";

/** Identite affichee quand `agency_settings` est absente ou illisible. */
export const NOM_AGENCE_PAR_DEFAUT = "MindGraphixSolution";

/** Statut d'avancement inconnu : jamais le code, toujours cette phrase. */
export const LIBELLE_STATUT_INCONNU = "Demande en traitement";

/** Nature d'evenement inconnue, cote client. */
export const LIBELLE_EVENEMENT_INCONNU = "Étape du suivi";

/** Type d'acteur inconnu. */
export const LIBELLE_ACTEUR_INCONNU = "Intervenant";

/** Statut d'abonnement inconnu, ou abonnement absent. */
export const LIBELLE_ABONNEMENT_INCONNU = "Abonnement à vérifier";
export const LIBELLE_ABONNEMENT_AUCUN = "Aucun abonnement";

/** Libelles de prix. Un « 0 » n'est jamais affiche : il se lit comme une erreur. */
export const LIBELLE_PRIX_INCLUS = "Inclus";
export const LIBELLE_PRIX_DEVIS = "Devis en attente";

/** Identite d'une personne absente ou illisible. */
export const LIBELLE_NOM_INCONNU = "Client";

/** Prestation dont la ligne a disparu du catalogue : le suivi reste lisible. */
export const LIBELLE_PRESTATION_RETIREE = "Prestation retirée du catalogue";

/** Objet de demande absent, et reference illisible. */
export const LIBELLE_OBJET_INCONNU = "Demande sans objet";
export const LIBELLE_REFERENCE_INCONNUE = "—";

/** Offre, formule et bouton flottant sans nom exploitable. */
export const LIBELLE_OFFRE_INCONNUE = "Offre de l’agence";
export const LIBELLE_FORMULE_INCONNUE = "Formule à préciser";
/** Valeur par defaut de la base pour `bouton_flottant_libelle`. */
export const LIBELLE_BOUTON_DEFAUT = "Nous contacter";
export const LIBELLE_BOUTON_ACCESSIBLE = "Contacter l’agence";

/** Prestation payante couverte par un abonnement (migration 202609290017). */
export const LIBELLE_PRESTATION_COUVERTE = "Inclus dans votre abonnement";

/**
 * Message de confirmation d'une demande chiffree, partage par les quatre sites.
 *
 * C'est le cas par defaut, parce que c'est le seul cas que la base garantit :
 * tant que rien n'est chiffre, un devis est attendu.
 */
export const MESSAGE_DEMANDE_ENVOYEE =
  "Votre demande a bien été envoyée. L’agence vous répond avec un devis.";

/**
 * Message de confirmation d'une demande incluse dans l'abonnement du client.
 *
 * Aucun devis n'est attendu dans ce cas : annoncer un devis mettrait le client
 * en attente d'une etape qui n'aura pas lieu, et il la lirait comme une panne
 * plutot que comme une absence normale. `decrireConfirmationDemande` choisit
 * entre les deux messages, et jamais un site nechoisit a la main.
 */
export const MESSAGE_DEMANDE_ENVOYEE_INCLUSE =
  "Votre demande a bien été envoyée. Elle est incluse : l’agence la prend en charge, et vous n’avez pas de devis à attendre.";
export const MESSAGE_FORMATION_INITIALE_INCLUSE =
  "Votre formation initiale est incluse après l’achat payé de ce site. L’agence vous contactera pour la planifier.";

/* ========================================================================= *
 * 2. Vocabulaires fermes
 *
 * Les listes viennent des CHECK de la base. Les types derives d'elles
 * garantissent qu'une valeur codee en dur reste dans le vocabulaire, et
 * qu'un vocabulaire ajoute plus tard casse la compilation plutot que
 * l'affichage.
 * ========================================================================= */

/** `agency_requests.status` : les six etats de la migration 202609290015. */
export const STATUTS_DEMANDE = [
  "nouvelle",
  "en_cours",
  "en_attente_client",
  "livree",
  "annulee",
  "refusee",
] as const;

export type CodeStatutDemande = (typeof STATUTS_DEMANDE)[number];

/** Etats terminaux : une demande close ne revient pas en file. */
export const STATUTS_TERMINAUX_DEMANDE: readonly CodeStatutDemande[] = [
  "livree",
  "annulee",
  "refusee",
];

/** `agency_request_events.event_type`. */
export const TYPES_EVENEMENT = [
  "created",
  "quoted",
  "accepted",
  "declined",
  "in_progress",
  "delivered",
  "cancelled",
  "paid",
  "note",
] as const;

export type CodeTypeEvenement = (typeof TYPES_EVENEMENT)[number];

/** `agency_request_events.actor_type`. */
export const TYPES_ACTEUR = ["client", "agent", "systeme"] as const;

export type CodeTypeActeur = (typeof TYPES_ACTEUR)[number];

/** `billing_subscriptions.status`. */
export const STATUTS_ABONNEMENT = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
] as const;

export type CodeStatutAbonnement = (typeof STATUTS_ABONNEMENT)[number];

/** `billing_plans.billing_interval`. */
export const PERIODES_FACTURATION = ["month", "year"] as const;

export type CodePeriodeFacturation = (typeof PERIODES_FACTURATION)[number];

/**
 * Positions du bouton flottant : `agency_settings.bouton_flottant_position`.
 *
 * Deux positions seulement, en snake_case, la liste fermee etant portee par un
 * CHECK en base. Une position inconnue n'est jamais rendue telle quelle, elle
 * retombe sur la position par defaut.
 */
export const POSITIONS_BOUTON = ["bas_droite", "bas_gauche"] as const;

export type PositionBouton = (typeof POSITIONS_BOUTON)[number];

export const POSITION_BOUTON_DEFAUT: PositionBouton = "bas_droite";

/**
 * Niveaux d'urgence du bouton flottant :
 * `agency_settings.bouton_flottant_urgence`.
 *
 * `neutre` pour un contact ordinaire, `marque` pour ce qui doit se voir avant
 * tout le reste. Vocabulaire ferme de la base ; une valeur inconnue retombe sur
 * `neutre`, jamais sur elle-meme.
 */
export const NIVEAUX_URGENCE_BOUTON = ["neutre", "marque"] as const;

export type NiveauUrgenceBouton = (typeof NIVEAUX_URGENCE_BOUTON)[number];

export const NIVEAU_URGENCE_DEFAUT: NiveauUrgenceBouton = "neutre";

/* ========================================================================= *
 * 3. Colonnes lues
 *
 * Les listes sont explicites, jamais `*` : la forme de la reponse fait partie
 * du contrat, et une colonne ajoutee plus tard ne doit pas apparaitre dans un
 * payload par hasard.
 * ========================================================================= */

/** `agency_settings` : les colonnes qui existaient avant la migration 202609290017. */
export const COLONNES_AGENCE = "id,name,whatsapp,email,website,updated_at";

/**
 * Colonnes du bouton flottant, ajoutees par la migration 202609290017.
 *
 * Elles sont tenues a part de `COLONNES_AGENCE` pour qu'une base sur laquelle
 * la migration n'est pas encore appliquee continue de repondre : on ajoute
 * cette liste quand la migration est en place, jamais avant.
 */
export const COLONNES_BOUTON_FLOTTANT =
  "bouton_flottant_actif,bouton_flottant_libelle,bouton_flottant_message," +
  "bouton_flottant_position,bouton_flottant_urgence";

export const COLONNES_OFFRE =
  "id,title,description,whatsapp_message,price_cents,billing_mode,active,display_order,created_at";

/** `billing_plan_id` est ajoute par la migration 202609290017. */
export const COLONNES_PRESTATION =
  "id,tenant_id,code,title,description,price_cents,currency,is_free,billing_plan_id," +
  "is_site_creation,is_training,turnaround_hours,is_active,sort_order,created_at";

/**
 * `service_libelle` et `service_code` sont ajoutes par la migration 202609290017.
 *
 * La jointure `service:agency_services(...)` porte `billing_plan_id` et
 * `description` parce que l'ecran en a besoin sans relire la prestation par
 * ailleurs : sans `billing_plan_id`, la colonne arrive vide, « Inclus dans votre
 * abonnement » devient impossible a ecrire, et l'appelant ne peut que corriger
 * par une requete de rattrapage — c'est-a-dire par une deuxieme lecture dont
 * l'erreur ne se voit pas. La jointure se declare ici, une fois.
 */
export const COLONNES_DEMANDE =
  "id,tenant_id,service_id,service_libelle,service_code,site_id,requester_user_id," +
  "requester_name,requester_email,requester_phone," +
  "subject,description,status,quoted_price_cents,currency,is_paid,due_at,paid_at," +
  "site_creation_purchase,formation_initiale_incluse,created_at,updated_at," +
  "service:agency_services(id,code,title,description,is_free,price_cents,currency," +
  "billing_plan_id,is_site_creation,is_training,turnaround_hours)";

/**
 * La meme demande, lue par la file de l'agence.
 *
 * Deux listes et non une, volontairement. Cette liste ne reprend ni
 * `service_libelle`, ni `service_code`, ni `billing_plan_id` : ce sont des
 * colonnes de la migration 202609290017, et la file de travail de l'agent doit
 * rester lisible sur une base ou cette migration n'est pas encore appliquee.
 * Une seule liste aurait impose aux deux lecteurs la meme liste de colonnes, donc
 * aurait casse la file d'un agent pour lui donner une colonne dont il n'a pas
 * besoin.
 *
 * Ce qui n'est pas partage ne peut pas diverger : `id`, `service_id`, `title`,
 * `code`, `price_cents`, `is_free`, `turnaround_hours`, `currency` sont les
 * memes ici et dans `COLONNES_DEMANDE`. Ce qui les distingue est nomme, et
 * explique — jamais laisse au hasard d'une recopie.
 */
export const COLONNES_DEMANDE_AGENT =
  "id,tenant_id,service_id,site_id,requester_user_id,requester_name,requester_email,requester_phone," +
  "subject,description,status,quoted_price_cents,currency,is_paid,due_at,paid_at," +
  "site_creation_purchase,formation_initiale_incluse,created_at,updated_at," +
  "service:agency_services(id,code,title,is_free,price_cents,currency,turnaround_hours)";

export const COLONNES_EVENEMENT =
  "id,request_id,actor_type,actor_id,actor_label,event_type,detail,created_at";

/**
 * `billing_subscriptions`, colonne par colonne (migration 202609290010).
 *
 * La liste manquait alors que le type `LigneAbonnement` etait deja declare :
 * chaque couche qui lisait l'abonnement devait donc retranscrire ses colonnes,
 * et une colonne oubliee disparaissait sans erreur, seulement sans sa valeur a
 * l'ecran. Les colonnes sont ici celles de la migration, sans ajout et sans
 * oubli.
 */
export const COLONNES_ABONNEMENT =
  "id,tenant_id,plan_id,status,provider,provider_customer_ref,provider_subscription_ref," +
  "current_period_start,current_period_end,cancel_at_period_end,canceled_at," +
  "created_at,updated_at";

/** `billing_plans`, colonne par colonne (migration 202609290010). */
export const COLONNES_PLAN =
  "id,code,name,description,price_cents,currency,billing_interval,features," +
  "trial_days,is_active,sort_order,created_at";

/**
 * L'abonnement et sa formule, en une seule selection.
 *
 * `plan_id` est `ON DELETE RESTRICT` : une formule rattachee a un abonnement ne
 * peut pas disparaitre, donc la jointure ne rendra jamais un dossier sans
 * formule. Elle reste neanmoins declaree facultative cote type, parce que
 * PostgREST peut ne pas resoudre la relation et renvoyer `null`.
 */
export const COLONNES_ABONNEMENT_ET_PLAN =
  `${COLONNES_ABONNEMENT},plan:billing_plans(${COLONNES_PLAN})`;

/* ========================================================================= *
 * 4. Ce que la base contient
 * ========================================================================= */

/**
 * `agency_settings`, ligne unique (`id` vaut toujours `true`).
 *
 * Cette table est globale : elle n'a pas de `tenant_id`, et c'est volontaire.
 * Une seule agence, une seule ligne de reglage, les memes coordonnees et le
 * meme bouton flottant sur les quatre sites.
 *
 * Les cinq premiers champs existent depuis la migration 202609280006. Les cinq
 * derniers sont ajoutes par la migration 202609290017 et restent donc
 * facultatifs : le code qui lit la table avant son application, ou apres, est
 * le meme.
 */
export type LigneAgenceSettings = {
  id: boolean;
  name: string;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  updated_at: string;
  bouton_flottant_actif?: boolean | null;
  bouton_flottant_libelle?: string | null;
  /** Texte de la bulle de premier contact, affichee avant toute saisie. */
  bouton_flottant_message?: string | null;
  bouton_flottant_position?: string | null;
  bouton_flottant_urgence?: string | null;
  /** Groupe equivalent, si la lecture regroupe les colonnes en objet. */
  bouton_flottant?: ConfigBoutonFlottant | null;
};

/** Configuration du bouton flottant, telle que la base la rend. */
export type ConfigBoutonFlottant = {
  actif?: boolean | null;
  /** Vide si le bouton est actif : la base le refuse. */
  libelle?: string | null;
  message?: string | null;
  position?: string | null;
  urgence?: string | null;
};

/** `agency_offers` : les offres mises en avant, partagees par tous les sites. */
export type LigneOffre = {
  id: string;
  title: string;
  description: string;
  whatsapp_message: string;
  price_cents: number | null;
  billing_mode: "quote" | "fixed_once" | "initial_included_then_paid";
  active: boolean;
  display_order: number;
  created_at: string;
};

/**
 * `agency_services` : le catalogue des prestations.
 *
 * `tenant_id` est nullable depuis la migration 202609290017 : NULL = prestation
 * proposee a tous les espaces, renseignee = prestation reservee a un espace.
 * NULL est le cas general, c'est l'agence qui est commune.
 *
 * `billing_plan_id` est ajoute par la meme migration : une prestation payante
 * couverte par un abonnement. La base refuse qu'une prestation gratuite en soit
 * couverte, donc `billing_plan_id` et `is_free` ne peuvent pas se contredire.
 */
export type LigneService = {
  id: string;
  tenant_id: string | null;
  code: string;
  title: string;
  description: string | null;
  /** NULL exactement quand `is_free` est vrai, non nul et positif sinon. */
  price_cents: number | null;
  currency: string;
  is_free: boolean;
  /** Abonnement couvrant la prestation, ou NULL si elle se facture seule. */
  billing_plan_id?: string | null;
  /** Cette prestation correspond à l'achat de création d'un site. */
  is_site_creation: boolean;
  /** Formation de gestion : droit initial après achat payé, renouvellement payant. */
  is_training: boolean;
  /** Delai indicatif en heures, NULL pour une prestation sur rendez-vous. */
  turnaround_hours: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

/**
 * `agency_requests` : une demande et son etat de paiement.
 *
 * `service_libelle` et `service_code` sont ajoutes par la migration
 * 202609290017 : ils recopient le libelle et le code de la prestation au
 * moment de la demande, parce que `service_id` est en ON DELETE SET NULL. Un
 * `service_libelle` renseigne vaut donc mieux que le titre de la prestation
 * jointe : il dit ce que le client a demande ce jour-la, meme si la prestation
 * a depuis disparu du catalogue.
 *
 * `service` vient d'une jointure many-to-one : PostgREST renvoie un objet,
 * mais un tableau des qu'il ne resout pas la relation. Les deux formes sont
 * declarees, et `lienService` les lit toutes les deux.
 *
 * La jointure lit `billing_plan_id` et `description` (voir `COLONNES_DEMANDE`) :
 * le premier permet de verifier la couverture du lecteur, le second d'afficher
 * la description de la prestation sur le suivi d'une demande.
 */
export type LigneDemande = {
  id: string;
  tenant_id: string;
  service_id: string | null;
  service_libelle?: string | null;
  service_code?: string | null;
  site_id: string | null;
  requester_user_id: string | null;
  requester_name: string;
  requester_email: string;
  requester_phone: string | null;
  subject: string;
  description: string | null;
  status: CodeStatutDemande;
  /** NULL tant que rien n'a ete chiffre ; 0 signifie gratuite. */
  quoted_price_cents: number | null;
  currency: string;
  is_paid: boolean;
  due_at: string | null;
  paid_at: string | null;
  site_creation_purchase: boolean;
  formation_initiale_incluse: boolean;
  created_at: string;
  updated_at: string;
  service?: LigneService | LigneService[] | null;
};

/** `agency_request_events` : une ligne du suivi, ajoutee et jamais modifiee. */
export type LigneEvenement = {
  id: string;
  request_id: string;
  actor_type: CodeTypeActeur;
  actor_id: string | null;
  actor_label: string;
  event_type: CodeTypeEvenement;
  detail: string | null;
  created_at: string;
};

/** `billing_plans` : une formule du catalogue. */
export type LignePlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  billing_interval: CodePeriodeFacturation;
  features: string[];
  trial_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

/** `billing_subscriptions` : au plus une ligne par espace. */
export type LigneAbonnement = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: CodeStatutAbonnement;
  provider: string;
  provider_customer_ref: string | null;
  provider_subscription_ref: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Forme publique d'un forfait pour le catalogue des sites clients. */
export type ForfaitFacturationPublic = Pick<
  LignePlan,
  "id" | "code" | "name" | "description" | "price_cents" | "currency" | "billing_interval" | "features" | "trial_days"
>;

/** Facture impayee renvoyee au site rattache a son tenant. */
export type FactureImpayeePublique = {
  id: string;
  number: string;
  status: "open" | "uncollectible";
  amount_cents: number;
  currency: string;
  issued_at: string;
  due_at: string | null;
  period_start: string | null;
  period_end: string | null;
};

/** Abonnement public du seul tenant associe a la cle du site. */
export type AbonnementFacturationPublic = {
  id: string;
  status: CodeStatutAbonnement;
  provider: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  plan: ForfaitFacturationPublic | null;
};

/** Reponse de `GET /api/v1/billing`. */
export type ReponseFacturationPublique = {
  site_name: string;
  subscription: AbonnementFacturationPublic | null;
  plans: ForfaitFacturationPublic[];
  plans_truncated: boolean;
  unpaid_invoices: FactureImpayeePublique[];
  domain: string | null;
  portal_url: string | null;
  can_pay_online: boolean;
  payment_endpoint: "/api/v1/billing/paiement";
  billing_available: boolean;
  billing_message: string;
};

/** Facture emise a la premiere souscription payante, ou aucune pour un essai/gratuit. */
export type FactureSouscriptionPublique = FactureImpayeePublique;

/** Reponse de `POST /api/v1/billing/abonnement`. */
export type ReponseSouscriptionPublique = {
  ok: true;
  created: boolean;
  subscription: AbonnementFacturationPublic;
  invoice: FactureSouscriptionPublique | null;
  payment_required: boolean;
  can_pay_online: boolean;
  billing_message: string;
};

/** Reponse de `POST /api/v1/billing/paiement` apres la creation de session. */
export type ReponsePaiementPublic = {
  pay_url: string | null;
  can_pay_online: boolean;
  invoice?: string;
  billing_message: string;
};

/**
 * Un abonnement lu avec sa formule, tel que `COLONNES_ABONNEMENT_ET_PLAN` le
 * rend.
 *
 * La formule est facultative pour la meme raison que la prestation d'une
 * demande : PostgREST renvoie un objet, ou un tableau des qu'il ne resout pas la
 * relation. `lienPlan` lit les deux formes.
 */
export type LigneAbonnementAvecPlan = LigneAbonnement & {
  plan?: LignePlan | LignePlan[] | null;
};

/* ========================================================================= *
 * 5. Ce que l'ecran affiche
 *
 * Ces types sont la sortie des fonctions `presenter*`. Ils sont faits pour
 * etre serialises tels quels : pas de Date, pas de classe, seulement des
 * chaines, des booleens et des nombres.
 * ========================================================================= */

/** Configuration du bouton flottant, une fois normalisee. */
export type BoutonFlottantAffiche = {
  /**
   * Faux si l'agence a desactive le bouton, ou si elle n'a rien a montrer :
   * ni contact, ni prestation publiee, ni abonnement en cours.
   *
   * `lien_whatsapp` peut valoir `null` alors que `visible` vaut vrai : le
   * panneau affiche alors le catalogue ou l'abonnement, pas un contact. Un
   * appelant ne doit donc jamais deduire la visibilite du lien.
   */
  visible: boolean;
  libelle: string;
  libelle_accessible: string;
  /** Bulle de premier contact, affichee avant toute saisie. */
  bulle_libelle: string | null;
  position: PositionBouton;
  urgence: NiveauUrgenceBouton;
  lien_whatsapp: string | null;
};

/**
 * Ce que l'agence peut montrer dans le panneau du bouton flottant.
 *
 * Ce sont les trois faits qui décident de la visibilité, et les trois
 * seulement : `agency_settings` ne les porte pas, ils viennent de trois tables.
 * Les laisser a la charge de chaque site est exactement la divergence que le
 * contrat existe pour empecher.
 */
export type ContexteBoutonFlottant = {
  /** Prestations publiees et visibles par l'espace. */
  prestations?: LigneService[] | null;
  /** Abonnement de l'espace, s'il a ete lu. */
  abonnement?: LigneAbonnement | null;
  /** Instant de reference, injectable pour que deux sites concluent pareil. */
  maintenant?: Date | number | string | null;
};

/** Identite de l'agence, telle que les quatre sites l'affichent. */
export type IdentiteAgence = {
  nom: string;
  whatsapp: string | null;
  lien_whatsapp: string | null;
  email: string | null;
  lien_email: string | null;
  site_web: string | null;
  bouton_flottant: BoutonFlottantAffiche;
  mis_a_jour_le: string | null;
  mis_a_jour_libelle: string | null;
};

/** Une offre du catalogue de l'agence. */
export type OffreAffiche = {
  id: string;
  titre: string;
  description: string | null;
  message_whatsapp: string;
  prix_libelle: string;
  active: boolean;
  ordre: number;
  lien_whatsapp: string | null;
};

/** Prix d'une prestation ou d'une demande, avec son etat. */
export type EtatPrix = "inclus" | "devis_en_attente" | "chiffre";

export type PrixAffiche = {
  etat: EtatPrix;
  gratuit: boolean;
  /** Vrai seulement quand il y a reellement un montant a encaisser. */
  a_payer: boolean;
  /** Jamais 0 : une prestation gratuite n'a pas de montant. */
  montant_cents: number | null;
  devise: string;
  /** Le texte affiche : « Inclus », « Devis en attente », ou le montant. */
  libelle: string;
};

/** Entree de `decrirePrix`, commune au catalogue et a la demande. */
export type SourcePrix = {
  montant_cents: number | null;
  gratuit?: boolean;
  devise?: string | null;
};

/**
 * Une prestation du catalogue, prete a etre affichee.
 *
 * Deux champs disent deux choses voisines et ne doivent jamais se confondre :
 *
 *  - `couverte_par_abonnement` est un fait de CATALOGUE. Vrai quand une
 *    formule couvre la prestation. C'est ce que lit l'ecran d'administration
 *    quand il affiche « cette prestation est couverte par une offre » ;
 *  - `couverture_abonnement` est un fait de LECTEUR. Vrai quand la formule
 *    que CET espace paie en ce moment couvre la prestation. C'est le seul des
 *    deux qu'un client a le droit de lire comme une promesse.
 *
 * Confondre les deux fait afficher « Inclus dans votre abonnement » a un
 * abonne d'une formule bas de gamme pour une prestation d'une formule
 * premium : le client ne paie pas, et l'agence facture une prestation qu'elle
 * avait diteIncluse. `couverture_libelle` ne s'ecrit que si le second est vrai.
 */
export type PrestationAffiche = {
  id: string;
  code: string;
  titre: string;
  description: string | null;
  gratuit: boolean;
  prix: PrixAffiche;
  /** Fait de catalogue : une formule couvre cette prestation. */
  couverte_par_abonnement: boolean;
  /** Fait de lecteur : l'abonnement en cours couvre cette prestation. */
  couverture_abonnement: boolean;
  /** « Inclus dans votre abonnement », ou `null` si le lecteur ne la couvre pas. */
  couverture_libelle: string | null;
  /** Achat de création de site, qui peut ouvrir un droit de formation. */
  achat_creation_site: boolean;
  /** Formation de gestion, avec premier droit conditionné au paiement du site. */
  formation_gestion: boolean;
  delai_heures: number | null;
  delai_libelle: string | null;
  active: boolean;
  ordre: number;
};

/** Etat de paiement d'une demande. */
export type PaiementAffiche = {
  reglee: boolean;
  a_payer: boolean;
  payee_le: string | null;
  payee_libelle: string | null;
  echeance: string | null;
  echeance_libelle: string | null;
  echeance_depassee: boolean;
};

/** Personne a l'origine d'un evenement, lue par un client. */
export type ActeurAffiche = {
  nom: string;
  initiales: string;
  type: CodeTypeActeur;
  type_libelle: string;
};

/** Une demande, prete a etre affichee cote client. */
export type DemandeAffiche = {
  id: string;
  reference: string;
  objet: string;
  description: string | null;
  statut: CodeStatutDemande;
  statut_libelle: string;
  /** Faux si la base contient un statut que ce fichier ne connait pas. */
  statut_connu: boolean;
  terminal: boolean;
  site_id: string | null;
  service_id: string | null;
  /** Code de la prestation, recopie sur la demande par la migration 202609290017. */
  service_code: string | null;
  service: PrestationAffiche | null;
  /**
   * La demande est-elle incluse dans l'abonnement EN COURS de cet espace ?
   *
   * C'est la seule couverture qu'un client a le droit de lire comme une
   * promesse, parce qu'elle est verifiee formule contre formule : la formule
   * souscrite doit etre celle qui couvre la prestation. Elle se lit par
   * `couverture_libelle`, et c'est elle qui doit apparaitre sur l'ecran.
   *
   * Elle ne remplace pas le prix : un agent reste juge de chiffrer ou non une
   * demande incluse, et un montant s'affiche tant qu'il est saisi. Les deux
   * informations sont vraies, la demande ne s'annule pas parce qu'elle est
   * incluse.
   */
  couverture_abonnement: boolean;
  /** « Inclus dans votre abonnement », ou `null` si ce n'est pas couvert. */
  couverture_libelle: string | null;
  /** La demande consomme le droit unique de formation initiale de ce site. */
  formation_initiale_incluse: boolean;
  /**
   * Toujours renseigne : la demande reste lisible sans sa prestation. Le
   * libelle recopie sur la demande passe avant le titre de la prestation
   * jointee, parce qu'il survit a la sortie de celle-ci du catalogue.
   */
  prestation_libelle: string;
  prix: PrixAffiche;
  paiement: PaiementAffiche;
  demandeur: ActeurAffiche & {
    email: string | null;
    lien_email: string | null;
    telephone: string | null;
    message_whatsapp: string;
    lien_whatsapp: string | null;
  };
  cree_le: string | null;
  cree_libelle: string | null;
  mis_a_jour_le: string | null;
  mis_a_jour_libelle: string | null;
  evenements: EvenementAffiche[];
};

/** Une ligne du suivi, prete a etre affichee. */
export type EvenementAffiche = {
  id: string;
  type: CodeTypeEvenement;
  type_connu: boolean;
  libelle: string;
  acteur: ActeurAffiche;
  detail: string | null;
  le: string | null;
  le_libelle: string | null;
};

/** Abonnement de l'espace, avec la formule qui le porte. */
export type AbonnementAffiche = {
  actif: boolean;
  statut: CodeStatutAbonnement | "aucun" | "inconnu";
  statut_libelle: string;
  essai: boolean;
  formule: string;
  formule_code: string | null;
  tarif_libelle: string | null;
  caracteristiques: string[];
  periode_debut: string | null;
  periode_fin: string | null;
  periode_libelle: string | null;
  fin_libelle: string | null;
  jours_restants: number | null;
  se_renouvelle: boolean;
  resilie: boolean;
};

/* ========================================================================= *
 * 6. Reponses d'API
 *
 * Les quatre sites consomment ces trois enveloppes. Les typer ici evite que
 * chacun redefinisse la forme d'une reponse et que les evolutions divergent.
 * ========================================================================= */

export type ReponseAgence = {
  identite: IdentiteAgence;
  offres: OffreAffiche[];
};

export type ReponsePrestations = {
  prestations: PrestationAffiche[];
};

export type ReponseDemandes = {
  demandes: DemandeAffiche[];
};

export type ReponseCreationDemande = {
  demande: DemandeAffiche;
  message: string;
};

export type ReponseAbonnement = {
  abonnement: AbonnementAffiche;
};

/* ========================================================================= *
 * 7. Utilitaires internes
 *
 * Aucun effet de bord, aucune allocation partagee : ces fonctions sont la
 * seule couche ou une valeur inattendue est toleree, et elle se contente
 * toujours de la reduire a un type affichable.
 * ========================================================================= */

/** Espaces et retours a ligne reduits a un seul espace, longueur bornee. */
function texte(valeur: string | null | undefined, longueurMax = 200): string {
  if (typeof valeur !== "string") return "";
  return valeur.replace(/\s+/g, " ").trim().slice(0, longueurMax);
}

/** Texte long : on garde les paragraphes, on borne la longueur. */
function texteLong(valeur: string | null | undefined, longueurMax = 4000): string {
  if (typeof valeur !== "string") return "";
  return valeur
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, longueurMax);
}

/** Entier fin, ou `null` : la base ne renvoie que des entiers, on ne suppose rien. */
function entier(valeur: number | null | undefined): number | null {
  return typeof valeur === "number" && Number.isFinite(valeur) ? Math.trunc(valeur) : null;
}

/** `Date` valide, ou `null`. Accepte une chaine ISO, un nombre, une `Date`. */
function instant(valeur: string | number | Date | null | undefined): Date | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const date = valeur instanceof Date ? valeur : new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Instant de reference, injectable pour que deux sites calculent pareil. */
function reference(maintenant?: Date | number | string | null): Date {
  return instant(maintenant) ?? new Date();
}

/**
 * Date normalisee, en ISO UTC, ou `null`.
 *
 * Les dates traversent la reponse sous forme de chaine, pour qu'un
 * tableau de bord n'ait pas a transporter d'objet `Date`. Une date illisible
 * devient donc `null` et non la valeur recue : aucune chaine parasite ne doit
 * atteindre un ecran.
 */
function dateIso(valeur: string | number | Date | null | undefined): string | null {
  return instant(valeur)?.toISOString() ?? null;
}

function pluriel(nombre: number, singulier: string, pluriel_: string): string {
  return `${nombre} ${nombre > 1 ? pluriel_ : singulier}`;
}

/**
 * Groupement d'un nombre, facon francaise : espace comme separateur de
 * milliers, virgule decimale. `Intl` quand il est disponible, et un
 * calcul manuel sinon, pour qu'un runtime sans ICU complet n'affiche pas
 * « 25000 » la ou les trois autres sites affichent « 25 000 ».
 */
function nombreFormate(valeur: number, decimales: number): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valeur);
  } catch {
    const [entier_, reste] = valeur.toFixed(decimales).split(".");
    const groupe = entier_.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return reste === undefined ? groupe : `${groupe},${reste}`;
  }
}

/* ========================================================================= *
 * 8. Statuts, evenements, acteurs
 * ========================================================================= */

const LIBELLE_STATUT_DEMANDE: Record<CodeStatutDemande, string> = {
  nouvelle: "En attente de devis",
  en_cours: "En cours de traitement",
  en_attente_client: "En attente de votre réponse",
  livree: "Livrée",
  annulee: "Annulée",
  refusee: "Refusée",
};

/**
 * Les memes statuts, du point de vue de l'agence.
 *
 * Deux jeux, et non un seul : cote client, « En attente de votre reponse » est
 * la seule formulation qui ne parle pas d'interne a un visiteur ; cote agence,
 * « En attente du client » designe sans ambiguite la file de travail. Le code
 * brut ne remplace jamais ces libelles, il accompagne seulement : un ecran de
 * tri a besoin de l'un, un humain de l'autre. Les deux jeux sont ici plutot que
 * dans l'ecran et dans le metier, parce qu'ils decrivent la meme table : un
 * libelle ecrit deux fois finit par differer d'une seule ligne, et personne ne
 * sait laquelle des deux fait autorite.
 */
const LIBELLE_STATUT_DEMANDE_AGENT: Record<CodeStatutDemande, string> = {
  nouvelle: "Nouvelle",
  en_cours: "En cours de traitement",
  en_attente_client: "En attente du client",
  livree: "Livrée",
  annulee: "Annulée",
  refusee: "Refusée",
};

const LIBELLE_EVENEMENT: Record<CodeTypeEvenement, string> = {
  created: "Demande envoyée",
  quoted: "Devis envoyé",
  accepted: "Devis accepté",
  declined: "Devis refusé",
  in_progress: "Traitement commencé",
  delivered: "Prestation livrée",
  cancelled: "Demande annulée",
  paid: "Paiement enregistré",
  note: "Note de l’agence",
};

const LIBELLE_ACTEUR: Record<CodeTypeActeur, string> = {
  client: "Client",
  agent: "Agence",
  systeme: "Système",
};

const LIBELLE_STATUT_ABONNEMENT: Record<CodeStatutAbonnement, string> = {
  trialing: "Essai en cours",
  active: "Actif",
  past_due: "Paiement en retard",
  canceled: "Résilié",
  unpaid: "Impayé",
  incomplete: "Paiement à finaliser",
};

/** Code de code : le vocabulaire de la base, minuscules, espaces ignores. */
function normaliserCode(valeur: string | null | undefined): string {
  return texte(valeur, 64).toLowerCase();
}

function estCodeStatut(valeur: string): valeur is CodeStatutDemande {
  return STATUTS_DEMANDE.some((code) => code === valeur);
}

function estCodeEvenement(valeur: string): valeur is CodeTypeEvenement {
  return TYPES_EVENEMENT.some((code) => code === valeur);
}

function estCodeActeur(valeur: string): valeur is CodeTypeActeur {
  return TYPES_ACTEUR.some((code) => code === valeur);
}

function estCodeAbonnement(valeur: string): valeur is CodeStatutAbonnement {
  return STATUTS_ABONNEMENT.some((code) => code === valeur);
}

/**
 * Libelle FRANCAIS d'un statut de demande.
 *
 * Regle absolue : un code inconnu n'est JAMAIS affiche. Si la base ajoute un
 * statut demain, les quatre sites affichent « Demande en traitement » au lieu
 * de laisser paraitre `en_attente_client` dans une interface. Repli :
 * `LIBELLE_STATUT_INCONNU`.
 */
export function decrireStatut(code: string | null | undefined): string {
  const cle = normaliserCode(code);
  return estCodeStatut(cle) ? LIBELLE_STATUT_DEMANDE[cle] : LIBELLE_STATUT_INCONNU;
}

/**
 * Libelle FRANCAIS d'un statut de demande, vu par l'agence.
 *
 * Meme regle que `decrireStatut` : un code inconnu n'est jamais affiche. Le
 * repli est le meme libelle — « Demande en traitement » — parce qu'un agent qui
 * voit un code qu'il ne connait pas doit comprendre que la demande existe et
 * qu'elle n'est pas classee, pas croire a une panne d'affichage.
 */
export function decrireStatutAgent(code: string | null | undefined): string {
  const cle = normaliserCode(code);
  return estCodeStatut(cle) ? LIBELLE_STATUT_DEMANDE_AGENT[cle] : LIBELLE_STATUT_INCONNU;
}

/** Vrai si le code est un des six statuts connus. Repli : faux. */
export function estStatutConnu(code: string | null | undefined): boolean {
  return estCodeStatut(normaliserCode(code));
}

/** Vrai si le statut clos la demande : livree, annulee ou refusee. Repli : faux. */
export function estStatutTerminal(code: string | null | undefined): boolean {
  const cle = normaliserCode(code);
  return estCodeStatut(cle) && STATUTS_TERMINAUX_DEMANDE.includes(cle);
}

/** Libelle FRANCAIS d'un type d'evenement. Repli : « Étape du suivi ». */
export function decrireEvenement(code: string | null | undefined): string {
  const cle = normaliserCode(code);
  return estCodeEvenement(cle) ? LIBELLE_EVENEMENT[cle] : LIBELLE_EVENEMENT_INCONNU;
}

/** Libelle FRANCAIS d'un type d'acteur. Repli : « Intervenant ». */
export function decrireActeur(code: string | null | undefined): string {
  const cle = normaliserCode(code);
  return estCodeActeur(cle) ? LIBELLE_ACTEUR[cle] : LIBELLE_ACTEUR_INCONNU;
}

/** Libelle FRANCAIS d'un statut d'abonnement. Repli : « Abonnement à vérifier ». */
export function decrireStatutAbonnement(code: string | null | undefined): string {
  const cle = normaliserCode(code);
  return estCodeAbonnement(cle) ? LIBELLE_STATUT_ABONNEMENT[cle] : LIBELLE_ABONNEMENT_INCONNU;
}

/** Position du bouton flottant, normalisee. Repli : `POSITION_BOUTON_DEFAUT`. */
export function normaliserPositionBouton(valeur: string | null | undefined): PositionBouton {
  const cle = normaliserCode(valeur).replace(/-/g, "_");
  return POSITIONS_BOUTON.find((position) => position === cle) ?? POSITION_BOUTON_DEFAUT;
}

/**
 * Niveau d'urgence du bouton flottant, normalise.
 * Repli : `NIVEAU_URGENCE_DEFAUT` (« neutre »), jamais la valeur recue.
 */
export function normaliserUrgenceBouton(valeur: string | null | undefined): NiveauUrgenceBouton {
  const cle = normaliserCode(valeur);
  return NIVEAUX_URGENCE_BOUTON.find((niveau) => niveau === cle) ?? NIVEAU_URGENCE_DEFAUT;
}

/* ========================================================================= *
 * 9. Prix
 * ========================================================================= */

/**
 * Code devise, en majuscules, conforme au CHECK `^[A-Z]{3}$` de la base.
 * Repli : `DEVISE_PAR_DEFAUT`, parce qu'une devise invalide ferait echouer
 * `Intl` et laisserait le montant sans unite.
 */
export function normaliserDevise(devise: string | null | undefined): string {
  const code = texte(devise, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : DEVISE_PAR_DEFAUT;
}

/**
 * Montant en centimes, formate dans sa devise.
 *
 * La devise de reference, le franc CFA, ne s'ecrit pas avec de centimes
 * dans l'usage local : un montant rond s'affiche donc « 25 000 F CFA », et un
 * montant non rond « 25 000,50 F CFA ». Un montant negatif est traite comme
 * un montant illisible et rend `LIBELLE_PRIX_DEVIS` : la base l'interdit, donc
 * l'afficher serait mentir sur l'etat reel du dossier.
 */
export function formaterMontant(montantCents: number, devise?: string | null): string {
  const centimes = entier(montantCents);
  if (centimes === null || centimes < 0) return LIBELLE_PRIX_DEVIS;
  const code = normaliserDevise(devise);
  const decimales = centimes % 100 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(centimes / 100);
  } catch {
    return `${nombreFormate(centimes / 100, decimales)} ${code}`;
  }
}

/**
 * Prix d'une prestation ou d'une demande, et le texte a afficher.
 *
 * Trois cas, et pas un de plus :
 *
 *  - gratuit (`is_free`, ou montant chiffre a 0) : « Inclus » ;
 *  - pas encore chiffre (montant absent) : « Devis en attente » ;
 *  - chiffre : le montant formate dans sa devise.
 *
 * Le montant est `null` tant qu'il n'y a rien a payer, et le repli sur
 * `LIBELLE_PRIX_DEVIS` couvre le montant absent, non numerique, negatif, ou
 * inconnu. Un « 0 » ne sort jamais d'ici : il se lit comme une erreur de
 * saisie, et une chaine vide comme un bug.
 */
export function decrirePrix(source: SourcePrix | null | undefined): PrixAffiche {
  const code = normaliserDevise(source?.devise);
  const montant = entier(source?.montant_cents);

  if (montant === null || montant < 0) {
    const inclus = source?.gratuit === true;
    return {
      etat: inclus ? "inclus" : "devis_en_attente",
      gratuit: inclus,
      a_payer: false,
      montant_cents: null,
      devise: code,
      libelle: inclus ? LIBELLE_PRIX_INCLUS : LIBELLE_PRIX_DEVIS,
    };
  }

  if (montant === 0) {
    return {
      etat: "inclus",
      gratuit: true,
      a_payer: false,
      montant_cents: null,
      devise: code,
      libelle: LIBELLE_PRIX_INCLUS,
    };
  }

  return {
    etat: "chiffre",
    gratuit: false,
    a_payer: true,
    montant_cents: montant,
    devise: code,
    libelle: formaterMontant(montant, code),
  };
}

/** Prix d'une prestation du catalogue. Repli : « Devis en attente ». */
export function decrirePrixService(ligne: LigneService | null | undefined): PrixAffiche {
  return decrirePrix({
    montant_cents: ligne?.price_cents ?? null,
    gratuit: ligne?.is_free === true,
    devise: ligne?.currency,
  });
}

/**
 * Prix d'une demande.
 *
 * Le montant de la demande (`quoted_price_cents`) fait foi, pas celui du
 * catalogue : une prestation gratuite peut etre facturee sur une demande
 * particuliere, et une prestation payante accordee a moindre cout. Repli :
 * « Devis en attente », jamais « Inclus », tant que rien n'a ete chiffre.
 */
export function decrirePrixDemande(ligne: LigneDemande | null | undefined): PrixAffiche {
  return decrirePrix({
    montant_cents: ligne?.quoted_price_cents ?? null,
    devise: ligne?.currency,
  });
}

/**
 * Delai indicatif de traitement d'une prestation.
 *
 * En dessous de 24 h, le delai reste en heures ; au-dela, il est donne en
 * jours arrondis, parce que « traitee sous 100 h » ne parle a personne.
 * Repli : `null` quand la base n'a pas de delai, plutot qu'une chaine vide
 * que l'appelant afficherait.
 */
export function formaterDelai(heures: number | null | undefined): string | null {
  const total = entier(heures);
  if (total === null || total <= 0) return null;
  if (total < 24) return `Traitée sous ${pluriel(total, "heure", "heures")}`;
  return `Traitée sous ${pluriel(Math.max(1, Math.round(total / 24)), "jour", "jours")}`;
}

/* ========================================================================= *
 * 10. Identite, telephone, liens
 * ========================================================================= */

export type SourceIdentite =
  | string
  | null
  | undefined
  | { nom?: string | null; prenom?: string | null };

/**
 * Nom affiche d'une personne, depuis un prenom et un nom ou depuis une chaine.
 * Repli : « Client », parce qu'un dossier sans nom doit rester lisible.
 */
export function formaterNom(source: SourceIdentite): string {
  if (typeof source === "string") return texte(source, 120) || LIBELLE_NOM_INCONNU;
  const assemble = [texte(source?.prenom, 60), texte(source?.nom, 60)]
    .filter(Boolean)
    .join(" ");
  return texte(assemble, 120) || LIBELLE_NOM_INCONNU;
}

/**
 * Initiales d'un avatar : deux lettres du prenom et du nom s'il y en a deux,
 * deux premieres lettres sinon. Repli : celles de « Client », soit « CL », et
 * jamais une chaine vide dans un cercle d'avatar.
 */
export function initiales(source: SourceIdentite): string {
  const mots = formaterNom(source).split(" ").filter(Boolean);
  if (mots.length < 2) return (mots[0] ?? LIBELLE_NOM_INCONNU).slice(0, 2).toUpperCase();
  return (mots[0].charAt(0) + mots[mots.length - 1].charAt(0)).toUpperCase();
}

/** Email affichable, minuscules. Repli : `null` si l'adresse est inexploitable. */
export function formaterEmail(email: string | null | undefined): string | null {
  const adresse = texte(email, 254).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse) ? adresse : null;
}

/** Lien `mailto:`. Repli : `null`. */
export function lienEmail(email: string | null | undefined): string | null {
  const adresse = formaterEmail(email);
  return adresse === null ? null : `mailto:${adresse}`;
}

/** Les huit chiffres d'un numero burkinabe, ou `null` si ce n'en est pas un. */
function chiffresBurkinabe(brut: string): string | null {
  let chiffres = brut;
  if (chiffres.startsWith("00226")) chiffres = chiffres.slice(5);
  else if (chiffres.length === 11 && chiffres.startsWith("226")) chiffres = chiffres.slice(3);
  else if (chiffres.length === 9 && chiffres.startsWith("0")) chiffres = chiffres.slice(1);
  return /^[2567]\d{7}$/.test(chiffres) ? chiffres : null;
}

/**
 * Numero burkinabe affiche en `+226 XX XX XX XX`.
 *
 * L'indicatif est facultatif a la saisie, national avec ou sans zero initial.
 * Un numero etranger est conserve lisible tel quel : le refuser ferait perdre
 * un contact reel. Repli : `null` quand il n'y a rien de Composition entre 6 et
 * 15 chiffres, ou 8 chiffres burkinabes.
 */
export function formaterTelephone(valeur: string | null | undefined): string | null {
  const brut = texte(valeur, 40);
  if (brut === "") return null;
  const chiffres = brut.replace(/\D/g, "");
  if (chiffres.length < 6 || chiffres.length > 15) return null;
  const burkinabe = chiffresBurkinabe(chiffres);
  if (burkinabe === null) {
    return brut.replace(/[^\d+]+/g, " ").replace(/\s+/g, " ").trim();
  }
  return `+226 ${burkinabe.slice(0, 2)} ${burkinabe.slice(2, 4)} ${burkinabe.slice(4, 6)} ${burkinabe.slice(6, 8)}`;
}

/**
 * Lien WhatsApp d'un numero, avec un message pre-rempli si l'on en fournit un.
 * Repli : `null` si le numero est illisible — un bouton sans cible ne doit
 * pas etre rendu actif.
 */
export function lienWhatsapp(
  numero: string | null | undefined,
  message?: string | null,
): string | null {
  const affiche = formaterTelephone(numero);
  if (affiche === null) return null;
  const burkinabe = chiffresBurkinabe(affiche.replace(/\D/g, ""));
  // Numero national burkinabe : wa.me attend l'international sans le zero
  // initial, sinon le lien ouvre un chat vers un numero qui n'existe pas.
  const international = burkinabe === null ? affiche.replace(/\D/g, "") : `226${burkinabe}`;
  if (!/^\d{8,15}$/.test(international)) return null;
  const contenu = texteLong(message, 500);
  const base = `https://wa.me/${international}`;
  return contenu === "" ? base : `${base}?text=${encodeURIComponent(contenu)}`;
}

/**
 * Adresse web de l'agence, avec `https://` ajoute si besoin.
 *
 * Un schema autre que `http` ou `https` est refuse plutot que prefixes : un
 * lien de contact ne doit jamais devenir un `javascript:`. Repli : `null`.
 */
export function formaterSiteWeb(valeur: string | null | undefined): string | null {
  const brut = texte(valeur, 200);
  if (brut === "") return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(brut) && !/^https?:\/\//i.test(brut)) return null;
  const avecSchema = /^https?:\/\//i.test(brut) ? brut : `https://${brut}`;
  if (!/^https?:\/\/[^\s/?#]+[^\s]*$/i.test(avecSchema)) return null;
  return avecSchema.replace(/\/+$/, "");
}

/** Reference courte d'une demande : les huit premiers chiffres de son uuid. */
export function formaterReference(identifiant: string | null | undefined): string {
  const brut = texte(identifiant, 64).replace(/-/g, "");
  return brut.slice(0, 8).toUpperCase() || LIBELLE_REFERENCE_INCONNUE;
}

/* ========================================================================= *
 * 11. Dates
 * ========================================================================= */

/** Fuseau de rendu. Sans precision, le fuseau local de l'appelant est utilise. */
export type OptionsDate = { fuseau?: string | null };

const OPTIONS_DATE: Record<string, number | string> = {
  day: "numeric",
  month: "long",
  year: "numeric",
};

const OPTIONS_DATE_HEURE: Record<string, number | string> = {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

function optionsDate(base: Record<string, number | string>, options?: OptionsDate) {
  return options?.fuseau ? { ...base, timeZone: options.fuseau } : base;
}

/** Date longue en francais : « 12 mars 2026 ». Repli : `null`. */
export function formaterDate(
  valeur: string | number | Date | null | undefined,
  options?: OptionsDate,
): string | null {
  const date = instant(valeur);
  if (date === null) return null;
  try {
    return new Intl.DateTimeFormat("fr-FR", optionsDate(OPTIONS_DATE, options)).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Date et heure : « 12 mars 2026 à 14:05 ». Repli : `null`. */
export function formaterDateHeure(
  valeur: string | number | Date | null | undefined,
  options?: OptionsDate,
): string | null {
  const date = instant(valeur);
  if (date === null) return null;
  try {
    return new Intl.DateTimeFormat("fr-FR", optionsDate(OPTIONS_DATE_HEURE, options)).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

const SECONDE_SEMAINNE = 604800;
const SECONDE_MOIS = 2629800;
const SECONDE_ANNEE = 31557600;

/**
 * Ecart lisible : « à l'instant », « il y a 3 h », « il y a 2 j », et
 * « dans 2 j » pour une date a venir.
 *
 * L'echelle est fixe et l'instant de reference injectable : c'est ce qui
 * evite que « il y a 2 j » sur une boutique devienne « il y a 48 h » sur une
 * autre. Sous 45 secondes, la phrase est « à l'instant » plutot que « il y a
 * 0 min ». Repli : `null` si la date est absente ou illisible.
 */
export function formaterDateRelative(
  valeur: string | number | Date | null | undefined,
  maintenant?: Date | number | string | null,
): string | null {
  const date = instant(valeur);
  if (date === null) return null;
  const secondes = (reference(maintenant).getTime() - date.getTime()) / 1000;
  const absolu = Math.abs(secondes);
  if (absolu < 45) return "à l’instant";

  const prefixe = secondes >= 0 ? "il y a " : "dans ";
  const compte = (diviseur: number, singulier: string, pluriel_: string, plafond?: number) => {
    const nombre = Math.max(1, Math.round(absolu / diviseur));
    return `${prefixe}${pluriel(plafond === undefined ? nombre : Math.min(plafond, nombre), singulier, pluriel_)}`;
  };
  if (absolu < 3600) return compte(60, "minute", "minutes", 59);
  if (absolu < 86400) return compte(3600, "heure", "heures");
  if (absolu < SECONDE_SEMAINNE) return compte(86400, "jour", "jours");
  if (absolu < SECONDE_MOIS) return compte(SECONDE_SEMAINNE, "semaine", "semaines");
  if (absolu < SECONDE_ANNEE) return compte(SECONDE_MOIS, "mois", "mois");
  return compte(SECONDE_ANNEE, "an", "ans");
}

/* ========================================================================= *
 * 12. Lecture des lignes de la base
 * ========================================================================= */

/**
 * Prestation liee a une demande, quel que soit le forme du lien.
 *
 * PostgREST renvoie un objet pour un many-to-one, mais un tableau des qu'il ne
 * resout pas la relation. Repli : `null`, parce qu'une demande dont la
 * prestation a disparu du catalogue doit rester lisible.
 */
export function lienService(ligne: Pick<LigneDemande, "service">): LigneService | null {
  const valeur = ligne?.service;
  if (!valeur) return null;
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur;
}

/**
 * Formule rattachee a un abonnement, quel que soit la forme du lien.
 *
 * Meme lecture que `lienService`, meme raison : PostgREST renvoie un objet pour
 * un many-to-one, un tableau des qu'il ne resout pas la relation. Repli : `null`,
 * et l'ecran affiche alors « Formule à préciser » plutot qu'un nom invente.
 */
export function lienPlan(ligne: LigneAbonnementAvecPlan | null | undefined): LignePlan | null {
  const valeur = ligne?.plan;
  if (!valeur) return null;
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur;
}

/**
 * Configuration du bouton flottant portee par `agency_settings`.
 *
 * Les colonnes `bouton_flottant_*` de la migration 202609290017 sont lues en
 * premier ; si une lecture regroupe les cinq en un objet `bouton_flottant`,
 * l'objet l'emporte sur les colonnes, ce qui permet de brancher les deux
 * formes. Repli : une configuration vide, que `presenterBoutonFlottant` ramene
 * aux valeurs par defaut.
 */
export function lireBoutonFlottant(
  ligne: LigneAgenceSettings | null | undefined,
): ConfigBoutonFlottant {
  const plat: ConfigBoutonFlottant = {
    actif: ligne?.bouton_flottant_actif ?? null,
    libelle: ligne?.bouton_flottant_libelle ?? null,
    message: ligne?.bouton_flottant_message ?? null,
    position: ligne?.bouton_flottant_position ?? null,
    urgence: ligne?.bouton_flottant_urgence ?? null,
  };
  const imbrique = ligne?.bouton_flottant;
  if (!imbrique) return plat;
  return {
    actif: imbrique.actif ?? plat.actif ?? null,
    libelle: imbrique.libelle ?? plat.libelle ?? null,
    message: imbrique.message ?? plat.message ?? null,
    position: imbrique.position ?? plat.position ?? null,
    urgence: imbrique.urgence ?? plat.urgence ?? null,
  };
}

/**
 * Caracteristiques d'une formule, en ne gardant que les chaines. Repli : liste vide.
 *
 * `features` est un `jsonb` : rien n'y garantit un tableau de textes, et une
 * formule saisie a la main peut contenir un nombre, un objet ou une chaine vide.
 * Lire ce champ sans passer par ici, c'est afficher `[object Object]` ou une
 * pastille vide a l'ecran. La fonction est donc exportee : la console
 * d'administration lit les caracteristiques d'une formule par cette porte, et
 * les sites clients Presentation par la meme.
 */
export function lireCaracteristiques(plan: LignePlan | null | undefined): string[] {
  if (!Array.isArray(plan?.features)) return [];
  return plan.features
    .filter((ligne): ligne is string => typeof ligne === "string")
    .map((ligne) => texte(ligne, 160))
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Prestations publiees d'un catalogue lu : ni les absentes, ni les desactivees.
 *
 * Une prestation desactivee reste en base pour que les demandes passees
 * gardent leur lien, mais elle ne s'affiche plus et ne compte donc pas comme
 * contenu a montrer. Repli : zero, quand le catalogue n'a pas ete lu.
 */
function nombrePrestationsPubliees(prestations: LigneService[] | null | undefined): number {
  if (!Array.isArray(prestations)) return 0;
  return prestations.filter((prestation) => prestation?.is_active !== false).length;
}

/**
 * Le bouton flottant doit-il etre affiche sur CE site ?
 *
 * Deux motifs de disparition, et deux seulement :
 *
 *  - l'agence l'a desactive elle-meme. C'est sa decision, elleprime ;
 *  - l'agence n'a rien a montrer : aucun contact exploitable, aucune prestation
 *    publiee, aucun abonnement en cours. Un bouton qui ouvre un panneau vide
 *    est PIRE que son absence : le client y lit une panne du service plutot
 *    qu'une absence de contenu.
 *
 * Contresens volontairement respecte : un espace sans abonnement qui a un
 * catalogue garde son bouton. Lui retirer le contact sous pretexte qu'il ne
 * paie rien serait priver un client gratuit de la seule porte d'entree dont il
 * dispose. Un contact lisible suffit donc a lui seul, de meme qu'un catalogue
 * ou un abonnement : chacun est un contenu a part entiere.
 *
 * Repli : `false`. Sans `agency_settings` (`actif` inconnu, donc actif) et sans
 * aucun des trois faits, il n'y a rien a prouver que le bouton serve, et le
 * contrat ne presume pas.
 */
export function estBoutonFlottantVisible(
  config: ConfigBoutonFlottant | null | undefined,
  contact: string | null | undefined,
  contexte: ContexteBoutonFlottant = {},
): boolean {
  if (config?.actif === false) return false;
  if (lienWhatsapp(contact) !== null) return true;
  if (nombrePrestationsPubliees(contexte.prestations) > 0) return true;
  return estAbonnementActif(contexte.abonnement, contexte.maintenant);
}

/**
 * Une prestation est-elle couverte par CET abonnement ?
 *
 * Regle unique et stricte : il faut que la formule souscrite soit celle qui
 * porte la prestation, donc `abonnement.plan_id === prestation.billing_plan_id`,
 * sur un abonnement en cours (essai ou formule, periode non echue, meme test que
 * `tenant_has_active_subscription` en base).
 *
 * Une couverture accordee a n'importe quel abonnement actif perdrait deux fois :
 * un abonne a une formule bas de gamme verrait « inclus dans votre abonnement »
 * sur une prestation premium qu'il ne paie pas — perte de recette, et un ecart
 * entre ce qu'on annonce et ce qu'on facture — et la couverture deviendrait
 * invérifiable, donc contestable par le client.
 *
 * Repli : `false`. Sans prestation, sans formule de rattachement, sans
 * abonnement ou avec un abonnement echu, rien n'est couvert : mieux vaut laisser
 * un client payer que de lui accorder par defaut une prestation.
 */
export function estPrestationCouverte(
  prestation: Pick<LigneService, "billing_plan_id"> | null | undefined,
  abonnement: LigneAbonnement | null | undefined,
  maintenant?: Date | number | string | null,
): boolean {
  if (prestation === undefined || prestation === null) return false;
  const formule = texte(prestation.billing_plan_id, 64);
  if (formule === "") return false;
  if (!estAbonnementActif(abonnement, maintenant)) return false;
  return texte(abonnement?.plan_id, 64) === formule;
}

/* ========================================================================= *
 * 13. Mise en forme des reponses
 * ========================================================================= */

/**
 * Bouton flottant, pret a etre rendu.
 *
 * La visibilite est celle de `estBoutonFlottantVisible` : desactive par
 * l'agence, ou sans rien a montrer. `contexte` apporte les deux faits que
 * `agency_settings` ne porte pas (catalogue publie, abonnement en cours).
 *
 * Replis cumulés : libelle « Nous contacter » (la valeur par defaut de la
 * base), position `bas_droite`, urgence `neutre`, aucune bulle si l'agence n'en
 * a pas ecrit, et `lien_whatsapp` a `null` des que le numero est illisible — ce
 * qui ne suffit plus, a lui seul, a masquer le bouton. `visible` et le lien
 * sont deux faits distincts : un bouton visible sans lien affiche le catalogue
 * ou l'abonnement, et l'appelant ne doit pas confondre les deux.
 *
 * Repli de `contexte` : absent, seuls le contact et le reglage sont connus, donc
 * le bouton suit la regle la plus pauvre — il disparait sans contact lisible.
 * Une route qui a le catalogue et l'abonnement en main doit les passer, sinon
 * elle ne fait pas rendre la meme decision que le contrat.
 *
 * Le message de la base est un texte de bulle, pas un message WhatsApp
 * pre-rempli : le lien est donc construit sans texte, et chaque offre garde
 * le sien dans `presenterOffre`.
 */
export function presenterBoutonFlottant(
  config: ConfigBoutonFlottant | null | undefined,
  numero?: string | null,
  contexte?: ContexteBoutonFlottant,
): BoutonFlottantAffiche {
  const lien = lienWhatsapp(numero);
  return {
    visible: estBoutonFlottantVisible(config, numero, contexte),
    libelle: texte(config?.libelle, 60) || LIBELLE_BOUTON_DEFAUT,
    libelle_accessible: LIBELLE_BOUTON_ACCESSIBLE,
    bulle_libelle: texteLong(config?.message, 1000) || null,
    position: normaliserPositionBouton(config?.position),
    urgence: normaliserUrgenceBouton(config?.urgence),
    lien_whatsapp: lien,
  };
}

/**
 * Identite de l'agence.
 *
 * `contexte` est transmis a `presenterBoutonFlottant` : sans lui, la
 * visibilite du bouton se decide sur le seul contact, alors que la route qui
 * dispose du catalogue et de l'abonnement sait dire plus.
 *
 * Repli : `NOM_AGENCE_PAR_DEFAUT` si la ligne est absente ou muette, coordonnees
 * illisibles mises a `null` plutot que montrees brutes, et bouton flottant
 * ramene a ses valeurs par defaut.
 */
export function presenterIdentite(
  ligne: LigneAgenceSettings | null | undefined,
  contexte?: ContexteBoutonFlottant,
): IdentiteAgence {
  const email = formaterEmail(ligne?.email);
  const siteWeb = formaterSiteWeb(ligne?.website);
  return {
    nom: texte(ligne?.name, 160) || NOM_AGENCE_PAR_DEFAUT,
    whatsapp: formaterTelephone(ligne?.whatsapp),
    lien_whatsapp: lienWhatsapp(ligne?.whatsapp),
    email,
    lien_email: lienEmail(ligne?.email),
    site_web: siteWeb,
    bouton_flottant: presenterBoutonFlottant(
      lireBoutonFlottant(ligne),
      ligne?.whatsapp,
      contexte,
    ),
    mis_a_jour_le: dateIso(ligne?.updated_at),
    mis_a_jour_libelle: formaterDate(ligne?.updated_at),
  };
}

/**
 * Une offre du catalogue.
 *
 * `numero` est le WhatsApp de l'agence : sans lui, le lien de l'offre est
 * `null` et l'appelant affiche un bouton de contact sans cible plutot qu'un
 * lien casse. Repli du titre : `LIBELLE_OFFRE_INCONNUE`.
 */
export function presenterOffre(ligne: LigneOffre, numero?: string | null): OffreAffiche {
  const message = texteLong(ligne?.whatsapp_message, 500);
  const prix = entier(ligne?.price_cents);
  const mode = ligne?.billing_mode;
  const prixLibelle =
    mode === "initial_included_then_paid"
      ? prix
        ? `Formation initiale incluse après paiement de la création du site · renouvellement : ${new Intl.NumberFormat("fr-FR").format(prix / 100)} F CFA`
        : "Formation initiale incluse après paiement de la création du site · renouvellement sur devis"
      : mode === "fixed_once" && prix
        ? `${new Intl.NumberFormat("fr-FR").format(prix / 100)} F CFA`
        : "Prestation payante · sur devis";
  return {
    id: texte(ligne?.id, 64),
    titre: texte(ligne?.title, 120) || LIBELLE_OFFRE_INCONNUE,
    description: texteLong(ligne?.description, 280) || null,
    message_whatsapp: message,
    prix_libelle: prixLibelle,
    active: ligne?.active === true,
    ordre: entier(ligne?.display_order) ?? 0,
    lien_whatsapp: lienWhatsapp(numero, message),
  };
}

/**
 * Une prestation du catalogue, prete a etre affichee.
 *
 * `abonnement` est celui du LECTEUR, quand la route l'a lu. C'est lui qui
 * decide de `couverture_abonnement` et donc de `couverture_libelle`, par la
 * regle stricte de `estPrestationCouverte` : meme formule que la prestation, et
 * abonnement en cours.
 *
 * `couverte_par_abonnement` reste un fait de catalogue — une formule couvre
 * cette prestation — et ne se deduit pas de l'appelant : c'est ce que lit
 * l'ecran d'administration quand il regle le catalogue, qui n'a pas de
 * lecteur.
 *
 * Repli : titre vide -> `LIBELLE_FORMULE_INCONNUE`, couverture de catalogue
 * inconnue -> `false`, et couverture de lecteur absente -> `false`, donc pas de
 * mention d'abonnement sur une prestation qu'on ne peut pas prouver couverte.
 * Le prix, lui, s'affiche toujours tel quel : c'est la reduction qui depend du
 * lecteur, pas le montant du catalogue.
 */
export function presenterPrestation(
  ligne: LigneService,
  abonnement?: LigneAbonnement | null,
  maintenant?: Date | number | string | null,
): PrestationAffiche {
  const prix = decrirePrixService(ligne);
  const couverte = texte(ligne?.billing_plan_id, 64) !== "";
  const couverture = estPrestationCouverte(ligne, abonnement, maintenant);
  return {
    id: texte(ligne?.id, 64),
    code: texte(ligne?.code, 64),
    titre: texte(ligne?.title, 160) || LIBELLE_FORMULE_INCONNUE,
    description: texteLong(ligne?.description, 4000) || null,
    gratuit: prix.gratuit,
    prix,
    couverte_par_abonnement: couverte,
    couverture_abonnement: couverture,
    couverture_libelle: couverture ? LIBELLE_PRESTATION_COUVERTE : null,
    achat_creation_site: ligne?.is_site_creation === true,
    formation_gestion: ligne?.is_training === true,
    delai_heures: entier(ligne?.turnaround_hours),
    delai_libelle: formaterDelai(ligne?.turnaround_hours),
    active: ligne?.is_active !== false,
    ordre: entier(ligne?.sort_order) ?? 0,
  };
}

/**
 * Un evenement du suivi.
 *
 * Replis : libelle generique pour un type inconnu, « Intervenant » pour un
 * acteur inconnu, et `null` pour une date illisible.
 */
export function presenterEvenement(
  ligne: LigneEvenement,
  maintenant?: Date | number | string | null,
): EvenementAffiche {
  const type = normaliserCode(ligne?.event_type);
  return {
    id: texte(ligne?.id, 64),
    type: estCodeEvenement(type) ? type : "note",
    type_connu: estCodeEvenement(type),
    libelle: decrireEvenement(type),
    acteur: presenterActeur(ligne),
    detail: texteLong(ligne?.detail, 1000) || null,
    le: dateIso(ligne?.created_at),
    le_libelle: formaterDateRelative(ligne?.created_at, maintenant),
  };
}

/** La personne a l'origine d'un evenement. Repli du nom : « Client ». */
export function presenterActeur(ligne: LigneEvenement): ActeurAffiche {
  const nom = formaterNom(texte(ligne?.actor_label, 120));
  const type = normaliserCode(ligne?.actor_type);
  return {
    nom,
    initiales: initiales(nom),
    type: estCodeActeur(type) ? type : "client",
    type_libelle: decrireActeur(type),
  };
}

/**
 * Abonnement de l'espace et sa formule.
 *
 * Replis : abonnement absent -> statut « aucun », statut inconnu ->
 * « Abonnement à vérifier » sans jamais laisser voir le code, formule absente
 * -> `LIBELLE_FORMULE_INCONNUE`, et `jours_restants` a `null` des que la
 * periode est echue plutot qu'a zero.
 */
export function presenterAbonnement(
  abonnement: LigneAbonnement | null | undefined,
  plan: LignePlan | null | undefined,
  maintenant?: Date | number | string | null,
): AbonnementAffiche {
  const maintenantDate = reference(maintenant);
  const code = normaliserCode(abonnement?.status);
  const debut = instant(abonnement?.current_period_start);
  const fin = instant(abonnement?.current_period_end);
  const joursRestants =
    fin !== null && fin.getTime() > maintenantDate.getTime()
      ? Math.ceil((fin.getTime() - maintenantDate.getTime()) / 86400000)
      : null;

  return {
    actif: estAbonnementActif(abonnement, maintenantDate),
    statut: abonnement === undefined || abonnement === null
      ? "aucun"
      : estCodeAbonnement(code)
        ? code
        : "inconnu",
    statut_libelle:
      abonnement === undefined || abonnement === null
        ? LIBELLE_ABONNEMENT_AUCUN
        : decrireStatutAbonnement(code),
    essai: code === "trialing",
    formule: texte(plan?.name, 120) || LIBELLE_FORMULE_INCONNUE,
    formule_code: texte(plan?.code, 64) || null,
    tarif_libelle: formaterTarif(plan),
    caracteristiques: lireCaracteristiques(plan),
    periode_debut: debut === null ? null : debut.toISOString(),
    periode_fin: fin === null ? null : fin.toISOString(),
    periode_libelle: formaterPeriode(debut, fin),
    fin_libelle: formaterDate(fin),
    jours_restants: joursRestants,
    se_renouvelle: abonnement?.cancel_at_period_end !== true,
    resilie: code === "canceled" || abonnement?.canceled_at != null,
  };
}

/**
 * Abonnement actif : essai ou formule en cours, periode non echue.
 * Meme regle que `tenant_has_active_subscription` en base, appliquee ici pour
 * que l'interface n'annonce pas un acces alors qu'il est coupe. Repli : faux.
 */
export function estAbonnementActif(
  abonnement: LigneAbonnement | null | undefined,
  maintenant?: Date | number | string | null,
): boolean {
  if (!abonnement) return false;
  const code = normaliserCode(abonnement.status);
  if (code !== "trialing" && code !== "active") return false;
  const fin = instant(abonnement.current_period_end);
  return fin !== null && fin.getTime() > reference(maintenant).getTime();
}

/**
 * Tarif d'une formule, avec sa periode : « 25 000 F CFA / mois ».
 *
 * Repli : `null` si la formule est absente. Une formule gratuite s'affiche
 * « Inclus », jamais « 0 F CFA » : la base autorise un prix de catalogue a
 * zero, mais un zero a l'ecran se lit comme une erreur de saisie.
 */
export function formaterTarif(plan: LignePlan | null | undefined): string | null {
  if (!plan) return null;
  const centimes = entier(plan.price_cents);
  if (centimes === null || centimes < 0) return LIBELLE_PRIX_DEVIS;
  if (centimes === 0) return LIBELLE_PRIX_INCLUS;
  const montant = formaterMontant(centimes, plan.currency);
  const periode = formaterPeriodeFacturation(plan.billing_interval);
  return periode === null ? montant : `${montant} / ${periode}`;
}

/** « par mois » ou « par an ». Repli : `null` pour une periode inconnue. */
export function formaterPeriodeFacturation(
  intervalle: string | null | undefined,
): "mois" | "an" | null {
  const cle = normaliserCode(intervalle);
  if (cle === "month") return "mois";
  if (cle === "year") return "an";
  return null;
}

/** Periode d'un abonnement, en une phrase. Repli : `null` si elle est inconnue. */
function formaterPeriode(debut: Date | null, fin: Date | null): string | null {
  const debutLibelle = formaterDate(debut);
  const finLibelle = formaterDate(fin);
  if (debutLibelle === null) return finLibelle === null ? null : `Jusqu’au ${finLibelle}`;
  if (finLibelle === null) return `Depuis le ${debutLibelle}`;
  return `Du ${debutLibelle} au ${finLibelle}`;
}

/**
 * Une demande, prete a etre affichee par le client de la boutique.
 *
 * `abonnement` est celui du lecteur, quand la route l'a lu : c'est lui qui
 * permet d'ecrire `couverture_abonnement` et donc `couverture_libelle`. Sans
 * lui, la demande reste lisible mais sans mention d'abonnement : le contrat ne
 * suppose pas une formule qu'il n'a pas vue.
 *
 * Le code du statut accompagne le libelle parce que l'ecran a besoin de savoir
 * ou il se trouve, mais il n'est jamais ce qui s'affiche. Replis : objet vide
 * -> `LIBELLE_OBJET_INCONNU`, prestation disparue -> « Prestation retirée du
 * catalogue », identite vide -> « Client », et toutes les dates illisibles a
 * `null`.
 */
export function presenterDemande(
  ligne: LigneDemande,
  evenements: LigneEvenement[] = [],
  maintenant?: Date | number | string | null,
  abonnement?: LigneAbonnement | null,
): DemandeAffiche {
  const maintenantDate = reference(maintenant);
  const service = lienService(ligne);
  const prix = decrirePrixDemande(ligne);
  const echeance = instant(ligne?.due_at);
  const reference_ = formaterReference(ligne?.id);
  const nom = formaterNom(ligne?.requester_name);
  const email = formaterEmail(ligne?.requester_email);
  const telephone = formaterTelephone(ligne?.requester_phone);
  const message = `Bonjour, je vous écris au sujet de ma demande ${reference_}.`;
  // Meme regle que pour la prestation du catalogue, et c'est la seule fois qu'elle
  // est appliquee pour une demande : `service` vient de la jointure de
  // `COLONNES_DEMANDE`, qui porte `billing_plan_id`.
  const couverture = estPrestationCouverte(service, abonnement, maintenantDate);

  return {
    id: texte(ligne?.id, 64),
    reference: reference_,
    objet: texte(ligne?.subject, 160) || LIBELLE_OBJET_INCONNU,
    description: texteLong(ligne?.description, 4000) || null,
    statut: ligne?.status,
    statut_libelle: decrireStatut(ligne?.status),
    statut_connu: estStatutConnu(ligne?.status),
    terminal: estStatutTerminal(ligne?.status),
    site_id: ligne?.site_id ?? null,
    service_id: ligne?.service_id ?? null,
    service_code: texte(ligne?.service_code, 64) || texte(service?.code, 64) || null,
    service: service === null ? null : presenterPrestation(service, abonnement, maintenantDate),
    couverture_abonnement: couverture,
    couverture_libelle: couverture ? LIBELLE_PRESTATION_COUVERTE : null,
    formation_initiale_incluse: ligne?.formation_initiale_incluse === true,
    // Le libelle recopie sur la demande l'emporte sur le titre de la
    // prestation jointee : il dit ce que le client a demande ce jour-la, et il
    // survit a la sortie de la prestation du catalogue.
    prestation_libelle:
      texte(ligne?.service_libelle, 160) ||
      texte(service?.title, 160) ||
      LIBELLE_PRESTATION_RETIREE,
    prix,
    paiement: {
      reglee: ligne?.is_paid === true,
      a_payer: prix.a_payer && ligne?.is_paid !== true,
      payee_le: dateIso(ligne?.paid_at),
      payee_libelle: formaterDateHeure(ligne?.paid_at),
      echeance: dateIso(ligne?.due_at),
      echeance_libelle: formaterDate(ligne?.due_at),
      echeance_depassee: echeance !== null && echeance.getTime() < maintenantDate.getTime(),
    },
    demandeur: {
      nom,
      initiales: initiales(nom),
      type: "client",
      type_libelle: decrireActeur("client"),
      email,
      lien_email: lienEmail(ligne?.requester_email),
      telephone,
      message_whatsapp: message,
      lien_whatsapp: lienWhatsapp(ligne?.requester_phone, message),
    },
    cree_le: dateIso(ligne?.created_at),
    cree_libelle: formaterDateRelative(ligne?.created_at, maintenantDate),
    mis_a_jour_le: dateIso(ligne?.updated_at),
    mis_a_jour_libelle: formaterDateRelative(ligne?.updated_at, maintenantDate),
    evenements: [...evenements]
      .sort((gauche, droite) => {
        const a = instant(gauche?.created_at)?.getTime() ?? 0;
        const b = instant(droite?.created_at)?.getTime() ?? 0;
        return a - b;
      })
      .map((evenement) => presenterEvenement(evenement, maintenantDate)),
  };
}

/* ========================================================================= *
 * 14. Enveloppes de reponse
 *
 * Les quatre sites appellent ces fonctions plutot que d'assembler les objets
 * eux-memes : le tri, le filtrage des elements retires et le repli y sont
 * decides une fois pour toutes.
 * ========================================================================= */

/**
 * Offres actives, triees par ordre d'affichage, avec l'identite de l'agence.
 *
 * `contexte` est transmis a `presenterIdentite`, donc a `presenterBoutonFlottant` :
 * sans lui, la visibilite du bouton se decide sur le seul contact, alors que la
 * route qui tient le catalogue et l'abonnement en main sait dire si l'agence a
 * quelque chose a montrer. Repli : le contexte vide, donc la regle la plus
 * pauvre.
 */
export function construireReponseAgence(
  agence: LigneAgenceSettings | null | undefined,
  offres: LigneOffre[] = [],
  contexte?: ContexteBoutonFlottant,
): ReponseAgence {
  const identite = presenterIdentite(agence, contexte);
  return {
    identite,
    offres: offres
      .filter((offre) => offre?.active === true)
      .map((offre) => presenterOffre(offre, identite.whatsapp))
      .sort((gauche, droite) => gauche.ordre - droite.ordre || gauche.titre.localeCompare(droite.titre, "fr")),
  };
}

/**
 * Prestations actives, triees par ordre d'affichage.
 *
 * `abonnement` est celui de l'espace lecteur : il sert a ecrire
 * `couverture_abonnement` sur chaque prestation, donc « Inclus dans votre
 * abonnement » n'apparait que pour la formule que cet espace paie reellement.
 *
 * Repli : sans abonnement, le catalogue se rend entierement, avec son prix et
 * sans mention d'inclusion — un site qui n'a pas lu l'abonnement ne promet
 * rien.
 */
export function construireReponsePrestations(
  prestations: LigneService[] = [],
  abonnement?: LigneAbonnement | null,
  maintenant?: Date | number | string | null,
): ReponsePrestations {
  return {
    prestations: prestations
      .filter((prestation) => prestation?.is_active !== false)
      .map((prestation) => presenterPrestation(prestation, abonnement, maintenant))
      .sort(
        (gauche, droite) =>
          gauche.ordre - droite.ordre || gauche.titre.localeCompare(droite.titre, "fr"),
      ),
  };
}

/**
 * Demandes de l'espace, de la plus recente a la plus ancienne, suivi compris.
 *
 * `abonnement` est celui de l'espace : il donne a chaque demande sa couverture
 * reelle, donc « Inclus dans votre abonnement » quand — et seulement quand —
 * c'est vrai. Repli : aucune couverture, la demande reste lisible.
 */
export function construireReponseDemandes(
  demandes: LigneDemande[] = [],
  evenements: LigneEvenement[] = [],
  maintenant?: Date | number | string | null,
  abonnement?: LigneAbonnement | null,
): ReponseDemandes {
  const parDemande = new Map<string, LigneEvenement[]>();
  for (const evenement of evenements) {
    const deja = parDemande.get(evenement.request_id);
    if (deja) deja.push(evenement);
    else parDemande.set(evenement.request_id, [evenement]);
  }
  return {
    demandes: [...demandes]
      .sort((gauche, droite) => {
        const a = instant(gauche?.created_at)?.getTime() ?? 0;
        const b = instant(droite?.created_at)?.getTime() ?? 0;
        return b - a;
      })
      .map((demande) =>
        presenterDemande(demande, parDemande.get(demande.id) ?? [], maintenant, abonnement),
      ),
  };
}

/**
 * Message de confirmation d'une demande : le bon des deux, selon la couverture.
 *
 * C'est ici que se decide si le client a un devis a attendre. Une demande incluse
 * dans son abonnement n'en a pas : annoncer un devis dans ce cas met le client
 * en attente d'une etape qui n'aura pas lieu, et il la lit comme une panne.
 * Le message est donc choisi par la meme regle stricte que la couverture
 * (`estPrestationCouverte`), et non par le fait qu'une formule existe.
 *
 * Repli : `MESSAGE_DEMANDE_ENVOYEE`, le message du cas par defaut. Sans
 * abonnement lisible, le contrat ne peut pas affirmer qu'une demande est
 * incluse, et il annonce donc l'attente d'un devis — ce que la base garantit,
 * `quoted_price_cents` valant `null` tant que rien n'est chiffre.
 */
export function decrireConfirmationDemande(
  demande: LigneDemande,
  abonnement?: LigneAbonnement | null,
  maintenant?: Date | number | string | null,
): string {
  if (demande.formation_initiale_incluse === true) {
    return MESSAGE_FORMATION_INITIALE_INCLUSE;
  }
  return estPrestationCouverte(lienService(demande), abonnement, maintenant)
    ? MESSAGE_DEMANDE_ENVOYEE_INCLUSE
    : MESSAGE_DEMANDE_ENVOYEE;
}

/**
 * Reponse de creation d'une demande, avec le message que le contrat a choisi.
 *
 * Le message n'est pas un parametre du site : il se deduit de la demande et de
 * l'abonnement, comme le reste de l'ecran. Les deux sorties sont donc couvertes
 * par une seule implementation — demande chiffree payante, qui attend un devis,
 * et demande incluse, qui n'en attend pas.
 *
 * Repli : sans abonnement, le message du cas par defaut, voir
 * `decrireConfirmationDemande`.
 */
export function construireReponseCreationDemande(
  demande: LigneDemande,
  evenements: LigneEvenement[] = [],
  maintenant?: Date | number | string | null,
  abonnement?: LigneAbonnement | null,
): ReponseCreationDemande {
  return {
    demande: presenterDemande(demande, evenements, maintenant, abonnement),
    message: decrireConfirmationDemande(demande, abonnement, maintenant),
  };
}

/** Abonnement de l'espace et sa formule. */
export function construireReponseAbonnement(
  abonnement: LigneAbonnement | null | undefined,
  plan: LignePlan | null | undefined,
  maintenant?: Date | number | string | null,
): ReponseAbonnement {
  return { abonnement: presenterAbonnement(abonnement, plan, maintenant) };
}
