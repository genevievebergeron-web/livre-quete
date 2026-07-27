#!/usr/bin/env python3
"""Chaîne de nettoyage pour tester Gemini comme source d'assets pixel art (2026-07-27).

Gemini/AI Studio produit du *faux* pixel art (grille irrégulière, anti-aliasing,
pas de fond transparent fiable). Ce script convertit une image Gemini en sprite
utilisable par le moteur (grille vraie, palette réduite, fond transparent) :

    python3 scripts/gemini-pixel-cleanup.py entree.png sortie.png --grid 72 --colors 24
    python3 scripts/gemini-pixel-cleanup.py entree.png sortie.png --grid 96 --keep-bg

Étapes : (1) détection/retrait du fond uni (coins) sauf --keep-bg ; (2) réduction
à la grille cible en NEAREST (vrais pixels) ; (3) quantification de palette ;
(4) ré-agrandissement ×N optionnel (--scale) pour inspection.
Verdict de la session test : si le résultat tient la comparaison avec les assets
PixelLab de public/sprites/deco/, la chaîne Gemini est viable pour le décor ;
pour les pièces d'avatar registrées (alignement au pixel), rester sceptique.
"""
import argparse
from PIL import Image

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--grid", type=int, default=72, help="taille de grille cible (px)")
    ap.add_argument("--colors", type=int, default=24, help="taille de palette")
    ap.add_argument("--scale", type=int, default=1, help="ré-agrandissement final (×N, NEAREST)")
    ap.add_argument("--keep-bg", action="store_true", help="ne pas retirer le fond uni")
    ap.add_argument("--bg-tol", type=int, default=28, help="tolérance de couleur du fond")
    a = ap.parse_args()

    im = Image.open(a.src).convert("RGBA")
    if not a.keep_bg:
        # fond = couleur majoritaire des 4 coins ; flood approximatif par tolérance globale
        px = im.load(); w, h = im.size
        corners = [px[0,0], px[w-1,0], px[0,h-1], px[w-1,h-1]]
        bg = max(set(corners), key=corners.count)
        def close(c): return all(abs(c[i]-bg[i]) <= a.bg_tol for i in range(3))
        for y in range(h):
            for x in range(w):
                if close(px[x,y]): px[x,y] = (0,0,0,0)
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0,0,0,0))
    sq.paste(im, ((side-im.width)//2, (side-im.height)//2))
    small = sq.resize((a.grid, a.grid), Image.NEAREST)
    # quantification en préservant l'alpha
    alpha = small.getchannel("A")
    quant = small.convert("RGB").quantize(colors=a.colors, method=Image.MEDIANCUT).convert("RGBA")
    quant.putalpha(alpha)
    if a.scale > 1:
        quant = quant.resize((a.grid*a.scale, a.grid*a.scale), Image.NEAREST)
    quant.save(a.dst)
    print(f"ok → {a.dst} ({quant.size[0]}×{quant.size[1]}, {a.colors} couleurs)")

if __name__ == "__main__":
    main()
