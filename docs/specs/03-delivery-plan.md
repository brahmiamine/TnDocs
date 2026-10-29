# Plan de développement et stratégie de livraison — Plateforme tunisienne de documents

**Version :** 1.0 — 29 octobre 2026  
**Nature :** plan d'exécution **à valider**, non un ordre de lancer le développement  
**Entrées contractuelles :** `01-cahier-des-charges-fonctionnel.md` et `02-architecture-technique.md`  
**Philosophie :** toutes les fonctionnalités approuvées doivent figurer dans la cible finale ; déploiement par incréments contrôlés, chaque incrément testable et démontrable. La première ouverture publique peut précéder l'achèvement des fonctionnalités avancées seulement après validation des exigences obligatoires de sécurité, conformité et exploitation.

## 0. Organisation du travail pour l'agent développeur

**Règles de réalisation après autorisation future (pas maintenant) :**
1. Évaluer l'existant du dépôt nouvellement créé et du VPS uniquement avec les accès explicitement accordés ; ne jamais déployer ni migrer les applications déjà présentes sans accord.
2. Produire par phase une ADR si un choix technique n'a pas été approuvé. Demander arbitrage uniquement en cas de décision métier, risque de fuite ou coût nouveau ; expliciter la recommandation et les conséquences.
3. Préférer migrations incrémentales et indépendantes, signatures d'interfaces, code strict TypeScript, tests avant changements critiques, invariants d'ACL et confidentialité.
4. Présenter un rapport de phase : tâches terminées, tests réellement exécutés, limites connues, captures de prévisualisation FR/AR, résultats QA PDF/DOCX et plan de retour arrière.
5. Créer PR par périmètre, attendre validation pour merge et production. Éviter les commits directs sur `main` ou la suppression de données sans demande explicite.
6. Ne jamais annoncer une fonctionnalité comme complète sans succès démontré du parcours réel, y compris erreurs et permissions.

## 1. Jalons livrables par phases

### Phase 0 — Préparation, audit, décisions techniques et conformité

**Objectif :** transformer le cahier des charges en base de réalisation fiable et vérifier que le VPS peut soutenir les services envisagés.

**Travaux :**
- Créer le registre des exigences Q1–Q70, matrice `fonctionnalité → module → endpoint → test → livrable` et diagrammes.
- Formaliser les ADR ORM, framework auth, renderer PDF/DOCX, éditeur riche, jobs SQL, Meilisearch et stratégies de chiffrement.
- Audit sans modification des ressources du VPS existant : RAM/CPU, volumes, charge des autres applications, Docker et réseau, DNS, configuration Caddy ; évaluer concurrence et besoins de worker.
- POC isolée avec jeu de documents fictifs : un PDF FR, un PDF AR RTL, un DOCX bilingue multipage, un index bilingue Meilisearch, un job SQL redémarrable.
- Préparer matrice juridique à faire vérifier : loi tunisienne, INPDP, RGPD si applicable, licences et usage des sources, signatures et données de mineurs.
- Documenter les besoins de secrets, SMTP (serveur, port, TLS, utilisateur, mot de passe), domaine, lieu de sauvegarde externe et choix des polices.

**Interfaces/livrables :** `docs/adr/*.md`, `docs/specs/requirements-matrix.md`, `docs/security/threat-model.md`, `docs/ops/capacity-baseline.md`, résultats de POC, matrice compliance.

**Tests/critères de sortie :** POC FR/AR/DOCX imprimable sans caractères inversés ni coupes majeures ; performance/mémoire mesurées ; risques et choix ADR rédigés ; aucune mise en production ; aucune donnée réelle dans les échantillons.

### Phase 1 — Fondations Next.js, infrastructure et design system

**Objectif :** disposer d'une application démarrable localement et sur environnement de test avec isolation des services.

