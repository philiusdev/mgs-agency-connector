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
| `components/agency/AgencyCredit.tsx` | Crédit « Site créé par MindGraphixSolution » (Server Component) |
| `components/agency/AgencyBillingBanner.tsx` | Bandeau de facturation en haut du dashboard |
| `components/agency/AgencyPanel.tsx` | Onglet « Mon agence » (contacts, annonces, demande, offres) |
| `components/agency.css` | Styles de l'onglet, préfixés `agency-` pour ne rien écraser |
| `app/api/agency/heartbeat/route.ts` | Signale le site en ligne (admin connecté uniquement) |
| `app/api/agency/request/route.ts` | Transmet la demande d'amélioration vers la plateforme |
| `app/api/health/route.ts` | Contrôle de santé |

## Règle de sécurité

Ne jamais préfixer `MGS_SITE_KEY` ou `MGS_SITE_SECRET` par `NEXT_PUBLIC_` : la
clé deviendrait publique et lisible par tous les visiteurs. Seul le hash SHA-256 du
secret est stocké côté plateforme.

Les projets Expo/React Native ne peuvent pas garder le secret dans l'application
mobile. Ils doivent appeler la fonction Supabase Edge `mgs-agency` avec la session
utilisateur ; cette fonction garde les secrets dans les secrets Edge.

Si la plateforme ne répond pas, le site continue de fonctionner normalement :
`callAgency` renvoie `null`, l'onglet « Mon agence » ne s'affiche pas.
