"""blood_split.py - turn a painted "blood running down from the top edge, on flat black" picture into layers for AE.

  python3 tools/blood_split.py IN.png OUTDIR [--width 1920] [--thr 38] [--gamma 0.8] [--min-drip 0.06]

Writes OUTDIR/band.png (the band along the top edge), OUTDIR/drip_NN.png (one vertical strip per drip, full height,
transparent around it), OUTDIR/preview.png (all layers over grey) and OUTDIR/blood.json:
  {"W","H","band":{"file","h"},"drips":[{"file","x0","x1","tip","len"}]}   (pixels at --width)
Alpha comes from how far a pixel is from black (max channel), colour is un-premultiplied so edges stay crimson.
A drip is a run of columns whose blood reaches further down than the band; strips are cut at the valleys between tips.
"""
import argparse, json, os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d, label

ap = argparse.ArgumentParser()
ap.add_argument('inp'); ap.add_argument('out')
ap.add_argument('--width', type=int, default=1920)
ap.add_argument('--thr', type=float, default=38, help='max channel at which a pixel is fully opaque')
ap.add_argument('--floor', type=float, default=6, help='max channel below which a pixel is fully transparent')
ap.add_argument('--gamma', type=float, default=0.8)
ap.add_argument('--min-drip', type=float, default=0.06, help='a drip must reach this fraction of H below the band')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
im = Image.open(a.inp).convert('RGB')
H = round(im.height * a.width / im.width); W = a.width
im = im.resize((W, H), Image.LANCZOS)
rgb = np.asarray(im).astype(np.float32)
mx = rgb.max(axis=2)
alpha = np.clip((mx - a.floor) / (a.thr - a.floor), 0, 1) ** a.gamma
# un-premultiply against black: colour = rgb / alpha (capped), so the soft edges keep the blood colour
col = np.where(alpha[..., None] > 0.02, rgb / np.maximum(alpha[..., None], 0.02), 0)
col = np.clip(col, 0, 255)
# keep only what touches the top edge (drops falling free are kept too if large enough)
solid = alpha > 0.5
lab, n = label(solid)
keep = np.zeros_like(solid)
for i in range(1, n + 1):
    m = lab == i
    ys, xs = np.nonzero(m)
    if ys.min() <= H * 0.04 or m.sum() > W * H * 0.0004: keep |= m
from scipy.ndimage import binary_dilation
keep = binary_dilation(keep, iterations=6)
alpha = alpha * keep
# lowest blood pixel per column
cols = alpha > 0.5
bottom = np.where(cols.any(axis=0), H - 1 - np.argmax(cols[::-1], axis=0), 0).astype(np.float32)
bs = gaussian_filter1d(bottom, 3)
band_h = int(np.percentile(bs[bs > 0], 35)) if (bs > 0).any() else int(H * 0.08)
band_h = max(int(H * 0.03), min(band_h, int(H * 0.25)))
# drips: tips are local maxima of the smoothed bottom line that reach min-drip below the band; each column belongs to
# exactly one strip, cut at the lowest point of the bottom line between two neighbouring tips (no column twice)
need = band_h + a.min_drip * H
cand = [x for x in range(1, W - 1) if bs[x] >= need and bs[x] >= bs[x - 1] and bs[x] > bs[x + 1]]
tips = []
for x in cand:                       # merge maxima closer than 30 px (one drip), keep the deeper
    if tips and x - tips[-1] < 30:
        if bs[x] > bs[tips[-1]]: tips[-1] = x
    else: tips.append(x)
cuts = [0] + [int(t0 + np.argmin(bs[t0:t1])) for t0, t1 in zip(tips[:-1], tips[1:])] + [W]
drips = []
for i, t in enumerate(tips):
    l, r = cuts[i], cuts[i + 1]
    tip = int(bottom[l:r].max())
    drips.append({'x0': int(l), 'x1': int(r), 'xc': int(t), 'tip': tip, 'len': tip - band_h})
def save(mask_alpha, name):
    out = np.dstack([col * (mask_alpha[..., None] > 0.004), mask_alpha * 255]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(os.path.join(a.out, name))
# band: everything above band_h (+ a soft 12px fade), drips: their strip below band_h - 8 (overlap so no seam)
yy = np.arange(H)[:, None].astype(np.float32)
band_mask = alpha * np.clip((band_h + 12 - yy) / 12, 0, 1)
save(band_mask, 'band.png')
for i, d in enumerate(drips):
    m = np.zeros_like(alpha); m[:, d['x0']:d['x1']] = alpha[:, d['x0']:d['x1']]
    m *= np.clip((yy - (band_h - 20)) / 12, 0, 1)
    d['file'] = f'drip_{i:02d}.png'; save(m, d['file'])
meta = {'W': W, 'H': H, 'band': {'file': 'band.png', 'h': band_h}, 'drips': drips, 'src': os.path.basename(a.inp)}
json.dump(meta, open(os.path.join(a.out, 'blood.json'), 'w'), indent=1)
# preview over grey
pv = np.full((H, W, 3), 70, np.float32)
A = alpha[..., None]; pv = pv * (1 - A) + col * A
pim = Image.fromarray(pv.astype(np.uint8)); from PIL import ImageDraw
dr = ImageDraw.Draw(pim); dr.line([(0, band_h), (W, band_h)], fill=(0, 255, 0))
for d in drips: dr.rectangle([d['x0'], band_h, d['x1'], d['tip']], outline=(0, 200, 255))
pim.save(os.path.join(a.out, 'preview.png'))
print(json.dumps({'band_h': band_h, 'drips': [(d['x0'], d['x1'], d['tip']) for d in drips]}))
