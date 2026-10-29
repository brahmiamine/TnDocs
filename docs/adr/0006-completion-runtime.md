# ADR-0006 — Réalisation des modules complémentaires

Conserver le monolithe Next.js/Drizzle/MariaDB existant. Une file SQL transactionnelle joue aussi le rôle d'outbox : publication, emails et notifications ne dépendent pas d'un succès réseau immédiat. Les effets SMTP sont livrés au moins une fois avec Message-ID stable ; une garantie universelle d'email exactement une fois n'existe pas.

Le worker prend des baux temporaires avec jeton unique ; les mises à jour de résultat refusent les jetons anciens. Les exports sont réservés avant écriture, chiffrés hors public et nettoyés avec une file durable. Les rendus Chromium désactivent JavaScript, échouent sans binaire configuré et bloquent toute ressource réseau. Les PDF et Word utilisent le même AST contrôlé ; les tableaux/listes sont structurés, aucun HTML utilisateur n'est exécuté. Les signatures PDF sont placées sur la version figée ; Word ajoute une annexe de preuves et ne garantit pas une mise en page identique à chaque lecteur.

Le chiffrement local volontaire utilise WebCrypto et un secret distinct, clé en mémoire. Le shell public ne contient aucun brouillon ; les identifiants de récupération restent dans le fragment URL. Les conflits n'écrasent jamais silencieusement une version distante. Un navigateur peut effacer le cache, qui ne constitue pas une sauvegarde.

La collecte est désactivée par défaut. Chaque hôte HTTPS et chaque source doivent être approuvés ; adresses privées et redirections non conformes sont interdites. Aucune observation ne publie automatiquement du contenu. Le mode sans reproduction conserve uniquement les métadonnées autorisées.

Les traductions sont des snapshots de la même version publiée. L'absence d'une variante interdit la génération bilingue, sans texte inventé. Les anciens documents conservent leur version. Les paramètres inconnus de production (domaine, SMTP, destination de sauvegarde, validation juridique, capacité du VPS) restent explicitement à renseigner et ne déclenchent aucune mutation du VPS.
