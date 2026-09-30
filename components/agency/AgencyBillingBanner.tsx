import { decrirePrix } from "@/lib/agency/contrat-partage";
import type { AgencyBilling, AgencyInvoice } from "@/lib/agency/types";

/**
 * Bandeau de facturation, en haut du tableau de bord du commerçant.
 *
 * Il est volontairement SANS `"use client"` : ce bandeau n'a aucun état, aucune
 * saisie et aucun effet. Le laisser sans directive permet de le rendre depuis un
 * composant serveur, ce qui évite d'expédier du JavaScript pour deux lignes de
 * texte — et, plus important, évite le piège de la référence cliente : une
 * fonction importée depuis un module `"use client"` n'est plus une fonction
 * depuis un composant serveur, et l'appeler lèverait. `totalFactures`, définie
 * ici, est donc utilisable des deux côtés.
 *
 * Ce bandeau est HORS CONTRAT, comme `AgencyBilling` lui-même :
 * `/api/v1/billing` n'est pas sérialisé par le contrat partagé. Trois décisions
 * en découlent :
 *
 *  - RIEN DU DOMAINE. La route renvoie un `domain` qui vaut toujours `null`,
 *    aucune migration ne portant de colonne d'expiration de domaine. L'afficher
 *    produirait un « Votre nom de site expire le… » que personne ne peut
 *    vérifier, donc un avertissement permanent et faux.
 *  - RIEN DE L'ABONNEMENT. La plateforme renvoie un `subscription` redondant ;
 *    l'abonnement est déjà dans `AgencySpace.abonnement`, produit par le contrat.
 *    Le répéter ici afficherait deux fois la même formule, avec deux libellés
 *    possibles, et le commerçant ne saurait pas lequel fait foi.
 *  - AUCUN « 0 F CFA ». Le total passe par `decrirePrix`, le même chemin qu'une
 *    prestation ou qu'une demande : une somme à zéro s'écrit « Inclus ». Une
 *    soustraction suivie d'un `Intl` aurait produit « 0 F CFA », qui se lit
 *    comme une erreur de saisie.
 *
 * `billing_available === false` n'est pas une panne : c'est la réponse complète
 * que la plateforme fait quand cet espace n'a pas de facturation. Le bandeau ne
 * rend alors RIEN, parce qu'un bandeau vide attire l'œil et fait croire qu'il
 * manque une information.
 */

/** Somme des factures impayées, telle que le contrat l'écrirait. */
export function totalFactures(factures: AgencyInvoice[] | null | undefined): string {
  const liste = Array.isArray(factures) ? factures.filter(Boolean) : [];
  const centimes = liste.reduce((somme, facture) => somme + (facture.montant_cents || 0), 0);
  const devise = liste.find((facture) => typeof facture.devise === "string")?.devise ?? null;
  return decrirePrix({ montant_cents: centimes, devise }).libelle;
}

export type AgencyBillingBannerProps = {
  /** Facturation de l'espace. `null` → rien ne s'affiche, c'est voulu. */
  billing?: AgencyBilling | null;
  /** Lien de repli pour payer, quand le portail en ligne n'est pas disponible. */
  lienContact?: string | null;
};

export function AgencyBillingBanner({ billing, lienContact }: AgencyBillingBannerProps) {
  // `null` signifie que la plateforme n'a pas répondu : ni facture, ni bandeau.
  // Un bandeau « facturation indisponible » ferait crier une panne inexistante
  // sur un site par ailleurs parfaitement fonctionnel.
  if (!billing || typeof billing !== "object") return null;

  if (billing.billing_available !== true) return null;

  const impayees = Array.isArray(billing.unpaid_invoices)
    ? billing.unpaid_invoices.filter(Boolean)
    : [];
  if (impayees.length === 0) return null;

  // Le bouton suit deux conditions : la plateforme autorise le paiement en ligne,
  // ET elle fournit une vraie URL. Un portail proposé alors que le paiement est
  // désactivé enverrait le commerçant dans un cul-de-sac.
  const portal = typeof billing.portal_url === "string" ? billing.portal_url : null;
  const cible = billing.can_pay_online === true ? portal : lienContact ?? null;

  return (
    <div className="agency-banners" role="status" aria-live="polite">
      <div className="agency-banner agency-banner-warning">
        <span className="agency-banner-icone" aria-hidden="true">
          ▤
        </span>
        <span className="agency-banner-texte">
          {impayees.length === 1 ? "1 facture en attente" : `${impayees.length} factures en attente`}
          {` — ${totalFactures(impayees)}`}
        </span>
        {cible && (
          <a className="agency-bouton agency-bouton--secondaire agency-banner-action" href={cible}>
            Voir et payer
          </a>
        )}
      </div>
    </div>
  );
}