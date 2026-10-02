"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AgencyPanel } from "./AgencyPanel";
import { composerLibelleAccessibleBouton } from "./agency-commun";
import type { AgencySpace } from "@/lib/agency/types";

/**
 * Le bouton flottant de l'agence, et le panneau qu'il ouvre.
 *
 * C'est le seul élément que l'agence peut poser sur toutes les pages d'un site
 * client, et c'est pour cela qu'il est si strictement conditionné. Deux décisions
 * viennent du contrat, et ce composant ne les reprend pas :
 *
 *  - LA VISIBILITÉ. `space.identite.bouton_flottant.visible` a été décidé par
 *    `presenterBoutonFlottant`, côté plateforme. La règle est simple et double :
 *    le bouton disparaît si l'agence l'a désactivé, ou si elle n'a rien à
 *    montrer — ni contact exploitable, ni prestation publiée, ni abonnement en
 *    cours. Ce composant ne redéfinit pas cette règle et n'ajoute aucune
 *    condition de son invention : une condition supplémentaire ferait
 *    disparaître un bouton que l'agence a décidé de montrer, et le commerçant
 *    n'aurait plus de porte d'entrée.
 *  - LES MOTS. `libelle` est le texte visible, écrit court et pour le clic ;
 *    `libelle_accessible` est le nom que le lecteur d'écran restitue, et c'est
 *    lui qu'il faut mettre dans l'`aria-label` d'un bouton dont le texte visible
 *    n'est pas une description. `bulle_libelle` est la bulle de premier contact :
 *    elle s'affiche AVANT toute saisie, et peut valoir `null`.
 *
 * `lien_whatsapp` peut valoir `null` alors que le bouton est visible : dans ce
 * cas le panneau montre le catalogue ou l'abonnement, pas un contact. C'est
 * documenté dans `BoutonFlottantAffiche`, et c'est pourquoi ce composant ne
 * déduit jamais la visibilité d'un lien.
 *
 * L'accessibilité du couple bouton/panneau tient en quatre points, tous
 * obligatoires et tous vérifiables au clavier :
 *
 *  - `aria-expanded` et `aria-controls` sur le bouton, `role="dialog"` et
 *    `aria-modal` sur le panneau, `aria-labelledby` vers son titre ;
 *  - à l'ouverture, le focus va sur le panneau lui-même, qui est
 *    `tabIndex={-1}` : un lecteur d'écran annonce ainsi le titre du dialogue
 *    avant d'entrer dans son contenu, ce que ne fait pas un focus posé sur le
 *    premier bouton ;
 *  - le focus est PIÉGÉ dans le panneau tant qu'il est ouvert, et `Tab` boucle
 *    entre son premier et son dernier élément ;
 *  - `Échap` ferme, un clic dehors ferme, et à la fermeture le focus revient au
 *    bouton. Sans ce retour, la tabulation repartirait du début de la page et le
 *    commerçant perdrait le fil : il aurait à chercher le bouton pour savoir que
 *    le panneau est parti.
 *
 * Le bouton est en `position: fixed` : il ne doit jamais pousser la mise en page
 * d'une page produit, ni provoquer un saut au chargement. La position vient
 * d'une classe (`bas_droite` / `bas_gauche`), jamais d'un style en ligne — la
 * feuille de style ne peut alors pas déborder sur le site client, et le
 * positionnement reste modifiable depuis l'administration sans toucher au code.
 *
 * Ordre des hooks : tous les hooks sont appelés AVANT tout retour anticipé, y
 * compris quand l'espace est `null`. Un `return null` placé avant un `useState`
 * ferait changer le nombre de hooks d'un rendu à l'autre — le premier rendu
 * sans espace, le suivant avec — et React lèverait « Rendered fewer hooks than
 * expected » au moment précis où la plateforme reviendrait, c'est-à-dire
 * précisément quand l'on veut que tout fonctionne. La garde `if (!visible)
 * return null` est donc placée après les hooks, et elle est totale : sans elle,
 * un espace vide produirait un bouton sans cible.
 *
 * Aucune dépendance hors React : pas d'icône externe, pas de librairie de
 * dialogue, pas de Tailwind. La bulle, l'icône et la croix sont des caractères
 * Unicode.
 */

