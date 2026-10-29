# ADR-0005: Catalogue versionné et barrières de publication

## Décision
Les traductions, schémas, catégories et sources sont attachés à une version immuable. Un modèle publié pointe vers sa version active; une nouvelle version ne modifie pas le rendu publié. Les routes publiques ne renvoient que les modèles au statut `published`, et la dépublication retire immédiatement ce pointeur. La publication exige une traduction revue, du contenu quand le type l'exige et une source officielle vérifiée avec les droits de réutilisation résolus.

Les rôles `user`, `moderator` et `admin` sont stockés sur le compte. Les modérateurs peuvent créer des brouillons; seuls les administrateurs peuvent publier ou dépublier. Le premier administrateur est promu par la commande locale `npm run admin:promote` après confirmation de son compte email.

## Conséquences
Les sources interdites ou dont les droits restent à confirmer bloquent la publication. Les originaux officiels restent des liens vers la source; l'application ne les recomposera pas. La synchronisation Meilisearch et un historique d'audit admin restent à ajouter.
