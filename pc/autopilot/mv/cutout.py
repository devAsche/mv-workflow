# cutout.py - cut characters out of illustrations as transparent PNGs, for moving them freely in After Effects.
#
# Model: anime-segmentation by SkyTNT (ISNet, Apache-2.0), https://github.com/SkyTNT/anime-segmentation
# weights isnetis.onnx from https://huggingface.co/skytnt/anime-seg. Runs inside venv-mv with onnxruntime
# (GPU if onnxruntime finds CUDA, otherwise CPU, a few seconds per image). Called by the runner's mv_cutout job.
#
# For every input image it writes, into --outdir:
#   <name>_cut.png      RGBA, same size as the input (drop-in replacement in a comp)
#   <name>_trim.png     RGBA cropped to the character plus a margin (for scaling/sliding it around)
#   <name>_mask.png     the alpha alone (white = character), to fix by hand in Photoshop if needed
#   <name>_check.png    small preview on grey and on magenta, to judge the edges at a glance
# and cutout.json with the size, crop box and how much of the frame the character covers.
import argparse, json, os, sys, time

import numpy as np
from PIL import Image, ImageFilter


def make_session(model):
    import onnxruntime as ort
    want = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in ort.get_available_providers()]
    try:
        s = ort.InferenceSession(model, providers=want)
    except Exception as e:                     # CUDA provider present but its DLLs are not: use the CPU
        print("GPU session failed, using CPU:", e, flush=True)
        s = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    print("onnxruntime", ort.__version__, "providers", s.get_providers(), flush=True)
    return s


def predict_mask(sess, rgb, size):
    """Letterbox the image into a size x size square (as the model was trained), predict, undo the letterbox."""
    w0, h0 = rgb.size
    if h0 >= w0:
        h, w = size, max(1, round(size * w0 / h0))
    else:
        h, w = max(1, round(size * h0 / w0)), size
    ph, pw = (size - h) // 2, (size - w) // 2
    x = np.zeros((size, size, 3), np.float32)
    x[ph:ph + h, pw:pw + w] = np.asarray(rgb.resize((w, h), Image.BICUBIC), np.float32) / 255.0
    x = x.transpose(2, 0, 1)[None]
    m = sess.run(None, {sess.get_inputs()[0].name: x})[0]
    m = np.squeeze(m)[ph:ph + h, pw:pw + w]
    m = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8), "L")
    return m.resize((w0, h0), Image.BICUBIC)


def tighten(mask, low, high, erode):
    """Levels on the alpha (kills faint halos and fills the inside), then optional 1-2 px choke."""
    a = np.asarray(mask, np.float32)
    a = np.clip((a - low) / max(1.0, high - low), 0, 1) * 255
    m = Image.fromarray(a.astype(np.uint8), "L")
    for _ in range(erode):
        m = m.filter(ImageFilter.MinFilter(3))
    return m


def check_image(rgba, width=640):
    s = width / rgba.width
    small = rgba.resize((width, max(1, round(rgba.height * s))), Image.LANCZOS)
    out = Image.new("RGB", (width * 2, small.height))
    for i, col in enumerate(((128, 128, 128), (255, 0, 255))):
        bg = Image.new("RGBA", small.size, col + (255,))
        bg.alpha_composite(small)
        out.paste(bg.convert("RGB"), (i * width, 0))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--low", type=float, default=16, help="alpha below this becomes 0 (0-255)")
    ap.add_argument("--high", type=float, default=235, help="alpha above this becomes 255")
    ap.add_argument("--erode", type=int, default=0)
    ap.add_argument("--margin", type=float, default=0.04, help="margin around the trimmed character, share of its size")
    ap.add_argument("images", nargs="+")
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    sess = make_session(a.model)
    report = []
    for path in a.images:
        t0 = time.time()
        src = Image.open(path)
        src.load()
        rgb = src.convert("RGB")
        mask = tighten(predict_mask(sess, rgb, a.size), a.low, a.high, a.erode)
        if src.mode in ("RGBA", "LA"):           # keep transparency the source already had
            mask = Image.fromarray(np.minimum(np.asarray(mask), np.asarray(src.getchannel("A"))), "L")
        rgba = rgb.convert("RGBA")
        rgba.putalpha(mask)
        stem = os.path.splitext(os.path.basename(path))[0]
        p_cut, p_trim = os.path.join(a.outdir, stem + "_cut.png"), os.path.join(a.outdir, stem + "_trim.png")
        rgba.save(p_cut, optimize=False)
        mask.save(os.path.join(a.outdir, stem + "_mask.png"))
        box = mask.point(lambda v: 255 if v > 8 else 0).getbbox()
        entry = {"image": path, "size": [rgb.width, rgb.height], "cut": p_cut, "secs": 0}
        if box:
            bw, bh = box[2] - box[0], box[3] - box[1]
            m = round(max(bw, bh) * a.margin)
            box = (max(0, box[0] - m), max(0, box[1] - m), min(rgb.width, box[2] + m), min(rgb.height, box[3] + m))
            rgba.crop(box).save(p_trim)
            entry.update(trim=p_trim, box=list(box),
                         coverage=round(float((np.asarray(mask) > 128).mean()), 4))
        else:
            entry["warning"] = "no character found (mask is empty)"
        check_image(rgba).save(os.path.join(a.outdir, stem + "_check.png"))
        entry["secs"] = round(time.time() - t0, 2)
        print(json.dumps(entry, ensure_ascii=False), flush=True)
        report.append(entry)
    with open(os.path.join(a.outdir, "cutout.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
