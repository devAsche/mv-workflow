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
PICK = json.load(open(os.path.join(HERE, 'img', 'pick.json'))) if os.path.exists(os.path.join(HERE, 'img', 'pick.json')) else {}

def pic(key, **kw):
    d = {'path': PCDIR + '\\img\\' + key + '.png'}
    d.update(kw)
    return d

# ---------------------------------------------------------------- look: one style for the whole song
# scheme 0 moon (pure love), 1 letter paper, 2 cold (jealousy), 3 night crimson (hate), 4 crimson field, 5 ash (spoken)
SCHEMES = [
 {"bg": "#0B0A10", "fg": "#EEEAF4", "sub": "#A59EB8", "accent": "#CFC8E0", "accent2": "#7C7392", "ink": "#EEEAF4", "dim": "#17151E", "ghostA": "#8C84A6", "ghostB": "#3A3448"},
 {"bg": "#DAD5DE", "fg": "#16131B", "sub": "#57515F", "accent": "#2A2530", "accent2": "#6E1626", "ink": "#16131B", "dim": "#CBC5D0", "ghostA": "#8D8696", "ghostB": "#6E1626", "paper": True},
 {"bg": "#07070A", "fg": "#DCD9E2", "sub": "#7F7A8C", "accent": "#8E1A2C", "accent2": "#B8B2C6", "ink": "#DCD9E2", "dim": "#121117", "ghostA": "#5A5468", "ghostB": "#8E1A2C"},
 {"bg": "#0A0305", "fg": "#F2E7E9", "sub": "#B07C84", "accent": "#C0152F", "accent2": "#F2E7E9", "ink": "#C0152F", "dim": "#1A070B", "ghostA": "#C0152F", "ghostB": "#3A0A12"},
 {"bg": "#5E0813", "fg": "#F7EDEF", "sub": "#E2B3BB", "accent": "#0A0305", "accent2": "#F7EDEF", "ink": "#F7EDEF", "dim": "#4E0610", "ghostA": "#0A0305", "ghostB": "#C0152F"},
 {"bg": "#050506", "fg": "#CFCBD6", "sub": "#6D6878", "accent": "#9A1B30", "accent2": "#CFCBD6", "ink": "#CFCBD6", "dim": "#0F0F12", "ghostA": "#3E3A46", "ghostB": "#9A1B30"},
]
STYLE = {"name": "黒薔薇", "desc": "moonlit silver-lavender, black roses, a crimson that grows", "moods": ["emotional", "calm", "editorial"],
         "schemes": SCHEMES,
         "fonts": {"display": ["mincho_black"], "serif": ["shippori"], "body": ["mincho"], "mono": ["mono"]},
         "texture": {"grain": 0.55, "paper": 0.25, "scan": 0}, "ghost": 0.35,
         "bias": {"layout": {"vcols": 2, "columnsBig": 1.6, "mixed": 1.4, "quote": 1.3, "kanjiFocus": 1.2},
                  "enter": {"blur": 1.6, "inkBleed": 1.6, "fadeStagger": 1.4}, "exit": {"drift": 1.4, "wzHanaChiru": 1.4}},
         "decor": {"petals": 0.8, "decoCorners": 0.7}, "hud": False}
FONTS = {"mincho_black": ["ZenOldMincho-Black", "ZenOldMincho-Bold"], "shippori": ["ShipporiMinchoB1-ExtraBold", "ShipporiMinchoB1-Bold"],
         "mincho": ["ZenOldMincho-SemiBold", "ZenOldMincho-Medium", "ShipporiMinchoB1-Medium"], "mincho_bold": ["ZenOldMincho-Bold"],
         "mincho_light": ["ZenOldMincho-Regular", "ShipporiMinchoB1-Regular"], "mono": ["Cinzel-Regular", "Cinzel"],
         "gothic_med": ["ShipporiMinchoB1-Medium"], "gothic_bold": ["ShipporiMinchoB1-Bold"], "gothic_black": ["ZenOldMincho-Black"]}

