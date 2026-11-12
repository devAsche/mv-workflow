# CTC emissions for lyric alignment, run inside venv-mv by the mv_align job.
#
# A Japanese wav2vec2 CTC model (default: reazon-research/japanese-wav2vec2-large-rs35kh,
# Apache-2.0) listens to the separated vocal and writes, for every 20 ms frame, the
# log-probability of each character in its vocabulary. The alignment itself (which lyric
# character sits on which frame) is done afterwards by tools/align_lyrics.py, so it can be
# tuned without running the model again.
#
# Output in --outdir:
#   emissions.npz        logp [frames x tokens] float16, tokens, blank index, frame_sec
#   emissions_info.json  model, device, timings and the greedy transcript of each chunk
#                        (what the model hears, for checking)
import argparse, json, os, sys, time

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

import numpy as np
import soundfile as sf


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def load_mono_16k(path):
    y, sr = sf.read(path, always_2d=True, dtype="float32")
    y = y.mean(axis=1)
    if sr != 16000:
        import soxr
        y = soxr.resample(y, sr, 16000)
    return y.astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--model", default="reazon-research/japanese-wav2vec2-large-rs35kh")
    ap.add_argument("--cache", required=True, help="folder for the downloaded model")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--chunk", type=float, default=30.0, help="seconds kept from each pass")
    ap.add_argument("--context", type=float, default=4.0, help="seconds of audio added on each side of a pass")
    ap.add_argument("--keep-chars", help="text file: keep only these characters (plus blank) in the output")
    a = ap.parse_args()

    import torch
    from transformers import AutoProcessor, Wav2Vec2ForCTC

    dev = a.device
    if dev == "auto":
        dev = "cuda" if torch.cuda.is_available() else "cpu"
    log("loading", a.model, "on", dev)
    proc = AutoProcessor.from_pretrained(a.model, cache_dir=a.cache)
    model = Wav2Vec2ForCTC.from_pretrained(a.model, cache_dir=a.cache).to(dev).eval()
    tok = proc.tokenizer
    vocab = tok.get_vocab()                      # token -> id
    # the CTC blank is the model's pad_token_id (Wav2Vec2ForCTC's loss uses it); the tokenizer's own pad
    # token can be a different, added token (reazon-research: blank 0 "<unk>", tokenizer pad 3002)
    blank = model.config.pad_token_id if model.config.pad_token_id is not None else tok.pad_token_id
    id2tok = {i: t for t, i in vocab.items()}
    n_vocab = model.config.vocab_size
    wd = getattr(tok, "word_delimiter_token", None) or "|"

    keep = list(range(n_vocab))
    if a.keep_chars:
        want = set(open(a.keep_chars, encoding="utf-8").read())
        keep = sorted({blank} | {i for t, i in vocab.items() if i < n_vocab and (t in want or t == wd)})
    tokens = [id2tok.get(i, "") for i in keep] + ["<other>"]
    rest = np.ones(n_vocab, dtype=bool)
    rest[keep] = False
    log("vocabulary", n_vocab, "kept", len(keep), "blank", blank, repr(id2tok.get(blank)))

    y = load_mono_16k(a.audio)
    sr, hop = 16000, 320
    n_frames = len(y) // hop + 1
    out = np.full((n_frames, len(keep) + 1), -30.0, dtype=np.float32)
    step, ctx_s, pad = int(a.chunk * sr), int(a.context * sr), int(0.5 * sr)
    greedy = []
    t0 = time.time()
    for s in range(0, len(y), step):
        lo, hi = max(0, s - ctx_s), min(len(y), s + step + ctx_s)
        seg = np.pad(y[lo:hi], pad)
        iv = proc.feature_extractor(seg, sampling_rate=sr, return_tensors="pt").input_values.to(dev)
        with torch.inference_mode():
            logits = model(iv).logits[0].float()
        lp = torch.log_softmax(logits, dim=-1).cpu().numpy()
        # frame f of this pass starts at (lo - pad + f*hop) samples in the song
        f_song = (lo - pad + np.arange(lp.shape[0]) * hop) / hop
        g = np.round(f_song).astype(int)
        m = (g * hop >= s) & (g * hop < min(s + step, len(y))) & (g >= 0) & (g < n_frames)
        sel = lp[m]
        other = np.logaddexp.reduce(sel[:, rest], axis=1) if rest.any() else np.full(len(sel), -30.0)
        out[g[m]] = np.concatenate([sel[:, keep], other[:, None]], axis=1)
        ids = lp.argmax(-1)[m]
        prev, txt = -1, []
        for i in ids:
            if i != prev and i != blank:
                txt.append(id2tok.get(int(i), ""))
            prev = i
        greedy.append({"start": round(s / sr, 2), "end": round(min(s + step, len(y)) / sr, 2),
                       "text": "".join(txt).replace(wd, " ")})
        log(f"{s / sr:6.1f}s-{min(s + step, len(y)) / sr:6.1f}s  {greedy[-1]['text'][:60]}")
    os.makedirs(a.outdir, exist_ok=True)
    np.savez_compressed(os.path.join(a.outdir, "emissions.npz"), logp=out.astype(np.float16),
                        tokens=np.array(tokens), blank=keep.index(blank), frame_sec=hop / sr)
    info = {"model": a.model, "device": dev, "frames": int(n_frames), "frame_sec": hop / sr,
            "kept_tokens": len(keep), "vocab_size": int(n_vocab), "seconds": round(time.time() - t0, 1),
            "greedy": greedy}
    json.dump(info, open(os.path.join(a.outdir, "emissions_info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    log("done", n_frames, "frames in", info["seconds"], "s")


if __name__ == "__main__":
    sys.exit(main())
