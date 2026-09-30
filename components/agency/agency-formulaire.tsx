"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LIBELLE_OBJET_INCONNU,
  MESSAGE_DEMANDE_ENVOYEE,
  formaterEmail,
} from "@/lib/agency/contrat-partage";
import type { DemandeAffiche, PrestationAffiche } from "@/lib/agency/types";
import { Invisible, estUuid } from "./agency-commun";

/**
 * Formulaire « Nouvelle demande », à la fin du panneau.
 *
 * Le navigateur écrit ici, et seulement ici. Il n'appelle jamais la plateforme :
 * il appelle la route du site client, `/api/agency/request`, qui relaie vers
 * `/api/v1/agency/requests` en gardant la clé du site côté serveur. C'est la
 * raison d'être du connecteur : `MGS_SITE_SECRET` ne sort jamais du serveur, et
 * un formulaire qui appellerait la plateforme depuis le navigateur l'enverrait
 * dans le JavaScript de la page, lisible par tous les visiteurs.
 *
 * Le corps envoyé reprend le schéma réel de la plateforme
 * (`plateforme/lib/agency-validation.ts`, `schemaDemande`), et seulement lui :
 *
 *   service_id        obligatoire, un `uuid` de prestation du catalogue affiché
 *   requester_name    2 à 120 caractères
 *   requester_email   adresse valide, 254 caractères au plus
 *   requester_phone   facultatif, 24 caractères au plus
 *   subject           3 à 160 caractères
 *   description       10 à 4000 caractères
 *
 * Les bornes sont CONTRAINTE-FI : elles sont reproduites dans les `maxLength` et
 * dans la validation locale, pour que le commerçant voie la faute avant l'envoi
 * et non après. Le serveur reste seul juge — notamment du fait qu'un téléphone
 * soit burkinabé, ce que ni le contrat ni ce formulaire ne peuvent savoir — et
 * son message d'erreur est celui qui s'affiche à l'écran quand il refuse.
 *
 * Trois décisions qui ne s'expliquent pas d'elles-mêmes :
 *
 *  - UNE PRESTATION CHOISIE, JAMAIS UN TEXTE LIBRE. Le serveur valide
 *    `service_id` contre le catalogue de l'espace et répond « Cette prestation
 *    n'existe pas » à une invention. Sans liste déroulante, un commercial
 *    hätte à recopier un identifiant, et raterait une fois sur deux. Le
 *    catalogue affiché est donc l'unique source des options ; une prestation
 *    dont l'identifiant n'est pas un `uuid` n'y entre pas, parce qu'elle
 *    produirait un refus incompréhensible.
 *  - `noValidate` SUR LE FORMULAIRE. La validation native du navigateur parle
 *    anglais dans une moitié des cas et son message d'accessibilité n'est pas
 *    contrôlable. Les messages du formulaire sont donc écrits ici, en français,
 *    et c'est la seule validation qui s'affiche.
 *  - LA SAISIE N'EST JAMAIS PERDUE. Une erreur d'envoi — réseau coupé, 503 de
 *    la plateforme — laisse chaque champ intact. Effacer ce qu'un commerçant a
 *    écrit après dix minutes de rédaction pour lui rendre la main sur un
 *    formulaire vide, c'est lui faire recommencer, et il ne recommencera pas.
 */

export type FormulaireNouvelleDemandeProps = {
  /** Catalogue affiché : la seule liste de prestations proposable ici. */
  prestations?: PrestationAffiche[] | null;
  /** Route locale de création. Par défaut `/api/agency/request`. */
  routeDemande?: string;
  /**
   * Route de purge du cache, appelée sans être attendue après un envoi.
   *
   * Volontairement `null` par défaut : la route du connecteur est réservée à
   * l'administrateur du site, un visiteur ne peut donc pas l'appeler. Un site qui
   * expose sa propre purge publique passe son URL ici.
   */
  routeRevalidation?: string | null;
  /** Chemin du site à revalider. Par défaut `/`. */
  cheminRevalidation?: string;
  requesterName?: string;
  requesterEmail?: string;
};

/** Bornes du serveur, reproduites ici. Toute divergence se voit au premier envoi. */
const BORNES = {
  nom: { min: 2, max: 120 },
  email: { max: 254 },
  telephone: { max: 24 },
  objet: { min: 3, max: 160 },
  description: { min: 10, max: 4000 },
} as const;

/** Forme de la réponse de création, telle que la plateforme la renvoie. */
type ReponseCreation = {
  demande?: DemandeAffiche;
  message?: string;
};