**Travaux :**
- Setup Next.js TypeScript strict, conventions de modules, ORM MariaDB choisi, migration initiale, Dockerfiles, Compose de développement et staging, Caddy de test, `.env.example` sans secrets.
- Rendu des routes publiques `/fr`, `/ar`, inversion RTL, design system inspiré du rouge tunisien, thèmes clair/sombre/system, responsive nav, métadonnées minimales.
- Setup lint/typecheck/tests unitaires/intégration, E2E Playwright ou équivalent, tests de direction RTL, de contrastes et CI PR.
- Schéma outbox et `job_queue`, gestion d'erreurs typée, journaux structurés (aucune PII), endpoints santé et stratégie de feature flags.
- Configurer quotas de ressources des conteneurs, secrets et accès volumes dès la base.

**Interfaces :** modules `platform/`, migration schéma initial, layout localisé, healthcheck, architecture de jobs.

**Tests de recette :** démarrage par commande documentée, migration/rollback de test, test de route FR/AR, isolation MariaDB/Meilisearch du réseau public, passage lint/typecheck/CI, aucune donnée sensible dans logs.

### Phase 2 — Identité, autorisations, profils familiaux et protection

**Objectif :** comptes complets, profils réutilisables et autorisations robustes.

**Travaux :**
- Comptes email/mot de passe, email vérifié, magic links, Google OAuth, reset, 2FA TOTP et codes de secours, gestion des sessions, email SMTP bilingue.
- RBAC utilisateur/modérateur/administrateur, protections des actions et entrées API, audit minimum et révocation.
- Profil principal et proches autorisés, champs facultatifs sensibles, préremplissage contrôlé, consentements et export/suppression des données personnelles.
- Parcours de comptes adultes gérant éventuellement des profils enfants, sans compte enfant autonome.

**Interfaces :** `IdentityService`, `AuthorizationService`, `ProfileService`, table permissions, endpoints compte/profil, contrat de notifications sécurité.

**Tests :** tests d'énumération, de brute-force, révocation, email à usage unique, exigence 2FA rôles élevés ; aucune consultation inter-comptes ; export/suppression sous contraintes ; modes FR/AR ; test explicitement sans fournisseur email en simulant une panne SMTP.

### Phase 3 — Catalogue public, sources, back-office et contributions

**Objectif :** contenu publié vérifié, structure multidimensionnelle administrable, pages SEO publiques.

**Travaux :**
- Catégories, administrations, documents, versions, traductions, guide, sources officielles, validité et distinctions entre officiel/modèle maison/informatif.
- Workflow de création/import manuel PDF/DOCX avec contrôles et métadonnées, publications/dépublications versionnées, modération des propositions et signalements, suivi d'erreurs.
- Back-office contenu minimal, SEO localisé, sitemaps, pages guides et FAQ, sources et documents similaires, partage social des pages publiques.
- Jeux de données de démonstration avec **seulement des exemples fictifs** ; premiers modèles publiés réels uniquement après revue des sources et droits de réutilisation.

**Interfaces :** `CatalogService`, `PublicationService`, `SourceRegistry`, endpoints publics/catalogue et administration, événements de publication.

**Tests :** un original officiel ne peut être publié comme adaptation si non autorisé ; modèle incomplet bloqué ; dépublication retire page/sitemap ; brouillons privés jamais publics ; traduction AR absente indiquée, jamais inventée.

### Phase 4 — Moteur no-code, éditeur, documents et exports (cœur de produit)

**Objectif :** utilisateur connecté transforme un modèle publié en document correct et récupérable.

**Travaux :**
- Builder de formulaires, champs simples/conditionnels/répétables, mapping, règles déclaratives, versionnement et tests internes.
- Préremplissage par profils, sauvegarde automatique, gestion versions, éditeur libre limité aux modèles éditables, aperçu en temps réel, duplication/archivage/corbeille.
- Jobs PDF/DOCX FR/AR/bilingues, pagination A4, impression, tests des caractères RTL, gestion des documents longs ; export à la demande et contrôle d'accès à chaque fichier.
- Traitement séparé des originaux PDF avec champs remplissables compatibles ; sinon ouverture du formulaire officiel intact.
- Écran « Mes documents », historique et restauration, dossiers simples.

