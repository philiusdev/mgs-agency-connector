"use client";

import { useState } from "react";
import {
  agencyMailtoUrl,
  agencyWhatsAppUrl,
  formatAgencyDate,
  formatAgencyPhone,
  type AgencyAnnouncement,
  type AgencyContact,
  type AgencyOffer,
  type AgencySpace,
} from "@/lib/agency/types";

/**
 * Onglet « Mon agence » du tableau de bord du commerçant.
 *
 * Le composant reçoit un `space` déjà chargé côté serveur : ni la clé du site
 * ni l'adresse de la plateforme ne passent jamais par le navigateur. Si l'espace
 * est null — plateforme injoignable, clé absente, migration pas encore
 * appliquée — rien ne s'affiche et le dashboard reste utilisable.
 */
export function AgencyPanel({ space, requesterEmail }: { space: AgencySpace | null; requesterEmail?: string }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  if (!space) return null;

  const { agency, offers, announcements } = space;
  const whatsappHref = agencyWhatsAppUrl(agency.whatsapp, "Bonjour, j’ai une question au sujet de mon site.");
  const emailHref = agencyMailtoUrl(agency.email, "Question au sujet de mon site");

  async function sendRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (text.length < 10) {
      setError("Écrivez quelques mots pour expliquer votre demande.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/agency/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, requesterEmail }),
      });
      if (!response.ok) throw new Error();
      setMessage("");
      setSent(true);
    } catch {
      setError("Votre demande n’a pas pu être envoyée. Réessayez dans un instant.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="agency-panel">
      <section className="agency-section">
        <h2 className="agency-section-title">Votre agence</h2>
        <p className="agency-section-lead">
          {agency.name} s’occupe de votre site. Vous pouvez l’écrire directement, sans chercher un numéro.
        </p>
        <div className="agency-contact">
          {whatsappHref && <a className="agency-contact-card" href={whatsappHref} target="_blank" rel="noopener noreferrer"><span className="agency-contact-icon" aria-hidden="true">💬</span><span><small>WhatsApp</small><strong>{formatAgencyPhone(agency.whatsapp)}</strong></span></a>}
          {emailHref && <a className="agency-contact-card" href={emailHref}><span className="agency-contact-icon" aria-hidden="true">✉️</span><span><small>Email</small><strong>{agency.email}</strong></span></a>}
        </div>
      </section>

      {announcements.length > 0 && (
        <section className="agency-section">
          <h2 className="agency-section-title">Nouvelles de votre agence</h2>
          <div className="agency-list">
            {announcements.map((announcement) => <AnnouncementCard key={announcement.id} announcement={announcement} />)}
          </div>
        </section>
      )}

      <section className="agency-section">
        <h2 className="agency-section-title">Demander une amélioration</h2>
        {sent ? (
          <p className="agency-feedback-ok" role="status">Votre demande a été transmise. {agency.name} vous répondra bientôt.</p>
        ) : (
          <form className="agency-form" onSubmit={sendRequest}>
            <label htmlFor="agency-request">Qu’aimeriez-vous ajouter ou améliorer sur votre site ?</label>
            <textarea
              id="agency-request"
              rows={4}
              maxLength={2000}
              required
              placeholder="Par exemple : je voudrais ajouter mon numéro WhatsApp en bas de chaque produit."
              value={message}
              onChange={(event) => { setMessage(event.target.value); setSent(false); }}
            />
            {error && <p className="agency-feedback-error" role="alert">{error}</p>}
            <button className="agency-button" type="submit" disabled={sending || message.trim().length < 10}>
              {sending ? "Envoi…" : "Envoyer ma demande"}
            </button>
          </form>
        )}
      </section>

      {offers.length > 0 && (
        <section className="agency-section">
          <h2 className="agency-section-title">Nos autres services</h2>
          <p className="agency-section-lead">Pour faire grandir votre boutique.</p>
          <div className="agency-offers">
            {offers.map((offer) => <OfferCard key={offer.id} offer={offer} agency={agency} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function AnnouncementCard({ announcement }: { announcement: AgencyAnnouncement }) {
  return (
    <article className={`agency-card agency-card-${announcement.severity}`}>
      <h3>{announcement.title}</h3>
      {announcement.body && <p>{announcement.body}</p>}
      {announcement.published_at && <small>{formatAgencyDate(announcement.published_at)}</small>}
    </article>
  );
}

function OfferCard({ offer, agency }: { offer: AgencyOffer; agency: AgencyContact }) {
  const href = agencyWhatsAppUrl(agency.whatsapp, offer.whatsapp_message || `Bonjour, je souhaite des informations sur « ${offer.title} ».`);
  return (
    <article className="agency-card agency-offer">
      <h3>{offer.title}</h3>
      <p>{offer.description}</p>
      {href && <a className="agency-button agency-button-secondary" href={href} target="_blank" rel="noopener noreferrer">En savoir plus</a>}
    </article>
  );
}
