// Signature HMAC des webhooks entrants côté site client.
//
// Copie simplifiée de plateforme/lib/webhooks/signing.ts pour validation
// des webhooks reçus de la plateforme.

import crypto from "node:crypto";

export const WEBHOOK_SIGNATURE_HEADER = "x-mgs-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-mgs-timestamp";
export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

export function signerPayload(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifierSignatureWebhook(
  secret: string,
  enTetes: Record<string, string | string[] | undefined>,
  payload: string,
): { valide: boolean; reason?: string } {
  const signatureHeader = enTetes[WEBHOOK_SIGNATURE_HEADER];
  const timestampHeader = enTetes[WEBHOOK_TIMESTAMP_HEADER];

  if (!signatureHeader || !timestampHeader) {
    return { valide: false, reason: "En-têtes de signature manquants." };
  }

  const signatureValue = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const timestampValue = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

  const timestamp = Number(timestampValue);
  if (!Number.isFinite(timestamp)) {
    return { valide: false, reason: "Horodatage invalide." };
  }

  const maintenant = Date.now();
  if (Math.abs(maintenant - timestamp) > WEBHOOK_TOLERANCE_MS) {
    return { valide: false, reason: "Horodatage hors fenêtre de tolérance." };
  }

  const match = signatureValue.match(/v1=([a-f0-9]+)/);
  if (!match) {
    return { valide: false, reason: "Format de signature invalide." };
  }

  const attendu = signerPayload(secret, `${timestampValue}.${payload}`);
  const signatureReçue = match[1];

  if (signatureReçue.length !== attendu.length) {
    return { valide: false, reason: "Signature invalide." };
  }

  const estValide = crypto.timingSafeEqual(
    Buffer.from(signatureReçue, "hex"),
    Buffer.from(attendu, "hex"),
  );

  return { valide: estValide, reason: estValide ? undefined : "Signature ne correspond pas." };
}