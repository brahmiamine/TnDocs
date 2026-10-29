# Cahier des charges fonctionnel — Plateforme tunisienne de documents

**Version :** 1.0 — 29 octobre 2026  
**État :** spécification de conception soumise à validation, aucun développement autorisé  
**Produit :** nom commercial non choisi ; titre provisoire « Plateforme de documents tunisiens »  
**Langues de l'interface :** français (`fr`) et arabe (`ar`), avec RTL.  
**Périmètre :** démarches en Tunisie et démarches tunisiennes/consulaires pour Tunisiens résidant dans **tous les pays**, sans priorité géographique. Le projet **n'inclut pas** de catalogue autonome de démarches administratives étrangères (titres de séjour français, etc.).

> **Hiérarchie normative :** les 70 décisions de l'utilisateur sont des exigences approuvées. Les éléments marqués **RECOMMANDATION TECHNIQUE**, **SEUIL PROPOSÉ** ou **POINT À VALIDER** sont des choix d'implémentation à confirmer avant leur exécution. Aucun contenu n'est une garantie juridique ou la validation d'un formulaire officiel par une administration.

## 1. Finalité, promesse et principes

Une personne doit pouvoir trouver un document par son nom ou par son besoin en FR/AR, comprendre à quoi il sert, consulter la source officielle le cas échéant, se connecter pour le personnaliser, remplir un formulaire guidé prérempli depuis un ou plusieurs profils autorisés, corriger librement le texte lorsque le modèle le permet, prévisualiser, imprimer ou télécharger PDF/DOCX, puis retrouver toutes les versions dans son espace. Elle peut préparer un dossier complet, partager des pièces ou demander une signature en protégeant ses informations.

Principes :
1. **Gratuit pour tous** : pas de paywall, de limitation de téléchargement payante ni d'abonnement. Dons facultatifs par lien externe et partenariats identifiés.
2. **Catalogue public, données privées** : exploration anonyme ; authentification obligatoire avant premier brouillon, édition personnelle, téléchargement ou envoi de signature. Les formulaires officiels librement téléchargeables sur le site source peuvent rester accessibles par lien public vers l'émetteur.
3. **Exactitude et traçabilité** : distinguer « modèle de la plateforme », « formulaire officiel », « fiche informative ». L'appellation « officiel » n'est attribuée qu'aux documents effectivement émis par une autorité identifiée, non aux traductions/réécritures privées.
4. **FR et AR de première classe** : pas de traduction automatique publiée sans validation ; un modèle peut exister dans une seule langue et son statut de traduction est explicite.
5. **Privacy by design** : minimisation, chiffrement approprié, accès cloisonnés, profils familiaux avec autorisation, statistiques agrégées. Pas d'accès libre aux documents privés par l'administration.
6. **Pas de LLM/API IA au lancement** : parcours à règles et moteur lexical/intentionnel, extraction/OCR technique sans génération conversationnelle probabiliste. Architecture extensible, connecteur IA désactivé.
7. **Développement intégral par phases** : une ouverture publique est possible après les fonctions essentielles vérifiées ; les fonctions avancées restent dans le périmètre final.

## 2. Acteurs et périmètres d'accès

| Acteur | Droits et limites |
|---|---|
| Visiteur | Parcourir catalogue, fiches, guides, FAQ, sources, consulter les présentations publiques, rechercher ; connexion exigée pour personnaliser ou télécharger un document généré |
| Utilisateur | Documents, modèles privés, profils multiples autorisés, dossiers, signatures, partages, notifications, export/suppression de ses données, contribution au catalogue |
| Invité de signature | Accès étroit à un document/version à signer après vérification email, sans compte obligatoire ; pas d'accès aux autres documents ni profils |
| Modérateur | Traiter propositions, signalements et modifications de contenus publics, sans consulter les documents privés des utilisateurs |
| Administrateur | Gestion du catalogue, des publications, utilisateurs/rôles, configuration, métriques, audits, sauvegardes et veille ; pas de lecture générale du contenu privé |
| Service worker / job | Comptes et capacités techniques minimales, accès limité aux ressources indispensables, opérations journalisées |

