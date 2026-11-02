# Modèle mobile Expo MGS

Le dossier `mobile/` contient une application Android de départ avec connexion Supabase, stockage de session dans SecureStore et lecture du connecteur MGS par une route serveur Next.js. Les secrets `MGS_SITE_KEY` et `MGS_SITE_SECRET` restent dans les variables Vercel et ne sont jamais intégrés à l’APK.

Après création du dépôt client et déploiement du site Vercel, ouvrir **Actions → Build client Android APK → Run workflow** dans le dépôt généré. Le workflow produit un APK de débogage installable, disponible comme artefact GitHub pendant 14 jours. Il n’utilise pas EAS Build et ne publie rien sur Play Store.

Pour lancer l’application en local, copier `.env.example` vers `.env.local` et remplacer l’URL par celle du site Vercel du client. L’API du site fournit la configuration publique Supabase ; aucune clé d’administration ne doit être ajoutée dans l’application.

L’écran de départ affiche l’identité, les prestations, offres, demandes et l’état du connecteur. Les écrans et parcours métier propres au client restent à personnaliser avant une mise en production.
