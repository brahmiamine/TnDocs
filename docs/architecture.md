# Architecture réalisée

Application Next.js TypeScript avec routes `/fr` et `/ar`, contrôles serveur et monolithe modulaire. Le schéma central réexporte les tables de chaque domaine ; migrations Drizzle versionnées MariaDB. `docs/specs/` conserve les trois documents transmis, dont les mentions historiques de validation ne décrivent pas l'état actuel du dépôt.

Les modules sont identité/MFA, profils, catalogue/recherche, formulaires/éditeur AST, modèles privés, versions documentaires, partage nominatif, signatures, dossiers/pièces, offline, procédures/sources, contributions, notifications et administration. Données personnelles et contenus chiffrés avec contexte propriétaire/ressource ; les index et sitemaps n'utilisent que les contenus publiés. Le stockage local implémente `StorageAdapter`, préparant un adaptateur S3 ultérieur.

Les commandes asynchrones sont des jobs SQL dédupliqués, transactionnels, à tentatives bornées et baux clôturés. Les exports ont une réservation persistante, un résultat opaque et une autorisation renouvelée au téléchargement. Emails en file chiffrée, notifications à codes fixes et préférences vérifiées au moment de l'envoi. Les collecteurs fonctionnent sans LLM et restent soumis aux droits des sources et à la validation humaine.

Voir ADR-0006, la matrice des exigences et les runbooks d'exploitation. Les tests locaux n'établissent pas une certification juridique, WCAG ou de capacité de production.
