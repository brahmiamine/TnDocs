# ADR-0003: Identité et sessions de la première version

## Statut
Acceptée pour le socle de phase 2.

## Contexte
Les comptes contiennent des données personnelles et les permissions doivent être contrôlées côté serveur. Aucun fournisseur d'authentification ni de SMTP n'est encore configuré.

## Décision
- Les comptes locaux utilisent un mot de passe dérivé avec scrypt, un sel aléatoire par compte et un pepper configurable hors code.
- L'adresse email est confirmée avant l'activation. Les jetons de vérification sont aléatoires, stockés sous forme d'empreinte SHA-256, à usage unique et expirent après 30 minutes.
- Les sessions opaques sont stockées en MariaDB sous forme d'empreinte, durent 30 jours et sont révoquées à la déconnexion. Le cookie est HttpOnly, SameSite Strict, Secure en production et sans attribut Domain.
- Les mutations d'authentification exigent une origine égale à `APP_URL`; les réponses de compte ne révèlent pas si une adresse est déjà inscrite.
- SMTP est une configuration unique; Mailpit est utilisé dans l'environnement local Compose.

## Conséquences
Cette première livraison ne couvre pas encore Google OAuth, magic links, récupération du mot de passe, TOTP, codes de secours ni export/effacement des données. Les mots de passe et sessions ne doivent pas apparaître dans les journaux. Le pepper doit être injecté depuis un gestionnaire de secrets en production.
