# Sauvegardes chiffrées et restauration isolée

Les outils locaux créent une sauvegarde de MariaDB et des objets chiffrés persistants de `STORAGE_ROOT`, puis vérifient une restauration dans un répertoire isolé. Ils ne sauvegardent aucune autre application du VPS. Aucun fournisseur hors site n’est choisi par le code. Une sauvegarde locale seule ne satisfait pas l’exigence de sauvegarde externe Q64.

## Préparation

- Installer un client `mariadb-dump` compatible avec le serveur et vérifier les droits du compte de sauvegarde. Le programme demande une transaction cohérente, les triggers, routines et événements ; il échoue si les droits ou l’outil manquent.
- Définir `DATABASE_URL`, `STORAGE_ROOT` et une **nouvelle clé indépendante** `BACKUP_ENCRYPTION_KEY`, encodée en Base64 et décodant exactement 32 octets. Ne pas réutiliser une clé applicative. Générer et conserver cette clé dans le gestionnaire de secrets retenu, sans la mettre en argument CLI, dans Git ou dans un journal.
- Conserver séparément les clés applicatives versionnées nécessaires à la reprise (`PROFILE_ENCRYPTION_KEY_V1`, `DOCUMENT_ENCRYPTION_KEY_V1`, `ATTACHMENT_ENCRYPTION_KEY_V1`, `IDENTITY_ENCRYPTION_KEY_V1`, `PASSWORD_PEPPER`), la configuration et les versions du logiciel. Elles ne sont **pas** incluses dans l’archive. Les données chiffrées restaurées sont inutilisables sans les clés correspondantes.
- Prévoir l’espace pour le dump SQL temporaire en clair, l’archive chiffrée et, lors d’un test de restauration, une copie temporaire authentifiée puis les fichiers extraits. Utiliser un répertoire temporaire sur volume chiffré ou tmpfs adapté ; les fichiers temporaires sont créés en `0600` dans un répertoire privé `0700` puis supprimés. Une suppression ordinaire n’est pas un effacement physique garanti sur SSD.
- Choisir avec le responsable les objectifs RPO/RTO, la fréquence, la destination externe, les accès et la rétention. Aucun objectif ou stockage distant fictif n’est annoncé comme opérationnel.

## Créer une sauvegarde

Mettre l’application en maintenance et arrêter **les écritures de TnDocs et ses workers**, sans interrompre les applications tierces du VPS. `--quiesced` est l’attestation de l’opérateur que cette étape est faite ; le programme ne l’exécute pas à sa place. La transaction du dump seule ne synchronise pas une suppression de fichier avec la base : la suspension des écritures est nécessaire pour une sauvegarde cohérente base/fichiers.

Avec l’environnement secret déjà chargé :

```sh
npm run backup -- --output /chemin/prive/tndocs-2026-10-29.tndocs --quiesced
```

Le nom de destination doit être absent. Le programme crée le fichier en `0600`, ne remplace jamais une sauvegarde existante et publie le résultat seulement après succès. Il affiche un statut, le chemin choisi et le nombre de fichiers, sans données privées ni secrets. Réactiver les écritures après la fin du dump et de la création de l’archive, ou après diagnostic de l’échec.

Le dump reçoit ses paramètres dans un fichier MariaDB temporaire privé ; son mot de passe ne figure pas dans les arguments du processus ou les erreurs affichées. Le dump contient les schémas et données, y compris les migrations ; Meilisearch est reconstruit depuis les contenus publiés et ne constitue pas une sauvegarde métier.

L’archive inclut `database.sql`, les objets `storage/**/*.enc` et `manifest.json`. Elle exclut liens symboliques, fichiers temporaires et autres fichiers hors du volume d’objets. Les originaux ne sont ni supprimés ni modifiés. Le manifeste contient date, chemins relatifs, tailles et SHA-256 ; il reste à l’intérieur de l’enveloppe chiffrée. Toute modification d’un fichier entre son inventaire et sa lecture fait échouer la sauvegarde.

Les limites par défaut sont 16 Gio d’archive, 4 Gio par fichier, 100 000 entrées et 32 Mio de manifeste. Elles sont des limites de protection de l’outil, pas des quotas utilisateurs. Pour un jeu plus volumineux, mesurer la capacité et fournir explicitement des limites adaptées :

