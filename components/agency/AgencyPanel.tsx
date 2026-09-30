"use client";

import { FormulaireNouvelleDemande } from "./agency-formulaire";
import { ListeDemandes } from "./agency-demandes";
import {
  Mention,
  PastillePrix,
  PastilleStatut,
  jetonAbonnement,
} from "./agency-commun";
import {
  LIBELLE_ABONNEMENT_AUCUN,
  LIBELLE_PRIX_INCLUS,
  formaterDate,
} from "@/lib/agency/contrat-partage";
import type {
  AbonnementAffiche,
  AgencyAnnouncement,
  AgencyBilling,
  AgencyInvoice,
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
};

export function AgencyPanel({
  space,
  requesterName,
  requesterEmail,
  routeDemande,
  routeRevalidation,
  cheminRevalidation,
}: AgencyPanelProps) {
  // La garde d'or. Elle est aussi placée sur chaque section, parce qu'un objet
  // normalisé par le réseau peut porter une liste `undefined` : deux lignes, pas
  // une, et la page du dashboard ne tombe jamais.
  if (!space) return null;

  const identite = space.identite ?? null;

  return (
    <div className="agency-panneau">
      <SectionIdentite identite={identite} joignable={space.joignable !== false} />
      <SectionAbonnement abonnement={space.abonnement} />
      <SectionFacturation facturation={space.facturation} identite={identite} />
      <SectionPrestations prestations={space.prestations} />
      <ListeDemandes demandes={space.demandes} />
      <SectionAnnonces annonces={space.annonces} />
      <SectionOffres offres={space.offres} />
      <FormulaireNouvelleDemande
        prestations={space.prestations}
        requesterName={requesterName}
        requesterEmail={requesterEmail}
        routeDemande={routeDemande}
        routeRevalidation={routeRevalidation}
        cheminRevalidation={cheminRevalidation}
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
}: {
  identite: IdentiteAgence | null;
  joignable: boolean;
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
    <section className="agency-section" aria-labelledby="agency-titre-identite">
      <h2 className="agency-section-titre" id="agency-titre-identite">
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
function SectionAbonnement({ abonnement }: { abonnement: AbonnementAffiche | null | undefined }) {
  if (!abonnement) return null;

  const statut = typeof abonnement.statut === "string" ? abonnement.statut : "inconnu";
  const aucun = statut === "aucun";
  const inconnu = statut === "inconnu";
  const caract = Array.isArray(abonnement.caracteristiques) ? abonnement.caracteristiques : [];
  const jours = typeof abonnement.jours_restants === "number" ? abonnement.jours_restants : null;

  return (
    <section className="agency-section" aria-labelledby="agency-titre-abonnement">
      <h2 className="agency-section-titre" id="agency-titre-abonnement">
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
                : "Formule"}
            </h3>
            <PastilleStatut
              libelle={abonnement.statut_libelle}
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
                  {abonnement.resilie ? "Fin" : "Prochaine échéance"}
                </dt>
                <dd className="agency-ligne-valeur">
                  <time dateTime={abonnement.periode_fin ?? undefined}>
                    {abonnement.fin_libelle}
                  </time>
                </dd>
              </div>
            )}
            {abonnement.se_renouvelle === false && !abonnement.resilie && (
              <div className="agency-ligne">
                <dt className="agency-ligne-libelle">Renouvellement</dt>
                <dd className="agency-ligne-valeur">Ne se renouvelle pas</dd>
              </div>
            )}
          </dl>

          {jours !== null && !abonnement.resilie && abonnement.se_renouvelle === true && (
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
 */
function SectionFacturation({
  facturation,
  identite,
}: {
  facturation: AgencyBilling | null | undefined;
  identite: IdentiteAgence | null;
}) {
  if (!facturation || typeof facturation !== "object") return null;

  if (facturation.billing_available !== true) {
    return (
      <section className="agency-section" aria-labelledby="agency-titre-facturation">
        <h2 className="agency-section-titre" id="agency-titre-facturation">
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
  if (factures.length === 0) return null;

  // Le bouton de paiement n'apparaît que si la plateforme autorise le paiement
  // en ligne ET fournit une vraie URL. Un lien vers un portail alors que le
  // paiement en ligne est désactivé enverrait le commerçant dans un cul-de-sac
  // et le ferait conclure à une panne.
  const portal = typeof facturation.portal_url === "string" ? facturation.portal_url : null;
  const payable = facturation.can_pay_online === true && portal !== null;

  return (
    <section className="agency-section" aria-labelledby="agency-titre-facturation">
      <h2 className="agency-section-titre" id="agency-titre-facturation">
        Facturation
      </h2>
      <p className="agency-section-intro">
        {factures.length === 1
          ? "1 facture en attente."
          : `${factures.length} factures en attente.`}
      </p>

      <ul className="agency-factures">
        {factures.map((facture) => (
          <CarteFacture key={facture.id} facture={facture} />
        ))}
      </ul>

      {payable ? (
        <a
          className="agency-bouton agency-bouton--plein"
          href={portal ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          Voir et payer
        </a>
      ) : (
        <p className="agency-section-intro">
          Le paiement en ligne n’est pas disponible pour cette facture. Écrivez à
          l’agence
          {identite?.lien_whatsapp ? (
            <>
              {" "}
              <a
                className="agency-ancre"
                href={identite.lien_whatsapp}
                target="_blank"
                rel="noopener noreferrer"
              >
                sur WhatsApp
              </a>
            </>
          ) : identite?.lien_email ? (
            <>
              {" "}
              <a className="agency-ancre" href={identite.lien_email}>
                par email
              </a>
            </>
          ) : (
            " pour la régler."
          )}
          .
        </p>
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
 * Le statut d'une facture reste un CODE : la plateforme n'en fournit aucun
 * libellé et le connecteur n'en invente pas. Un code connu est affiché tel quel,
 * un code inconnu n'est pas affiché.
 */
function CarteFacture({ facture }: { facture: AgencyInvoice }) {
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
        {facture.statut_connu === true && typeof facture.statut === "string" && (
          <span className="agency-facture-statut">{facture.statut}</span>
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
function SectionPrestations({ prestations }: { prestations: PrestationAffiche[] | null | undefined }) {
  const liste = (Array.isArray(prestations) ? prestations : []).filter(Boolean);
  if (liste.length === 0) return null;

  return (
    <section className="agency-section" aria-labelledby="agency-titre-prestations">
      <h2 className="agency-section-titre" id="agency-titre-prestations">
        Prestations
      </h2>
      <p className="agency-section-intro">
        Ce que l’agence propose pour ce site. Le délai est indicatif.
      </p>

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
function SectionAnnonces({ annonces }: { annonces: AgencyAnnouncement[] | null | undefined }) {
  const liste = (Array.isArray(annonces) ? annonces : []).filter(Boolean);
  if (liste.length === 0) return null;

  return (
    <section className="agency-section" aria-labelledby="agency-titre-annonces">
      <h2 className="agency-section-titre" id="agency-titre-annonces">
        Nouvelles de l’agence
      </h2>
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
function SectionOffres({ offres }: { offres: OffreAffiche[] | null | undefined }) {
  const liste = (Array.isArray(offres) ? offres : []).filter(Boolean);
  if (liste.length === 0) return null;

  return (
    <section className="agency-section" aria-labelledby="agency-titre-offres">
      <h2 className="agency-section-titre" id="agency-titre-offres">
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
