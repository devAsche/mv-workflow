# 黒薔薇ノ契リ: cut table -> MVJZ specs per section (JIZURA engine + our pictures), and the ae_script / ae_render jobs.
#   python make_kuro.py --id 20261119-2200-kuro [--sections INTRO,V1,...] [--stills] [--render]
# Lines are indices into timing_chars.json (no lyric text in this file). Pictures: PIC[key] on the PC.
import argparse, json, os, sys, copy
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, '/home/user/mv-workflow/tools'); sys.path.insert(0, os.path.join(HERE, '..', '..', 'tools'))
import jz_spec

PCDIR = 'C:\\AI model\\autopilot\\work\\mv\\kurobara'
WAV = 'C:\\Users\\user\\Videos\\MV制作\\黒薔薇ノ契リ\\黒薔薇ノ契リ.wav'
CORE = 'C:\\AI model\\autopilot\\mv\\ae\\jz\\mvjz_core.jsx'
SCRIPT = 'C:\\AI model\\autopilot\\mv\\ae\\build_jz.jsx'
SHIFTS = json.load(open(os.path.join(HERE, 'shifts.json'), encoding='utf-8')) if os.path.exists(os.path.join(HERE, 'shifts.json')) else {}
PICK = json.load(open(os.path.join(HERE, 'img', 'pick.json'))) if os.path.exists(os.path.join(HERE, 'img', 'pick.json')) else {}

def pic(key, **kw):
    d = {'path': PCDIR + '\\img\\' + key + '.png'}
    d.update(kw)
    return d

# ---------------------------------------------------------------- look: one style for the whole song
# scheme 0 moon (pure love), 1 letter paper, 2 cold (jealousy), 3 night crimson (hate), 4 crimson field, 5 ash (spoken), 6 dark ink on a bright picture
SCHEMES = [
 {"bg": "#0B0A10", "fg": "#EEEAF4", "sub": "#A59EB8", "accent": "#CFC8E0", "accent2": "#8A82A0", "ink": "#EEEAF4", "dim": "#17151E", "ghostA": "#8C84A6", "ghostB": "#3A3448"},
 {"bg": "#DAD5DE", "fg": "#16131B", "sub": "#57515F", "accent": "#2A2530", "accent2": "#6E1626", "ink": "#16131B", "dim": "#CBC5D0", "ghostA": "#8D8696", "ghostB": "#6E1626", "paper": True},
 {"bg": "#07070A", "fg": "#DCD9E2", "sub": "#7F7A8C", "accent": "#E0364C", "accent2": "#B8B2C6", "ink": "#DCD9E2", "dim": "#121117", "ghostA": "#5A5468", "ghostB": "#8E1A2C"},
 {"bg": "#0A0305", "fg": "#F2E7E9", "sub": "#B07C84", "accent": "#E8394F", "accent2": "#F2E7E9", "ink": "#E8394F", "dim": "#1A070B", "ghostA": "#C0152F", "ghostB": "#3A0A12"},
 {"bg": "#5E0813", "fg": "#F7EDEF", "sub": "#E2B3BB", "accent": "#FFC4CE", "accent2": "#F7EDEF", "ink": "#F7EDEF", "dim": "#4E0610", "ghostA": "#0A0305", "ghostB": "#C0152F"},
 {"bg": "#050506", "fg": "#CFCBD6", "sub": "#8C8798", "accent": "#E0364C", "accent2": "#CFCBD6", "ink": "#CFCBD6", "dim": "#0F0F12", "ghostA": "#3E3A46", "ghostB": "#9A1B30"},
 # 6 dark ink: only for a line that has to sit on a bright part of its picture (tools/jz_contrast.py "ink": "dark")
 {"bg": "#D8D2DA", "fg": "#141018", "sub": "#4A4350", "accent": "#7A1022", "accent2": "#141018", "ink": "#141018", "dim": "#C9C2CC", "ghostA": "#8D8696", "ghostB": "#7A1022"},
]
STYLE = {"name": "黒薔薇", "desc": "moonlit silver-lavender, black roses, a crimson that grows", "moods": ["emotional", "calm", "editorial"],
         "schemes": SCHEMES,
         "fonts": {"display": ["mincho_black"], "serif": ["shippori"], "body": ["mincho"], "mono": ["mono"]},
         "texture": {"grain": 0.55, "paper": 0.25, "scan": 0}, "ghost": 0.35,
         "bias": {"layout": {"vcols": 2, "mixed": 1.4, "quote": 1.3, "kanjiFocus": 1.2},
                  "enter": {"blur": 1.6, "hzAlreadyThere": 1.5, "fadeStagger": 1.4}, "exit": {"drift": 1.4, "wzHanaChiru": 1.4}},
         "decor": {"petals": 0.8, "decoCorners": 0.7}, "hud": False}
