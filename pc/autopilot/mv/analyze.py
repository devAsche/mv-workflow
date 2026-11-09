"""Song analysis for the MV workflow. Runs inside C:\\AI model\\venv-mv (see mv_jobs.py).

Input : a song (wav/mp3/...) and, optionally, its lyrics as a text file in Suno style
        ([Verse 1], [Chorus] ... tags on their own lines are read as section names).
Output: <outdir>/timing.json   beats, downbeats, bpm, energy curve, sections, lyric lines with per-word times
        <outdir>/lyrics.srt    the same lyric lines as subtitles (for checking by eye / in Premiere)
        <outdir>/vocals.wav, no_vocals.wav  (Demucs, unless --skip-separation)

Every stage has a fallback so one failing library never stops the whole analysis; the
fallbacks used are recorded in timing.json["devices"] and ["notes"].
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile

import numpy as np
import soundfile as sf

SECTION_TAG = re.compile(r"^\s*[\[\(（【]\s*([^\]\)）】]+?)\s*[\]\)）】]\s*$")


def log(*a):
    print("[analyze]", *a, flush=True)


def to_wav(src, dst, sr=44100):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "2", "-ar", str(sr), dst], check=True)
    return dst


MD_HEADING = re.compile(r"^\s*(?:#{1,6}\s+(.+?)\s*#*\s*|\*\*(.+?)\*\*|__(.+?)__)\s*$")


def parse_lyrics(path, notes=None):
    """Return [(section_label or None, line_text), ...] without blank lines.

    Suno-style tags ([Verse 1], [Chorus] ...) become section labels. Markdown headings
    (# Title, **Title**) are not sung: a heading that holds a tag is used as a label, any
    other heading (usually the song title) is skipped. When the file has no tags at all,
    sections are inferred from blank lines: the longest runs of blank lines separate
    sections and are labelled "Part 1", "Part 2" ... (renamed later by loudness)."""
    if not path:
        return []
    out, label, tagged, blanks, gaps = [], None, False, 0, []
    for raw in open(path, encoding="utf-8-sig"):
        line = raw.strip()
        if not line:
            blanks += 1
            continue
        h = MD_HEADING.match(line)
        if h:
            inner = next(g for g in h.groups() if g)
            m = SECTION_TAG.match(inner)
            if m:
                label, tagged = m.group(1).strip(), True
            elif notes is not None:
                notes.append(f"skipped heading line: {inner}")
            blanks = 0
            continue
        m = SECTION_TAG.match(line)
        if m:
            label, tagged = m.group(1).strip(), True
            blanks = 0
            continue
        gaps.append(blanks if out else 0)
        blanks = 0
        out.append((label, line))
    if not tagged and out:
        cut = max(gaps[1:] or [0])
        if cut >= 2:  # only when the file really uses longer gaps between sections
            part, res = 1, []
            for i, (_, text) in enumerate(out):
                if i > 0 and gaps[i] >= cut:
                    part += 1
                res.append((f"Part {part}", text))
            out = res
            if notes is not None:
                notes.append(f"no section tags: {part} sections inferred from blank lines (gap >= {cut})")
    return out


def name_inferred_sections(lines, energy, hop, notes):
    """'Part N' sections get names from loudness: the loudest third are Chorus, a quiet last
    part is Outro, the rest Verse. A guess for the first storyboard, meant to be edited."""
    parts = []
    for ln in lines:
        if ln["section"] and ln["section"].startswith("Part ") and (not parts or parts[-1]["label"] != ln["section"]):
            parts.append({"label": ln["section"], "start": ln["start"], "end": ln["end"]})
        elif parts and ln["section"] == parts[-1]["label"]:
            parts[-1]["end"] = ln["end"]
    if len(parts) < 3:
        return
    e = np.asarray(energy)
    for p in parts:
        a, b = int(p["start"] / hop), max(int(p["start"] / hop) + 1, int(p["end"] / hop))
        p["loud"] = float(e[a:b].mean()) if b <= len(e) and a < b else 0.0
    louds = sorted(p["loud"] for p in parts)
    thr = louds[int(len(louds) * 2 / 3)]
    names, n_ch, n_v = {}, 0, 0
    for i, p in enumerate(parts):
        if p["loud"] >= thr:
            n_ch += 1; names[p["label"]] = f"Chorus {n_ch}"
        elif i == len(parts) - 1:
            names[p["label"]] = "Outro"
        else:
            n_v += 1; names[p["label"]] = f"Verse {n_v}"
    for ln in lines:
        if ln["section"] in names:
            ln["section"] = names[ln["section"]]
    notes.append("section names guessed from loudness: " + ", ".join(f"{k}={v}" for k, v in names.items()))


def separate(wav, outdir, device, notes):
    try:
        tmp = tempfile.mkdtemp(prefix="demucs_")
        cmd = [sys.executable, "-m", "demucs", "--two-stems", "vocals", "-n", "htdemucs", "-d", device, "-o", tmp, wav]
        log("demucs:", " ".join(cmd))
        subprocess.run(cmd, check=True)
        stem_dir = os.path.join(tmp, "htdemucs", os.path.splitext(os.path.basename(wav))[0])
        for name in ("vocals.wav", "no_vocals.wav"):
            shutil.copy2(os.path.join(stem_dir, name), os.path.join(outdir, name))
        shutil.rmtree(tmp, ignore_errors=True)
        return os.path.join(outdir, "vocals.wav")
    except Exception as e:
        notes.append(f"separation failed, aligning on the full mix: {e}")
        return None


def track_beats(wav, device, notes):
    try:
        from beat_this.inference import File2Beats
        beats, downbeats = File2Beats(checkpoint_path="final0", device=device, dbn=False)(wav)
        beats, downbeats = np.asarray(beats, float), np.asarray(downbeats, float)
        if len(downbeats) > len(beats):                     # guard against a swapped return order
            beats, downbeats = downbeats, beats
        return beats, downbeats, "beat_this"
    except Exception as e:
        notes.append(f"beat_this failed, using librosa (no real downbeats): {e}")
        import librosa
        y, sr = librosa.load(wav, sr=22050, mono=True)
        _, b = librosa.beat.beat_track(y=y, sr=sr, units="time")
        b = np.asarray(b, float)
        return b, b[::4], "librosa"


def energy_curve(wav, hop_s=0.25):
    y, sr = sf.read(wav, always_2d=True)
    y = y.mean(axis=1)
    hop = int(sr * hop_s)
    n = len(y) // hop
    rms = np.sqrt(np.mean(y[: n * hop].reshape(n, hop) ** 2, axis=1))
    rms = rms / (rms.max() or 1)
    return [round(float(v), 3) for v in rms], len(y) / sr


def align(vocals, lines, language, model_name, device, notes):
    import stable_whisper
    try:
        model = stable_whisper.load_model(model_name, device=device)
    except Exception as e:
        notes.append(f"whisper on {device} failed, using cpu: {e}")
        device = "cpu"
        model = stable_whisper.load_model(model_name, device=device)
    if lines:
        text = "\n".join(t for _, t in lines)
        res = model.align(vocals, text, language=language, original_split=True)
    else:
        res = model.transcribe(vocals, language=language, regroup=True)
    segs = []
    for s in res.segments:
        words = [{"text": w.word, "start": round(float(w.start), 3), "end": round(float(w.end), 3)} for w in (s.words or [])]
        segs.append({"text": s.text.strip(), "start": round(float(s.start), 3), "end": round(float(s.end), 3), "words": words})
    return segs, f"stable-ts/{model_name}/{device}"


def attach_sections(lines, segs, notes):
    """Give each aligned segment its lyric line and section label."""
    if lines and len(segs) != len(lines):
        notes.append(f"aligned segments ({len(segs)}) != lyric lines ({len(lines)}); labels follow segment order")
    out = []
    for i, s in enumerate(segs):
        label = lines[i][0] if i < len(lines) else None
        text = lines[i][1] if i < len(lines) and len(segs) == len(lines) else s["text"]
        out.append(dict(s, text=text, section=label))
    return out


def build_sections(lines, duration, downbeats):
    """Sections from lyric tags: a section starts at the first line carrying a new label."""
    sec = []
    for ln in lines:
        lab = ln["section"] or "part"
        if not sec or sec[-1]["label"] != lab:
            sec.append({"label": lab, "start": ln["start"]})
    if sec and sec[0]["start"] > 1.0:
        sec.insert(0, {"label": "Intro", "start": 0.0})
    for i, s in enumerate(sec):
        s["end"] = sec[i + 1]["start"] if i + 1 < len(sec) else round(duration, 3)
        # nearest downbeat at or before the first sung word, for cutting on the bar
        prev = downbeats[downbeats <= s["start"] + 0.05] if len(downbeats) else []
        s["downbeat"] = round(float(prev[-1]), 3) if len(prev) else s["start"]
    if sec and duration - sec[-1]["start"] > 0 and lines and duration - lines[-1]["end"] > 4:
        sec[-1]["end"] = lines[-1]["end"]
        sec.append({"label": "Outro", "start": lines[-1]["end"], "end": round(duration, 3), "downbeat": lines[-1]["end"]})
    return sec


def srt(lines, path):
    def ts(t):
        h, r = divmod(t, 3600); m, s = divmod(r, 60)
        return f"{int(h):02}:{int(m):02}:{int(s):02},{int(round((s % 1) * 1000)):03}"
    with open(path, "w", encoding="utf-8") as f:
        for i, ln in enumerate(lines, 1):
            f.write(f"{i}\n{ts(ln['start'])} --> {ts(ln['end'])}\n{ln['text']}\n\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--lyrics")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--language", default="ja")
    ap.add_argument("--model", default="medium")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--skip-separation", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    notes = []
    device = a.device
    if device == "auto":
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"
    log("device", device)

    wav = to_wav(a.audio, os.path.join(a.outdir, "song.wav"))
    energy, duration = energy_curve(wav)
    beats, downbeats, beat_src = track_beats(wav, device, notes)
    ibi = np.diff(beats)
    bpm = round(float(60 / np.median(ibi)), 2) if len(ibi) else None
    log("bpm", bpm, "beats", len(beats), "downbeats", len(downbeats))

    vocals = None if a.skip_separation else separate(wav, a.outdir, device, notes)
    lyric_lines = parse_lyrics(a.lyrics, notes)
    segs, align_src = align(vocals or wav, lyric_lines, a.language, a.model, device, notes)
    lines = attach_sections(lyric_lines, segs, notes)
    name_inferred_sections(lines, energy, 0.25, notes)
    sections = build_sections(lines, duration, downbeats)

    timing = {
        "version": 1, "audio": os.path.basename(a.audio), "duration": round(duration, 3), "bpm": bpm,
        "beats": [round(float(b), 3) for b in beats], "downbeats": [round(float(b), 3) for b in downbeats],
        "energy": {"hop": 0.25, "values": energy}, "sections": sections, "lines": lines,
        "devices": {"beats": beat_src, "align": align_src, "separation": "demucs/htdemucs" if vocals else "none"},
        "notes": notes,
    }
    json.dump(timing, open(os.path.join(a.outdir, "timing.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    srt(lines, os.path.join(a.outdir, "lyrics.srt"))
    os.remove(wav)
    log("done:", len(lines), "lines,", len(sections), "sections")


if __name__ == "__main__":
    main()
