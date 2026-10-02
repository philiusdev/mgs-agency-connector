"use client";

import { useState } from "react";

import { marquerPaiementOuvert, ouvrirPaiementFacture } from "./agency-paiement-client";

/**
 * Le bouton « Régler » d'une facture.
 *
 * OUVRIR UN PAIEMENT N'EST PAS PAYER
 * ----------------------------------
 * La route renvoie une adresse de redirection, jamais un règlement : rien n'est
 * écrit côté plateforme avant la notification signée du prestataire. Ce
 * composant ne dit donc jamais « c'est payé », et il n'affiche aucune confirmation
 * de règlement — il enchaîne sur la page du prestataire.
 *
 * Deux détails qui n'ont l'air de rien et qui font le retour du prestataire :
 *
 *  - LA MENTION DE DÉPART. `marquerPaiementOuvert` écrit le numéro de la facture
 *    dans `sessionStorage` AVANT de quitter la page. Le prestataire ramène le
 *    commerçant sur le site du site entier, souvent sur une page qui n'a rien à
 *    voir avec la facturation ; sans cette trace, il revient sans un mot et ne
 *    sait pas si son clic est passé. La trace est consommée par la section
 *    Facturation du panneau.
 *  - LE BOUTON NE RESTE JAMAIS FIGÉ. `setEnCours(false)` passe par un `finally` :
 *    sans lui, une redirection refusée par le navigateur — ou une redirection
 *    qui ne part pas — laissait « Ouverture… » affiché indéfiniment, avec
 *    un bouton désactivé et aucune explication. Un état de chargement qui ne se
 *    dénoue pas est une panne, pas une attente.
 */
export function AgencyInvoicePayment({
  invoiceId,
  invoiceLabel,
  paymentAvailable,
  contactUrl,
}: {
  invoiceId: string;
  invoiceLabel: string;
  paymentAvailable: boolean;
  contactUrl: string | null;
}) {
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reglerFacture() {
    setEnCours(true);
    setMessage(null);
    try {
      const resultat = await ouvrirPaiementFacture(invoiceId);
      if (!resultat.ok) {
        setMessage(resultat.message);
        return;
      }
      marquerPaiementOuvert(invoiceLabel);
      window.location.assign(resultat.url);
    } catch {
      // `ouvrirPaiementFacture` ne lève pas ; cette garde couvre le seul reste
      // possible, la redirection elle-même.
      setMessage("Le paiement n’a pas pu être ouvert. Réessayez dans un instant.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="agency-paiement">
      {paymentAvailable ? (
        <button
          className="agency-bouton agency-bouton--secondaire agency-paiement-bouton"
          type="button"
          onClick={() => void reglerFacture()}
          disabled={enCours}
          aria-busy={enCours}
          aria-label={`Régler la facture ${invoiceLabel}`}
        >
          {enCours ? "Ouverture…" : "Régler"}
        </button>
      ) : contactUrl ? (
        <a className="agency-ancre agency-paiement-contact" href={contactUrl}>
          Contacter l’agence
        </a>
      ) : (
        <span className="agency-mention agency-mention--pied">
          Écrivez à l’agence pour le règlement.
        </span>
      )}
      {message && <p className="agency-paiement-message" role="status">{message}</p>}
    </div>
  );
}
