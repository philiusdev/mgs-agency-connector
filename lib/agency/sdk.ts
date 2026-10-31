// SDK client MGS — Intégration simplifiée pour les sites clients.
//
// Cette classe fournit une API JavaScript/TypeScript simple pour se connecter
// à la plateforme MGS, gérer l'espace agence, créer des demandes, envoyer des
// messages et recevoir des événements en temps réel.
//
// Exemple d'utilisation :
//
//   import { MGSClient } from "@/lib/agency/sdk";
//   const mgs = new MGSClient({
//     wsUrl: process.env.MGS_WS_URL,
//     siteKey: process.env.MGS_SITE_KEY,
//     siteSecret: process.env.MGS_SITE_SECRET,
//     apiUrl: process.env.MGS_PLATFORM_URL,
//   });
//   await mgs.connect();
//   const espace = await mgs.getAgenceSpace();

import type {
  MGSConfig,
  MGSIdentite,
  MGSDemande,
  MGSStatutDemande,
  MGSOffre,
  MGSPrestation,
  MGSabonnement,
  MGSReponseCreationDemande,
  MGSActionResult,
  MGSConnexionEtat,
  MGSEvenementTempsReel,
  MGSCallbackEvenement,
} from "./sdk-types";
import { initialiserClientWebSocket, getClientWebSocket } from "./websocket-client";

/** Client principal du SDK MGS. */
export class MGSClient {
  private config: MGSConfig;
  private etat: MGSConnexionEtat = "deconnecte";
  private wsConnecte = false;
  private callbacks = new Set<MGSCallbackEvenement>();

  constructor(config: MGSConfig) {
    this.config = config;
  }

  /** Retourne l'état actuel de connexion. */
  getEtat(): MGSConnexionEtat {
    return this.etat;
  }

  /** Retour true si connecté (REST + WebSocket). */
  estConnecte(): boolean {
    return this.etat === "connecte" && this.wsConnecte;
  }

  /**
   * Établit la connexion à la plateforme (REST + WebSocket).
   *
   * Vérifie que les variables sont configurées et initialise le client WebSocket.
   */
  async connect(): Promise<MGSActionResult> {
    if (!this.config.wsUrl || !this.config.siteKey || !this.config.siteSecret) {
      this.etat = "echec";
      return {
        ok: false,
        erreur: "Configuration MGS incomplète (MGS_WS_URL, MGS_SITE_KEY, MGS_SITE_SECRET).",
      };
    }

    // Initialise le client WebSocket (gère aussi la reconnexion automatique).
    const wsClient = initialiserClientWebSocket();
    if (!wsClient) {
      this.etat = "echec";
      return { ok: false, erreur: "Impossible d'initialiser le client WebSocket." };
    }

    // Écoute les événements temps réel.
    wsClient.surEvenement((evenement) => {
      for (const cb of this.callbacks) {
        try { cb(evenement); } catch {}
      }
    });

    // Tente la connexion WebSocket.
    wsClient.connecter();
    this.wsConnecte = true;
    this.etat = "connecte";

    return { ok: true };
  }

  /**
   * Ferme la connexion WebSocket.
   */
  disconnect(): void {
    const wsClient = getClientWebSocket();
    if (wsClient) {
      wsClient.deconnecter();
    }
    this.wsConnecte = false;
    this.etat = "deconnecte";
  }

