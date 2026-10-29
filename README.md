# TnDocs

Plateforme de documents et de démarches tunisiennes, en français et en arabe. La direction du produit et les étapes de livraison suivent les spécifications fonctionnelles et l'architecture fournies.

## Démarrage local

Prérequis : Node.js 22+ et npm. Pour MariaDB et Meilisearch locaux, Docker Compose est aussi nécessaire.

```sh
cp .env.example .env
npm install
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
- Les liens du catalogue et de l'espace personnel servent de points d'entrée pour les phases catalogue et identité.
- Aucune démarche réelle n'est publiée à ce stade. Les modèles nécessitant vérification de sources et de droits seront ajoutés après revue.
- Aucun secret, service d'IA ou déploiement du VPS n'est configuré par cette fondation.

## Commandes

```sh
npm run lint
npm run typecheck
npm run build
npm run db:generate
npm run db:migrate
```

Les décisions du socle sont consignées dans `docs/adr/`.