Les utilisateurs mineurs ne disposent pas d'un parcours de compte autonome prévu initialement ; un adulte autorisé peut gérer leur profil. Aucun compte multi-organisation ni espace d'équipe dans le premier périmètre ; les partages entre particuliers suffisent.

## 3. Cartographie détaillée des fonctionnalités

### F01 — Catalogue, navigation et présentation publique
- Catégories, sous-catégories, administrations, démarches, publics, étiquettes, pays de résidence, types de documents, variantes linguistiques, pièces requises et liens associés. Un modèle peut apparaître sous plusieurs entrées sans doublon métier.
- Parcours « Je veux… » : arrêter un abonnement, faire une procuration, renouveler un passeport tunisien depuis l'étranger, déclarer une perte, demander une attestation, etc.
- Page document avec titre FR/AR, résumé, objectif, organisme, portée géographique, restrictions, éléments à réunir, étapes vérifiées, éventuels frais/délais **sourcés**, dernière vérification, avertissements, documents similaires, historique de version publique et liens officiels.
- Sitemaps et URLs localisées `/fr/...`, `/ar/...`, hreflang, metadata, pages catégories/organismes/démarches, guides et FAQ ; exclure les comptes, recherches personnelles, brouillons et partages privés de l'indexation.
- Catalogue cible sans limite numérique arbitraire ; inventaire initial transversal, **ordre de vérification/publication privilégié** : résiliations, procurations, déclarations, réclamations, emploi, logement. Les autres catégories sont inventoriées en parallèle.

### F02 — Recherche FR/AR avec intentions déterministes
- Recherche de titre, synonymes, variantes lexicales, translittérations courantes si une liste éditoriale existe, catégories, descriptions et organismes, indépendamment de la langue de l'interface.
- Tolérance aux fautes, saisie partielle, autocomplétion, facettes multiples, suggestions, classement par pertinence et documents similaires.
- « Je veux arrêter mon abonnement Internet » ou « نحب نفسخ اشتراك » : reconnaissance par règles, alias et vocabulaire géré depuis le back-office ; pas de promesse de compréhension universelle de toutes les formulations.
- Recherche sans résultat : recommander correction de filtre, synonymes, catégories proches, formulaire de suggestion ; enregistrer des statistiques minimisées **sans sauvegarder les données personnelles pouvant se trouver dans des requêtes brutes**.
- Index construit depuis les seuls contenus publiés ; réindexation idempotente, dépublication immédiate visible, récupération après panne de l'index.

### F03 — Authentification et compte
- Email/mot de passe, vérification email, récupération, magic link, connexion Google OAuth ; deux facteurs TOTP pour comptes sensibles (obligatoire admin/modérateur en production, recommandé/optionnel utilisateur), codes de secours, gestion des sessions et appareils.
- Journal de sécurité, révocation, limitation des tentatives, suspension et déblocage contrôlés, sessions HttpOnly/SameSite, CSRF pour les flux concernés, changement d'email confirmé.
- SMTP simple : hôte, port, TLS, adresse émettrice, identifiant email et mot de passe/app password ; aucun fournisseur multiple ni infrastructure d'IA demandés. Gestion d'échec des emails et réessais de tâches autorisée.
- Les permissions sont vérifiées **côté serveur**, et non seulement en masquant l'interface.

### F04 — Profils personnels multi-personnes
- Profil principal : nom, prénom, nom arabe/latin le cas échéant, naissance, nationalité, coordonnées, adresses Tunisie/étranger, profession, situation familiale, champs CIN/passeport facultatifs ; permettre champs personnalisés.
- Profils de conjoint, enfant, parents ou proches **uniquement avec autorisation ou autre base légitime appropriée** ; relation, détenteur/autorité, date de dernière mise à jour, retrait et effacement.
- Choix d'un profil par rôle du formulaire (mandant/mandataire/bénéficiaire...) ; préremplissage explicite, possibilité de corriger sans modifier le profil de référence.
- Masquage des données sensibles, affichage limité, chiffrement des champs sensibles, pas d'auto-remplissage dans un contexte public/partage non autorisé.

