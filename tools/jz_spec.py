"""Make an MVJZ spec (input of build_jz.jsx) from our cut table and the char-level timing (timing_chars.json).

usage: python tools/jz_spec.py cuts.json -o spec.json [--report]

cuts.json = {
  "timing": "path/to/timing_chars.json",          (lines[i].text and lines[i].chars[j] = {c, start, end})
  "offset": 0,                                    song time at comp time 0 (build one section: its start)
  "spec": {...},                                  copied into the spec: title, style, styleOverride, fx, parts, kit,
                                                  fontCandidates, shade, imageCam, events (song times), seed ...
  "defaults": {...},                              fields every lyric cut gets unless it sets them (e.g. "sync": "word")
  "lead": 0.06,          readable this long before the voice
  "switch_after": 0.1,   a cut changes this long after the previous cut's last glyph ends ...
  "switch_before": 0.34, ... and at the latest this long before the next cut's first glyph
  "switch_before_char": 0.16, ... or this long when the next cut shows its glyphs one by one (sync "char")
  "hold_last": 0.25,     a sync "char" cut stays until its last glyph has been readable this long (if the next allows)
  "tail": 0.8,           the last lyric cut stays this long after its last glyph (unless a cut follows)
  "cuts": [
    {"line": 5},                              the whole line (index into timing lines, from 0)
    {"line": 6, "glyphs": [0, 4]},            glyphs 0..3 of the line (spaces do not count)
    {"line": 6, "glyphs": [4, null], "layout": "huge", "image": "C:\\\\...\\\\art.png"},
    {"kind": "interlude", "until": 130.0},    fills the gap up to a song time (or the next cut)
    {"kind": "title", "start": 0.2, "end": 2.0}
  ]                                           any other field is an MVJZ cut field and is passed on as it is
}

Timing rules (mv-rules-general, 2026-11-18): the lyric is readable 0.06 s before the voice (readBy), a cut changes 0.1 s
after the previous line ends and at the latest 0.34 s before the next line starts, and text enters only after the change.
Lines shown glyph by glyph (sync "char") switch later: lead + 0.1 s before the next first glyph, and not before the last
glyph has been readable 0.25 s; MVJZ then shortens the exit and shows a glyph sung too close to the switch earlier.
Explicit "start" / "end" on a cut win over the computed ones. All times in the spec are song time minus offset.
"""
import argparse, json, sys

SPACE = set(' \u3000\t')


def line_glyphs(line):
    """non-space glyphs of a timing line: [(text position, char record)]"""
    text = line['text']
    chars = [r for r in (line.get('chars') or []) if r.get('c') not in SPACE]     # some lines keep a record for the space
    pos, j, out = 0, 0, []
    for i, ch in enumerate(text):
        if ch in SPACE:
            continue
        if j < len(chars) and chars[j].get('c') not in (None, ch):
            raise ValueError(f"timing line {line['text']!r}: glyph {j} is {chars[j].get('c')!r}, text has {ch!r}")
        out.append((i, chars[j] if j < len(chars) else None))
        j += 1
    if j != len(chars):
        raise ValueError(f"timing line {text!r}: {len(chars)} char records for {j} glyphs")
    return out


