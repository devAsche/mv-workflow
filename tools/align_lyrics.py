#!/usr/bin/env python3
"""Time every lyric character from CTC emissions (mv_align job) and the separated vocal.

    python tools/align_lyrics.py --emissions emissions.npz --readings readings.json \
        --timing timing.json --vocals vocals.wav --out timing_chars.json [--plots DIR]

How it works
  1. Each lyric character becomes CTC targets: its own character when the model knows it
     (--targets text), or its kana reading (--targets reading, the default; finer, because a
     kanji such as 雨 then has the two sounds あ・ま instead of one token).
  2. A Viterbi pass over the whole song puts the targets on 20 ms frames in lyric order. Each
     line may only sit inside its old window from timing.json, widened by --margin seconds, so a
     repeated hook cannot jump to the wrong repeat.
  3. The start of each character is then moved to the nearest rise of the vocal (an onset in
     the separated vocal) within --onset-before / --onset-after seconds; if there is none, the
     CTC time stays.
  4. Output: timing.json with `chars` on every line (start, end, ctc, onset, conf) and line
     start/end taken from the characters. With --plots, one PNG per group of lines: the vocal's
     spectrogram with every character drawn at its start, the old word starts dashed and the
     beats as ticks, for checking by eye.

readings.json: {"lines": [{"text": "...", "chars": [["雨", "あま"], ["粒", "つぶ"], ...]}]}, in the
same order as timing.json lines; a character with an empty reading (spaces, punctuation) gets
no target and takes the time of the next sounding character.
"""
import argparse, json, math, os, sys

import numpy as np

NEG = -1e9


def kata_to_hira(c):
    o = ord(c)
    return chr(o - 0x60) if 0x30A1 <= o <= 0x30F6 else c


def hira_to_kata(c):
    o = ord(c)
    return chr(o + 0x60) if 0x3041 <= o <= 0x3096 else c


def targets_for(char, reading, tok_index, mode):
    """Targets for one lyric character (may be empty): a list of tuples of token ids. A tuple lists
    spellings the model may use for the same sound (ぽ / ポ), which count as one target."""
    if not reading:
        return []
    if mode == "text" and char in tok_index:
        return [(tok_index[char],)]
    out = []
    for c in reading:
        ids = tuple(sorted({tok_index[v] for v in (c, kata_to_hira(c), hira_to_kata(c)) if v in tok_index}))
        if ids:
            out.append(ids)
    return out


