"use client";

import { useEffect, useId, useRef, useState } from "react";

import { LIBELLE_STATUT_INCONNU } from "@/lib/agency/contrat-partage";
import type { DemandeAffiche, EvenementAffiche } from "@/lib/agency/types";
import {
  Mention,
  PastillePrix,
  PastilleStatut,
  jetonDemande,
} from "./agency-commun";

/**
 * Section « Mes demandes » : l'historique du commerçant et le suivi de chaque
 * demande.
 *
 * Le suivi (`agency_request_events`) est la seule chose qui distingue cet écran
 * d'une liste de tickets : c'est lui qui dit où en est vraiment le dossier, et
 * c'est pour cela que le panneau montre la chrono plutôt qu'un simple statut.
 * Le contrat en a déjà produit les phrases — `le_libelle` pour la date relative,
 * `libelle` pour l'action, `acteur` pour qui l'a faite — et rien ici n'en
 * reformule une seule.
 *
 * Trois pièges que cette section ferme :
 *
 *  - LE CODE DE STATUT N'EST JAMAIS AFFICHÉ. `statut_libelle` porte « Demande en
 *    traitement » pour un code que le contrat ne connaît pas ; afficher le code
 *    à côté ferait réapparaître `en_attente_client` dans une interface de
 *    commerçant, ce que le contrat interdit explicitement. Quand
 *    `statut_connu` vaut `false`, on le signale par une mention discrète, jamais
 *    par une alerte : le code est peut-être une valeur neuve de la base, pas une
 *    panne.
 *  - LA COUVERTURE EST UN FAIT DE LECTEUR. `couverture_libelle` n'est écrit que
 *    si l'abonnement en cours de CET espace couvre la prestation, formule contre
 *    formule. C'est la seule couverture qu'un client a le droit de lire comme
 *    une promesse ; `couverte_par_abonnement` n'est jamais lu ici, parce que
 *    c'est un fait de catalogue. Confondre les deux afficherait « Inclus dans
 *    votre abonnement » à un abonné d'une formule qui ne couvre pas la
 *    prestation : l'agence facture alors une prestation qu'elle avait dite
 *    incluse.
 *  - LE PRIX RESTE AFFICHÉ QUAND LA DEMANDE EST INCLUSE. Le contrat est
 *    explicite : un agent reste juge de chiffrer ou non, et un montant saisi
 *    s'affiche tant qu'il existe. Masquer le prix sous couvert d'inclusion
 *    ferait perdre au client la seule information qui lui dit ce qu'il doit.
 *
 * Le demandeur n'est pas affiché : sur cet écran, le lecteur EST le demandeur.
 * Répéter son propre nom et son propre numéro sous chaque demande prendrait la
 * place de l'information utile, le suivi.
 */

/** Nombre d'événements rendus par demande. `space.ts` plafonne déjà à 100. */
const MAX_EVENEMENTS_AFFICHES = 24;

/** Route locale de réponse à un devis. Cf. `AgencyPanelProps.routeReponse`. */
const ROUTE_REPONSE_DEFAUT = "/api/agency/requests/reponse";

export type ListeDemandesProps = {
  demandes: DemandeAffiche[] | null | undefined;
  /** La plateforme n'a pas répondu : ne pas écrire « aucune demande ». */
  indisponible?: boolean;
  /** Préfixe d'identifiant du panneau. Voir `AgencyPanel`. */
  suffixe?: string;
  /** Route locale de réponse à un devis. */
  routeReponse?: string | null;
  /** Route de purge du cache, appelée après une réponse. */
  routeRevalidation?: string | null;
  /** Chemin du site revalidé après une réponse. */
  cheminRevalidation?: string;
};

/**
 * Section complète. Une liste vide se dit, elle ne s'invente pas.
 *
 * Le cas « liste vide » a deux Causes opposées, et l'écran doit les distinguer :
 * « ce commerçant n'a rien demandé » — une information — et « la plateforme n'a
 * pas répondu » — une panne. Les confondre affichait « Vous n'avez pas encore de
 * demande » au moment précis où le composant ne savait rien, et le commerçant
 * concluait que ses dossiers avaient disparu. `indisponible` porte cette
 * distinction ; il n'est pas recalculé ici, il est lu dans `space.indisponibles`.
 */
