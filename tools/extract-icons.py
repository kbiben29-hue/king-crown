"""Extracts the official Old King's Crown symbols from the Eerie Card Library's icon font into img/icons/.

    curl -o /tmp/okc.otf https://library.eerieidolgames.com/assets/fonts/OKC_Masterfont_ColourSeasons.otf
    python3 tools/extract-icons.py /tmp/okc.otf

Mono glyphs become single-path SVGs (used as CSS masks so they take the text colour). The five colour
glyphs (seasons) come from the font's SVG table; their viewBox is then trimmed to the drawing (we did
that by measuring getBBox() in a browser, since the glyphs sit above the baseline).
"""
import sys, pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

NAMES = {'i': 'influence', 'p': 'lore', 'v': 'votes', 'u': 'supporter', 'L': 'lore-cost', 'B': 'kingdoms-favour',
         'O': 'relics', 'M': 'secrets', 'F': 'oaths', 'h': 'heir', 'c': 'captain', 'f': 'follower', 'm': 'cavalry',
         'w': 'war-machine', 'a': 'agent', 't': 'trader', 'r': 'ruse', 'x': 'champion', 'I': 'invulnerable',
         'R': 'resilient', 'P': 'pathfinder', 'N': 'nobility', 'C': 'clans', 'U': 'uprising', 'G': 'gathering',
         'H': 'tower', 'q': 'gate', 'e': 'eye', 'o': 'wind', 's': 'gear'}
COLOUR = {'two': 'spring', 'four': 'day', 'five': 'night', 'six': 'autumn', 'seven': 'winter'}

font = TTFont(sys.argv[1]); gs = font.getGlyphSet(); order = font.getGlyphOrder()
out = pathlib.Path(__file__).resolve().parent.parent / 'img/icons'; out.mkdir(parents=True, exist_ok=True)
for g, name in NAMES.items():
    bp = BoundsPen(gs); gs[g].draw(bp); x0, y0, x1, y1 = bp.bounds
    pen = SVGPathPen(gs); gs[g].draw(pen)
    s = max(x1 - x0, y1 - y0) * 1.08; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    (out / f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{cx - s/2:.0f} {-cy - s/2:.0f} {s:.0f} {s:.0f}"><path transform="scale(1,-1)" d="{pen.getCommands()}"/></svg>')
for doc, a, _ in font['SVG '].docList:
    (out / f'{COLOUR[order[a]]}.svg').write_text(doc)
print('wrote', len(NAMES) + len(COLOUR), 'icons to', out)
