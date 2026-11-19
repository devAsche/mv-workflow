"""Contrast check for MVJZ cuts that put the lyric on a picture: does the line read, and if not, what to change.

usage: python3 tools/jz_contrast.py --spec SPEC.json --art ART.json --stills DIR --pics DIR --out OUTDIR
                                    [--section NAME] [--shifts-out shifts.json] [--spread 24 --blur 70 --opacity 80]

Inputs
  SPEC.json   the section's MVJZ spec (cut times, scheme of each cut)
  ART.json    where each cut's picture sits: tools/jz_dryrun.js --image-size <picture size> --art-out ART.json
  DIR stills  the "mask" pass of the same spec: build_jz.jsx with params.qa = "mask" (every text layer filled #00FF00,
              halos off, light build) and stills at each picture cut's readable moment (file names still_<t*100>_<frame>.tif)
  DIR pics    local copies of the pictures, matched by file name

Model. The picture behind the lyric is rebuilt from ART.json at the readable moment and 0.05 s before the cut ends; the
shade MVJZ puts under the lyric is the "cloud" (shadeMode "cloud": the lyric's shape spread by --spread px, blurred by
--blur, black at --opacity % under light text, white at 70 % under dark text). On the lyric plus a 6 px rim:
  bad   share whose shaded background is too close to the text: light text over luminance 110, dark text under 125
        (about 4:1 contrast either way)
A cut passes when bad <= 2 %. Otherwise, in this order: the same place in dark ink (when dark ink reads there at
<= 2 %, or at <= 4 % when the line sits mostly on a bright part: median background > 120), then other places (x, y in frame fractions, scale 1 / 0.86 / 0.74, inside a 48 px margin) in
light or dark ink, least bad first, then the smallest change. Suggestions go to --shifts-out as
{SECTION: {cut index: {"x", "y", "s", "ink"}}}, which songs/*/make_*.py turn into the spec cut's "shift" (MVJZ 0.1.6)
and, for "ink": "dark", the dark-ink scheme.
Writes OUTDIR/contrast_<section>.txt and OUTDIR/contrast_<section>.jpg (the cut as the model sees it after the change).
"""
import argparse, glob, json, math, os, re
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation, distance_transform_edt, gaussian_filter

W, H = 1920, 1080
DS = 4                       # the place search runs on a 480 x 270 grid
MARGIN = 48
LIGHT_MAX, DARK_MIN = 110, 125
DARK_INK = '#141018'


def hexlum(h):
    h = h.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def lum(a):
    a = a.astype(np.float32)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def interp(prop, t):
    if 'keys' not in prop:
        return np.array(prop['value'], dtype=float)
    ks = prop['keys']
    if t <= ks[0][0]:
        return np.array(ks[0][1], dtype=float)
    for (t0, v0), (t1, v1) in zip(ks, ks[1:]):
        if t <= t1:
            u = (t - t0) / max(1e-9, t1 - t0)
            return np.array(v0, dtype=float) * (1 - u) + np.array(v1, dtype=float) * u
    return np.array(ks[-1][1], dtype=float)


_pic_cache = {}


def picture(pics, path):
    name = re.split(r'[\\/]', path)[-1]
    if name not in _pic_cache:
        _pic_cache[name] = np.asarray(Image.open(os.path.join(pics, name)).convert('RGB'))
    return _pic_cache[name]


def background(art, pics, t):
    """the picture as the frame shows it at section time t (AE layer transform: pos + R(rot) * S * (p - anchor))"""
    import cv2
    tw = t - art['wrapStart']
    s = np.atleast_1d(interp(art['scale'], tw))[0] / 100.0
    pos = interp(art['position'], tw)
    rot = float(np.atleast_1d(interp(art['rotation'], tw))[0]) if art.get('rotation') else 0.0
    an = np.array(art['anchor'], dtype=float)
    c, sn = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    A = s * np.array([[c, -sn], [sn, c]])
    tr = pos[:2] - A @ an[:2]
    M = np.hstack([A, tr.reshape(2, 1)]).astype(np.float32)
    return cv2.warpAffine(picture(pics, art['path']), M, (W, H), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)


def green_mask(still):
    a = still.astype(np.int16)
    return (a[..., 1] - np.maximum(a[..., 0], a[..., 2]) > 60) & (a[..., 1] > 120)


def cloud(mask, spread, blur, op):
    m = distance_transform_edt(~mask) <= spread if spread > 0 else mask
    return np.clip(gaussian_filter(m.astype(np.float32), max(0.5, blur / 2.0)), 0, 1) * op


