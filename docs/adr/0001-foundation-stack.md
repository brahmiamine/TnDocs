# ADR-0001: Stack de fondation

## Statut
Acceptée pour la phase de fondation.

## Contexte
Le dépôt est neuf. L'architecture de référence demande une application full-stack Next.js en TypeScript, MariaDB comme source de vérité, Meilisearch pour l'index public et Docker Compose pour les services locaux. Le cahier des charges exige une interface française et arabe avec RTL.

## Décision
- Next.js App Router et TypeScript strict pour l'application.
- Drizzle ORM avec le dialecte MySQL et le pilote `mysql2` pour MariaDB. Les requêtes SQL restent explicites et la compatibilité MariaDB est assurée au niveau protocole MySQL.
- Zod pour valider les configurations et, plus tard, les contrats d'entrée.
- Routes localisées `/fr` et `/ar`, avec direction du texte déterminée côté serveur.
- MariaDB et Meilisearch isolés sur le réseau Compose; leurs ports de développement sont liés à localhost.

## Conséquences
La base reste un monolithe modulaire, sans Redis ni service d'IA. Drizzle demande des migrations SQL versionnées. La couverture RTL et le rendu des documents restent à valider dans les phases qui implémenteront ces parcours.
