"use client";

import type { ReactNode } from "react";
import {
  LIBELLE_PRIX_DEVIS,
  LIBELLE_PRIX_INCLUS,
  STATUTS_ABONNEMENT,
  STATUTS_DEMANDE,
} from "@/lib/agency/contrat-partage";
import type { EtatPrix, PrixAffiche } from "@/lib/agency/types";

/**
 * Briques d'affichage partagées par le panneau, la liste des demandes et le
 * formulaire.
 *
 * Ce fichier existe pour une raison qui n'est pas le factorisation : les mêmes
 * mots doivent être écrits au même endroit. Un statut de demande affiché par le
 * panneau et un statut affiché par le badge d'une ligne de suivi ne peuvent pas
 * divergir — ils sont lus sur le même écran, à deux centimètres l'un de
 * l'autre, et le commerçant qui voit deux mots différents pour le même état
 * téléphone à l'agence. De même pour le prix : « Inclus » doit s'écrire
 * « Inclus » partout, jamais « 0 F CFA », jamais « gratuit » à côté de « Inclus »
 * ailleurs.
 *
 * Deux interdits que ces briques rendent structurels :
 *
 *  - AUCUN TEXTE PROPRE. Chaque libellé vient du contrat partagé
 *    (`contrat-partage.ts`), y compris les replis : une chaîne écrite ici
 *    deviendrait un second jeu de mots, exactement ce que le contrat existe pour
 *    empêcher. Les rares messages propres à ce connecteur — « Votre demande a
 *    bien été envoyée », « Réessayez dans un instant » — sont dans le
 *    formulaire, où ils décrivent une action locale et non un état de la base.
 *  - AUCUN ACCÈS IMPRUDENT. Une source de données de réseau peut être
 *    `null`, `undefined`, ou porter un objet à moitié rempli : chaque brique
 *    teste son entrée avant de la lire, et rend `null` plutôt que de lever. Un
 *    composant qui écrit `prix.libelle` sans garde fait tomber la page entière du
 *    dashboard pour une donnée absente, ce que la règle d'or du connecteur
 *    interdit : le site client doit rester utilisable quoi qu'il arrive de
 *    l'agence.
 *
 * Aucune dépendance hors React : pas d'icône, pas de bibliothèque de mise en
 * forme, pas de Tailwind. Les seuls caractères décoratifs sont des points
 * Unicode, ce qui évite d'embarquer un SVG par icône.
 */

/** Vocabulaire fermé des états de prix : trois, pas un de plus. */
const ETATS_PRIX: readonly string[] = ["inclus", "devis_en_attente", "chiffre"];

/** Vocabulaire fermé des statuts de demande, plus les deux replis du contrat. */
const CODES_DEMANDE: readonly string[] = [...STATUTS_DEMANDE];

/** Vocabulaire fermé des statuts d'abonnement, plus `aucun` et `inconnu`. */
const CODES_ABONNEMENT: readonly string[] = [
  ...STATUTS_ABONNEMENT,
  "aucun",
  "inconnu",
];

/**
 * Un code devient un jeton de classe, ou `neutre` s'il n'est pas connu.
 *
 * Le `className` est construit à partir d'une donnée qui vient de la base, donc
 * une valeur inattendue pourrait s'y glisser telle quelle. Elle deviendrait une
 * classe CSS, et surtout un attribut que le navigateur Recherche dans les
 * feuilles de style du site client. Le repli `neutre` ferme la porte.
 */
export function jetonStatut(
  code: string | null | undefined,
  connus: readonly string[],
): string {
  const cle = typeof code === "string" ? code : "";
  return connus.includes(cle) ? cle : "neutre";
}

/** Un code de demande devient une classe de pastille. */
export function jetonDemande(code: string | null | undefined): string {
  return jetonStatut(code, CODES_DEMANDE);
}

/** Un code d'abonnement devient une classe de pastille. */
export function jetonAbonnement(code: string | null | undefined): string {
  return jetonStatut(code, CODES_ABONNEMENT);
}

/**
 * Le nom accessible d'un bouton CONTIENT son texte visible.
 *
 * C'est le critère WCAG 2.5.3 « Label in Name », et c'est un critère de conformité,
 * pas une préférence. Un bouton dont l'écran affiche « Mon agence » et dont le
 * lecteur d'écran annonce « Ouvrir le panneau de l'agence » casse deux usages à la
 * fois : la personne qui navigue au clavier ne sait plus quel bouton est lequel,
 * et la personne qui commande par la voix dit « Clique Mon agence » sans que
 * l'appareil reconnaisse ce qu'elle a lu à l'écran.
 *
 * La fonction prend les DEUX moitiés parce qu'elles ont deux origines qu'il ne faut
 * pas confondre : le texte visible vient de la feuille de style du site client ou
 * de la configuration du commerçant, le libellé accessible vient du contrat
 * partagé. Les deux sont donc des données, et aucune n'est fiable par
 * construction — d'où la règle : le nom rendu CONTIENT le texte visible, quoi qu'il
 * arrive.
 *
 * L'ordre est visible d'abord. « Mon agence : ouvrir le panneau de l'agence » se
 * prononce dans le bon ordre, alors que « Ouvrir le panneau de l'agence — Mon
 * agence » force l'utilisateur à attendre la fin pour savoir de quoi il s'agit.
 *
 * Si le libellé accessible contient déjà le texte visible — cas normal quand
 * l'agence n'a pas personnalisé — on ne le répète pas : « Mon agence : Mon
 * agence » se prononce deux fois et devient plus pénible que le bug qu'on corrige.
 *
 * Si l'un des deux est vide, l'autre fait foi : un bouton sans texte visible
 * n'a rien à contenir, et un `aria-label` vide rendrait le bouton muet.
 */