### F05 — Moteur no-code de formulaires
- Bibliothèque de champs : texte, texte long, nombre, montant, devise, date, lieu, adresse, téléphone, email, identifiants administratifs, select, radio, multi-select, case, profils, fichiers, listes et sections répétables.
- Schéma versionné avec labels/messages/options FR/AR ; validations, champs requis/conditionnels, groupes par étapes, répétitions, logique simple conditionnelle, variables calculées (sans exécution de JavaScript arbitraire).
- Builder visuel pour administrateurs : glisser-déposer, association champ → variable documentaire, test de formule, échantillons fictifs, prévisualisation mobile/desktop et publication versionnée.
- La modification d'un modèle **n'altère pas silencieusement** un brouillon créé sur la version précédente. Proposition explicite de migration ou maintien de l'ancienne version.
- Règles de validation (CIN, numéro contractuel...) fondées sur sources fiables ou paramétrées par modèle : ne jamais inventer une règle universelle pour tous les formats.

### F06 — Éditeur documentaire et génération
- Démarrer un nouveau document depuis un modèle publié ; authentification préalable ; créer automatiquement un brouillon dès que l'édition authentifiée commence ; sauvegarder régulièrement à chaque modification et après reconnexion.
- Formulaire intelligent → aperçu temps réel → édition libre du texte pour **modèles éditables**. Éditeur riche maîtrisé (paragraphes, listes, styles, tableaux autorisés, variables, pagination indicative) avec prévention XSS et sanitisation.
- Formats : PDF A4 prêt à imprimer, DOCX modifiable, impression navigateur. FR, AR, ou bilingue (deux colonnes ou blocs successifs lorsque disponibles et validés).
- Respect RTL/LTR, polices embarquées/licenciées, chiffres, noms et dates ; rendre les styles dans PDF/DOCX, vérifier coupures de lignes/pages ; DOCX peut présenter des différences selon les logiciels, à tester.
- Formulaires officiels : conserver le fichier d'origine, remplir les champs AcroForm si présents et autorisés, ou guider/renvoyer vers la source. Ne pas recomposer un original sous la mention « officiel » si cela pourrait altérer son authenticité.
- Génération serveur via jobs isolés, avec statuts `queued/running/succeeded/failed/cancelled`, idempotence, téléchargement contrôlé, suivi d'erreur et régénération.

### F07 — Mes documents, modèles privés et versions
- Tableau de bord : brouillons, finalisés, archivés, corbeille, favoris, dossiers personnalisés, recherche/tri/filtres, duplication, renommage et export.
- Versions immuables et datées avec comparaison/restauration ; version finalisée verrouillable, restauration = nouvelle version et non modification du passé.
- Création d'un modèle privé à partir de zéro ou d'un document éditable, champs réutilisables, propositions au catalogue public sans données préremplies ni signature.
- Contributions : demande de nouveau modèle, dépôt de proposition, suivi des statuts, commentaires de modération ; attribution publique facultative et revue avant publication.

### F08 — Partage, signatures et invitations
- Partage privé nominatif, permissions `view/copy/edit` indépendantes, expiration et révocation ; aucun contenu personnel dans les cartes OG, les notifications ou les journaux.
- Dessin/import signature, cachets personnels/professionnels dont l'utilisateur dispose légitimement, emplacements dynamiques ; réutilisation facultative confirmée et protégée.
- Multi-signataires invités par email, vérification du destinataire, suivi `invited/viewed/signed/declined/expired/revoked`, piste d'audit technique, signature liée au hash de la version figée ; ne jamais modifier une version signée.
- L'insertion d'une image de signature n'est pas présentée comme une signature électronique qualifiée ; intégration future à un prestataire certifié prévue mais inactive.

### F09 — Dossiers administratifs et pièces justificatives
- Dossiers contenant documents générés, justificatifs importés, checklist basée sur démarche/situation, état par pièce (`missing/added/reviewed/expired_if_applicable`).
- Scan mobile avec appareil photo, recadrage/correction et conversion PDF ; OCR local facultatif et explicitement déclenché. Aucune collecte biométrique/identification automatique.
- Réutilisation autorisée des pièces privées, sans créer des copies inutiles ; sécurité des uploads, prévisualisation, export ZIP ou assemblage des seuls PDF compatibles, couverture/sommaire facultatifs, partage sécurisé.
- Ne jamais certifier « dossier accepté » : la plateforme peut dire « pièces renseignées selon la checklist vérifiée à telle date ».

