"use client";

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

/** Section complète. Une liste vide se dit, elle ne s'invente pas. */
export function ListeDemandes({ demandes }: { demandes: DemandeAffiche[] | null | undefined }) {
  const liste = Array.isArray(demandes) ? demandes : [];
  return (
    <section className="agency-section" aria-labelledby="agency-titre-demandes">
      <h2 className="agency-section-titre" id="agency-titre-demandes">
        Mes demandes
      </h2>

      {liste.length === 0 ? (
        <p className="agency-section-intro">
          Vous n’avez pas encore de demande. Le formulaire plus bas en crée une.
        </p>
      ) : (
        <div className="agency-liste">
          {liste.map((demande) => (
            <CarteDemande key={demande.id} demande={demande} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Une demande : son état, son prix, son paiement, puis son suivi. */
function CarteDemande({ demande }: { demande: DemandeAffiche }) {
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

      {evenements.length > 0 && <Chrono evenements={evenements} />}
    </article>
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