"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  /**
   * Préfixe d'identifiant du panneau.
   *
   * Le formulaire ne l'utilise PAS : ses identifiants viennent de `useId`, donc
   * uniques par montage. La prop existe pour que `AgencyPanel` passe le même
   * objet de props aux deux sections sans avoir à connaître ce que chacune en
   * fait — et pour que le typage du panneau reste stable si le formulaire
   * devient, lui aussi, instanciable plusieurs fois.
   */
  suffixe?: string;
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
  // Le message À CHAQUE champ en erreur, pas un message unique : le résumé
  // d'erreurs et le texte sous le champ doivent dire la même chose.
  const [messages, setMessages] = useState<Record<string, string>>({});
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

  // Les identifiants du formulaire ne sont PAS des constantes en dur.
  //
  // Le panneau peut être monté plusieurs fois sur une même page — un bouton
  // flottant, plus le même panneau rendu dans un autre coin — et des `id` en dur
  // feraient pointer le `htmlFor` d'une étiquette vers le champ d'une AUTRE
  // occurrence. Le clic sur le label n'aurait plus d'effet, le focus irait au
  // mauvais endroit, et un lecteur d'écran annoncerait l'étiquette d'un champ
  // en devant un autre. `useId` donne une racine unique par montage.
  //
  // Le `replace` n'est pas cosmétique : `useId` rend des `:` dans sa valeur, et
  // un `id` contenant `:` casse les sélecteurs CSS — dont ceux qu'un site client
  // peut écrire sur ses propres styles. Les identifiants restent lisibles.
  const racine = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cid = (nom: string) => `agency-${nom}-${racine}`;

  // Le focus part sur le RÉSUMÉ, pas sur le premier champ.
  //
  // Un focus direct sur le premier champ semble plus efficace, et c'est faux : le
  // commerçant ne sait pas encore qu'il y a un problème, et son premier réflexe
  // est de taper au hasard. Le résumé annonce ce qui ne va pas et propose un lien
  // par champ ; il se lit en une phrase, puis un lien mène exactement au champ.
  // C'est ce que demande le critère 3.3.1, et c'est aussi ce qui fonctionne à la
  // souris comme au clavier.
  const resumeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (etat !== "erreur" || champs.length === 0) return;
    resumeRef.current?.focus();
  }, [etat, champs]);

  // Seules les prestations réellement proposables entrent dans la liste : un
  // identifiant absent ou qui n'est pas un `uuid` serait refusé par le serveur
  // avec un message que le commerçant lirait comme une faute de sa part.
  const catalogue = useMemo(
    () => (Array.isArray(prestations) ? prestations : []).filter((p) => p && estUuid(p.id)),
    [prestations],
  );
  const prestationChoisie = catalogue.find((prestation) => prestation.id === serviceId) ?? null;

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
      setMessages(valeurs.messages);
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
      setMessages({});

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
          const messageServeur =
            typeof erreurServeur?.error === "string" && erreurServeur.error !== ""
              ? erreurServeur.error
              : "Votre demande n’a pas pu être envoyée. Réessayez dans un instant.";
          setErreur(messageServeur);
          // Le serveur ne renvoie qu'UN texte et la liste des champs fautifs. Ce
          // texte est reporté sous chacun d'eux : c'est la seule information
          // disponible, et la répéter est plus utile qu'un champ marqué en erreur
          // sans aucune explication à côté.
          const champsServeur = Array.isArray(erreurServeur?.champs)
            ? erreurServeur.champs.filter((c): c is string => typeof c === "string")
            : [];
          setChamps(champsServeur);
          setMessages(
            Object.fromEntries(champsServeur.map((champ) => [champ, messageServeur])),
          );
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
      <section className="agency-section" aria-labelledby={cid("titre-demande")}>
        <h2 className="agency-section-titre" id={cid("titre-demande")}>
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
  const fautifs = champs.filter((nom) => messages[nom] !== undefined);

  // Le `describedby` d'un champ : son aide, puis son message d'erreur s'il y en a
  // un. L'ordre compte — le lecteur d'écran lit d'abord l'usage du champ, puis ce
  // qui ne va pas. Un seul identifiant ne suffirait pas : le message d'erreur
  // remplacerait alors l'aide, et le champ perdrait sa mode d'emploi au moment
  // précis où l'utilisateur en a le plus besoin.
  const decrire = (nom: string, aide?: string) => {
    const ids = [];
    if (aide !== undefined) ids.push(aide);
    if (messages[nom] !== undefined) ids.push(cid(`erreur-${nom}`));
    return ids.length === 0 ? undefined : ids.join(" ");
  };

  return (
    <section className="agency-section" aria-labelledby={cid("titre-demande")}>
      <h2 className="agency-section-titre" id={cid("titre-demande")}>
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

      {/*
        Le bandeau ne s'affiche que pour une erreur SANS champ fautif : réseau
        coupé, 503, 500. Dès qu'un ou plusieurs champs sont en cause, c'est le
        résumé qui parle — afficher les deux répéterait le même texte deux fois,
        et deux fois la même annonce est le plus sûr moyen de faire rater une
        alerte à quelqu'un qui l'attend.
      */}
      {erreur !== "" && fautifs.length === 0 && (
        <p className="agency-retour agency-retour--erreur" role="alert">
          {erreur}
        </p>
      )}

      {/*
        Le RÉSUMÉ D'ERREURS. `role="alert"` le fait annoncer dès son apparition,
        et `tabIndex={-1}` permet de le recevoir au focus : sans cela le
        changement de focus est muet, et une personne qui navigue au clavier
        verrait le focus disparaître du formulaire sans savoir pourquoi.

        `role="alert"` ET le focus sont volontairement cumulés : l'alerte prévient
        les lecteurs d'écran qui écoutent en continu, le focus prévient ceux qui
        naviguent au clavier et n'écoutent rien. Aucun des deux ne suffit seul.
      */}
      {fautifs.length > 0 && (
        <div
          ref={resumeRef}
          className="agency-retour agency-retour--erreur"
          role="alert"
          tabIndex={-1}
        >
          <p className="agency-retour-titre">
            {fautifs.length === 1
              ? "Un champ doit être corrigé avant l’envoi."
              : `${fautifs.length} champs doivent être corrigés avant l’envoi.`}
          </p>
          <ul className="agency-resume-erreurs">
            {fautifs.map((nom) => (
              <li key={nom}>
                <a
                  className="agency-resume-lien"
                  href={`#${cid(nom)}`}
                  onClick={(e) => {
                    // Un lien `#id` ferait défiler la page vers le haut du champ ;
                    // le focus, lui, va au bon endroit. On.preventDefault() et on
                    // déplace le focus nous-mêmes, pour que les deux navigation —
                    // visuelle et focus — partent du même endroit.
                    e.preventDefault();
                    champsRef.current[nom]?.focus();
                  }}
                >
                  {NOMS_LISIBLES[nom] ?? nom} : {messages[nom]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="agency-formulaire" onSubmit={envoyer} noValidate>
        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor={cid("service_id")}>
            Prestation
          </label>
          <select
            className="agency-saisie"
            id={cid("service_id")}
            name="service_id"
            value={serviceId}
            required
            aria-invalid={champs.includes("service_id") || undefined}
            aria-describedby={decrire("service_id", cid("aide-service_id"))}
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
                {prestation.formation_gestion ? " — formation initiale incluse sous condition" : ""}
              </option>
            ))}
          </select>
          <p className="agency-aide" id={cid("aide-service_id")}>
            {prestationChoisie?.formation_gestion
              ? "La première formation est incluse une fois après paiement de la création de ce site. Sinon, le tarif de renouvellement s’applique ; l’agence confirme la règle après votre demande."
              : "Seules les prestations publiées par l’agence peuvent être demandées."}
          </p>
          <MessageChamp id={cid("erreur-service_id")} texte={messages.service_id} />
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor={cid("requester_name")}>
            Votre nom
          </label>
          <input
            className="agency-saisie"
            id={cid("requester_name")}
            name="requester_name"
            type="text"
            autoComplete="name"
            value={nom}
            required
            minLength={BORNES.nom.min}
            maxLength={BORNES.nom.max}
            aria-invalid={champs.includes("requester_name") || undefined}
            aria-describedby={decrire("requester_name")}
            ref={attacher("requester_name")}
            onChange={(e) => {
              setNom(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
          <MessageChamp id={cid("erreur-requester_name")} texte={messages.requester_name} />
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor={cid("requester_email")}>
            Votre email
          </label>
          <input
            className="agency-saisie"
            id={cid("requester_email")}
            name="requester_email"
            type="email"
            autoComplete="email"
            value={email}
            required
            maxLength={BORNES.email.max}
            aria-invalid={champs.includes("requester_email") || undefined}
            aria-describedby={decrire("requester_email")}
            ref={attacher("requester_email")}
            onChange={(e) => {
              setEmail(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
          <MessageChamp id={cid("erreur-requester_email")} texte={messages.requester_email} />
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor={cid("requester_phone")}>
            Téléphone
            <Invisible> (facultatif)</Invisible>
          </label>
          <input
            className="agency-saisie"
            id={cid("requester_phone")}
            name="requester_phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={telephone}
            maxLength={BORNES.telephone.max}
            placeholder="+226 70 12 34 56"
            aria-invalid={champs.includes("requester_phone") || undefined}
            aria-describedby={decrire("requester_phone", cid("aide-requester_phone"))}
            ref={attacher("requester_phone")}
            onChange={(e) => {
              setTelephone(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
          <p className="agency-aide" id={cid("aide-requester_phone")}>
            Facultatif. Format burkinabè : +226 70 12 34 56.
          </p>
          <MessageChamp id={cid("erreur-requester_phone")} texte={messages.requester_phone} />
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor={cid("subject")}>
            L’objet
          </label>
          <input
            className="agency-saisie"
            id={cid("subject")}
            name="subject"
            type="text"
            value={objet}
            required
            minLength={BORNES.objet.min}
            maxLength={BORNES.objet.max}
            aria-invalid={champs.includes("subject") || undefined}
            aria-describedby={decrire("subject")}
            ref={attacher("subject")}
            onChange={(e) => {
              setObjet(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
          <MessageChamp id={cid("erreur-subject")} texte={messages.subject} />
        </div>

        <div className="agency-champ">
          <label className="agency-etiquette" htmlFor={cid("description")}>
            La description
          </label>
          <textarea
            className="agency-saisie agency-saisie--zone"
            id={cid("description")}
            name="description"
            rows={5}
            value={description}
            required
            minLength={BORNES.description.min}
            maxLength={BORNES.description.max}
            placeholder="Décrivez ce que vous souhaitez : la page concernée, le texte, la date limite…"
            aria-invalid={champs.includes("description") || undefined}
            aria-describedby={decrire("description")}
            ref={attacher("description")}
            onChange={(e) => {
              setDescription(e.target.value);
              setEtat("repos");
              setErreur("");
            }}
          />
          <MessageChamp id={cid("erreur-description")} texte={messages.description} />
        </div>

        <button className="agency-bouton" type="submit" disabled={enCours}>
          {enCours ? "Envoi en cours…" : "Envoyer ma demande"}
        </button>
      </form>
    </section>
  );
}

/**
 /**
 * Le message d'erreur d'un champ, sous le champ.
 *
 * Il est rendu par son `id` parce que le champ le désigne par
 * `aria-describedby` : c'est ce lien invisible qui fait annoncer « Votre email,
 * champ invalide, Écrivez une adresse email valide » au lieu d'un champ invalide
 * sans explication. Le texte est donc dans le flux du lecteur d'écran, et pas
 * seulement dans la page.
 *
 * Pas de `role="alert"` ici : le résumé d'erreurs porte déjà l'alerte, et deux
 * `alert` apparaissant ensemble annonceraient deux fois la même chose. Le rôle
 * reste au résumé, et ce message reste du texte associé au champ.
 *
 * Le composant renvoie `null` quand il n'y a rien à dire : afficher un conteneur
 * vide sous chaque champ mettrait une ligne de vide sous six champs, et ferait
 * danser la mise en page à la première correction.
 */
function MessageChamp({ id, texte }: { id: string; texte: string | undefined }) {
  if (typeof texte !== "string" || texte === "") return null;
  return (
    <p className="agency-erreur" id={id}>
      {texte}
    </p>
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
}): { erreur: string; manquants: string[]; messages: Record<string, string> } {
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

  // Un message PAR CHAMP, et non un message unique pour tout le formulaire.
  //
  // C'est ce qui permet d'écrire deux fois la même information : une fois dans le
  // résumé d'erreurs, une fois sous le champ concerné. Le résumé répond à « qu'est-ce
  // qui ne va pas ? », le message sous le champ répond à « pourquoi celui-là ? ».
  // Avec un message unique, il faudrait choisir entre les deux, et les deux
  // questions resteraient sans réponse.
  //
  // La liste `manquants` garde son ordre de formulaire : le résumé doit se lire
  // comme le formulaire se lit, sinon la personne qui le suit ne retrouve pas ses
  // repères.
  const messages: Record<string, string> = {};
  for (const champ of manquants) messages[champ] = MESSAGES_CHAMPS[champ] ?? "Champ incomplet.";

  // Le titre du bandeau reprend le PREMIER message, dans l'ordre du formulaire.
  // C'est le même texte, pas une variante : un résumé qui annoncerait autre chose
  // que ce qui est écrit plus bas serait pire qu'un résumé absent.
  const premier = Object.keys(messages)[0];
  const erreur = premier === undefined ? "" : messages[premier];

  return { erreur, manquants, messages };
}

/**
 * Les messages d'un champ, en français, dans le vocabulaire du formulaire.
 *
 * La clé est le nom technique du champ — celui que le serveur renvoie dans
 * `champs` — pour qu'une erreur de serveur et une erreur locale se substituent
 * l'une l'autre sans réécrire le rendu. Une clé absente de cette table est
 * rendered par un repli neutre plutôt que de laisser le champ muet.
 */
const MESSAGES_CHAMPS: Record<string, string> = {
  service_id: "Choisissez la prestation dont vous avez besoin.",
  requester_name: "Indiquez votre nom (2 caractères minimum).",
  requester_email: "Écrivez une adresse email valide.",
  requester_phone: "Numéro invalide : utilisez le format +226 70 12 34 56.",
  subject: "Donnez un objet à votre demande (3 caractères minimum).",
  description: "Décrivez votre demande en quelques mots (10 caractères minimum).",
};

/**
 * Le nom lisible d'un champ, pour le résumé d'erreurs.
 *
 * Le résumé cite les champs par leur étiquette — « Votre email » — et non par
 * leur nom technique : un résumé d'erreurs qui parle de `requester_email` n'a
 * d'autre moyen de rester utile que de publier les clés techniques dans l'écran
 * du commerçant.
 */
const NOMS_LISIBLES: Record<string, string> = {
  service_id: "Prestation",
  requester_name: "Votre nom",
  requester_email: "Votre email",
  requester_phone: "Téléphone",
  subject: "L’objet",
  description: "La description",
};