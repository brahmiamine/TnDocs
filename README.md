# TnDocs

Plateforme gratuite de documents et démarches tunisiennes et consulaires, en français et arabe. Les spécifications transmises sont conservées dans `docs/specs/`. Le code est développé par modules ; l'ouverture publique reste une décision distincte après configuration et recette d'exploitation.

## Démarrage local

Node.js **22.13+**, npm et Docker Compose sont nécessaires. Copier `.env.example` vers `.env` puis remplacer chaque clé de chiffrement et le pepper par des valeurs indépendantes. Les clés AES sont des valeurs Base64 de 32 octets (`openssl rand -base64 32`). Ne jamais les changer après utilisation sans migration.

```sh
npm ci
docker compose up -d mariadb meilisearch mailpit clamav
npm run db:migrate
npm run dev
npm run worker
```

Ouvrir `/fr` ou `/ar` sur `http://localhost:3000`. Mailpit intercepte les emails de développement (`http://localhost:8025`). Les emails sont d'abord enregistrés dans une outbox chiffrée : le worker doit tourner. Les pièces/imports nécessitent ClamAV avec définitions récentes. Le PDF nécessite Chromium et les polices Noto ; configurer `CHROMIUM_EXECUTABLE_PATH` ou utiliser la cible Docker `worker`. Sans scanner ou renderer configuré, l'opération concernée échoue explicitement.

`docker compose up --build` démarre l'environnement de développement complet. Les services de données n'écoutent que sur localhost. Le profil Caddy de prévisualisation s'active avec `docker compose --profile staging up --build`.

## Fonctions réalisées

- Comptes, confirmation/reset/magic link, Google configuré à la demande, TOTP et secours, sessions révocables, changement d'email confirmé et rôles protégés.
- Profils autorisés chiffrés, catalogue versionné, classement/organismes administrables, formulaires conditionnels/répétables/calculés et éditeur de blocs contrôlé.
- Brouillons autosauvegardés, historiques immuables, modèles privés, favoris, finalisation, archivage/corbeille 30 jours et comparaison/restauration.
- PDF et Word FR/AR/bilingues depuis le même contenu, file SQL, réservations d'artefacts et téléchargements autorisés.
- Partages nominatifs avec droits distincts, signatures/cachets facultatifs, invités vérifiés, révisions figées et preuves techniques.
- Dossiers sourcés, checklist versionnée, photos recadrées, pièces chiffrées/scannées, export ZIP/PDF et partage nominatif révocable.
- Offline chiffré volontaire, réouverture avec secret, conflits explicites et copie indépendante.
- Recherche bilingue, synonymes/intention déterministes, autocomplétion/facettes, procédures sourcées et veille sur hôtes approuvés, sans LLM.
- Contributions/support/modération, notifications et préférences, push volontaire, administration des comptes/configuration, textes légaux versionnés et métriques minimisées.
- Quotas sérialisés, nettoyage durable, sauvegarde chiffrée et restauration isolée.

Les liens anciens sans destinataire vérifié sont refusés. Les originaux officiels ne sont pas recomposés. Aucune source réelle ou traduction n'est publiée sans revue. Les images de signature ne sont pas présentées comme des signatures électroniques qualifiées. L'OCR facultatif reste désactivé.

## Administration

Créer un compte adulte, confirmer son email puis promouvoir le premier administrateur avec `npm run admin:promote`. En production, les rôles élevés doivent activer TOTP. Le hub `/{locale}/admin` donne accès au catalogue, classement, sources/parcours, modération, recherche, comptes et système. Les administrateurs n'ont pas d'accès général aux documents privés.

## Vérifications

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Les tests de base s'exécutent dans des processus séparés. Les scénarios MariaDB exigent une base **isolée** nommée `tndocs_verify<N>` et refusent les bases ordinaires :

```sh
DATABASE_URL=mysql://root:password@127.0.0.1:3307/tndocs_verify1 npm run db:migrate
TEST_DATABASE_URL=mysql://root:password@127.0.0.1:3307/tndocs_verify1 npm test
DATABASE_URL=mysql://root:password@127.0.0.1:3307/tndocs_verify1 npm run test:integration
```

Les tests HTTP/Chromium sous `tests/integration/` sont opt-in, avec fixtures fictives, serveur local et variables explicites décrites dans leurs en-têtes. `NEXT_DIST_DIR=.next-production npm run build` permet une compilation séparée d'un serveur dev en cours ; la valeur doit aussi être fournie au lancement de cette compilation.

## Exploitation

Le modèle `docker-compose.production.yml` exige une configuration revue, des secrets propres et un tag SHA ; il ne déploie rien par lui-même. Les budgets mémoire cumulés doivent être adaptés au VPS partagé après mesure. Ne pas utiliser les mots de passe de développement en production.

`/api/health` vérifie la vie du web ; `/api/health?ready=1` vérifie sa connexion DB. Les jobs/reprises et sources se surveillent depuis le système. Une destination hors site, SMTP réel, domaine/HTTPS, OAuth et VAPID restent à configurer selon les fonctions activées. Les textes légaux restent des brouillons tant qu'ils ne sont pas revus/publiés.

Documentation : `docs/architecture.md`, `docs/adr/`, `docs/api/openapi.yaml`, `docs/specs/requirements-matrix.md`, `docs/ops/backup-restore.md`, `docs/ops/release-checklist.md`. `db:push` est réservé au développement ; utiliser les migrations versionnées ailleurs. Aucun merge, déploiement ou changement d'une autre application du VPS n'est effectué par cette branche.
