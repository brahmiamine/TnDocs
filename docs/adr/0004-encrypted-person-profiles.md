# ADR-0004: Chiffrement des profils personnels

## Statut
Acceptée pour la première implémentation des profils.

## Décision
Les champs personnels d'un profil sont sérialisés en JSON et chiffrés côté serveur avec AES-256-GCM. Le chiffrement authentifie aussi l'identifiant du propriétaire et du profil. MariaDB ne reçoit que le texte chiffré, le nonce, l'étiquette d'authentification et la version de clé. Les relations vers un proche exigent une attestation de consentement ou d'autorité légale dans la requête API.

## Conséquences
La clé est fournie hors dépôt dans `PROFILE_ENCRYPTION_KEY_V1` et doit contenir 32 octets encodés en Base64. Sans clé, les opérations de profils échouent fermées. La rotation de clés et l'export/effacement complet de compte devront être ajoutés avant production; supprimer un profil efface sa ligne chiffrée dans MariaDB.