**Interfaces :** `FormSchema`, `FormAnswerSet`, `DocumentRevision`, `DocumentRenderer`, API d'export et statuts de jobs, adapter `StorageAdapter`.

**Tests :** génération réelle FR/AR/bilingue PDF/DOCX, vérification visuelle, longue lettre + tableau, 409 version concurrente, refresh/reprise, taille/quota, accès refusé à document étranger, aucune régression d'une ancienne version.

### Phase 5 — Recherche bilingue, performance, privacy et préparation à une ouverture publique

**Objectif :** première version réellement utile et déployable **après** validation des gates de sécurité, qualité et légalité.

**Travaux :**
- Meilisearch, synchronisation outbox, dictionnaires synonymes FR/AR, facettes, autocomplétion, intention par règles, tableaux de métriques agrégées et gestion des recherches sans résultat.
- Compléter les mesures sécurité OWASP essentielles, contrôles de fichiers, sauvegardes chiffrées hors site avec restauration testée, pages légales FR/AR, conformité applicable, monitoring, contact/support, cookies.
- PWA installable et offline d'interface publique seulement (l'édition offline sensible suivra) ; vérifier SEO, performances mobiles et accessibilité avant exposition publique.
- Alimenter un **ensemble initial qualitatif** de modèles vérifiés sur les catégories prioritaires, sans quota numérique obligatoire.

**Interfaces :** `SearchGateway`, synchronisation `published_templates`, rapports QA, runbooks, catalogue de contenus vérifiés, configuration production.

**Tests de passage public :** parcours complet P1 sur Android/iOS/desktop, test d'export, tests négatifs d'autorisation, audit de fuite, vérification textes légaux, SLA de restauration démontré, domaine HTTPS, SMTP effectif, monitoring actif, charge compatible VPS.

**Jalon possible :** ouverture publique contrôlée **uniquement sur décision du porteur de projet**. Les fonctions avancées non livrées doivent être masquées/annoncées honnêtement ; les exigences de sécurité des fonctions effectivement actives sont non négociables.

### Phase 6 — Partage sécurisé, signatures et modèles personnels

**Objectif :** collaboration et signatures sans divulgation privée.

**Travaux :**
- Création et réutilisation de modèles personnels, soumission au catalogue sans données personnelles ni marques de signature.
- Partage nominatif, droits view/copy/edit, expiration et révocation, historique ; invitations et vérification email.
- Multi-signataires, placement de signature, cachet, états, suivi, preuves, hash d'une révision immuable et signature réutilisable protégée ; pédagogie sur valeur juridique limitée.
- Tableau d'administration des propositions et des signalements avancés.

**Interfaces :** `ShareGrant`, `SignatureRequest`, `SignatureParticipant`, API invitations/états, événements notifications.

**Tests :** utilisateur invité ne voit aucune autre pièce ; lien révoqué échoue ; décalage de versions refuse signature ; refus/expiration gérés ; signature image non présentée comme signature certifiée ; absence d'exposition dans email.

### Phase 7 — Dossiers intelligents, scan mobile et pièces

**Objectif :** préparation de dossiers avec pièces et checklist sourcées.

**Travaux :**
- Dossiers administratifs, états de pièces, liens vers version de procédure, scan/import photos, génération PDF depuis images ; OCR local facultatif isolé.
- Antivirus/scan, MIME et quotas, références de pièces partagées, récupération/archivage, export ZIP PDF fusionné, sommaire et partage d'un dossier.
- Rappels éventuels de pièce manquante, expiration si donnée et vérifiée, contexte consulaire variable.

**Interfaces :** `DossierService`, `AttachmentService`, `ChecklistRuleSet`, `DossierExportJob`.

**Tests :** interdiction d'upload exécutable ou archive dangereuse, droits sur pièces, dépassement quotas, PDF fusionné exact, import smartphone, pièce révoquée non accessible, checklist sans prétention de validation officielle.