### F10 — Assistant de démarches sans modèle IA
- Parcours à arbre de décision FR/AR, conditions géographiques et situationnelles, recommandations explicables et sourcées ; questions contextuelles, retour arrière, choix « je ne sais pas ».
- Moteur d'intention lexical (mots-clés/synonymes) pour router vers parcours ; pas de chat génératif de modèle IA ni promesse de conseil juridique personnalisé.
- Confirmation explicite avant création de brouillon ou accès aux données de profils ; échec de correspondance → liste de démarches et contact/suggestion.
- Structure de connecteur d'IA future possible mais **désactivée**, non appelée et sans collecte de données externe.

### F11 — Base de connaissances réglementaires
- Versionner par démarche/autorité/pays de résidence : conditions, pièces, coûts, délais, lieux, formalités, exceptions, base documentaire, source exacte, date de consultation, date de vérification, réviseur.
- « Non vérifié » ou « information inconnue » quand aucune source fiable ; ne pas afficher de frais/délais inventés. Différences consulaires rattachées au consulat/service compétent, pas à des règles supposées universelles.
- Historique de publication, alerte de source changée, revue humaine avant modification publique. Les recommandations et checklists consomment seulement les règles publiées/validées.

### F12 — Veille et importation documentaire
- Registre `Source` pour SICAD, ministères, CNSS, consulats, etc. Collecteurs spécifiques sur liste approuvée, vérification hebdomadaire par défaut, fréquence administrable, délais/requêtes limités et respect des conditions d'accès/réutilisation.
- Détection des nouveautés par URL canonique, identifiants officiels, hash de fichier et comparaison de texte ; import PDF/DOCX et métadonnées lorsque permis ; OCR local facultatif pour scans ; classement suggéré **par règles**, doublons et variantes FR/AR signalés.
- File de revue « découvert → importé → analysé → à vérifier → validé → publié / rejeté ». Jamais de publication automatique ni de remplacement silencieux d'original officiel.
- Si récupération interdite ou techniquement impossible, ne garder qu'un lien officiel et la description autorisée ; suivi des erreurs et indicateurs de fraîcheur.

### F13 — Administration et modération
- Back-office sécurisé FR/AR : utilisateurs et rôles, catégories/organismes, modèle/formulaire/contenu, traduction, validation, publication, contributions, demandes, signalements et fichiers importés.
- Dashboards agrégés : trafic public, recherches sans résultat filtrées, nombre de documents publiés, erreurs d'export, état des collecteurs, échecs de jobs et capacité disque.
- Configuration des quotas, politiques de conservation, sources/collecteurs, feature flags, SEO public, textes juridiques, préférences de notifications, politiques de sécurité et intégrations.
- Journal d'audit technique/administratif sans stockage des CIN ni du corps des documents privés ; support des demandes de suppression/extraction.

### F14 — Notifications et assistance
- Centre de notifications, email SMTP FR/AR, push PWA avec consentement explicite, préférences par catégorie/canal, historique, refus/retrait, rappels facultatifs.
- Vérifications essentielles de sécurité par email indépendantes des préférences marketing ; pas de message contenant le texte d'un document ou des données d'identité.
- Assistance via formulaire contact / requête suivie dans le back-office ; aucune obligation de messagerie temps réel ou de centre de tickets séparé.

### F15 — PWA, offline et multi-appareils
- Manifest, icônes, installation et expérience mobile-first ; présentation sans réseau de pages déjà mises en cache.
- Offline : édition des brouillons **autorisés explicitement** dans une base locale protégée, déverrouillée par secret utilisateur, synchronisation à la reconnexion. Le cache n'est pas une sauvegarde définitive et peut être supprimé par le navigateur.
- Contrôle de versions optimiste (révision/ETag), conflit si modification distante : proposer conservation de version serveur, version locale ou duplication, sans écrasement automatique.
- Déconnexion/suppression de compte : purge locale sur demande ; mode invité/profil tiers exclu par défaut du cache sensible.
- Les push sur iOS exigent les conditions du navigateur/OS et notamment l'installation sur l'écran d'accueil ; alternative centre de notifications/email.

