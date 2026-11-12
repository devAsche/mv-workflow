"""Check that every shot of a render stays inside the song's colours (look.json), and list the shots that leave them.

usage: python3 palette_check.py <video> <look.json> [--offset SEC] [--out DIR]
       python3 palette_check.py --derive <image>      (prints a "palette" for look.json, measured from the jacket)

--derive reads the jacket (or any key picture): base hue = the mean hue of its coloured pixels, hue_tol = the
distance that holds 97% of them plus 12 degrees of room for generated pictures, sat_max = their 97th percentile
saturation plus 0.03. 雨粒パレード's jacket gives hue 229, hue_tol 24, sat_max 0.5. (Writing sat_max by hand
from the median saturation, 0.3, flagged the jacket itself.)

look.json "palette" (see tools/look_example.json):
  hue        the song's base hue in degrees (雨粒パレード, from the jacket: about 229)
  hue_tol    how far a coloured pixel may drift from it (degrees, default 25)
  sat_max    how saturated the base colour may get (0-1, default 0.35)
  accents    [{name, hue, hue_tol, sat_max, from, to, max_share}]: colours allowed on top, optionally only between two
             song times (a rainbow fringe after "色が戻ってく"; a yellow umbrella), each on at most max_share of the frame

For each shot (cuts found as in motion_check.py) three frames are read (at 25%, 50%, 75%). Pixels with saturation
below 0.12 or value below 0.08 are neutral and always allowed. A coloured pixel is "in palette" when it is within
hue_tol of the base hue and not more saturated than sat_max, or when it matches an accent that is allowed at that
time. The shot's off-palette share is the median over its frames:
  more than 15%  "色が外れる"  the picture as a whole leaves the song's colours (v4: the raw yellow k06 at 45%,
                               the orange streetlight k09 at 35%; both were what the review found by eye)
  3% to 15%      "混ざりもの"   one object in another colour (v4: brown boots, a mustard scarf, rain lines too
                               saturated; 3-9%). Look at it; recolour it in the plate or in AE if it is not meant.
  below 3%       "そろっている"

Writes palette_report.json and palette_report.md into --out.
"""
import json, os, statistics, sys

import cv2
import numpy as np

OFF_BAD = 0.15     # the whole picture is in other colours
OFF_MIX = 0.03     # one object in another colour


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def hue_dist(h, ref):
    d = np.abs(h - ref) % 360
    return np.minimum(d, 360 - d)


def derive(path):
    im = cv2.imread(path)
    im = cv2.resize(im, (320, round(im.shape[0] * 320 / im.shape[1])), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV_FULL).astype(np.float32)
    H = hsv[..., 0] * 360 / 256; S = hsv[..., 1] / 255; V = hsv[..., 2] / 255
    c = (S >= 0.12) & (V >= 0.08)
    a = np.deg2rad(H[c])
    hue = float(np.rad2deg(np.arctan2(np.sin(a).mean(), np.cos(a).mean())) % 360)
    tol = float(np.percentile(hue_dist(H[c], hue), 97)) + 12
    smax = float(np.percentile(S[c], 97)) + 0.03
    print(json.dumps({"palette": {"hue": round(hue), "hue_tol": round(max(15, tol)), "sat_max": round(smax, 2), "accents": []}},
                     ensure_ascii=False))