### Phase 8 — PWA hors ligne sécurisée et synchronisation multi-appareils

**Objectif :** éditer et récupérer un brouillon hors ligne **sur autorisation explicite**.

**Travaux :**
- IndexedDB chiffré, activation volontaire, déverrouillage secret local, clé en mémoire et effacement volontaire du cache ; interdire cache sensible non autorisé.
- Files locales synchronisées, révisions optimistes, conflits avec comparaison et choix copie/serveur/local, notifications d'état, tests de perte réseau.
- Gestion capacités iOS/Android et cas d'éviction du stockage, messages honnêtes sur sauvegarde serveur.

**Interfaces :** `OfflineStore`, `SyncCommand`, `SyncConflict`, `expectedRevision`, état `local_pending/synced/conflict`.

**Tests :** mode avion, coupure pendant sync, même document sur deux appareils, déconnexion et nouvel utilisateur, espace local corrompu, secret perdu, cookies/session expirés ; zéro écrasement silencieux.

### Phase 9 — Veille officielle, connaissances et assistant à règles

**Objectif :** mise à jour du catalogue et recommandations de démarches sans LLM.

**Travaux :**
- Connecteurs autorisés par site, extraction/hash/diff, contrôle droits, détection de doublon, veille hebdomadaire, file de modération et rapports.
- Modèle de connaissance réglementation par démarche/consulat/pays, exigences de pièces et vérifications datées.
- Assistant à parcours/arbre de décision FR/AR, routage de requête par intentions dictionnaires, recommandations explicables et sourcées, fallback vers catalogue.
- Tests de réponses incertaines et refus d'inventer coûts, délais ou obligations.

**Interfaces :** `SourceConnector`, `SourceObservation`, `ProcedureRuleSet`, `GuidedJourney`, `RecommendationEvidence`.

**Tests :** source inaccessible, 403, conditions de réutilisation défavorables, nouveau PDF, document déplacé, hash identique, faux doublon, absence de traduction, parcours contradictoire ; aucun contenu non vérifié publié automatiquement.

### Phase 10 — Notifications étendues, administration avancée et exploitation complète

**Objectif :** boucler la gestion opérationnelle et l'amélioration du catalogue.

**Travaux :**
- Web Push selon consentement, centre notifications, préférences, rappels, SMTP réessayé et journal minimal ; vérifier les limitations iOS.
- Analytics internes agrégés, tableaux de suivi erreurs, jobs, collecte, stockage, recherches non abouties, sécurité, contributions ; configuration administrable auditée.
- Quotas 100 Mo par compte, politiques de conservation, corbeille 30 jours, exports données, suppression tenant compte sauvegardes, observabilité et nettoyage.
- Optimisations de charge, documentation de production, compatibilité multi-appareils, textes réglementaires et traductions mis à jour.

**Interfaces :** `NotificationService`, `AdminMetricsService`, `RetentionPolicy`, `SystemHealth`.

**Tests :** opt-out respecté, push refusé, SMTP en panne, notifications sans PII, suppression restauration / rétention cohérentes, index/worker redémarrés, monitoring déclenchant alerte mesurable.

### Phase 11 — Recette d'ensemble, sécurité et clôture de périmètre

**Objectif :** démontrer que les **70 décisions** sont couvertes, ou signaler explicitement tout point encore ouvert.

**Travaux :**
- Reprendre matrice de traçabilité Q1–Q70 et tous les parcours P1–P5 ; aucun statut « terminé » sans preuve de test.
- Audit sécurité et droits, accessibilité WCAG 2.2 AA visée, SEO FR/AR, rendu PDF/DOCX, gouvernance des sources, production et sauvegardes.
- Tests de montée en charge sur VPS partagé (avec marge pour les applications existantes), montée en version / rollback, restauration en environnement isolé.
- Livraison documentation utilisateur, admin et technique, procédures de suppression, sécurité, réponse incident, sauvegarde/restauration, maintenance, migrations, licences et dépendances.
- Inventaire final des modèles publiés/validés et des modèles référencés/non publiables ; plan de veille continue.

