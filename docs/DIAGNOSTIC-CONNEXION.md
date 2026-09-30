# Diagnostic : « pourquoi les connexions ne passent pas sur les sites ? »

Agent 7 — chaîne de connexion site client ↔ plateforme MindGraphixSolution.
Toutes les affirmations ci-dessous sont vérifiables : chemin de fichier + numéro
de ligne, ou sortie de commande.

---

## 1. La cause racine, en une phrase

**Aucune des trois variables `MGS_*` n'existe dans aucun `.env.local`, et il n'y a
même pas de `.env.local` dans deux dépôts sur quatre.**

Vérifié par lecture de noms de variables uniquement (jamais de valeur) :

| Dépôt | `.env.local` | `MGS_PLATFORM_URL` | `MGS_SITE_KEY` | `MGS_SITE_SECRET` |
|---|---|---|---|---|
| `plateforme-mindgraphixsolution` | présent (763 o) | sans objet | sans objet | sans objet |
| `template-boutique-mgs` | **ABSENT** | **ABSENTE** | **ABSENTE** | **ABSENTE** |
| `site-vitrine-mindgraphixsolution` | présent | **ABSENTE** | sans objet | sans objet |
| `mgs-agency-connector` | **ABSENT** | n'est pas un site | n'est pas un site | n'est pas un site |

Et le point qui rend ce diagnostic si grave : `lib/agency/client.ts:74`

```ts
if (!platformUrl || !siteKey || !siteSecret) return null;
```

`return null` **avant tout appel réseau**, sans `console.error`. C'est la
différence entre « la plateforme est down » et « personne n'a jamais configuré
ce site » : les deux produisent exactement la même absence d'affichage, mais la
seule trace de la seconde est une variable absente d'un fichier non commité.

Ce n'est pas qu'une théorie. Le site vitrine le prouve par l'absentéisme :
`site-vitrine-mindgraphixsolution/.env.local` ne contient que
`VERCEL_OIDC_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Son `.env.example` ligne 2 propose `MGS_PLATFORM_URL=http://localhost:3001` — le
port `3001` ne correspond à aucun serveur configuré, et le `.env.local` ne suit
même pas son propre `.env.example`.

**Correction qui prend 3 minutes par site** : créer le `.env.local`, y mettre les
trois lignes, redémarrer le serveur. Rien d'autre n'est nécessaire pour que la
chaîne démarre.

---

## 2. Tableau de diagnostic

Chaque ligne est vérifiable par une commande unique. `PB` = la cause est
présente dans l'état actuel du dépôt (vérifié par lecture de fichier).

