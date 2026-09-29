// Types et petits helpers du connecteur MGS.
// Volontairement sans variable d'environnement : ce fichier peut être importé
// côté serveur comme côté navigateur, sans jamais exposer une clé secrète.

export type AgencyContact = {
  name: string;
  /** Chiffres uniquement, indicatif pays inclus, ex. "22670123456". */
  whatsapp: string | null;
  email: string | null;
  website: string | null;
};

export type AgencyOffer = {
  id: string;
  title: string;
  description: string;
  whatsapp_message: string;
};

export type AgencyAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  published_at: string;
};

export type AgencyInvoice = {
  id: string;
  label: string;
  amount: number;
  due_date: string | null;
};

export type AgencySubscription = {
  service_name: string;
  next_due_date: string | null;
};

export type AgencyBilling = {
  subscription: AgencySubscription | null;
  unpaid_invoices: AgencyInvoice[];
  domain: { expires_at: string } | null;
  portal_url: string | null;
};

export type AgencySpace = {
  agency: AgencyContact;
  offers: AgencyOffer[];
  announcements: AgencyAnnouncement[];
  /** null = plateforme injoignable ou non configurée : on n'affiche rien. */
  billing: AgencyBilling | null;
};

/** Accepte uniquement http/https ; renvoie null pour toute autre valeur. */
export function safeHttpUrl(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function textOf(value: unknown, max = 400): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Numéro de téléphone réduit à ses chiffres (8 à 15 chiffres attendus). */
export function digitsOf(value: unknown): string | null {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function emailOf(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(candidate) ? candidate : null;
}

export function agencyWhatsAppUrl(whatsapp: string | null, message?: string): string | null {
  const digits = digitsOf(whatsapp);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  const text = message?.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function agencyMailtoUrl(email: string | null, subject?: string, body?: string): string | null {
  if (!email) return null;
  const params = new URLSearchParams();
  if (subject?.trim()) params.set("subject", subject.trim());
  if (body?.trim()) params.set("body", body.trim());
  const query = params.toString();
  return `mailto:${email}${query ? `?${query}` : ""}`;
}

/** "+226 70 12 34 56" à partir de "22670123456" (indicateur pays groupé à part). */
export function formatAgencyPhone(whatsapp: string | null): string {
  const digits = digitsOf(whatsapp);
  if (!digits) return "";
  const country = digits.length > 11 ? digits.slice(0, digits.length - 8) : digits.slice(0, 3);
  const local = digits.slice(country.length);
  const grouped = local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return `+${country} ${grouped}`;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "15 nov. 2026" — vide si la date est absente ou invalide. */
export function formatAgencyDate(value: unknown): string {
  const date = parseDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** "15 nov." pour l'année en cours, "15 nov. 2027" au-delà. */
export function formatAgencyDueDate(value: unknown): string {
  const date = parseDate(value);
  if (!date) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

/** Jours restants avant une date (négatif si dépassée), null si absente. */
export function daysUntil(value: unknown): number | null {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((date.getTime() - startOfDay) / 86_400_000);
}

/** "25 000 FCFA" — sans dépendre du design system de la boutique. */
export function formatAgencyAmount(value: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(value))} FCFA`;
}
