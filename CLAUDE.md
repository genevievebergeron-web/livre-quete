# Livre de Quêtes — instructions pour toute session Claude Code

## Règle absolue : PROJET-ETAT.md se met à jour TOUJOURS, peu importe le type de session

Que tu sois la routine nocturne autonome, une session interactive avec Gen, ou toute autre
invocation qui touche ce dépôt : dès qu'un morceau de travail est complété (une fonctionnalité
entière, un incrément d'un gros chantier, un correctif, une décision de conception actée),
**ajoute une entrée dans `PROJET-ETAT.md` avant de considérer le travail fini** — pas seulement
en fin de "routine", pas seulement quand quelqu'un le demande.

**Pourquoi** : plusieurs sessions (interactives et planifiées) travaillent sur ce projet à des
moments différents, souvent sans se voir l'une l'autre. `PROJET-ETAT.md` est la seule mémoire
partagée entre elles. Un incrément livré mais non documenté est un incrément qui n'existe pour
personne d'autre que la session qui vient de le faire — la prochaine session (ou Gen elle-même)
n'a aucun moyen de savoir que c'est fait, risque de le refaire, ou pire, de ne jamais savoir où
le chantier en est resté. Ça s'est produit le 2 août 2026 : une session interactive a livré
plusieurs correctifs (dont v2.16.27, sécurité API) sans leur donner d'entrée dédiée — seulement
mentionnés en passant dans l'entrée d'un autre commit. Ne pas répéter ça.

**Concrètement, à chaque fois que tu :**
- livres une fonctionnalité ou un correctif (même petit) → entrée dédiée, même patron que les
  entrées existantes (version, contexte, ce qui a été fait, fichiers touchés, comment c'est
  vérifié).
- fais un incrément d'un gros chantier multi-session → entrée précisant l'incrément fait, ce
  qui reste, et où reprendre.
- prends une décision de conception (même sans coder encore) → note-la, pour qu'elle ne soit
  pas re-débattue ou oubliée à la prochaine session.
- t'arrêtes en cours de route (bloqué sur une confirmation, une permission, un accès externe)
  → documente l'état exact et ce qui bloque, pas juste "en attente".
- corriges/mets à jour une entrée existante devenue périmée (résumé de backlog, section
  "Ce qui reste à faire") → fais-le dans la même passe, ne laisse pas une ligne de résumé
  se désynchroniser du détail réel.

Une entrée manquante ou une ligne de résumé périmée = du travail qui tombe dans l'oubli pour
toute future session. Le but est 100% du progrès documenté, toujours — jamais "je le ferai à
la fin" ou "ce n'est pas assez gros pour mériter une entrée".
