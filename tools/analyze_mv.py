# From the project's learning notes (07, 2026-11-11): measures any MV file the same way the reference MVs were measured,
# so a render of ours can be compared with them. Needs numpy, opencv-python, Pillow, librosa and ffmpeg on PATH
# (C:\AI model\venv-mv has most of them). AV1 files: convert first with
#   ffmpeg -i in.mp4 -vf scale=960:-2 -c:v libx264 -crf 20 out.mp4
"""MV analysis: cut detection, shot lengths, beat alignment, contact sheets.
usage: python analyze_mv.py <video> <outdir> [sheet_step_sec]
"""
import sys, os, json, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
step = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
os.makedirs(out, exist_ok=True)

cap = cv2.VideoCapture(src)
fps = cap.get(cv2.CAP_PROP_FPS)
prev = None; diffs = []; stats = []; thumbs = {}; i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    t = i / fps
    small = cv2.resize(f, (64, 36), interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.int16)
    d = float(np.abs(g - prev).mean()) if prev is not None else 0.0
    prev = g
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    stats.append((t, d, float(g.mean()), float(hsv[..., 1].mean())))
    k = round(t / step)
    if abs(t - k * step) < 0.5 / fps and k not in thumbs:
        thumbs[k] = cv2.cvtColor(cv2.resize(f, (240, 135), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
    i += 1
dur = i / fps
D = np.array([s[1] for s in stats]); T = np.array([s[0] for s in stats])
cuts = []
for j in range(1, len(D)):
    w = np.median(D[max(1, j - 12):j + 12])
    if D[j] > 14 and D[j] > 3.2 * w + 4:
        if not cuts or T[j] - cuts[-1] > 0.2:
            cuts.append(T[j])

# audio beats
wav = os.path.join(out, 'a.wav')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '22050', wav], check=True)
import librosa
y, sr = librosa.load(wav, sr=22050)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
bt = librosa.frames_to_time(beats, sr=sr)
tempo = float(np.atleast_1d(tempo)[0])
beat = 60 / tempo
onset_env = librosa.onset.onset_strength(y=y, sr=sr)
rms = librosa.feature.rms(y=y)[0]
rms_t = librosa.frames_to_time(np.arange(len(rms)), sr=sr)

def nearest(arr, x):
    k = np.argmin(np.abs(arr - x)); return arr[k] - x
# cut alignment to beat grid (half-beat resolution)
offs = [nearest(bt, c) for c in cuts]
on_beat = sum(1 for o in offs if abs(o) <= 2 / fps + 0.02)
half = np.sort(np.concatenate([bt, bt[:-1] + np.diff(bt) / 2]))
on_half = sum(1 for c in cuts if abs(nearest(half, c)) <= 2 / fps + 0.02)
shots = np.diff([0] + cuts + [dur])
# per-10s loudness vs cuts
sec = []
for t0 in np.arange(0, dur, 10):
    nc = sum(1 for c in cuts if t0 <= c < t0 + 10)
    m = (rms_t >= t0) & (rms_t < t0 + 10)
    sm = [s for s in stats if t0 <= s[0] < t0 + 10]
    mot = np.median([s[1] for s in sm]) if sm else 0
    sec.append(dict(t=int(t0), cuts=nc, loud=round(float(rms[m].mean()) * 100, 1) if m.any() else 0,
                    lum=round(float(np.mean([s[2] for s in sm])), 0) if sm else 0,
                    sat=round(float(np.mean([s[3] for s in sm])), 0) if sm else 0,
                    motion=round(float(mot), 2)))
res = dict(file=os.path.basename(src), dur=round(dur, 2), fps=fps, tempo=round(tempo, 1), beat_sec=round(beat, 3),
           ncuts=len(cuts), asl=round(dur / (len(cuts) + 1), 2),
           shot_len_in_beats=[round(s / beat, 1) for s in shots],
           cuts=[round(c, 2) for c in cuts],
           cuts_on_beat_pct=round(100 * on_beat / max(1, len(cuts))),
           cuts_on_halfbeat_pct=round(100 * on_half / max(1, len(cuts))),
           per10s=sec)
json.dump(res, open(os.path.join(out, 'analysis.json'), 'w'), ensure_ascii=False, indent=1)

# contact sheets
keys = sorted(thumbs)
cols = 8; per = cols * 7
for si in range(0, len(keys), per):
    sub = keys[si:si + per]
    rows = (len(sub) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 240, rows * 135))
    dr = ImageDraw.Draw(sheet)
    for n, k in enumerate(sub):
        x, y0 = (n % cols) * 240, (n // cols) * 135
        sheet.paste(Image.fromarray(thumbs[k]), (x, y0))
        t = k * step
        if any(t - step < c <= t for c in cuts):
            dr.rectangle([x + 1, y0 + 1, x + 238, y0 + 133], outline=(255, 0, 0), width=3)
        dr.rectangle([x, y0, x + 44, y0 + 14], fill=(0, 0, 0))
        dr.text((x + 2, y0 + 1), f'{t:.1f}', fill=(255, 255, 0))
    sheet.save(os.path.join(out, f'sheet_{si // per:02d}.jpg'), quality=82)
print(json.dumps({k: v for k, v in res.items() if k not in ('per10s', 'cuts', 'shot_len_in_beats')}, ensure_ascii=False))
