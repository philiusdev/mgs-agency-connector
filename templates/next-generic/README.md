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

## Variables du projet

Copiez `.env.example` dans `.env.local` pour le développement local. En
production, configurez les mêmes valeurs dans les variables secrètes du projet
d’hébergement. `MGS_SITE_SECRET` ne doit jamais être exposé avec le préfixe
`NEXT_PUBLIC_`.

Le déploiement automatique configure les valeurs partagées MGS/Supabase et les
identifiants propres au site. Il ne publie pas le secret dans le dépôt.

## Personnalisation

Modifiez `app/page.tsx`, `app/site.css` et les métadonnées dans
`app/layout.tsx`. Le panneau agence est dans `/admin`, protégé par session et
par `MGS_SITE_ADMIN_EMAILS`.