def viterbi(logp, blank, labels, allowed):
    """CTC forced alignment. labels: token id per target; allowed: (lo, hi) frame range per target.
    Returns the state (2k+1 = target k, even = blank) of every frame."""
    T, L = logp.shape[0], len(labels)
    S = 2 * L + 1
    col = np.full(S, blank, dtype=np.int64)
    col[1::2] = labels
    lo = np.zeros(S, dtype=np.int64)
    hi = np.full(S, T, dtype=np.int64)
    for k, (a, b) in enumerate(allowed):
        lo[2 * k + 1], hi[2 * k + 1] = a, b
    skip = np.zeros(S, dtype=bool)                       # s-2 -> s allowed
    skip[3::2] = col[3::2] != col[1:-2:2]
    bp = np.zeros((T, S), dtype=np.int8)
    dp = np.full(S, NEG, dtype=np.float64)
    dp[0] = logp[0, blank]
    if lo[1] <= 0 < hi[1]:
        dp[1] = logp[0, col[1]]
    for t in range(1, T):
        s1 = np.concatenate(([NEG], dp[:-1]))
        s2 = np.concatenate(([NEG, NEG], dp[:-2]))
        s2 = np.where(skip, s2, NEG)
        cand = np.stack([dp, s1, s2])
        arg = cand.argmax(0)
        best = cand[arg, np.arange(S)]
        ok = (t >= lo) & (t < hi)
        dp = np.where(ok, best + logp[t, col], NEG)
        bp[t] = arg
    s = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
    if dp[s] <= NEG / 2:
        raise RuntimeError("no alignment fits the windows; try a larger --margin")
    path = np.empty(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(bp[t, s])
    return path


def vocal_onsets(vocals, hop_s=0.01):
    import librosa
    y, sr = librosa.load(vocals, sr=22050, mono=True)
    hop = int(sr * hop_s)
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median, n_mels=96, fmax=8000)
    peaks = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="frames",
                                       backtrack=False, delta=0.04, wait=4)
    rms = librosa.feature.rms(y=y, frame_length=2 * hop, hop_length=hop)[0]
    strength = env[peaks] / (env.max() or 1)
    return librosa.frames_to_time(peaks, sr=sr, hop_length=hop), strength, y, sr, rms


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--emissions", required=True)
    ap.add_argument("--readings", required=True)
    ap.add_argument("--timing", required=True)
    ap.add_argument("--vocals")
    ap.add_argument("--out", required=True)
    ap.add_argument("--targets", choices=["reading", "text"], default="reading")
    ap.add_argument("--margin", type=float, default=1.5)
    ap.add_argument("--onset-before", type=float, default=0.12)
    ap.add_argument("--onset-after", type=float, default=0.06)
    ap.add_argument("--plots")
    ap.add_argument("--lines", help="plot only these line numbers, e.g. 13-24 (1-based)")
    a = ap.parse_args()

    z = np.load(a.emissions)
    logp = z["logp"].astype(np.float32)
    tokens = [str(t) for t in z["tokens"]]
    blank, fs = int(z["blank"]), float(z["frame_sec"])
    tok_index = {t: i for i, t in enumerate(tokens) if i != blank and t}
    timing = json.load(open(a.timing, encoding="utf-8"))
    readings = json.load(open(a.readings, encoding="utf-8"))["lines"]
    lines = timing["lines"]
    if len(readings) != len(lines):
        sys.exit(f"readings has {len(readings)} lines, timing has {len(lines)}")

    labels, allowed, owner = [], [], []        # owner: (line, char) of each target
    merged = {}                                # tuple of spellings -> column of the widened matrix
    extra = []
    missing = []
    T = logp.shape[0]
    for i, (ln, rd) in enumerate(zip(lines, readings)):
        if rd["text"] != ln["text"]:
            sys.exit(f"line {i + 1} differs: {rd['text']} / {ln['text']}")
        w = (max(0, int((ln["start"] - a.margin) / fs)), min(T, int(math.ceil((ln["end"] + a.margin) / fs))))
        for j, (c, r) in enumerate(rd["chars"]):
            ids = targets_for(c, r, tok_index, a.targets)
            if r and not ids:
                missing.append(c)
            for tup in ids:
                if len(tup) == 1:
                    col = tup[0]
                else:
                    if tup not in merged:
                        merged[tup] = logp.shape[1] + len(extra)
                        extra.append(np.logaddexp.reduce(logp[:, list(tup)], axis=1))
                    col = merged[tup]
                labels.append(col); allowed.append(w); owner.append((i, j))
    if missing:
        print("no token for:", "".join(sorted(set(missing))), file=sys.stderr)
    if extra:
        logp = np.concatenate([logp, np.stack(extra, axis=1)], axis=1)
    path = viterbi(logp, blank, labels, allowed)

    # first/last frame and mean log-prob of every target
    st = np.full(len(labels), -1); en = np.full(len(labels), -1); conf = np.zeros(len(labels))
    for t, s in enumerate(path):
        if s % 2 == 1:
            k = s // 2
            if st[k] < 0:
                st[k] = t
            en[k] = t
    for k in range(len(labels)):
        conf[k] = float(np.mean(logp[st[k]:en[k] + 1, labels[k]]))

    onsets = strength = None
    if a.vocals:
        onsets, strength, y, sr, rms = vocal_onsets(a.vocals)

    def snap(t):
        if onsets is None:
            return None
        m = (onsets >= t - a.onset_before) & (onsets <= t + a.onset_after)
        if not m.any():
            return None
        cand, sc = onsets[m], strength[m]
        # nearest, but a much stronger rise slightly further away wins
        score = sc / (0.03 + np.abs(cand - t))
        return float(cand[np.argmax(score)])

    out_lines = []
    first_target = {}
    for k, (i, j) in enumerate(owner):
        first_target.setdefault((i, j), k)
    for i, (ln, rd) in enumerate(zip(lines, readings)):
        chars = []
        for j, (c, r) in enumerate(rd["chars"]):
            k = first_target.get((i, j))
            if k is None:
                chars.append({"c": c, "start": None})
                continue
            ctc = round(st[k] * fs + fs / 2, 3)
            on = snap(ctc)
            ks = [kk for kk, o in enumerate(owner) if o == (i, j)]
            chars.append({"c": c, "start": round(on if on is not None else ctc, 3), "ctc": ctc,
                          "onset": None if on is None else round(on, 3),
                          "conf": round(float(np.mean(conf[ks])), 2)})
        # silent characters take the next sounding start; keep starts increasing
        nxt = None
        for ch in reversed(chars):
            if ch["start"] is None:
                ch["start"] = nxt
            else:
                nxt = ch["start"]
        prev = -1.0
        for ch in chars:
            if ch["start"] is None:
                ch["start"] = prev
            if ch["start"] <= prev:
                ch["start"] = round(prev + 0.01, 3)
            prev = ch["start"]
        # end of a character: the next start, the last one ends where its sound ends
        last_k = max(kk for kk, o in enumerate(owner) if o[0] == i)
        line_end = round((en[last_k] + 1) * fs, 3)
        for j, ch in enumerate(chars):
            ch["end"] = chars[j + 1]["start"] if j + 1 < len(chars) else max(line_end, ch["start"] + 0.1)
        nl = dict(ln)
        nl["old_start"], nl["old_end"] = ln["start"], ln["end"]
        nl["start"], nl["end"] = chars[0]["start"], chars[-1]["end"]
        nl["chars"] = chars
        out_lines.append(nl)

    res = dict(timing)
    res["lines"] = out_lines
    res["version"] = str(timing.get("version", "")) + "+chars"
    res.setdefault("devices", {})["chars"] = f"ctc-viterbi/{a.targets}+onsets"
    res.setdefault("notes", []).append(
        f"characters timed by tools/align_lyrics.py (targets {a.targets}, margin {a.margin}s, "
        f"onset window -{a.onset_before}/+{a.onset_after}s)")
    json.dump(res, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    n_on = sum(1 for l in out_lines for c in l["chars"] if c.get("onset") is not None)
    n_all = sum(1 for l in out_lines for c in l["chars"] if c.get("ctc") is not None)
    print(f"{len(out_lines)} lines, {n_all} sounding characters, {n_on} moved to a vocal onset")
    for i, l in enumerate(out_lines, 1):
        print(f"{i:3d} {l['start']:7.2f} (old {l['old_start']:7.2f}, {l['start'] - l['old_start']:+.2f}) {l['text']}")

    if a.plots and a.vocals:
        plot(a, out_lines, timing, y, sr)


def plot(a, out_lines, timing, y, sr):
    import librosa
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    for f in ("IPAGothic", "Noto Sans CJK JP", "Yu Gothic", "MS Gothic"):
        if any(f == x.name for x in font_manager.fontManager.ttflist):
            plt.rcParams["font.family"] = f
            break
    os.makedirs(a.plots, exist_ok=True)
    sel = range(1, len(out_lines) + 1)
    if a.lines:
        p, q = (int(x) for x in a.lines.split("-"))
        sel = range(p, q + 1)
    beats = np.array(timing.get("beats", []))
    hop = 256
    S = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=1024, hop_length=hop)), ref=np.max)
    S = S[: S.shape[0] // 3]                       # up to ~3.7 kHz, where the syllables show
    for n in sel:
        l = out_lines[n - 1]
        t0, t1 = min(l["start"], l["old_start"]) - 0.4, max(l["end"], l["old_end"]) + 0.3
        f0, f1 = int(t0 * sr / hop), int(t1 * sr / hop)
        fig, ax = plt.subplots(figsize=(max(8, (t1 - t0) * 3.2), 3.2), dpi=110)
        ax.imshow(S[:, max(0, f0):f1], origin="lower", aspect="auto", cmap="magma",
                  extent=[t0, t1, 0, S.shape[0] * sr / 1024], vmin=-70, vmax=0)
        for b in beats[(beats >= t0) & (beats <= t1)]:
            ax.axvline(b, ymax=0.06, color="#7fd3ff", lw=2)
        for w in l.get("words", []):
            ax.axvline(w["start"], color="#bbbbbb", ls="--", lw=0.8)
        top = S.shape[0] * sr / 1024
        for ch in l["chars"]:
            if not ch["c"].strip():
                continue
            col = "#ffffff" if ch.get("onset") is not None else "#ffd84a"
            ax.axvline(ch["start"], color=col, lw=1.1)
            ax.text(ch["start"] + 0.01, top * 0.86, ch["c"], color=col, fontsize=15, va="top")
        ax.set_xlim(t0, t1)
        ax.set_yticks([])
        ax.set_title(f"line {n}  {l['start']:.2f}-{l['end']:.2f}  (old {l['old_start']:.2f})", fontsize=9)
        fig.tight_layout()
        fig.savefig(os.path.join(a.plots, f"line{n:02d}.png"))
        plt.close(fig)


if __name__ == "__main__":
    main()
