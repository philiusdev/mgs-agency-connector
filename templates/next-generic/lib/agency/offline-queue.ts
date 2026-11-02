// File d'attente hors-ligne persistante côté site client.
//
// Lorsqu'un site client est déconnecté de la plateforme, les actions
// critiques (création de demande, envoi de message, réponse à devis) sont
// stockées localement et synchronisées automatiquement à la reconnexion.
//
// Utilise Supabase local ou une file en mémoire avec persistence via
// localStorage (côté navigateur) ou un fichier (côté serveur).

import type { JobHorsLigne } from "./types";

/** Action hors-ligne à synchroniser. */
export type ActionHorsLigne = {
  id: string;
  type: "creer_demande" | "envoyer_message" | "repondre_devis";
  payload: Record<string, unknown>;
  timestamp: number;
  tentatives: number;
  maxTentatives: number;
};

/** File d'attente hors-ligne. */
export class FileAttenteHorsLigne {
  private actions: ActionHorsLigne[] = [];
  private readonly cleStorage: string;
  private readonly maxTentatives = 5;
  private callbacks = new Set<() => void>();

  constructor(cleStorage = "mgs_offline_queue") {
    this.cleStorage = cleStorage;
    this.chargerDepuisStorage();
  }

  /** Ajoute une action à la file d'attente. */
  ajouter(action: Omit<ActionHorsLigne, "id" | "timestamp" | "tentatives">): void {
    const entree: ActionHorsLigne = {
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      type: action.type,
      payload: action.payload,
      timestamp: Date.now(),
      tentatives: 0,
      maxTentatives: action.maxTentatives ?? this.maxTentatives,
    };

    this.actions.push(entree);
    this.sauverDansStorage();
    this.notifier();

    console.log(`[mgs-offline] Action ajoutée : ${entree.type} (${entree.id})`);
  }

  /** Retourne toutes les actions en attente. */
  getActions(): ActionHorsLigne[] {
    return [...this.actions];
  }

  /** Retourne le nombre d'actions en attente. */
  getNombre(): number {
    return this.actions.length;
  }

  /** Retire une action de la file (après synchronisation réussie). */
  retirer(id: string): void {
    this.actions = this.actions.filter((a) => a.id !== id);
    this.sauverDansStorage();
    this.notifier();
  }

  /** Incrémente le compteur de tentatives d'une action. */
  incrementerTentatives(id: string): void {
    const action = this.actions.find((a) => a.id === id);
    if (action) {
      action.tentatives += 1;
      this.sauverDansStorage();
    }
  }

  /** Vérifie si une action a dépassé son nombre maximal de tentatives. */
  estEchecDefinitif(action: ActionHorsLigne): boolean {
    return action.tentatives >= action.maxTentatives;
  }

  /** Vide la file d'attente. */
  vider(): void {
    this.actions = [];
    this.sauverDansStorage();
    this.notifier();
  }

  /** S'abonne aux changements de la file. */
  surChangement(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /** Notifie les abonnés. */
  private notifier(): void {
    for (const callback of this.callbacks) {
      try { callback(); } catch {}
    }
  }

  /** Charge les actions depuis le stockage persistant. */
  private chargerDepuisStorage(): void {
    try {
      const brut = typeof localStorage !== "undefined"
        ? localStorage.getItem(this.cleStorage)
        : null;
      if (brut) {
        this.actions = JSON.parse(brut);
      }
    } catch {
      this.actions = [];
    }
  }

  /** Sauvegarde les actions dans le stockage persistant. */
  private sauverDansStorage(): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(this.cleStorage, JSON.stringify(this.actions));
      }
    } catch {
      // Ignore les erreurs de stockage (mode privé, quota, etc.)
    }
  }
}

/** Instance par défaut de la file d'attente hors-ligne. */
let fileAttenteParDefaut: FileAttenteHorsLigne | null = null;

/** Initialise et retourne l'instance par défaut. */
export function initialiserFileAttenteHorsLigne(): FileAttenteHorsLigne {
  if (!fileAttenteParDefaut) {
    fileAttenteParDefaut = new FileAttenteHorsLigne();
  }
  return fileAttenteParDefaut;
}

/** Retourne l'instance par défaut. */
export function getFileAttenteHorsLigne(): FileAttenteHorsLigne | null {
  return fileAttenteParDefaut;
}