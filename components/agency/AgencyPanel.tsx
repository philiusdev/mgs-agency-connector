"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { FormulaireNouvelleDemande } from "./agency-formulaire";
import { ListeDemandes } from "./agency-demandes";
import { AgencyForfaits } from "./AgencyForfaits";
import { AgencyInvoicePayment } from "./AgencyInvoicePayment";
import {
  abonnerTracePaiementOuvert,
  lireTracePaiementOuvert,
  snapshotPaiementOuvertServeur,
} from "./agency-paiement-client";
import {
  Mention,
  PastillePrix,
  PastilleStatut,
  jetonAbonnement,
} from "./agency-commun";
import {
  LIBELLE_ABONNEMENT_AUCUN,
  LIBELLE_FORMULE_INCONNUE,
  LIBELLE_PRIX_INCLUS,
  decrireStatutAbonnement,
  formaterDate,
} from "@/lib/agency/contrat-partage";
import type {
  AbonnementAffiche,
  AgencyAnnouncement,
  AgencyBilling,
  AgencyInvoice,
  AgencyBillingSubscription,
  IdentiteAgence,
  OffreAffiche,
  PrestationAffiche,
} from "@/lib/agency/types";
import type { AgencySpace } from "@/lib/agency/types";

/**
 * Le panneau « Mon agence » : tout ce que l'agence peut dire à ce site.
 *
 * Le composant reçoit un `space` déjà chargé et déjà normalisé côté serveur
 * (`loadAgencySpace`, `lib/agency/space.ts`). Aucune clé, aucune adresse de
 * plateforme, aucune variable d'environnement ne passe par le navigateur : le
 * `space` est du JSON affichable, et rien d'autre.
 *
 * `if (!space) return null` n'est pas un oubli. C'est la règle d'or du
 * connecteur (`INSTALLATION-CONNECTEUR.md` §1 et §9) : plateforme injoignable,
 * clé absente, migration pas encore appliquée — le site client doit continuer à
 * fonctionner exactement comme avant. Un composant qui essaierait de rendre
 * « quand même » un panneau à moitié rempli ferait croire à une panne de
 * l'agence alors que le site est sain, et le commerçant appellerait pour un
 * problème qui n'existe pas.
 *
 * L'ordre des sections n'est pas libre. Il va de ce qui identifie l'agence
 * (identité), à ce qui engage le commerçant (abonnement, facturation), puis à ce
 * qu'il peut choisir (prestations), à ce qu'il a déjà fait (demandes), à ce que
 * l'agence a de neuf à dire (annonces, offres), et enfin à l'action
 * (nouvelle demande). Le lecteur trouve la réponse avant d'être sollicité.
 *
 * AUCUNE CHAÎNE PROPRE pour tout ce qui décrit un état de la plateforme. Les
 * mots viennent du contrat partagé : `statut_libelle`, `prix.libelle`,
 * `LIBELLE_PRIX_INCLUS`, `LIBELLE_ABONNEMENT_AUCUN`, `formaterDate`. Les seuls
 * textes écrits ici décrivent des actions locales (« Voir et payer », « Choisir
 * une prestation ») ou des situations que le contrat n'a pas de mot pour —
 * l'absence de facturation pour un espace, par exemple — et jamais un montant,
 * un statut ni une date.
 *
 * Le panneau se rend aussi bien dans le tiroir du bouton flottant que dans un
 * onglet de dashboard : il ne suppose aucun conteneur particulier, il ne porte
 * ni l'overlay ni le bouton de fermeture. Ce sont là les affaires de
 * `AgencyFloatingButton`.
 */

export type AgencyPanelProps = {
  /** Espace chargé côté serveur. `null` → rien ne s'affiche, c'est voulu. */
  space: AgencySpace | null;
  /** Nom pré-rempli du demandeur dans le formulaire. */
  requesterName?: string;
  /** Email pré-rempli du demandeur dans le formulaire. */
  requesterEmail?: string;
  /** Route locale de création. Par défaut `/api/agency/request`. */
  routeDemande?: string;
  /** Route de purge du cache. Par défaut `/api/agency/revalidate`. */
  routeRevalidation?: string | null;
  /** Chemin du site revalidé après un envoi. Par défaut `/`. */
  cheminRevalidation?: string;
  /** Route locale de réponse à un devis. Par défaut `/api/agency/requests/reponse`. */
  routeReponse?: string | null;
};

