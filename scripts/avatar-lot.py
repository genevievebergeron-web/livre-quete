#!/usr/bin/env python3
"""Pipeline du lot avatar détaillé (chantier E, session Gen 2026-07-27).

Entrées : public/sprites/avatar/_raw/  (sorties PixelLab, pose STRICTEMENT identique
à base.png — c'est ce qui rend l'extraction par différence fiable)
    base.png                        personnage de base ado (chauve, gris recolorable)
    mood_<humeur>.png               happy/proud/tired/levelup/equipped (visage changé)
    hair_brown.png                  base + cheveux courts bruns
    back_fairy.png / back_dragon.png / back_cape.png
    shoes_sneakers/boots/dress/slippers.png

Sorties : public/sprites/avatar/  (couches transparentes 144×144 registrées)
    body_ado.png, body_enfant.png              corps de base (peau/chandail recolorés au runtime)
    face_<humeur>[_e].png                      surcouches visage par humeur
    ha1..ha8[_e].png                           cheveux recolorés aux 8 teintes du catalogue
    bk1..bk3[_e].png, sh1..sh4[_e].png         dos et souliers
_e = silhouette enfant, dérivée par chirurgie de bandes (tête 100 % / torse 88 % / jambes 70 %)
— même transformation que la base approuvée par Gen (V5), appliquée à CHAQUE couche pour
que tout reste aligné.
"""
import os
from PIL import Image

RAW = "public/sprites/avatar/_raw"
OUT = "public/sprites/avatar/v2"  # staging : le moteur v1 (72) ne doit JAMAIS lire ces pièces 144
TOL = 24  # tolérance de différence par canal

HA_COLORS = {  # teintes du catalogue AVATAR_PARTS.hair (avatar.jsx)
    "ha1": (92, 51, 23), "ha2": (17, 17, 17), "ha3": (217, 188, 92), "ha4": (204, 68, 0),
    "ha5": (238, 238, 238), "ha6": (153, 51, 204), "ha7": (34, 68, 170), "ha8": (255, 105, 180),
}

def load(name):
    return Image.open(os.path.join(RAW, name)).convert("RGBA")

def align(variant, base):
    """Recale `variant` sur `base` (edit_image décale parfois le sujet de quelques px).
    Cherche le décalage entier (dx,dy) qui minimise la différence sur la boîte du TORSE
    (zone inchangée dans toutes les variantes), puis translate la variante."""
    bp, vp = base.load(), variant.load()
    box = range(58, 92), range(58, 96)  # x, y — torse de la base ado
    best, bdx, bdy = None, 0, 0
    for dy in range(-14, 15):
        for dx in range(-14, 15):
            s = 0
            for y in box[1]:
                for x in box[0]:
                    b = bp[x, y]; v = vp[(x+dx) % 144, (y+dy) % 144]
                    s += abs(b[0]-v[0]) + abs(b[1]-v[1]) + abs(b[2]-v[2]) + abs(b[3]-v[3])
            if best is None or s < best:
                best, bdx, bdy = s, dx, dy
    if (bdx, bdy) != (0, 0):
        out = Image.new("RGBA", variant.size, (0, 0, 0, 0))
        out.alpha_composite(variant, (-bdx, -bdy))
        print(f"    (recalé de {bdx},{bdy})")
        return out
    return variant

def despeckle(layer):
    """Retire les pixels isolés (résidus de dérive des éditions) : un pixel opaque
    doit avoir ≥2 voisins opaques pour survivre."""
    px = layer.load(); w, h = layer.size
    kill = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40:
                n = sum(1 for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1))
                        if 0 <= x+dx < w and 0 <= y+dy < h and px[x+dx, y+dy][3] > 40)
                if n < 2: kill.append((x, y))
    for x, y in kill: px[x, y] = (0, 0, 0, 0)
    return layer

FACE_BOX = (46, 12, 100, 54)  # zone visage/tête de la base ado — exclue des pièces non-visage

def diff_layer(variant, base, region=None, exclude_face=False):
    """Pixels de `variant` qui diffèrent de `base` → couche transparente.
    exclude_face : les éditions dérivent subtilement quelques pixels du visage →
    « visage fantôme » dans les couches armure/dos/extras (bug confirmé par Gen sur
    la pile enfant). On exclut la boîte visage de ces couches-là."""
    variant = align(variant, base)
    out = Image.new("RGBA", base.size, (0, 0, 0, 0))
    bp, vp, op = base.load(), variant.load(), out.load()
    w, h = base.size
    x0, y0, x1, y1 = region or (0, 0, w, h)
    for y in range(y0, y1):
        for x in range(x0, x1):
            if exclude_face and FACE_BOX[0] <= x < FACE_BOX[2] and FACE_BOX[1] <= y < FACE_BOX[3]:
                continue
            b, v = bp[x, y], vp[x, y]
            if abs(b[0]-v[0]) + abs(b[1]-v[1]) + abs(b[2]-v[2]) + abs(b[3]-v[3]) > TOL:
                if v[3] > 40:  # on ne copie que les pixels PRÉSENTS dans la variante
                    op[x, y] = v
    return despeckle(out)

