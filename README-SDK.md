# SDK Client MGS — Guide d'intégration

Ce document explique comment intégrer le **SDK client MGS** dans un site client
(Next.js, Expo, React, etc.) pour se connecter à la plateforme MindGraphixSolution.

---

## 1. Installation

Le SDK se trouve dans `mgs-agency-connector/lib/agency/sdk.ts`.
Il n'a **aucune dépendance externe** (utilise uniquement `fetch` et l'API WebSocket native).

Copiez le fichier `sdk.ts` et `sdk-types.ts` dans votre projet client, ou importez-les
directement depuis le connecteur si vous utilisez une monorepo.

---

## 2. Configuration requise

Créez un fichier `.env.local` à la racine de votre site client :

```env
# URL de l'API REST de la plateforme MGS
MGS_PLATFORM_URL=https://plateforme-mindgraphixsolution.vercel.app

# URL WebSocket (pour les événements temps réel)
MGS_WS_URL=wss://plateforme-mindgraphixsolution.vercel.app/api/v1/ws

# Clé publique du site (générée par create-site-credential.mjs)
MGS_SITE_KEY=mgs_xxxxxxxxxxxx

# Secret serveur du site (jamais exposé côté client)
MGS_SITE_SECRET=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy

# Secret partagé pour les webhooks entrants (optionnel)
MGS_WEBHOOK_SECRET=zzzzzzzzzzzzzzzz
```

> ⚠️ **Sécurité** : `MGS_SITE_SECRET` et `MGS_WEBHOOK_SECRET` ne doivent JAMAIS
> être préfixés par `NEXT_PUBLIC_`. Ils sont lus côté serveur uniquement.