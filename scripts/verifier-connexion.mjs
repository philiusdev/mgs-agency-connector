#!/usr/bin/env node
/**
 * verifier-connexion.mjs — Diagnostic complet de la chaîne
 * « site client → plateforme MindGraphixSolution ».
 *
 * ------------------------------------------------------------------
 * CE QUE CE SCRIPT FAIT
 * ------------------------------------------------------------------
 *   1. Il lit le `.env.local` du site et vérifie que les variables
 *      MGS_PLATFORM_URL / MGS_SITE_KEY / MGS_SITE_SECRET sont présentes.
 *      Il n'affiche JAMAIS une valeur de secret : au mieux, les
 *      4 premiers caractères du SHA-256 du secret, ce qui ne permet
 *      rien à un tiers de le deviner ni de le comparer à une base.
 *   2. Il rejoue EXACTEMENT le garde SSRF de `lib/agency/client.ts`
 *      (lignes 80-89) sur votre URL, hors réseau. Aucun appel réseau.
 *   3. Il compare votre copie de `lib/agency/space.ts` au contrat réel
 *      de l'API (`{agence:{identite}, prestations, offres, ...}`).
 *      Une dérive ici est la panne la plus trompeuse : aucune erreur
 *      n'est affichée, l'onglet s'affiche vide.
 *   4. Sur demande (`--en-ligne`), il appelle la plateforme en lecture
 *      seule (GET) avec les bons en-têtes, ettraduit chaque statut HTTP
 *      en cause et en correction.
 *   5. Il vérifie que le dépôt plateforme a bien les prérequis
 *      (variables serveur, migration 202609290017).
 *
 * ------------------------------------------------------------------
 * CE QUE CE SCRIPT NE FAIT PAS
 * ------------------------------------------------------------------
 *   - Il n'écrit rien. Aucune donnée n'est envoyée, enregistrée ni modifiée.
 *   - Il ne lance pas `create-site-credential.mjs`.
 *   - Il ne se connecte jamais directement à Supabase.
 *   - Il n'affiche aucun secret, ni en clair, ni tronqué.
 *   - Il n'envoie aucune requête non-lecture (ni POST, ni PUT, ni DELETE).
 *
 * ------------------------------------------------------------------
 * USAGE
 * ------------------------------------------------------------------
 *   node scripts/verifier-connexion.mjs
 *       → vérifie le dépôt connecteur lui-même (mode hors ligne)
 *
 *   node scripts/verifier-connexion.mjs --site ../../template-boutique-mgs
 *       → vérifie un site client, hors ligne
 *
 *   node scripts/verifier-connexion.mjs --site ../template-boutique-mgs --en-ligne
 *       → + appelle réellement la plateforme (GET seulement)
 *
 *   node scripts/verifier-connexion.mjs --site ../x --en-ligne --charge
 *       → + mesure la marge sous la limite de 60 requêtes/minute (⚠ 10 appels)
 *
 *   --plateforme <chemin>   dépôt de la plateforme (défaut : recherche auto)
 *   --url <url>             teste une URL sans lire de fichier
 *   --aide                  cette aide
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/* ================================================================== *
 * Cadre de sortie
 * ================================================================== */

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE_CONNECTEUR = resolve(ICI, "..");

const COULEURS = process.stdout.isTTY && !process.env.NO_COLOR;
const C = {
  gras: (s) => (COULEURS ? `\x1b[1m${s}\x1b[0m` : s),
  vert: (s) => (COULEURS ? `\x1b[32m${s}\x1b[0m` : s),
  rouge: (s) => (COULEURS ? `\x1b[31m${s}\x1b[0m` : s),
  jaune: (s) => (COULEURS ? `\x1b[33m${s}\x1b[0m` : s),
  bleu: (s) => (COULEURS ? `\x1b[36m${s}\x1b[0m` : s),
  gris: (s) => (COULEURS ? `\x1b[90m${s}\x1b[0m` : s),
};

const TIRETS = "─".repeat(78);
let compteurOk = 0;
let compteurPb = 0;
const ACTIONS = [];

function titre(numero, texte) {
  console.log(`\n${C.gras(`[${numero}] ${texte}`)}\n${C.gris(TIRETS)}`);
}

function ok(texte, detail = "") {
  compteurOk += 1;
  console.log(`  ${C.vert("OK  ")} ${texte}${detail ? C.gris(` — ${detail}`) : ""}`);
}

function pb(texte, detail = "", action = "") {
  compteurPb += 1;
  console.log(`  ${C.rouge("PB  ")} ${texte}${detail ? C.gris(` — ${detail}`) : ""}`);
  if (action) {
    ACTIONS.push(action);
    console.log(`       ${C.jaune("→ " + action)}`);
  }
}

