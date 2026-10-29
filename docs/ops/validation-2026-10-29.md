# Validation locale — 29 octobre 2026

Branche : `feat/spec-completion`. Base : `eaf4880`. Environnement de recette isolé, MariaDB 11.4, Chromium, données fictives ; aucun VPS existant modifié.

## Preuves

Résultats finaux : lint, TypeScript et compilation de production réussis ; 41 fichiers de tests généraux et 9 fichiers d’intégration réussis, avec MariaDB/HTTP activés. Migrations complètes également réussies sur une nouvelle base vierge `tndocs_verify5`, puis absence de dérive de schéma. Syntaxe Compose développement/production vérifiée sans démarrage. Dix pages mobiles contrôlées en clair et sombre sans violation axe sur les tags ciblés.

- Migrations depuis une base vierge, puis migrations incrémentales sur `tndocs_verify4`. Le premier essai a révélé deux noms de contraintes trop longs ; corrigés avant reprise. Un écart historique entre snapshots et noms SQL de FK du catalogue a également été corrigé dans la nouvelle migration.
- Tests unitaires séparés par processus : AST/conditions/calculs/RTL, chiffrement et séparation de comptes, TOTP/OAuth, politiques de partage/signature, ZIP/PDF/photos, queue/baux, source SSRF/droits/extraction, notifications, sauvegardes/restauration.
- Tests MariaDB réels : consommation concurrente de tokens et codes, quota concurrent, états/révisions immuables, clauses de publication, modération/configuration, nettoyage différé, réservations, signature de gros PNG et protection du dernier administrateur.
- Tests HTTP réels : propriétaire/tiers/anonyme, origines, création depuis catalogue vide après classement, deux écritures sur une révision, refus de finalisation incomplète, export PDF/Word et téléchargement autorisé.
- Partages : 46 assertions HTTP/DB sur destinataires vérifiés, permissions indépendantes, conflits, révocation, expiration, copie et préservation bilingue.
- Documents bilingues : deux pages A4 avec français/arabe, variables communes, absence de traduction refusée ; vérification visuelle des glyphes arabes et des textes mixtes. Word contient les deux sections ; vérification dans plusieurs logiciels bureautiques réels reste à effectuer.
- Offline Chromium : véritable IndexedDB chiffré, aucun texte privé en clair, conflit préservé puis copie ; shell et assets publics sans HTML/API privés, fermeture complète et réouverture sans réseau, mauvais secret refusé, bon secret récupérant le texte complet.
- Accessibilité automatisée mobile FR/AR avec axe WCAG 2 A/AA/2.1 AA sur accueil, catalogue, connexion, aide et informations ; contrastes corrigés. Ce contrôle ne constitue pas un audit WCAG 2.2 AA exhaustif.
- Sauvegarde : 5 tests de fixtures fictives, authentification avant extraction, clé incorrecte/altération, traversal/liens/doublons, bornes et sommes SHA256.

## Limites de recette

Les services Google, SMTP réel, WebPush réel et une collecte externe autorisée ne sont pas activés sans configuration. Aucun modèle juridique réel n'est inventé/publié. Les définitions ClamAV à jour, appareils physiques, lecteurs Word, revue juridique, sauvegarde hors site et capacité du VPS partagé doivent encore être validés avant ouverture publique.

L'API GitHub a répondu `Forbidden` lors de la tentative de vérification d'accès ; le travail local reste révisable même sans PR distante. Aucun merge ni déploiement n'a été exécuté.
