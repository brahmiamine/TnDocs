# ADR-0002: Services locaux de développement

## Statut
Acceptée pour la phase de fondation.

## Contexte
Le développement doit être reproductible sans toucher au VPS existant ni exposer les services de données sur Internet.

## Décision
Docker Compose lance MariaDB, Meilisearch et l'application Next.js. Les ports des services sont publiés uniquement sur `127.0.0.1`. Caddy est disponible sous le profil Compose `staging` pour le routage HTTP de prévisualisation. Les identifiants du fichier Compose sont réservés aux données locales jetables.

## Conséquences
Un déploiement réel devra injecter ses secrets et ses limites de ressources séparément. Cette phase ne configure pas de DNS, de certificat, de sauvegarde distante ni d'accès au VPS.
