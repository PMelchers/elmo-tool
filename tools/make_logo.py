"""Builds the app logo from assets/logo_source.png: removes the white background (only the part connected to the
image edge, so white inside the picture such as the eyes stays), crops, pads to a square and writes
assets/logo.png (transparent) and assets/icon.ico.
Run: python tools/make_logo.py"""
import os
from collections import deque
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')
SRC = os.path.join(ASSETS, 'logo_source.png')
WHITE = 238          # a pixel counts as background when every channel is at least this bright

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()

# 1. flood fill from the border through near-white pixels
bg = [[False] * w for _ in range(h)]
q = deque()
def near_white(x, y):
    r, g, b, a = px[x, y]
    return a < 20 or (r >= WHITE and g >= WHITE and b >= WHITE)
for x in range(w):
    for y in (0, h - 1):
        if near_white(x, y) and not bg[y][x]: bg[y][x] = True; q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if near_white(x, y) and not bg[y][x]: bg[y][x] = True; q.append((x, y))
while q:
    x, y = q.popleft()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and not bg[ny][nx] and near_white(nx, ny):
            bg[ny][nx] = True; q.append((nx, ny))

# 2. clear the background; soften the edge ("colour to alpha" against white) in a thin band next to it
def band(x, y, r=2):
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and bg[ny][nx]:
                return True
    return False
out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
op = out.load()
for y in range(h):
    for x in range(w):
        if bg[y][x]:
            continue
        r, g, b, a = px[x, y]
        if band(x, y):
            alpha = max(255 - r, 255 - g, 255 - b) / 255.0
            alpha = min(1.0, alpha * 1.15)
            if alpha < 0.02:
                continue
            r = int(max(0, min(255, (r - 255 * (1 - alpha)) / alpha)))
            g = int(max(0, min(255, (g - 255 * (1 - alpha)) / alpha)))
            b = int(max(0, min(255, (b - 255 * (1 - alpha)) / alpha)))
            op[x, y] = (r, g, b, int(alpha * 255))
        else:
            op[x, y] = (r, g, b, 255)

# 3. crop to the figure, pad, make it square
box = out.getbbox()
out = out.crop(box)
side = int(max(out.size) * 1.08)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(out, ((side - out.width) // 2, (side - out.height) // 2), out)
logo = sq.resize((512, 512), Image.LANCZOS)
logo.save(os.path.join(ASSETS, 'logo.png'))
logo.save(os.path.join(ASSETS, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok', logo.size)
