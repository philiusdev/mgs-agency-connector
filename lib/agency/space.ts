// Charge, côté serveur uniquement, tout ce que l'onglet « Mon agence » affiche.
// Aucune clé secrète ne sort d'ici : ce module lit MGS_SITE_KEY / MGS_SITE_SECRET
// et ne renvoie que des données de présentation au navigateur.

import { callAgency } from "./client";
import {
  digitsOf,
  emailOf,
  safeHttpUrl,
  textOf,
  type AgencyAnnouncement,
  type AgencyBilling,
  type AgencyContact,
  type AgencyInvoice,
  type AgencyOffer,
  type AgencySpace,
} from "./types";

const DEFAULT_AGENCY_NAME = "MindGraphixSolution";
const MAX_ANNOUNCEMENTS = 5;
const MAX_OFFERS = 6;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function severityOf(value: unknown): AgencyAnnouncement["severity"] {
  const severity = textOf(value, 20);
  return severity === "warning" || severity === "critical" ? severity : "info";
}

function normalizeAnnouncements(value: unknown): AgencyAnnouncement[] {
  return asList(value)
    .map((item, index) => {
      const record = asRecord(item);
      const title = textOf(record?.title, 160);
      if (!title) return null;
      return {
        id: textOf(record?.id, 60) || `annonce-${index}`,
        title,
        body: textOf(record?.body, 600),
        severity: severityOf(record?.severity),
        published_at: textOf(record?.starts_at ?? record?.published_at, 40),
      } satisfies AgencyAnnouncement;
    })
    .filter((item): item is AgencyAnnouncement => item !== null)
    .slice(0, MAX_ANNOUNCEMENTS);
}

function normalizeOffers(value: unknown): AgencyOffer[] {
  return asList(value)
    .map((item, index) => {
      const record = asRecord(item);
      const title = textOf(record?.title, 120);
      const description = textOf(record?.description, 280);
      if (!title || !description) return null;
      const message = textOf(record?.whatsapp_message, 500)
        || `Bonjour ${DEFAULT_AGENCY_NAME}, je souhaite des informations sur « ${title} ».`;
      return {
        id: textOf(record?.id, 60) || `offre-${index}`,
        title,
        description,
        whatsapp_message: message,
      } satisfies AgencyOffer;
    })
    .filter((item): item is AgencyOffer => item !== null)
    .slice(0, MAX_OFFERS);
}

function normalizeInvoices(value: unknown): AgencyInvoice[] {
  return asList(value)
    .map((item, index) => {
      const record = asRecord(item);
      const rawAmount = Number(record?.amount ?? record?.amount_fcfa ?? 0);
      const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? Math.round(rawAmount) : 0;
      const label = textOf(record?.label ?? record?.title ?? record?.description, 120);
      if (!amount && !label) return null;
      return {
        id: textOf(record?.id, 60) || `facture-${index}`,
        label: label || "Facture",
        amount,
        due_date: textOf(record?.due_date, 40) || null,
      } satisfies AgencyInvoice;
    })
    .filter((item): item is AgencyInvoice => item !== null);
}

function normalizeBilling(value: unknown): AgencyBilling | null {
  const record = asRecord(value);
  if (!record) return null;
  const subscriptionRecord = asRecord(record.subscription);
  const service = textOf(subscriptionRecord?.service_name ?? subscriptionRecord?.name, 80);
  const domainRecord = asRecord(record.domain);
  const domainExpiry = textOf(domainRecord?.expires_at, 40);
  return {
    subscription: service
      ? { service_name: service, next_due_date: textOf(subscriptionRecord?.next_due_date, 40) || null }
      : null,
    unpaid_invoices: normalizeInvoices(record.unpaid_invoices),
    domain: domainExpiry ? { expires_at: domainExpiry } : null,
    portal_url: safeHttpUrl(record.portal_url),
  };
}

/** URL du site vitrine de l'agence — sert au crédit discret du pied de page. */
export function agencyWebsiteUrl(): string | null {
  return safeHttpUrl(process.env.MGS_WEBSITE_URL);
}

export async function loadAgencySpace(): Promise<AgencySpace> {
  const local: AgencyContact = {
    name: textOf(process.env.MGS_AGENCY_NAME, 80) || DEFAULT_AGENCY_NAME,
    whatsapp: digitsOf(process.env.MGS_AGENCY_WHATSAPP),
    email: emailOf(process.env.MGS_AGENCY_EMAIL),
    website: agencyWebsiteUrl(),
  };

  const [agencyResult, billingResult, announcementsResult] = await Promise.all([
    callAgency<unknown>("/api/v1/agency"),
    callAgency<unknown>("/api/v1/billing"),
    callAgency<unknown>("/api/v1/announcements"),
  ]);

  const platform = asRecord(agencyResult);

  return {
    agency: {
      name: textOf(platform?.name, 80) || local.name,
      whatsapp: digitsOf(platform?.whatsapp) ?? local.whatsapp,
      email: emailOf(platform?.email) ?? local.email,
      website: safeHttpUrl(platform?.website) ?? local.website,
    },
    offers: normalizeOffers(platform?.offers),
    announcements: normalizeAnnouncements(announcementsResult),
    billing: normalizeBilling(billingResult),
  };
}
