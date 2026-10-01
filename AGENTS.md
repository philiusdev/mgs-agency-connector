# mgs-agency-connector — conventions de code

Module que l'on **recopie tel quel** dans un site client pour le relier à la
plateforme MGS : espace agence, demandes, facturation, bouton flottant. Il ne
s'installe pas, il se copie — donc tout écart entre les copies est un bug, et la
lisibilité prime sur l'astuce. Tout le projet est en français.

## Langue

- Commentaires, messages et noms en français.
- Un commentaire explique **pourquoi**. Les fichiers de ce module sont le
  meilleur exemple du dépôt : `app/api/agency/_interne/securite.ts`,
  `lib/agency/client.ts`, `components/agency/AgencyBillingBanner.tsx` nomment
  chaque piège (« RIEN DU DOMAINE », « jamais « 0 F CFA », jamais « gratuit » à
  côté de « Inclus » », « Une seule ligne pour toutes les routes »).
- Accents dans les commentaires et les messages (« Plateforme momentanément
  indisponible. », « Accès réservé à l'administration. »). Seuls noms de fichiers,
  identifiants, constantes et variables d'environnement sont en ASCII strict :
  `contrat-partage.ts`, `DEVISE_PAR_DEFAUT`, `MESSAGE_DEMANDE_ENVOYEE`,
  `MGS_AGENCY_REQUIRER_SESSION`.

## Nommage

- Fichiers : `lib/agency/` (`client.ts`, `space.ts`, `types.ts`) et
  `app/api/agency/` gardent leurs noms d'origine, en minuscules — ils ne
  changent pas. Un fichier d'intégration propre au site qui reçoit la copie vit à
  côté, jamais dedans : c'est le cas du modèle, dont `lib/agency-bouton-flottant.ts`
  explique que la preuve par `diff -r` ne doit porter que sur des fichiers copiés.
- Fonctions et variables : camelCase français, verbe + nom du métier —
  `purgerCacheAgence()`, `chargerDemandesAgence()`,
  `construireReponseCreationDemande()`, `normaliserTelephoneBurkinabe()`.
  `callAgency()` et `loadAgencySpace()` sont les deux noms anglais historiques :
  on ne les bilingualise pas.
- Constantes : `SCREAMING_SNAKE_CASE` français — `ROLES_ADMINISTRATION`,
  `STATUTS_DEMANDE`, `CHEMINS_CACHE_LECTURE`, `ENTETE_REVALIDATION`.
- `app/api/agency/_interne/` contient le code partagé entre routes
  (`securite.ts`, `limite.ts`) : un dossier `_interne` n'est pas routé par Next.
  C'est aussi l'endroit où vivent `repErreur()` et `repRefus()`, pour que les
  quatre routes d'agence partagent un seul format d'erreur (`{ error, champs }`).

## Ce que le site fournit, ce que le module ne fait pas

- Le site fournit `createClient()` via `@/lib/supabase/server`, la table
  `public.profiles` et `react`, `next`, `zod` (aucune dépendance dans le
  `package.json` du connecteur : une bibliothèque ajoutée ici devient une
  dépendance imposée au site qui recoit la copie).
- Le module lit `process.env` par l'intermédiaire de `lib/agency/client.ts` :
  il est **serveur uniquement**, il ne doit jamais être importé depuis un
  composant client.
- `MGS_SITE_SECRET` n'est jamais `NEXT_PUBLIC_` ; la plateforme ne stocke que le
  SHA-256 du secret.

## Le contrat partagé

`lib/agency/contrat-partage.ts` est la copie de
`plateforme-mindgraphixsolution/lib/agency-shared-contract.ts`. Son bandeau de 21
lignes est la seule partie propre au connecteur ; tout ce qui suit est l'original
au caractère près. On ne corrige donc jamais ce fichier : on corrige l'original,
on recopie, on vérifie avec le `diff` du bandeau. Les sites clients et la
plateforme portent le même fichier, donc un libellé ne peut diverger d'un site à
l'autre.

## Dégradation

- Plateforme muette ⇒ le site marche quand même : `callAgency()` renvoie `null`
  et ne lève jamais (`lib/agency/client.ts`). `loadAgencySpace()` se replie
  silencieusement, et `components/agency/AgencyBillingBanner.tsx` ne rend rien
  quand il n'y a rien à dire (`if (impayees.length === 0) return null;`).
  Ne jamais transformer une panne en page blanche.
- Les journaux serveur sont préfixés `[mgs-agency]` : `console.error("[mgs-agency]
  Plateforme momentanément indisponible.", error)`.
- Les erreurs utilisateur sont en français, dites au visiteur, jamais brutes
  d'une exception.

## Avant de dire « terminé »

Aucun script npm ici (le module n'a pas de dépendances). Les contrôles sont :

```bash
diff <(tail -n +22 lib/agency/contrat-partage.ts) \
  ../plateforme-mindgraphixsolution/lib/agency-shared-contract.ts
diff -r app/api/agency ../template-boutique-mgs/app/api/agency
node scripts/verifier-connexion.mjs        # hors ligne : variables, SSRF, contrat
```

Le premier `diff` doit être vide. Après toute modification, la copie va dans
les deux dépôts clients (`template-boutique-mgs`, `site-vitrine-mindgraphixsolution`).

## Commits

Message en français, une ligne, sans point final. Deux formes coexistent dans
l'historique : `type: description` (`feat:`, `fix:`, `docs:`, `chore:`, `style:`,
`refactor:`) et `Domaine: phrase` (« Agence commune: contrat partage, bouton
flottant, routes du site »). S'aligner sur les 5 derniers commits.