**Critère de clôture :** conformité de toutes les fonctions au cahier des charges ou liste d'écarts explicite approuvée. Aucune dépendance à un modèle IA à cette étape.

## 2. Cartographie de couverture des exigences par phase

| Exigences | Phases principales |
|---|---|
| Q1, Q34–Q39 périmètre, public, design | 0,1,3 |
| Q2, Q8, Q9, Q28, Q30, Q31, Q40–Q46 catalogue et sources | 3,9,11 |
| Q3, Q4, Q14, Q22, Q24, Q42, Q47–Q48 moteur documentaire et formats | 0,4,11 |
| Q5, Q6, Q11, Q49–Q55 compte, profils, documents, version/partage | 2,4,6,7,8 |
| Q7, Q18, Q58 recherche et SEO | 3,5,9 |
| Q10, Q17, Q32, Q33 identité, sécurité, SMTP, confidentialité | 0,2,5,10,11 |
| Q12, Q13, Q21 administration, notifications, stockage | 3,10 |
| Q15, Q16, Q23, Q39, Q52 UX/PWA/performance | 1,5,8,11 |
| Q19, Q68 gratuité/dons | 3,5,10 |
| Q20, Q29, Q56–Q66, Q69–Q70 architecture, CI, déploiement | 0,1,5,11 |
| Q25 signatures | 6 |
| Q26 dossiers | 7 |
| Q27 assistant à règles, sans LLM | 9 |
| Q67 support | 5,10 |

## 3. Jeux de tests transversaux à maintenir

### Données fictives et fixtures
- Profils fictifs FR et AR avec champs manquants, noms doubles, diacritiques arabes, chiffres, adresses Tunisie/étranger, personnes multiples ; jamais de CIN ou passeport réels dans les tests.
- Catalogue de test couvrant lettre simple, formulaire officialisé par source, document sans traduction AR, traduction bilingue asymétrique, contrat multipage et tableau à répétition.
- Fichiers malformés, image énorme, faux MIME, PDF chiffré, ZIP traversal, fichier en double, source externe lente/non autorisée.

### Tests de sécurité obligatoires
- Accès horizontal (deux utilisateurs), vertical (modérateur/admin), liens de partage expirés, invitation de signature révoquée, sessions expirées ; enregistrement de chaque refus sans contenu privé.
- Fuzz de schéma de formulaire, HTML/script dans les champs et sources, SSRF via collecteur, code arbitraire dans les règles, rate limiting et sessions MFA.
- Indexation : s'assurer que l'index, sitemap, cache PWA public, métadonnées OG et analytics ne contiennent jamais de documents privés ni de PII.

### Tests d'export obligatoires
- PDF arabe RTL, paragraphes mixtes (CIN/URL/texte arabe), chiffres, accents, tables, saut de page, cachet/signature et DOCX ouvert dans au moins deux lecteurs pertinents.
- Comparaison de contenu exact entre rendu affiché, PDF et DOCX, avec exceptions de présentation documentées ; export refusé si champ requis non rempli.

### Tests de résilience obligatoires
- MariaDB redémarrée, Meilisearch indisponible, crash worker, email SMTP rejeté, disque presque plein, backup interrompu, effacement local du navigateur, conflits de synchronisation.
- Reprise d'un job exactement une fois en termes d'effets métier (idempotence), même si la livraison/traitement physique est `at least once`.

## 4. Validation, seuils et décision de mise en production

