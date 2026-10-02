// Client HTTP authentifié vers la plateforme, côté serveur uniquement.
// Aucune clé ne sort d'ici : ce module lit MGS_SITE_KEY / MGS_SITE_SECRET et
// ne rend que des données de présentation.

/**
 * Appel authentifié à la plateforme. Ne lève JAMAIS.
 *
 * Trois garanties tiennent ici, et chacune a déjà coûté un incident :
 *
 *  - L'ORIGINE EST VERROUILLÉE. `pathname` doit commencer par `/api/v1/` et
 *    rester sur l'hôte de `MGS_PLATFORM_URL`, et le protocole doit être HTTPS
 *    hors `localhost`. Sans ces trois contrôles, une variable d'environnement
 *    erronée — ou un `path` construit depuis une donnée entrante — ferait
 *    fuiter la clé du site vers un hôte arbitraire. Le refus est silencieux
 *    comme tout le reste, mais journalisé : c'est une faute de configuration,
 *    pas une panne passagère.
 *  - LE TEMPS EST BORNÉ. 4 s, pas plus. Une plateforme lente ne doit pas
 *    transformer le rendu d'une page de boutique en page blanche : au pire, on
 *    perd l'onglet « Mon agence », jamais le site.
 *  - LES LECTURES SONT CACHÉES, LES ÉCRITURES JAMAIS. Une boutique re-rend ses
 *    pages produits en continu ; sans cache, chaque rendu appellerait la
 *    plateforme et la limite de 60 requêtes/minute par site (`site-auth.ts`)
 *    tomberait en quelques minutes. Le cache porte une étiquette, donc la route
 *    de revalidation du site peut le purger dès que l'administration change
 *    quelque chose : le délai maximal est un filet de sécurité, pas la norme.
 *    Cette purge est IMMÉDIATE, pas « stale while revalidate » : sur une console
 *    d'administration, resservir l'ancienne valeur au premier rendu après une
 *    modification est le pire comportement possible (voir `purgerCacheAgence`).
 *
 *  - LE COURT-CIRCUIT D'ÉCHEC EST PAR CHEMIN, PAS GLOBAL. Voir
 *    `echeancesEchec`.
 *
 * Le court-circuit d'échec (fenêtre de 20 s par chemin) évite qu'une plateforme
 * en panne ne soit appelée à chaque rendu, chacun attendant 4 s le timeout. Il ne
 * s'applique qu'aux GET : une demande d'amélioration ou un signal ne doit
 * JAMAIS être absorbé par un échec précédent, sinon le commerçant croit avoir
 * envoyé et l'agence ne reçoit rien.
 */

/** Étiquette portée par toutes les lectures mises en cache, purgée par `space.ts`. */
export const ETIQUETTE_CACHE_AGENCE = "mgs-agence";

/** Cache par défaut d'une lecture : 60 s, voir `tempsRevalidation`. */
export const TEMPS_REVALIDATION_DEFAUT_S = 60;

/**
 * Lectures mises en cache, et les seules.
 *
 * `/api/v1/agency` est l'enveloppe agrégée : identité, prestations, offres,
 * abonnement et demandes. `/api/v1/agency/requests` est la même liste de
 * demandes par le chemin court, et sert aux rafraîchissements ciblés. Tout
 * appel qui en est absent est traité en `no-store`.
 */
export const CHEMINS_CACHE_LECTURE: ReadonlySet<string> = new Set([
  "/api/v1/agency",
  "/api/v1/agency/requests",
  "/api/v1/announcements",
  "/api/v1/billing",
]);

/** Fenêtre pendant laquelle l'échec d'UN chemin court-circuite ses propres GET. */
const FENETRE_ECHEC_MS = 20_000;

