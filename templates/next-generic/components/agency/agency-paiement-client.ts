"use client";

/**
 * La trace d'un règlement que le connecteur vient d'ouvrir chez le prestataire.
 *
 * ELLE EST LUE DEPUIS LE NAVIGATEUR, DONC C'EST UN ÉTAT EXTERNE
 * -------------------------------------------------------
 * La trace vit dans `sessionStorage` et dans l'adresse de retour que la
 * plateforme construit (`site.url?facture=<numéro>`). Ni l'un ni l'autre
 * n'existe au moment du rendu serveur, et le panneau est monté sur des pages
 * rendues à la demande comme sur des pages mises en cache : la lire pendant le
 * rendu produirait un écart d'hydratation, la lire dans un effet
 * `setState` produirait un second rendu en cascade. `useSyncExternalStore` est
 * précisément le primitif prévu pour ça : la valeur est stable, absente côté
 * serveur, et lue une seule fois après l'hydratation.
 *
 * `sessionStorage` et non `localStorage` : la mention ne vaut que pour l'onglet
 * qui a payé, et disparaît avec lui. Un `localStorage` laisserait, sur un poste
 * partagé, une mention de règlement que le prochain commerçant à ouvrir le site
 * lirait comme la sienne.
 */
const CLE_PAIEMENT_OUVERT = "mgs-agence:paiement-ouvert";

/** Longueur maximale retenue avant écriture : un `sessionStorage` n'est pas une base. */
const LIBELLE_MAX = 60;

/**
 * Valeur déjà rendue, mise en cache pour toute la durée du chargement de page.
 *
 * `getSnapshot` d'un `useSyncExternalStore` doit renvoyer la MÊME valeur tant
 * que l'état externe ne change pas : une lecture qui consommerait la trace à
 * chaque appel ferait boucler React à l'infini. Le cache est donc ici, et il est
 * ce qui rend les deux exemplaires du panneau — onglet du tableau de bord et
 * tiroir flottant, montés en même temps — d'accord sur la même mention.
 */
let traceRendue: string | null | undefined;

/** Sur le serveur, la trace n'existe pas : le panneau se rend sans elle. */
export function snapshotPaiementOuvertServeur(): string | null {
  return null;
}

/**
 * Abonnement à la trace de règlement.
 *
 * Aucun événement ne la déclenche : la trace est écrite juste avant de quitter la
 * page, donc avant le rechargement. La fonction existe pour que l'API de
 * `useSyncExternalStore` soit complète, et elle rend le service fiable — sans
 * quoi React le traiterait comme une source instable et relirait en boucle.
 */
export function abonnerTracePaiementOuvert(abonne: () => void): () => void {
  return () => {
    void abonne;
  };
}

/**
 * La trace de règlement, lue une fois et servie depuis le cache.
 *
 * Les deux sources sont consommées à chaque première lecture. Laisser le
 * paramètre d'URL en place ferait réapparaître la mention à chaque
 * rechargement de la page, et la rendrait permanente — donc un jour,
 * exactement le mensonge qu'elle sert à éviter.
 */
export function lireTracePaiementOuvert(): string | null {
  if (traceRendue !== undefined) return traceRendue;
  traceRendue = lireSession() ?? lireAdresse();
  return traceRendue;
}

/**
 * Retient le numéro de la facture dont le paiement vient d'être ouvert.
 *
 * L'écriture précède la redirection, jamais l'inverse : une trace écrite après
 * `location.assign` ne part pas, et le commerceçant qui vient de payer se
 * retrouverait sans le seul mot qui le rassure.
 */
export function marquerPaiementOuvert(invoiceLabel: string): void {
  if (typeof window === "undefined") return;
  const libelle = typeof invoiceLabel === "string" ? invoiceLabel.trim().slice(0, LIBELLE_MAX) : "";
  if (libelle === "") return;
  try {
    window.sessionStorage.setItem(CLE_PAIEMENT_OUVERT, libelle);
  } catch {
    // Navigateur privé, quota plein, `sessionStorage` refusée : la mention
    // disparaît, le paiement a déjà été ouvert chez le prestataire. Rien à dire.
  }
}

/** La trace laissée par le bouton « Régler », consommée au passage. */
function lireSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const brut = window.sessionStorage.getItem(CLE_PAIEMENT_OUVERT);
    window.sessionStorage.removeItem(CLE_PAIEMENT_OUVERT);
    return typeof brut === "string" ? borner(brut) : null;
  } catch {
    return null;
  }
}

/**
 * Le numéro que la plateforme a mis dans l'adresse de retour.
 *
 * C'est la seule trace fiable quand l'onglet a été refermé entre le paiement et
 * le retour : `sessionStorage` a disparu avec lui, alors que le paramètre est
 * là. Il est retiré de l'adresse après lecture — sinon il serait annoncé comme
 * « en cours de vérification » à chaque rechargement, et un commerçant pourrait
 * l'ajouter à la main pour faire afficher un numéro qui n'est pas le sien.
 */
function lireAdresse(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const brut = url.searchParams.get("facture");
    url.searchParams.delete("facture");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    return typeof brut === "string" ? borner(brut) : null;
  } catch {
    return null;
  }
}

/** Espaces normalisés et longueur bornée : la trace vient d'une adresse. */
function borner(valeur: string): string | null {
  const texte = valeur.replace(/\s+/g, " ").trim().slice(0, LIBELLE_MAX);
  return texte === "" ? null : texte;
}

/** Démarre un paiement sans jamais interpréter son ouverture comme un règlement. */
export async function ouvrirPaiementFacture(invoiceId: string): Promise<
  | { ok: true; url: string }
  | { ok: false; message: string }
> {
  try {
    const response = await fetch("/api/agency/billing/paiement", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MGS-Revalidate": "paiement-facture",
      },
      body: JSON.stringify({ invoice_id: invoiceId }),
      cache: "no-store",
    });
    const corps = await response.json().catch(() => null) as {
      pay_url?: unknown;
      error?: unknown;
      billing_message?: unknown;
    } | null;

    if (!response.ok) {
      return {
        ok: false,
        message: typeof corps?.error === "string" && corps.error.trim()
          ? corps.error.trim()
          : "Le paiement n’a pas pu être ouvert. Réessayez dans un instant.",
      };
    }

    if (typeof corps?.pay_url !== "string") {
      return {
        ok: false,
        message: typeof corps?.billing_message === "string" && corps.billing_message.trim()
          ? corps.billing_message.trim()
          : "Le paiement en ligne n’est pas disponible pour cette facture.",
      };
    }

    const url = new URL(corps.pay_url);
    if (url.protocol !== "https:") {
      return { ok: false, message: "L’adresse de paiement n’est pas sécurisée. Contactez l’agence." };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, message: "La plateforme de paiement ne répond pas. Réessayez dans un instant." };
  }
}
