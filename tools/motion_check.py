"""Find shots in a render where nothing moves but the camera ("a fast slideshow of stills").

usage: python3 motion_check.py <video> [--timing timing.json] [--offset SEC] [--out DIR]

--offset is the song time of the video's first frame (a section render starts mid-song); with --timing the shot
lengths are also given in beats and each shot is matched to its section.

How it measures
- Cuts: the mean change of a 64x36 grey thumbnail between frames, above max(10, 4x the median) = a cut.
  Shots of 2 frames or fewer are flashes and are listed but not judged.
- Inside each shot, dense optical flow (Farneback) between slightly blurred frames at 320 px wide (blurred so that
  film grain does not count). The flow where the picture has texture is fitted with one camera move (pan + zoom +
  roll); the previous frame is warped by that move alone and compared with the next one. What still differs by more
  than 10/255 moved or changed by itself: rain, drops, hair, light, a figure, letters appearing. The shot's value is
  the median share of the frame that changed this way.
- Letters count as change too. To judge the pictures themselves, measure a render made without the lyrics
  (build_shots.jsx with params.pass = "plate").
- Limits: a sway slower than about 0.5 px per frame at 1920 wide is not counted. Checked on 雨粒パレード v4 (the
  review found it camera-only; this reports 28 of 32 shots camera-only) and on synthetic clips (zoom only, zoom +
  falling rain).
- Option --gap N compares frames N apart (default 1).
- Verdicts: "止め絵" (still: neither camera nor anything in the picture moves), "カメラだけ" (only a pan/zoom of a
  still picture), "動いている" (something inside the picture moves on at least 3% of the frame).
  The review of 雨粒パレード v4 (2026-11-12) found nearly every shot to be "camera only"; this tool makes that
  number visible before a person has to point it out.

Writes motion_report.json and motion_report.md (Japanese table) into --out (default: next to the video).
"""
import json, os, statistics, sys

import cv2
import numpy as np

W = 320
DIFF = 10           # grey levels (of 255) left over after removing the camera move = something moved or changed
TEX = 6              # gradient strength where flow can be trusted (flat areas say nothing about motion)
MARGIN = 8
GAP = int(sys.argv[sys.argv.index("--gap") + 1]) if "--gap" in sys.argv else 1   # frames between the two compared (1 matched the v4 review best)
LOCAL_SHARE = 0.03   # share of the frame that must move locally
CAM_PX = 0.08        # mean camera move per frame below this = no camera move


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def fit_camera(flow, xs, ys):
    """Least-squares similarity motion u = a*x - b*y + tx, v = b*x + a*y + ty over a grid sample."""
    u = flow[ys, xs, 0].ravel(); v = flow[ys, xs, 1].ravel()
    x = (xs - flow.shape[1] / 2).ravel().astype(np.float64); y = (ys - flow.shape[0] / 2).ravel().astype(np.float64)
    n = len(u)
    A = np.zeros((2 * n, 4)); A[:n, 0] = x; A[:n, 1] = -y; A[:n, 2] = 1; A[n:, 0] = y; A[n:, 1] = x; A[n:, 3] = 1
    p, *_ = np.linalg.lstsq(A, np.concatenate([u, v]), rcond=None)
    return p   # a (zoom-1), b (roll), tx, ty