/**
 * Mémoire d'échec, PAR CHEMIN : chemin de l'API → instant (ms) auquel SA fenêtre
 * se referme. Bornée, et purgée à chaque armement.
 *
 * Une seule horloge globale n'aurait pas tenu : les quatre lectures ne tombent
 * pas ensemble. `/api/v1/billing` peut renvoyer 503 pendant que
 * `/api/v1/agency` répond très bien — la facturation est branchée sur un service
 * de paiement extérieur, le reste sur la base de l'agence. Une fenêtre globale
 * transformerait cette panne partielle en panneau entièrement vide : le site
 * afficherait « Vous n'avez pas encore de demande » à un commerçant qui en a
 * trois, et « aucune facture impayée » à un compte qui en a une. Le risque n'est
 * pas l'affichage d'une panne, c'est l'affichage d'un MENSONGE : une liste vide
 * se lit comme une vérité sur l'agence, et personne n'a le droit de la faire dire
 * par un écran parce qu'une autre route a échoué. D'où une mémoire par chemin :
 * une 503 sur la facturation n'a aucun droit de parler pour les annonces.
 *
 * La clé est le `pathname` VALIDÉ de la requête, jamais la chaîne reçue : sans
 * cela, `?v=2` sur la même lecture ouvrirait un second circuit et une adresse
 * non autorisée pourrait peupler la carte.
 *
 * La valeur est un instant D'EXPIRATION, pas un instant d'échec : la lecture est
 * alors une comparaison, sans arithmétique à refaire, et une entrée périmée se
 * reconnaît sans état supplémentaire.
 *
 * Elle est bornée et purgée parce qu'un runtime de production vit longtemps : un
 * runtime serverless vit quelques minutes, un runtime Node de dix ans vit plus
 * encore, et une `Map` qui ne se vide jamais est une fuite de mémoire qui ne se
 * voit qu'au moment où le process est déjà mort. La borne est large pour les
 * usages réels (les écritures ne sont que trois chemins) et étroite pour qu'un
 * chemin construit depuis une donnée ne puisse pas la faire grossir.
 */
const echeancesEchec = new Map<string, number>();

/** Nombre de chemins pouvant être en fenêtre à la fois. */
const MAX_CHEMINS_EN_FENETRE = 8;

/**
 * Ce chemin est-il encore en fenêtre d'échec ?
 *
 * L'entrée périmée est retirée au passage : c'est le seul moment où l'on sait
 * qu'elle ne sert plus, et l'ignorer laisserait les chemins morts occuper une
 * place de la carte. Un chemin absent n'est jamais en fenêtre.
 */
function enFenetreEchec(chemin: string, maintenant: number): boolean {
  const echeance = echeancesEchec.get(chemin);
  if (echeance === undefined) return false;
  if (echeance > maintenant) return true;
  echeancesEchec.delete(chemin);
  return false;
}

/**
 * Arme la fenêtre d'un chemin — et purge au passage tout ce qui est périmé.
 *
 * Si la carte reste pleine après la purge, c'est la fenêtre qui se referme le
 * plus tôt qui rend sa place : c'est elle dont l'appel attend le moins, donc
 * celle dont l'attente se remarque le moins. Le chemin que l'on vient d'armer
 * n'est jamais sacrifié — il porte l'échec le plus frais.
 */
function armerEchec(chemin: string, maintenant: number): void {
  for (const [cle, echeance] of echeancesEchec) {
    if (echeance <= maintenant) echeancesEchec.delete(cle);
  }
  echeancesEchec.set(chemin, maintenant + FENETRE_ECHEC_MS);
  if (echeancesEchec.size <= MAX_CHEMINS_EN_FENETRE) return;

  let echeanceMin: number | null = null;
  let cheminLibre = "";
  for (const [cle, echeance] of echeancesEchec) {
    if (echeanceMin === null || echeance < echeanceMin) {
      echeanceMin = echeance;
      cheminLibre = cle;
    }
  }
  if (cheminLibre !== "") echeancesEchec.delete(cheminLibre);
}

/**
 * Lecture authentifiée vers la plateforme.
 *
 * Renvoie `null` — jamais d'exception — si la plateforme est injoignable, muette,
 * en erreur, ou si les variables manquent. Les variables sont lues à CHAQUE
 * appel et non au chargement du module : Next évalue ce module une fois pour
 * toute la durée de vie d'un serveur, et une variable absente au moment du
 * build resterait `undefined` pour toujours, ce qui ferait silencieusement
 * échouer le connecteur sur un site déployé en ISR.
 */