### F16 — Conformité, SEO, fonctionnement gratuit et qualité
- Pages publiques : mentions légales, CGU, confidentialité, cookies, avertissement de non-affiliation aux organismes publics, attribution sources et droits d'auteur, politique de retrait, textes FR/AR administrables/versionnés.
- Consentements applicables, export et effacement des données, registre technique de demandes, politiques de rétention et effacement des sauvegardes selon cycle documenté ; revue juridique externe préalable à publication si nécessaire.
- SEO mobile-first et WCAG 2.2 AA comme **cible**, monitoring LCP/INP/CLS, jeux de tests FR/AR RTL, appareils modestes, navigateur récent, clavier/lecteur d'écran.
- Dons par lien externe uniquement, aucun paiement utilisateur intégré ; partenariats clairement identifiés et séparés de la neutralité des sources.

## 4. Parcours utilisateurs détaillés et critères d'acceptation

### P1. Chercher et produire une lettre
1. Visiteur saisit « résiliation STEG » ou synonyme arabe ; obtient une liste avec fiches publiques pertinentes.
2. Ouvre une fiche, consulte statut documentaire, source, conditions et variantes disponibles.
3. Clique « Personnaliser » : s'il n'est pas connecté, authentification puis retour exact à la fiche. Aucun brouillon privé n'est créé pour un visiteur anonyme.
4. Sélectionne le profil principal, complète les champs, reçoit les erreurs à côté des champs, voit l'aperçu à jour et peut corriger le texte si éditable.
5. Quitte/revient : brouillon présent, aucun champ perdu ; télécharge PDF/DOCX et peut imprimer ; l'activité reste privée.
**Acceptation :** FR/AR fonctionne sur smartphone ; les fichiers sont ouvrables ; la connexion n'ouvre pas de document étranger ; les erreurs de génération sont explicites et rejouables.

### P2. Procuration pour proche depuis l'étranger
1. Sélectionne « Tunisiens à l'étranger », pays de résidence libre, démarche consulaire pertinente, sans présumer les mêmes règles pour chaque pays.
2. Choisit son profil et un profil tiers autorisé, complète les données du mandataire/objet.
3. Lit les formalités sourcées et les réserves légales ; génère la procuration FR, AR ou bilingue si les textes sont disponibles et vérifiés.
4. Envoie une invitation de signature ; le destinataire vérifie son email, voit uniquement la version autorisée, signe/refuse, et le système conserve le hash de la version signée.
**Acceptation :** sans texte AR validé, ne pas inventer une version arabe « officielle » ; une invitation révoquée ou expirée ne permet pas d'accès.

### P3. Constituer un dossier
1. Crée dossier depuis une démarche vérifiée ; checklist synchronisée sur la version des exigences ; préremplissage avec les profils autorisés.
2. Ajoute scan/photo/pdf, visualise statut des pièces, retire/actualise si nécessaire ; exporte archive ZIP avec manifeste ou fusion PDF admissible.
3. Partage de façon nominative et révocable si requis.
**Acceptation :** pièces malveillantes rejetées ; une pièce source supprimée ou révoquée n'apparaît plus dans les nouveaux exports ; aucun traitement ne valide le dossier au nom de l'administration.

### P4. Modération et veille
1. Collecteur vérifie une source officielle approuvée et détecte un hash inédit/une modification.
2. Crée une fiche de découverte non publique, avec référence et comparaison ; signale doublons ou contraintes de réutilisation.
3. Modérateur vérifie le contenu ; administrateur valide la version documentaire et la traduction ; contrôles automatiques passent ; publication et indexation déclenchées.
**Acceptation :** échec des tests critiques bloque publication ; une dépublication enlève la fiche publique de la recherche et du sitemap ; anciens brouillons restent accessibles sur leurs anciennes versions.

### P5. Offline et conflit
1. Utilisateur autorise explicitement le cache local sur un appareil de confiance, déverrouille son espace local, modifie un brouillon hors ligne.
2. Le document est également modifié depuis un autre appareil connecté.
3. À la reconnexion, contrôle de révision détecte le conflit et propose comparaison/copie/choix, sans écraser l'une des versions.
**Acceptation :** pas de perte de texte, aucun mélange de comptes, après effacement du cache les données serveur restent intactes ; un navigateur peut effacer le stockage local et l'app l'explique.

