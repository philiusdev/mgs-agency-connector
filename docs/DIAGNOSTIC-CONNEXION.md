# Diagnostic de la connexion site ↔ plateforme

Ce document sert à une chose : trouver **où** une connexion entre un site client
et la plateforme MindGraphixSolution est cassée, et dire quoi faire ensuite.

Il ne contient pas d'état du projet. Un tel instantané vieillit mal — il décrit
quatre dépôts qui bougent en continu, et il finit par affirmer des choses
fausses à un technicien censé diagnostiquer une panne. Ce qui est écrit ici est
vérifiable dans le code, avec un chemin de fichier et un numéro de ligne, ou
par une commande à exécuter.

L'installation, elle, est décrite dans `INSTALLATION-CONNECTEUR.md`, sections
« Vérifier que ça marche » et « En cas de problème ». Ce document ne s'y
substitue pas : il sert une fois l'intégration en place et le symptôme constaté.

---

## 1. Trois couches, trois outils

Une panne se situe toujours dans l'une de ces trois couches. Les diagnostiquer
dans cet ordre évite de chercher du côté de la plateforme un problème qui
est dans le site.

| Couche | Ce qui s'y joue | L'outil qui la parle |
|---|---|---|
| **1. Le site** | Variables d'environnement, session Supabase, rôle du compte, origine des appels, quota d'envoi | `scripts/verifier-connexion.mjs` (hors ligne), puis les journaux `[mgs-agency]` |
| **2. La liaison** | URL de la plateforme, garde de sécurité HTTPS/origine, forme de la réponse | `scripts/verifier-connexion.mjs --en-ligne` |
| **3. La plateforme** | Base, tables, migrations, privileges, quota de 60 requêtes/minute | `GET /api/health` **de la plateforme** |

> `app/api/health/route.ts` de ce dépôt n'est pas l'outil de la couche 3. Cette
> route répond `status`, `version` et `timestamp`, n'appelle jamais la plateforme
> et ne dit rien de la connexion : c'est une sonde de disponibilité du site, et
> son en-tête de fichier exclut volontairement cet usage (§3).

---

## 2. Le script, d'abord

Aucune dépendance, uniquement du Node natif. Depuis la racine de ce dépôt :

```bash
# Hors ligne : variables, garde SSRF, dérive de contrat, prérequis plateforme
node scripts/verifier-connexion.mjs

# Idem, sur un site client voisin
node scripts/verifier-connexion.mjs --site ../template-boutique-mgs

# + un vrai GET sur /api/v1/agency, /api/v1/announcements, /api/v1/billing
node scripts/verifier-connexion.mjs --site ../template-boutique-mgs --en-ligne

# + mesure de la marge sous la limite de 60 requêtes/minute (10 appels de plus)
node scripts/verifier-connexion.mjs --site ../template-boutique-mgs --en-ligne --charge

# Tester une URL seule, sans lire de fichier
node scripts/verifier-connexion.mjs --url http://127.0.0.1:3000
```

Options : `--site <chemin>`, `--plateforme <chemin>`, `--url <url>`,
`--en-ligne`, `--charge`, `--timeout-s <n>` (défaut 8), `-a`/`--aide`.

**Code de retour : `0` si aucun problème n'est détecté, `1` sinon.** Le script
termine par un verdict qui récapitule les contrôles passés et les corrections,
dans l'ordre.

### Ce que le script vérifie