def main():
    if "--derive" in sys.argv:
        return derive(arg("--derive"))
    pos = [a for a in sys.argv[1:] if not a.startswith("--") and a not in (arg("--offset"), arg("--out"))]
    src, look_p = pos[0], pos[1]
    out = arg("--out") or os.path.dirname(os.path.abspath(src))
    off = float(arg("--offset", 0))
    os.makedirs(out, exist_ok=True)
    pal = json.load(open(look_p, encoding="utf-8-sig"))["palette"]
    base, tol, smax = pal["hue"], pal.get("hue_tol", 25), pal.get("sat_max", 0.35)
    accents = pal.get("accents", [])

    cap = cv2.VideoCapture(src)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    thumbs, small = [], []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(cv2.resize(f, (64, 36), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.int16)
        thumbs.append(g)
        small.append(cv2.resize(f, (320, round(f.shape[0] * 320 / f.shape[1])), interpolation=cv2.INTER_AREA))
    n = len(thumbs)
    d = [0.0] + [float(np.abs(thumbs[i] - thumbs[i - 1]).mean()) for i in range(1, n)]
    thr = max(10.0, 4 * statistics.median(d[1:]))
    cuts = [0] + [i for i in range(1, n) if d[i] > thr] + [n]

    shots = []
    for a, b in zip(cuts[:-1], cuts[1:]):
        t_a, t_b = off + a / fps, off + b / fps
        s = {"start": round(t_a, 2), "end": round(t_b, 2)}
        if b - a <= 2:
            continue
        offs, sats, hues = [], [], []
        for q in (0.25, 0.5, 0.75):
            i = min(b - 1, a + int((b - a) * q))
            t = off + i / fps
            hsv = cv2.cvtColor(small[i], cv2.COLOR_BGR2HSV_FULL).astype(np.float32)
            H = hsv[..., 0] * 360 / 256; S = hsv[..., 1] / 255; V = hsv[..., 2] / 255
            coloured = (S >= 0.12) & (V >= 0.08)
            ok = ~coloured | ((hue_dist(H, base) <= tol) & (S <= smax))
            for ac in accents:
                if ac.get("from") is not None and t < ac["from"]:
                    continue
                if ac.get("to") is not None and t > ac["to"]:
                    continue
                m = coloured & (S <= ac.get("sat_max", 1))
                if ac.get("hue") is not None:
                    m &= hue_dist(H, ac["hue"]) <= ac.get("hue_tol", 20)
                if m.mean() <= ac.get("max_share", 1):
                    ok |= m
            offs.append(float((~ok).mean()))
            if coloured.any():
                sats.append(float(np.percentile(S[coloured], 95)))
                hh = H[coloured & (S > 0.2)]
                if hh.size:
                    hist = np.bincount((hh // 10).astype(int) % 36, minlength=36)
                    hues.append(int(np.argmax(hist)) * 10 + 5)
        s.update(off_pct=round(100 * statistics.median(offs), 1), sat95=round(max(sats), 2) if sats else 0,
                 main_hue=statistics.median(hues) if hues else None)
        m = statistics.median(offs)
        s["verdict"] = "色が外れる" if m > OFF_BAD else ("混ざりもの" if m > OFF_MIX else "そろっている")
        shots.append(s)

    bad = [s for s in shots if s["verdict"] == "色が外れる"]
    mix = [s for s in shots if s["verdict"] == "混ざりもの"]
    json.dump({"video": os.path.basename(src), "palette": pal, "shots": shots}, open(os.path.join(out, "palette_report.json"), "w",
              encoding="utf-8"), ensure_ascii=False, indent=1)
    L = ["# 色の統一の点検", "", f"基準の色相 {base}度（±{tol}度、彩度{smax}まで）。ショット {len(shots)}本のうち、色が外れるのは {len(bad)}本、別の色の物が混ざるのは {len(mix)}本。",
         "", "外れの割合は、灰色に近い所を除いて、基準にも許した差し色にも当てはまらない色の画素が画面に占める割合です。15%を超えると「色が外れる」（絵全体が別の色）、3〜15%は「混ざりもの」（一部の物だけ別の色。意図したものでなければ絵かAEで色を寄せる）。",
         "", "| 判定 | 開始 | 長さ | 外れの割合 | 彩度（上位5%） | いちばん多い色相 |", "|---|---|---|---|---|---|"]
    for s in shots:
        L.append(f"| {s['verdict']} | {s['start']} | {round(s['end'] - s['start'], 2)} | {s['off_pct']}% | {s['sat95']} | {s['main_hue']} |")
    open(os.path.join(out, "palette_report.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(json.dumps({"shots": len(shots), "off_palette": len(bad), "mixed": len(mix)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
