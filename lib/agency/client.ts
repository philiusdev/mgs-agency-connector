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
 *
 * Le court-circuit d'échec (fenêtre de 20 s) évite qu'une plateforme en panne
 * ne soit appelée à chaque rendu, chacun attendant 4 s le timeout. Il ne
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

/** Fenêtre pendant laquelle un échec de lecture court-circuite les GET. */
const FENETRE_ECHEC_MS = 20_000;

let dernierEchec = 0;

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
  const platformUrl = process.env.MGS_PLATFORM_URL?.replace(/\/+$/, "");
  const siteKey = process.env.MGS_SITE_KEY;
  const siteSecret = process.env.MGS_SITE_SECRET;
  if (!platformUrl || !siteKey || !siteSecret) return null;

  const methode = init?.method?.toUpperCase() ?? "GET";
  if (methode === "GET" && Date.now() - dernierEchec < FENETRE_ECHEC_MS) return null;

  try {
    const baseUrl = new URL(platformUrl);
    const requestUrl = new URL(path, `${baseUrl.origin}/`);
    if (
      requestUrl.origin !== baseUrl.origin
      || !requestUrl.pathname.startsWith("/api/v1/")
      || (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost")
    ) {
      console.error("[mgs-agency] Adresse de requête non autorisée.");
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const estLecture = methode === "GET" && CHEMINS_CACHE_LECTURE.has(requestUrl.pathname);
    const secondes = estLecture ? tempsRevalidation() : 0;
    try {
      const response = await fetch(requestUrl, {
        ...init,
        method: methode,
        signal: controller.signal,
        headers: {
          ...init?.headers,
          "Content-Type": "application/json",
          "X-Site-Key": siteKey,
          Authorization: `Bearer ${siteSecret}`,
        },
        ...(estLecture && secondes > 0
          ? { next: { revalidate: secondes, tags: [ETIQUETTE_CACHE_AGENCE] } }
          : { cache: "no-store" }),
      });
      if (!response.ok) {
        // Seuls les statuts « la plateforme ne peut pas repondre maintenant »
        // arment la fenetre : un 404 sur les annonces, un 401 sur une cle expiree
        // ou un 400 ne doivent pas rendre muettes les trois autres lectures
        // pendant vingt secondes. Un 403 est de toute facon repete a chaque rendu.
        if (response.status >= 500 || response.status === 429) dernierEchec = Date.now();
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
    dernierEchec = Date.now();
    console.error("[mgs-agency] Plateforme momentanément indisponible.", error);
    return null;
  }
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
