// Limiteur d'appels en mémoire, pour les routes qui écrivent chez l'agence.
// Rien n'est stocké : le décompte repart à zéro si le processus redémarre.

/**
 * Un limiteur d'appels, en mémoire, sur une fenêtre glissante.
 *
 * Il ne protège PAS la plateforme : elle a déjà son propre plafond de 60
 * requêtes par minute et par site (`site-auth.ts`). Il protège deux choses que
 * ce plafond-là ne couvre pas :
 *
 *  - LE QUOTA PARTAGÉ. Une boutique qui rend beaucoup de pages consomme déjà
 *    une partie de ses 60 requêtes par minute sur les lectures mises en cache.
 *    Une rafale d'envois depuis l'onglet « Mon agence » ne doit pas pouvoir
 *    retirer à la boutique la possibilité de charger son propre catalogue —
 *    c'est le symptôme « j'ai cliqué, le site ne marche plus » que ce
 *    limiteur existe pour éviter.
 *  - LE MESSAGE UTILE. Dix envois refusés par la plateforme deviennent dix
 *    `503` — « service indisponible » — donc dix messages d'attente. Un `429`
 *    avec un `Retry-After` dit au formulaire de réessayer dans un moment, et
 *    dit à l'administrateur que quelque chose boucle.
 *
 * Trois limites assumées :
 *
 *  - C'est UN COMPTEUR PAR PROCESSUS. Sur une plateforme sans état (une fonction
 *    serverless), chaque instance a le sien : la limite réelle est donc
 *    approximative. C'est acceptable pour un confort d'usage, et c'est pourquoi
 *    la vraie barrière reste la session : sans elle, il n'y a rien à limiter.
 *  - L'ADRESSE N'EST PAS FIABLE. La clé anonyme vient de `X-Forwarded-For`,
 *    qu'un client peut écrire. Un attaquant sans session peut donc tourner la
 *    clé — il ne peut PAS écrire chez l'agence sans email vérifié, et c'est ce
 *    qui compte. On ne prétend pas le contraire.
 *  - RIEN N'EST PERSISTÉ. Au redémarrage, le compteur repart à zéro. Un flood
 *    doit pouvoir être oublié ; un compteur qui survit à un déploiement finit
 *    toujours par bloquer un commerçant légitime.
 */

/** Fenêtre glissante, en millisecondes. */
export const FENETRE_LIMITE_MS = 60_000;

/** Nombre d'appels autorisés par fenêtre pour une même clé. */
export const APPELS_PAR_FENETRE = 5;

/**
 * Plafond de clés suivies. Un attaquant sans session qui forge une adresse à
 * chaque appel ne doit pas non plus remplir la mémoire du processus : au-delà,
 * on repart de zéro plutôt que de grossir.
 */
const MAX_CLES = 512;

/** Instants des appels acceptés, par clé. `Map` : l'ordre d'insertion suffit. */
const appels = new Map<string, number[]>();

/** Ce que le compteur répond à la route. */
export type DecisionLimite =
  | { autorise: true; restant: number; reessayerDansS: number }
  | { autorise: false; restant: 0; reessayerDansS: number };

/**
 * Compte un appel et dit s'il passe.
 *
 * `cle` identifie l'appelant : l'identifiant de session s'il y en a une,
 * l'adresse sinon. La fenêtre est glissante et non un compteur remis à zéro
 * chaque minute : un attaquant qui enverrait 5 appels à 59 s et 5 à 61 s
 * passerait d'un compteur naïf.
 */
export function autoriserAppel(cle: string): DecisionLimite {
  const maintenant = Date.now();
  const debutFenetre = maintenant - FENETRE_LIMITE_MS;

  if (appels.size >= MAX_CLES) appels.clear();
  const precedents = (appels.get(cle) ?? []).filter((instant) => instant > debutFenetre);

  if (precedents.length >= APPELS_PAR_FENETRE) {
    // La fenêtre se referme sur le plus vieux appel encore compté : c'est le
    // premier instant où une place se libère, donc le seul délai honnête.
    const plusAncien = Math.min(...precedents);
    const reessayerDansS = Math.max(1, Math.ceil((plusAncien + FENETRE_LIMITE_MS - maintenant) / 1000));
    appels.set(cle, precedents);
    return { autorise: false, restant: 0, reessayerDansS };
  }

  precedents.push(maintenant);
  appels.set(cle, precedents);
  return {
    autorise: true,
    restant: APPELS_PAR_FENETRE - precedents.length,
    reessayerDansS: APPELS_PAR_FENETRE,
  };
}

/**
 * En-têtes de la décision, pour que l'appelant puisse anticiper au lieu de
 * deviner. `Retry-After` n'est posé que sur un refus : annoncer une attente
 * alors qu'il n'y a rien à attendre rendrait notre limiteur illisible.
 */
export function entetesLimite(decision: DecisionLimite): Record<string, string> {
  const entetes: Record<string, string> = {
    "X-Limite-Appels": String(APPELS_PAR_FENETRE),
    "X-Limite-Reste": String(decision.restant),
  };
  if (!decision.autorise) entetes["Retry-After"] = String(decision.reessayerDansS);
  return entetes;
}

/**
 * Clé de comptage pour un appelant.
 *
 * Une session prime : elle est stable et vérifiée. Sans session, l'adresse
 * d'origine est le seul reste, et `X-Forwarded-For` peut contenir une chaîne
 * de cinq valeurs — seule la première compte, bornée, et une valeur illisible
 * retombe sur une clé unique qui limite tout le monde ensemble. Limiter tout
 * le monde ensemble est plus strict, pas moins.
 */
export function cleAppel(session: { utilisateurId: string } | null, request: Request): string {
  if (session) return `session:${session.utilisateurId}`;
  const brut = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "")
    .split(",")[0]!
    .trim()
    .slice(0, 64);
  return `adresse:${brut || "inconnue"}`;
}