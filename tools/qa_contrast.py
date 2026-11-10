"""Contrast check for lyrics in an After Effects build (build_shots.jsx with params.qa = {contrast: true}).

For every lyric the build saves two stills at the moment it has fully appeared: one with the lyric (qa_NNN_on.png) and
one with only that lyric's layers switched off (qa_NNN_off.png), one of the lyric alone on magenta (qa_NNN_solo.png),
plus qa.json. The solo still says where every letter is, even where a picture in front hides it. This script measures how far the letters stand out from what is right around them in the finished frame
(strips, boxes and dark glows under the letters count, because they are in both stills or around the letters).

usage: python3 qa_contrast.py <folder with qa.json> [out folder]
writes qa_report.json, qa_report.md and qa_sheet.jpg (worst first)

Numbers: contrast ratio as in WCAG ((L1 + 0.05) / (L2 + 0.05), relative luminance), letter by letter against each
letter's own surroundings. Lyrics smaller than 5% of the frame height need 4.5, larger ones 3 (the median letter).
"lost" is the share of letters under 1.6, so a picture that swallows part of a word shows up even when most of it reads.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi


def lum(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def ratio(a, b):
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def hex2rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def glyph_mask(on, off, solo, item):
    """Pixels of the letters themselves. With a solo still (the lyric alone on magenta) every letter is known, even
    one a picture in front hides; otherwise the letters are what changes between the stills with and without it."""
    if solo is not None:
        key = np.abs(solo - np.array([255.0, 0, 255.0])).max(axis=2) > 60
        g = key
        fill = item.get("fill")
        if fill:                                     # the fill colour only: not the stroke, not a dark glow
            near_fill = np.abs(solo - hex2rgb(fill)).max(axis=2) < 70
            if (key & near_fill).sum() >= 30:
                g = key & near_fill
        return g, key
    diff = np.abs(on - off).max(axis=2)
    mask = diff > 20
    if mask.sum() < 20:
        return mask, mask
    g = mask & (diff >= np.percentile(diff[mask], 40))
    fill = item.get("fill")
    if fill:
        light = lum(hex2rgb(fill)[None, None, :])[0, 0] > 0.4
        side = (lum(on) >= lum(off)) if light else (lum(on) <= lum(off))
        if (g & side).sum() >= 20:
            g = g & side
    return g, mask


def measure(on, off, item, H, solo=None):
    glyph, whole = glyph_mask(on, off, solo, item)
    lab, n = ndi.label(glyph)
    if n:
        sizes = ndi.sum(glyph, lab, range(1, n + 1))
        glyph = np.isin(lab, 1 + np.flatnonzero(sizes >= 6))
    if glyph.sum() < 20:
        return {"verdict": "missing", "note": "文字がほとんど写っていない（隠れている・まだ出ていない）"}
    Lon = lum(on)
    ys, xs = np.nonzero(whole if whole.any() else glyph)
    box = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    size_px = item.get("size", 100)
    r = int(np.clip(size_px * 0.12, 3, 14))
    near = ndi.binary_dilation(glyph, iterations=r) & ~ndi.binary_dilation(glyph, iterations=1)
    if near.sum() < 20:
        return {"verdict": "missing", "note": "周りの画素が取れない", "box": box}
    # per letter (roughly): group glyph pixels that sit close together, compare each group with its own surroundings
    reach = max(2, int(size_px * 0.15))
    groups, ng = ndi.label(ndi.binary_dilation(glyph, iterations=reach))
    per, weights = [], []
    for k in range(1, ng + 1):
        reg = groups == k
        g, rg = glyph & reg, near & ndi.binary_dilation(reg, iterations=r)
        if g.sum() < 10 or rg.sum() < 10:
            continue
        per.append(ratio(float(np.median(Lon[g])), float(np.median(Lon[rg]))))
        weights.append(float(g.sum()))
    if not per:
        return {"verdict": "missing", "note": "文字がほとんど写っていない", "box": box}
    per, weights = np.array(per), np.array(weights)
    order = np.argsort(per)
    cum = np.cumsum(weights[order]) / weights.sum()
    cr = float(per[order][np.searchsorted(cum, 0.5)])            # weighted median over letters
    lost = float(weights[per < 1.6].sum() / weights.sum())       # share of the letters that sink into what is around them
    lt, ring = float(np.median(Lon[glyph])), Lon[near]
    lb = float(np.median(ring))
    crw = ratio(lt, float(np.percentile(ring, 90 if lt > lb else 10)))
    need = 4.5 if size_px < 0.05 * H else 3.0
    if cr < need:
        verdict = "ng"
    elif lost >= 0.15 or crw < 1.6:
        verdict = "warn"
    else:
        verdict = "ok"
    return {"verdict": verdict, "ratio": round(cr, 2), "worst": round(crw, 2), "lost_pct": round(lost * 100),
            "need": need, "text_lum": round(lt, 3), "bg_lum": round(lb, 3), "box": box}


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    os.makedirs(dst, exist_ok=True)
    meta = json.load(open(os.path.join(src, "qa.json"), encoding="utf-8-sig"))
    H = meta.get("h", 1080)
    rows = []
    for it in meta["items"]:
        a, b = (os.path.join(src, "qa_%s_%s.png" % (it["id"], k)) for k in ("on", "off"))
        if not (os.path.exists(a) and os.path.exists(b)):
            rows.append(dict(it, verdict="missing", note="静止画がない"))
            continue
        on = np.asarray(Image.open(a).convert("RGB"), float)
        off = np.asarray(Image.open(b).convert("RGB"), float)
        sp = os.path.join(src, "qa_%s_solo.png" % it["id"])
        solo = np.asarray(Image.open(sp).convert("RGB"), float) if os.path.exists(sp) else None
        rows.append(dict(it, **measure(on, off, it, H, solo)))
    order = {"ng": 0, "missing": 1, "warn": 2, "ok": 3}
    rows.sort(key=lambda r: (order[r["verdict"]], r.get("ratio", 0)))
    json.dump(rows, open(os.path.join(dst, "qa_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    word = {"ng": "見えにくい", "warn": "一部が埋もれる", "ok": "読める", "missing": "写っていない"}
    lines = ["# 文字の見えやすさの点検", "",
             "コントラスト比（WCAGの計算）。画面の高さの5%未満の小さい字は4.5以上、それより大きい字は3以上を目安にしています。" , "",
             "| 判定 | 時刻 | ショット | 文字 | 入れ物 | 比 | 埋もれた字 | 目安 |", "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (word[r["verdict"]], r.get("t"), r.get("shot"), str(r.get("label", ""))[:24].replace("\n", " / "),
                     r.get("plate") or "なし", r.get("ratio", "-"), "%s%%" % r["lost_pct"] if "lost_pct" in r else "-", r.get("need", "-")))
    n = {k: sum(1 for r in rows if r["verdict"] == k) for k in order}
    lines += ["", "見えにくい %d、一部が埋もれる %d、写っていない %d、読める %d（全 %d）" % (n["ng"], n["warn"], n["missing"], n["ok"], len(rows))]
    open(os.path.join(dst, "qa_report.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")

    # contact sheet: each lyric cropped around itself, framed by verdict colour
    cw, ch, cols = 480, 270, 4
    show = rows[:48]
    sheet = Image.new("RGB", (cw * cols, ch * ((len(show) + cols - 1) // cols)), (20, 20, 20))
    colour = {"ng": (230, 40, 40), "warn": (240, 180, 0), "ok": (40, 200, 90), "missing": (150, 150, 150)}
    tag = {"ng": "NG", "warn": "PART", "ok": "OK", "missing": "MISSING"}
    font = None
    for f in ("DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "arialbd.ttf"):
        try:
            font = ImageFont.truetype(f, 18)
            break
        except OSError:
            pass
    font = font or ImageFont.load_default()
    for i, r in enumerate(show):
        im = Image.open(os.path.join(src, "qa_%s_on.png" % r["id"])).convert("RGB")
        if "box" in r:
            x0, y0, x1, y1 = r["box"]
            m = max(40, int(0.35 * max(x1 - x0, y1 - y0)))
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            w = max(x1 - x0 + 2 * m, (y1 - y0 + 2 * m) * 16 / 9)
            hgt = w * 9 / 16
            crop = (int(max(0, cx - w / 2)), int(max(0, cy - hgt / 2)), int(min(im.width, cx + w / 2)), int(min(im.height, cy + hgt / 2)))
            im = im.crop(crop)
        im.thumbnail((cw, ch))
        tile = Image.new("RGB", (cw, ch), (0, 0, 0))
        tile.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2))
        d = ImageDraw.Draw(tile)
        d.rectangle([1, 1, cw - 2, ch - 2], outline=colour[r["verdict"]], width=5)
        d.rectangle([0, ch - 28, cw, ch], fill=(0, 0, 0))
        d.text((8, ch - 26), "%s  %ss  ratio %s / lost %s%%  %s" % (r["id"], r.get("t"), r.get("ratio", "-"), r.get("lost_pct", "-"), tag[r["verdict"]]),
               fill=colour[r["verdict"]], font=font)
        sheet.paste(tile, ((i % cols) * cw, (i // cols) * ch))
    sheet.save(os.path.join(dst, "qa_sheet.jpg"), quality=85)
    print(json.dumps(n, ensure_ascii=False))


if __name__ == "__main__":
    main()