def make(cfg):
    timing = json.load(open(cfg['timing'], encoding='utf-8'))
    lines = timing['lines']
    off = float(cfg.get('offset', 0))
    lead, after, before, tail = (float(cfg.get(k, d)) for k, d in (('lead', 0.06), ('switch_after', 0.1), ('switch_before', 0.34), ('tail', 0.8)))
    defaults = cfg.get('defaults', {})
    before_char = float(cfg.get('switch_before_char', lead + 0.1))
    hold = float(cfg.get('hold_last', 0.25))

    def is_char(r):
        return r['cut'].get('sync', defaults.get('sync')) == 'char'
    rows = []
    for n, c in enumerate(cfg['cuts']):
        c = dict(c)
        kind = c.get('kind', 'lyric' if 'line' in c else 'interlude')
        r = {'src': n, 'kind': kind, 'cut': c}
        if kind == 'lyric':
            ln = lines[c['line']]
            g = line_glyphs(ln)
            a, b = (c.get('glyphs') or [0, None])
            b = len(g) if b is None else b
            if not (0 <= a < b <= len(g)):
                raise ValueError(f"cut {n}: glyphs {a}..{b} outside line {c['line']} ({len(g)} glyphs)")
            sel = g[a:b]
            if any(rec is None or rec.get('start') is None for _, rec in sel):
                raise ValueError(f"cut {n}: missing char times")
            r['text'] = ln['text'][sel[0][0]:sel[-1][0] + 1]
            r['chars'] = [rec['start'] for _, rec in sel]
            r['s'] = sel[0][1]['start']
            r['e'] = max(rec.get('end', rec['start']) for _, rec in sel)
        rows.append(r)
    # boundaries between neighbouring lyric cuts
    lyr = [r for r in rows if r['kind'] == 'lyric']
    for i, r in enumerate(lyr):
        c = r['cut']
        if 'start' in c:
            r['start'] = float(c['start'])
        elif i == 0:
            r['start'] = r['s'] - before
        else:
            p = lyr[i - 1]
            # a cut whose glyphs appear one by one with the voice (sync "char") needs no time to be read before its first
            # glyph, only lead + 0.1 s for its screen to come in; the cut before it keeps its last glyph readable (hold)
            b = before_char if is_char(r) else before
            t = min(p['e'] + after, r['s'] - b)
            if is_char(p):
                t = max(t, p['chars'][-1] - lead + hold)
            t = min(t, r['s'] - lead)
            r['start'] = max(t, p['s'] + 0.25)
        if i > 0 and 'end' not in lyr[i - 1]['cut']:
            lyr[i - 1]['end'] = r['start']
    if lyr:
        last = lyr[-1]
        last['end'] = float(last['cut']['end']) if 'end' in last['cut'] else last['e'] + tail
    for r in lyr:
        if 'end' in r['cut']:
            r['end'] = float(r['cut']['end'])
    # interludes and titles fill gaps
    for i, r in enumerate(rows):
        if r['kind'] == 'lyric':
            continue
        c = r['cut']
        prev_end = next((rows[k]['end'] for k in range(i - 1, -1, -1) if 'end' in rows[k]), None)
        nxt = next((rows[k]['start'] for k in range(i + 1, len(rows)) if 'start' in rows[k]), None)
        r['start'] = float(c['start']) if 'start' in c else (prev_end if prev_end is not None else off)
        r['end'] = float(c['end']) if 'end' in c else float(c.get('until', nxt if nxt is not None else r['start'] + 2))
        if nxt is not None and 'end' not in c and 'until' not in c:
            r['end'] = nxt
    spec = dict(cfg.get('spec', {}))
    spec.setdefault('lead', lead)
    out_cuts, notes = [], []
    for r in rows:
        c = {k: v for k, v in r['cut'].items() if k not in ('glyphs', 'until')}
        if r['kind'] == 'lyric':
            for k, v in defaults.items():
                c.setdefault(k, v)
            c['text'] = r['text']
            c['chars'] = [round(t - off, 3) for t in r['chars']]
            c['readBy'] = round(r['s'] - lead - off, 3)
            if r['start'] > r['s'] - lead:
                notes.append(f"cut {r['src']}: starts {r['start'] - (r['s'] - lead):.2f} s after its readable time")
            if r['end'] - r['start'] < 0.35:
                notes.append(f"cut {r['src']}: only {r['end'] - r['start']:.2f} s long")
        else:
            c['kind'] = r['kind']
        c['start'] = round(r['start'] - off, 3)
        c['end'] = round(r['end'] - off, 3)
        out_cuts.append(c)
    out_cuts.sort(key=lambda c: c['start'])
    for a, b in zip(out_cuts, out_cuts[1:]):
        if b['start'] < a['end'] - 1e-6:
            notes.append(f"cuts at {a['start']} and {b['start']} overlap")
    spec['cuts'] = out_cuts
    if 'events' in spec:
        spec['events'] = [dict(e, t=round(e['t'] - off, 3)) for e in spec['events']]
    if out_cuts:
        spec.setdefault('duration', round(max(c['end'] for c in out_cuts) + 0.5, 3))
    return spec, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cuts')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--report', action='store_true')
    a = ap.parse_args()
    spec, notes = make(json.load(open(a.cuts, encoding='utf-8')))
    json.dump(spec, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if a.report or notes:
        for c in spec['cuts']:
            print(f"{c['start']:8.3f} {c['end']:8.3f}  {c.get('kind', 'lyric'):9s} {c.get('text', '')}")
        for n in notes:
            print('NOTE', n, file=sys.stderr)
    print(f"{len(spec['cuts'])} cuts -> {a.out}")


if __name__ == '__main__':
    main()
