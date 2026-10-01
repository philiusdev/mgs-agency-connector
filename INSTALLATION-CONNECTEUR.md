# Installer le connecteur MindGraphixSolution sur un site client

Ce guide explique comment brancher le connecteur sur un **nouveau site client**.
Il ne concerne que le **Système A** (le lien boutique ↔ agence). Il ne dit rien
du MGS Account, qui est un système totally séparé.

Un site **déjà branché** et encore monté sur une page accessible au commerçant
connecté est traité au [chapitre 13](#13-migrer-un-site-déjà-branché-vers-larchitecture-admin).

Comptez une vingtaine de minutes.

---

## 0. Ce que le connecteur exige de votre site (à vérifier en premier)

1. `export function createClient()` dans `@/lib/supabase/server`. Le connecteur
   l'appelle ; sans elle, les cinq routes d'agence échouent au premier appel.
2. Une table `public.profiles` dans la base du site, avec `id` (le compte
   `auth.users`) et une colonne `role`. Une valeur inscrite dans
   `ROLES_ADMINISTRATION` — `admin` — est ce qui autorise l'accès à l'espace
   d'agence. Sans cette table, l'espace n'est jamais monté.
3. Une migration de `profiles` au démarrage de chaque site client.

Le détail et le mode d'emploi sont en [2.1](#21-ce-que-le-site-doit-fournir-à-lauthentification).

---

## 1. Ce que le connecteur apporte

| Où | Ce qu'il affiche | Visible par |
|---|---|---|
| Pied de page du site | « Site créé par MindGraphixSolution » (lien vers votre site) | tout le monde |
| Tableau de bord | Bandeau de facturation | l'administrateur du site |
| Onglet « Mon agence » | Coordonnées, annonces, demande d'amélioration, vos offres | l'administrateur du site |

L'espace d'agence n'est pas réservé au « commerçant connecté » mais à un compte
dont `profiles.role` vaut `admin` : c'est lui qui a une formule, des factures et
des demandes. Voir [2.1](#21-ce-que-le-site-doit-fournir-à-lauthentification) et
[5.4](#54-où-monter-le-bouton--et-la-condition-à-ne-pas-contourner).

**Le principe de sécurité :** si la plateforme est down ou si la clé est absente,
le site fonctionne **normalement**. L'onglet « Mon agence » ne s'affiche simplement
pas. Vous ne casserez jamais un site client en installant ce module.

---

## 2. Ce dont vous avez besoin

- Le projet du site client (Next.js, avec un dossier `app/`).
- Node.js 20 ou plus.
- Un accès à la plateforme MGS (les variables `SUPABASE_SERVICE_ROLE_KEY` et
  `NEXT_PUBLIC_SUPABASE_URL` du projet plateforme).
- L'accès administrateur au projet Supabase de la plateforme pour la migration.

Si le site est en **Expo / React Native** (application mobile), lisez le
[chapitre 7](#7-cas-particulier-application-mobile-expo) : la procédure est différente.

### 2.1 Ce que le site doit fournir à l'authentification

`app/api/agency/_interne/securite.ts` est **le seul fichier du connecteur qui
dépend de votre auth** : c'est là que se trouvent l'appel à `createClient()`, la
lecture de `public.profiles` et le contrôle du rôle. Les cinq routes du dossier
(`heartbeat`, `request`, `requests`, `requests/reponse`, `revalidate`) en dépendent
toutes, et aucune autre n'a d'exigence sur votre base de données.

Trois prérequis, à vérifier **avant** de copier quoi que ce soit :

1. **`createClient()`** — un module `@/lib/supabase/server` exportant une fonction
   `createClient()` sans argument, qui lit la session du visiteur et expose
   `.auth.getUser()` et `.from("profiles")`. Le type de retour n'est pas importé :
   le connecteur ne dépend pas de votre version de `@supabase/supabase-js`. Si le
   site n'a pas d'authentification serveur, il faut fournir ce module ou réécrire
   `securite.ts` — c'est la seule adaptation de ce guide.
2. **`public.profiles`** — une table dont `id` est l'identifiant du compte
   `auth.users` et qui porte une colonne `role`. Le connecteur y lit
   `.from("profiles").select("role").eq("id", utilisateur.id).maybeSingle()` : ni
   une ligne ni un rôle inconnu, et l'accès est refusé.
3. **Le rôle d'administration** — `ROLES_ADMINISTRATION` dans
   `_interne/securite.ts` vaut `["admin"]` : seule la valeur `admin` ouvre
   l'espace d'agence. `401` signifie « session illisible ou absente », `403`
   « je sais qui vous êtes, et ce n'est pas un administrateur » (dont « la table
   `profiles` n'existe pas encore », qui tombe aussi en `403`).

Le rôle se règle dans la base, pas dans le code. Le dépôt `template-boutique-mgs`
fournit la migration de référence : `supabase/migrations/202609270001_initial_schema.sql`
(déclaration de la table et du déclencheur qui crée une ligne par inscription).
Si votre site a déjà ses propres profils, vérifiez la colonne `role` — `id` doit
bien être l'`auth.users.id`, sinon la lecture de rôle échoue et l'espace ne
s'affiche jamais.

> **Point de montage.** Ce que le tableau de bord affiche dépend de la garde de
> rôle de la page où vous montez le connecteur. Le connecteur ne l'impose pas :
> voir [5.4](#54-où-monter-le-bouton--et-la-condition-à-ne-pas-contourner).

---

## 3. Créer les identifiants du site

Depuis le dossier de la **plateforme MGS** (`plateforme-mindgraphixsolution`) :

```bash
SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… \
  node scripts/create-site-credential.mjs "Nom de la boutique"
```

Le script affiche **deux lignes, une seule fois** :

```
MGS_SITE_KEY=mgs_xxxxxxxxxxxx
MGS_SITE_SECRET=xxxxxxxxxxxxxxxx
```

> **Copiez-les immédiatement.** Seul le hash du secret est stocké en base.
> Si vous le perdez, relancez le script : l'ancien identifiant est révoqué
> automatiquement et le site continue de fonctionner avec le nouveau.

Le script crée aussi la boutique (`tenants`) et le site (`sites`) s'ils n'existent pas.

---

## 4. Copier les fichiers

Les chemins du dépôt correspondent **exactement** à leur destination. Copiez :

```bash
# Depuis la racine du dépôt mgs-agency-connector :
cp -r lib/agency/            <projet-client>/lib/agency/
cp -r components/agency/     <projet-client>/components/agency/
cp    components/agency.css  <projet-client>/components/agency.css
cp    app/api/agency/        <projet-client>/app/api/agency/
cp    app/api/health/        <projet-client>/app/api/health/          # si absent
```

Si le projet utilise `src/`, prependez `src/` aux chemins de destination.

> ⚠️ `app/api/agency/_interne/securite.ts` importe `@/lib/supabase/server` et lit la
> table `profiles` de la boutique. C'est le seul fichier du connecteur qui dépend de
> votre auth, et les cinq routes du dossier en dépendent toutes. Vérifiez que ces
> deux éléments existent chez vous — voir [2.1](#21-ce-que-le-site-doit-fournir-à-lauthentification).
> Si votre boutique utilise un autre système d'authentification, c'est ce fichier
> qu'il faut réécrire, et lui seul.

---

## 5. Brancher l'affichage

### 5.1 La feuille de style

`app/layout.tsx` :

```tsx
import "../components/agency.css";
```

Le layout racine est le bon endroit pour **la feuille de style**, et le mauvais
endroit pour **tout le reste** : voir [5.4](#54-où-monter-le-bouton--et-la-condition-à-ne-pas-contourner).

### 5.2 Le crédit dans le pied de page

`components/site-footer.tsx` : ce fichier est un **Server Component** (il ne doit
pas avoir de `"use client"` en tête).

```tsx
import { AgencyCredit } from "@/components/agency/AgencyCredit";
// …
<AgencyCredit />
```

### 5.3 L'onglet « Mon agence »

Dans une page déjà réservée aux administrateurs, chargez l'espace côté **serveur**,
après avoir vérifié le rôle — le détail est en [5.4](#54-où-monter-le-bouton--et-la-condition-à-ne-pas-contourner).

```tsx
import { lireSessionAdmin } from "@/app/api/agency/_interne/securite";
import { loadAgencySpace } from "@/lib/agency/space";
import { AgencyBillingBanner } from "@/components/agency/AgencyBillingBanner";
import { AgencyPanel } from "@/components/agency/AgencyPanel";
import type { AgencySpace } from "@/lib/agency/types";

export default async function Page() {
  const lecture = await lireSessionAdmin();
  if (!lecture.ok) return <Refus motif={lecture.motif} />;   // composant de refus du site

  const agencySpace: AgencySpace | null = await loadAgencySpace();
  const email = lecture.session.email ?? "";

  return (
    <AdminDashboard
      email={email}
      agencySpace={agencySpace}   // null si la plateforme est injoignable
    />
  );
}
```

Dans `components/admin-dashboard.tsx` :

```tsx
import type { AgencySpace } from "@/lib/agency/types";

export function AdminDashboard({ email, agencySpace }: { email: string; agencySpace: AgencySpace | null }) {
  const tabs = [
    // … vos onglets existants
    ...(agencySpace ? [{ id: "agency" as const, label: "Mon agence" }] : []),
  ];

  return (
    <>
      {agencySpace?.billing && <AgencyBillingBanner billing={agencySpace.billing} agency={agencySpace.agency} />}

      {/* … votre rendu d'onglets */}
      {tab === "agency" && agencySpace && <AgencyPanel space={agencySpace} requesterEmail={email} />}
    </>
  );
}
```

Le `...(agencySpace ? [...] : [])` est important : **il n'y a pas d'onglet vide ni
d'onglet cassé** si la plateforme ne répond pas.

### 5.4 Où monter le bouton — et la condition à ne pas contourner

**Le layout racine est le mauvais point de montage.** Y charger l'espace d'agence
le sérialiserait dans le HTML de toutes les pages publiques — abonnement, factures,
coordonnées du demandeur — lisible dans l'inspecteur sans un clic, et rendrait la
page d'accueil dynamique à cause d'un widget. C'est pour cela que, dans les deux
dépôts de référence (`template-boutique-mgs`, `site-vitrine-mindgraphixsolution`),
les layouts racine ne montent ni bouton flottant, ni panneau, ni onglet : seule la
feuille `components/agency.css` y est importée, et le crédit du pied de page reste
la seule chose de l'agence qui soit publique — il ne lit que `MGS_WEBSITE_URL`.

Le montage réel, dans les deux dépôts de référence :

| Dépôt | Page de montage | Fonction appelée | Condition |
|---|---|---|---|
| `template-boutique-mgs` | `app/admin/page.tsx` | `chargerEspaceAgenceAdmin()` | profil authentifié **et** `profiles.role` = `admin` |
| `site-vitrine-mindgraphixsolution` | `app/espace-client/agence/page.tsx` | `loadAgencySpace()` | idem |

La forme côté template (`app/admin/page.tsx`), après les gardes de session et de rôle :

```tsx
const agencySpace = await chargerEspaceAgenceAdmin();
return agencySpace ? <AgencyFloatingButton space={agencySpace} /> : null;
```

**`chargerEspaceAgenceAdmin()` n'existe pas dans le connecteur** : c'est un fichier
d'intégration du template (`lib/agency-bouton-flottant.ts`), hors de `lib/agency/`
pour ne pas le faire diverger de la copie mot pour mot. Un intégrateur qui
recopie le connecteur dans son propre site n'a donc **rien à copier** : il écrit
lui-même la porte. Le plus simple est d'appeler `lireSessionAdmin()` puis
`loadAgencySpace()` dans la page, comme en 5.3.

**La condition à ne pas contourner :** « un profil authentifié » ne suffit pas.
Ce qui autorise est `profiles.role ∈ ROLES_ADMINISTRATION`, c'est-à-dire `admin`.
Si votre boutique n'a pas de table `profiles`, ou si la migration n'est pas
appliquée, `lireSessionAdmin()` renvoie `403 motif "technique"` : l'espace ne
s'affiche pas, et ce n'est pas une panne de l'agence. Ne remplacez pas cette garde
par un simple `if (user)`, et ne chargez pas l'espace dans un composant client ni
dans une page publique « le temps de voir » — le retrait de l'affichage ne ferme
rien quand la donnée est déjà partie.

Si vous n'avez pas de page `/admin`, créez-en une, ou montez le panneau dans une
page déjà protégée par votre propre garde de rôle. Le connecteur ne monte rien
lui-même : c'est votre page qui décide à qui elle rend l'espace.

> Une page qui charge l'espace est dynamique **par construction** : elle lit les
> cookies. Ne cherchez pas à la rendre statique, et ne replacez pas la garde de
> rôle dans la page pour « gagner » ce rendu dynamique : le contrôle de rôle est
> aussi le contrôle de rendu dynamique.

---

## 6. Les variables d'environnement

Ajoutez dans `.env.local` du site client, **puis dans les variables du serveur
de production** (Vercel, Railway, votre hébergeur) :

```env
MGS_PLATFORM_URL=https://plateforme-votre-domaine
MGS_SITE_KEY=mgs_xxxxxxxxxxxx
MGS_SITE_SECRET=xxxxxxxxxxxxxxxx
MGS_TEMPLATE_VERSION=1.0.0
MGS_WEBSITE_URL=https://votre-site-agence
MGS_AGENCY_NAME=MindGraphixSolution
MGS_AGENCY_WHATSAPP=22670123456
MGS_AGENCY_EMAIL=contact@mindgraphixsolution.com
MGS_CACHE_REVALIDATE_S=60
MGS_AGENCY_REQUIRER_SESSION=1
```

> ### 🔒 Règle absolue
> **Ne préfixez jamais ces variables par `NEXT_PUBLIC_`.**
>
> `NEXT_PUBLIC_` rend la variable **publique** : son contenu est envoyé à tous les
> visiteurs dans le JavaScript du navigateur. `MGS_SITE_SECRET` deviendrait public et
> n'importe quel visiteur pourrait lire les annonces de votre agence, envoyer des
> demandes en votre nom et siphonner vos leads.
>
> Seules `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont
> censées être publiques (c'est le modèle normal de Supabase, la clé `anon` est
> protégée par les règles RLS).

`MGS_WEBSITE_URL` est optionnelle, mais elle ne sert pas qu'au crédit du pied de
page : c'est elle qui est comparée à l'origine des appels à
`POST /api/agency/revalidate` et `POST /api/agency/requests/reponse`. Sans elle,
ces deux routes exigent un en-tête `X-MGS-Revalidate` / `Origin` et refusent le
reste — voir le docblock de `app/api/agency/_interne/securite.ts`.

`MGS_CACHE_REVALIDATE_S` est la durée de cache des **lectures** authentifiées
(`/api/v1/agency`, `/api/v1/announcements`, `/api/v1/billing`,
`/api/v1/agency/requests`), en secondes : 60 par défaut, 300 au maximum, `0` pour
ne jamais cacher. Passé ce délai, le rendu suivant relit la plateforme. Ce délai
n'est pas la norme : `POST /api/agency/revalidate` purge le cache immédiatement,
et c'est la voie à utiliser après un changement fait dans l'administration.

`MGS_AGENCY_REQUIRER_SESSION` décide si `POST /api/agency/request` exige une
session connectée. Absente ou `1` : session exigée, et l'email du demandeur est
pris **dans la session**, jamais dans le corps de la requête. Seul `0` (ou
`false`, `non`) rouvre le formulaire anonyme — n'ouvrez cette porte que si le site
a volontairement un formulaire de contact public.

Les variables `MGS_AGENCY_*` sont un filet de sécurité : si la plateforme est
injoignable, ces coordonnées restent affichées. Dès que la plateforme répond,
c'est elle qui fait foi, même pour dire qu'elle n'a pas de numéro.

---

## 7. Cas particulier : application mobile (Expo)

**Une application mobile ne peut pas garder le secret.** Tout ce qui est livré dans
un APK ou un IPA est lisible par le client. Le secret du connecteur dans une
application mobile reviendrait à publier la clé de la plateforme.

La solution : faire transiter par une **fonction Supabase Edge** qui garde le secret
côté serveur.

1. Créez la fonction Edge `mgs-agency` dans le projet Supabase de la plateforme.
2. Stockez `MGS_PLATFORM_URL`, `MGS_SITE_KEY` et `MGS_SITE_SECRET` dans les
   **secrets Edge** (Edge Functions → Secrets), jamais dans le code.
3. Dans la fonction, authentifiez la session utilisateur (`Authorization: Bearer
   <token Supabase>`), vérifiez que le rôle est `admin`, puis appelez `/api/v1/*`.
4. Dans l'application Expo, appelez la fonction Edge avec la session — jamais la
   plateforme directement.

Le système B (MGS Account) n'a **pas** ce problème : il utilise Supabase Auth avec la
clé `anon`, qui est faite pour être publique.

---

## 8. Vérifier que ça marche

Dans le projet du site client, pas dans le dépôt du connecteur :

```bash
npm run lint
npm run build
```

Puis, en local :

```bash
# 1. Le crédit est dans le pied de page
curl -s http://localhost:3000 | grep -o "MindGraphixSolution"

# 2. La plateforme répond
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Site-Key: $MGS_SITE_KEY" \
  -H "Authorization: Bearer $MGS_SITE_SECRET" \
  "$MGS_PLATFORM_URL/api/v1/agency"
# attendu : 200
```

Sur le site démarré, connectez-vous au dashboard avec un compte dont
`profiles.role` vaut `admin` — avec un compte `client`, la page doit refuser
l'accès, et c'est le résultat attendu :

- [ ] l'onglet **« Mon agence »** est visible ;
- [ ] les coordonnées de l'agence s'affichent ;
- [ ] **« Demander une amélioration »** renvoie une confirmation ;
- [ ] les offres de « Nos autres services » ouvrent WhatsApp.

Si aucun onglet n'apparaît, avant d'incriminer la plateforme :

```bash
# 1. Le site répond, et déclare la version de template attendue
curl -s http://localhost:3000/api/health

# 2. Le diagnostic complet de la chaîne, hors ligne
node scripts/verifier-connexion.mjs --site /chemin/vers/le-site-client
```

### Tester la panne de la plateforme

Pour vérifier le comportement de repli, stoppez la plateforme, rechargez le site :
le site doit rester **parfaitement utilisable**, sans onglet « Mon agence » cassé.
C'est le test le plus important.

---

## 9. Ce que voit l'administrateur, et quand

| Situation | Ce qui s'affiche |
|---|---|
| Plateforme injoignable, clé absente | Rien. Le site fonctionne. |
| Aucune facture impayée | Aucun bandeau — c'est le comportement voulu |
| Facture impayée | Bandeau « N facture(s) en attente — montant » + bouton « Voir et payer » |
| Domaine | Jamais affiché : l'espace ne porte aucune donnée de domaine |
| Facturation indisponible (`billing_available: false`) | Aucun bandeau, aucun message d'erreur |
| Section muette (une lecture a échoué) | La liste concernée n'est pas rendue ; `AgencySpace.indisponibles` dit laquelle |

Le bandeau de facturation (`components/agency/AgencyBillingBanner.tsx`) rend
`null` dès qu'il n'y a rien à dire : pas de facture impayée, pas de facturation
disponible, pas de réponse de la plateforme. Il n'affiche ni abonnement — déjà
montré par l'espace — ni date de renouvellement de domaine, que l'espace ne porte
pas. **Ne cherchez donc pas à le faire apparaître pour « vérifier que ça marche »** :
son absence est la preuve qu'il n'y a rien à payer.

---

## 10. Gérer le catalogue depuis la plateforme

Les offres ne sont **jamais écrites en dur** dans le site client. Tout se gère dans
la plateforme :

**Plateforme → onglet « Paramètres agence »** :

- **Coordonnées** : nom, WhatsApp, email, site vitrine → l'onglet « Mon agence » de
  *tous* les sites clients, immédiatement.
- **Offres** : titre, description, message WhatsApp, ordre d'affichage, actif/inactif.
  Une offre ajoutée apparaît partout sans redéploiement.

Les annonces se gèrent dans l'onglet « Annonces » de la plateforme.

---

## 11. En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| Onglet « Mon agence » absent | Plateforme injoignable, ou variables manquantes | Vérifiez les logs serveur : `[mgs-agency] Plateforme momentanément indisponible.` |
| `403` sur `/api/agency/heartbeat`, `/requests`, `/revalidate` | `profiles.role` n'est pas `admin`, ou la table `profiles` n'existe pas | Regardez le motif : `role` → nommez l'administrateur en base ; `technique` → la migration n'est pas appliquée |
| Espace affiché sur une page publique | Montage fait sans la garde de rôle | Reprenez [5.4](#54-où-monter-le-bouton--et-la-condition-à-ne-pas-contourner) |
| Le crédit s'affiche sans lien | `MGS_WEBSITE_URL` absente ou invalide | Renseignez-la ; seule `http`/`https` est accepté |
| `403` « Origine non vérifiable » sur `POST /api/agency/revalidate` | `MGS_WEBSITE_URL` absente, ou appel sans en-tête non simple | Renseignez `MGS_WEBSITE_URL`, ou posez `X-MGS-Revalidate` |
| `401` sur `/api/v1/agency` | Mauvaise clé ou secret révoqué | Relancez `create-site-credential.mjs` et mettez à jour le `.env.local` |
| `409` sur `/api/v1/agency` | Site non rattaché à une boutique | Le script doit avoir créé la boutique ; vérifiez `sites.tenant_id` |
| `429` | Plus de 60 requêtes/minute | Le cache de 60 s limite les appels ; vérifiez `MGS_CACHE_REVALIDATE_S` et la fréquence de rendu de la page de montage |
| Erreur d'import `@/lib/agency/...` | Le dossier n'a pas été copié au bon endroit | Reprenez le chapitre 4 |
| Le secret apparaît dans le navigateur | Variable préfixée par `NEXT_PUBLIC_` | **Corrigez immédiatement** et faites tourner le secret |
| `Cannot find module '@/lib/supabase/server'` | Auth de la boutique différente | Fournissez `@/lib/supabase/server`, ou adaptez `_interne/securite.ts` à votre authentification |

Si un secret a été exposé publiquement, relancez `create-site-credential.mjs` :
il révoque l'ancien et en génère un nouveau.

---

## 12. Les endpoints, en résumé

Le connecteur appelle la plateforme en **serveur → serveur**, jamais depuis le
navigateur.

| Endpoint | Méthode | Sert à |
|---|---|---|
| `/api/v1/agency` | GET | Identité, prestations, offres, abonnement et demandes d'un coup |
| `/api/v1/agency/requests` | GET, POST | Historique des demandes, et création d'une demande d'amélioration |
| `/api/v1/agency/requests/{id}/reponse` | POST | Réponse du commerçant à un devis (`accepte` / `refuse`) |
| `/api/v1/announcements` | GET | Annonces de l'agence |
| `/api/v1/billing` | GET | Factures impayées et moyen de paiement. Hors contrat partagé : `domain` vaut toujours `null` |
| `/api/v1/heartbeat` | POST | Déclare `template_version` — c'est la seule chose que cette route transmet |

Les lectures passent toutes par `callAgency`, qui transforme tout statut non-2xx
en `null` ; la réponse d'un devis passe par `callAgenceAvecDetail`, seule voie qui
conserve le statut HTTP de la plateforme. Aucune écriture n'est mise en cache.

Authentification : en-tête `X-Site-Key` + `Authorization: Bearer <secret>`.
La plateforme compare un hash SHA-256 en temps constant, limite à 60 requêtes
par minute et par site, et refuse tout appel non chiffré en dehors de `localhost`.

---

## 13. Migrer un site déjà branché vers l'architecture admin

Ce chapitre ne concerne que les sites **en production** qui affichent déjà
l'espace d'agence sur une page accessible au commerçant connecté, sans contrôle
de rôle. Le test le plus rapide : `POST /api/agency/heartbeat` appelé avec un
compte sans droit d'administration. La version actuelle de la route répond `403` ;
un `200` signale un déploiement antérieur à la garde de rôle. À vérifier sur le
site concerné — l'état du code déployé n'est pas lisible d'ici.

1. **Vérifiez la base, sans rien casser.** Une table `profiles` sans colonne
   `role` ne déclenche ni erreur ni fuite : la lecture échoue et l'accès est
   refusé. Ajoutez la colonne, ou la table si elle n'existe pas
   (`template-boutique-mgs`, migration `202609270001_initial_schema.sql`).
2. **Nommez l'administrateur, et lui seul.** Une ligne par compte, `id` =
   `auth.users.id`, `role` = `admin`. Côté connecteur, `ROLES_ADMINISTRATION` vaut
   `["admin"]` : un compte sans ligne, ou avec un autre rôle, n'ouvre rien. C'est
   la seule étape qui donne accès — faites-la pour un compte de gestion, pas pour
   un compte client.
3. **Déclarez `MGS_AGENCY_REQUIRER_SESSION=1`.** Absente, `POST
   /api/agency/request` exige déjà une session : le corps ne peut plus fournir
   l'email du demandeur, et c'est le but. Renseignez-la explicitement pour que
   la valeur soit lisible dans les variables du site.
4. **Déplacez le montage, sans fenêtre de maintenance.** Déployez la page de
   montage **avant** de retirer l'ancien point de montage : l'espace est
   simplement absent le temps du déploiement, jamais visible par quelqu'un qui
   n'a pas le droit. Si les deux points coexistent, l'ancien est à supprimer
   immédiatement après.
5. **Vérifiez les deux côtés de la bascule.** Sur les routes `/api/agency/*`, un
   compte sans rôle obtient `403` — avant comme après. Sur la page de montage, un
   compte sans rôle doit obtenir un refus ou une redirection, **jamais** une page
   qui contiendrait l'espace. Un administrateur qui ne voit rien, lui, signale un
   `401` ou un `403 motif "technique"` : `createClient()` ou la lecture de
   `profiles`, pas le rôle.
6. **Pointez la purge sur la bonne page.** `POST /api/agency/revalidate` reçoit
   les chemins du **site** à revalider. Un chemin qui n'embarque plus l'espace
   coûte un rendu pour rien.
7. **Notez que les données n'ont pas bougé.** Elles restent chez la plateforme,
   lues par `MGS_SITE_KEY` : `public.profiles` ne décide que de **qui voit**, jamais
   de ce qui est stocké. Aucun export, aucune re-saisie, aucun secret à changer.

Vérification finale, sur le site déployé :

```bash
# La sonde du site : elle ne lit aucun secret et n'appelle pas la plateforme
curl -s https://votre-site-client/api/health
```

Elle répond `{ "status": "ok", "version": …, "timestamp": … }`. La version vient
de `MGS_TEMPLATE_VERSION` : si elle vaut `0.0.0`, la variable est absente et la
plateforme considère le site comme jamais déployé.