export async function callAgency<T>(path: string, init?: RequestInit): Promise<T | null> {
  const preparatif = await preparerAppel(path, init);
  if (preparatif.pret === false) return null;
  const { requestUrl, chemin, methode, cheminValide } = preparatif;

  // Le court-circuit est consulté APRÈS le contrôle d'origine, et sur le
  // `pathname` seul : une lecture refusée doit continuer à être signalée même
  // pendant une panne, et deux écritures de la même lecture doivent partager
  // une seule fenêtre.
  if (methode === "GET" && enFenetreEchec(chemin, preparatif.maintenant)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const estLecture = methode === "GET" && CHEMINS_CACHE_LECTURE.has(chemin);
    const secondes = estLecture ? tempsRevalidation() : 0;
    try {
      const response = await fetch(requestUrl, entetesPlateforme(init, {
        signal: controller.signal,
        ...(estLecture && secondes > 0
          ? { next: { revalidate: secondes, tags: [ETIQUETTE_CACHE_AGENCE] } }
          : { cache: "no-store" }),
      }));
      // Un statut non-2xx est TOUJOURS `null` ici, y compris quand le corps
      // serait du JSON valide : le contrat de `callAgency` est « toute erreur
      // HTTP est un `null` », et une page de boutique ne doit jamais confondre
      // « la plateforme a refuse » avec « la plateforme a reponde 201 ».
      // `callAgenceAvecDetail` est la seule voie qui expose le statut.
      if (!response.ok) {
        armerEchecSiIndisponible(response.status, chemin, preparatif.maintenant);
        return null;
      }
      // Un 200 qui n'est pas du JSON est aussi une panne, pas une donnee : on
      // rend `null` sans propager, sinon une page de boutique lèverait. En
      // revanche un corps `null` sur un 200 est une REPONSE VALIDE — la
      // plateforme repond, elle n'a simplement rien a dire — donc n'arme rien :
      // sinon un seul endpoint muet priverait le site des trois autres pendant
      // toute la fenetre.
      return (await response.json().catch(() => null)) as T | null;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    // Une exception ici est soit un réseau mort, soit une configuration fausse
    // (`MGS_PLATFORM_URL` illisible, `path` malformé) — cette seconde famille
    // n'est pas une panne passagère, et la laisser couvrir vingt secondes de
    // lectures ne ferait qu'éteindre le connecteur sans rien laisser passer. On
    // n'arme donc que si un chemin a déjà été validé ; sinon seul le journal
    // parle, et il parle à chaque appel.
    if (cheminValide !== null) armerEchec(cheminValide, Date.now());
    console.error("[mgs-agency] Plateforme momentanément indisponible.", error);
    return null;
  }
}

/* ========================================================================== *
 * Appels dont le REFUS de la plateforme fait partie du résultat
 * ========================================================================== */

/** Résultat d'un appel dont on a besoin de distinguer « refusé » de « absent ». */
export type ReponsePlateforme<T> =
  | { ok: true; valeur: T }
  | { ok: false; statut: number; corps: unknown; disponible: boolean };

/**
 * Appel qui REND LE REFUS au lieu de l'effacer.
 *
 * `callAgency` transforme tout statut non-2xx en `null`, par choix et pour une
 * bonne raison : au rendu d'une page, un `null` et un refus disent la même chose,
 * « rien à afficher », et le connecteur préfère le silence à une liste fausse.
 *
 * Cette fonction casse ce contrat pour un seul usage : quand l'appel est déclenché
 * par un bouton. « Votre réponse n'a pas pu être enregistrée » et « le service est
 * momentanément indisponible » ne se distinguent pas devant un commerçant qui vient
 * d'appuyer sur « Accepter le devis » — il va believeson clic n'est pas passé, ou
 * appeler l'agence pour un devis déjà refusé. Le statut HTTP est donc conservé, et
 * `disponible` dit si la plateforme a répondu du tout.
 *
 * L'URL, l'origine, les en-têtes et le court-circuit sont ceux de `callAgency`, et
 * le passage par la MÊME fonction est ce qui garantit qu'une écriture ne peut pas
 * contourner le contrôle d'origine sous prétexte qu'elle prend un autre chemin.
 */
export async function callAgenceAvecDetail<T>(
  path: string,
  init?: RequestInit,
): Promise<ReponsePlateforme<T> | null> {
  const preparatif = await preparerAppel(path, init);
  if (preparatif.pret === false) return null;

  const { requestUrl, chemin, cheminValide } = preparatif;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(requestUrl, entetesPlateforme(init, {
        signal: controller.signal,
        cache: "no-store",
      }));
      if (!response.ok) {
        armerEchecSiIndisponible(response.status, chemin, preparatif.maintenant);
        const corps = await response.json().catch(() => null);
        return { ok: false, statut: response.status, corps, disponible: true };
      }
      const corps = (await response.json().catch(() => null)) as T | null;
      return { ok: true, valeur: corps as T };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (cheminValide !== null) armerEchec(cheminValide, Date.now());
    console.error("[mgs-agency] Plateforme momentanément indisponible.", error);
    return null;
  }
}