FONTS = {"mincho_black": ["ZenOldMincho-Black", "ZenOldMincho-Bold"], "shippori": ["ShipporiMinchoB1-Bold", "ShipporiMinchoB1-SemiBold"],
         "mincho": ["ZenOldMincho-SemiBold", "ZenOldMincho-Medium", "ShipporiMinchoB1-Medium"], "mincho_bold": ["ZenOldMincho-Bold"],
         "mincho_light": ["ZenOldMincho-Regular", "ShipporiMinchoB1-Regular"], "mono": ["Cinzel-Regular", "Cinzel"],
         "gothic_med": ["ShipporiMinchoB1-Medium"], "gothic_bold": ["ShipporiMinchoB1-Bold"], "gothic_black": ["ZenOldMincho-Black"]}

# ---------------------------------------------------------------- part pools per phase (the pickers choose inside these)
CALM = {
 "layout": ["vcols", "mixed", "center", "quote", "justified", "tyRuby"],
 "enter": ["blur", "brushReveal", "glint", "hrManifest", "hzAlreadyThere", "strokeDraw"],
 "exit": ["drift", "blur", "wzHanaChiru", "xjFocusPull", "xjStepFade", "hzOutOfLight", "wzSumiNijimi"],
 "hold": ["float", "shadowSway", "noiseDrift", "sway", "still"],
 "treat": ["none", "glow"],
 "cam": ["panL", "panR", "tiltUp", "xqDriftTurn"],
 "trans": ["xqSoftSweep", "inkBlob"],
 "decor": ["petals", "tyRunningHead", "risingParticles"],
 "bg": ["none", "nightMoon", "spotlight"],
 "fx": ["chroma", "flash", "bloomFlash", "dustScratches", "xrExposureDip", "xrBlink", "wzHanafubuki"],
}
COLD = copy.deepcopy(CALM)
COLD.update({
 "layout": ["vcols", "mixed", "stack", "condensed", "quote"],
 "enter": ["slice", "blur", "scramble", "printRegister", "hzShakyHand", "hzUnwatched", "hzLateSnap"],
 "exit": ["glitch", "drift", "xiRedact", "burn", "hrShiver", "xjColourDrain"],
 "hold": ["noiseDrift", "shadowSway", "hrLagOne", "hzLoneTremor"],
 "treat": ["none", "strike", "boxed"],
 "decor": ["petals", "tyRunningHead", "hrScratches", "hzFilmDirt"],
 "trans": ["xqSoftSweep", "sliceShift", "hrBlink", "inkBlob"],
 "cam": ["panL", "panR", "xqDriftTurn", "handheld", "hzGlanceBack", "hzColdShiver"],
 "bg": ["none", "spotlight", "filmStrip"],
 "fx": ["chroma", "shake", "dustScratches", "xrExposureDip", "xrBlink",
        "slice", "rgbSplit", "interlace", "hzDrain", "hzColdBreath", "xrLampFlicker", "blackFrame", "trackingNoise"],
})
HATE = copy.deepcopy(COLD)
HATE.update({
 "layout": ["stack", "mixed", "condensed", "vcols", "center"],
 "enter": ["slice", "scramble", "hrManifest", "printRegister", "hrUneasy", "hrClawReveal", "hzLampSweep"],
 "exit": ["glitch", "burn", "scorchOut", "wzHanaChiru", "explode", "hrShiver"],
 "hold": ["noiseDrift", "hrLagOne", "hzLoneTremor", "shadowSway"],
 "treat": ["none", "hrInkBleed", "strike", "glow", "hrEroded"],
 "decor": ["hrCracks", "petals", "hrScratches"],
 "trans": ["sliceShift", "hrBlink", "inkBlob", "flashCross"],
 "cam": ["panL", "panR", "xqDriftTurn", "handheld", "hzColdShiver", "hzGlanceBack"],
 "fx": ["chroma", "shake", "flash", "slice", "block", "rgbSplit", "interlace", "hzDrain", "blackFrame", "trackingNoise",
        "shatter", "hzTear", "strobe", "xrDropout", "wzSumiShibuki", "hzClosingDark", "invert"],
})
SPOKEN = copy.deepcopy(CALM)
SPOKEN.update({
 "layout": ["letterPaper", "quote", "vcols", "center"],
 "enter": ["hzShakyHand", "hzAlreadyThere", "blur"],
 "exit": ["drift", "wzSumiNijimi", "blur", "hzOutOfLight"],
 "hold": ["float", "still", "shadowSway"],
 "treat": ["none"],
 "decor": ["petals", "tyRunningHead"],
 "trans": ["xqSoftSweep", "hrBlink"],
 "cam": ["panL", "panR", "tiltUp", "xqDriftTurn"],
 "bg": ["none", "spotlight"],
 "fx": ["chroma", "dustScratches", "xrExposureDip", "xrBlink"],
})
FX_CALM = {"motion": 0.35, "glitch": 0.04, "chroma": 0.12, "decor": 0.45, "texture": 0.6, "bgSwitch": 0, "flash": False, "hud": False}
FX_COLD = {"motion": 0.45, "glitch": 0.18, "chroma": 0.35, "decor": 0.5, "texture": 0.6, "bgSwitch": 0, "flash": False, "hud": False}
FX_HATE = {"motion": 0.6, "glitch": 0.35, "chroma": 0.55, "decor": 0.55, "texture": 0.7, "bgSwitch": 0, "flash": True, "hud": False}
FX_SPOKEN = {"motion": 0.25, "glitch": 0.06, "chroma": 0.1, "decor": 0.35, "texture": 0.7, "bgSwitch": 0, "flash": False, "hud": False}
KIT = [{"id": "decoCorners"}, {"id": "tyRunningHead"}]