export function ListeDemandes({
  demandes,
  indisponible = false,
  suffixe = "",
  routeReponse = ROUTE_REPONSE_DEFAUT,
  routeRevalidation = null,
  cheminRevalidation = "/",
}: ListeDemandesProps) {
  const liste = Array.isArray(demandes) ? demandes : [];
  const idTitre = suffixe === "" ? "agency-titre-demandes" : `agency-titre-demandes-${suffixe}`;
  const reponse = useReponseDemande({ routeReponse, routeRevalidation, cheminRevalidation });

  return (
    <section className="agency-section" aria-labelledby={idTitre}>
      <h2 className="agency-section-titre" id={idTitre}>
        Mes demandes
      </h2>

      {liste.length === 0 && indisponible ? (
        <Mention ton="attention">
          Vos demandes n’ont pas pu être consultées. Réessayez dans un instant : elles
          n’ont pas disparu.
        </Mention>
      ) : liste.length === 0 ? (
        <p className="agency-section-intro">
          Vous n’avez pas encore de demande. Le formulaire plus bas en crée une.
        </p>
      ) : (
        <div className="agency-liste">
          {liste.map((demande) => (
            <CarteDemande key={demande.id} demande={demande} reponse={reponse} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ========================================================================== *
 * Réponse à un devis : la partie que le commerçant actionne
 * ========================================================================== */

type Reponse = "accepte" | "refuse";

type EtatReponse = {
  /** Demande en cours de traitement, ou `null` si les boutons sont libres. */
  occupee: string | null;
  /** Demande dont on demande le motif de refus, ou `null` si la boîte est fermée. */
  refusEnCours: string | null;
  /** Message d'erreur à afficher sous les actions. */
  erreur: string | null;
};

type ActionsReponse = {
  /** Le client peut-il répondre ? Une demande terminale ne se répond plus. */
  possible: boolean;
  /** La réponse est-elle en cours d'enregistrement ? */
  enCours: boolean;
  /** Demande dont on demande le motif, ou `null` si la boîte est fermée. */
  refusEnCours: string | null;
  /** Message d'erreur à afficher sous les actions, ou `null`. */
  erreur: string | null;
  repondre: (id: string, reponse: Reponse, motif?: string) => Promise<void>;
  ouvrirRefus: (id: string) => void;
  fermerRefus: () => void;
};

/**
 * L'état d'une réponse à un devis, et l'appel correspondant.
 *
 * Les deux actions n'existent que si la plateforme a proposé la réponse : la
 * condition est `en_attente_client`, code que le contrat publie comme « En attente
 * du client ». Une demande terminale — livrée, annulée, refusée — ne se répond
 * plus, et le composant ne montre donc aucun bouton : un bouton qui échouerait
 * serait pire que son absence.
 *
 * La purge du cache est le même appel OPT-IN que pour une nouvelle demande : le
 * composant ne sait pas si le site a installé la route de revalidation, et un appel
 * à une route absente ferait échouer la réponse alors qu'elle a été enregistrée.
 * C'est pour cela que l'appel est isolé et que son échec est ignoré.
 */
function useReponseDemande({
  routeReponse,
  routeRevalidation,
  cheminRevalidation,
}: {
  routeReponse: string | null;
  routeRevalidation: string | null;
  cheminRevalidation: string;
}): ActionsReponse {
  const [etat, setEtat] = useState<EtatReponse>({ occupee: null, refusEnCours: null, erreur: null });

  async function repondre(id: string, reponse: Reponse, motif?: string) {
    if (typeof routeReponse !== "string" || routeReponse === "") return;
    setEtat({ occupee: id, refusEnCours: null, erreur: null });
    try {
      const reponseHttp = await fetch(routeReponse, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(motif === undefined ? { id, reponse } : { id, reponse, motif }),
      });
      const corps = (await reponseHttp.json().catch(() => null)) as { error?: unknown } | null;
      if (!reponseHttp.ok) {
        const message =
          typeof corps?.error === "string" && corps.error.trim() !== ""
            ? corps.error
            : "Votre réponse n’a pas pu être enregistrée.";
        setEtat({ occupee: null, refusEnCours: null, erreur: message });
        return;
      }
      setEtat({ occupee: null, refusEnCours: null, erreur: null });
      await revalider(routeRevalidation, cheminRevalidation);
    } catch {
      // Réseau coupé : on ne pretend pas que la décision est passée.
      setEtat({
        occupee: null,
        refusEnCours: null,
        erreur: "Votre réponse n’a pas pu être transmise. Vérifiez votre connexion.",
      });
    }
  }

  return {
    possible: true,
    enCours: etat.occupee !== null,
    refusEnCours: etat.refusEnCours,
    erreur: etat.erreur,
    repondre,
    ouvrirRefus: (id: string) => setEtat({ occupee: null, refusEnCours: id, erreur: null }),
    fermerRefus: () => setEtat((actuel) => ({ ...actuel, refusEnCours: null })),
  };
}

/**
 * Purge du cache du site, si la route a été installée.
 *
 * `next: { revalidate: 0 }` : la réponse a été enregistrée, le panneau doit donc
 * la refléter au prochain rendu. Un cache qui garde la liste d'avant ferait
 * laisser le commerçant devant « En attente du client » juste après avoir
 * accepté, ce qui est la version la plus coûteuse du bug — il appellerait l'agence
 * pour dire qu'il a refusé un devis qu'il vient d'accepter.
 *
 * L'échec est IGNORÉ : la réponse est déjà enregistrée côté plateforme, et une
 * route de revalidation absente ou en erreur ne doit pas se lire comme un échec
 * de la réponse.
 */
async function revalider(route: string | null, chemin: string): Promise<void> {
  if (typeof route !== "string" || route === "") return;
  try {
    await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chemins: [chemin] }),
    });
  } catch {
    // Sans conséquence pour la réponse : elle est déjà enregistrée.
  }
}

/** Une demande : son état, son prix, son paiement, puis son suivi. */
function CarteDemande({
  demande,
  reponse,
}: {
  demande: DemandeAffiche;
  reponse: ActionsReponse;
}) {
  const objet = typeof demande.objet === "string" && demande.objet !== "" ? demande.objet : "";
  const prestation = typeof demande.prestation_libelle === "string" ? demande.prestation_libelle : "";
  const description = typeof demande.description === "string" ? demande.description : "";
  // La jointure porte la description de la prestation précisément pour que cet
  // écran n'ait pas à relire le catalogue ; on ne l'affiche que si elle apporte
  // quelque chose de plus que la description déjà connue de la demande.
  const descriptionService =
    typeof demande.service?.description === "string" ? demande.service.description : "";
  const evenements = Array.isArray(demande.evenements) ? demande.evenements : [];

  return (
    <article className="agency-demande">
      <header className="agency-demande-entete">
        <span className="agency-reference">
          <span className="agency-visually-hidden">Demande </span>
          {demande.reference}
        </span>
        <PastilleStatut
          libelle={demande.statut_libelle}
          jeton={jetonDemande(demande.statut)}
        />
      </header>

      {objet !== "" && <h3 className="agency-demande-objet">{objet}</h3>}
      {prestation !== "" && <p className="agency-demande-prestation">{prestation}</p>}

      <div className="agency-demande-meta">
        <PastillePrix prix={demande.prix} />
        {demande.couverture_libelle && (
          <span className="agency-couverture">{demande.couverture_libelle}</span>
        )}
        <PastillePaiement demande={demande} />
      </div>

      {demande.statut_connu === false && (
        <Mention>
          Le statut précis de cette demande n’est pas encore disponible : «{" "}
          {LIBELLE_STATUT_INCONNU} » est le libellé le plus précis que l’agence
          publie aujourd’hui.
        </Mention>
      )}

      {description !== "" && <p className="agency-demande-texte">{description}</p>}
      {descriptionService !== "" && descriptionService !== description && (
        <p className="agency-demande-texte agency-demande-texte--doux">
          {descriptionService}
        </p>
      )}

      {/* La réponse n'est proposée que là où la plateforme l'autorise : le code
          `en_attente_client` signifie littéralement que la demande attend le
          client. Une demande terminale n'a plus rien à répondre, et un bouton qui
          échouerait serait pire que son absence. */}
      {demande.statut === "en_attente_client" && reponse.possible && (
        <ActionsDevis demande={demande} reponse={reponse} />
      )}

      {evenements.length > 0 && <Chrono evenements={evenements} />}
    </article>
  );
}

/**
 * « Accepter le devis » et « Refuser le devis ».
 *
 * Le refus demande un motif, dans une boîte de dialogue qui rend le focus à son
 * déclencheur — sans quoi un commerçant qui change d'avis perdrait le focus au
 * milieu du panneau et ne reverrait plus où il se trouve.
 *
 * L'acceptation ne demande rien : accepter un devis sans avoir rien à ajouter est
 * le cas ordinaire, et un formulaire à remplir serait un obstacle de plus sur le
 * chemin le plus simple.
 */
function ActionsDevis({
  demande,
  reponse,
}: {
  demande: DemandeAffiche;
  reponse: ActionsReponse;
}) {
  const enCours = reponse.enCours;

  return (
    <div className="agency-devis-actions">
      <p className="agency-section-intro">
        L’agence a chiffré cette demande et attend votre réponse. En l’acceptant,
        vous acceptez le montant indiqué ci-dessus.
      </p>

      <div className="agency-actions">
        <button
          type="button"
          className="agency-bouton agency-bouton--plein"
          disabled={enCours}
          onClick={() => void reponse.repondre(demande.id, "accepte")}
        >
          {enCours ? "Enregistrement…" : "Accepter le devis"}
        </button>
        <button
          type="button"
          className="agency-bouton agency-bouton--secondaire"
          disabled={enCours}
          onClick={() => reponse.ouvrirRefus(demande.id)}
        >
          Refuser le devis
        </button>
      </div>

      {reponse.refusEnCours === demande.id && (
        <BoiteRefus
          demande={demande}
          onAnnuler={() => reponse.fermerRefus()}
          onConfirmer={(motif) => void reponse.repondre(demande.id, "refuse", motif)}
        />
      )}

      {reponse.erreur !== null && (
        <Mention ton="attention">
          {reponse.erreur}
        </Mention>
      )}
    </div>
  );
}

/**
 * La boîte de refus.
 *
 * `role="dialog"`, `aria-modal`, titre relié et `Échap` ferme : c'est le minimum
 * pour qu'une boîte de dialogue soit navigable au clavier. Le focus entre dans le
 * champ à l'ouverture et revient au bouton « Refuser le devis » à la fermeture —
 * la personne qui annule retrouve l'endroit exact d'où elle a cliqué, ce qui
 * compte quand le panneau contient plusieurs demandes.
 *
 * Le motif est obligatoire, parce que la plateforme l'exige : c'est l'agent qui
 * doit pouvoir répondre au commerçant, et « je ne veux plus » ne le lui permet pas.
 * La borne 280 caractères est celle de la plateforme.
 */
function BoiteRefus({
  demande,
  onAnnuler,
  onConfirmer,
}: {
  demande: DemandeAffiche;
  onAnnuler: () => void;
  onConfirmer: (motif: string) => void;
}) {
  const idTitre = useId();
  const idChamp = `${idTitre}-motif`;
  const idAide = `${idTitre}-aide`;
  const champRef = useRef<HTMLTextAreaElement>(null);
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    champRef.current?.focus();
  }, []);

  useEffect(() => {
    function surTouche(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onAnnuler();
      }
    }
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [onAnnuler]);

  function confirmer() {
    const propre = motif.replace(/\s+/g, " ").trim();
    if (propre.length < 3) {
      setErreur("Dites-nous pourquoi vous refusez, en quelques mots.");
      champRef.current?.focus();
      return;
    }
    setErreur(null);
    onConfirmer(propre.slice(0, 280));
  }

  return (
    <div className="agency-boite" role="dialog" aria-modal="true" aria-labelledby={idTitre}>
      <h4 className="agency-boite-titre" id={idTitre}>
        Refuser le devis de la demande {demande.reference}
      </h4>
      <p className="agency-boite-texte" id={idAide}>
        Un mot à l’agence l’aide à vous répondre. Trois caractères suffisent.
      </p>
      <textarea
        ref={champRef}
        className="agency-champ"
        id={idChamp}
        rows={3}
        value={motif}
        maxLength={280}
        onChange={(event) => setMotif(event.target.value)}
        aria-describedby={erreur === null ? idAide : `${idAide} ${idAide}-erreur`}
        aria-invalid={erreur !== null}
        placeholder="Je ne souhaite plus cette prestation…"
      />
      {erreur !== null && (
        <p className="agency-erreur" id={`${idAide}-erreur`} role="alert">
          {erreur}
        </p>
      )}

      <div className="agency-actions">
        <button
          type="button"
          className="agency-bouton agency-bouton--plein"
          onClick={confirmer}
        >
          Refuser et envoyer
        </button>
        <button
          type="button"
          className="agency-bouton agency-bouton--secondaire"
          onClick={onAnnuler}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

/**
 * État de paiement, en une pastille.
 *
 * `PaiementAffiche` a déjà arbitré entre « réglée » et « à payer » à partir du
 * prix validé, et `space.ts` a recalculé `a_payer` pour que la plateforme et le
 * connecteur ne puissent pas se contredire. On ne redécide rien : une demande
 * sans montant à payer ne reçoit aucune pastille, parce qu'en afficher une
 * ferait croire qu'une facture est due.
 */
function PastillePaiement({ demande }: { demande: DemandeAffiche }) {
  const paiement = demande.paiement;
  if (paiement?.reglee === true) {
    return (
      <span className="agency-pastille agency-pastille--payee">
        Réglée{paiement.payee_libelle ? ` le ${paiement.payee_libelle}` : ""}
      </span>
    );
  }
  if (paiement?.a_payer !== true) return null;
  return (
    <span className="agency-pastille agency-pastille--impayee">
      À payer
      {paiement.echeance_libelle ? ` avant le ${paiement.echeance_libelle}` : ""}
      {paiement.echeance_depassee === true ? " — en retard" : ""}
    </span>
  );
}

/**
 * La chrono du suivi, étape la plus récente en premier.
 *
 * Le contrat a déjà classé les événements par date croissante
 * (`presenterDemande`) : on ne retrie pas par date ici, sinon deux
 * implémentations pourraient diverger sur le même tableau. L'inversion n'est
 * qu'un ordre de LECTURE — sur un dossier en cours, c'est la dernière étape
 * qu'on veut voir sans faire défiler — et elle n'a aucun effet sur le contenu.
 *
 * La liste est une `<ol>` parce que l'ordre est une information, pas un décor.
 * Si la plateforme a renvoyé plus d'événements que `MAX_EVENEMENTS_AFFICHES`,
 * seuls les plus récents sont rendus : le dossier reste lisible, et `space.ts`
 * borne déjà la lecture.
 *
 * `EvenementAffiche` porte trois textes déjà formatés : `libelle` (l'action),
 * `le_libelle` (la date relative) et `acteur.type_libelle` (qui). Aucun n'est
 * recomposé, et `type_connu` n'est pas ici une excuse pour montrer le code.
 */
function Chrono({ evenements }: { evenements: EvenementAffiche[] }) {
  const visibles = evenements.slice(-MAX_EVENEMENTS_AFFICHES).reverse();
  return (
    <ol className="agency-chrono" aria-label="Suivi de la demande">
      {visibles.map((evenement) => {
        const acteur = typeof evenement.acteur?.type_libelle === "string" ? evenement.acteur.type_libelle : "";
        const quand = typeof evenement.le_libelle === "string" ? evenement.le_libelle : "";
        // Les deux mentions peuvent manquer séparément ; on ne veut jamais d'un
        // séparateur orphelin en début de ligne.
        const mention = [acteur, quand].filter(Boolean).join(" · ");
        return (
          <li className="agency-chrono-etape" key={evenement.id}>
            <span className="agency-chrono-point" aria-hidden="true" />
            <span className="agency-chrono-corps">
              <span className="agency-chrono-libelle">{evenement.libelle}</span>
              {typeof evenement.detail === "string" && evenement.detail !== "" && (
                <span className="agency-chrono-detail">{evenement.detail}</span>
              )}
              {mention !== "" && <span className="agency-chrono-mention">{mention}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}