export function composerLibelleAccessibleBouton(
  texteVisible: string | null | undefined,
  libelleAccessible: string | null | undefined,
): string {
  const visible = typeof texteVisible === "string" ? texteVisible.trim() : "";
  const nom = typeof libelleAccessible === "string" ? libelleAccessible.trim() : "";

  if (visible === "") return nom;
  if (nom === "") return visible;
  if (contientInsensibleALaCasse(nom, visible)) return nom;
  return `${visible} : ${nom}`;
}

/** Recherche de sous-chaîne qui ignore casse et espaces multiples. */
function contientInsensibleALaCasse(texte: string, fragment: string): boolean {
  const normaliser = (valeur: string) => valeur.replace(/\s+/g, " ").trim().toLowerCase();
  return normaliser(texte).includes(normaliser(fragment));
}

/**
 * Pastille de statut : le libellé du contrat, la classe de la feuille.
 *
 * `libelle` n'est jamais recalculé ici. `statut_libelle` porte déjà la décision
 * du contrat — « Demande en traitement » pour un code inconnu — et le
 * recalculer ressusciterait exactement le code brut que le contrat a voulu
 * cacher. On n'affiche donc que le mot, jamais le code.
 */
export function PastilleStatut({
  libelle,
  jeton,
}: {
  libelle: string | null | undefined;
  jeton: string;
}) {
  const texte = typeof libelle === "string" ? libelle : "";
  if (texte === "") return null;
  return <span className={`agency-pastille agency-pastille--${jeton}`}>{texte}</span>;
}

/**
 * Prix d'une prestation ou d'une demande, tel que le contrat l'a décidé.
 *
 * Le contrat a déjà tranché entre « Inclus », « Devis en attente » et un montant
 * formaté ; on ne refait pas ce travail et on n'invente surtout pas de variante
 * de « gratuit ». Le repli sur les constantes du contrat couvre le cas où le
 * champ `libelle` serait vide : mieux vaut « Inclus » ou « Devis en attente »
 * qu'un espace vide, qu'un lecteur d'écran lirait comme une absence de prix.
 */
export function PastillePrix({ prix }: { prix: PrixAffiche | null | undefined }) {
  if (!prix || typeof prix !== "object") return null;
  const etat: EtatPrix = ETATS_PRIX.includes(prix.etat)
    ? prix.etat
    : "devis_en_attente";
  const libelle =
    typeof prix.libelle === "string" && prix.libelle !== ""
      ? prix.libelle
      : etat === "inclus"
        ? LIBELLE_PRIX_INCLUS
        : LIBELLE_PRIX_DEVIS;
  return <span className={`agency-pastille agency-prix agency-prix--${etat}`}>{libelle}</span>;
}

/**
 * Une ligne « libellé : valeur » de la fiche d'identité ou de l'abonnement.
 *
 * Le libellé est passé par le `.visually-hidden` quand `discret` est vrai : à
 * l'œil, la valeur se suffit à elle-même ; au lecteur d'écran, la paire
 * « WhatsApp, +226 70 12 34 56 » se comprend seule. Sans ce couple, la valeur
 * seule perd sa signification dès qu'un lecteur d'écran la parcourt.
 */
export function LigneFiche({
  libelle,
  children,
  discret = false,
}: {
  libelle: string;
  children: ReactNode;
  discret?: boolean;
}) {
  return (
    <div className="agency-ligne">
      <span className={discret ? "agency-visually-hidden" : "agency-ligne-libelle"}>
        {libelle}
      </span>
      <span className="agency-ligne-valeur">{children}</span>
    </div>
  );
}

/**
 * Mention discrète : une information honnête qui n'est ni une erreur ni une
 * promesse.
 *
 * Elle sert aux trois cas où il faut dire quelque chose au lecteur sans lui
 * laisser croire que l'agence est en panne : la plateforme ne répond pas, la
 * facturation n'existe pas pour cet espace, le statut détaillé d'une demande
 * n'est pas connu. Un composant qui n'affiche rien dans ces cas laisse croire à
 * un bug ; un composant qui affiche une alerte rouge fait croire à une panne de
 * l'agence. La nuance se joue ici.
 */
export function Mention({
  children,
  ton = "neutre",
}: {
  children: ReactNode;
  ton?: "neutre" | "attention";
}) {
  return <p className={`agency-mention agency-mention--${ton}`}>{children}</p>;
}

/**
 * Le texte reste lisible par un lecteur d'écran, invisible à l'œil.
 *
 * La classe est préfixée `agency-` : un site client qui définit déjà
 * `.visually-hidden` avec ses propres valeurs verrait son style écrasé par un
 * simple copier-coller de ce fichier. Le préfixe est ce qui garantit qu'aucune
 * feuille de style du site n'est touchée.
 */
export function Invisible({ children }: { children: ReactNode }) {
  return <span className="agency-visually-hidden">{children}</span>;
}

/**
 * Un identifiant de ligne, tel que la plateforme les écrit.
 *
 * La plateforme attend un `uuid` sur `service_id`. Une ligne de catalogue
 * portant autre chose ne peut donc pas être sélectionnée dans un formulaire : le
 * serveur répondrait « Prestation inconnue », et le commerçant croirait avoir mal
 * choisi. On filtre donc en amont, et le filtre est ici plutôt que dans le
 * formulaire, pour qu'il s'applique partout.
 */
export function estUuid(valeur: string | null | undefined): boolean {
  return (
    typeof valeur === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      valeur.trim(),
    )
  );
}