/** Forme de la réponse d'erreur : `error` en français, `champs` pour le formulaire. */
type ReponseErreur = { error?: unknown; champs?: unknown };

/** État d'un envoi. Un seul état à la fois : jamais deux bandeaux qui se contredisent. */
type EtatEnvoi = "repos" | "envoi" | "envoye" | "erreur";

export function FormulaireNouvelleDemande({
  prestations,
  routeDemande = "/api/agency/request",
  routeRevalidation = null,
  cheminRevalidation = "/",
  requesterName = "",
  requesterEmail = "",
}: FormulaireNouvelleDemandeProps) {
  const [serviceId, setServiceId] = useState("");
  const [nom, setNom] = useState(requesterName);
  const [email, setEmail] = useState(requesterEmail);
  const [telephone, setTelephone] = useState("");
  const [objet, setObjet] = useState("");
  const [description, setDescription] = useState("");
  const [etat, setEtat] = useState<EtatEnvoi>("repos");
  const [erreur, setErreur] = useState("");
  const [champs, setChamps] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<{ message: string; reference: string } | null>(null);
  // Le champ qui a échoué reçoit le focus après une erreur : sans cela, le
  // commerçant voit un bandeau rouge et ne sait pas lequel des six champs
  // corriger. La clef est le nom du champ, parce que c'est le seul identifiant
  // que le serveur renvoie dans `champs`.
  const champsRef = useRef<Record<string, HTMLElement | null>>({});
  const attacher = useCallback(
    (nom: string) => (nœud: HTMLElement | null) => {
      champsRef.current[nom] = nœud;
    },
    [],
  );

  useEffect(() => {
    if (etat !== "erreur" || champs.length === 0) return;
    const cible = champs.map((nom) => champsRef.current[nom]).find(Boolean);
    cible?.focus();
  }, [etat, champs]);

  // Seules les prestations réellement proposables entrent dans la liste : un
  // identifiant absent ou qui n'est pas un `uuid` serait refusé par le serveur
  // avec un message que le commerçant lirait comme une faute de sa part.
  const catalogue = useMemo(
    () => (Array.isArray(prestations) ? prestations : []).filter((p) => p && estUuid(p.id)),
    [prestations],
  );

  const revalider = useCallback(() => {
    // Purge du cache, sans être attendue et sans jamais faire échouer l'envoi :
    // une route absente ou lente ne doit pas transformer une demande envoyée en
    // demande qui a échoué. Le commerçant a déjà sa confirmation, elle est
    // vraie ; seule la liste du dessus sera à jour au prochain rendu.
    //
    // L'appel est OPT-IN, et c'est délibéré. La route `/api/agency/revalidate`
    // livrée avec le connecteur n'accepte que l'administrateur du site
    // (`lireSessionAdmin`) : un visiteur qui remplit ce formulaire n'a aucune
    // session, donc cet appel ne peut aboutir que par un 403. L'appeler quand
    // même afficherait dans la console une requête rejetée en 403, et
    // laisserait croire à une mention cassée. Un site qui expose sa propre purge
    // publique n'a qu'à passer `routeRevalidation`.
    if (typeof routeRevalidation !== "string" || routeRevalidation === "") return;
    try {
      void fetch(routeRevalidation, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-MGS-Revalidate": "1" },
        body: JSON.stringify({ chemins: [cheminRevalidation] }),
      }).catch(() => undefined);
    } catch {
      // Un `fetch` synchrone qui leve signifie un environnement sans navigateur :
      // il n'y a rien à faire, et surtout rien à signaler à l'utilisateur.
    }
  }, [routeRevalidation, cheminRevalidation]);

  const envoyer = useCallback(
    async (evenement: React.FormEvent<HTMLFormElement>) => {
      evenement.preventDefault();
      const valeurs = valider({ serviceId, nom, email, telephone, objet, description });
      setChamps(valeurs.manquants);
      if (valeurs.erreur !== "" || valeurs.manquants.length > 0) {
        setEtat("erreur");
        setErreur(
          valeurs.erreur !== ""
            ? valeurs.erreur
            : "Complétez les champs signalés avant d’envoyer votre demande.",
        );
        return;
      }

      setEtat("envoi");
      setErreur("");
      setChamps([]);

      try {
        const reponse = await fetch(routeDemande, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_id: serviceId.trim(),
            requester_name: nom.trim(),
            requester_email: email.trim().toLowerCase(),
            ...(telephone.trim() === "" ? {} : { requester_phone: telephone.trim() }),
            subject: objet.trim(),
            description: description.trim(),
          }),
        });

        const corps = (await reponse.json().catch(() => null)) as
          | ReponseCreation
          | ReponseErreur
          | null;

        if (!reponse.ok) {
          const erreurServeur = corps as ReponseErreur | null;
          setEtat("erreur");
          setErreur(
            typeof erreurServeur?.error === "string" && erreurServeur.error !== ""
              ? erreurServeur.error
              : "Votre demande n’a pas pu être envoyée. Réessayez dans un instant.",
          );
          setChamps(Array.isArray(erreurServeur?.champs) ? erreurServeur.champs.filter((c) => typeof c === "string") : []);
          return;
        }

        const succes = corps as ReponseCreation | null;
        // Le message de confirmation vient de la plateforme, qui l'a choisi selon
        // la couverture d'abonnement. Une demande incluse n'attend aucun devis,
        // et annoncer « l'agence vous répond avec un devis » dans ce cas
        // mettrait le commerçant en attente d'une étape qui n'aura pas lieu.
        setConfirmation({
          message:
            typeof succes?.message === "string" && succes.message !== ""
              ? succes.message
              : MESSAGE_DEMANDE_ENVOYEE,
          reference:
            typeof succes?.demande?.reference === "string" && succes.demande.reference !== ""
              ? succes.demande.reference
              : LIBELLE_OBJET_INCONNU,
        });
        setEtat("envoye");
        // Le nom, l'email et le téléphone appartiennent à la personne, pas à la
        // demande : ils restent pré-remplis pour une seconde demande. L'objet et
        // la description, eux, n'appartiennent qu'à celle-ci.
        setObjet("");
        setDescription("");
        setServiceId("");
        revalider();
      } catch {
        // Réseau coupé, route absente, réponse HTML : la saisie est intacte.
        setEtat("erreur");
        setErreur("Votre demande n’a pas pu être envoyée. Réessayez dans un instant.");
      }
    },
    [serviceId, nom, email, telephone, objet, description, routeDemande, revalider],
  );

  if (catalogue.length === 0) {
    // Sans prestation proposable, il n'y a rien à choisir et donc rien à
    // envoyer. Le dire vaut mieux qu'un formulaire désactivé sans raison : le
    // commerçant croirait à un bug du site.
    return (
      <section className="agency-section" aria-labelledby="agency-titre-demande">
        <h2 className="agency-section-titre" id="agency-titre-demande">
          Nouvelle demande
        </h2>
        <p className="agency-section-intro">
          Aucune prestation n’est proposée pour le moment. Écrivez directement à
          l’agence : la demande sera enregistrée de la même façon.
        </p>
      </section>
    );
  }

  const enCours = etat === "envoi";

  return (
    <section className="agency-section" aria-labelledby="agency-titre-demande">
      <h2 className="agency-section-titre" id="agency-titre-demande">
        Nouvelle demande
      </h2>
      <p className="agency-section-intro">
        Choisissez une prestation et dites ce que vous attendez. L’agence répond
        sur cette même page.
      </p>

      {confirmation && (
        <p className="agency-retour agency-retour--ok" role="status" aria-live="polite">
          {confirmation.message}
          {confirmation.reference !== LIBELLE_OBJET_INCONNU ? (
            <span className="agency-retour-detail">Référence {confirmation.reference}.</span>
          ) : null}
        </p>
      )}

      {erreur !== "" && (
        <p className="agency-retour agency-retour--erreur" role="alert">
          {erreur}
        </p>
      )}

      <form className="agency-formulaire" onSubmit={envoyer} noValidate>
        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor="agency-demande-prestation">
            Prestation
          </label>
          <select
            className="agency-saisie"
            id="agency-demande-prestation"
            name="service_id"
            value={serviceId}
            required
            aria-invalid={champs.includes("service_id") || undefined}
            aria-describedby="agency-aide-prestation"
            ref={attacher("service_id")}
            onChange={(e) => {
              setServiceId(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          >
            <option value="">Choisissez une prestation…</option>
            {catalogue.map((prestation) => (
              <option key={prestation.id} value={prestation.id}>
                {prestation.titre}
                {prestation.prix?.libelle ? ` — ${prestation.prix.libelle}` : ""}
              </option>
            ))}
          </select>
          <p className="agency-aide" id="agency-aide-prestation">
            Seules les prestations publiées par l’agence peuvent être demandées.
          </p>
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor="agency-demande-nom">
            Votre nom
          </label>
          <input
            className="agency-saisie"
            id="agency-demande-nom"
            name="requester_name"
            type="text"
            autoComplete="name"
            value={nom}
            required
            minLength={BORNES.nom.min}
            maxLength={BORNES.nom.max}
            aria-invalid={champs.includes("requester_name") || undefined}
            ref={attacher("requester_name")}
            onChange={(e) => {
              setNom(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor="agency-demande-email">
            Votre email
          </label>
          <input
            className="agency-saisie"
            id="agency-demande-email"
            name="requester_email"
            type="email"
            autoComplete="email"
            value={email}
            required
            maxLength={BORNES.email.max}
            aria-invalid={champs.includes("requester_email") || undefined}
            ref={attacher("requester_email")}
            onChange={(e) => {
              setEmail(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor="agency-demande-telephone">
            Téléphone
            <Invisible> (facultatif)</Invisible>
          </label>
          <input
            className="agency-saisie"
            id="agency-demande-telephone"
            name="requester_phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={telephone}
            maxLength={BORNES.telephone.max}
            placeholder="+226 70 12 34 56"
            aria-invalid={champs.includes("requester_phone") || undefined}
            aria-describedby="agency-aide-telephone"
            ref={attacher("requester_phone")}
            onChange={(e) => {
              setTelephone(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
          <p className="agency-aide" id="agency-aide-telephone">
            Facultatif. Format burkinabè : +226 70 12 34 56.
          </p>
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor="agency-demande-objet">
            L’objet
          </label>
          <input
            className="agency-saisie"
            id="agency-demande-objet"
            name="subject"
            type="text"
            value={objet}
            required
            minLength={BORNES.objet.min}
            maxLength={BORNES.objet.max}
            aria-invalid={champs.includes("subject") || undefined}
            ref={attacher("subject")}
            onChange={(e) => {
              setObjet(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor="agency-demande-description">
            La description
          </label>
          <textarea
            className="agency-saisie agency-saisie--zone"
            id="agency-demande-description"
            name="description"
            rows={5}
            value={description}
            required
            minLength={BORNES.description.min}
            maxLength={BORNES.description.max}
            placeholder="Décrivez ce que vous souhaitez : la page concernée, le texte, la date limite…"
            aria-invalid={champs.includes("description") || undefined}
            ref={attacher("description")}
            onChange={(e) => {
              setDescription(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
        </div>

        <button className="agency-bouton" type="submit" disabled={enCours}>
          {enCours ? "Envoi en cours…" : "Envoyer ma demande"}
        </button>
      </form>
    </section>
  );
}

/**
 * Validation locale, en français, avec les bornes du serveur.
 *
 * Elle ne remplace pas le serveur et ne prétend pas le remplacer : elle évite
 * un aller-retour pour une faute évidente, et elle garantit que le message
 * affiché est dans la langue du formulaire. Le seul contrôle qu'elle ne fait
 * pas est le numéro burkinabé — `formaterTelephone` du contrat accepte un
 * numéro étranger à l'affichage, alors que la plateforme refuse tout ce qui
 * n'est pas burkinabé à l'écriture. Le serveur tranche, et son message s'affiche.
 */
function valider(donnees: {
  serviceId: string;
  nom: string;
  email: string;
  telephone: string;
  objet: string;
  description: string;
}): { erreur: string; manquants: string[] } {
  const manquants: string[] = [];

  if (!estUuid(donnees.serviceId.trim())) manquants.push("service_id");
  if (donnees.nom.trim().length < BORNES.nom.min) manquants.push("requester_name");
  if (formaterEmail(donnees.email.trim()) === null) manquants.push("requester_email");
  if (
    donnees.telephone.trim() !== "" &&
    !/^[+\d][\d\s.-]{7,23}$/.test(donnees.telephone.trim())
  ) {
    manquants.push("requester_phone");
  }
  if (donnees.objet.trim().length < BORNES.objet.min) manquants.push("subject");
  if (donnees.description.trim().length < BORNES.description.min) manquants.push("description");

  let erreur = "";
  if (manquants.includes("service_id")) erreur = "Choisissez la prestation dont vous avez besoin.";
  else if (manquants.includes("requester_email")) erreur = "Écrivez une adresse email valide.";
  else if (manquants.includes("requester_phone")) erreur = "Numéro invalide : utilisez le format +226 70 12 34 56.";
  else if (manquants.includes("requester_name")) erreur = "Indiquez votre nom (2 caractères minimum).";
  else if (manquants.includes("subject")) erreur = "Donnez un objet à votre demande (3 caractères minimum).";
  else if (manquants.includes("description")) erreur = "Décrivez votre demande en quelques mots (10 caractères minimum).";

  return { erreur, manquants };
}