| Section | Contrôle |
|---|---|
| `[1]` | Présence de `MGS_PLATFORM_URL`, `MGS_SITE_KEY`, `MGS_SITE_SECRET` et du filet `MGS_AGENCY_*`. Aucune valeur n'est affichée : au mieux la longueur, et 4 caractères du SHA-256 du secret. |
| `[2]` | Rejoue hors réseau le garde de `lib/agency/client.ts:303-310` sur l'URL du site, et signale les cas réels qu'il refuse (§7.1). Vérifie ensuite dans `lib/agency/client.ts` du site si les variables sont lues à chaque appel ou au chargement du module. |
| `[3]` | Dérive de contrat : `space.ts` lit-il `agence.identite`, `types.ts` expose-t-il `prestations`/`offres`/`abonnement`/`demandes`, `contrat-partage.ts` est-il présent. C'est la panne la plus trompeuse : aucune erreur n'est affichée, l'onglet est simplement vide. |
| `[4]` | Côté plateforme : `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans son `.env.local`, présence de la migration de référence attendue par le script (voir la limite ci-dessous), cohérence entre cette référence et la version qu'annonce la sonde `/api/health`, présence de `scripts/create-site-credential.mjs`. |
| `[5]` | `--en-ligne` : GET authentifié sur les trois routes, traduction de chaque statut HTTP en cause et en correction, vérification de la forme de la réponse quand le statut est 200. |
| `[6]` | Rappelle les trois requêtes SQL de lecture seule à jouer dans le SQL Editor si un test HTTP ne suffit pas (§6). |

### Ce que le script ne fait jamais

- Il n'écrit rien et n'exécute aucune commande de création ou de rotation d'identifiants (`create-site-credential.mjs`).
- Il ne se connecte pas à Supabase.
- Il n'affiche aucun secret, en clair ni tronqué au-delà de l'empreinte.
- Hors `--en-ligne`, il n'effectue aucun appel réseau.

### Deux limites à connaître

- La version de migration que le script attend est une constante inscrite dans
  le script lui-même, pas une référence : elle peut être plus ancienne que celle
  que la plateforme attend réellement. La source de vérité reste la constante
  `DERNIERE_MIGRATION_ATTENDUE` de `plateforme/app/api/health/route.ts`.
- Le script ne teste pas les routes `/api/agency/*` du site. Il valide la
  configuration de `lib/agency/` et la liaison vers la plateforme ; la couche
  « session, rôle, origine » reste à vérifier dans les journaux du site (§5).

---

## 3. La sonde `/api/health` de la plateforme

C'est le troisième outil, mais il n'appartient pas à ce dépôt : c'est
`plateforme-mindgraphixsolution/app/api/health/route.ts`. Elle est publique, sans
authentification, et répond en JSON.

Elle contrôle six choses, et s'arrête avant les cinq dernières si la base ne
répond pas (elle renvoie alors `503` et `status: "hs"` immédiatement) :

1. que la base répond ;
2. que les tables attendues du schéma `public` existent ;
3. que les seize tables du schéma `faso_mode` existent ;
4. que la base est à jour des migrations ;
5. qu'aucun privilège `ALL`/`TRUNCATE` n'échappe à la RLS ;
6. que les boutiques sont joignables (sur un échantillon de 200).

Elle renvoie `status` (`ok`, `degrade`, `hs`), un résumé, la durée du contrôle,
le détail de chaque vérification, et des mesures (nombre total de sites,
inactifs…). Le code HTTP `503` n'est renvoyé que pour `hs` — un `degrade` se
lit dans le corps.

**Ce que cette sonde ne couvre pas :** elle décrit l'état de la plateforme, pas
celui d'un site client donné. Elle ne dit rien de la clé, du secret, de
l'URL déclarée par un site, ni de sa configuration. Un `ok` n'exclut pas qu'un
site particulier soit mal configuré.

---

## 4. Symptômes et causes

| Symptôme | Cause probable | Où le vérifier | Correction |
|---|---|---|---|
| L'onglet « Mon agence » est absent, aucune erreur visible | Une des trois variables critiques manque, ou le filet de repli n'est pas configuré | `node scripts/verifier-connexion.mjs` | Renseigner les variables dans `.env.local`, puis redémarrer le serveur de développement |
| L'onglet est présent mais vide, sans message d'erreur | Une dérive de contrat (`space.ts` lit un contrat plat au lieu de `agence.identite`) | Script, section `[3]` | Recopier `lib/agency/` depuis ce dépôt vers le site client |
| Le nom de l'agence s'affiche mais pas le WhatsApp | La plateforme n'a pas de numéro renseigné pour cette identité | Script, section `[3]`, qui signale l'absence | Renseigner le WhatsApp dans l'administration de la plateforme |
| Un changement fait dans l'administration n'apparaît pas sur le site | Le cache des lectures n'a pas encore expiré | Attendre `MGS_CACHE_REVALIDATE_S` (60 s par défaut) ou appeler `POST /api/agency/revalidate` | Purger explicitement (§7.2) ; ce n'est pas une panne |
| `401 Non autorisé` sur `/api/v1/agency` | Clé inconnue, révoquée, ou secret qui ne correspond pas au SHA-256 stocké | Script `--en-ligne`, ou SQL : `site_credentials.revoked_at IS NULL` | Relancer `create-site-credential.mjs` côté plateforme ; le secret n'est affiché qu'une fois |
| `409 Boutique non rattachée au backend commun` | `sites.tenant_id` est `NULL` | SQL : `select tenant_id from sites where key_id = '…'` | Relancer `create-site-credential.mjs` : il crée le tenant, le site et le rattache |
| `400 Connexion sécurisée requise` | L'URL de la plateforme est en HTTP hors `localhost` | Script, section `[2]` | Passer en `https://` |
| `429 Limite de requêtes atteinte` | 60 requêtes/minute par site, appliquées en base | Script `--en-ligne --charge` | Augmenter `MGS_CACHE_REVALIDATE_S` (300 s max) ; le panneau fait 3 GET par rendu |
| `500` sur toutes les routes `/api/v1/*` | `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` absente côté plateforme | Script, section `[4]` ; `getAdminClient()` lève à `lib/supabase-admin.ts:2` | Renseigner ces deux variables dans le `.env.local` de la plateforme (ou sur Vercel) |
| `503` sur `/api/v1/agency` ou `/api/v1/billing` | Base en retard de migration, ou table/colonne manquante | `GET /api/health` de la plateforme ; section `migrations` | Appliquer les migrations en retard ; la sonde indique la version attendue |
| Le crédit « Site créé par MindGraphixSolution » s'affiche mais sans lien | `MGS_WEBSITE_URL` absente ou invalide | Script, section `[1]` | Renseigner `MGS_WEBSITE_URL` en toutes lettres, en `http` ou `https` uniquement |
| Le formulaire de demande renvoie `401 Connectez-vous pour envoyer une demande` | `MGS_AGENCY_REQUIRER_SESSION` vaut `1` ou est absente (c'est le défaut) | `app/api/agency/request/route.ts:258` | C'est le comportement voulu. Seul `0` rouvre le formulaire anonyme |
| Le bouton flottant n'apparaît pas | Le contrat de la plateforme décide de sa visibilité : numéro absent, ou bouton désactivé dans l'administration | `space.identite.bouton_flottant` ; administration de la plateforme | Activer le bouton et renseigner un WhatsApp côté plateforme |
| Aucun bandeau de facturation ne s'affiche | C'est le comportement normal : le bandeau ne rend rien tant que `billing_available` n'est pas `true` et qu'il n'y a aucune facture impayée | `components/agency/AgencyBillingBanner.tsx` | Rien à corriger. Le domaine n'est pas traité : `/api/v1/billing` renvoie toujours `domain: null` |

---

## 5. Ce que le script ne voit pas : la couche « site »

Les cinq routes du connecteur (`heartbeat`, `request`, `requests`,
`requests/reponse`, `revalidate`) passent toutes par
`app/api/agency/_interne/securite.ts`. C'est le seul fichier du connecteur qui
dépend de l'authentification du site : il appelle `createClient()`, lit
`public.profiles` et compare le rôle à `ROLES_ADMINISTRATION = ["admin"]`
(`securite.ts:41`). Aucun de ces contrôles n'est vérifié par le script ni par la
sonde `/api/health` de la plateforme.

| Journal ou statut sur le site | Cause | Correction |
|---|---|---|
| `[mgs-agency] Configuration d'authentification illisible.` puis `401 Authentification indisponible. Réessayez dans un instant.` | `createClient()` a levé (`securite.ts:135`) | Vérifier que `@/lib/supabase/server` exporte bien `createClient()` et que la configuration Supabase du site est complète |
| `[mgs-agency] Lecture de session impossible.` puis le même `401` | `auth.getUser()` a échoué (`securite.ts:146`) | Même piste : c'est l'authentification du site, pas la plateforme |
| `[mgs-agency] Rôle du compte illisible.` puis `403 Rôle du compte illisible.` | La lecture de `profiles` a levé (`securite.ts:166-170`) | Même piste : la table est inaccessible depuis le client Supabase du site |
| `403 Accès réservé à l'administration.` | `profiles.role` est absent, ou hors de `ROLES_ADMINISTRATION` (`securite.ts:172-174`). Une table `public.profiles` inexistante tombe dans ce cas : la lecture ne renvoie aucune ligne | Créer `public.profiles` avec `id` et `role`, inscrire le compte avec un rôle de la liste, ou étendre `ROLES_ADMINISTRATION` (`securite.ts:41`) |
| `403 Origine non autorisée.` ou `403 Origine non vérifiable.` | `POST /api/agency/revalidate` et `POST /api/agency/requests/reponse` comparent l'origine de l'appel à `MGS_WEBSITE_URL` ; sans elle, ou sans en-tête `Origin`, elles exigent un en-tête `X-MGS-Revalidate` (`securite.ts:370-388`) | Renseigner `MGS_WEBSITE_URL`, ou appeler ces routes avec `X-MGS-Revalidate: 1` |
| `[mgs-agency] Adresse de requête non autorisée.` | `MGS_PLATFORM_URL` ne passe pas le garde d'origine (`client.ts:308`) | Corriger l'URL (§7.1) |
| `401 Connexion requise.` | Aucun compte connecté, sur une route qui exige une session | Se connecter ; `heartbeat`, `requests`, `requests/reponse` et `revalidate` exigent un administrateur du site |

Sauf l'URL refusée, qui retombe dans le silence du §7.3, ces refus sont des
`401`/`403` explicites. C'est la différence entre une panne de configuration,
visible immédiatement, et une panne de service, qui se dégrade en silence.

---

## 6. Les vérifications qui demandent un accès à la base

Le script ne se connecte pas à Supabase. Ces trois requêtes, en lecture seule,
se jouent dans le SQL Editor de Supabase. Elles ne modifient rien.
`create-site-credential.mjs` cité plus bas est le script du dépôt plateforme.

```sql
-- 1. La clé existe-t-elle, et n'est-elle pas révoquée ?
select key_id, revoked_at, created_at
  from public.site_credentials
 where key_id = '<votre MGS_SITE_KEY>';

-- 2. Le site est-il rattaché au backend commun ?
select s.id, s.name, s.tenant_id, s.last_seen_at
  from public.sites s
 where s.key_id = '<votre MGS_SITE_KEY>';
-- tenant_id IS NULL  =>  la plateforme répond 409

-- 3. La base est-elle à jour des migrations ?
select * from public.derniere_migration();
-- version < DERNIERE_MIGRATION_ATTENDUE (plateforme/app/api/health/route.ts)
--   =>  /api/v1/agency peut renvoyer 503
```

Lecture :

- `0 ligne` au point 1 → la clé n'a jamais été créée → relancer `create-site-credential.mjs`.
- `revoked_at` non `NULL` → la clé a été révoquée, ce que fait `create-site-credential.mjs` quand il régénère un secret → relancer le script.
- `tenant_id` `NULL` au point 2 → 409 → relancer `create-site-credential.mjs`.
- `version` en retard au point 3 → appliquer les migrations manquantes, puis purgez le cache du site (§7.2).

---

## 7. Les pièges vérifiés dans le code

### 7.1 `localhost` ≠ `127.0.0.1`

`lib/agency/client.ts:303-310` refuse toute URL dont le protocole n'est pas
`https:` et dont le nom d'hôte n'est pas exactement la chaîne `"localhost"` (le
même contrôle existe côté plateforme, sur l'URL qu'il reçoit :
`lib/site-auth.ts:7-9`) :

```ts
if (
  requestUrl.origin !== baseUrl.origin
  || !requestUrl.pathname.startsWith("/api/v1/")
  || (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost")
) {
  return { pret: false };
}
```

`new URL("http://127.0.0.1:3000").hostname` vaut `"127.0.0.1"`, qui n'est jamais
égale à `"localhost"`. Un site qui écrit `MGS_PLATFORM_URL=http://127.0.0.1:3000`
en développement obtient un refus silencieux de toutes ses lectures.

Les slashs finaux sont inoffensifs : `client.ts:291` fait
`.replace(/\/+$/, "")`. Un chemin dans l'URL est ignoré, pas refusé — le client
reconstruit l'URL depuis `baseUrl.origin`.

### 7.2 Le cache des lectures

Les quatre lectures authentifiées (`/api/v1/agency`, `/api/v1/agency/requests`,
`/api/v1/announcements`, `/api/v1/billing`) sont mises en cache côté serveur
pendant `MGS_CACHE_REVALIDATE_S` secondes : 60 s par défaut, 300 s au maximum, 0
pour ne jamais cacher (`client.ts:366-372`). L'étiquette `mgs-agence` porte ces
lectures.

Un changement fait dans l'administration de la plateforme apparaît donc au pire
après ce délai. Pour le rendre immédiat, la route `POST /api/agency/revalidate`
purge l'étiquette et les chemins demandés (`purgerCacheAgence`,
`lib/agency/space.ts:735-748`). Elle ne fait aucun appel à la plateforme et ne
coûte rien au quota du site. Elle est réservée à l'administrateur du site et
protégée par le contrôle d'origine (§5).

Ce délai est un filet de sécurité, pas la norme : c'est `revalidate` qui est le
chemin normal après un changement côté plateforme.

### 7.3 Le silence est une dégradation, pas une panne

`callAgency` ne lève jamais. Il renvoie `null` si la plateforme est injoignable,
muette, en erreur, ou si une variable manque (`client.ts:153` et `client.ts:294`).
Le site continue de fonctionner ; l'onglet « Mon agence » ne s'affiche pas.

La conséquence pratique : l'absence d'un onglet ne prouve pas que la plateforme
est en panne. Elle peut signifier que le site n'a jamais été configuré. La
distinction se fait en comparant la sortie du script (hors ligne) et le test
`--en-ligne`.

### 7.4 Trois limites de débit, à ne pas confondre

- **60 requêtes/minute par site** : appliquées en base par la fonction
  `api_requete_admise` (migration `202609300002`). Un `429` ici vient de la
  plateforme.
- **5 appels par fenêtre de 60 s par session** : limiteur en mémoire du site
  (`app/api/agency/_interne/limite.ts:38-41`), appliqué uniquement à
  `POST /api/agency/request`. Un `429` ici vient du site, avec un en-tête
  `Retry-After`.
- **1 lecture par chemin, en fenêtre de 20 s** : après un `5xx` ou un `429`, le
  chemin correspondant est court-circuité pendant 20 s (`client.ts:62, 353-355`).
  Les autres chemins continuent. Un `503` sur `/api/v1/billing` ne dit donc pas
  que `/api/v1/agency` est en panne — c'est même la raison pour laquelle la
  mémoire d'échec est par chemin et non globale.

---

## 8. Par où commencer, dans l'ordre

1. **Hors ligne, sur le site client** :
   `node scripts/verifier-connexion.mjs --site ../<votre-site>`.
   Corriger ce qu'il signale avant toute autre chose.
2. **En ligne**, si le hors ligne est propre :
   `--en-ligne`. Un `200` avec `agence.identite` présent confirme la liaison.
3. **Si le hors ligne et le en ligne sont propres, mais que l'onglet est
   toujours absent ou vide** : lire la section 5 (rôle, session, origine) et les
   journaux `[mgs-agency]` du site. Le problème est côté site, pas côté
   plateforme.
4. **En cas de `5xx` ou de `503`** : lire `/api/health` de la plateforme
   (section 3) et la section 4.
5. **En cas de doute sur la base** : jouer les trois requêtes SQL de la
   section 6.
