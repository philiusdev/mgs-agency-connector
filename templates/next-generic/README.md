# Site Next.js générique MGS

Ce dossier est la racine d’un projet Next.js neuf, prêt à être personnalisé.
Le script `npm run template:sync` copie ici la version courante du connecteur
depuis le dépôt parent.

## Authentification et accès admin

Le site utilise le projet Supabase partagé. La connexion admin est faite par
email OTP/lien, sans création implicite de compte. `MGS_SITE_ADMIN_EMAILS`
contient la ou les adresses autorisées, séparées par des virgules. Côté
plateforme, chaque site Vercel reçoit sa propre liste. Le premier compte admin
doit être invité dans Supabase Auth avant la connexion.

Le lien e-mail passe par le relais fixe `MGS_PLATFORM_URL/auth/site-callback`.
MGS retrouve l'adresse HTTPS depuis l'identifiant `MGS_SITE_ID` en base, puis
redirige le code vers `/auth/callback` du site. Cette méthode n'exige ni jeton
Supabase Management ni allow-list wildcard sur `*.vercel.app`.

## Variables du projet

Copiez `.env.example` dans `.env.local` pour le développement local. En
production, configurez les mêmes valeurs dans les variables secrètes du projet
d’hébergement. `MGS_SITE_SECRET` ne doit jamais être exposé avec le préfixe
`NEXT_PUBLIC_`.

Le déploiement automatique configure les valeurs partagées MGS/Supabase et les
identifiants propres au site. Il ne publie pas le secret dans le dépôt.

## Santé et préparation métier

`/api/health` vérifie sans exposer de secret que l’identité et le type du site
sont configurés. Le centre de contrôle vérifie également la page d’accueil et
la présence de ce contrat sur chaque site actif. Un modèle de départ peut être
en ligne tout en restant incomplet : le catalogue, les paiements, les parcours
de l’application et les autres fonctions métier doivent être configurés pour
chaque client et ne sont pas déclarés opérationnels par cette sonde.

## Modèles de départ

Le projet adapte sa page d’accueil au type transmis par la plateforme :
boutique e-commerce, site vitrine ou plateforme personnalisée. Le nom public
du site est affiché depuis `MGS_SITE_NAME`, et `MGS_SITE_TYPE` choisit le
contenu de départ. Le modèle présente une structure à personnaliser ; il ne
crée pas de catalogue, de paiement, de formulaire métier ni de connexion à des
données inexistantes.

Le type « application/mobile » n’est pas encore généré automatiquement. Le
projet Next.js ne remplace pas un squelette Expo et ne doit pas être présenté
comme une application native.

## Personnalisation

Modifiez `app/page.tsx`, `app/site.css` et les métadonnées dans
`app/layout.tsx`. Le panneau agence est dans `/admin`, protégé par session et
par `MGS_SITE_ADMIN_EMAILS`.