## 5. États de gestion et règles transversales

**Template (source de référence)** : `discovered → imported → draft → in_review → approved → published → superseded|unpublished|rejected`. Une nouvelle version est une nouvelle entité immuable ; publication par transaction et déclenchement d'indexation.

**Document utilisateur** : `draft → finalized → archived|trashed → purged`. Une finalisation fige une révision, pas le document entier ; duplication et restauration créent de nouveaux enregistrements/versionnements.

**Contribution** : `submitted → triaged → revision_requested|accepted|rejected`; si acceptée, le modèle passe encore par QA et validation avant publication.

**Job** : `pending → leased → done|retrying|dead|cancelled`, avec tentative bornée, backoff, déduplication et supervision.

**Purge/corbeille** : corbeille restaurable 30 jours ; suppression logique pendant la période, purge définitive ensuite ; suppression sur exercice de droit traitée dans le délai légal applicable. Les sauvegardes suivent une rétention distincte et ne sont pas individuellement modifiées, avec stratégie de suppression à restauration.

**Stockage** : quota initial recommandé/validé 100 Mo par compte, administrable ; documents et modèles conservés jusqu'à suppression par utilisateur sous réserve des obligations applicables. Les limites de taille d'upload par type et d'expiration des invitations devront être déterminées avant programmation des modules concernés (voir registre des paramètres en architecture).

## 6. UX/UI et identité

- Inspirée du drapeau tunisien : **rouge tunisien** et **blanc** comme couleurs de marque, soutenus par neutres chaleureux et gris anthracite ; le rouge ne doit pas envahir les grandes surfaces ni diminuer les contrastes. Les valeurs HEX exactes sont à valider par charte avant design final ; aucun logo officiel tunisien repris sans autorisation.
- Écran d'accueil : recherche prioritaire, parcours « Je veux… », catégories, documents les plus utiles, choix FR/AR, indication de gratuité et de caractère non gouvernemental.
- Mobile : navigation inférieure ; desktop : barre latérale ; parcours étape par étape ; aperçu accessible ; retour de sauvegarde et statut de synchronisation ; dark/light/system ; réduction des animations, bons contrastes, cibles tactiles.
- RTL s'applique à toute l'interface, pas seulement au texte : navigation, alignements, étapes, formulaires, modales, icônes directionnelles ; noms et numéros LTR correctement isolés.
- Accessibilité : labels, erreurs descriptives, touches clavier, lecture d'écran, absence de dépendance à la couleur, zoom 200 %, focus visible ; objectif WCAG 2.2 AA contrôlé régulièrement.

## 7. Politique qualité et exigences non fonctionnelles

| Domaine | Cible/contrôle |
|---|---|
| Qualité visuelle | Comparaisons automatiques FR, AR, bilingue ; PDF/DOCX testés sur modèles de référence, tableaux longs et multi-pages |
| Performance Web | Cibles usuelles LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 au 75e percentile lorsque mesurables ; budgets CI décidés en phase 1 |
| Résilience | Jobs repris après arrêt worker ; idempotence pour imports, génération, emails, indexation ; restauration documentée |
| Recherche | Jeux de requêtes FR/AR, accent/hamza/forme arabe, fautes, synonymes ; mesurer précision des résultats avec cas connus |
| Sécurité | Contrôles alignés sur OWASP ASVS 5.0, validation serveur, séparation des permissions, antivirus/contrôle types uploads, rate limiting |
| Confidentialité | Tests multi-utilisateurs interdisant accès horizontal (IDOR/BOLA), pas d'indexation des documents privés, historique nettoyé |
| Continuité | Sauvegardes chiffrées hors VPS, test de restauration ; objectifs RPO/RTO à négocier selon ressources avant production |
| Compatibilité | Chrome/Firefox/Edge/Safari récents ; Android/iOS ; PWA selon limitations de chaque OS ; documents imprimables A4 |
| Exploitabilité | Logs structurés sans secrets ni données personnelles, alertes sur disque, jobs morts, erreurs, dégradations ; tableaux d'état |

