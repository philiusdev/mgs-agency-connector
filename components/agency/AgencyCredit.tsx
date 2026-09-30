import { agencyWebsiteUrl } from "@/lib/agency/space";

/**
 * Crédit public « Site créé par MindGraphixSolution », dans le pied de page.
 *
 * C'est le seul composant du connecteur qui reste un COMPONENT SERVEUR, et ce
 * n'est pas un oubli : il lit `MGS_WEBSITE_URL` à travers `agencyWebsiteUrl()`.
 * Cette fonction lit `process.env`, que le navigateur ne connaît pas — et si
 * elle était marquée `"use client"`, la valeur partirait dans le JavaScript de la
 * page pour tous les visiteurs. Une adresse d'agence n'a rien de secret, mais la
 * règle du connecteur est simple : aucune variable d'environnement n'est lue par
 * un composant client. C'est le même principe qui interdit à
 * `AgencyFloatingButton` d'importer `lib/agency/space`.
 *
 * Trois règles tenues ici, toutes visibles par le public :
 *
 *  - LE TEXTE APPARAÎT TOUJOURS, LE LIEN NON. Sans `MGS_WEBSITE_URL`, ou avec une
 *    URL invalide, `agencyWebsiteUrl` renvoie `null` et le nom reste écrit en
 *    clair. Un pied de page vide serait une régression visible ; un lien vers
 *    « about:blank » serait un lien cassé, ce qui est pire.
 *  - AUCUNE URL ÉCRITE EN DUR. L'adresse de la vitrine est un réglage, pas une
 *    constante : la lire ici permet de changer de domaine sans redéployer le
 *    site client. `formaterSiteWeb` refuse au passage tout schéma autre que
 *    `http`/`https`, donc cette ancre ne peut pas devenir un `javascript:`.
 *  - UN SEUL LIEN SORTANT, et il est marqué. `rel="noopener noreferrer
 *    nofollow"` ferme l'accès à `window.opener` — sans quoi la vitrine de
 *    l'agence pourrait piloter l'onglet du site client — et dit aux moteurs de
 *    recherche que le crédit n'est pas un vote. Le crédit est un remerciement,
 *    pas une optimisation.
 *
 * Le composant ne lève jamais : `agencyWebsiteUrl()` lit une variable
 * d'environnement et passe le résultat au contrat, qui renvoie `null` pour tout
 * ce qui n'est pas une URL. Un pied de page qui planterait à cause d'un crédit
 * ferait tomber toute la page d'accueil.
 */

export function AgencyCredit() {
  const website = agencyWebsiteUrl();
  return (
    <p className="agency-credit">
      Site créé par{" "}
      {website ? (
        <a href={website} target="_blank" rel="noopener noreferrer nofollow">
          MindGraphixSolution
        </a>
      ) : (
        <span>MindGraphixSolution</span>
      )}
    </p>
  );
}