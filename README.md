# Connecteur MindGraphixSolution — Système A

Ce module relie un **site client** à la **plateforme MGS**, côté serveur. Il fait
vivre le lien boutique ↔ agence : facturation, annonces, demandes d'amélioration,
promotion des services.

Il ne dit **rien** du MGS Account (Système B), qui est un système totalement
séparé : identité des clients finaux, authentification Supabase, espace personnel.
Les deux ne doivent jamais être mélangés.

👉 **[INSTALLATION-CONNECTEUR.md](./INSTALLATION-CONNECTEUR.md)** — le guide
pas-à-pas pour installer le connecteur sur un nouveau site client.

## Fichiers fournis

| Chemin | Rôle |
|---|---|
| `lib/agency/client.ts` | Client HTTP authentifié vers la plateforme (clé + secret, côté serveur) |
| `lib/agency/space.ts` | Charge l'onglet « Mon agence » côté serveur, avec repli silencieux |
| `lib/agency/types.ts` | Types et helpers de présentation, sans variable d'environnement |
| `lib/agency/contrat-partage.ts` | Copie verbatim du contrat partagé de la plateforme (bandeau de 21 lignes en tête) |
| `components/agency/AgencyCredit.tsx` | Crédit « Site créé par MindGraphixSolution » (Server Component) |
| `components/agency/AgencyBillingBanner.tsx` | Bandeau de facturation en haut du dashboard |
| `components/agency/AgencyPanel.tsx` | Onglet « Mon agence » (contacts, annonces, demande, offres) |
| `components/agency/agency-messages.tsx` | Conversation client ↔ agence par demande |
| `components/agency/AgencyFloatingButton.tsx` | Bouton flottant et panneau, à monter sur une page réservée aux administrateurs |
| `components/agency.css` | Styles de l'onglet, préfixés `agency-` pour ne rien écraser |
| `app/api/agency/_interne/securite.ts` | Contrôles communs aux cinq routes d'agence : session, rôle, origine. Seul fichier qui dépend de l'auth du site |
| `app/api/agency/_interne/limite.ts` | Limiteur d'appels en mémoire des routes qui écrivent chez l'agence |
| `app/api/agency/heartbeat/route.ts` | Déclare `MGS_TEMPLATE_VERSION` à la plateforme (admin du site uniquement) |
| `app/api/agency/request/route.ts` | Transmet la demande d'amélioration vers la plateforme |
| `app/api/agency/requests/route.ts` | Relecte des demandes à la demande, pour un panneau frais (admin du site) |
| `app/api/agency/requests/reponse/route.ts` | Réponse du commerçant à un devis : acceptation ou refus (admin du site) |
| `app/api/agency/requests/[id]/messages/route.ts` | Lecture et envoi de messages, réservés à l'administration du site |
| `app/api/agency/revalidate/route.ts` | Purge immédiate du cache « Mon agence » après un changement côté plateforme |
| `app/api/health/route.ts` | Sonde du SITE : « le site répond-il ? ». N'appelle pas la plateforme et ne dit rien de la connexion |
| `scripts/verifier-connexion.mjs` | Diagnostic de la chaîne site ↔ plateforme, hors ligne et en ligne (lecture seule) |
| `docs/DIAGNOSTIC-CONNEXION.md` | Symptômes, causes et remédiations de la connexion |

## Règle de sécurité

Ne jamais préfixer `MGS_SITE_KEY` ou `MGS_SITE_SECRET` par `NEXT_PUBLIC_` : la
clé deviendrait publique et lisible par tous les visiteurs. Seul le hash SHA-256 du
secret est stocké côté plateforme.

Les projets Expo/React Native ne peuvent pas garder le secret dans l'application
mobile. Ils doivent appeler la fonction Supabase Edge `mgs-agency` avec la session
utilisateur ; cette fonction garde les secrets dans les secrets Edge.

Si la plateforme ne répond pas, le site continue de fonctionner normalement :
`callAgency` renvoie `null`, l'onglet « Mon agence » ne s'affiche pas.

## Diagnostic et vérification de la connexion

Quand l'espace « Mon agence » n'apparaît pas, apparaît vide, ou n'est pas à
jour, deux outils servent — et ils ne se remplacent pas.

| Outil | Ce qu'il couvre |
|---|---|
| [`scripts/verifier-connexion.mjs`](./scripts/verifier-connexion.mjs) | Contrôle automatique : variables d'environnement, garde d'origine, dérive de contrat, prérequis de la plateforme, test HTTP |
| [`docs/DIAGNOSTIC-CONNEXION.md`](./docs/DIAGNOSTIC-CONNEXION.md) | Lecture des symptômes : couche fautive, où la vérifier, quoi corriger |

**Commande, depuis la racine de ce dépôt :**

```bash
# 1. Hors ligne : variables, garde d'origine, contrat, prérequis plateforme
node scripts/verifier-connexion.mjs --site ../<votre-site-client>

# 2. Le même, plus trois GET réels sur la plateforme (lecture seule)
node scripts/verifier-connexion.mjs --site ../<votre-site-client> --en-ligne
```

Sans `--site`, le script vérifie ce dépôt lui-même. Les variables attendues
figurent dans [`.env.example`](./.env.example).

**Le script vérifie :** la présence de `MGS_PLATFORM_URL`, `MGS_SITE_KEY`,
`MGS_SITE_SECRET` et du filet `MGS_AGENCY_*`, sans jamais afficher de valeur ;
le rejeu hors réseau du garde d'origine de `lib/agency/client.ts:303-310` ; la
conformité de `lib/agency/space.ts` au contrat réel (`agence.identite`) ; les
variables serveur et la migration attendue côté plateforme ; et, en `--en-ligne`,
la réponse réelle avec la traduction de chaque statut HTTP. Code de retour `0`
si rien n'est détecté, `1` sinon.

**Le script ne fait pas :** il n'écrit rien, ne se connecte jamais à Supabase,
n'affiche aucun secret, ne lance pas `create-site-credential.mjs`, et ne teste
pas les routes `/api/agency/*` du site. La session, le rôle du compte et le
contrôle d'origine restent à vérifier dans les journaux `[mgs-agency]` — c'est
ce que fait la section 5 du diagnostic.

**La sonde `app/api/health/route.ts` n'est pas un troisième outil.** Elle
répond `status`, `version` et `timestamp`, n'appelle jamais la plateforme : elle
dit que le site répond, pas que la connexion fonctionne. L'état de la
plateforme se vérifie sur sa propre sonde `/api/health`.
