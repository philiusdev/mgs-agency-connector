"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  LIBELLE_PRIX_INCLUS,
  decrirePrix,
  formaterPeriodeFacturation,
} from "@/lib/agency/contrat-partage";
import type { AgencyBilling, AgencyBillingPlan } from "@/lib/agency/types";

import { AgencyInvoicePayment } from "./AgencyInvoicePayment";
import { Mention } from "./agency-commun";

type ReponseSouscription = {
  created: boolean;
  invoice_id: string | null;
  invoice_number: string | null;
  payment_required: boolean;
  can_pay_online: boolean;
  billing_message: string | null;
};

export function AgencyForfaits({
  facturation,
  indisponible,
  lienContact,
  suffixe,
}: {
  facturation: AgencyBilling | null;
  indisponible: boolean;
  lienContact: string | null;
  suffixe: string;
}) {
  const router = useRouter();
  const [actualisation, actualiserTransition] = useTransition();
  const [forfaitEnCours, setForfaitEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reponse, setReponse] = useState<ReponseSouscription | null>(null);
  const verrouSouscription = useRef(false);

  if (!facturation) {
    if (!indisponible) return null;
    return (
      <section className="agency-section" aria-labelledby={"agency-titre-forfaits-" + suffixe}>
        <h2 className="agency-section-titre" id={"agency-titre-forfaits-" + suffixe}>Forfaits</h2>
        <Mention ton="attention">
          Les forfaits n’ont pas pu être consultés. Réessayez dans un instant.
        </Mention>
      </section>
    );
  }
  if (facturation.billing_available !== true) return null;

  async function choisirForfait(forfait: AgencyBillingPlan) {
    if (verrouSouscription.current) return;
    verrouSouscription.current = true;
    setForfaitEnCours(forfait.id);
    setErreur(null);
    setReponse(null);
    try {
      const response = await fetch("/api/agency/billing/abonnement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MGS-Revalidate": "choix-forfait",
        },
        body: JSON.stringify({ plan_id: forfait.id }),
        cache: "no-store",
      });
      const corps = await response.json().catch(() => null) as {
        created?: unknown;
        invoice?: { id?: unknown; number?: unknown } | null;
        payment_required?: unknown;
        can_pay_online?: unknown;
        billing_message?: unknown;
        error?: unknown;
      } | null;

      if (!response.ok) {
        throw new Error(
          typeof corps?.error === "string" && corps.error.trim()
            ? corps.error.trim()
            : "Le forfait n’a pas pu être sélectionné. Réessayez dans un instant.",
        );
      }
      if (
        typeof corps?.created !== "boolean"
        || typeof corps.payment_required !== "boolean"
        || typeof corps.can_pay_online !== "boolean"
      ) {
        throw new Error("La réponse de facturation est incomplète. Contactez l’agence.");
      }

      setReponse({
        created: corps.created,
        invoice_id: typeof corps.invoice?.id === "string" ? corps.invoice.id : null,
        invoice_number: typeof corps.invoice?.number === "string" ? corps.invoice.number : null,
        payment_required: corps.payment_required,
        can_pay_online: corps.can_pay_online,
        billing_message: typeof corps.billing_message === "string" ? corps.billing_message : null,
      });
      actualiserTransition(() => router.refresh());
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le forfait n’a pas pu être sélectionné.");
    } finally {
      verrouSouscription.current = false;
      setForfaitEnCours(null);
    }
  }

  const forfaits = Array.isArray(facturation.plans) ? facturation.plans : [];
  const selectionBloquee =
    facturation.subscription !== null && facturation.subscription.status !== "canceled";

  return (
    <section className="agency-section" aria-labelledby={`agency-titre-forfaits-${suffixe}`}>
      <h2 className="agency-section-titre" id={`agency-titre-forfaits-${suffixe}`}>Forfaits</h2>

      {!facturation.plans_disponibles ? (
        <Mention ton="attention">
          La liste des forfaits n’est pas disponible sur cette version de la plateforme.
          {lienContact ? <> Consultez l’agence pour connaître les formules disponibles.</> : " Réessayez plus tard."}
        </Mention>
      ) : forfaits.length === 0 ? (
        <p className="agency-section-intro">Aucun forfait disponible pour le moment.</p>
      ) : (
        <>
          {facturation.plans_truncated && (
            <Mention ton="attention">
              La liste des forfaits est partielle. Contactez l’agence pour voir toutes les formules.
            </Mention>
          )}
          {selectionBloquee && (
            <p className="agency-section-intro">
              Cet espace a déjà un abonnement. Pour modifier le forfait, contactez l’agence.
              {lienContact && <> <a className="agency-ancre" href={lienContact}>La contacter</a>.</>}
            </p>
          )}
          <ul className="agency-forfaits">
            {forfaits.map((forfait) => (
              <li className="agency-forfait" key={forfait.id}>
                <div className="agency-forfait-entete">
                  <h3 className="agency-forfait-nom">{forfait.name}</h3>
                  <strong className="agency-forfait-tarif">{prixForfait(forfait)}</strong>
                </div>
                {forfait.description && <p className="agency-forfait-description">{forfait.description}</p>}
                {forfait.trial_days > 0 && (
                  <p className="agency-forfait-essai">Essai de {forfait.trial_days} jours</p>
                )}
                {forfait.features.length > 0 && (
                  <ul className="agency-forfait-options">
                    {forfait.features.map((feature, index) => <li key={`${index}-${feature}`}>{feature}</li>)}
                  </ul>
                )}
                {!selectionBloquee && !reponse && (
                  <button
                    className="agency-bouton agency-bouton--secondaire agency-forfait-choisir"
                    type="button"
                    onClick={() => void choisirForfait(forfait)}
                    disabled={forfaitEnCours !== null}
                    aria-busy={forfaitEnCours === forfait.id}
                  >
                    {forfaitEnCours === forfait.id ? "Enregistrement…" : "Choisir ce forfait"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {erreur && <p className="agency-paiement-message" role="alert">{erreur}</p>}
      {reponse && (
        <div className="agency-forfait-retour" role="status" aria-live="polite">
          <p className="agency-forfait-retour-texte">
            {reponse.created ? "Le forfait a été enregistré." : "Cette souscription existe déjà."}
            {reponse.billing_message ? ` ${reponse.billing_message}` : ""}
          </p>
          {reponse.payment_required && reponse.invoice_id && (
            <AgencyInvoicePayment
              invoiceId={reponse.invoice_id}
              invoiceLabel={reponse.invoice_number ?? "sans numéro"}
              paymentAvailable={reponse.can_pay_online}
              contactUrl={lienContact}
            />
          )}
          {actualisation && (
            <p className="agency-section-intro" role="status">
              Actualisation de l’abonnement…
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function prixForfait(forfait: AgencyBillingPlan): string {
  const prix = decrirePrix({ montant_cents: forfait.price_cents, devise: forfait.currency }).libelle;
  const periode = formaterPeriodeFacturation(forfait.billing_interval);
  return periode && prix !== LIBELLE_PRIX_INCLUS ? `${prix} / ${periode}` : prix;
}