## 8. Registre intégral des décisions utilisateur Q1–Q70

| Décisions | Choix approuvé |
|---|---|
| Q01 | B — Tunisie et Tunisiens à l’étranger |
| Q02 | B — Catalogue administré, contributions des utilisateurs modérées |
| Q03 | C — Formulaire prérempli + éditeur libre pour les modèles modifiables |
| Q04 | C — PDF, DOCX et impression directe |
| Q05 | C — Espace personnel, brouillons, historiques de versions, dossiers, favoris et duplication |
| Q06 | C — Profil multi-personnes autorisées pour préremplissage |
| Q07 | C — Recherche bilingue FR/AR, synonymes, tolérance aux fautes et intentions |
| Q08 | C — Catalogue multidimensionnel et parcours guidés, sources/documents associés |
| Q09 | C — Import documentaire, extraction, versions, validation, suivi obsolescence |
| Q10 | C — Authentification Google/email/magic link/2FA, rôles, permissions, audit, sessions |
| Q11 | C — Modèles personnels réutilisables, partage sécurisé et propositions modérées |
| Q12 | C — Back-office complet et analyses agrégées |
| Q13 | C — Notifications in-app, email et push PWA, rappels/préférences/historique |
| Q14 | C — Génération française, arabe et bilingue avec formulaire commun |
| Q15 | C — UX mobile-first hybride : catalogue, recherche, parcours, éditeur et aperçu |
| Q16 | C — PWA offline avec édition, synchronisation et gestion des conflits |
| Q17 | C — Confidentialité et sécurité complètes, privacy by design, sauvegardes |
| Q18 | C — SEO bilingue, FAQ, guides et liens sociaux publics |
| Q19 | D — Gratuité totale avec dons et partenariats facultatifs |
| Q20 | B — Architecture VPS OVH autonome, modulaire, Docker, CI/CD, stockage adaptable |
| Q21 | C — Quotas, rétention, archivage, corbeille et contrôle des imports |
| Q22 | C — Qualité documentaire, tests automatiques, RTL et validation humaine |
| Q23 | C — Accessibilité WCAG 2.2 AA, performances, compatibilité appareils |
| Q24 | C — Moteur no-code de formulaires, champs, mapping, conditions, versions et tests |
| Q25 | C — Signatures multiples, invitations, suivi, cachets, future e-signature reconnue |
| Q26 | C — Dossiers, checklists dynamiques, scan, partage et export PDF/ZIP |
| Q27 | C — Assistant de démarches intelligent à règles ; sans modèle IA au lancement |
| Q28 | C — Connaissances réglementaires sourcées, veille et validation humaine |
| Q29 | C — Développement intégral par phases contrôlées, tests et validation |
| Q30 | C — Catalogue aussi complet que possible, publication progressive vérifiée |
| Q31 | C — Veille et collecte documentaires automatisées, contrôles humains |
| Q32 | Réponse libre — SMTP simple email/mot de passe, sans modèle IA pour le moment |
| Q33 | B — Gestion juridique et confidentialité avancée, textes FR/AR |
| Q34 | Démarches tunisiennes et consulaires seulement (A) |
| Q35 | **Tous pays sans priorité particulière (C), exception explicite** |
| Q36 | Particuliers, étudiants, salariés et indépendants ; pas de comptes organisations (A) |
| Q37 | Profils d'enfants gérés par adultes autorisés (A) |
| Q38 | Proposer plusieurs noms plus tard ; aucun nom validé (A) |
| Q39 | **Identité visuelle inspirée des couleurs tunisiennes (B), exception explicite** |
| Q40 | Lettres, formulaires, déclarations, procurations, contrats types avec avertissements (A) |
| Q41 | Publier une seule langue disponible en marquant les traductions manquantes (A) |
| Q42 | Préserver originaux officiels ; remplissage seulement si autorisé/faisable (A) |
| Q43 | Vérification admin et expertise spécialisée pour documents sensibles (A) |
| Q44 | Extraction + OCR local facultatif + correction humaine (A) |
| Q45 | Veille hebdomadaire par défaut (A) |
| Q46 | Priorité résiliations, procurations, déclarations, réclamations, emploi, logement (A) |
| Q47 | Conserver source structurée + versions ; exports régénérés à la demande (A) |
| Q48 | Anciennes versions conservées, migration volontaire (A) |
| Q49 | Invités signataires vérifiés par email, sans compte obligatoire (A) |
| Q50 | Partage privé nominatif avec expiration (A) |
| Q51 | Signature réutilisable facultative sécurisée, confirmation avant utilisation (A) |
| Q52 | Hors ligne sensible chiffré, activé volontairement et déverrouillé par secret (A) |
| Q53 | Quota initial 100 Mo/compte, configurable (A) |
| Q54 | Conservation jusqu'à suppression, sauf obligations applicables (A) |
| Q55 | Corbeille 30 jours (A) |
| Q56 | Next.js monolithe modulaire full-stack (A) |
| Q57 | MariaDB (A) |
| Q58 | Meilisearch auto-hébergé en complément (B) |
| Q59 | Files de jobs persistantes MariaDB, pas Redis requis (A) |
| Q60 | Stockage local persistant avec adaptateur S3 ultérieur (A) |
| Q61 | VPS OVH existant partagé (A), sous réserve de mesure des ressources |
| Q62 | Domaine non encore choisi (C) |
| Q63 | Fournisseur SMTP à choisir (B) ; configuration simple |
| Q64 | Destination de sauvegarde hors site à choisir (B) |
| Q65 | Analytics internes respectueux de la vie privée (A) |
| Q66 | Nouveau dépôt GitHub privé (A) |
| Q67 | Formulaire de contact et suivi via back-office (A) |
| Q68 | Lien vers un service de dons externe ; aucun paiement intégré (A) |
| Q69 | Ouverture publique après fonctions essentielles validées, phases avancées ensuite (A) |
| Q70 | Développement sur branches et PR ; validation avant merge/production (A) |