def shaded(L, a, dark):
    return L + (255 - L) * a if dark else L * (1 - a)


def score(Ls, mask, region, dark, sh):
    """bad share over the region for each background luminance in Ls (the worst one counts)"""
    a = cloud(mask, sh['spread'], sh['blur'], sh['op_dark'] if dark else sh['op'])
    worst = 0.0
    for L in Ls:
        E = shaded(L, a, dark)[region]
        bad = float((E < DARK_MIN).mean() if dark else (E > LIGHT_MAX).mean())
        worst = max(worst, bad)
    return worst


def place(m, x, y, s):
    """the mask moved by (x*w, y*h) and scaled by s about the frame centre"""
    h, w = m.shape
    ys, xs = np.nonzero(m)
    nx = np.round(w / 2 + (xs - w / 2) * s + x * w).astype(int)
    ny = np.round(h / 2 + (ys - h / 2) * s + y * h).astype(int)
    out = np.zeros_like(m)
    ok = (nx >= 0) & (nx < w) & (ny >= 0) & (ny < h)
    out[ny[ok], nx[ok]] = True
    if s < 1:
        out = binary_dilation(out, iterations=1)       # close the holes a smaller copy leaves
    return out


def search(mask, Ls, sh):
    """best (cost, x, y, s, dark, bad) over places and both inks, on the small grid"""
    small = lambda arr: arr[DS // 2::DS, DS // 2::DS]
    m0 = small(mask)
    Lss = [small(L) for L in Ls]
    shs = dict(sh, spread=sh['spread'] / DS, blur=sh['blur'] / DS)
    h, w = m0.shape
    mg = MARGIN / DS
    best = None
    for s in (1.0, 0.86, 0.74):
        ms = place(m0, 0, 0, s) if s != 1.0 else m0
        ys, xs = np.nonzero(ms)
        if not len(xs):
            continue
        for dy in np.arange(-0.32, 0.321, 0.04):
            for dx in np.arange(-0.40, 0.401, 0.04):
                if xs.min() + dx * w < mg or xs.max() + dx * w > w - mg or ys.min() + dy * h < mg or ys.max() + dy * h > h - mg:
                    continue
                mm = place(ms, dx, dy, 1.0)
                reg = binary_dilation(mm, iterations=2)
                for dark in (False, True):
                    bad = score(Lss, mm, reg, dark, shs)
                    cost = bad * 100 + (abs(dx) + abs(dy)) * 3 + (1 - s) * 6 + (0.5 if dark else 0)
                    if best is None or cost < best[0]:
                        best = (cost, round(float(dx), 2), round(float(dy), 2), s, dark, bad)
    return best


def moments(c):
    s, e = c['start'], c['end']
    if 'chars' not in c:
        a = s + min(1.5, (e - s) / 2)
    elif c.get('sync') == 'char':
        a = c['chars'][-1] + 0.12
    else:
        a = c.get('readBy', s) + 0.1
    return min(max(a, s + 0.02), e - 0.05), e - 0.05


def render_cell(bg, still, mask, sh, dark, col, x=0, y=0, s=1.0):
    """the cut as the model sees it: picture, cloud, lyric (moved when x / y / s say so)"""
    g = still.astype(np.float32)
    alpha = np.clip((g[..., 1] - np.maximum(g[..., 0], g[..., 2])) / 200.0, 0, 1)
    if x or y or s != 1:
        import cv2
        M = np.float32([[s, 0, W / 2 * (1 - s) + x * W], [0, s, H / 2 * (1 - s) + y * H]])
        alpha = cv2.warpAffine(alpha, M, (W, H))
        mask = alpha > 0.3
    a = cloud(mask, sh['spread'], sh['blur'], sh['op_dark'] if dark else sh['op'])[..., None]
    f = bg.astype(np.float32)
    f = f + (255 - f) * a if dark else f * (1 - a)
    f = f * (1 - alpha[..., None]) + np.array(col, dtype=np.float32) * alpha[..., None]
    return Image.fromarray(f.clip(0, 255).astype(np.uint8)).resize((480, 270))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True); ap.add_argument('--art', required=True)
    ap.add_argument('--stills', required=True); ap.add_argument('--pics', required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--section', default='')
    ap.add_argument('--shifts-out', default=None)
    ap.add_argument('--spread', type=float, default=24); ap.add_argument('--blur', type=float, default=70)
    ap.add_argument('--opacity', type=float, default=80); ap.add_argument('--opacity-dark', type=float, default=70)
    a = ap.parse_args()
    sh = {'spread': a.spread, 'blur': a.blur, 'op': a.opacity / 100, 'op_dark': a.opacity_dark / 100}
    spec = json.load(open(a.spec, encoding='utf-8'))
    arts = {x['cut']: x for x in json.load(open(a.art, encoding='utf-8'))}
    schemes = spec['style']['schemes']
    stills = {}
    for p in glob.glob(os.path.join(a.stills, 'still_*.tif')) + glob.glob(os.path.join(a.stills, 'still_*.png')):
        m = re.match(r'still_(\d+)', os.path.basename(p))
        if m:
            stills[int(m.group(1)) / 100.0] = p
    os.makedirs(a.out, exist_ok=True)
    sec = a.section or os.path.splitext(os.path.basename(a.spec))[0].replace('spec_', '')
    lines, cells, out = [], [], {}
    for ci, c in enumerate(spec['cuts']):
        if not c.get('image') or ci not in arts:
            continue
        tA, tB = moments(c)
        tk = min(stills, key=lambda t: abs(t - round(tA, 2))) if stills else None
        if tk is None or abs(tk - round(tA, 2)) > 0.011:
            lines.append('%2d  no mask still at %.2f' % (ci, tA)); continue
        still = np.asarray(Image.open(stills[tk]).convert('RGB'))
        mask = green_mask(still)
        if mask.sum() < 50:
            lines.append('%2d  %.2f  no lyric pixels in the mask still' % (ci, tA)); continue
        fg = schemes[(c.get('scheme') or 0) % len(schemes)]['fg']
        dark_now = hexlum(fg) < 128
        region = binary_dilation(mask, iterations=6)
        bgs = [background(arts[ci], a.pics, t) for t in (tA, tB)]
        Ls = [lum(b) for b in bgs]
        med = float(np.median(Ls[0][region]))
        raw = float(max((L[region] > LIGHT_MAX).mean() for L in Ls))
        bad_l = score(Ls, mask, region, False, sh)
        bad_d = score(Ls, mask, region, True, sh)
        row = '%2d %6.2f %-10s raw %4.1f%%  median %3.0f | cloud light %4.1f%%  dark ink %4.1f%%' % (
            ci, tA, c.get('layout', ''), raw * 100, med, bad_l * 100, bad_d * 100)
        choice = None
        if dark_now:
            choice = ('keep (dark scheme)', {}, True, bad_d)
        elif bad_l <= 0.02 and not (med > 120 and bad_d < bad_l):
            choice = ('ok', {}, False, bad_l)
        elif bad_d <= 0.02 or (med > 120 and bad_d <= 0.04):
            choice = ('dark ink', {'ink': 'dark'}, True, bad_d)
        else:
            b = search(mask, Ls, sh)
            if b:
                d = {'x': b[1], 'y': b[2], 's': b[3]}
                if b[4]:
                    d['ink'] = 'dark'
                choice = (('move' if b[5] <= 0.02 else 'BEST ONLY') + ' x %+.2f y %+.2f s %.2f%s' % (b[1], b[2], b[3], ' dark ink' if b[4] else ''), d, b[4], b[5])
            else:
                choice = ('NO PLACE', {}, False, bad_l)
        row += '  -> %s (bad %.1f%%)' % (choice[0], choice[3] * 100)
        if choice[1]:
            out[str(ci)] = choice[1]
        lines.append(row)
        col = (20, 16, 24) if choice[2] else (238, 234, 244)
        d = choice[1]
        im = render_cell(bgs[0], still, mask, sh, choice[2], col, d.get('x', 0), d.get('y', 0), d.get('s', 1.0))
        ImageDraw.Draw(im).text((6, 6), '%s %d  %s' % (sec, ci, choice[0][:28]), fill=(255, 255, 0))
        cells.append(im)
    rep = os.path.join(a.out, 'contrast_%s.txt' % sec)
    open(rep, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    if cells:
        cols = 3
        sheet = Image.new('RGB', (480 * cols, 270 * ((len(cells) + cols - 1) // cols)))
        for i, im in enumerate(cells):
            sheet.paste(im, ((i % cols) * 480, (i // cols) * 270))
        sheet.save(os.path.join(a.out, 'contrast_%s.jpg' % sec), quality=85)
    if a.shifts_out:
        allsh = json.load(open(a.shifts_out, encoding='utf-8')) if os.path.exists(a.shifts_out) else {}
        allsh[sec] = out
        json.dump(allsh, open(a.shifts_out, 'w', encoding='utf-8'), indent=1)


if __name__ == '__main__':
    main()
