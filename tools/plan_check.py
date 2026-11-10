"""Check a shot list (build_shots.jsx job or its params) against the cut-rhythm and framing targets from the
learning notes, before anything is built.

usage: python3 plan_check.py <job.json> [timing.json] [--md out.md]

What it counts
- switches: a new shot, a background change inside a shot (bgs), a flash, a black frame (start and end).
  These are what a viewer feels as "the picture changed".
- switches per 15 s, per section of the song (timing.json sections) and against a target per kind of section:
  chorus 8-15, pre-chorus 3-7, verse 1-4, intro / bridge / outro 0-3. The chorus should have at least 3x the
  quiet sections.
- shot lengths in beats: median about 2, 30-50% at one beat or less, at most 10% at 8 beats or more.
- where switches land: on a beat, on a half beat, or on the start of a sung word (any of these is fine; none is "off").
- how many shots show a face: shots carry view: "face" | "eyes" | "bust" | "profile" (a face) or "hand" | "feet" |
  "back" | "item" | "scene" | "sky" | "type" | "motion" ... (no face). Faces should be half or fewer.
"""
import json, sys, statistics

FACE = {"face", "eyes", "bust", "profile", "smile", "closeup"}
TARGET = {"chorus": (8, 15), "pre": (3, 7), "verse": (1, 4), "quiet": (0, 3)}


def kind_of(label):
    l = label.lower()
    if "pre" in l:
        return "pre"
    if "chorus" in l or "サビ" in label:
        return "chorus"
    if "verse" in l or "メロ" in label:
        return "verse"
    return "quiet"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    md_out = sys.argv[sys.argv.index("--md") + 1] if "--md" in sys.argv else None
    if md_out in args:
        args.remove(md_out)
    job = json.load(open(args[0], encoding="utf-8-sig"))
    P = job.get("params", job)
    tm = json.load(open(args[1], encoding="utf-8-sig")) if len(args) > 1 else None
    off, dur, fps = P.get("offset", 0), P["dur"], P.get("fps", 30)
    t0, t1 = off, off + dur
    shots = P["shots"]

    ev = []                                            # (song time, what)
    for i, s in enumerate(shots):
        if i and s["t0"] > t0 + 1e-3:
            ev.append((s["t0"], "shot"))
        for b in s.get("bgs") or []:
            if b.get("tIn") is not None and b["tIn"] > s["t0"] + 1e-3:
                ev.append((b["tIn"], "bg"))
        for f in s.get("fx") or []:
            if "flash" in f:
                ev.append((f["flash"], "flash"))
            if "black" in f:
                ev.append((f["black"][0], "black"))
                ev.append((f["black"][1], "black end"))
    ev.sort()
    times = [e[0] for e in ev if t0 < e[0] < t1]

    beat = 60.0 / tm["bpm"] if tm else None
    out = {"range": [t0, t1], "switches": len(times), "per15": round(len(times) / dur * 15, 1)}
    lines = ["# 絵コンテの点検", "", "範囲 %.2f〜%.2f秒（%.1f秒）、切り替わり %d回、15秒あたり %.1f回" % (t0, t1, dur, len(times), out["per15"]), ""]

    if tm:
        lines += ["## 区間ごとの切り替え密度（15秒あたり）", "", "| 区間 | 範囲内の長さ | 回数 | 15秒あたり | 目安 | 判定 |", "|---|---|---|---|---|---|"]
        dens = {}
        for sec in tm["sections"]:
            a, b = max(t0, sec["start"]), min(t1, sec["end"])
            if b - a < 2:
                continue
            n = sum(1 for t in times if a <= t < b)
            k = kind_of(sec["label"])
            lo, hi = TARGET[k]
            d = n / (b - a) * 15
            dens.setdefault(k, []).append(d)
            ok = "OK" if lo <= d <= hi else ("少ない" if d < lo else "多い")
            lines.append("| %s | %.1f秒 | %d | %.1f | %d〜%d | %s |" % (sec["label"], b - a, n, d, lo, hi, ok))
        if "chorus" in dens and "quiet" in dens and max(dens["quiet"]) > 0:
            lines.append("")
            lines.append("サビと静かな区間の比: %.1f倍（3倍以上が目安）" % (min(dens["chorus"]) / max(dens["quiet"])))
        out["sections"] = dens

        edges = [t0] + times + [t1]
        lens = [(b - a) / beat for a, b in zip(edges, edges[1:])]
        med = statistics.median(lens)
        short = sum(1 for x in lens if x <= 1.1) / len(lens) * 100
        long_ = sum(1 for x in lens if x >= 7.9) / len(lens) * 100
        out.update(beats_median=round(med, 1), short_pct=round(short), long_pct=round(long_))
        lines += ["", "## ショットの長さ（拍）", "",
                  "中央値 %.1f拍（目安 約2拍）、1拍以下 %d%%（目安 30〜50%%）、8拍以上 %d%%（目安 10%%以下）" % (med, round(short), round(long_)),
                  "", "長さの並び: " + " ".join("%.1f" % x for x in lens)]

        tol = 2.0 / fps + 0.02
        bt = tm["beats"]
        half = sorted(bt + [(a + b) / 2 for a, b in zip(bt, bt[1:])])
        words = [w["start"] for ln in tm.get("lines", []) for w in ln.get("words", [])]
        def near(arr, t):
            return min((abs(x - t) for x in arr), default=9) <= tol
        on_b = sum(1 for t in times if near(bt, t))
        on_h = sum(1 for t in times if near(half, t))
        on_w = sum(1 for t in times if near(words, t))
        stray = [round(t, 2) for t in times if not (near(half, t) or near(words, t))]
        lines += ["", "## 切り替えの位置", "",
                  "拍の頭 %d/%d、半拍まで含めて %d/%d、歌の言葉の頭 %d/%d" % (on_b, len(times), on_h, len(times), on_w, len(times))]
        if stray:
            lines.append("どれにも乗っていない切り替え（ずれて見える）: " + ", ".join(map(str, stray)))
        out.update(on_beat=on_b, on_half=on_h, on_word=on_w, stray=stray)

    tagged = [(s.get("view"), s["t1"] - s["t0"]) for s in shots]
    face = [v for v in tagged if v[0] in FACE]
    known = [v for v in tagged if v[0]]
    lines += ["", "## 顔が映るカット", ""]
    if known:
        pct = len(face) / len(known) * 100
        tpct = sum(d for _, d in face) / sum(d for _, d in known) * 100
        run, best = 0, 0
        for v, _ in tagged:
            run = run + 1 if v in FACE else 0
            best = max(best, run)
        lines.append("顔 %d/%d カット（%d%%、時間では %d%%）。目安は半分以下。顔が続く最長 %d カット。" % (len(face), len(known), round(pct), round(tpct), best))
        counts = {}
        for v, _ in known:
            counts[v] = counts.get(v, 0) + 1
        lines.append("内訳: " + "、".join("%s %d" % (k, n) for k, n in sorted(counts.items(), key=lambda x: -x[1])))
        out.update(face_pct=round(pct), face_time_pct=round(tpct), face_run=best)
    missing = sum(1 for v in tagged if not v[0])
    if missing:
        lines.append("view が書かれていないショット %d（顔の割合に入れていない）" % missing)

    text = "\n".join(lines) + "\n"
    if md_out:
        open(md_out, "w", encoding="utf-8").write(text)
    print(text)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