/* ========================================================================== *
 * Préparation commune — une seule implémentation du contrôle d'origine
 * ========================================================================== */

type Preparation =
  | {
      pret: true;
      requestUrl: URL;
      methode: string;
      chemin: string;
      cheminValide: string | null;
      maintenant: number;
    }
  | { pret: false };

/**
 * Résout l'adresse d'appel, ou refuse.
 *
 * Le refus est ici, et nulle part ailleurs : origine identique, chemin sous
 * `/api/v1/`, et HTTPS hors développement. Une seule fonction, c'est une seule
 * règle — dupliquer ce contrôle pour une écriture qui prendrait un autre chemin
 * laisserait cette écriture sans verrou.
 */
async function preparerAppel(path: string, init?: RequestInit): Promise<Preparation> {
  const platformUrl = process.env.MGS_PLATFORM_URL?.replace(/\/+$/, "");
  const siteKey = process.env.MGS_SITE_KEY;
  const siteSecret = process.env.MGS_SITE_SECRET;
  if (!platformUrl || !siteKey || !siteSecret) return { pret: false };

  const methode = init?.method?.toUpperCase() ?? "GET";
  const maintenant = Date.now();

  let requestUrl: URL;
  try {
    const baseUrl = new URL(platformUrl);
    requestUrl = new URL(path, `${baseUrl.origin}/`);
    if (
      requestUrl.origin !== baseUrl.origin
      || !requestUrl.pathname.startsWith("/api/v1/")
      || (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost")
    ) {
      console.error("[mgs-agency] Adresse de requête non autorisée.");
      return { pret: false };
    }
  } catch {
    return { pret: false };
  }

  return {
    pret: true,
    requestUrl,
    methode,
    chemin: requestUrl.pathname,
    // Réutilisé par le `catch` : une exception réseau peut survenir n'importe où
    // dans l'appel, et c'est ce chemin-là qu'il faut armer — pas une chaîne de
    // `path` qui n'a pas encore été vérifiée.
    cheminValide: requestUrl.pathname,
    maintenant,
  };
}

/** En-têtes d'authentification, communs aux deux appels. */
function entetesPlateforme(init: RequestInit | undefined, fetchOptions: RequestInit): RequestInit {
  const siteKey = process.env.MGS_SITE_KEY ?? "";
  const siteSecret = process.env.MGS_SITE_SECRET ?? "";
  return {
    ...init,
    ...fetchOptions,
    headers: {
      ...init?.headers,
      "Content-Type": "application/json",
      "X-Site-Key": siteKey,
      Authorization: `Bearer ${siteSecret}`,
    },
  };
}

/**
 * N'arme la fenêtre que pour ce qui signifie « pas maintenant ».
 *
 * Un 404 sur les annonces, un 401 sur une clé expirée ou un 400 de validation ne
 * doivent pas rendre muettes les autres lectures pendant vingt secondes : ils se
 * répéteront à chaque rendu sans rien apprendre. Un 403 est de toute façon répété
 * à chaque appel. Seuls un 5xx et un 429 disent que la plateforme ne peut pas
 * répondre maintenant.
 */
function armerEchecSiIndisponible(statut: number, chemin: string, maintenant: number): void {
  if (statut >= 500 || statut === 429) armerEchec(chemin, maintenant);
}

/**
 * Durée de mise en cache d'une lecture, en secondes.
 *
 * 60 s par défaut : assez court pour qu'une désactivation du bouton flottant
 * depuis l'administration ne laisse pas un bouton flotter cinq minutes sur un
 * site en production, assez long pour tenir la limite de 60 requêtes/minute
 * d'une boutique qui rend beaucoup de pages. `MGS_CACHE_REVALIDATE_S` permet de
 * l'allonger sur un site très bavard, et de le mettre à 0 pour ne jamais cacher.
 */
function tempsRevalidation(): number {
  const saisie = process.env.MGS_CACHE_REVALIDATE_S;
  if (!saisie) return TEMPS_REVALIDATION_DEFAUT_S;
  const brut = Number(saisie);
  if (!Number.isFinite(brut)) return TEMPS_REVALIDATION_DEFAUT_S;
  if (brut <= 0) return 0;
  return Math.min(300, Math.trunc(brut));
}