function info(texte) {
  console.log(`      ${C.gris(texte)}`);
}

/* ================================================================== *
 * Arguments
 * ================================================================== */

const { values: args, positionals } = parseArgs({
  options: {
    site: { type: "string" },
    plateforme: { type: "string" },
    url: { type: "string" },
    "en-ligne": { type: "boolean", default: false },
    charge: { type: "boolean", default: false },
    aide: { type: "boolean", short: "a", default: false },
    "timeout-s": { type: "string", default: "8" },
  },
  allowPositionals: true,
});

if (args.aide) {
  console.log(`
${C.gras("verifier-connexion.mjs")} — diagnostic de la connexion site ↔ plateforme.

  --site <chemin>          dépôt du site client à vérifier
  --plateforme <chemin>    dépôt de la plateforme (auto-détecté sinon)
  --url <url>              teste une URL seule, sans lire de fichier
  --en-ligne               appelle réellement la plateforme (GET seulement)
  --charge                 mesure la limite de 60 req/min (⚠ 10 requêtes de plus)
  --timeout-s <n>          délai maximal par appel (défaut 8)
  -a, --aide               cette aide

Sortie : code 0 si tout va bien, 1 sinon.
`);
  process.exit(0);
}

const RACINE = args.site ? resolve(process.cwd(), args.site) : RACINE_CONNECTEUR;

/* ================================================================== *
 * 0. Où sommes-nous ?
 * ================================================================== */

titre(0, "Dépôt analysé");

const estPlateforme =
  existsSync(join(RACINE, "lib", "site-auth.ts")) &&
  existsSync(join(RACINE, "app", "api", "v1", "agency", "route.ts"));

const estSite =
  existsSync(join(RACINE, "lib", "agency", "space.ts")) ||
  existsSync(join(RACINE, "lib", "agency", "client.ts"));

/**
 * Un dépôt qui parle à la plateforme SANS utiliser le connecteur : c'est le cas
 * du site vitrine, dont `/api/leads` appelle `/api/v1/leads` — une route
 * volontairement non authentifiée. Il ne consomme donc pas l'espace « Mon
 * agence » et n'a pas besoin de MGS_SITE_KEY. On l'annonce explicitement
 * plutôt que de le traiter comme un site client cassé.
 */
const appelleLaPlateformeSansConnecteur =
  !estSite &&
  (existsSync(join(RACINE, "app", "api", "leads", "route.ts")) ||
    existsSync(join(RACINE, "lib", "agency-data.ts")));

if (!estPlateforme && !estSite && !appelleLaPlateformeSansConnecteur && !args.url) {
  console.log(`  ${C.rouge("Ce dossier n'est ni la plateforme ni un site client.")}`);
  console.log(`  Attendu : un dépôt contenant lib/agency/ (site) ou lib/site-auth.ts (plateforme).`);
  console.log(`  Reçu    : ${RACINE}`);
  console.log(`\n  Essayez : node scripts/verifier-connexion.mjs --site ../../template-boutique-mgs`);
  process.exit(1);
}

ok(basename(RACINE), RACINE);
if (estPlateforme) info("Rôle détecté : PLATEFORME (le serveur qui répond)");
else if (estSite) info("Rôle détecté : SITE CLIENT (celui qui appelle)");
else if (appelleLaPlateformeSansConnecteur) {
  info("Rôle détecté : SITE PUBLIC — il appelle la plateforme, mais pas via le connecteur");
  info("Il n'utilise pas /api/v1/agency et n'a donc PAS besoin de MGS_SITE_KEY / MGS_SITE_SECRET.");
} else info("Rôle détecté : URL isolée");

/* ================================================================== *
 * 1. Variables d'environnement (présence seule)
 * ================================================================== */

titre(1, "Variables d'environnement");

/**
 * Lit un fichier `.env*` et rend un objet { NOM: valeur }. Les valeurs
 * restent en mémoire et ne sont jamais affichées : seul `presence()` et
 * `empreinte()` les touchent.
 */
function lireEnv(fichier) {
  const brut = readFileSync(fichier, "utf8");
  const sortie = {};
  for (const ligne of brut.split(/\r?\n/)) {
    const correspond = ligne.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!correspond) continue;
    let valeur = correspond[2].trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"') && valeur.length > 1) ||
      (valeur.startsWith("'") && valeur.endsWith("'") && valeur.length > 1)
    ) {
      valeur = valeur.slice(1, -1);
    }
    sortie[correspond[1]] = valeur;
  }
  return sortie;
}

const env = {};

