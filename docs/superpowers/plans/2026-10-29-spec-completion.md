# TnDocs — réalisation du cahier des charges

**Goal:** réaliser les exigences Q01–Q70 sur le socle existant avec validation réelle et liste explicite des dépendances externes.
**Architecture:** conserver Next.js/Drizzle/MariaDB et les versions immuables chiffrées. Modules séparés avec contrats serveur, propriétaire vérifié pour chaque ressource privée. Queue MariaDB persistante pour tâches externes et rendus isolés.
**Tech Stack:** TypeScript, React, MariaDB, Meilisearch, Chromium, docx, WebCrypto.
**Spec:** docs/specs/01-functional.md, 02-architecture.md, 03-delivery-plan.md fournis par le porteur et explicitement demandés pour exécution.

## Contraintes globales
FR/AR, RTL, gratuit, aucun LLM ; aucune publication de contenu juridique inventé ; pas de déploiement/merge/production ; aucun accès libre admin aux données privées ; conservation des anciennes versions ; toutes les décisions produit non définies restent configurables ou signalées.

## Review Focus
Concurrence/consommation unique des challenges ; perte réseau sans écrasement ; révocation et expiration des invitations ; fichiers malformés/quota ; panne d'un service externe sans corruption des données.

## Tâches et contrats
- [x] 1. Inventaire du dépôt, archivage des références, baseline lint/typecheck.
- [x] 2. Identité : advanced-schema.ts, routes auth/MFA/sessions, page securite ; getCurrentUser garde les sessions MFA ; tests identity.
- [x] 3. Offline : modules/offline et intégration editor ; AES-GCM et séparation ownerId ; tests offline.
- [x] 4. Signatures : db-schema.ts, demandes liées à révision/hash, invités vérifiés ; tests signatures.
- [x] 5. Dossiers : export ZIP/manifest et PDF, photo/cadrage ; tests dossiers.
- [x] 6. Contributions/contact/SEO/pages informations ; modération auditée ; tests community.
- [x] 7. FormSchema compatible v1, conditions/listes/calculs et builder ; RichFormFields ; tests forms.
- [x] 8. Jobs persistants avec lease/fencing/reprise/déduplication et indexation transactionnelle ; tests jobs et MariaDB.
- [x] 9. Rendu PDF isolé depuis le même contenu que DOCX, jobs export et contrôle propriétaire ; tests renderer.
- [x] 10. Assistant/règles et veille autorisée sans publication automatique ; tests sources.
- [x] 11. Notifications/configuration/retention/admin et modèles privés ; tests ACL.
- [x] 12. Migrations, CI tests, FR/AR/recette, docs exploitation et matrice Q01–Q70 avec preuves/écarts.

Chaque module : tests critiques RED avant code, tests GREEN, typecheck ; intégration finale lint/test/build, migrations sur base isolée lorsque disponible. Aucune mention « terminé » sans preuve du parcours réel. Les documents fournis remplacent la discussion de conception déjà réalisée ; aucune nouvelle approbation du même périmètre n'est requise.

## Clôture locale

Les modules sont implémentés et vérifiés localement. Les configurations externes et la recette de production restent explicitement ouvertes dans la matrice Q01–Q70 et le runbook. Aucune exécution du runtime NaCl `/goal`, aucun merge et aucun déploiement ne sont revendiqués.
