// Client WebSocket côté site pour la connexion temps réel à la plateforme.

import type { WebSocket } from "ws";

/** Type d'un événement reçu de la plateforme. */
export type EvenementWS = {
  type: string;
  donnees: unknown;
  timestamp: string;
};

/** Callback appelé quand un événement est reçu. */
export type CallbackEvenement = (evenement: EvenementWS) => void;

/** État de la connexion WebSocket. */
export type EtatConnexionWS = "deconnecte" | "connectant" | "connecte" | "echec";

/**
 * Client WebSocket pour un site client.
 */
export class WebSocketClient {
  private url: string;
  private cle: string;
  private secret: string;
  private ws: WebSocket | null = null;
  private etat: EtatConnexionWS = "deconnecte";
  private tentativesReconnexion = 0;
  private maxTentatives = 10;
  private delaiReconnexionMs = 1_000;
  private timerReconnexion: NodeJS.Timeout | null = null;
  private timerHeartbeat: NodeJS.Timeout | null = null;
  private callbacks = new Set<CallbackEvenement>();
  private siteId?: string;

  constructor(url: string, cle: string, secret: string) {
    this.url = url;
    this.cle = cle;
    this.secret = secret;
  }

  getEtat(): EtatConnexionWS {
    return this.etat;
  }

  estConnecte(): boolean {
    return this.etat === "connecte" && this.ws?.readyState === 1;
  }

  connecter(): void {
    if (this.etat === "connectant" || this.etat === "connecte") return;

    this.etat = "connectant";
    console.log(`[mgs-ws-client] Connexion à ${this.url}`);

    try {
      const { WebSocket } = require("ws");
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => this.gererOuverture());
      this.ws.on("message", (donnees: unknown) => this.gererMessage(donnees));
      this.ws.on("close", () => this.gererFermeture());
      this.ws.on("error", (erreur: unknown) => {
        console.error("[mgs-ws-client] Erreur WebSocket:", erreur);
        this.gererFermeture();
      });
    } catch (erreur) {
      console.error("[mgs-ws-client] Impossible de créer la connexion:", erreur);
      this.planifierReconnexion();
    }
  }

  deconnecter(): void {
    this.arreterTimers();
    this.tentativesReconnexion = 0;
    if (this.ws) {
      try { this.ws.close(1000, "Fermeture client"); } catch {}
      this.ws = null;
    }
    this.etat = "deconnecte";
  }

  surEvenement(callback: CallbackEvenement): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private diffuser(evenement: EvenementWS): void {
    for (const callback of this.callbacks) {
      try { callback(evenement); } catch {}
    }
  }

  private gererOuverture(): void {
    this.etat = "connectant";
    this.tentativesReconnexion = 0;
    this.delaiReconnexionMs = 1_000;

    this.envoyer({
      type: "initialisation",
      cle: this.cle,
      secret: this.secret,
    });

    this.timerHeartbeat = setInterval(() => {
      if (this.ws?.readyState === 1) {
        this.ws.send(JSON.stringify({ type: "heartbeat" }));
      }
    }, 25_000);
  }

  private gererMessage(donnees: unknown): void {
    try {
      const message = JSON.parse(String(donnees));
      if (message.type === "connecte") {
        this.siteId = message.siteId;
        this.etat = "connecte";
        console.log("[mgs-ws-client] Connecté et authentifié.");
        this.diffuser({ type: "connecte", donnees: { siteId: message.siteId }, timestamp: new Date().toISOString() });
      } else if (message.type === "heartbeat_ack") {
        // rien
      } else {
        this.diffuser({
          type: message.type,
          donnees: message.donnees,
          timestamp: message.timestamp ?? new Date().toISOString(),
        });
      }
    } catch (erreur) {
      console.error("[mgs-ws-client] Message invalide:", erreur);
    }
  }

  private gererFermeture(): void {
    this.arreterTimers();
    this.etat = "deconnecte";
    this.ws = null;
    console.log("[mgs-ws-client] Connexion fermée.");

    this.diffuser({
      type: "deconnecte",
      donnees: {},
      timestamp: new Date().toISOString(),
    });

    this.planifierReconnexion();
  }

  private planifierReconnexion(): void {
    if (this.tentativesReconnexion >= this.maxTentatives) {
      console.error("[mgs-ws-client] Nombre maximal de tentatives de reconnexion atteint.");
      this.etat = "echec";
      return;
    }

    this.tentativesReconnexion += 1;
    const delai = Math.min(this.delaiReconnexionMs * Math.pow(2, this.tentativesReconnexion - 1), 60_000);

    console.log(`[mgs-ws-client] Reconnexion dans ${delai} ms (tentative ${this.tentativesReconnexion})`);

    this.timerReconnexion = setTimeout(() => {
      this.connecter();
    }, delai);
  }

  private arreterTimers(): void {
    if (this.timerHeartbeat) {
      clearInterval(this.timerHeartbeat);
      this.timerHeartbeat = null;
    }
    if (this.timerReconnexion) {
      clearTimeout(this.timerReconnexion);
      this.timerReconnexion = null;
    }
  }

  private envoyer(message: unknown): void {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

/** Instance par défaut (à configurer avec les variables d'environnement). */
let clientParDefaut: WebSocketClient | null = null;

/**
 * Initialise le client WebSocket par défaut avec les variables d'environnement.
 *
 * Variables attendues :
 * - MGS_WS_URL : URL du serveur WebSocket (ex: wss://plateforme.example/api/v1/ws)
 * - MGS_SITE_KEY : clé publique du site
 * - MGS_SITE_SECRET : secret du site
 */
export function initialiserClientWebSocket(): WebSocketClient | null {
  const url = process.env.MGS_WS_URL;
  const cle = process.env.MGS_SITE_KEY;
  const secret = process.env.MGS_SITE_SECRET;

  if (!url || !cle || !secret) {
    console.warn("[mgs-ws-client] Variables MGS_WS_URL/MGS_SITE_KEY/MGS_SITE_SECRET manquantes.");
    return null;
  }

  clientParDefaut = new WebSocketClient(url, cle, secret);
  return clientParDefaut;
}

/** Retourne le client par défaut, ou null s'il n'est pas initialisé. */
export function getClientWebSocket(): WebSocketClient | null {
  return clientParDefaut;
}