  /**
   * Récupère l'espace agence complet (identité, prestations, offres, abonnement, demandes).
   *
   * Appelle GET /api/v1/agency sur la plateforme.
   */
  async getAgenceSpace(): Promise<{
    identite: MGSIdentite | null;
    prestations: MGSPrestation[];
    offres: MGSOffre[];
    abonnement: MGSabonnement | null;
    demandes: MGSDemande[];
    erreur?: string;
  }> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/v1/agency`, {
        headers: {
          "X-Site-Key": this.config.siteKey,
          Authorization: `Bearer ${this.config.siteSecret}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return {
          identite: null,
          prestations: [],
          offres: [],
          abonnement: null,
          demandes: [],
          erreur: `HTTP ${response.status}`,
        };
      }

      const data = await response.json();

      return {
        identite: data.agence?.identite ?? null,
        prestations: (data.prestations ?? []).map((p: unknown) => ({
          id: (p as { id: string }).id,
          titre: (p as { titre: string }).titre,
          description: (p as { description: string }).description,
          prix: (p as { prix: number }).prix,
          devise: (p as { devise: string }).devise,
          active: (p as { active: boolean }).active,
          planFacturation: (p as { plan_facturation?: string }).plan_facturation,
        })),
        offres: (data.offres ?? []).map((o: unknown) => ({
          id: (o as { id: string }).id,
          titre: (o as { titre: string }).titre,
          description: (o as { description: string }).description,
          prix: (o as { prix: number }).prix,
          devise: (o as { devise: string }).devise,
          active: (o as { active: boolean }).active,
        })),
        abonnement: data.abonnement ?? null,
        demandes: (data.demandes ?? []).map((d: unknown) => ({
          id: (d as { id: string }).id,
          sujet: (d as { sujet: string }).sujet,
          description: (d as { description: string }).description,
          statut: (d as { statut: string }).statut as MGSStatutDemande,
          priorite: (d as { priorite: string }).priorite,
          prix: (d as { prix: number }).prix,
          devise: (d as { devise: string }).devise,
          dateCreation: (d as { created_at: string }).created_at,
          dateMiseAJour: (d as { updated_at?: string }).updated_at,
          clientEmail: (d as { requester_email?: string }).requester_email,
        })),
      };
    } catch (erreur) {
      return {
        identite: null,
        prestations: [],
        offres: [],
        abonnement: null,
        demandes: [],
        erreur: erreur instanceof Error ? erreur.message : String(erreur),
      };
    }
  }

  /**
   * Crée une nouvelle demande d'amélioration.
   *
   * Appelle POST /api/agency/request sur le site client (qui relaye vers la plateforme).
   */
  async creerDemande(donnees: {
    sujet: string;
    description: string;
    prestationId?: string;
    clientEmail: string;
    clientTelephone?: string;
  }): Promise<MGSReponseCreationDemande> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/v1/agency/requests`, {
        method: "POST",
        headers: {
          "X-Site-Key": this.config.siteKey,
          Authorization: `Bearer ${this.config.siteSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(donnees),
        signal: AbortSignal.timeout(10000),
      });

      const corps = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          ok: false,
          erreur: corps?.error ?? `HTTP ${response.status}`,
        };
      }

      return {
        ok: true,
        demande: corps?.demande ?? undefined,
        message: corps?.message ?? "Demande créée avec succès.",
      };
    } catch (erreur) {
      return {
        ok: false,
        erreur: erreur instanceof Error ? erreur.message : String(erreur),
      };
    }
  }

  /**
   * Envoie un message sur une demande existante.
   *
   * Appelle POST /api/agency/requests/[id]/messages.
   */
  async envoyerMessage(
    demandeId: string,
    contenu: string,
  ): Promise<MGSActionResult> {
    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/v1/agency/requests/${demandeId}/messages`,
        {
          method: "POST",
          headers: {
            "X-Site-Key": this.config.siteKey,
            Authorization: `Bearer ${this.config.siteSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contenu }),
          signal: AbortSignal.timeout(10000),
        },
      );

      const corps = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          ok: false,
          erreur: corps?.error ?? `HTTP ${response.status}`,
        };
      }

      return { ok: true, donnees: corps };
    } catch (erreur) {
      return {
        ok: false,
        erreur: erreur instanceof Error ? erreur.message : String(erreur),
      };
    }
  }

  /**
   * Répond à un devis (accepte ou refuse).
   *
   * Appelle POST /api/agency/requests/[id]/reponse.
   */
  async repondreDevis(
    demandeId: string,
    reponse: "accepte" | "refuse",
    motif?: string,
  ): Promise<MGSActionResult> {
    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/v1/agency/requests/${demandeId}/reponse`,
        {
          method: "POST",
          headers: {
            "X-Site-Key": this.config.siteKey,
            Authorization: `Bearer ${this.config.siteSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reponse, motif }),
          signal: AbortSignal.timeout(10000),
        },
      );

      const corps = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          ok: false,
          erreur: corps?.error ?? `HTTP ${response.status}`,
        };
      }

      return { ok: true, donnees: corps };
    } catch (erreur) {
      return {
        ok: false,
        erreur: erreur instanceof Error ? erreur.message : String(erreur),
      };
    }
  }

  /**
   * Récupère les messages d'une demande.
   *
   * Appelle GET /api/agency/requests/[id]/messages.
   */
  async getMessages(demandeId: string): Promise<{
    messages: Array<{
      id: string;
      auteur: string;
      contenu: string;
      lu: boolean;
      dateCreation: string;
    }>;
    erreur?: string;
  }> {
    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/v1/agency/requests/${demandeId}/messages`,
        {
          headers: {
            "X-Site-Key": this.config.siteKey,
            Authorization: `Bearer ${this.config.siteSecret}`,
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        return {
          messages: [],
          erreur: `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        messages: (data.messages ?? []).map((m: unknown) => ({
          id: (m as { id: string }).id,
          auteur: (m as { auteur: string }).auteur,
          contenu: (m as { contenu: string }).contenu,
          lu: (m as { lu: boolean }).lu,
          dateCreation: (m as { created_at: string }).created_at,
        })),
      };
    } catch (erreur) {
      return {
        messages: [],
        erreur: erreur instanceof Error ? erreur.message : String(erreur),
      };
    }
  }

  /**
   * S'abonne aux événements temps réel de la plateforme.
   *
   * Retourne une fonction de désabonnement.
   */
  surEvenement(callback: MGSCallbackEvenement): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Vérifie la santé de la connexion (endoint /api/agency/health).
   */
  async verifierSante(): Promise<{
    ok: boolean;
    configure: boolean;
    sante: "ok" | "degrade" | "panne";
    chemins?: unknown[];
  }> {
    try {
      const response = await fetch(`${this.config.apiUrl}/api/agency/health`, {
        headers: {
          "X-Site-Key": this.config.siteKey,
          Authorization: `Bearer ${this.config.siteSecret}`,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { ok: false, configure: false, sante: "panne" };
      }

      const data = await response.json();
      return {
        ok: data.ok ?? false,
        configure: data.connecteurConfigure ?? false,
        sante: data.resume?.tauxReussiteGlobal ?? 0 >= 90 ? "ok" : "degrade",
        chemins: data.chemins,
      };
    } catch {
      return { ok: false, configure: false, sante: "panne" };
    }
  }
}

/** Instance singleton du SDK (optionnelle). */
let sdkInstance: MGSClient | null = null;

/**
 * Crée ou retourne l'instance singleton du SDK.
 */
export function creerMGSClient(config: MGSConfig): MGSClient {
  sdkInstance = new MGSClient(config);
  return sdkInstance;
}

/**
 * Retourne l'instance singleton existante.
 */
export function getMGSClient(): MGSClient | null {
  return sdkInstance;
}