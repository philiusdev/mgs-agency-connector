"use client";

import { useId, useState } from "react";

type MessageAgence = {
  id: string;
  auteur: "client" | "agent" | "system";
  contenu: string;
  lu: boolean;
  created_at: string;
};

type Etat = "ferme" | "chargement" | "pret" | "erreur";

function lireMessages(valeur: unknown): MessageAgence[] | null {
  if (!valeur || typeof valeur !== "object") return null;
  const lignes = (valeur as { messages?: unknown }).messages;
  if (!Array.isArray(lignes)) return null;
  const messages: MessageAgence[] = [];
  for (const ligne of lignes) {
    if (
      !ligne ||
      typeof ligne !== "object" ||
      typeof ligne.id !== "string" ||
      (ligne.auteur !== "client" && ligne.auteur !== "agent" && ligne.auteur !== "system") ||
      typeof ligne.contenu !== "string" ||
      typeof ligne.lu !== "boolean" ||
      typeof ligne.created_at !== "string" ||
      !Number.isFinite(Date.parse(ligne.created_at))
    ) return null;
    messages.push(ligne as MessageAgence);
  }
  return messages;
}

function heure(valeur: string): string {
  const instant = Date.parse(valeur);
  if (!Number.isFinite(instant)) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(instant);
}

export function MessagesDemande({ demandeId }: { demandeId: string }) {
  const idChamp = useId();
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState<Etat>("ferme");
  const [messages, setMessages] = useState<MessageAgence[] | null>(null);
  const [contenu, setContenu] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function charger() {
    setEtat("chargement");
    setErreur(null);
    try {
      const response = await fetch(`/api/agency/requests/${encodeURIComponent(demandeId)}/messages`, {
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
        throw new Error(typeof reason === "string" ? reason : "La conversation ne peut pas être chargée.");
      }
      const resultat = lireMessages(body);
      if (!resultat) throw new Error("La réponse de la conversation est illisible. Actualisez avant d’envoyer un nouveau message.");
      setMessages(resultat);
      setEtat("pret");
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La conversation ne peut pas être chargée.");
      setEtat("erreur");
    }
  }

  async function basculer() {
    if (ouvert) {
      setOuvert(false);
      return;
    }
    setOuvert(true);
    if (etat === "ferme" || etat === "erreur") await charger();
  }

  async function envoyer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const texte = contenu.replace(/\s+/g, " ").trim();
    if (!texte || envoi) return;
    setEnvoi(true);
    setErreur(null);
    setAvertissement(null);
    try {
      const response = await fetch(`/api/agency/requests/${encodeURIComponent(demandeId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu: texte }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
        throw new Error(typeof reason === "string" ? reason : "Le message n’a pas pu être envoyé.");
      }
      const envelope = body && typeof body === "object" ? body as { message?: unknown; suivi_indisponible?: unknown } : null;
      const message = lireMessages({ messages: [envelope?.message] })?.[0];
      if (!message) {
        setErreur("La plateforme a accepté l’envoi, mais la confirmation est illisible. Actualisez la conversation avant de réessayer.");
        return;
      }
      setMessages((precedents) => [...(precedents ?? []), message]);
      setContenu("");
      if (envelope?.suivi_indisponible === true) {
        setAvertissement("Message envoyé, mais l’événement n’a pas pu être ajouté à l’historique du dossier.");
      }
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le message n’a pas pu être envoyé.");
    } finally {
      setEnvoi(false);
    }
  }

  const idListe = `${idChamp}-messages`;
  const idErreur = `${idChamp}-erreur`;

  return (
    <section className="agency-messages">
      <button
        className="agency-bouton agency-bouton--secondaire"
        type="button"
        aria-expanded={ouvert}
        aria-controls={idListe}
        onClick={() => void basculer()}
      >
        {ouvert ? "Fermer la conversation" : "Écrire à l’agence"}
      </button>
      {ouvert && (
        <div className="agency-messages-contenu" id={idListe}>
          <div className="agency-actions">
            <h4 className="agency-messages-titre">Conversation avec l’agence</h4>
            <button
              className="agency-bouton agency-bouton--secondaire"
              type="button"
              disabled={etat === "chargement"}
              onClick={() => void charger()}
            >
              {etat === "chargement" ? "Actualisation…" : "Actualiser"}
            </button>
          </div>

          {etat === "chargement" && <p className="agency-section-intro" role="status">Chargement des messages…</p>}
          {etat === "erreur" && erreur && (
            <div className="agency-messages-erreur" role="alert">
              <p>{erreur}</p>
              <button className="agency-bouton agency-bouton--secondaire" type="button" onClick={() => void charger()}>
                Réessayer
              </button>
            </div>
          )}
          {etat === "pret" && (
            <>
              {messages?.length ? (
                <ol className="agency-messages-liste" aria-label="Messages de la conversation">
                  {messages.map((message) => (
                    <li className={`agency-message agency-message--${message.auteur}`} key={message.id}>
                      <p className="agency-message-texte">{message.contenu}</p>
                      <small>
                        {message.auteur === "agent" ? "Agence" : message.auteur === "client" ? "Vous" : "Système"}
                        {" · "}{heure(message.created_at)}
                        {message.auteur === "client" && message.lu ? " · Lu par l’agence" : ""}
                        {message.auteur === "agent" && message.lu ? " · Lu" : ""}
                      </small>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="agency-section-intro">Aucun message pour le moment. Écrivez à l’agence ci-dessous.</p>
              )}
              <form className="agency-messages-formulaire" onSubmit={(event) => void envoyer(event)}>
                <label className="agency-visually-hidden" htmlFor={idChamp}>Votre message à l’agence</label>
                <textarea
                  className="agency-champ"
                  id={idChamp}
                  rows={3}
                  maxLength={2000}
                  required
                  value={contenu}
                  onChange={(event) => setContenu(event.target.value)}
                  aria-describedby={erreur ? idErreur : undefined}
                  aria-invalid={erreur !== null}
                  placeholder="Écrivez votre message…"
                />
                <div className="agency-actions">
                  <span className="agency-section-intro">{contenu.length}/2000</span>
                  <button className="agency-bouton agency-bouton--plein" type="submit" disabled={envoi || contenu.trim() === ""}>
                    {envoi ? "Envoi…" : "Envoyer"}
                  </button>
                </div>
              </form>
              {erreur && <p className="agency-messages-erreur" id={idErreur} role="alert">{erreur}</p>}
              {avertissement && <p className="agency-messages-avertissement" role="status">{avertissement}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