| # | Cause | Comment vérifier en une commande | Attendu | État |
|---|---|---|---|---|
| 1 | **Variables absentes** | `grep -c '^MGS_SITE_SECRET=' template-boutique-mgs/.env.local` | `1` | **PB** — fichier inexistant |
| 2 | URL en HTTP hors localhost | voir §3, garde ligne `client.ts:85` | refus | non applicable (pas d'URL) |
| 3 | `127.0.0.1` au lieu de `localhost` | voir §3, ligne `client.ts:85` | refus | **risque réel**, `.env.example` du site vitrine propose `localhost` (correct) mais rien ne l'empêche |
| 4 | Clé absente en base | SQL Editor, §5 | 1 ligne | **inconnu** — non vérifiable sans base |
| 5 | Secret révoqué / mal recopié | `revoked_at IS NULL` en base | non révoqué | **inconnu** — non vérifiable sans base |
| 6 | `sites.tenant_id` NULL | SQL Editor, §5 | non NULL | **inconnu** — non vérifiable sans base |
| 7 | Migration 017 non appliquée | voir §4 | 200 | **incertain** — le fichier est dans le dépôt, l'application à la base est inconnue |
| 8 | Rate limit 60/min | `node scripts/verifier-connexion.mjs --site <site> --en-ligne --charge` | pas de 429 | **inconnu** — voir §6, aggravé par le cache 300 s |
| 9 | Dérive de contrat | voir §3 | `agence.identite` | **PB — confirmé** (`space.ts:134` du template) |
| 10 | Cache `revalidate: 300` | `grep -n 'revalidate: 300' lib/agency/client.ts` | `60` | **PB dans le template**, corrigé dans le connecteur |
| 11 | Dev : secret modifié sans redémarrage | `client.ts:1-3` du template | lecture par appel | **PB dans le template**, corrigé dans le connecteur |
| 12 | Variables absentes de Vercel | `vercel env ls` | les 3 variables | **probable** — `.vercel/` ne contient que `project.json` |
| 13 | Site vitrine sans clé de site | `grep -rn 'api/v1/agency' site-vitrine-mindgraphixsolution` | occurrence | **confirmé, sans conséquence** — le vitrine n'appelle pas cette route |

### Précision sur les causes 1, 9, 10, 11 : elles se cumulent

Ce ne sont pas quatre hypothèses concurrentes. Le template-boutique cumule
**les quatre simultanément**, et chacune suffit à elle seule à produire un écran
vide. C'est ce qui rend le symptôme si trompeur : même en corrigeant les
variables, l'onglet resterait vide, parce que `space.ts` lirait toujours un
contrat qui n'existe plus.

---

## 3. Les deux pièges vérifiés dans le code

### 3.1 `localhost` ≠ `127.0.0.1` — confirmé

`lib/agency/client.ts:82-89` :

```ts
if (
  requestUrl.origin !== baseUrl.origin
  || !requestUrl.pathname.startsWith("/api/v1/")
  || (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost")
) {
```

`new URL("http://127.0.0.1:3000").hostname` vaut la chaîne `"127.0.0.1"`, qui
n'est jamais égale à `"localhost"`. Rejeu du garde sur 8 URL (résultat mesuré) :

```
AUTORISE  http://localhost:3000                (hostname=localhost,    proto=http:)
REFUSE    http://127.0.0.1:3000                (hostname=127.0.0.1,   proto=http:)
REFUSE    http://[::1]:3000                    (hostname=[::1],       proto=http:)
AUTORISE  https://plateforme.vercel.app        (hostname=plateforme.vercel.app, proto=https:)
AUTORISE  https://plateforme.vercel.app/       (slash final : sans conséquence)
AUTORISE  https://plateforme.vercel.app///     (plusieurs slashs : sans conséquence)
REFUSE    http://plateforme.vercel.app         (HTTP en production : refusé)
AUTORISE  https://plateforme.vercel.app/base   (le /base sera ignoré, pas refusé)
```

Le même garde existe côté plateforme, `lib/site-auth.ts:7`. Les deux comparaisons
doivent être contournées simultanément : une URL en `http://127.0.0.1` est
refusée **des deux côtés**.

Bonne nouvelle : les slashs finaux sont inoffensifs, `client.ts:71` fait
`.replace(/\/+$/, "")`.

### 3.2 La dérive de contrat — confirmée par lecture de fichier

`plateforme-mindgraphixsolution/app/api/v1/agency/route.ts:89-111` renvoie :

```ts
{
  agence: { identite, bouton_flottant },
  prestations, offres, abonnement, demandes,
}
```

`template-boutique-mgs/lib/agency/space.ts:132-141` lit :

```ts
return {
  agency: {
    name: textOf(platform?.name, 80) || local.name,
    whatsapp: digitsOf(platform?.whatsapp) ?? local.whatsapp,
    ...
  offers: normalizeOffers(platform?.offers),
  ...
};
```

`platform?.name` est `undefined` (le vrai champ est `agence.identite.nom`),
`platform?.offers` est `undefined` (le vrai champ est `offres`). **Aucune de ces
lectures ne lève** — `textOf(undefined)` renvoie `""`, `normalizeOffers(undefined)`
renvoie `[]`. Le repli masque tout : le site affiche « MindGraphixSolution »,
coordonnées vides, zéro offre, zéro erreur.

Le connecteur a bien été corrigé : `mgs-agency-connector/lib/agency/space.ts:590-593`
lit `agence?.identite ?? plateforme?.identite`. **Le template n'a pas reçu cette
correction** — `template-boutique-mgs/lib/agency/` date du 29/09 00:07, le
connecteur du 30/09 10:42.

Le template n'a pas non plus `lib/agency/contrat-partage.ts`, absent du dépôt.

---

## 4. Blocage secondaire côté plateforme

`lib/supabase-admin.ts:2` :

```ts
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuration Supabase manquante");
```

Le `.env.local` de la plateforme contient 5 variables : `SUPABASE_DB_URL`,
`SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`, `RESEND_DOMAIN`.
**Ni `NEXT_PUBLIC_SUPABASE_URL` ni `SUPABASE_SERVICE_ROLE_KEY`.**

Or aucune des 10 routes `/api/v1/*` n'entoure `authenticateSite` d'un
`try/catch` (vérifié : `grep -c "try {"` renvoie 0 pour `agency`, `agency/requests`,
`announcements`, `billing`, `tickets`, `heartbeat`, `billing/paiement`). Une
exception dans `authenticateSite` remonte telle quelle → **HTTP 500** sur toutes
les routes API → `client.ts:115` arme la fenêtre d'échec 20 s → le site affiche
« Plateforme momentanément indisponible ».

Deux réserves honnêtes :
- si la plateforme tourne **sur Vercel**, ces variables sont dans le tableau de
  bord du projet et ce diagnostic local est muet ;
- `.vercel/project.json` existe (`prj_AWFrn6AFipEFX9g1zHfi1SBm14MF`), la
  plateforme est donc probablement déployée. Il faut vérifier sur Vercel.

**Caveat proche** : `app/api/health/route.ts:25` déclare
`DERNIERE_MIGRATION_ATTENDUE = "202609290014"` alors que la dernière migration du
dépôt est `202609290017`. La sonde dira « migrations OK » sur une base à
`202609290016`, alors que `/api/admin/agency/config` exige explicitement la 017
et renverrait 503. **La page de santé ne peut pas servir de preuve ici.**

---

## 5. Les trois requêtes SQL à jouer (lecture seule)

Je ne les ai pas exécutées — elles touchent la base réelle. À jouer dans le SQL
Editor de Supabase, elles ne modifient rien :

```sql
-- 1. La clé existe-t-elle ? Est-elle révoquée ?
select key_id, revoked_at, created_at
  from public.site_credentials
 where key_id = '<votre MGS_SITE_KEY>';

-- 2. Le site est-il rattaché au backend commun ?
select s.id, s.name, s.tenant_id, s.last_seen_at
  from public.sites s
 where s.key_id = '<votre MGS_SITE_KEY>';
-- tenant_id IS NULL  =>  la plateforme répond 409

-- 3. La migration est-elle appliquée ?
select * from public.derniere_migration();
-- version < 202609290017  =>  /api/admin/agency/config renvoie 503
```

Lecture des résultats :
- `0 ligne` au §1 → clé jamais créée ou typo → **relancer `create-site-credential.mjs`**
- `revoked_at` non NULL → 401 → **relancer le script** (il révoque l'ancien et crée le nouveau)
- `tenant_id` NULL au §2 → 409 → **relancer le script** (il crée `tenants` + `sites` et rattache)
- `version` < `202609290017` → appliquer `supabase/migrations/202609290017_agence_commune_et_bouton_flottant.sql`

---

## 6. Le test `curl` à copier-coller

Le test le plus utile — la chaîne complète, de la clé au statut HTTP :

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Site-Key: $MGS_SITE_KEY" \
  -H "Authorization: Bearer $MGS_SITE_SECRET" \
  "$MGS_PLATFORM_URL/api/v1/agency"
```

Lecture du statut :

| Statut | Cause | Correction |
|---|---|---|
| `200` | tout va bien | — |
| `400` | HTTP au lieu de HTTPS | passer en `https://`, ou `localhost` littéral |
| `401` | clé inconnue, révoquée, ou secret faux | vérifier §5 point 1 ; attention aux espaces en fin de ligne |
| `409` | `sites.tenant_id` est NULL | relancer `create-site-credential.mjs` |
| `429` | 60 req/min dépassées | attendre 1 min ; augmenter `MGS_CACHE_REVALIDATE_S` |
| `500` | `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` absente | voir §4 |
| `503` | migration absente, ou table/colonne manquante | appliquer la 017 |

Forme de la réponse — à vérifier **une fois le 200 obtenu** :

```bash
curl -s \
  -H "X-Site-Key: $MGS_SITE_KEY" \
  -H "Authorization: Bearer $MGS_SITE_SECRET" \
  "$MGS_PLATFORM_URL/api/v1/agency" \
  | python3 -m json.tool | head -40
```

Si les clés sont `agence`, `prestations`, `offres`, `abonnement`, `demandes` :
l'API est saine, le problème est côté `space.ts`. Si les clés sont `name`,
`whatsapp`, `offers` : vous interrogez une **ancienne version** de la plateforme.

Test de saturation (10 requêtes de plus, à faire une fois) :

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "$i : %{http_code}\n" \
    -H "X-Site-Key: $MGS_SITE_KEY" \
    -H "Authorization: Bearer $MGS_SITE_SECRET" \
    "$MGS_PLATFORM_URL/api/v1/agency"
done
```

Un `429` avant le 10ᵉ = le compteur était déjà proche de 60.

---

## 7. Verdict par dépôt

### `plateforme-mindgraphixsolution` — ⚠️ ne peut rien servir en l'état local

**Marchera :** la logique d'authentification est correcte. `site-auth.ts:20`
rejette bien une credential absente ou révoquée, `:24-29` compare le SHA-256 en
temps constant avec `crypto.timingSafeEqual`, `:40` refuse un tenant NULL en 409,
`:55` plafonne à 60/min, `:59` journalise, `:73` rafraîchit `last_seen_at`.
Aucune de ces étapes ne ment.

**Ne marchera pas localement :** `getAdminClient()` **lève** (§4), et aucune
route `/api/v1/*` ne rattrape l'exception. Toutes les routes de l'agence
renvoient 500.

**Dépend d'une vérification que je ne peux pas faire :** sur Vercel, les deux
variables sont peut-être correctement configurées. Vérifiez dans
*plateforme-mindgraphixsolution → Settings → Environment Variables*. Le dossier
`.vercel/` ne contient que `project.json`, il ne liste aucune variable.

**Point de vigilance :** la sonde `/api/health` attend la migration
`202609290014` alors que la 017 existe (§4). Ne pas s'en servir comme preuve.

### `template-boutique-mgs` — ✗✗ aucune chance en l'état, 4 causes cumulées

| Cause | Fichier:ligne | Effet |
|---|---|---|
| Pas de `.env.local` du tout | — | `client.ts:6` renvoie `null` sans appeler la plateforme |
| Contrat plat | `space.ts:134-139` | nom, coordonnées, offres vides **sans erreur** |
| `types.ts` ancien | `types.ts:47-53` (`agency`/`offers`/`announcements`/`billing`) | ni prestations, ni demandes, ni abonnement |
| `contrat-partage.ts` absent | — | la version locale de `space.ts` n'a pas besoin de ses helpers, mais elle n'a pas non plus les règles de formatage partagées |

S'y ajoute, dans la copie locale de `client.ts` :
- **ligne 1-3** : les variables sont lues **au chargement du module**, pas à
  chaque appel. En build Next, une variable absente au build reste `undefined`
  pour toujours. Le connecteur a corrigé ce point (commentaire `client.ts:60-69`).
- **ligne 36** : `revalidate: 300`. Cache de 5 minutes sur une boutique qui rend
  beaucoup de pages — c'est aussi ce qui fait que **3 requêtes par chargement ×
  onglets ouverts** peuvent rester invisibles en local.

**Verdict :** même avec des variables parfaites, cet onglet afficherait un espace
vide. Il faut recopiier `lib/agency/` depuis le connecteur, pas seulement créer
un `.env.local`.

### `site-vitrine-mindgraphixsolution` — ✗ mais **pour une raison entièrement différente**

**Le site vitrine ne consomme pas l'espace « Mon agence ».** Vérifié :
`grep -rn "callAgency|loadAgencySpace|api/v1/agency" site-vitrine-mindgraphixsolution`
ne renvoie **aucune occurrence** (hors `node_modules`). Le dépôt n'a ni
`lib/agency/` ni `components/agency/`.

Ses coordonnées d'agence sont **en dur** dans `lib/agency-data.ts:11-28`
(`agency.name`, `.phone`, `.whatsapp`, `.email`, hardcodés). Le fichier le dit
lui-même lignes 4-8 : « Source de vérité du site vitrine. Si une information
n'est pas confirmée en ligne, elle n'apparaît pas ici. »

**Ce qui ne marche pas :** `app/api/leads/route.ts:32-37` lit `MGS_PLATFORM_URL`
et renvoie 503 « La demande en ligne n'est pas encore reliée » si elle est
absente. Or son `.env.local` **ne la contient pas**. Le formulaire de devis est donc
coupé de la plateforme, et c'est le seul point de rupture réel.

**Ce qui n'est PAS un défaut :** l'absence de `MGS_SITE_KEY` / `MGS_SITE_SECRET`.
Le site vitrine n'appelle que `/api/v1/leads` (`leads/route.ts:42`), et cette
route **n'exige aucune clé** — vérifié : `grep -c authenticateSite
app/api/v1/leads/route.ts` → `0`. La cause 13 de la liste initiale est donc
**invalide** pour ce dépôt : lui donner une clé de site serait inutile et
introduirait un secret inutile.

**Correction :** ajouter `MGS_PLATFORM_URL=https://<plateforme>` à son `.env.local`,
et **retirer `MGS_PLATFORM_URL=http://localhost:3001` de son `.env.example`**
(ligne 2), qui est un piège : le port `3001` ne correspond à rien.

---

## 8. Les corrections, classées par impact ÷ effort

### A. Variables d'environnement — 3 minutes par site, débloque tout

**Aucun code à écrire.**

```bash
# 1. Créer les identifiants (plateforme) — À FAIRE UNE SEULE FOIS
cd plateforme-mindgraphixsolution
SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… \
  node scripts/create-site-credential.mjs "Nom de la boutique"
# → affiche MGS_SITE_KEY=… et MGS_SITE_SECRET=…, UNE SEULE FOIS
# → seul le SHA-256 du secret est stocké : le perdre oblige à régénérer

# 2. Les écrire dans le site (jamais dans .env.example, jamais avec NEXT_PUBLIC_)
cd ../template-boutique-mgs
cat > .env.local <<'EOF'
MGS_PLATFORM_URL=https://<plateforme-deployee>
MGS_SITE_KEY=<colle>
MGS_SITE_SECRET=<colle>
MGS_CACHE_REVALIDATE_S=60
MGS_AGENCY_NAME=MindGraphixSolution
MGS_AGENCY_WHATSAPP=<numero>
MGS_AGENCY_EMAIL=<adresse>
EOF
```

Le filet `MGS_AGENCY_*` n'est pas cosmétique : sans lui, `space.ts:599` renvoie
`null` et **l'onglet n'existe pas** tant que la plateforme ne répond pas.

**Sur Vercel**, les mêmes trois variables dans *Settings → Environment Variables*,
puis **redéploiement**. Un `.env.local` n'a aucun effet sur un déploiement Vercel.

### B. Recopier `lib/agency/` dans le template — 2 minutes, supprime la cause 9

```bash
cp -r lib/agency/            ../template-boutique-mgs/lib/agency/
cp -r components/agency/     ../template-boutique-mgs/components/agency/
cp    components/agency.css  ../template-boutique-mgs/components/agency.css
```

À faire par l'Agent 1 (il corrige le contrat). Sans cela, A seul ne suffira pas.

### C. Variables serveur de la plateforme — 2 minutes, sinon 500 partout

Ajouter `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` au `.env.local`
de la plateforme **si** elle tourne en local ; sinon vérifier le tableau de bord
Vercel.

### D. Migration 202609290017 — 1 minute si elle manque

Appliquer `supabase/migrations/202609290017_agence_commune_et_bouton_flottant.sql`.
Vérifier d'abord par `select * from public.derniere_migration();`.

### E. Nettoyage du site vitrine — 1 minute

Ajouter `MGS_PLATFORM_URL` à son `.env.local`, et supprimer la ligne
`MGS_PLATFORM_URL=http://localhost:3001` de son `.env.example`.

### F. Non traité ici, mais à signaler

- `/api/health` attend `202609290014` au lieu de `202609290017` — la sonde ne peut
  pas servir de preuve de fraîcheur de la base.
- Aucune route de revalidation (`purgerCacheAgence` n'est appelé nulle part — vérifié
  par grep dans le connecteur) : avec `revalidate: 300` dans le template, un
  changement côté admin peut mettre 5 minutes à apparaître. Semble être « ça ne
  marche pas » alors que ça marche.

---

## 9. Le script

`scripts/verifier-connexion.mjs` — sans dépendance, ne lance que du Node natif.

```bash
cd mgs-agency-connector

node scripts/verifier-connexion.mjs                              # dépôt courant
node scripts/verifier-connexion.mjs --site ../template-boutique-mgs
node scripts/verifier-connexion.mjs --site ../template-boutique-mgs --en-ligne
node scripts/verifier-connexion.mjs --url http://127.0.0.1:3000   # test du garde seul
```

Ce qu'il vérifie : présence des variables (sans afficher les valeurs), garde SSRF
rejoué hors réseau à l'identique de `client.ts:80-89`, conformité du contrat,
présence de la 017, cohérence de la sonde `/api/health`, et en `--en-ligne` la
réponse réelle avec traduction de chaque statut HTTP.

Ce qu'il ne fait pas : rien n'est écrit, aucun secret n'est affiché (au mieux 4
caractères du SHA-256), aucun appel non-lecture, aucun accès à Supabase, aucune
exécution de `create-site-credential.mjs`.

Code de retour : `0` si tout va bien, `1` sinon — exploitable en CI.

---

## 10. Par où commencer, dans l'ordre

1. **`cd plateforme-mindgraphixsolution`**, vérifier `NEXT_PUBLIC_SUPABASE_URL` et
   `SUPABASE_SERVICE_ROLE_KEY` (local **et** Vercel). Sans elles : 500 partout.
2. **Lancer `scripts/create-site-credential.mjs`** et copier les deux lignes
   affichées.
3. **Écrire le `.env.local` du template** avec les trois variables, puis
   **redémarrer** `next dev`.
4. **Recopier `lib/agency/`** depuis le connecteur (Agent 1), sinon l'onglet reste
   vide malgré des variables parfaites.
5. **Lancer** `node scripts/verifier-connexion.mjs --site ../template-boutique-mgs --en-ligne`
   et lire le verdict.
6. **Si la plateforme tourne sur Vercel** : ajouter les trois variables au projet du
   site, redéployer, recommencer au §5.