# cover_check.py - before an AE run: does every background still cover the frame once its looks, rotation and mirror are
# applied? (2026-11-13: five turning shots of a render showed the picture's corners as black wedges; the stills had missed
# most of them because they fell between still times or under the letterbox's edge.)
# It mirrors build_shots.jsx buildBg: cover fit * extra, anchor = pivot, focusPos with its clamp, rotation about the anchor,
# mirror about the anchor (the mirrored picture only reaches 2 * anchor.x), and samples each shot 41 times. Only the part of
# the frame the letterbox leaves open (a "bars" fx with "band") has to be covered. For a shot that fails it prints the zoom
# factor on all look keys that would clear it. Margins are in source pixels; 0 means touching the edge.
#
# usage: python3 tools/cover_check.py <make_job.py>
#   the job script must define W, H, S (the shot list) and IMG ({name: {"path", "size"}}) at module level and only build
#   the job under if __name__ == "__main__".
import sys, math, importlib.util
def load(path):
    global mj, W, H
    spec = importlib.util.spec_from_file_location("mj", path); mj = importlib.util.module_from_spec(spec)
    argv = sys.argv; sys.argv = [argv[0]]; spec.loader.exec_module(mj); sys.argv = argv
    W, H = mj.W, mj.H
    return mj
def ease(u): return u * u * (3 - 2 * u)
def interp(keys, t):
    if t <= keys[0][0]: return keys[0][1:]
    for a, b in zip(keys, keys[1:]):
        if a[0] <= t <= b[0]:
            u = ease((t - a[0]) / (b[0] - a[0])) if b[0] > a[0] else 1
            return [x + (y - x) * u for x, y in zip(a[1:], b[1:])]
    return keys[-1][1:]
def size_of(img):
    for v in mj.IMG.values():
        if v["path"] == img: return v["size"]
def band_of(s):
    for f in s.get("fx", []):
        if isinstance(f, dict) and "bars" in f and "to" not in f: return f.get("band", H)
    return H
def margin(b, s, t0, t1, zf, band):
    sw, sh = size_of(b["img"])
    base = max(W / sw, H / sh) * (b.get("extra") or 1.12)
    a = b.get("pivot") or [sw / 2, sh / 2]
    x0, x1 = (max(0, 2 * a[0] - sw), min(sw, 2 * a[0])) if (b.get("mirror") or b.get("flip")) else (0, sw)
    rot = b.get("rot", b.get("tilt")) or 0
    rk = [list(r) for r in rot] if isinstance(rot, list) else [[t0, rot]]
    looks = b.get("look") or [[t0, 100, None]]
    yt, yb = (H - band) / 2, H - (H - band) / 2
    worst = (1e9, None)
    for i in range(41):
        t = t0 + (t1 - t0) * i / 40
        pk = []
        for lk in looks:
            k = base * lk[1] * zf / 100
            f = lk[2] if lk[2] else (sw / 2, sh / 2)
            sc = lk[3] if len(lk) > 3 and lk[3] else (W / 2, H / 2)
            x = sc[0] - (f[0] - a[0]) * k; y = sc[1] - (f[1] - a[1]) * k
            x = min(a[0] * k, max(W - (sw - a[0]) * k, x)); y = min(a[1] * k, max(H - (sh - a[1]) * k, y))
            pk.append([lk[0], k, x, y])
        k, px, py = interp(pk, t)
        th = math.radians(interp(rk, t)[0])
        m = 1e9
        for X, Y in ((0, yt), (W, yt), (0, yb), (W, yb)):
            dx, dy = (X - px) / k, (Y - py) / k
            sx = a[0] + dx * math.cos(th) + dy * math.sin(th)
            sy = a[1] - dx * math.sin(th) + dy * math.cos(th)
            m = min(m, sx - x0, sy, x1 - sx, sh - sy)
        if m < worst[0]: worst = (m, round(t, 2))
    return worst
def main():
    for s in mj.S:
      for b in [s.get("bg") or {}] + list(s.get("bgs") or []):
          if not b.get("img") or b.get("win"): continue
          if b.get("rot", b.get("tilt")) is None and not b.get("mirror"): continue
          t0 = b.get("tIn", s["t0"]); t1 = b.get("tOut", s["t1"])
          band = band_of(s)
          m, at = margin(b, s, t0, t1, 1.0, band)
          need = ""
          if m < 4:
              zf = 1.0
              while margin(b, s, t0, t1, zf, band)[0] < 4 and zf < 2: zf += 0.005
              need = f"-> zoom x{zf:.3f} (looks {[round(l[1] * zf) for l in (b.get('look') or [[0, 100]])]})"
          print(f'{t0:6.2f}-{t1:6.2f} band {band} rot {b.get("rot", b.get("tilt"))} margin {m:7.1f} at {at} {"EXPOSED" if m < 0 else "ok"} {need}')

if __name__ == "__main__":
    load(sys.argv[1]); main()
