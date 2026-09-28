# Connecteur MindGraphixSolution

Ce module relie un projet client à la plateforme MGS côté serveur. Il fournit le client HTTP, un contrôle de santé public et un endpoint de heartbeat réservé à l’administrateur connecté.

## Installation dans une boutique Next.js

Copier `lib/agency/client.ts`, `app/api/health/route.ts` et `app/api/agency/heartbeat/route.ts` dans les mêmes chemins du projet. Appeler `POST /api/agency/heartbeat` depuis le tableau de bord admin après authentification.

Renseigner côté serveur uniquement :

```env
MGS_PLATFORM_URL=https://plateforme-votre-domaine
MGS_SITE_KEY=identifiant-fourni-par-la-plateforme
MGS_SITE_SECRET=secret-affiche-une-seule-fois
MGS_TEMPLATE_VERSION=1.0.0
```

Ne jamais préfixer ces variables par `NEXT_PUBLIC_`, ni les envoyer au navigateur. Le secret est stocké sous forme de hash dans la plateforme.

Les projets Expo/React Native ne peuvent pas garder le secret dans l’application mobile. Ils doivent appeler la fonction Supabase Edge `mgs-agency` avec la session utilisateur ; cette fonction authentifie le rôle administrateur et garde les secrets MGS dans les secrets Edge.