# ---------------------------------------------------------------- part pools per phase (the pickers choose inside these)
CALM = {
 "layout": ["vcols", "columnsBig", "mixed", "center", "quote", "kanjiFocus", "tyLineFocus", "dropCap", "justified", "tyRuby", "tyMargin", "frameBox", "footnote", "magazine"],
 "enter": ["blur", "fadeStagger", "blurStagger", "inkBleed", "brushReveal", "backlight", "glint", "trackIn", "riseMask", "tyRubyDrop", "xgFocusHunt", "tyDotGrow"],
 "exit": ["drift", "blur", "dissolve", "blurOutStagger", "wzHanaChiru", "echoOut", "hazeOut", "xjFocusPull", "xjStepFade"],
 "hold": ["breathe", "float", "shimmer", "glowFlicker", "focusRack", "xkFocusBreath", "drift", "trackBreathe"],
 "treat": ["none", "softShadow", "glow", "kerningWide", "fadeChars", "emphasisDots"],
 "cam": ["push", "pullOut", "driftDiag", "floatNoise", "focusIn", "xqDriftTurn", "xqCraneUp", "tzMeasureZoom", "dollyIn"],
 "trans": ["xqSoftSweep", "xqLightLeak", "uncover", "inkBlob"],
 "decor": ["petals", "decoCorners", "xlDoubleRule", "tyRunningHead", "moonPhases", "lightLeak", "risingParticles", "kasumi", "watermarkKanji", "vines", "tzNoteMark", "xlSlur", "constellation"],
 "bg": ["none", "nightMoon", "vignettePulse", "godRays", "marble", "spotlight"],
}
COLD = copy.deepcopy(CALM)
COLD.update({
 "layout": ["vcols", "mixed", "stack", "condensed", "tyKeySplit", "tyCropGiant", "hrRedacted", "tyLineFocus", "columnsBig", "quote", "hzTornNote", "kanjiFocus"],
 "enter": ["slice", "blur", "scramble", "inkBleed", "printRegister", "xgDoubleVision", "hzShakyHand", "trackIn", "xeRedact", "flicker"],
 "exit": ["glitch", "drift", "tyStrike", "xiRedact", "scribbleOut", "xjDoubleVision", "blurOutStagger", "burn"],
 "hold": ["noiseDrift", "xkDoubleVision", "shadowSway", "breathe", "hrLagOne", "echoTrail"],
 "treat": ["none", "strike", "hrRedact", "echoOutline", "boxed", "toneShadow", "hzColdRim"],
 "decor": ["crossOut", "hrScratches", "decoCorners", "vines", "petals", "tyRunningHead", "hrDrips", "smoke", "watermarkKanji"],
 "trans": ["xqSoftSweep", "sliceShift", "hrBlink", "inkBlob"],
 "bg": ["none", "vignettePulse", "spotlight", "filmStrip"],
})
HATE = copy.deepcopy(COLD)
HATE.update({
 "layout": ["huge", "stack", "mixed", "condensed", "tyCropGiant", "kanjiFocus", "zoomRepeat", "tyKeySplit", "vcols", "depthStack"],
 "enter": ["slice", "scramble", "echoIn", "inkBleed", "hrManifest", "xgAfterimage", "printRegister", "assemble"],
 "exit": ["glitch", "burn", "scorchOut", "hrDrain", "wzHanaChiru", "slashOut", "tyStrike", "explode"],
 "hold": ["heartbeat", "noiseDrift", "echoTrail", "xkDoubleVision", "hrTwitch", "xkLoudWeight"],
 "treat": ["none", "hrInkBleed", "echoOutline", "strike", "glow", "outlineOffset", "hrEroded"],
 "decor": ["hrCracks", "hrDrips", "hrScratches", "petals", "vines", "decoCorners", "crossOut", "lightLeak"],
 "trans": ["sliceShift", "hrBlink", "inkBlob", "flashCross"],
 "cam": ["push", "pullOut", "driftDiag", "dutch", "xqHeartbeat", "handheld", "dollyIn", "xqWindUp"],
})
SPOKEN = copy.deepcopy(CALM)
SPOKEN.update({
 "layout": ["letterPaper", "hzTornNote", "quote", "vcols", "tyMargin", "center", "footnote"],
 "enter": ["hzShakyHand", "inkBleed", "fadeStagger", "blur"],
 "exit": ["drift", "wzSumiNijimi", "blur", "xjShadowStay", "hzOutOfLight"],
 "hold": ["breathe", "hzSlowBreath", "glowFlicker", "still"],
 "treat": ["none", "fadeChars", "hzUneven"],
 "decor": ["smoke", "hrDustBeam", "decoCorners", "petals", "tyRunningHead"],
 "trans": ["xqSoftSweep", "hrBlink"],
 "cam": ["push", "pullOut", "floatNoise", "hzHeldBreath", "focusIn"],
 "bg": ["none", "spotlight", "vignettePulse"],
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
 {"sec": "INTRO", "kind": "interlude", "image": pic("p01", focus=[0.5, 0.45], cam={"zoom": 0.6}), "scheme": 0, "params": {"variant": "quiet", "showTitle": False}},
 L(0, image=pic("p01", focus=[0.5, 0.5], cam={"zoom": 0.75}), layout="vcols", enter="inkBleed", exit="drift", scheme=0),
 L(1, image=pic("p01", focus=[0.45, 0.6], cam={"zoom": -0.6}), layout="vcols", enter="blurStagger", exit="drift", scheme=0),
 L(2, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 0.6}), layout="columnsBig", enter="blur", exit="wzHanaChiru", scheme=0),
 L(3, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="center", enter="fadeStagger", exit="blur", scheme=0, end=29.9),
 {"kind": "title", "start": 29.9, "end": 39.6, "image": pic("j16", focus=[0.62, 0.45], cam={"zoom": 0.5, "pan": [-10, 0]}), "enter": "inkBleed", "exit": "blur", "scheme": 0},
 # V1 0:40-1:09  moonlight, the room, one rose, the letter, the thorn
 {"sec": "V1"},
 L(4, image=pic("p02", focus=[0.62, 0.42]), layout="vcols", scheme=0, start=39.6),
 L(5, image=pic("p02", focus=[0.62, 0.42], cam={"zoom": 0.5, "pan": [-14, 0]}), layout="mixed", scheme=0),
 L(6, image=pic("p04", focus=[0.5, 0.5]), layout="kanjiFocus", scheme=0),
 L(7, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": -0.6}), layout="dropCap", scheme=0, emph=True),
 L(8, layout="quote", scheme=1),
 L(9, image=pic("p06", focus=[0.5, 0.55]), layout="tyRuby", scheme=0),
 L(10, image=pic("p06", focus=[0.5, 0.55], cam={"zoom": 0.6}), layout="vcols", scheme=0),
 L(11, layout="justified", scheme=1),
 L(12, image=pic("p05", focus=[0.5, 0.5]), layout="columnsBig", scheme=0),
 L(13, image=pic("p05", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="mixed", scheme=0),
 L(14, image=pic("p02", focus=[0.62, 0.42], cam={"zoom": -0.5}), layout="tyLineFocus", scheme=0),
 L(15, image=pic("p02", focus=[0.62, 0.42], cam={"zoom": 0.7}), layout="vcols", scheme=0),
 # P1 1:09-1:29  the pact: the sealed letter, then two shadows
 {"sec": "P1"},
 L(16, image=pic("p06", focus=[0.5, 0.5], cam={"zoom": 0.5}), layout="vcols", enter="inkBleed", scheme=0),
 L(17, image=pic("p06", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="columnsBig", enter="brushReveal", scheme=0),
 L(18, image=pic("p07", focus=[0.5, 0.5]), layout="quote", scheme=0),
 L(19, image=pic("p07", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="center", enter="backlight", scheme=0, emph=True),
 # C1 1:29-1:53  文字PV: every glyph on its own sung time
 {"sec": "C1"},
 L(20, glyphs=[0, 4], layout="huge", sync="char", syncStyle="blur", scheme=0, emph=True, impact=True, image=pic("j16", focus=[0.66, 0.4], cam={"zoom": 0.9})),
 L(20, glyphs=[4, None], layout="huge", sync="char", syncStyle="blur", scheme=0, emph=True, image=pic("j16", focus=[0.66, 0.4], cam={"zoom": 1.2})),
 L(21, layout="mixed", sync="char", syncStyle="blur", scheme=0),
 L(22, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="stack", sync="char", syncStyle="blur", scheme=0),
 L(23, layout="kanjiFocus", sync="char", syncStyle="blur", scheme=1),
 L(24, glyphs=[0, 4], layout="huge", sync="char", syncStyle="blur", scheme=0, emph=True, image=pic("j16", focus=[0.7, 0.45], cam={"zoom": -0.8})),
 L(24, glyphs=[4, None], layout="huge", sync="char", syncStyle="blur", scheme=0, emph=True, image=pic("j16", focus=[0.7, 0.45], cam={"zoom": 1.0})),
 L(25, layout="tyLineFocus", sync="char", syncStyle="blur", scheme=0),
 L(26, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": -0.7}), layout="vcols", sync="char", syncStyle="blur", scheme=0),
 L(27, layout="columnsBig", sync="char", syncStyle="blur", scheme=0, emph=True, end=110.4),
 {"kind": "interlude", "start": 110.4, "image": pic("p01", focus=[0.5, 0.5], cam={"zoom": 0.6}), "scheme": 0, "params": {"variant": "quiet", "showTitle": False}},
 # V2 1:53-2:23  someone else; the photo painted over
 {"sec": "V2"},
 L(28, image=pic("p07", focus=[0.5, 0.5], cam={"zoom": 0.5, "pan": [12, 0]}), layout="vcols", scheme=2, start=113.0),
 L(29, image=pic("p07", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="mixed", scheme=2),
 L(30, layout="tyLineFocus", scheme=2),
 L(31, layout="stack", scheme=2, emph=True),
 L(32, image=pic("p05", focus=[0.5, 0.5], cam={"zoom": -0.5}), layout="vcols", scheme=2),
 L(33, image=pic("p05", focus=[0.5, 0.5], cam={"zoom": 0.7}), layout="columnsBig", scheme=2),
 L(34, layout="quote", scheme=2),
 L(35, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="kanjiFocus", scheme=2, emph=True, treat="hzColdRim"),
 L(36, image=pic("p08", focus=[0.5, 0.5]), layout="mixed", treat="strike", decor=[{"id": "crossOut"}], scheme=2),
 L(37, image=pic("p08", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="vcols", scheme=2),
 L(38, layout="condensed", scheme=2),
 L(39, image=pic("p05", focus=[0.5, 0.45], cam={"zoom": 1.0}), layout="tyKeySplit", scheme=2, emph=True),
 # P2 2:23-2:43  the prayer
 {"sec": "P2"},
 L(40, image=pic("p09", focus=[0.5, 0.5], cam={"zoom": 0.5}), layout="vcols", enter="inkBleed", scheme=2),
 L(41, image=pic("p09", focus=[0.5, 0.5], cam={"zoom": 0.7, "pan": [-12, 0]}), layout="columnsBig", scheme=2),
 L(42, layout="quote", scheme=5),
 L(43, image=pic("p09", focus=[0.5, 0.4], cam={"zoom": 1.1}), layout="center", enter="echoIn", scheme=2, emph=True),
 # C2 2:43-3:07  hate: crimson, the room overgrown
 {"sec": "C2"},
 L(44, glyphs=[0, 4], layout="huge", sync="char", syncStyle="drop", treat="strike", scheme=3, emph=True, impact=True, image=pic("p03", focus=[0.5, 0.45], cam={"zoom": 0.9})),
 L(44, glyphs=[4, None], layout="huge", sync="char", syncStyle="drop", treat="strike", scheme=3, emph=True, image=pic("p03", focus=[0.5, 0.45], cam={"zoom": 1.2})),
 L(45, layout="mixed", sync="char", syncStyle="drop", scheme=3),
 L(46, image=pic("p10", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="tyCropGiant", sync="char", syncStyle="drop", scheme=3),
 L(47, layout="stack", sync="char", syncStyle="drop", scheme=3),
 L(48, glyphs=[0, 4], layout="huge", sync="char", syncStyle="drop", scheme=4, emph=True, impact=True),
 L(48, glyphs=[4, None], layout="huge", sync="char", syncStyle="drop", scheme=3, emph=True, image=pic("p03", focus=[0.5, 0.5], cam={"zoom": 1.2})),
 L(49, layout="kanjiFocus", sync="char", syncStyle="drop", scheme=3),
 L(50, image=pic("p03", focus=[0.4, 0.5], cam={"zoom": -0.8}), layout="vcols", sync="char", syncStyle="drop", scheme=3),
 L(51, image=pic("j16", focus=[0.7, 0.45], cam={"zoom": 0.8}), layout="columnsBig", sync="char", syncStyle="drop", scheme=3, emph=True, end=186.5),
 # BR 3:06-3:29  spoken: the cracked mirror, written as she speaks
 {"sec": "BR"},
 L(52, layout="center", sync="char", syncStyle="blur", scheme=5, start=186.5),
 L(53, image=pic("p10", focus=[0.5, 0.5], cam={"zoom": 0.4}), layout="letterPaper", sync="char", syncStyle="blur", scheme=5, start=188.2),
 L(54, layout="vcols", sync="char", syncStyle="blur", scheme=5),
 L(55, layout="vcols", sync="char", syncStyle="blur", scheme=5),
 L(56, layout="vcols", sync="char", syncStyle="blur", scheme=5),
 L(57, image=pic("p10", focus=[0.5, 0.5], cam={"zoom": 0.8}), layout="center", sync="char", syncStyle="blur", scheme=5),
 L(58, layout="hzTornNote", sync="char", syncStyle="blur", scheme=5, emph=True),
 L(59, image=pic("p08", focus=[0.5, 0.5], cam={"zoom": 0.6}), layout="quote", sync="char", syncStyle="blur", scheme=5),
 # FC 3:29-4:04  both are true; the world turns black
 {"sec": "FC"},
 L(60, glyphs=[0, 4], layout="huge", sync="char", syncStyle="blur", scheme=0, emph=True, impact=True, image=pic("j16", focus=[0.66, 0.4], cam={"zoom": 0.9})),
 L(60, glyphs=[4, None], layout="huge", sync="char", syncStyle="drop", scheme=3, emph=True, image=pic("p03", focus=[0.5, 0.45], cam={"zoom": 1.1})),
 L(61, layout="mixed", sync="char", syncStyle="blur", scheme=3),
 L(62, image=pic("p06", focus=[0.5, 0.5], cam={"zoom": 0.7}), layout="vcols", sync="char", syncStyle="blur", scheme=0),
 L(63, image=pic("p05", focus=[0.5, 0.5], cam={"zoom": 0.9}), layout="vcols", sync="char", syncStyle="drop", scheme=3),
 L(64, glyphs=[0, 4], layout="huge", sync="char", syncStyle="blur", scheme=3, emph=True),
 L(64, glyphs=[4, None], layout="huge", sync="char", syncStyle="drop", scheme=4, emph=True),
 L(65, image=pic("p04", focus=[0.5, 0.5], cam={"zoom": 1.0}), layout="stack", sync="char", syncStyle="drop", scheme=3),
 L(66, image=pic("p03", focus=[0.5, 0.5], cam={"zoom": -0.9}), layout="columnsBig", sync="char", syncStyle="drop", scheme=3, emph=True, impact=True),
 L(67, layout="kanjiFocus", sync="char", syncStyle="drop", scheme=4),
 L(68, glyphs=[0, 4], layout="huge", sync="char", syncStyle="blur", scheme=0, emph=True, image=pic("j16", focus=[0.7, 0.45], cam={"zoom": -0.6})),
 L(68, glyphs=[4, None], layout="huge", sync="char", syncStyle="blur", scheme=3, emph=True, image=pic("j16", focus=[0.7, 0.45], cam={"zoom": 0.9})),
 L(69, layout="tyLineFocus", sync="char", syncStyle="blur", scheme=3),
 L(70, image=pic("p11", focus=[0.5, 0.5], cam={"zoom": 0.7}), layout="vcols", sync="char", syncStyle="blur", scheme=3),
 L(71, image=pic("p11", focus=[0.5, 0.5], cam={"zoom": 1.2}), layout="center", sync="char", syncStyle="blur", scheme=3, emph=True, end=243.3),
 # OUT 4:03-4:25  whisper: the flower's words; the last line in crimson; the title
 {"sec": "OUT"},
 L(72, layout="center", enter="blur", exit="drift", scheme=5, start=243.3),
 L(73, layout="center", enter="blur", exit="drift", scheme=5),
 L(74, layout="center", enter="blur", exit="drift", scheme=5),
 L(75, layout="kanjiFocus", sync="char", syncStyle="blur", scheme=3, emph=True, end=259.6),
 {"kind": "title", "start": 259.6, "end": 264.8, "image": pic("j16", focus=[0.62, 0.45], cam={"zoom": -0.4}), "enter": "blur", "exit": "blur", "scheme": 3},
]
PHASE = {"INTRO": (CALM, FX_CALM), "V1": (CALM, FX_CALM), "P1": (CALM, FX_CALM), "C1": (CALM, FX_CALM), "V2": (COLD, FX_COLD),
         "P2": (COLD, FX_COLD), "C2": (HATE, FX_HATE), "BR": (SPOKEN, FX_SPOKEN), "FC": (HATE, FX_HATE), "OUT": (SPOKEN, FX_SPOKEN)}
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

def section_specs(seed=19):
    allc, secs, notes = whole_song()
    # jz_spec sorts by start; map back by order (all starts increase in CUTS order)
    out = {}
    bounds = [i for _, i in secs] + [len(allc)]
    for k, (name, i0) in enumerate(secs):
        cs = allc[i0:bounds[k + 1]]
        t0 = 0.0 if k == 0 else cs[0]['start']
        t1 = cs[-1]['end'] if k + 1 == len(secs) else allc[bounds[k + 1]]['start']
        pool, fx = PHASE[name]
        sc = []
        for c in cs:
            c = copy.deepcopy(c)
            c['start'] = round(c['start'] - t0, 3); c['end'] = round(c['end'] - t0, 3)
            if 'chars' in c: c['chars'] = [round(x - t0, 3) for x in c['chars']]
            if 'readBy' in c: c['readBy'] = round(c['readBy'] - t0, 3)
            sc.append(c)
        sc[-1]['end'] = round(t1 - t0, 3)          # the section's last cut runs to the next section
        spec = {"title": "黒薔薇ノ契リ", "artist": "", "width": 1920, "height": 1080, "fps": 24, "seed": seed + k,
                "style": STYLE, "fontCandidates": FONTS, "fx": fx,
                "parts": {"noStrong": True, "allow": pool}, "kit": KIT, "lead": 0.06, "autoTrans": True, "autoEvents": True,
                "shadeMode": "halo", "imageCam": {"zoom": 0.75, "rot": 0.3, "pan": [12, 0]},
                "cuts": sc, "duration": round(t1 - t0, 3)}
        out[name] = (spec, t0, t1)
    return out, notes

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--sections', default=','.join(ORDER))
    ap.add_argument('--stills', action='store_true')
    ap.add_argument('--render', action='store_true')
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
        if a.stills:
            for c in spec['cuts']:
                t = c.get('readBy', c['start'] + 0.6) + 0.35
                if 'chars' in c: t = c['chars'][-1] + 0.2
                stills.append(round(min(t, c['end'] - 0.1), 2))
        job = {"id": sid, "type": "ae_script", "script": SCRIPT, "timeout": 1500, "collect": ["plan.json"],
               "params": {"core": CORE, "spec_file": PCDIR + f"\\specs\\{a.id}\\spec_{name}.json", "name": f"KURO_{name}",
                          "audio": WAV, "audio_start": -t0, "stills": stills, "stillMode": "queue",
                          "render": "h264" if a.render else None, "save": f"KURO_{name}.aep"}}
        json.dump(job, open(os.path.join(a.outdir, sid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        out = f"C:\\AI model\\autopilot\\outbox\\files\\{sid}"
        rj = {"id": sid + "r", "type": "ae_render", "project": out + f"\\KURO_{name}.aep", "timeout": 5400,
              "collect": [out + "\\*.tif", out + "\\*.mp4"]}
        json.dump(rj, open(os.path.join(a.outdir, sid + 'r.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"{name:6s} {t0:8.3f} {t1:8.3f} {len(spec['cuts']):3d} cuts  {sid}")

if __name__ == '__main__':
    main()
