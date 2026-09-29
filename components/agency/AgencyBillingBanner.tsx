"use client";

import {
  agencyMailtoUrl,
  agencyWhatsAppUrl,
  daysUntil,
  formatAgencyAmount,
  formatAgencyDueDate,
  type AgencyBilling,
  type AgencyContact,
} from "@/lib/agency/types";

/**
 * Bandeau de facturation affiché en haut du tableau de bord du commerçant.
 * Plateforme injoignable (billing = null) ou aucun renseignement : rien ne s'affiche.
 */
export function AgencyBillingBanner({ billing, agency }: { billing: AgencyBilling | null; agency: AgencyContact }) {
  if (!billing) return null;

  const unpaid = billing.unpaid_invoices;
  const unpaidTotal = unpaid.reduce((total, invoice) => total + invoice.amount, 0);
  const domainDays = daysUntil(billing.domain?.expires_at);
  const domainExpiring = Boolean(billing.domain) && domainDays !== null && domainDays >= 0 && domainDays <= 30;
  const hasSubscription = Boolean(billing.subscription);

  if (!hasSubscription && !unpaid.length && !billing.domain) return null;

  const payHref = billing.portal_url
    ?? agencyWhatsAppUrl(agency.whatsapp, "Bonjour, j'ai une facture en attente. Comment la payer ?")
    ?? agencyMailtoUrl(agency.email, "Facture en attente", "Bonjour, j'ai une facture en attente. Comment la payer ?");

  return (
    <div className="agency-banners">
      {billing.subscription && (
        <p className="agency-subscription">
          Votre abonnement&nbsp;: <strong>{billing.subscription.service_name}</strong>
          {billing.subscription.next_due_date
            ? <> — prochaine échéance le <strong>{formatAgencyDueDate(billing.subscription.next_due_date)}</strong></>
            : null}
        </p>
      )}

      {unpaid.length > 0 && (
        <div className="agency-banner agency-banner-warning" role="status">
          <span aria-hidden="true">🧾</span>
          <span>
            {unpaid.length === 1 ? "1 facture en attente" : `${unpaid.length} factures en attente`}
            {unpaidTotal > 0 ? ` — ${formatAgencyAmount(unpaidTotal)}` : ""}
          </span>
          {payHref && <a className="agency-banner-action" href={payHref}>Voir et payer</a>}
        </div>
      )}

      {domainExpiring && billing.domain && (
        <div className="agency-banner agency-banner-info" role="status">
          <span aria-hidden="true">🌐</span>
          <span>Votre nom de site expire le {formatAgencyDueDate(billing.domain.expires_at)} — pensez à le renouveler</span>
        </div>
      )}

      {unpaid.length === 0 && !domainExpiring && (
        <p className="agency-banner agency-banner-ok" role="status">Tout est à jour ✓</p>
      )}
    </div>
  );
}