def main():
    src = [a for a in sys.argv[1:] if not a.startswith("--") and a not in (arg("--timing"), arg("--offset"), arg("--out"), arg("--gap"))][0]
    out = arg("--out") or os.path.dirname(os.path.abspath(src))
    off = float(arg("--offset", 0))
    tm = json.load(open(arg("--timing"), encoding="utf-8-sig")) if arg("--timing") else None
    os.makedirs(out, exist_ok=True)

    cap = cv2.VideoCapture(src)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames, blurred, grads, thumbs = [], [], [], []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        h = round(f.shape[0] * W / f.shape[1])
        g = cv2.cvtColor(cv2.resize(f, (W, h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        frames.append(g)
        blurred.append(cv2.GaussianBlur(g, (0, 0), 1.6))   # film grain and compression noise are not motion
        gxm = cv2.Sobel(blurred[-1], cv2.CV_32F, 1, 0); gym = cv2.Sobel(blurred[-1], cv2.CV_32F, 0, 1)
        grads.append(np.hypot(gxm, gym) / 8)
        thumbs.append(cv2.resize(g, (64, 36), interpolation=cv2.INTER_AREA).astype(np.int16))
    n = len(frames)
    if n < 3:
        sys.exit("too few frames")
    d = [0.0] + [float(np.abs(thumbs[i] - thumbs[i - 1]).mean()) for i in range(1, n)]
    thr = max(10.0, 4 * statistics.median(d[1:]))
    cuts = [0] + [i for i in range(1, n) if d[i] > thr] + [n]
    hh, ww = frames[0].shape
    gy, gx = np.mgrid[8:hh - 8:6, 8:ww - 8:6]

    beats = tm["beats"] if tm else None
    beat_len = 60.0 / tm["bpm"] if tm else None
    shots = []
    for a, b in zip(cuts[:-1], cuts[1:]):
        t_a, t_b = off + a / fps, off + b / fps
        s = {"start": round(t_a, 2), "end": round(t_b, 2), "frames": b - a}
        if beat_len:
            s["beats"] = round((t_b - t_a) / beat_len, 1)
            for sec in tm.get("sections", []):
                if sec["start"] <= t_a < sec["end"]:
                    s["section"] = sec["label"]
        if b - a <= 2:
            s["verdict"] = "フラッシュ"
            shots.append(s); continue
        gap = min(GAP, b - a - 1)
        step = max(1, (b - a - gap) // 24)      # at most ~24 pairs per shot
        shares, cams, zooms = [], [], []
        for i in range(a + gap, b, step):
            A, B = blurred[i - gap], blurred[i]
            flow = cv2.calcOpticalFlowFarneback(A, B, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            tex = grads[i - 1][gy, gx] > TEX                 # fit the camera only where the picture has texture
            if tex.sum() < 30:
                tex = np.ones_like(tex)
            za, zb, tx, ty = fit_camera(flow, gx[tex], gy[tex])
            # warp the previous frame by the camera move alone; what still differs moved by itself
            M = np.array([[1 + za, -zb, tx - za * ww / 2 + zb * hh / 2], [zb, 1 + za, ty - zb * ww / 2 - za * hh / 2]], np.float32)
            warped = cv2.warpAffine(A, M, (ww, hh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            diff = cv2.absdiff(warped, B)[MARGIN:-MARGIN, MARGIN:-MARGIN]
            shares.append(float((diff > DIFF).mean()))
            yy, xx = np.mgrid[0:hh:4, 0:ww:4]
            x = xx - ww / 2; y = yy - hh / 2
            cams.append(float(np.hypot(za * x - zb * y + tx, zb * x + za * y + ty).mean()) / gap)
            zooms.append(float(za) / gap)
        share = statistics.median(shares); cam = statistics.median(cams)
        s.update(local_share=round(share * 100, 1), camera_px=round(cam, 3),
                 zoom_pct_s=round(statistics.median(zooms) * fps * 100, 2))
        if share >= LOCAL_SHARE:
            s["verdict"] = "動いている"
        elif cam >= CAM_PX:
            s["verdict"] = "カメラだけ"
        else:
            s["verdict"] = "止め絵"
        shots.append(s)

    judged = [s for s in shots if s["verdict"] != "フラッシュ"]
    moving = [s for s in judged if s["verdict"] == "動いている"]
    secs = lambda ss: sum(s["end"] - s["start"] for s in ss)
    summary = {"shots": len(judged), "moving": len(moving),
               "moving_time_pct": round(100 * secs(moving) / max(1e-6, secs(judged)), 1),
               "camera_only": sum(s["verdict"] == "カメラだけ" for s in judged),
               "still": sum(s["verdict"] == "止め絵" for s in judged), "flashes": len(shots) - len(judged)}
    json.dump({"video": os.path.basename(src), "fps": fps, "offset": off, "summary": summary, "shots": shots},
              open(os.path.join(out, "motion_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    L = ["# 絵の中の動きの点検", "",
         f"動画 {os.path.basename(src)}。ショット {summary['shots']}本のうち、絵の中で何かが動いているのは {summary['moving']}本"
         f"（時間で {summary['moving_time_pct']}%）。カメラの寄り・横移動だけが {summary['camera_only']}本、完全な止め絵が {summary['still']}本。",
         "", "「動いている」は、前のコマをカメラの動き（寄り・横移動・回転）だけで動かして次のコマと比べたとき、明るさが10/255以上違う所が画面の3%以上あるショットです。歌詞の文字が出る・動くのも数に入るので、絵だけを見るには歌詞なしの書き出しで測ります。1コマに画面幅の0.03%未満しか動かないごく遅い揺れは数えません。",
         "", "| 判定 | 開始 | 長さ | 拍 | 区間 | 絵の中で動く面積 | カメラの動き(px/コマ) | 寄り(%/秒) |", "|---|---|---|---|---|---|---|---|"]
    for s in shots:
        if s["verdict"] == "フラッシュ":
            continue
        L.append(f"| {s['verdict']} | {s['start']} | {round(s['end'] - s['start'], 2)} | {s.get('beats', '')} | {s.get('section', '')} | "
                 f"{s['local_share']}% | {s['camera_px']} | {s['zoom_pct_s']} |")
    open(os.path.join(out, "motion_report.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