La première publication ne doit être autorisée que si :
1. Domaine opérationnel, HTTPS, SMTP vérifié, textes juridiques applicables validés, sources et droits sur les modèles initiaux vérifiés.
2. Compte, profils, catalogue, formulaires et PDF/DOCX testés sur parcours réels.
3. Contrôles d'accès/ACL, import sécurisé, journal de sécurité, sauvegarde externe testée, supervision et restauration démontrée.
4. Aucune fonctionnalité non terminée n'est affichée comme disponible ; feature flags sur modules futurs.
5. Le VPS existant dispose d'une marge CPU/RAM/disque mesurée pour la charge prévue avec les autres applications, sinon production reportée jusqu'à adaptation d'infrastructure approuvée.
6. Un responsable humain approuve explicitement le lancement, les migrations et le rollback.

Les métriques de succès proposées, à instrumenter sans surcollecte : taux de génération réussie, erreurs d'export, temps de réponse du catalogue, recherches sans résultat (après minimisation), taux de formulaires abandonnés agrégé, nombre de modèles vérifiés, âge des sources, backlog de modération, utilisation de disque et délais de jobs. Aucun objectif numérique arbitraire de taux d'usage n'est imposé sans mesure initiale.

## 5. Documentation à livrer avec le code (ultérieurement)

- `README.md` (installation et démarrage), `docs/architecture.md`, `docs/adr/*.md`, `docs/api/openapi.yaml`, modèle de données, versions de schémas.
- Guide de l'éditeur no-code, import/export, types de modèles, règles de validation, règles de publication, métadonnées des sources et documentation des limitations juridiques.
- Guide Admin modération, surveillance, mise à jour des sources, changements de versions, traductions, confidentialité et purges.
- Runbooks : déploiement, reprise après échec de job, index reconstruit, rollover de clés, sauvegarde/restauration, incident de sécurité, domaine/SMTP, mise à jour Docker, migration vers autre VPS.
- Matrice Q1–Q70 avec statut réel, tests associés, captures FR/AR et rapports de qualité PDF/DOCX.

## 6. Registre des décisions restant à trancher avant les modules concernés

**Décisions produit ou fournisseurs explicitement non définies :** nom et domaine (Q38/Q62), SMTP (Q63), destination externe de sauvegarde (Q64), valeur finale de certains seuils par type d'upload, expiration des liens et nombre maximum de signataires, relation juridique précise à la Tunisie et aux pays où résident les utilisateurs. Le périmètre « tous les pays » ne garantit pas la présence des mêmes démarches consulaires partout : la base doit documenter les exceptions.

**Décisions internes techniques recommandées après POC :** ORM et migrations, bibliothèque auth, éditeur riche, générateur PDF/DOCX, implémentation de queue MariaDB et scanner de fichiers compatibles RAM. Les arbitrages doivent être documentés, vérifiables et réversibles autant que possible.

**Risque principal d'exploitation :** le VPS partagé de 2 vCPU/4 Go peut ne pas supporter Meilisearch + conversion + OCR + autres applications simultanément. POC et limitations de concurrence avant engagement. La gratuité du service **n'implique pas** l'absence de frais d'infrastructure ni la disponibilité gratuite de chaque service externe.

## 7. Conditions de préparation du prompt final à l'agent IA

Lorsque le porteur du projet approuve ces trois documents, le prompt final devra :
- joindre ou pointer vers les trois fichiers versionnés ;
- rappeler que Q1–Q70 sont contractuels avec exceptions Q35=C et Q39=B, et Q32 SMTP simple sans LLM ;
- exiger ADR pour les décisions non approuvées ;
- interdire modifications d'autres applications du VPS et déploiement sans validation ;
- ordonner l'exécution selon les jalons, avec PR, tests, captures, rapports et demandes d'autorisation aux gates ;
- exiger recoupement des sources officielles, contrôle juridique des documents, et aucun contenu inventé ;
- proscrire tout contournement des droits d'accès, de protection des données et de licences ;
- préciser que toutes les fonctions approuvées doivent être développées dans la cible finale, tout en rendant chaque phase exploitable.

**État final actuel :** cahier des charges + architecture + plan rédigés pour revue. **Aucun code applicatif, dépôt ou déploiement n'a été créé.**
