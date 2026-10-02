import type { AgencyBilling } from "@/lib/agency/types";

/**
 * Bandeau de facturation, en haut du tableau de bord du commerçant.
 *
 * Il est volontairement SANS `"use client"` : ce bandeau n'a aucun état, aucune
 * saisie et aucun effet. Le laisser sans directive permet de le rendre depuis un
 * composant serveur, ce qui évite d'expédier du JavaScript pour deux lignes de
 * texte — et, plus important, évite le piège de la référence cliente : une
 * fonction importée depuis un module `"use client"` n'est plus une fonction
 * depuis un composant serveur, et l'appeler lèverait. Le bandeau ne calcule aucun
 * état de paiement.
 *
 * Ce bandeau est HORS CONTRAT, comme `AgencyBilling` lui-même :
 * `/api/v1/billing` n'est pas sérialisé par le contrat partagé. Trois décisions
 * en découlent :
 *
 *  - RIEN DU DOMAINE. La route renvoie un `domain` qui vaut toujours `null`,
 *    aucune migration ne portant de colonne d'expiration de domaine. L'afficher
 *    produirait un « Votre nom de site expire le… » que personne ne peut
 *    vérifier, donc un avertissement permanent et faux.
 *  - L'ABONNEMENT affiché reste celui du contrat agence. Le résumé ne reformule
 *    aucun statut ni forfait.
 *  - AUCUN TOTAL MULTIDEVISE. Chaque facture porte sa devise propre; le résumé
 *    compte les factures et laisse leurs montants détaillés au panneau.
 *
 * `billing_available === false` n'est pas une panne : c'est la réponse complète
 * que la plateforme fait quand cet espace n'a pas de facturation. Le bandeau ne
 * rend alors RIEN, parce qu'un bandeau vide attire l'œil et fait croire qu'il
 * manque une information.
 *
 * L'ABSENCE DE RÉPONSE, EN REVANCHE, SE DIT
 * -------------------------------------------
 * `billing === null` a deux significations, et le connecteur les confondait.
 * La plateforme peut renvoyer une réponse complète qui dit « cet espace n'a pas
 * de facturation » : là, ne rien afficher est juste, le commerçant n'a rien à
 * régler. Ou bien la lecture n'a pas abouti du tout — clé absente, 503, réseau
 * mort — et dans ce cas le silence était un MENSONGE : le bandeau disparaissait
 * chez un commerçant qui a peut-être trois factures impayées, et le tableau de
 * bord affichait « 0 facture à régler » alors que personne n'avait rien compté.
 * `space.indisponibles` distingue déjà ces deux cas ; le bandeau le reçoit donc
 * par `indisponible`, et dit ce qu'il sait : la facturation n'a pas pu être
 * consultée, ce qui est une information et non une catastrophe.
 *
 * Le ton reste celui d'un `agency-banner-info`, jamais celui d'une alerte : une
 * lecture ratée de la plateforme ne doit pas s'afficher comme une facture
 * impayée à côté d'un vrai avertissement de paiement.
 */

export type AgencyBillingBannerProps = {
  /** Facturation de l'espace. `null` → rien ne s'affiche, c'est voulu. */
  billing?: AgencyBilling | null;
  /** Contact de l'agence si la plateforme demande un règlement manuel. */
  lienContact?: string | null;
  /**
   * La plateforme n'a pas pu servir `/api/v1/billing`.
   *
   * Vient de `space.indisponibles`, jamais recalculé ici : le composant lit un
   * fait, il ne le décide pas. `false` avec `billing === null` laisse le bandeau
   * se taire, comme avant.
   */
  indisponible?: boolean;
};

export function AgencyBillingBanner({ billing, lienContact, indisponible }: AgencyBillingBannerProps) {
  // Aucune réponse de la plateforme sur la facturation : le bandeau le dit
  // plutôt que de disparaître. Sans cela, un commerçant ayant une facture
  // impayée voyait un tableau de bord parfaitement vert et conclut qu'il n'avait
  // rien à régler.
  if (!billing || typeof billing !== "object") {
    if (indisponible !== true) return null;
    return (
      <div className="agency-banners" role="status" aria-live="polite">
        <div className="agency-banner agency-banner-info">
          <span className="agency-banner-icone" aria-hidden="true">
            ▤
          </span>
          <span className="agency-banner-texte">
            Facturation indisponible : les factures de cet espace n’ont pas pu être
            consultées. Réessayez dans un instant.
          </span>
        </div>
      </div>
    );
  }

  if (billing.billing_available !== true) return null;

  const impayees = Array.isArray(billing.unpaid_invoices)
    ? billing.unpaid_invoices.filter(Boolean)
    : [];
  if (impayees.length === 0) return null;

  return (
    <div className="agency-banners" role="status" aria-live="polite">
      <div className="agency-banner agency-banner-warning">
        <span className="agency-banner-icone" aria-hidden="true">
          ▤
        </span>
        <span className="agency-banner-texte">
          {impayees.length === 1 ? "1 facture à régler" : `${impayees.length} factures à régler`}
        </span>
        {billing.can_pay_online !== true && lienContact && (
          <a className="agency-bouton agency-bouton--secondaire agency-banner-action" href={lienContact}>
            Contacter l’agence
          </a>
        )}
      </div>
    </div>
  );
}
