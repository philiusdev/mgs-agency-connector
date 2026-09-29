# Installer le connecteur MindGraphixSolution sur un site client

Ce guide explique comment brancher le connecteur sur un **nouveau site client**.
Il ne concerne que le **Système A** (le lien boutique ↔ agence). Il ne dit rien
du MGS Account, qui est un système totally séparé.

Comptez une vingtaine de minutes.

---

## 1. Ce que le connecteur apporte

| Où | Ce qu'il affiche | Visible par |
|---|---|---|
| Pied de page du site | « Site créé par MindGraphixSolution » (lien vers votre site) | tout le monde |
| Tableau de bord | Bandeau de facturation | le commerçant connecté |
| Onglet « Mon agence » | Coordonnées, annonces, demande d'amélioration, vos offres | le commerçant connecté |

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

> ⚠️ `app/api/agency/heartbeat/route.ts` importe `@/lib/supabase/server` et lit la
> table `profiles` de la boutique. Vérifiez que ces deux éléments existent chez vous.
> Si votre boutique utilise un autre système d'authentification, adaptez ce fichier —
> c'est le seul qui dépend de votre auth.

---

## 5. Brancher l'affichage

### 5.1 La feuille de style

`app/layout.tsx` :

```tsx
import "../components/agency.css";
```

### 5.2 Le crédit dans le pied de page

`components/site-footer.tsx` : ce fichier est un **Server Component** (il ne doit
pas avoir de `"use client"` en tête).

```tsx
import { AgencyCredit } from "@/components/agency/AgencyCredit";
// …
<AgencyCredit />
```

### 5.3 L'onglet « Mon agence »

`app/page.tsx` ou la page qui affiche le dashboard : chargez l'espace côté **serveur**.

```tsx
import { loadAgencySpace } from "@/lib/agency/space";
import { AgencyBillingBanner } from "@/components/agency/AgencyBillingBanner";
import { AgencyPanel } from "@/components/agency/AgencyPanel";
import type { AgencySpace } from "@/lib/agency/types";

export default async function Page() {
  const agencySpace: AgencySpace | null = await loadAgencySpace();

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

`MGS_WEBSITE_URL` est optionnelle : sans elle, le crédit du pied de page s'affiche
sans lien. Les variables `MGS_AGENCY_*` sont un filet de sécurité : si la plateforme
est injoignable, ces coordonnées restent affichées.

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

Sur le site démarré, connectez-vous au dashboard :

- [ ] l'onglet **« Mon agence »** est visible ;
- [ ] les coordonnées de l'agence s'affichent ;
- [ ] **« Demander une amélioration »** renvoie une confirmation ;
- [ ] les offres de « Nos autres services » ouvrent WhatsApp.

### Tester la panne de la plateforme

Pour vérifier le comportement de repli, stoppez la plateforme, rechargez le site :
le site doit rester **parfaitement utilisable**, sans onglet « Mon agence » cassé.
C'est le test le plus important.

---

## 9. Ce que voit le commerçant, et quand

| Situation | Ce qui s'affiche |
|---|---|
| Plateforme injoignable, clé absente | Rien. Le site fonctionne. |
| Aucune facture impayée, domaine OK | « Tout est à jour ✓ » |
| Facture impayée | Bandeau d'alerte + bouton « Voir et payer » |
| Domaine expire dans moins de 30 jours | Bandeau d'alerte de renouvellement |
| Facture **et** domaine critiques | Les deux bandeaux, empilés |

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
| Le crédit s'affiche sans lien | `MGS_WEBSITE_URL` absente ou invalide | Renseignez-la ; seule `http`/`https` est accepté |
| `401` sur `/api/v1/agency` | Mauvaise clé ou secret révoqué | Relancez `create-site-credential.mjs` et mettez à jour le `.env.local` |
| `409` sur `/api/v1/agency` | Site non rattaché à une boutique | Le script doit avoir créé la boutique ; vérifiez `sites.tenant_id` |
| `429` | Plus de 60 requêtes/minute | Normal si la plateforme rame ; le cache de 5 min limite les appels |
| Erreur d'import `@/lib/agency/...` | Le dossier n'a pas été copié au bon endroit | Reprenez le chapitre 4 |
| Le secret apparaît dans le navigateur | Variable préfixée par `NEXT_PUBLIC_` | **Corrigez immédiatement** et faites tourner le secret |
| `Cannot find module '@/lib/supabase/server'` | Auth de la boutique différente | Adaptez `heartbeat/route.ts` à votre authentification |

Si un secret a été exposé publiquement, relancez `create-site-credential.mjs` :
il révoque l'ancien et en génère un nouveau.

---

## 12. Les endpoints, en résumé

Le connecteur appelle la plateforme en **serveur → serveur**, jamais depuis le
navigateur.

| Endpoint | Méthode | Sert à |
|---|---|---|
| `/api/v1/agency` | GET | Nom, WhatsApp, email, site, offres |
| `/api/v1/billing` | GET | Abonnement, factures impayées, expiration du domaine |
| `/api/v1/announcements` | GET | Annonces de l'agence |
| `/api/v1/tickets` | POST | Demande d'amélioration du commerçant |
| `/api/v1/heartbeat` | POST | Signale que le site est en ligne |

Authentification : en-tête `X-Site-Key` + `Authorization: Bearer <secret>`.
La plateforme compare un hash SHA-256 en temps constant, limite à 60 requêtes
par minute et par site, et refuse tout appel non chiffré en dehors de `localhost`.