```sh
npm run backup -- --output /chemin/prive/lot.tndocs --quiesced --max-bytes 34359738368 --max-file-bytes 8589934592
```

## Copier hors du VPS

Configurer une commande **choisie par l’opérateur**, représentée par un tableau JSON dans `BACKUP_OFFSITE_COMMAND`. Chaque `{backup}` sera remplacé par le chemin de l’archive ; le programme lance directement l’exécutable, sans shell. Conserver les identifiants du fournisseur dans son mécanisme habituel de secrets, jamais dans les arguments ou la commande enregistrée.

Une copie n’est demandée qu’avec l’option explicite suivante :

```sh
npm run backup -- --output /chemin/prive/lot.tndocs --quiesced --upload
```

Sans configuration, cette option échoue. Le code ne choisit ni prestataire, ni bucket, ni compte externe. Un retour réussi de la commande prouve seulement que cette commande s’est terminée : il ne prouve ni durabilité hors site ni restauration. Les sorties de la commande ne sont pas recopiées dans les journaux.

Configurer la planification et l’alerte sur les échecs dans l’outil d’exploitation retenu. Documenter la destination réelle, vérifier la présence distante, télécharger un exemplaire puis le restaurer isolément. Ne déclarer la sauvegarde externe opérationnelle qu’après cette preuve.

## Restaurer et vérifier sans toucher à une base existante

Fournir la clé indépendante dans l’environnement. La destination doit être nouvelle ou vide et ne doit pas être un lien symbolique :

```sh
npm run backup:restore -- --input /chemin/prive/lot.tndocs --destination /chemin/isole/recette-restauration
```

La restauration vérifie AES-256-GCM complètement dans un fichier temporaire privé **avant toute extraction**. Une mauvaise clé ou une modification de l’archive ne publie aucun fichier dans la destination. Le décodeur contrôle les limites, doublons, types d’entrées, chemins relatifs, tailles et SHA-256, puis vérifie que le manifeste correspond exactement aux fichiers. Ce format borné n’a aucune entrée de type lien symbolique, lien physique ou exécutable. Les chemins absolus, `..`, séparateurs Windows et entrées inconnues sont refusés. Le résultat est publié uniquement après vérification complète.

**Aucune commande SQL n’est exécutée par cet outil de restauration.** Il écrit le dump et les objets dans le répertoire isolé ; il n’importe jamais une base de production et n’écrase aucun stockage applicatif existant.

Pour terminer une recette de reprise :

1. Créer une instance MariaDB isolée et vierge, hors production, et un compte adapté. L’import manuel du dump contient `CREATE DATABASE`/`USE` : l’examiner et vérifier que la cible est réellement isolée avant toute exécution.
2. Importer le dump uniquement dans cette instance, puis comparer migrations, nombres de lignes et contraintes. Configurer une instance applicative isolée avec les clés versionnées conservées séparément et le sous-répertoire `storage/` restauré.
3. Tester un compte fictif, les permissions négatives entre deux utilisateurs, le déchiffrement des profils/documents/pièces et un export FR/AR. Reconstruire Meilisearch depuis le catalogue publié.
4. Traiter les jobs avec baux expirés selon le runbook, révoquer les sessions qui ne doivent pas être restaurées et appliquer le registre des demandes d’effacement postérieures au point de sauvegarde. Éviter les emails et push réels pendant cette recette.
5. Consigner date, origine du lot téléchargé, versions, contrôles, durée réelle et résultat. Nettoyer l’environnement de recette après accord.

La recette automatisée `tests/backup.test.ts` utilise exclusivement un dump et des objets **fictifs**. Elle prouve chiffrement, restauration locale exacte, refus de clé incorrecte/altération, protection contre traversal/liens et limites ; elle ne prouve pas la restauration d’un serveur MariaDB réel, la disponibilité d’une destination hors site ou les délais RPO/RTO de production.

## Conservation et droits d’effacement

Choisir et documenter la rétention de chaque lot, y compris la copie externe et l’escrow des clés. Les archives ne sont pas réécrites individuellement pour chaque suppression de compte : conserver un registre minimal des demandes d’effacement et le réappliquer lors de toute restauration avant remise en service. L’expiration et la suppression des lots, la rotation des clés et la perte d’une clé doivent faire partie de la procédure opérateur validée.
