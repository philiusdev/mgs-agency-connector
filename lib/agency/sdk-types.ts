// Types TypeScript du SDK client MGS.
//
// Ces types sont utilisés par le SDK `MGSClient` pour une intégration
// simplifiée depuis n'importe quel site client (Next.js, Expo, React, etc.).

/** Configuration du SDK. */
export type MGSConfig = {
  /** URL du serveur WebSocket (ex: wss://plateforme.example/api/v1/ws) */
  wsUrl: string;
  /** Clé publique du site */
  siteKey: string;
  /** Secret serveur du site */
  siteSecret: string;
  /** URL de l'API REST de la plateforme */
  apiUrl: string;
};

/** Identité de l'agence retournée par l'API. */
export type MGSIdentite = {
  nom: string;
  ville?: string;
  pays?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  domaine?: string;
};

/** Statut d'une demande. */
export type MGSStatutDemande =
  | "nouvelle"
  | "en_cours"
  | "en_attente_client"
  | "livree"
  | "annulee"
  | "refusee";

/** Demande affichée. */
export type MGSDemande = {
  id: string;
  sujet: string;
  description: string;
  statut: MGSStatutDemande;
  priorite: string;
  prix: number;
  devise: string;
  dateCreation: string;
  dateMiseAJour?: string;
  clientEmail?: string;
};

/** Offre de l'agence. */
export type MGSOffre = {
  id: string;
  titre: string;
  description: string;
  prix: number;
  devise: string;
  active: boolean;
};

/** Prestation de l'agence. */
export type MGSPrestation = {
  id: string;
  titre: string;
  description: string;
  prix: number;
  devise: string;
  active: boolean;
  planFacturation?: string;
};

/** Abonnement du site. */
export type MGSabonnement = {
  id: string;
  plan: string;
  statut: string;
  dateDebut?: string;
  dateFin?: string;
  renouvellementAuto: boolean;
};

/** Résultat d'une création de demande. */
export type MGSReponseCreationDemande = {
  ok: boolean;
  demande?: MGSDemande;
  message?: string;
  erreur?: string;
};

/** Résultat d'une action générique. */
export type MGSActionResult = {
  ok: boolean;
  donnees?: unknown;
  erreur?: string;
};

/** État de connexion du SDK. */
export type MGSConnexionEtat = "deconnecte" | "connectant" | "connecte" | "echec";

/** Événement temps réel reçu. */
export type MGSEvenementTempsReel = {
  type: string;
  donnees: unknown;
  timestamp: string;
};

/** Callback pour les événements temps réel. */
export type MGSCallbackEvenement = (evenement: MGSEvenementTempsReel) => void;