def L(i, **kw):
    d = {"line": i}; d.update(kw); return d

# ---------------------------------------------------------------- the cut table (song order); "sec" opens a section
CUTS = [
 # INTRO 0:00-0:40  a petal falls; the first four lines are quiet and vertical; the title on the jacket
 {"sec": "INTRO", "kind": "interlude", "image": pic("p01", focus=[0.5, 0.45], cam={"zoom": 0.6}), "scheme": 0, "cam": "tiltUp", "params": {"variant": "quiet", "showTitle": False}},
 L(0, image=pic("p01", focus=[0.5, 0.5], cam={"zoom": 0.75}), layout="vcols", enter="hzAlreadyThere", exit="drift", scheme=0),
 L(1, image=pic("p01", focus=[0.45, 0.6], cam={"zoom": -0.6}), layout="vcols", enter="fadeStagger", exit="drift", scheme=0),
 L(2, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 0.6}), layout="center", enter="blur", exit="wzHanaChiru", scheme=0),
 L(3, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="quote", enter="fadeStagger", exit="blur", scheme=0, end=29.9),
 {"kind": "title", "start": 29.9, "end": 39.6, "text": "黒薔薇ノ契リ", "layout": "vcols", "params": {"variant": "repeat", "cols": 1}, "image": pic("j17", cam={"zoom": 0.5, "pan": [-10, 0]}), "enter": "hzAlreadyThere", "exit": "blur", "cam": "panL", "scheme": 0},
 # V1 0:40-1:09  moonlight, the room, one rose, the letter, the thorn
 {"sec": "V1"},
 L(4, image=pic("p02", focus=[0.62, 0.42]), layout="vcols", scheme=0, start=39.6),
 L(5, image=pic("p02", focus=[0.62, 0.42], cam={"zoom": 0.5, "pan": [-14, 0]}), layout="mixed", scheme=0),
 L(6, image=pic("p04", focus=[0.5, 0.5]), layout="quote", scheme=0),
 L(7, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": -0.6}), layout="center", scheme=0, emph=True),
 L(8, layout="quote", scheme=1),
 L(9, image=pic("p06", focus=[0.5, 0.55]), layout="tyRuby", scheme=0),
 L(10, image=pic("p06", focus=[0.5, 0.55], cam={"zoom": 0.6}), layout="vcols", scheme=0),
 L(11, layout="justified", scheme=1),
 L(12, image=pic("p05", focus=[0.5, 0.5]), layout="vcols", scheme=0),
 L(13, image=pic("p05", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="quote", scheme=0),
 L(14, image=pic("p02", focus=[0.62, 0.42], cam={"zoom": -0.5}), layout="center", scheme=0),
 L(15, image=pic("p02", focus=[0.62, 0.42], cam={"zoom": 0.7}), layout="vcols", scheme=0),
 # P1 1:09-1:29  the pact: the sealed letter, then two shadows
 {"sec": "P1"},
 L(16, image=pic("p06", focus=[0.5, 0.5], cam={"zoom": 0.5}), layout="vcols", enter="hzAlreadyThere", scheme=0),
 L(17, image=pic("p06", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="quote", enter="brushReveal", scheme=0),
 L(18, image=pic("p07", focus=[0.5, 0.5]), layout="mixed", scheme=0),
 L(19, image=pic("p07", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="center", enter="glint", scheme=0, emph=True),
 # C1 1:29-1:53  文字PV: every glyph on its own sung time
 {"sec": "C1"},
 L(20, glyphs=[0, 4], layout="vcols", params={"variant": "repeat", "cols": 1}, sync="char", syncStyle="blur", scheme=0, emph=True, impact=True, image=pic("j17", cam={"zoom": 0.9})),
 L(20, glyphs=[4, None], layout="vcols", params={"variant": "repeat", "cols": 1}, sync="char", syncStyle="blur", scheme=0, emph=True, image=pic("j18", cam={"zoom": 1.0})),
 L(21, layout="mixed", sync="char", syncStyle="blur", scheme=0),
 L(22, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="stack", sync="char", syncStyle="blur", scheme=0),
 L(23, layout="stack", sync="char", syncStyle="blur", scheme=1),
 L(24, glyphs=[0, 4], layout="center", sync="char", syncStyle="blur", scheme=0, emph=True, image=pic("p02", focus=[0.5, 0.45], cam={"zoom": -0.6})),
 L(24, glyphs=[4, None], layout="vcols", params={"variant": "repeat", "cols": 1}, sync="char", syncStyle="blur", scheme=0, emph=True, image=pic("j17", cam={"zoom": 1.0})),
 L(25, layout="quote", sync="char", syncStyle="blur", scheme=0),
 L(26, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": -0.7}), layout="vcols", sync="char", syncStyle="blur", scheme=0),
 L(27, layout="vcols", sync="char", syncStyle="blur", scheme=0, emph=True, end=110.4),
 {"kind": "interlude", "start": 110.4, "image": pic("p01", focus=[0.5, 0.5], cam={"zoom": 0.6}), "scheme": 0, "cam": "tiltUp", "params": {"variant": "quiet", "showTitle": False}},
 # V2 1:53-2:23  someone else; the photo painted over
 {"sec": "V2"},
 L(28, image=pic("p07", focus=[0.5, 0.5], cam={"zoom": 0.5, "pan": [12, 0]}), layout="vcols", scheme=2, start=113.0),
 L(29, image=pic("p07", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="mixed", scheme=2),
 L(30, layout="center", scheme=2),
 L(31, layout="stack", scheme=2, emph=True),
 L(32, image=pic("p05", focus=[0.5, 0.5], cam={"zoom": -0.5}), layout="vcols", scheme=2),
 L(33, image=pic("p05", focus=[0.5, 0.5], cam={"zoom": 0.7}), layout="center", scheme=2),
 L(34, layout="quote", scheme=2),
 L(35, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="center", scheme=2, emph=True),
 L(36, image=pic("p08", focus=[0.5, 0.5]), layout="mixed", treat="strike", decor=[{"id": "crossOut"}], scheme=2),
 L(37, image=pic("p08", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="vcols", scheme=2),
 L(38, layout="condensed", scheme=2),
 L(39, image=pic("p05", focus=[0.5, 0.45], cam={"zoom": 1.0}), layout="vcols", scheme=2, emph=True),
 # P2 2:23-2:43  the prayer
 {"sec": "P2"},
 L(40, image=pic("p09", focus=[0.5, 0.5], cam={"zoom": 0.5}), layout="vcols", enter="hrManifest", scheme=2),
 L(41, image=pic("p09", focus=[0.5, 0.5], cam={"zoom": 0.7, "pan": [-12, 0]}), layout="vcols", scheme=2),
 L(42, layout="quote", scheme=5),
 L(43, image=pic("p09", focus=[0.5, 0.4], cam={"zoom": 1.1}), layout="center", enter="hzLampSweep", scheme=2, emph=True),
 # C2 2:43-3:07  hate: crimson, the room overgrown
 {"sec": "C2"},
 L(44, glyphs=[0, 4], layout="center", sync="char", syncStyle="drop", treat="strike", scheme=3, emph=True, impact=True, image=pic("p03", focus=[0.5, 0.45], cam={"zoom": 0.9})),
 L(44, glyphs=[4, None], layout="center", sync="char", syncStyle="drop", treat="strike", scheme=3, emph=True, image=pic("p03", focus=[0.5, 0.45], cam={"zoom": 1.2})),
 L(45, layout="mixed", sync="char", syncStyle="drop", scheme=3),
 L(46, image=pic("p10", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="condensed", sync="char", syncStyle="drop", scheme=3),
 L(47, layout="stack", sync="char", syncStyle="drop", scheme=3),
 L(48, glyphs=[0, 4], layout="center", sync="char", syncStyle="drop", scheme=4, emph=True, impact=True),
 L(48, glyphs=[4, None], layout="center", sync="char", syncStyle="drop", scheme=3, emph=True, image=pic("p03", focus=[0.5, 0.5], cam={"zoom": 1.2})),
 L(49, layout="center", sync="char", syncStyle="drop", scheme=3),
 L(50, image=pic("p03", focus=[0.4, 0.5], cam={"zoom": -0.8}), layout="vcols", sync="char", syncStyle="drop", scheme=3),
 L(51, image=pic("j17", cam={"zoom": 0.8}), layout="vcols", params={"variant": "split", "perCol": 6}, sync="char", syncStyle="drop", scheme=3, emph=True, end=186.5),
 # BR 3:06-3:29  spoken: the cracked mirror, written as she speaks
 {"sec": "BR"},
 L(52, layout="center", sync="char", syncStyle="blur", scheme=5, start=186.5),
 L(53, image=pic("p10", focus=[0.5, 0.5], cam={"zoom": 0.4}), layout="letterPaper", sync="char", syncStyle="blur", scheme=5, start=188.2),
 L(54, layout="vcols", sync="char", syncStyle="blur", scheme=5),
 L(55, layout="vcols", sync="char", syncStyle="blur", scheme=5),
 L(56, layout="vcols", sync="char", syncStyle="blur", scheme=5),
 L(57, image=pic("p10", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="center", sync="char", syncStyle="blur", scheme=5),
 L(58, layout="vcols", sync="char", syncStyle="blur", scheme=5, emph=True),
 L(59, image=pic("p08", focus=[0.5, 0.5], cam={"zoom": 0.6}), layout="quote", sync="char", syncStyle="blur", scheme=5),
 # FC 3:29-4:04  both are true; the world turns black
 {"sec": "FC"},
 L(60, glyphs=[0, 4], layout="vcols", params={"variant": "repeat", "cols": 1}, sync="char", syncStyle="blur", scheme=0, emph=True, impact=True, image=pic("j17", cam={"zoom": 0.9})),
 L(60, glyphs=[4, None], layout="center", sync="char", syncStyle="drop", scheme=3, emph=True, image=pic("p03", focus=[0.5, 0.45], cam={"zoom": 1.1})),
 L(61, layout="mixed", sync="char", syncStyle="blur", scheme=3),
 L(62, image=pic("p06", focus=[0.5, 0.5], cam={"zoom": 0.7}), layout="vcols", sync="char", syncStyle="blur", scheme=0),
 L(63, image=pic("p05", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="vcols", sync="char", syncStyle="drop", scheme=3),
 L(64, glyphs=[0, 4], layout="center", sync="char", syncStyle="blur", scheme=3, emph=True),
 L(64, glyphs=[4, None], layout="center", sync="char", syncStyle="drop", scheme=4, emph=True),
 L(65, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 1.0}), layout="stack", sync="char", syncStyle="drop", scheme=3),
 L(66, image=pic("p03", focus=[0.5, 0.5], cam={"zoom": -0.9}), layout="vcols", sync="char", syncStyle="drop", scheme=3, emph=True, impact=True),
 L(67, layout="stack", sync="char", syncStyle="drop", scheme=4),
 L(68, glyphs=[0, 4], layout="vcols", params={"variant": "repeat", "cols": 1}, sync="char", syncStyle="blur", scheme=0, emph=True, image=pic("j18", cam={"zoom": -0.6})),
 L(68, glyphs=[4, None], layout="center", sync="char", syncStyle="blur", scheme=3, emph=True),
 L(69, layout="quote", sync="char", syncStyle="blur", scheme=3),
 L(70, image=pic("p11", focus=[0.5, 0.5], cam={"zoom": 0.7}), layout="vcols", sync="char", syncStyle="blur", scheme=3),
 L(71, image=pic("p11", focus=[0.5, 0.5], cam={"zoom": 1.2}), layout="center", sync="char", syncStyle="blur", scheme=3, emph=True, end=243.3),
 # OUT 4:03-4:25  whisper: the flower's words; the last line in crimson; the title
 {"sec": "OUT"},
 L(72, layout="center", enter="blur", exit="drift", scheme=5, start=243.3),
 # 永遠の愛。 comes after a 2.6 s rest: switch 0.4 s before the voice as well (凌さん 2026-11-20 18:17)
 L(73, layout="center", enter="blur", exit="drift", scheme=5, start=248.62),
 # "そして……" comes after a 2.4 s rest: switch late (0.4 s before the voice) so the line is not up long before it is
 # whispered (凌さん 2026-11-20); 永遠の愛。 stays through the rest
 L(74, layout="center", enter="blur", exit="drift", scheme=5, start=252.95),
 L(75, layout="vcols", sync="char", syncStyle="blur", scheme=3, emph=True, end=259.6),
 {"kind": "title", "start": 259.6, "end": 264.8, "text": "黒薔薇ノ契リ", "layout": "vcols", "params": {"variant": "repeat", "cols": 1}, "image": pic("j18", cam={"zoom": -0.4}), "enter": "blur", "exit": "blur", "cam": "panR", "scheme": 3},
]
PHASE = {"INTRO": (CALM, FX_CALM), "V1": (CALM, FX_CALM), "P1": (CALM, FX_CALM), "C1": (CALM, FX_CALM), "V2": (COLD, FX_COLD),
         "P2": (COLD, FX_COLD), "C2": (HATE, FX_HATE), "BR": (SPOKEN, FX_SPOKEN), "FC": (HATE, FX_HATE), "OUT": (SPOKEN, FX_SPOKEN)}
GHOST = {"INTRO": 0, "V1": 0, "P1": 0, "C1": 0, "V2": 0, "P2": 0, "C2": 0, "BR": 0, "FC": 0, "OUT": 0}
ORDER = ["INTRO", "V1", "P1", "C1", "V2", "P2", "C2", "BR", "FC", "OUT"]

def whole_song():
    """jz_spec over the whole song (offset 0): boundaries follow the switching rules across sections"""
    cuts, secs, cur = [], [], None
    for c in CUTS:
        c = dict(c)
        if 'sec' in c:
            cur = c.pop('sec')
            if not c:
                secs.append((cur, len(cuts))); continue
            secs.append((cur, len(cuts)))
        cuts.append(c)
    cfg = {"timing": os.path.join(HERE, 'timing_chars.json'), "offset": 0, "spec": {}, "cuts": cuts}
    spec, notes = jz_spec.make(cfg)
    return spec['cuts'], secs, notes

# painted blood running down from the top edge (H3 picture split by tools/blood_split.py, MVJZ 0.1.9 "blood"), only
# where the hate breaks through: section -> {cut index: (run, set)}; cuts of one run continue the same blood
# 0-based cut index -> (run, blood set[, opts]). Cuts of one run share one continuous drip.
# opts: pre = seconds the drip has already run at the cut's start (a short cut otherwise ends
# before the drops get going), flip = mirrored so a second use of a painting reads as new drips.
BLOOD = {"C2": {4: ("c2", "b1a"), 5: ("c2", "b1a"), 6: ("c2", "b1a")},
         "FC": {6: ("fc7", "b1a", {"pre": 2.4, "flip": True}), 9: ("fc10", "b1b", {"pre": 1.6})}}

# credits (凌さん 2026-11-20 18:30): on the opening title card (29.9-39.6 s, the jacket girl on the left, the title
# column in the middle), small in the dark lower right, after the title has settled (MVJZ 0.1.12 "credits")
CREDITS = {"INTRO": [{"start": 31.2, "end": 39.4, "rows": [["music", "DOLLは眠らない"], ["movie", "Ashley"]],
                      "x": 0.93, "y": 0.80, "align": "right", "size": 0.03, "labelScale": 0.66, "labelFont": "mono", "valueFont": "mincho"}]}

def blood_of(setname):
    return json.load(open(os.path.join(HERE, 'blood', setname, 'blood.json'), encoding='utf-8'))

def section_specs(seed=19):
    allc, secs, notes = whole_song()
    # jz_spec sorts by start; map back by order (all starts increase in CUTS order)
    out = {}
    bounds = [i for _, i in secs] + [len(allc)]
    # sections meet on whole frames (24 fps), so the joined video stays on the song: a section starts on the frame
    # nearest its first cut, and that cut starts there
    fr = lambda t: round(round(t * 24) / 24, 4)
    T0 = [0.0] + [fr(allc[bounds[k]]['start']) for k in range(1, len(secs))]
    for k in range(1, len(secs)):
        allc[bounds[k]]['start'] = T0[k]
    for k, (name, i0) in enumerate(secs):
        cs = allc[i0:bounds[k + 1]]
        t0 = T0[k]
        t1 = fr(cs[-1]['end']) if k + 1 == len(secs) else T0[k + 1]
        pool, fx = PHASE[name]
        sc = []
        for c in cs:
            c = copy.deepcopy(c)
            if c.get('layout') == 'vcols' and 'params' not in c and c.get('text'):
                n = len(''.join(c['text'].split()))
                c['params'] = {"variant": "repeat", "cols": 1} if n <= 7 else {"variant": "split"}
            c['start'] = round(c['start'] - t0, 3); c['end'] = round(c['end'] - t0, 3)
            if 'chars' in c: c['chars'] = [round(x - t0, 3) for x in c['chars']]
            if 'readBy' in c: c['readBy'] = round(c['readBy'] - t0, 3)
            sc.append(c)
        sc[-1]['end'] = round(t1 - t0, 3)          # the section's last cut runs to the next section
        style = copy.deepcopy(STYLE)
        style["ghost"] = GHOST[name]          # colour-shifted doubles of the lyric: none while she is calm, some in the jealousy and hate
        spec = {"title": "黒薔薇ノ契リ", "artist": "", "width": 1920, "height": 1080, "fps": 24, "seed": seed + k,
                "style": style, "fontCandidates": FONTS, "fx": fx,
                "parts": {"noStrong": True, "allow": pool}, "kit": KIT, "lead": 0.06, "autoTrans": True, "autoEvents": True,
                "shadeMode": "cloud", "imageCam": {"zoom": 0.75, "rot": 0.3, "pan": [12, 0]},
                "cuts": sc, "duration": round((round((t1 - t0) * 24) + 0.01) / 24, 6)}   # whole frames, whether AE rounds or floors
        for ci, sh in (SHIFTS.get(name) or {}).items():      # lyric moved onto a dark part of its picture (tools/jz_contrast.py)
            ci = int(ci)
            if ci < len(sc) and sh:
                sh = dict(sh)
                if sh.pop('ink', None) == 'dark': sc[ci]['scheme'] = 6
                if sh.get('x') or sh.get('y') or sh.get('s', 1) != 1: sc[ci]['shift'] = sh
        runs = {}
        for ci, ent in sorted((BLOOD.get(name) or {}).items()):
            if ci >= len(sc): continue
            run, setname, opt = (tuple(ent) + ({},))[:3]
            r0 = runs.setdefault(run, sc[ci]['start'])
            meta = blood_of(setname); meta.pop('src', None)
            sc[ci]['blood'] = {"dir": PCDIR + "\\blood\\" + setname, "meta": meta,
                               "t0": round(sc[ci]['start'] - r0 + opt.get('pre', 0), 3), "seed": sum(map(ord, run))}
            if opt.get('flip'): sc[ci]['blood']['flip'] = True
        for cr in CREDITS.get(name, []):      # song times -> section times
            cr = dict(cr); cr['start'] = round(cr['start'] - t0, 3); cr['end'] = round(cr['end'] - t0, 3)
            spec.setdefault('credits', []).append(cr)
        out[name] = (spec, t0, t1)
    return out, notes

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--sections', default=','.join(ORDER))
    ap.add_argument('--stills', action='store_true')
    ap.add_argument('--render', action='store_true')
    ap.add_argument('--qa', choices=['mask', 'bare'], help='contrast check pass: stills of the picture cuts only, text green (mask) or hidden (bare)')
    ap.add_argument('--outdir', default=os.path.join(HERE, 'jobs_jz'))
    a = ap.parse_args()
    specs, notes = section_specs()
    for n in notes: print('NOTE', n)
    os.makedirs(a.outdir, exist_ok=True)
    for name in a.sections.split(','):
        spec, t0, t1 = specs[name]
        sid = f"{a.id}-{name.lower()}"
        sp = os.path.join(a.outdir, f"spec_{name}.json")
        json.dump(spec, open(sp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        stills = []
        if a.stills or a.qa:
            for c in spec['cuts']:
                if a.qa and not c.get('image'): continue
                if 'chars' not in c: t = c['start'] + min(1.5, (c['end'] - c['start']) / 2)
                elif c.get('sync') == 'char': t = c['chars'][-1] + 0.12          # every glyph is in, before the exit
                else: t = c['readBy'] + 0.1                                     # the whole screen is in by readBy
                stills.append(round(min(t, c['end'] - 0.05), 2))
        job = {"id": sid, "type": "ae_script", "script": SCRIPT, "timeout": 1500, "collect": ["plan.json"],
               "params": {"core": CORE, "spec_file": PCDIR + f"\\specs\\{a.id}\\spec_{name}.json", "name": f"KURO_{name}",
                          "audio": WAV, "audio_start": -t0, "stills": stills, "stillMode": "queue",
                          "render": "h264" if a.render else None, "save": f"KURO_{name}.aep"}}
        if a.qa:
            job["params"].update({"qa": a.qa, "light": True, "render": None})
            job["params"].pop("audio"); job["params"].pop("audio_start")
        json.dump(job, open(os.path.join(a.outdir, sid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        out = f"C:\\AI model\\autopilot\\outbox\\files\\{sid}"
        rj = {"id": sid + "r", "type": "ae_render", "project": out + f"\\KURO_{name}.aep", "timeout": 5400,
              "collect": [out + "\\*.tif", out + "\\*.mp4"]}
        json.dump(rj, open(os.path.join(a.outdir, sid + 'r.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"{name:6s} {t0:8.3f} {t1:8.3f} {len(spec['cuts']):3d} cuts  {sid}")

if __name__ == '__main__':
    main()
