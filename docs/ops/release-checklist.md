# Préparation d'une ouverture publique

La branche de développement ne déclenche aucun déploiement. Ne pas modifier les autres applications du VPS. Le VPS partagé doit être mesuré avant activation de Chromium, ClamAV, MariaDB et Meilisearch : aucune capacité suffisante n'est présumée.

1. Revue de la PR, CI complète, puis décision de merge par le porteur.
2. Choisir domaine, responsable légal, SMTP et destination externalisée des sauvegardes. Valider les textes FR/AR et les droits des sources/contenus. Ne pas publier les fixtures.
3. Générer des clés indépendantes : PASSWORD_PEPPER, PROFILE_ENCRYPTION_KEY_V1, DOCUMENT_ENCRYPTION_KEY_V1, ATTACHMENT_ENCRYPTION_KEY_V1, IDENTITY_ENCRYPTION_KEY_V1, clé de sauvegarde. Ne jamais remplacer une clé ayant chiffré des données sans migration.
4. Tester SMTP et Google OAuth avec leurs véritables comptes, URI de callback, HTTPS, MFA des rôles élevés et délais/échecs. Les clés VAPID sont facultatives tant que push n'est pas activé.
5. Construire les cibles Docker `runner` et `worker`, vérifier versions/fonts et ressources ; garder bases/index privés. Les limites de développement ne constituent pas un dimensionnement du VPS.
6. Effectuer une sauvegarde chiffrée puis restauration isolée. Conserver secrets et clés séparément. Appliquer les migrations incrémentales après inspection ; MariaDB auto-commit le DDL, donc un échec peut nécessiter une reprise explicite. Ne jamais réexécuter aveuglément une migration partielle.
7. Recette P1–P5 sur Android/iOS/desktop, lecteurs Word et PDF, mode avion, refus d'accès, expiration, quota, ClamAV réellement actif, ressources/VPS partagé, surveillance et alertes.
8. Approbation explicite du lancement, des migrations et du retour arrière ; images versionnées par SHA et sauvegarde précédente disponible.

## Exploitation et incident

Les erreurs de jobs sont des codes minimisés. Consulter `/admin/systeme` pour jobs, capacité et sources. Une tâche morte nécessite diagnostic avant relance ; les exports expirés ou morts peuvent être régénérés par le propriétaire. Le worker reprend un bail expiré, refuse l'ancien jeton et nettoie les réservations abandonnées. Ne pas journaliser des corps privés, URL contenant tokens, emails ou clés. Une indexation en panne ne rend pas un brouillon public ; le catalogue revalide toujours `published` en SQL.

En incident : désactiver le module concerné, conserver les preuves techniques minimisées, révoquer les sessions/liens nécessaires, restaurer dans une nouvelle base et un nouveau répertoire, tester les ACL, puis décider humainement du basculement. Les tombstones de suppression doivent être réappliqués lors d'une restauration ancienne ; le cycle de rétention des sauvegardes et le RPO/RTO dépendent de la destination encore à choisir.