def recolor(layer, target):
    """Recolore une couche (cheveux) vers `target` en préservant la luminance relative."""
    out = layer.copy(); px = out.load()
    w, h = out.size
    # luminance médiane des pixels opaques = point d'ancrage
    lums = [ (p[0]*3+p[1]*6+p[2])/10 for y in range(h) for x in range(w) if (p:=px[x,y])[3]>40 ]
    if not lums: return out
    mid = sorted(lums)[len(lums)//2] or 1
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] > 40:
                f = min(1.8, max(0.25, ((p[0]*3+p[1]*6+p[2])/10) / mid))
                px[x, y] = (min(255,int(target[0]*f)), min(255,int(target[1]*f)), min(255,int(target[2]*f)), p[3])
    return out

def kidify(im):
    """Chirurgie de bandes approuvée (V5) : tête 100 % / torse 88 % / jambes 70 %.
    Appliquée sur la TRAME complète (144) avec les mêmes lignes de coupe pour toutes
    les couches — c'est ce qui garantit l'alignement entre les pièces enfant."""
    w, h = im.size
    # lignes de coupe FIXES dans la trame 144 (base ado : bbox y≈10..135, cou≈52, taille≈85)
    NECK, WAIST, FLOOR = 52, 85, 135
    head = im.crop((0, 0, w, NECK))
    torso = im.crop((0, NECK, w, WAIST)).resize((w, int((WAIST-NECK)*0.88)), Image.NEAREST)
    legs = im.crop((0, WAIST, w, FLOOR)).resize((w, int((FLOOR-WAIST)*0.70)), Image.NEAREST)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    yy = FLOOR - (head.height - 0) - torso.height - legs.height  # tout repose sur FLOOR
    # NB: la tête n'est pas réduite ; on empile depuis le sol pour garder les pieds à FLOOR
    y = FLOOR - legs.height - torso.height - head.height
    out.alpha_composite(head, (0, y))
    out.alpha_composite(torso, (0, y + head.height))
    out.alpha_composite(legs, (0, y + head.height + torso.height))
    return out

def save(im, name):
    im.save(os.path.join(OUT, name)); print(" ", name)

def main():
    base = load("base.png")
    save(base, "body_ado.png"); save(kidify(base), "body_enfant.png")

    for mood in ["happy", "proud", "tired", "levelup", "equipped"]:
        v = load(f"mood_{mood}.png")
        layer = diff_layer(v, base, region=(40, 10, 105, 55))  # zone tête
        save(layer, f"face_{mood}.png"); save(kidify(layer), f"face_{mood}_e.png")

    hair = diff_layer(load("hair_brown.png"), base, region=(30, 0, 115, 60))
    for ha, col in HA_COLORS.items():
        h = hair if ha == "ha1" else recolor(hair, col)
        save(h, f"{ha}.png"); save(kidify(h), f"{ha}_e.png")

    # bk1 = ailes PLUMÉES (Gen a remplacé les ailes de fée, 2026-07-27 — 4 garçons) ;
    # bk2 = ailes de dragon/chauve-souris ; bk3 = cape. back_fairy.png reste en _raw (archive).
    for src, out in [("back_feather","bk1"),("back_dragon","bk2"),("back_cape","bk3")]:
        layer = diff_layer(load(f"{src}.png"), base, exclude_face=True)
        save(layer, f"{out}.png"); save(kidify(layer), f"{out}_e.png")

    # Extras (nouveau slot d'identité xt, demande Gen) : cornes de démon + queue, tentacules.
    # (bras supplémentaires : génération échouée, à reprendre)
    for src, out in [("extra_horns","xt1"),("extra_tentacles","xt2")]:
        layer = diff_layer(load(f"{src}.png"), base, exclude_face=True)
        save(layer, f"{out}.png"); save(kidify(layer), f"{out}_e.png")

    # Armures ÉQUIPÉES (items de boutique a6-a9) : couche portée en mode détaillé,
    # repli emoji à l'ancre "armor" pour le moteur v1.
    for src, out in [("armor_tp","a6"),("armor_postit","a7"),("armor_knight","a8"),("armor_gold","a9")]:
        layer = diff_layer(load(f"{src}.png"), base, exclude_face=True)
        save(layer, f"{out}.png"); save(kidify(layer), f"{out}_e.png")

    for src, out in [("shoes_sneakers","sh1"),("shoes_boots","sh2"),("shoes_dress","sh3"),("shoes_slippers","sh4")]:
        layer = diff_layer(load(f"{src}.png"), base, region=(30, 100, 115, 144))  # zone pieds
        save(layer, f"{out}.png"); save(kidify(layer), f"{out}_e.png")

if __name__ == "__main__":
    main()
