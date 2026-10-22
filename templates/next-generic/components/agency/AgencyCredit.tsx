import { chargerIdentiteAgence } from "@/lib/agency/space";

/**
 * Crédit public de l'agence, dans le pied de page.
 *
 * C'est le seul composant du connecteur qui reste un COMPONENT SERVEUR, et ce
 * n'est pas un oubli : il lit l'identité de l'agence auprès de la plateforme,
 * par l'intermédiaire de `chargerIdentiteAgence()`. Cette fonction lit
 * `process.env` et porte la clé du site — que le navigateur ne connaît pas — et
 * si le composant était marqué `"use client"`, ces valeurs partiraient dans le
 * JavaScript de la page pour tous les visiteurs. Une adresse d'agence n'a rien
 * de secret, mais la règle du connecteur est simple : aucune variable
 * d'environnement n'est lue par un composant client. C'est le même principe
 * qui interdit à `AgencyFloatingButton` d'importer `lib/agency/space`.
 *
 * LE NOM VIENT DE LA PLATEFORME, L'ADRESSE AUSSI. C'est le même couple que
 * l'onglet « Mon agence » affiche, et pour la même raison : il est modifiable
 * depuis la console, donc il ne peut pas être écrit en dur dans le site. Un
 * nom ou une adresse figés dans le code tiendraient jusqu'au prochain
 * redéploiement, ce qui est exactement la durée de vie d'une information que
 * l'agence gère seule.
 *
 * LE TEXTE EST LE NOM, ET RIEN D'AUTRE. Ni « Site créé par », ni « Réalisé
 * par », ni le nom du site client : un pied de page qui annonce son auteur en
 * toutes lettres transforme une signature en promesse commerciale, et chaque
 * mention supplémentaire est une mention à maintenir sur les quatre sites. Le
 * nom seul fait le travail — il se lit, il se reconnaît, et il se met à jour
 * avec lui.
 *
 *  - LE TEXTE APPARAÎT TOUJOURS, LE LIEN NON. Sans adresse connue, `site_web`
 *    vaut `null` et le nom reste écrit en clair. Un pied de page vide serait
 *    une régression visible ; un lien vers « about:blank » serait un lien
 *    cassé, ce qui est pire.
 *  - AUCUNE URL ÉCRITE EN DUR. L'adresse vient de la plateforme, ou de
 *    `MGS_WEBSITE_URL` en repli : c'est un réglage, pas une constante, et le
 *    lire ici permet de changer de domaine sans redéployer le site client.
 *    `formaterSiteWeb` refuse au passage tout schéma autre que `http`/`https`,
 *    donc cette ancre ne peut pas devenir un `javascript:`.
 *  - UN SEUL LIEN SORTANT, et il est marqué. `rel="noopener noreferrer
 *    nofollow"` ferme l'accès à `window.opener` — sans quoi la vitrine de
 *    l'agence pourrait piloter l'onglet du site client — et dit aux moteurs de
 *    recherche que le crédit n'est pas un vote. Le crédit est un remerciement,
 *    pas une optimisation.
 *
 * Le composant ne lève jamais : `chargerIdentiteAgence()` replie sur
 * l'environnement si la plateforme est muette, et un pied de page qui planterait
 * à cause d'un crédit ferait tomber toute la page d'accueil.
 */

export async function AgencyCredit() {
  const identite = await chargerIdentiteAgence();
  const nom = identite.nom;
  const website = identite.site_web;
  return (
    <p className="agency-credit">
      {website ? (
        <a href={website} target="_blank" rel="noopener noreferrer nofollow">
          {nom}
        </a>
      ) : (
        <span>{nom}</span>
      )}
    </p>
  );
}
