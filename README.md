# TnDocs

Plateforme de documents et de démarches tunisiennes, en français et en arabe. La direction du produit et les étapes de livraison suivent les spécifications fonctionnelles et l'architecture fournies.

## Démarrage local

Prérequis : Node.js 22+ et npm. Pour MariaDB et Meilisearch locaux, Docker Compose est aussi nécessaire.

```sh
cp .env.example .env
docker compose up -d mariadb meilisearch mailpit
npm install
npm run db:migrate
npm run dev
```

Ouvrir [http://localhost:3000/fr](http://localhost:3000/fr) ou [http://localhost:3000/ar](http://localhost:3000/ar). La page de santé de l'application est disponible sur `/api/health`.

Pour démarrer l'environnement complet avec Compose :

```sh
docker compose up --build
```

MariaDB et Meilisearch n'écoutent que sur localhost. Le profil Caddy de prévisualisation s'active avec `docker compose --profile staging up --build`.

## État du développement

- Phase 1 en cours : socle Next.js, routes FR/AR, styles responsive, Compose local, schéma Drizzle initial et intégration continue.
- Phase identité en cours : création de compte, confirmation email, connexion, récupération du mot de passe, session révocable et page « Mes documents » protégée.
- Compose inclut Mailpit pour intercepter les emails de développement. Son interface est disponible sur `http://localhost:8025`.
- Aucune démarche réelle n'est publiée à ce stade. Les modèles nécessitant vérification de sources et de droits seront ajoutés après revue.
- Aucun secret, service d'IA ou déploiement du VPS n'est configuré par cette fondation.

## Commandes

```sh
npm run lint
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate
npm run db:push
```

`db:push` sert au développement local uniquement. Utilisez les migrations versionnées sur les environnements partagés. Configurez un serveur SMTP et remplacez `PASSWORD_PEPPER` avant tout déploiement. Les décisions du socle sont consignées dans `docs/adr/`.
