// Monitoring côté connecteur.
// Envoie des métriques de santé vers la plateforme.

import type { DiagnosticConnexion } from "./health";
import { construireDiagnostic } from "./health";

export type MetriquesConnecteur = {
  siteId: string;
  timestamp: string;
  diagnostic: DiagnosticConnexion;
  uptime: number;
};

/**
 * Collecte et formate les métriques du connecteur pour envoi à la plateforme.
 */
export function collecterMetriquesConnecteur(siteId: string): MetriquesConnecteur {
  const diagnostic = construireDiagnostic();

  return {
    siteId,
    timestamp: new Date().toISOString(),
    diagnostic,
    uptime: process.uptime ? process.uptime() : 0,
  };
}

/**
 * Envoie les métriques vers la plateforme.
 */
export async function envoyerMetriquesPlateforme(
  platformUrl: string,
  siteKey: string,
  siteSecret: string,
  metriques: MetriquesConnecteur
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${platformUrl}/api/v1/monitoring/site-metrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Site-Key": siteKey,
        Authorization: `Bearer ${siteSecret}`,
      },
      body: JSON.stringify(metriques),
      signal: AbortSignal.timeout(5000),
    });

    return { ok: response.ok };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
