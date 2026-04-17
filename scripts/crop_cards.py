"""Crop individual card PORTRAITS from the 2 sheets (skip number/title/description).
Run from project root: python scripts/crop_cards.py
"""
from PIL import Image
from pathlib import Path

root = Path(__file__).parent.parent
assets = root / 'assets'
out = assets / 'cards'
out.mkdir(exist_ok=True)

def crop_sheet(img_path, cells, *, grid_top, grid_bottom, grid_left, grid_right,
               portrait_top, portrait_bottom, portrait_left, portrait_right,
               rows=2, cols=4, max_width=420):
    im = Image.open(img_path).convert('RGB')
    W, H = im.size
    gx0, gx1 = int(W * grid_left), int(W * grid_right)
    gy0, gy1 = int(H * grid_top), int(H * grid_bottom)
    cell_w = (gx1 - gx0) // cols
    cell_h = (gy1 - gy0) // rows
    for i, name in enumerate(cells):
        if name is None:
            continue
        r, c = divmod(i, cols)
        x0 = gx0 + c * cell_w
        y0 = gy0 + r * cell_h
        x0c = x0 + int(cell_w * portrait_left)
        x1c = x0 + int(cell_w * portrait_right)
        y0c = y0 + int(cell_h * portrait_top)
        y1c = y0 + int(cell_h * portrait_bottom)
        crop = im.crop((x0c, y0c, x1c, y1c))
        # Downscale for web if very large
        if crop.width > max_width:
            ratio = max_width / crop.width
            crop = crop.resize((max_width, int(crop.height * ratio)), Image.LANCZOS)
        crop.save(out / f'{name}.png', optimize=True)
        print(f'{name}: size {crop.size}')

# Sheet 1: Espionne, Garde, Prêtre, Servante / Prince, Chancelier, Comtesse, Princesse
crop_sheet(
    assets / 'Love letter 1.png',
    ['spy', 'guard', 'priest', 'handmaid', 'prince', 'chancellor', 'countess', 'princess'],
    grid_top=0.10, grid_bottom=0.98, grid_left=0.03, grid_right=0.97,
    portrait_top=0.23, portrait_bottom=0.68, portrait_left=0.12, portrait_right=0.88,
)

# Sheet 2: Garde, Prêtre, Baron, Servante / Prince, Roi, Comtesse, Princesse
crop_sheet(
    assets / 'Love letter 2.jpg',
    ['guard_alt', 'priest_alt', 'baron', 'handmaid_alt', 'prince_alt', 'king', 'countess_alt', 'princess_alt'],
    grid_top=0.08, grid_bottom=0.97, grid_left=0.03, grid_right=0.97,
    portrait_top=0.23, portrait_bottom=0.68, portrait_left=0.12, portrait_right=0.88,
)