## 9. Critères globaux de recette finale

1. Tout le catalogue, l'interface d'administration et les emails principaux sont localisés FR/AR avec RTL correct.
2. Les parcours P1 à P5 passent sur les navigateurs visés et un smartphone réel.
3. Aucun utilisateur ni administrateur ordinaire ne peut lire les données privées d'autrui ; les permissions sont testées négativement.
4. Un document d'une version de modèle donnée reste lisible/éditable même si un modèle neuf est publié.
5. Des PDF/DOCX FR, AR et bilingues sont lisibles, imprimables et vérifiés ; les documents officiels originaux sont préservés.
6. Une importation échouée, un email non envoyé, un job interrompu ou une panne de Meilisearch ne corrompt pas la base ni les documents.
7. Backups chiffrés hors site et restauration démontrée avant ouverture publique ; logs, santé système et guide d'exploitation disponibles.
8. Les sources officielles et traductions sont vérifiées ; les contenus obsolètes peuvent être dépubliés sans détruire les documents utilisateurs.
9. Les fonctionnalités avancées acceptées restent planifiées au-delà de l'ouverture initiale, avec jalons et tests.

## 10. Références normatives et documentaires

- Next.js, déploiement et auto-hébergement : https://nextjs.org/docs/app/guides/self-hosting
- Next.js, internationalisation : https://nextjs.org/docs/app/guides/internationalization
- OWASP Application Security Verification Standard 5.0 : https://asvs.owasp.org/
- OWASP, manipulation des fichiers : https://github.com/OWASP/ASVS/blob/master/5.0/en/0x14-V5-File-Handling.md
- RGPD, texte et application territoriale : https://www.cnil.fr/fr/reglement-europeen-protection-donnees et https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre1
- Protection des données en Tunisie, loi organique n° 2004-63 : https://legislation-securite.tn/latest-laws/loi-organique-n-2004-63-du-27-juillet-2004-portant-sur-la-protection-des-donnees-a-caractere-personnel/
- INPDP et transferts internationaux : https://www.inpdp.tn/bos.pdf
- PWA et offline : https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
- Notifications Web sur appareils Apple : https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

**Décision de phase suivante :** valider les spécifications fonctionnelles et techniques, puis rédiger le prompt d'exécution destiné à l'agent. Aucun code ni dépôt n'est créé par ces documents.