export function AgencyPanel({
  space,
  requesterName,
  requesterEmail,
  routeDemande,
  routeRevalidation,
  cheminRevalidation,
  routeReponse,
}: AgencyPanelProps) {
  // Préfixe d'identifiant, calculé UNE FOIS par panneau et redescendu aux
  // sections. Il n'est pas calculé par section : deux appels à `useId()` rendus dans
  // deux composants frères ne partagent pas la même valeur, donc chaque titre
  // référencerait un identifiant qui n'existe pas.
  //
  // Sans ce préfixe, ce panneau ne peut pas coexister avec un autre. Il est monté
  // à la fois comme onglet du tableau de bord et à l'intérieur du tiroir du bouton
  // flottant, et les deux exemplaires sont donc présents en même temps sur `/admin`.
  // Les identifiants en dur pointaient alors sur le PREMIER exemplaire : un
  // `aria-labelledby` décrivait le second, et les `<label for>` du formulaire
  // visaient un `id` dupliqué — donc aucun champ n'était étiquetable, et chaque
  // lecture d'écran annonçait le titre de la mauvaise section. Le préfixe rend
  // chaque copie autonome, ce qui est la seule façon dont deux instances peuvent
  // coexister.
  //
  // Le crochet est appelé AVANT la garde `null` : un hook ne peut pas être appelé
  // conditionnellement, et un panneau qui disparaît après avoir eu un identifiant
  // doit pouvoir le rendre à nouveau.
  const suffixe = useId();

  // La garde d'or. Elle est aussi placée sur chaque section, parce qu'un objet
  // normalisé par le réseau peut porter une liste `undefined` : deux lignes, pas
  // une, et la page du dashboard ne tombe jamais.
  if (!space) return null;

  const identite = space.identite ?? null;

  // Une section que la plateforme n'a pas pu servir ne doit pas laisser croire
  // qu'elle est vide. Le connecteur distingue ces deux cas dans
  // `space.indisponibles` ; ici on ne fait que lire ce champ, sans jamais le
  // recalculer : une liste vide signifie « la plateforme a répondu, il n'y a
  // simplement rien », et doit laisser la section se taire comme avant.
  const indisponibles = Array.isArray(space.indisponibles) ? space.indisponibles : [];
  const indisponible = (section: string) => indisponibles.indexOf(section as never) >= 0;

  return (
    <div className="agency-panneau">
      <SectionIdentite
        identite={identite}
        joignable={space.joignable !== false}
        suffixe={suffixe}
      />
      <SectionAbonnement
        abonnement={space.abonnement}
        abonnementFacturation={space.facturation?.subscription ?? null}
        lienContact={identite?.lien_whatsapp ?? identite?.lien_email ?? null}
        suffixe={suffixe}
      />
      <SectionFacturation
        facturation={space.facturation}
        indisponible={indisponible("facturation")}
        identite={identite}
        suffixe={suffixe}
      />
      <AgencyForfaits
        facturation={space.facturation}
        indisponible={indisponible("facturation")}
        lienContact={identite?.lien_whatsapp ?? identite?.lien_email ?? null}
        suffixe={suffixe}
      />
      <SectionPrestations
        prestations={space.prestations}
        indisponible={indisponible("catalogue")}
        suffixe={suffixe}
      />
      <ListeDemandes
        demandes={space.demandes}
        indisponible={indisponible("demandes")}
        suffixe={suffixe}
        routeReponse={routeReponse}
        routeRevalidation={routeRevalidation}
        cheminRevalidation={cheminRevalidation}
      />
      <SectionAnnonces
        annonces={space.annonces}
        indisponible={indisponible("annonces")}
        suffixe={suffixe}
      />
      <SectionOffres offres={space.offres} suffixe={suffixe} />
      <FormulaireNouvelleDemande
        prestations={space.prestations}
        requesterName={requesterName}
        requesterEmail={requesterEmail}
        routeDemande={routeDemande}
        routeRevalidation={routeRevalidation}
        cheminRevalidation={cheminRevalidation}
        suffixe={suffixe}
      />
    </div>
  );
}

/* ========================================================================== *
 * 1. Identité et contact
 * ========================================================================== */

/**
 * Qui est l'agence, et comment la joindre.
 *
 * Les liens viennent de `lien_whatsapp`, `lien_email` et `site_web`, que le
 * contrat a déjà construits et validés à partir du numéro, de l'adresse et de
 * l'URL saisis par l'agence. Ce composant n'en reconstruit aucun : un lien
 * reconstruit ici pourrait pointer ailleurs que vers ce que l'écran affiche,
 * et un client qui clique sur « +226 70 12 34 56 » et tombe sur un autre
 * numéro appelle l'agence au sujet d'un numéro qui n'est pas le sien.
 *
 * Une coordonnée absente s'omet, elle ne s'invente pas : `identite.email` vaut
 * `null` quand l'adresse est inexploitable, et afficher « Email : » suivi de
 * rien se lit comme une donnée manquante par l'agence.
 */