const FICHIERS_ENV = [".env.local", ".env.production.local", ".env"];
const trouve = [];
for (const nom of FICHIERS_ENV) {
  const chemin = join(RACINE, nom);
  if (existsSync(chemin)) {
    trouve.push(nom);
    try {
      Object.assign(env, lireEnv(chemin));
    } catch (erreur) {
      pb(`${nom} illisible`, erreur.message);
    }
  }
}

/** Empreinte non réversible d'un secret : 4 caractères de SHA-256. */
function empreinte(valeur) {
  if (!valeur) return "—";
  return createHash("sha256").update(valeur).digest("hex").slice(0, 4);
}

function presence(nom) {
  const v = env[nom];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

if (trouve.length === 0) {
  pb(
    "Aucun fichier .env.local trouvé",
    `${RACINE}`,
    `Créez ${join(RACINE, ".env.local")} et renseignez MGS_PLATFORM_URL, MGS_SITE_KEY, MGS_SITE_SECRET.`,
  );
} else {
  ok("Fichier(s) d'environnement lu(s)", trouve.join(", "));
}

const VARIABLES_CRITIQUES = [
  ["MGS_PLATFORM_URL", "URL de la plateforme"],
  ["MGS_SITE_KEY", "clé publique du site"],
  ["MGS_SITE_SECRET", "secret serveur du site"],
];

const manquantes = [];

/** Le site public n'a besoin que de l'URL : sa route /api/v1/leads est sans clé. */
const CHECKLIST =
  estPlateforme || appelleLaPlateformeSansConnecteur
    ? [["MGS_PLATFORM_URL", "URL de la plateforme"]]
    : VARIABLES_CRITIQUES;

if (appelleLaPlateformeSansConnecteur) {
  info("Ce dépôt n'héberge pas l'espace « Mon agence » : seules MGS_PLATFORM_URL compte ici.");
  info("MGS_SITE_KEY / MGS_SITE_SECRET ne lui servent à rien — son appel (/api/v1/leads) est sans authentification.");
}

if (!args.url) {
  for (const [nom, description] of CHECKLIST) {
    if (estPlateforme) {
      info(`${nom.padEnd(18)} — sans objet côté plateforme (elle vérifie les en-têtes reçus)`);
      continue;
    }
    const valeur = presence(nom);
    if (!valeur) {
      manquantes.push(nom);
      pb(`${nom} absente ou vide`, description, `Ajoutez ${nom}=… dans ${join(RACINE, ".env.local")}`);
    } else if (nom === "MGS_SITE_SECRET") {
      ok(`${nom} présente`, `empreinte ${empreinte(valeur)} (jamais affichée en clair)`);
    } else {
      ok(`${nom} présente`, nom === "MGS_PLATFORM_URL" ? valeur : `longueur ${valeur.length}`);
    }
  }

  for (const [nom] of VARIABLES_CRITIQUES) {
    if (env[nom] && nom.startsWith("NEXT_PUBLIC_")) {
      pb(`${nom} est préfixée NEXT_PUBLIC_`, "elle serait envoyée au navigateur",
        `Retirez le préfixe : le secret ne doit jamais quitter le serveur.`);
    }
  }

  if (manquantes.length === CHECKLIST.length && CHECKLIST.length === VARIABLES_CRITIQUES.length) {
    pb(
      "AUCUNE des trois variables critiques n'est définie",
      "c'est l'état le plus courant et il est totalement silencieux",
      "Sans elles, callAgency() renvoie null sans appeler la plateforme (lib/agency/client.ts:74). Rien ne s'affiche, aucune erreur n'est journalisée.",
    );
  } else if (manquantes.length === CHECKLIST.length && CHECKLIST.length < VARIABLES_CRITIQUES.length) {
    pb(
      `${CHECKLIST[0][0]} absente : ce site n'a aucun contact avec la plateforme`,
      "son formulaire de devis renverra « La demande en ligne n'est pas encore reliée »",
      `Ajoutez MGS_PLATFORM_URL=… dans ${join(RACINE, ".env.local")}.`,
    );
  }

  const repli = ["MGS_AGENCY_NAME", "MGS_AGENCY_WHATSAPP", "MGS_AGENCY_EMAIL"].filter((n) => presence(n));
  if (repli.length > 0) {
    ok(`Filet de repli configuré (${repli.length}/3)`, "l'onglet s'affichera même plateforme muette");
  } else if (!estPlateforme) {
    info("Aucun filet de repli MGS_AGENCY_*. Sans plateforme, l'onglet « Mon agence » n'existera pas.");
  }
}

/* ================================================================== *
 * 2. Garde SSRF — rejoué hors réseau, à l'identique
 * ================================================================== */

/**
 * Copie mot pour mot du garde de `lib/agency/client.ts` lignes 80-89.
 * Toute divergence entre cette copie et le fichier réel rendrait ce
 * diagnostic faux : c'est pourquoi les deux contrôles sont comparés plus bas.
 */
function gardeAutorise(platformUrl, chemin = "/api/v1/agency") {
  try {
    const baseUrl = new URL(String(platformUrl).replace(/\/+$/, ""));
    const requestUrl = new URL(chemin, `${baseUrl.origin}/`);
    if (
      requestUrl.origin !== baseUrl.origin ||
      !requestUrl.pathname.startsWith("/api/v1/") ||
      (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost")
    ) {
      return { autorise: false, baseUrl, requestUrl, motif: "garde d'origine" };
    }
    return { autorise: true, baseUrl, requestUrl };
  } catch (erreur) {
    return { autorise: false, motif: `URL invalide : ${erreur.message}` };
  }
}

titre(2, "Garde de sécurité de l'URL (identique à lib/agency/client.ts:80-89)");

const URL_TESTEE = args.url || presence("MGS_PLATFORM_URL");

if (!URL_TESTEE) {
  info("Pas d'URL à tester. Utilisez --url pour en forcer une.");
} else {
  const verdict = gardeAutorise(URL_TESTEE);

  if (!verdict.autorise) {
    pb(`URL refusée par le connecteur : ${verdict.motif}`, URL_TESTEE,
      "Le client renverra null en silence. Logs à chercher : « [mgs-agency] Adresse de requête non autorisée ».");
  } else {
    ok("URL acceptée par le connecteur", verdict.baseUrl.origin);
  }

  // Diagnostic fin, uniquement sur des indices non secrets.
  let u;
  try {
    u = new URL(String(URL_TESTEE).trim());
  } catch {
    u = null;
  }

  if (u) {
        const estBoucleLocale = u.hostname === "127.0.0.1" || u.hostname === "::1" || u.hostname === "[::1]";

    if (u.protocol === "http:" && u.hostname !== "localhost" && !estBoucleLocale) {
      pb("Protocole HTTP en dehors de localhost", `hostname = ${u.hostname}`,
        "Passez en https://. Le garde refuse tout http: dont le nom d'hôte n'est pas exactement « localhost ».");
    }
    if (estBoucleLocale) {
      pb(`« ${u.hostname} » est refusé alors qu'il s'agit bien de la machine locale`,
        "le code compare le nom d'hôte à la chaîne littérale « localhost »",
        "Écrivez MGS_PLATFORM_URL=http://localhost:<port> (le mot localhost, pas l'adresse IP).");
    }
    if (u.pathname && u.pathname !== "/") {
      pb("L'URL contient un chemin", `« ${u.pathname} » sera ignoré`,
        "Le client reconstruit l'URL depuis baseUrl.origin : le chemin est perdu. Laissez l'URL à la racine.");
    }
    if (u.search || u.hash) {
      pb("L'URL contient une requête ou un fragment", "ils seront ignorés", "Laissez une URL nue.");
    }
    if (String(URL_TESTEE).trim() !== String(URL_TESTEE).trim().replace(/\/+$/, "")) {
      ok("Slash final", "retiré par le client (client.ts:71), sans conséquence");
    }
  }

  // Vérification que ma copie du garde correspond au fichier réellement déployé.
  const fichierClient = join(RACINE, "lib", "agency", "client.ts");
  if (existsSync(fichierClient)) {
    const source = readFileSync(fichierClient, "utf8");
    const utiliseHostname = /baseUrl\.hostname\s*!==?\s*["']localhost["']/.test(source);
    const envAuChargement = /^const\s+(platformUrl|siteKey|siteSecret)\s*=\s*process\.env/m.test(source);
    const litALappel = /const\s+(platformUrl|siteKey|siteSecret)\s*=\s*process\.env\.MGS_/.test(source);

    if (envAuChargement && !litALappel) {
      pb(
        "lib/agency/client.ts lit les variables AU CHARGEMENT DU MODULE (pas à chaque appel)",
        "ligne 1-3 : `const platformUrl = process.env.MGS_PLATFORM_URL…`",
        "Recopiez le client.ts à jour du connecteur. En build Next, une variable absente au build reste undefined pour toujours.",
      );
    } else if (litALappel) {
      ok("Variables lues à chaque appel", "un redémarrage suffit après modification du .env.local");
    }

    if (!utiliseHostname) {
      info("Le garde de ce dépôt ne compare pas le nom d'hôte à « localhost » : vérifiez sa logique séparément.");
    }
  }
}

/* ================================================================== *
 * 3. Dérive de contrat — la panne la plus trompeuse
 * ================================================================== */

titre(3, "Conformité au contrat réel de l'API");

info("L'API renvoie : { agence: { identite, bouton_flottant }, prestations, offres, abonnement, demandes }");
info("Voir plateforme-mindgraphixsolution/app/api/v1/agency/route.ts:89-111.");

const fichierSpace = join(RACINE, "lib", "agency", "space.ts");

if (estPlateforme) {
  const route = join(RACINE, "app", "api", "v1", "agency", "route.ts");
  if (existsSync(route)) {
    const source = readFileSync(route, "utf8");
    if (/agence:\s*\{/.test(source) && /identite/.test(source)) {
      ok("La plateforme renvoie bien la forme imbriquée `agence.identite`");
    } else {
      pb("La forme de réponse de la plateforme a changé", join(route));
    }
  }
} else if (!existsSync(fichierSpace)) {
  info("Pas de lib/agency/space.ts dans ce dépôt : rien à comparer.");
} else {
  const space = readFileSync(fichierSpace, "utf8");
  const litImbrique = /agence\?\.\s*identite|\.agence\?\./.test(space);
  const litPlat = /platform\?\.(name|whatsapp|email|website|offers)\b/.test(space);

  if (litImbrique) {
    ok("space.ts lit `agence.identite`", "contrat aligné sur l'API");
  } else if (litPlat) {
    pb(
      "space.ts lit un CONTRAT PLAT qui n'existe plus",
      "il attend { name, whatsapp, offers } à la racine, l'API renvoie { agence: { identite }, offres, … }",
      "Recopiez lib/agency/space.ts + types.ts + contrat-partage.ts du connecteur (l'Agent 1 s'en charge). Effet actuel : nom et coordonnées vides, offres vides — SANS la moindre erreur affichée.",
    );
  } else {
    info("Forme de lecture non reconnue ; comparez space.ts avec celui du connecteur.");
  }

  // Le type doit exposer les mêmes champs que ceux rendus par les composants.
  const fichierTypes = join(RACINE, "lib", "agency", "types.ts");
  if (existsSync(fichierTypes)) {
    const types = readFileSync(fichierTypes, "utf8");
    if (/demandes\s*:\s*DemandeAffiche\[\]/.test(types) && /prestations\s*:/.test(types)) {
      ok("types.ts expose le nouvel espace (prestations, offres, abonnement, demandes)");
    } else if (/offers\s*:\s*AgencyOffer\[\]/.test(types)) {
      pb(
        "types.ts décrit encore l'ancien espace (agency/offers/announcements/billing)",
        "l'onglet « Mon agence » n'affichera ni prestations, ni demandes, ni abonnement",
        "Recopiez lib/agency/types.ts depuis mgs-agency-connector.",
      );
    }
  }

  if (!existsSync(join(RACINE, "lib", "agency", "contrat-partage.ts"))) {
    pb(
      "lib/agency/contrat-partage.ts est absent",
      "il porte les mots et les règles communes (libellés, prix, liens) utilisés par space.ts",
      "Recopiez tout le dossier lib/agency/ depuis mgs-agency-connector.",
    );
  } else {
    ok("contrat-partage.ts présent");
  }
}

/* ================================================================== *
 * 4. Prérequis côté plateforme
 * ================================================================== */

titre(4, "Prérequis de la plateforme");

function trouverPlateforme() {
  if (args.plateforme) return resolve(process.cwd(), args.plateforme);
  const pistes = [
    join(RACINE, "..", "plateforme-mindgraphixsolution"),
    join(dirname(RACINE), "plateforme-mindgraphixsolution"),
    join(RACINE_CONNECTEUR, "..", "plateforme-mindgraphixsolution"),
  ];
  for (const p of pistes) if (existsSync(join(p, "lib", "site-auth.ts"))) return resolve(p);
  return null;
}

const RACINE_PLATEFORME = estPlateforme ? RACINE : trouverPlateforme();

if (!RACINE_PLATEFORME) {
  info("Dépôt plateforme non trouvé ; cette section est ignorée. Indiquez-le avec --plateforme <chemin>.");
} else {
  info(`Plateforme : ${RACINE_PLATEFORME}`);

  // 4a. La plateforme a-t-elle sa clé de service ?
  const envPlateforme = join(RACINE_PLATEFORME, ".env.local");
  if (existsSync(envPlateforme)) {
    let envPlat = {};
    try {
      envPlat = lireEnv(envPlateforme);
    } catch {}
    for (const nom of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const v = envPlat[nom];
      if (typeof v === "string" && v.trim() !== "") {
        ok(`${nom} présente côté plateforme`);
      } else {
        pb(
          `${nom} absente du .env.local de la plateforme`,
          "lib/supabase-admin.ts:2 lève alors « Configuration Supabase manquante »",
          `Ajoutez ${nom}=… dans ${envPlateforme}. Sans elle, TOUTES les routes /api/v1/* renvoient 500 — donc le site affiche « Plateforme momentanément indisponible ».`,
        );
      }
    }
  } else {
    info("Pas de .env.local dans la plateforme (normal si elle tourne sur Vercel : variables dans le tableau de bord du projet).");
  }

  // 4b. Migration 202609290017
  const migrations = join(RACINE_PLATEFORME, "supabase", "migrations");
  const MIGRATION_CLE = "202609290017";
  if (existsSync(migrations)) {
    const fichiers = existsSync(migrations) ? readdirSync(migrations) : [];
    const a017 = fichiers.some((f) => f.startsWith(MIGRATION_CLE));
    if (a017) ok(`Migration ${MIGRATION_CLE} présente dans le dépôt`, " encore faut-il l'appliquer à la base");
    else pb(`Migration ${MIGRATION_CLE} absente du dépôt`, migrations);

    const versions = fichiers
      .filter((f) => /^\d{12}_.*\.sql$/.test(f))
      .map((f) => f.slice(0, 12))
      .sort();
    if (versions.length) info(`Migrations du dépôt : ${versions[0]} → ${versions[versions.length - 1]} (${versions.length})`);
  }

  // 4c. La sonde /api/health annonce-t-elle la bonne version ?
  const routeHealth = join(RACINE_PLATEFORME, "app", "api", "health", "route.ts");
  if (existsSync(routeHealth)) {
    const source = readFileSync(routeHealth, "utf8");
    const m = source.match(/DERNIERE_MIGRATION_ATTENDUE\s*=\s*["'](\d+)["']/);
    if (m) {
      if (m[1] < MIGRATION_CLE) {
        pb(
          `La sonde /api/health n'attend que la migration ${m[1]}`,
          `elle ne signalera donc PAS l'absence de ${MIGRATION_CLE}`,
          "La page de santé peut dire « migrations OK » alors que /api/admin/agency/config renvoie 503. Voyez l'agent qui détient la plateforme.",
        );
      } else {
        ok(`La sonde attend la migration ${m[1]}`, "elle détectera une base en retard");
      }
    }
  }

  // 4d. Le script de création de clé existe-t-il ?
  const script = join(RACINE_PLATEFORME, "scripts", "create-site-credential.mjs");
  if (existsSync(script)) {
    ok("scripts/create-site-credential.mjs présent",
      "NE L'EXÉCUTEZ PAS depuis ce script — il crée et révoque des identifiants en base");
  } else {
    info("Pas de script de création de clé dans ce dépôt.");
  }
}

/* ================================================================== *
 * 5. Test en ligne (facultatif)
 * ================================================================== */

if (!args["en-ligne"]) {
  titre(5, "Test en ligne — NON exécuté");
  info("Relancez avec --en-ligne pour appeler réellement la plateforme (GET seulement).");
} else if (!URL_TESTEE || !presence("MGS_SITE_KEY") || !presence("MGS_SITE_SECRET")) {
  titre(5, "Test en ligne — impossible");
  pb("Variables manquantes : impossible de construire les en-têtes d'authentification",
    "aucun appel n'a été tenté");
} else {
  titre(5, "Test en ligne — lecture seule (GET)");

  const cle = presence("MGS_SITE_KEY");
  const secret = presence("MGS_SITE_SECRET");
  const base = String(URL_TESTEE).replace(/\/+$/, "");
  const DELAI = Math.max(1, Number(args["timeout-s"]) || 8) * 1000;

  const ENTETES = {
    "X-Site-Key": cle,
    Authorization: `Bearer ${secret}`,
    Accept: "application/json",
  };

  info(`Clé testée : ${cle}`);
  info(`Secret testé : empreinte ${empreinte(secret)} (jamais affiché)`);

  async function appeler(chemin, options = {}) {
    const controleur = new AbortController();
    const minuterie = setTimeout(() => controleur.abort(), DELAI);
    const debut = Date.now();
    try {
      const reponse = await fetch(`${base}${chemin}`, {
        method: "GET",
        headers: ENTETES,
        signal: controleur.signal,
        cache: "no-store",
        redirect: "manual",
        ...options,
      });
      const texte = await reponse.text();
      let json = null;
      try {
        json = JSON.parse(texte);
      } catch {}
      return { statut: reponse.status, json, texte, ms: Date.now() - debut };
    } catch (erreur) {
      return { statut: 0, erreur, ms: Date.now() - debut };
    } finally {
      clearTimeout(minuterie);
    }
  }

  /** Traduit un statut HTTP en cause et en correction. */
  function expliquer(statut, json) {
    const message = (json && typeof json === "object" && json.error) || "";
    switch (statut) {
      case 200: return { bon: true, texte: "réponse OK" };
      case 400: return { bon: false, texte: "connexion sécurisée requise",
        action: "L'URL appelée n'est pas en HTTPS (ou n'est pas « localhost »). La plateforme refuse en HTTP. " };
      case 401: return { bon: false, texte: message || "clé inconnue, révoquée ou secret incorrect",
        action: "Soit MGS_SITE_KEY n'existe pas dans site_credentials, soit revoked_at est renseigné, soit MGS_SITE_SECRET ne correspond pas au SHA-256 stocké. Attention aux espaces et guillemets en fin de ligne." };
      case 403: return { bon: false, texte: message || "interdit",
        action: "La clé existe mais l'accès est refusé. Vérifiez la politique d'accès de la plateforme." };
      case 404: return { bon: false, texte: message || "route absente",
        action: "MGS_PLATFORM_URL ne pointe pas vers la plateforme MindGraphixSolution." };
      case 409: return { bon: false, texte: message || "Boutique non rattachée au backend commun",
        action: "sites.tenant_id est NULL pour ce site. Lancez scripts/create-site-credential.mjs côté plateforme : il crée tenants + sites et rattache." };
      case 429: return { bon: false, texte: message || "Limite de requêtes atteinte (60/min/site)",
        action: "Attendez une minute. loadAgencySpace() fait 3 GET en parallèle par chargement : au-delà de ~20 rendus/minute vous êtes plafonné. Augmentez MGS_CACHE_REVALIDATE_S." };
      case 500: return { bon: false, texte: message || "erreur serveur",
        action: "Regardez les logs Vercel de la plateforme. Cause fréquente : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absente (lib/supabase-admin.ts:2 lève alors)." };
      case 503: return { bon: false, texte: message || "service momentanément indisponible",
        action: "Soit la base n'est pas à jour (migration 202609290017), soit une table/colonne manque (codes PostgREST 42P01/42703/PGRST204), soit le rate-limit n'a pas pu être vérifié." };
      default:
        return { bon: false, texte: message || `statut inattendu ${statut}` };
    }
  }

  const r1 = await appeler("/api/v1/agency");
  const verdict1 = expliquer(r1.statut, r1.json);

  console.log(`  ${C.gras("/api/v1/agency")} → ${r1.statut || "connexion impossible"} ${C.gris(`(${r1.ms} ms)`)}`);
  if (r1.erreur) info(String(r1.erreur.cause || r1.erreur.message));

  if (verdict1.bon) {
    ok("La plateforme répond 200", `${r1.ms} ms`);
  } else if (r1.statut === 0) {
    pb("Plateforme injoignable", r1.erreur?.cause?.code || r1.erreur?.message,
      "Vérifiez MGS_PLATFORM_URL et que la plateforme est déployée / démarrée.");
  } else {
    pb(`HTTP ${r1.statut} — ${verdict1.texte}`, "", verdict1.action);
  }

  // Vérification de la forme de la réponse — uniquement si 200.
  if (r1.statut === 200 && r1.json && typeof r1.json === "object") {
    const corps = r1.json;
    const imbrique = corps.agence && typeof corps.agence === "object" && corps.agence.identite;
    if (imbrique) {
      const id = corps.agence.identite || {};
      ok("Forme de réponse conforme", "agence.identite présent");
      info(`identity : nom=${JSON.stringify(id.nom ?? null)}, whatsapp=${id.whatsapp ? "renseigné" : "VIDE"}, email=${id.email ? "renseigné" : "VIDE"}`);
      const nb = (x) => (Array.isArray(x) ? x.length : "absent");
      info(`prestations=${nb(corps.prestations)}  offres=${nb(corps.offres)}  demandes=${nb(corps.demandes)}  abonnement=${corps.abonnement ? "présent" : "absent"}`);
      if (!id.whatsapp) {
        pb("L'identité renvoyée n'a pas de WhatsApp", "le bouton flottant sera masqué",
          "Renseignez le WhatsApp dans l'administration de la plateforme.");
      }
    } else {
      pb(
        "La réponse 200 ne contient pas `agence.identite`",
        `clés reçues : ${Object.keys(corps).join(", ") || "(aucune)"}`,
        "Votre space.ts lit un contrat plat. Recopiez le lib/agency/ à jour : sans cela, tout s'affiche vide sans erreur.",
      );
    }
  } else if (r1.statut === 200) {
    pb("Réponse 200 qui n'est pas du JSON", `début : ${r1.texte.slice(0, 80)}`,
      "MGS_PLATFORM_URL pointe probablement vers une page HTML (page d'accueil Vercel) et non vers l'API.");
  }

  // Les deux autres lectures, pour distinguer « tout cassé » de « une route cassée ».
  for (const chemin of ["/api/v1/announcements", "/api/v1/billing"]) {
    const r = await appeler(chemin);
    const v = expliquer(r.statut, r.json);
    if (r.statut === 200) ok(`${chemin} → 200`, `${r.ms} ms`);
    else if (r.statut === r1.statut) info(`${chemin} → ${r.statut} (même statut que /api/v1/agency : cause commune, pas une route cassée)`);
    else pb(`${chemin} → ${r.statut}`, v.texte, v.action);
  }

  // Marge sous la limite de 60 req/min.
  if (args.charge) {
    console.log(`\n  ${C.gras("Mesure de la limite de 60 requêtes/minute")}`);
    info("10 requêtes GET vers /api/v1/agency. Un 429 signifie que la boutique est déjà au plafond.");
    let rate = 0;
    for (let i = 1; i <= 10; i += 1) {
      const r = await appeler("/api/v1/agency");
      if (r.statut === 429) { rate = i; break; }
      if (r.statut !== 200) { info(`arrêt au'appel ${i} : HTTP ${r.statut}`); rate = 0; break; }
      process.stdout.write(C.gris(`  … ${i}/10\r`));
    }
    process.stdout.write(" ".repeat(20) + "\r");
    if (rate > 0) {
      pb(`Limite atteinte après ${rate} appels supplémentaires`, "le compteur était déjà proche de 60/min",
        "SPACE.loadAgencySpace() fait 3 GET par rendu : au-delà de ~20 rendus/minute vous êtes plafonné. Augmentez MGS_CACHE_REVALIDATE_S (max 300).");
    } else {
      ok("Aucune saturation sur 10 appels supplémentaires", "marge confortable sous les 60/min");
    }
  } else {
    info("Limite de 60 req/min non mesurée — ajoutez --charge si vous pensez à un problème de débit.");
  }
}

/* ================================================================== *
 * 6. Ce qu'il reste à vérifier côté base (jamais fait ici)
 * ================================================================== */

titre(6, "Contrôles qui demandent un accès à la base (non faits ici)");

info("Ce script ne se connecte jamais à Supabase. Voici les trois requêtes à jouer");
info("dans le SQL Editor de Supabase, en LECTURE seule, si un test HTTP est insuffisant :");
console.log(C.gris(`
  -- 1. La clé existe-t-elle, et n'est-elle pas révoquée ?
  select key_id, revoked_at, created_at
    from public.site_credentials
   where key_id = 'MGS_SITE_KEY_QUE_VOUS_AVEZ_COPEIE';

  -- 2. Le site est-il rattaché au backend commun ?
  select s.id, s.name, s.tenant_id, s.last_seen_at
    from public.sites s
   where s.key_id = 'MGS_SITE_KEY_QUE_VOUS_AVEZ_COPEIE';
  -- tenant_id IS NULL  =>  la plateforme répond 409

  -- 3. La migration 202609290017 est-elle appliquée ?
  select * from public.derniere_migration();

  -- 4. Combien de requêtes ce site a-t-il consomme récemment ?
  select endpoint, status, created_at
    from public.api_request_log
   order by created_at desc
   limit 20;
`));
info("Lecture seule : aucune de ces requêtes ne modifie quoi que ce soit.");

/* ================================================================== *
 * Verdict
 * ================================================================== */

console.log(`\n${C.gras(TIRETS)}\n${C.gras("VERDICT")}\n${C.gris(TIRETS)}`);

if (compteurPb === 0) {
  console.log(`  ${C.vert(`${compteurOk} contrôles passés, aucun problème détecté.`)}`);
if (!args["en-ligne"]) {
    console.log(C.jaune("  Les contrôles hors ligne sont complets, mais le test HTTP n'a pas été fait."));
    console.log("  Relancez avec --en-ligne pour confirmer la réponse réelle de la plateforme.");
  }
} else {
  console.log(`  ${C.vert(`${compteurOk} contrôles passés`)}, ${C.rouge(`${compteurPb} problèmes`)}.\n`);
  if (ACTIONS.length > 0) {
    console.log(C.gras("  Dans cet ordre :"));
    ACTIONS.forEach((a, i) => console.log(`  ${C.rouge(`${i + 1}.`)} ${a}`));
  }
}

console.log();
process.exit(compteurPb === 0 ? 0 : 1);