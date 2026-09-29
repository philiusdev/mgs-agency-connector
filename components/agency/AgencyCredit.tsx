import { agencyWebsiteUrl } from "@/lib/agency/space";

/**
 * Signature discrète affichée dans le pied de page public d'une boutique cliente.
 * Server Component : aucune donnée de l'agence n'est exposée, seule l'URL publique
 * de la vitrine est lue (variable MGS_WEBSITE_URL). Si elle manque, le texte reste
 * affiché sans lien — jamais d'erreur.
 */
export function AgencyCredit() {
  const website = agencyWebsiteUrl();
  return (
    <p className="agency-credit">
      Site créé par{" "}
      {website
        ? <a href={website} target="_blank" rel="noopener noreferrer nofollow">MindGraphixSolution</a>
        : <span>MindGraphixSolution</span>}
    </p>
  );
}