export type AgencyFloatingButtonProps = {
  /** Espace chargé côté serveur. `null` → aucun bouton, c'est la règle du dépôt. */
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
  /** Remplace le texte du bouton sans changer celui des autres sites clients. */
  libelleBouton?: string;
};

/** Cible de la touche Tab, dans l'ordre du document. */
const SELECTEUR_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AgencyFloatingButton({
  space,
  requesterName,
  requesterEmail,
  routeDemande,
  routeRevalidation,
  cheminRevalidation,
  libelleBouton,
}: AgencyFloatingButtonProps) {
  const [ouvert, setOuvert] = useState(false);
  const [bulleFermee, setBulleFermee] = useState(false);
  const boutonRef = useRef<HTMLButtonElement | null>(null);
  const panneauRef = useRef<HTMLDivElement | null>(null);
  const etaitOuvert = useRef(false);
  const suffixe = useId();

  // Décision du contrat, lue sans jamais être recalculée : voir le bandeau.
  const bouton = space?.identite?.bouton_flottant;
  const visible = space !== null && bouton !== undefined && bouton.visible === true;
  const texteBouton = libelleBouton?.trim() || bouton?.libelle || "Nous contacter";

  const fermer = useCallback(() => setOuvert(false), []);
  const ouvrir = useCallback(() => setOuvert(true), []);

  /* --- Focus ---------------------------------------------------------------- *
   * Le focus va sur le panneau à l'ouverture, et revient sur le bouton à la
   * fermeture. Le drapeau `etaitOuvert` évite de voler le focus au premier
   * rendu, où le panneau est fermé : un site client qui rend ce composant sur
   * chaque page verrait sa tabulation sauter au chargement.
   */
  useEffect(() => {
    if (ouvert) {
      etaitOuvert.current = true;
      panneauRef.current?.focus();
      return;
    }
    if (etaitOuvert.current) {
      etaitOuvert.current = false;
      boutonRef.current?.focus();
    }
  }, [ouvert]);

  /* --- Défilement de la page ------------------------------------------------ *
   * Un panneau en `position: fixed` qui laisse défiler la page en dessous est un
   * bug d'usage : le commerçant fait défiler, le tiroir reste en place, et il
   * croit que la page ne répond plus. La valeur précédente est restaurée à la
   * fermeture, sinon le site client resterait bloqué pour tous ses visiteurs.
   */
  useEffect(() => {
    if (!ouvert) return;
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = precedent;
    };
  }, [ouvert]);

  /* --- Clic dehors ---------------------------------------------------------- *
   * `pointerdown` et non `click` : un `pointerdown` qui précède un glissement de
   * texte ne doit pas fermer le panneau sous le doigt du commerçant. Le bouton
   * est exclu, sinon son propre clic refermerait ce qu'il vient d'ouvrir.
   */
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (evenement: PointerEvent) => {
      const cible = evenement.target as Node | null;
      if (!cible) return;
      if (boutonRef.current?.contains(cible)) return;
      if (panneauRef.current?.contains(cible)) return;
      fermer();
    };
    document.addEventListener("pointerdown", surClic, true);
    return () => document.removeEventListener("pointerdown", surClic, true);
  }, [ouvert, fermer]);

  /* --- Clavier : Échap ferme, Tab reste dans le panneau --------------------- */
  const surTouche = useCallback(
    (evenement: React.KeyboardEvent<HTMLDivElement>) => {
      if (evenement.key === "Escape") {
        evenement.stopPropagation();
        fermer();
        return;
      }
      if (evenement.key !== "Tab") return;

      const panneau = panneauRef.current;
      if (!panneau) return;
      const focusables = elementsFocusables(panneau);
      const premier = focusables[0] ?? null;
      const dernier = focusables[focusables.length - 1] ?? null;
      if (!premier || !dernier) {
        // Rien à tabuler : le focus reste sur le panneau, plutôt que de repartir
        // sur la page derrière le voile. La garde est écrite ainsi plutôt que sur
        // `focusables.length === 0` parce qu'elle reste vraie si la liste
        // change de forme — et un panneau sans aucun champ focusable est un cas
        // réel, pas une hypothèse.
        evenement.preventDefault();
        panneau.focus();
        return;
      }
      const actif = document.activeElement;

      if (evenement.shiftKey && (actif === premier || actif === panneau)) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && actif === dernier) {
        evenement.preventDefault();
        premier.focus();
      }
    },
    [fermer],
  );

  // La garde d'or, après tous les hooks. Voir le bandeau pour pourquoi elle est
  // ici et pas plus haut.
  if (!visible || !bouton) return null;

  const identifiantPanneau = `agency-panneau${suffixe}`;
  const identifiantTitre = `agency-panneau-titre${suffixe}`;
  const cote = bouton.position === "bas_gauche" ? "gauche" : "droite";
  const marque = bouton.urgence === "marque";

  return (
    <div className={`agency-flottant agency-flottant--${cote}`}>
      {!ouvert && bouton.bulle_libelle && !bulleFermee && (
        <div className="agency-bulle" role="note">
          <p className="agency-bulle-texte">{bouton.bulle_libelle}</p>
          <button
            type="button"
            className="agency-bulle-fermer"
            aria-label="Masquer le message de l’agence"
            onClick={() => setBulleFermee(true)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      <button
        ref={boutonRef}
        type="button"
        className={`agency-bouton-flottant${marque ? " agency-bouton-flottant--marque" : ""}`}
        aria-expanded={ouvert}
        aria-controls={identifiantPanneau}
        aria-label={composerLibelleAccessibleBouton(texteBouton, bouton.libelle_accessible)}
        onClick={ouvrir}
      >
        <span className="agency-bouton-flottant-icone" aria-hidden="true">
          ✆
        </span>
        <span className="agency-bouton-flottant-texte">{texteBouton}</span>
      </button>

      {ouvert && (
        <>
          <div className="agency-voile" onClick={fermer} aria-hidden="true" />
          <div
            ref={panneauRef}
            id={identifiantPanneau}
            className={`agency-tiroir agency-tiroir--${cote}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={identifiantTitre}
            tabIndex={-1}
            onKeyDown={surTouche}
          >
            <header className="agency-tiroir-entete">
              <div className="agency-tiroir-titres">
                <h2 className="agency-tiroir-titre" id={identifiantTitre}>
                  {space.identite?.nom ?? "Mon agence"}
                </h2>
                <p className="agency-tiroir-sous-titre">MindGraphixSolution</p>
              </div>
              <button
                type="button"
                className="agency-fermer"
                aria-label="Fermer le panneau de l’agence"
                onClick={fermer}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className="agency-tiroir-corps">
              <AgencyPanel
                space={space}
                requesterName={requesterName}
                requesterEmail={requesterEmail}
                routeDemande={routeDemande}
                routeRevalidation={routeRevalidation}
                cheminRevalidation={cheminRevalidation}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Les éléments focusables du panneau, dans l'ordre du document.
 *
 * Les éléments masqués sont écartés : un `display: none` garde son `tabIndex`
 * mais ne reçoit jamais le focus, et faire tabuler dessus fait sauter le focus
 * dans le vide — le commerçant perd alors le clavier au milieu d'un formulaire.
 * `getClientRects()` est le seul test fiable qui ne demande pas de recalculer une
 * mise en page à chaque Tab.
 */
function elementsFocusables(racine: HTMLElement): HTMLElement[] {
  return Array.from(racine.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0,
  );
}