function SectionIdentite({
  identite,
  joignable,
  suffixe,
}: {
  identite: IdentiteAgence | null;
  joignable: boolean;
  /** Préfixe d'identifiant du panneau. Voir `AgencyPanel`. */
  suffixe: string;
}) {
  if (!identite) return null;

  const nom = typeof identite.nom === "string" && identite.nom !== "" ? identite.nom : null;
  const whatsapp = typeof identite.whatsapp === "string" ? identite.whatsapp : null;
  const lienWhatsapp = typeof identite.lien_whatsapp === "string" ? identite.lien_whatsapp : null;
  const email = typeof identite.email === "string" ? identite.email : null;
  const lienEmail = typeof identite.lien_email === "string" ? identite.lien_email : null;
  const siteWeb = typeof identite.site_web === "string" ? identite.site_web : null;
  const sansContact = lienWhatsapp === null && lienEmail === null && siteWeb === null;

  return (
    <section className="agency-section" aria-labelledby={`agency-titre-identite-${suffixe}`}>
      <h2 className="agency-section-titre" id={`agency-titre-identite-${suffixe}`}>
        {nom ?? "Votre agence"}
      </h2>
      <p className="agency-section-intro">
        {nom
          ? `${nom} s’occupe de votre site. Vous pouvez l’écrire directement, sans chercher un numéro.`
          : "Votre agence s’occupe de votre site."}
      </p>

      {!joignable && (
        <Mention>
          Le suivi en direct n’est pas joignable pour le moment. Les coordonnées
          ci-dessous restent valables, et les demandes envoyées depuis cette page
          sont enregistrées de la même façon.
        </Mention>
      )}

      {sansContact ? (
        <Mention ton="attention">
          Aucune coordonnée n’est publiée pour cette agence pour le moment.
        </Mention>
      ) : (
        <div className="agency-contact">
          {lienWhatsapp ? (
            <a
              className="agency-contact-carte"
              href={lienWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="agency-contact-icone" aria-hidden="true">
                ✆
              </span>
              <span className="agency-contact-texte">
                <span className="agency-contact-libelle">WhatsApp</span>
                <strong className="agency-contact-valeur">{whatsapp ?? lienWhatsapp}</strong>
              </span>
            </a>
          ) : null}

          {lienEmail && email ? (
            <a className="agency-contact-carte" href={lienEmail}>
              <span className="agency-contact-icone" aria-hidden="true">
                ✉
              </span>
              <span className="agency-contact-texte">
                <span className="agency-contact-libelle">Email</span>
                <strong className="agency-contact-valeur">{email}</strong>
              </span>
            </a>
          ) : null}

          {siteWeb ? (
            <a
              className="agency-contact-carte"
              href={siteWeb}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              <span className="agency-contact-icone" aria-hidden="true">
                ◍
              </span>
              <span className="agency-contact-texte">
                <span className="agency-contact-libelle">Site de l’agence</span>
                <strong className="agency-contact-valeur">{siteWeb}</strong>
              </span>
            </a>
          ) : null}
        </div>
      )}

      {identite.mis_a_jour_libelle && (
        <p className="agency-mention agency-mention--pied">
          Coordonnées mises à jour le {identite.mis_a_jour_libelle}.
        </p>
      )}
    </section>
  );
}

/* ========================================================================== *
 * 2. Abonnement
 * ========================================================================== */

/**
 * L'abonnement de l'espace, et ce qu'il faut en comprendre.
 *
 * `abonnement` n'est jamais `null` : `space.ts` produit le repli du contrat
 * (« Aucun abonnement ») quand il n'y a rien en base. Cette section a donc
 * toujours quelque chose à dire, et elle a surtout quelque chose à ne pas dire :
 * un abonnement « actif » n'autorise pas à afficher « Inclus dans votre
 * abonnement » sur une prestation. La couverture se vérifie formule contre
 * formule, et c'est le contrat qui l'a fait — cette section ne fait que
 * reprendre `statut_libelle`, `tarif_libelle`, `periode_libelle`,
 * `fin_libelle`, `jours_restants` et `caracteristiques`.
 *
 * Les trois cas à traiter honnêtement :
 *
 *  - `statut === "aucun"` : ce n'est pas une panne, c'est une situation. Aucun
 *    abonnement ne prive pas d'accès au catalogue ; le commerce se fait par
 *    demande, avec un devis par prestation.
 *  - `statut === "inconnu"` : le code en base n'est pas dans le vocabulaire du
 *    contrat. Le libellé du contrat — « Abonnement à vérifier » — s'affiche,
 *    le code non, et on n'invente ni formule ni échéance pour meubler.
 *  - `resilie` ou `statut === "canceled"` : l'abonnement est terminé. Dire
 *    « Il reste 12 jours » sur un abonnement résilié annoncerait un
 *    renouvellement qui n'existe pas, et le commerçant ne viendrait pas à la
 *    échéance.
 */
function SectionAbonnement({
  abonnement,
  abonnementFacturation,
  lienContact,
  suffixe,
}: {
  abonnement: AbonnementAffiche | null | undefined;
  abonnementFacturation: AgencyBillingSubscription | null;
  lienContact: string | null;
  /** Préfixe d'identifiant du panneau. Voir `AgencyPanel`. */
  suffixe: string;
}) {
  if (!abonnement) return null;

  const statut = abonnementFacturation?.status
    ?? (typeof abonnement.statut === "string" ? abonnement.statut : "inconnu");
  const aucun = statut === "aucun";
  const inconnu = statut === "inconnu";
  const resilie = abonnement.resilie || statut === "canceled";
  const seRenouvelle = abonnementFacturation
    ? !abonnementFacturation.cancel_at_period_end
    : abonnement.se_renouvelle;
  const statutLibelle = abonnementFacturation
    ? decrireStatutAbonnement(statut)
    : abonnement.statut_libelle;
  const caract = Array.isArray(abonnement.caracteristiques) ? abonnement.caracteristiques : [];
  const jours = typeof abonnement.jours_restants === "number" ? abonnement.jours_restants : null;

  return (
    <section className="agency-section" aria-labelledby={`agency-titre-abonnement-${suffixe}`}>
      <h2 className="agency-section-titre" id={`agency-titre-abonnement-${suffixe}`}>
        Abonnement
      </h2>

      {aucun ? (
        <>
          <p className="agency-section-intro">
            {LIBELLE_ABONNEMENT_AUCUN}. Vos demandes sont chiffrées une par une :
            chaque prestation affichée plus bas indique son prix.
          </p>
        </>
      ) : (
        <>
          <div className="agency-entete-encart">
            <h3 className="agency-encart-titre">
              {typeof abonnement.formule === "string" && abonnement.formule !== ""
                ? abonnement.formule
                : LIBELLE_FORMULE_INCONNUE}
            </h3>
            <PastilleStatut
              libelle={statutLibelle}
              jeton={jetonAbonnement(statut)}
            />
          </div>

          <dl className="agency-fiche">
            {abonnement.tarif_libelle && (
              <div className="agency-ligne">
                <dt className="agency-ligne-libelle">Tarif</dt>
                <dd className="agency-ligne-valeur">{abonnement.tarif_libelle}</dd>
              </div>
            )}
            {abonnement.periode_libelle && (
              <div className="agency-ligne">
                <dt className="agency-ligne-libelle">Période</dt>
                <dd className="agency-ligne-valeur">{abonnement.periode_libelle}</dd>
              </div>
            )}
            {abonnement.fin_libelle && (
              <div className="agency-ligne">
                <dt className="agency-ligne-libelle">
                  {resilie ? "Fin" : "Prochaine échéance"}
                </dt>
                <dd className="agency-ligne-valeur">
                  <time dateTime={abonnement.periode_fin ?? undefined}>
                    {abonnement.fin_libelle}
                  </time>
                </dd>
              </div>
            )}
            {seRenouvelle === false && !resilie && (
              <div className="agency-ligne">
                <dt className="agency-ligne-libelle">Renouvellement</dt>
                <dd className="agency-ligne-valeur">Ne se renouvelle pas</dd>
              </div>
            )}
          </dl>

          {jours !== null && !resilie && seRenouvelle === true && (
            <p className="agency-compteur">
              {jours > 1 ? `Il reste ${jours} jours.` : "Il reste un jour."}
            </p>
          )}

          {caract.length > 0 && (
            <>
              <h4 className="agency-sous-titre">Ce que comprend la formule</h4>
              <ul className="agency-caracteristiques">
                {caract.map((ligne, position) => (
                  <li className="agency-caracteristique" key={`${position}-${ligne}`}>
                    {ligne}
                  </li>
                ))}
              </ul>
            </>
          )}

          {inconnu && (
            <Mention ton="attention">
              L’état de cet abonnement est en cours de vérification par l’agence.
            </Mention>
          )}
          {!resilie && (
            <p className="agency-section-intro">
              Les changements de forfait et les résiliations se font auprès de l’agence.
              {lienContact && <> <a className="agency-ancre" href={lienContact}>La contacter</a>.</>}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/* ========================================================================== *
 * 3. Facturation — hors contrat
 * ========================================================================== */

/**
 * Factures impayées de l'espace.
 *
 * Cette section est HORS CONTRAT : `/api/v1/billing` n'est pas sérialisé par le
 * contrat, et ses champs sont bornés par `space.ts`. Deux conséquences Tenues :
 *
 *  - rien ici ne reformule un abonnement. La plateforme renvoie un `subscription`
 *    redondant et un `domain` qui vaut toujours `null` (aucune migration ne
 *    porte de colonne d'expiration de domaine) ; ni l'un ni l'autre n'est lu,
 *    sinon le même abonnement s'afficherait deux fois, avec deux mots.
 *  - un montant passe par `montant_libelle`, que `space.ts` a produit avec
 *    `decrirePrix`. Une facture à zéro s'écrit donc « Inclus », jamais
 *    « 0 F CFA ». La garde `montant_cents === 0` ci-dessous est une seconde
 *    ligne de défense, pas une seconde règle : elle rend la phrase impossible à
 *    écrire même si la normalisation change un jour.
 *
 * `billing_available === false` n'est pas une erreur : c'est la réponse
 * complète que la plateforme fait quand cet espace n'a pas de facturation. Le
 * panneau le dit, et propose le contact direct — pas un écran vide, pas une
 * icône cassée.
 *
 * L'ÉCRAN NE DISPARAÎT PAS QUAND LE COMMERCÉANT VIENT DE PAYER
 * ----------------------------------------------------------
 * Une section qui ne rend rien quand il n'y a aucune facture impayée est
 * correcte au repos. Elle est fausse au retour du prestataire : le
 * commerçant vient d'ouvrir un règlement, la plateforme ne l'a pas encore
 * constaté, la facture est donc encore listée — et si elle ne l'est plus, la
 * section a disparu, et lui ne sait pas si c'est bon signe ou une panne.
 *
 * D'où `paiementOuvert` : la trace laissée par `AgencyInvoicePayment` avant de
 * quitter la page. Elle ne prétend JAMAIS que le paiement aboutira — « en cours
 * de vérification » est la seule formulation honnête, puisque seul le
 * prestataire peut confirmer. Elle rend la section même sans facture, et propose
 * de relire l'espace : c'est ce bouton qui casse la boucle « j'ai payé, je vois
 * encore la facture, je paie encore ».
 */
function SectionFacturation({
  facturation,
  indisponible,
  identite,
  suffixe,
}: {
  facturation: AgencyBilling | null | undefined;
  indisponible: boolean;
  identite: IdentiteAgence | null;
  /** Préfixe d'identifiant du panneau. Voir `AgencyPanel`. */
  suffixe: string;
}) {
  // La trace d'un règlement vient du NAVIGATEUR (`sessionStorage` et l'adresse
  // de retour), donc d'un état externe : `useSyncExternalStore` la lit sans effet
  // ni état local, et l'affiche seulement après l'hydratation. Voir
  // `agency-paiement-client.ts`.
  const paiementOuvert = useSyncExternalStore(
    abonnerTracePaiementOuvert,
    lireTracePaiementOuvert,
    snapshotPaiementOuvertServeur,
  );
  const [relance, setRelance] = useState(false);
  const router = useRouter();


  if (!facturation || typeof facturation !== "object") {
    if (!indisponible) return null;
    const idTitre = "agency-titre-facturation-" + suffixe;
    return (
      <section className="agency-section" aria-labelledby={idTitre}>
        <h2 className="agency-section-titre" id={idTitre}>Facturation</h2>
        <Mention ton="attention">
          La facturation n’a pas pu être consultée. Réessayez dans un instant.
        </Mention>
      </section>
    );
  }

  if (facturation.billing_available !== true) {
    return (
      <section className="agency-section" aria-labelledby={`agency-titre-facturation-${suffixe}`}>
        <h2 className="agency-section-titre" id={`agency-titre-facturation-${suffixe}`}>
          Facturation
        </h2>
        <Mention>
          {typeof facturation.billing_message === "string" && facturation.billing_message !== ""
            ? facturation.billing_message
            : "Cet espace n’a pas de facturation en ligne."}
        </Mention>
      </section>
    );
  }

  const factures = Array.isArray(facturation.unpaid_invoices)
    ? facturation.unpaid_invoices.filter(Boolean)
    : [];
  if (factures.length === 0 && paiementOuvert === null) return null;

  /**
   * Relire l'espace sans changer de page.
   *
   * `router.refresh()` suffit : la route locale de paiement a purgé l'étiquette
   * de cache de l'agence juste avant de répondre, donc le rechargement relit
   * `/api/v1/billing` au lieu de resservir l'état d'avant paiement. C'est
   * exactement ce qu'il faut ici, et c'est pour ça que la purge compte.
   */
  async function verifierLeStatut() {
    setRelance(true);
    try {
      await router.refresh();
    } finally {
      setRelance(false);
    }
  }

  return (
    <section className="agency-section" aria-labelledby={`agency-titre-facturation-${suffixe}`}>
      <h2 className="agency-section-titre" id={`agency-titre-facturation-${suffixe}`}>
        Facturation
      </h2>

      {paiementOuvert !== null && (
        <div className="agency-forfait-retour" role="status" aria-live="polite">
          <p className="agency-forfait-retour-texte">
            Vous avez ouvert le paiement de la facture {paiementOuvert} chez le prestataire.
            Son statut est en cours de vérification : la facture ne sera marquée réglée
            qu’après la confirmation du prestataire.
          </p>
          {factures.length > 0 ? (
            <div>
              <button
                className="agency-bouton agency-bouton--secondaire agency-paiement-bouton"
                type="button"
                onClick={() => void verifierLeStatut()}
                disabled={relance}
                aria-busy={relance}
              >
                {relance ? "Vérification…" : "Vérifier maintenant"}
              </button>
            </div>
          ) : (
            // La facture a disparu des impayées : c'est la seule chose que la
            // plateforme peut affirmer ici, et c'est déjà une information. Aucun
            // bouton « Vérifier » ne reste, il n'aurait plus rien à relire.
            <p className="agency-forfait-retour-texte">
              Aucune facture à régler pour cet espace.
            </p>
          )}
        </div>
      )}

      {factures.length > 0 && (
        <>
          <p className="agency-section-intro">
            {factures.length === 1
              ? "1 facture en attente."
              : `${factures.length} factures en attente.`}
          </p>

          <ul className="agency-factures">
            {factures.map((facture) => (
              <CarteFacture
                key={facture.id}
                facture={facture}
                paiementAutorise={facturation.can_pay_online === true && facture.statut_connu}
                lienContact={identite?.lien_whatsapp ?? identite?.lien_email ?? null}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Le rendu d'une facture, isolé pour que la règle du zéro ne soit écrite qu'une
 * fois : `montant_cents === 0` s'écrit « Inclus » (`LIBELLE_PRIX_INCLUS`), et le
 * montant déjà formaté par `space.ts` s'affiche tel quel quand il est autre.
 * `space.ts` a produit ce texte avec `decrirePrix` ; la garde ci-dessous est une
 * seconde ligne de défense, pas une seconde règle — elle rend la phrase
 * impossible à écrire même si la normalisation change un jour.
 *
 * AUCUN CODE BRUT À L'ÉCRAN, PAS MÊME UN CODE CONNU
 * ------------------------------------------------
 * Le statut d'une facture était affiché tel quel : un commerçant lisait
 * littéralement « open » ou « uncollectible » sur son tableau de bord, en anglais
 * et en snake_case, à côté d'un montant et d'une échéance en français. Le contrat
 * partagé interdit explicitement d'afficher un code, et il ne fournit AUCUN
 * libellé de statut de facture : le connecteur n'en invente donc pas.
 *
 * L'absence de mot est un trou du contrat, pas une raison d'écrire le code. Il
 * est remonté au maître (`LIBELLE_STATUT_FACTURE`, `decrireStatutFacture`) :
 * `open` se dit « à régler » et `uncollectible` « paiement refusé », un
 * commerçant doit savoir que son dernier règlement mobile money a échoué. En
 * attendant, l'information est déjà là ailleurs : la facture est listée dans les
 * factures à régler, et le bouton de règlement est proposé quand la plateforme
 * l'autorise. Ce que le code brut ajoutait, c'était une promesse de rigueur que
 * l'écran ne tenait pas.
 */
function CarteFacture({
  facture,
  paiementAutorise,
  lienContact,
}: {
  facture: AgencyInvoice;
  paiementAutorise: boolean;
  lienContact: string | null;
}) {
  const echeance =
    typeof facture.echeance_le === "string" ? formaterDate(facture.echeance_le) : null;
  return (
    <li className="agency-facture">
      <span className="agency-facture-identite">
        {typeof facture.numero === "string" && facture.numero !== "" ? (
          <strong className="agency-facture-numero">{facture.numero}</strong>
        ) : (
          <span className="agency-mention agency-mention--pied">Facture sans numéro</span>
        )}
      </span>
      <span className="agency-facture-montant">
        {facture.montant_cents === 0 ? LIBELLE_PRIX_INCLUS : facture.montant_libelle}
      </span>
      {echeance && (
        <time className="agency-facture-echeance" dateTime={facture.echeance_le ?? undefined}>
          {echeance}
        </time>
      )}
      {facture.montant_cents > 0 && (
        <AgencyInvoicePayment
          invoiceId={facture.id}
          invoiceLabel={facture.numero ?? "sans numéro"}
          paymentAvailable={paiementAutorise}
          contactUrl={lienContact}
        />
      )}
    </li>
  );
}

/* ========================================================================== *
 * 4. Prestations
 * ========================================================================== */

/**
 * Le catalogue de l'agence.
 *
 * La distinction la plus coûteuse du contrat est respectée ici, et elle est
 * écrite dans le code parce qu'elle ne se voit pas à l'écran :
 *
 *  - `couverte_par_abonnement` est un fait de CATALOGUE : « une formule couvre
 *    cette prestation ». C'est ce que lit l'écran d'administration, pas un
 *    client. L'afficher ici afficherait « couvert » à un abonné d'une formule
 *    qui ne le couvre pas ; il ne paierait pas, et l'agence facture une
 *    prestation qu'elle avait dite incluse.
 *  - `couverture_abonnement` et `couverture_libelle` sont un fait de LECTEUR :
 *    « la formule que CET espace paie en ce moment couvre cette prestation ».
 *    Vérifié formule contre formule par le contrat. C'est le seul des deux qu'un
 *    client a le droit de lire comme une promesse.
 *
 * Donc : seul `couverture_libelle` s'affiche, et jamais `couverte_par_abonnement`
 * — qui n'est même pas lu ici, volontairement, pour qu'une régression future ne
 * puisse pas le faire apparaître par erreur.
 *
 * Le prix s'affiche TOUJOURS, couvert ou non : c'est la réduction qui dépend du
 * lecteur, pas le montant du catalogue. Masquer le prix d'une prestation incluse
 * ferait perdre au commerçant l'information qui lui dit ce qu'il débite.
 */
function SectionPrestations({
  prestations,
  indisponible,
  suffixe,
}: {
  prestations: PrestationAffiche[] | null | undefined;
  /** La plateforme n'a pas répondu : ne pas écrire « aucun service ». */
  indisponible: boolean;
  /** Préfixe d'identifiant du panneau. Voir `AgencyPanel`. */
  suffixe: string;
}) {
  const liste = (Array.isArray(prestations) ? prestations : []).filter(Boolean);
  // Une liste vide et une lecture en échec n'ont pas la même signification, et les
  // confondre ferait écrire « cette agence ne propose aucune prestation » à un
  // commerçant alors que la plateforme répond très bien. `indisponibles` est la
  // seule source de vérité : on ne le recalcule pas ici.
  if (liste.length === 0 && !indisponible) return null;

  return (
    <section className="agency-section" aria-labelledby={`agency-titre-prestations-${suffixe}`}>
      <h2 className="agency-section-titre" id={`agency-titre-prestations-${suffixe}`}>
        Prestations
      </h2>
      <p className="agency-section-intro">
        Ce que l’agence propose pour ce site. Le délai est indicatif.
      </p>

      {liste.length === 0 && (
        <Mention ton="attention">
          Les prestations de l’agence n’ont pas pu être consultées. Réessayez dans un
          instant, ou écrivez à l’agence : il est possible qu’il n’y en ait aucune.
        </Mention>
      )}

      <ul className="agency-prestations">
        {liste.map((prestation) => (
          <li className="agency-prestation" key={prestation.id}>
            <div className="agency-entete-encart">
              <h3 className="agency-encart-titre">{prestation.titre}</h3>
              <PastillePrix prix={prestation.prix} />
            </div>

            {prestation.description && (
              <p className="agency-prestation-texte">{prestation.description}</p>
            )}

            <p className="agency-prestation-meta">
              {prestation.delai_libelle ? (
                <span className="agency-prestation-delai">{prestation.delai_libelle}</span>
              ) : null}
              {/* Fait de LECTEUR : la seule couverture affichable. */}
              {prestation.couverture_libelle && (
                <span className="agency-couverture">{prestation.couverture_libelle}</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ========================================================================== *
 * 6. Annonces — hors contrat
 * ========================================================================== */

/**
 * Les annonces de l'agence, au plus cinq : `space.ts` plafonne la liste, donc
 * ce composant n'a pas à le faire et ne se retrouve jamais avec un mur de
 * texte dans un tiroir de 420 px.
 *
 * `severity` est un texte libre en base, sans contrainte : `space.ts` le ramène
 * à trois valeurs (`info`, `warning`, `critical`) et c'est cette feuille de
 * style qui en tire la couleur. Aucune classe n'est construite ici à partir de
 * la valeur brute.
 */
function SectionAnnonces({
  annonces,
  indisponible,
  suffixe,
}: {
  annonces: AgencyAnnouncement[] | null | undefined;
  /** La plateforme n'a pas répondu : ne pas écrire « aucune nouvelle ». */
  indisponible: boolean;
  /** Préfixe d'identifiant du panneau. Voir `AgencyPanel`. */
  suffixe: string;
}) {
  const liste = (Array.isArray(annonces) ? annonces : []).filter(Boolean);
  if (liste.length === 0 && !indisponible) return null;

  return (
    <section className="agency-section" aria-labelledby={`agency-titre-annonces-${suffixe}`}>
      <h2 className="agency-section-titre" id={`agency-titre-annonces-${suffixe}`}>
        Nouvelles de l’agence
      </h2>
      {liste.length === 0 && (
        <Mention ton="attention">
          Les nouvelles de l’agence n’ont pas pu être consultées. Réessayez dans un
          instant.
        </Mention>
      )}
      <div className="agency-liste">
        {liste.map((annonce) => {
          const publie = typeof annonce.published_at === "string" ? formaterDate(annonce.published_at) : null;
          const finit = typeof annonce.ends_at === "string" ? formaterDate(annonce.ends_at) : null;
          return (
            <article className={`agency-card agency-card-${annonce.severity}`} key={annonce.id}>
              <h3 className="agency-card-titre">{annonce.title}</h3>
              {annonce.body && <p className="agency-card-texte">{annonce.body}</p>}
              {(publie || finit) && (
                <p className="agency-card-pied">
                  {publie ? (
                    <time dateTime={annonce.published_at ?? undefined}>Publié le {publie}</time>
                  ) : null}
                  {publie && finit ? " · " : null}
                  {finit ? (
                    <time dateTime={annonce.ends_at ?? undefined}>Jusqu’au {finit}</time>
                  ) : null}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ========================================================================== *
 * 7. Offres
 * ========================================================================== */

/**
 * Les offres mises en avant, avec leur lien WhatsApp déjà calculé.
 *
 * `OffreAffiche.lien_whatsapp` a été construit par le contrat à partir du
 * numéro de l'agence et du message de l'offre. Sans numéro lisible, il vaut
 * `null` : on rend alors la carte en texte, sans bouton. Un lien cassé
 * produirait un bouton qui ouvre un chat vers personne, et le commerçant
 * croirait que l'offre est périmée.
 */
function SectionOffres({
  offres,
  suffixe,
}: {
  offres: OffreAffiche[] | null | undefined;
  /** Préfixe d'identifiant du panneau. Voir `AgencyPanel`. */
  suffixe: string;
}) {
  const liste = (Array.isArray(offres) ? offres : []).filter(Boolean);
  if (liste.length === 0) return null;

  return (
    <section className="agency-section" aria-labelledby={`agency-titre-offres-${suffixe}`}>
      <h2 className="agency-section-titre" id={`agency-titre-offres-${suffixe}`}>
        Nos autres services
      </h2>
      <p className="agency-section-intro">Pour faire grandir votre boutique.</p>
      <div className="agency-offres">
        {liste.map((offre) => {
          const lien =
            typeof offre.lien_whatsapp === "string" && offre.lien_whatsapp !== ""
              ? offre.lien_whatsapp
              : null;
          return (
            <article className="agency-card agency-offre" key={offre.id}>
              <h3 className="agency-card-titre">{offre.titre}</h3>
              {offre.description && <p className="agency-card-texte">{offre.description}</p>}
              {lien && (
                <a
                  className="agency-bouton agency-bouton--secondaire"
                  href={lien}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  En savoir plus
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
