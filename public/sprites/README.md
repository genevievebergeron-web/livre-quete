# Sprites PNG (PixelLab)

Dépose ici les sprites pixel art générés par PixelLab. Ils remplacent automatiquement les sprites dessinés/emoji.

## Convention de nommage
- Familiers : `pets/<cle>.png` (forme de base). Clés : cat, dog, wolf, fox, dragon, parrot, owl, duck, worm, capybara, bee, spider.
- Items : `items/<id>.png` (id de l item, ex: h2, a4, mi3).
- Avatar : `avatar/<partId>.png` — voir la section dédiée ci-dessous.

Format (pets/items) : PNG transparent, carré (ex: 64x64 ou 128x128), style pixel art cohérent.

## Avatar — convention du moteur de couches (2026-07-27)

Le moteur (`src/avatar.jsx`, table `AVATAR_LAYERS`) compose l'avatar couche par couche.
Chaque pièce peut être un PNG déposé ici ; sinon le dessin procédural sert de repli.

**Ids acceptés** : `ha1..ha8` (cheveux), `bk1..bk3` (dos : ailes de fée, ailes de dragon, cape),
`sh1..sh4` (souliers). **Jamais** de PNG pour yeux/bouche/peau/corps : les humeurs (Phase 5)
et le clignement sont des surcharges procédurales, et peau/corps sont teintés dynamiquement.
Les ids `*0` ("Aucun") n'ont jamais de PNG.

**Format** : PNG transparent, **trame PLEINE 72×72** (ou multiple exact : 144×144, 216×216) —
la pièce doit être DÉJÀ positionnée à sa place anatomique dans la trame. Le moteur fait un
seul `drawImage` plein cadre, sans recadrage ni métadonnées d'ancrage.

**Repère anatomique (72 unités, contrat partagé avec AVATAR_EQUIP_ANCHORS)** :
tête x3-33 y2-24 (centre x18) · corps x2-34 y26-50 · bras x-2..38 y28-42 ·
jambes x6-32 y50-64 · cheveux PNG = arrière + dessus en une seule pièce, dessinée
par-dessus la tête · dos = zones visibles derrière la silhouette : pointes hautes à
droite (x33-40 y10-26), colonnes latérales (x0-2 / x34-40), évasements bas (x0-6 /
x32-40, y50-58) · souliers = y59-64 par-dessus le bas des jambes.

**Workflow PixelLab** : la génération sort un sujet centré — le repositionnement dans la
trame 72 est une étape manuelle (session avec Gen, jamais en autonome). Sorties brutes
dans `avatar/_raw/`, seuls les PNG registrés vont dans `avatar/`.
Jobs d'exemple : `scripts/jobs-avatar-exemple.json` (`node scripts/pixellab.mjs <jobs>`).
