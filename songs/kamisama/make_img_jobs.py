# H3 Image jobs for 神様のコレクション A案 (硝子の向こう). Each picture twice (seeds a/b), jacket as the style reference.
import json, os, sys
STYLE = ("Paint this with exactly the same hand, the same level of fine detail and the same lighting as <Picture 1>: a dark, gothic, "
         "painterly illustration with dramatic cold moonlight, soft volumetric light shafts and drifting dust, deep near-black shadows "
         "and pale lavender-white highlights. The palette is almost monochrome: deep indigo and desaturated blue-violet greys only.")
GOLD = " The single exception to the monochrome palette is a small, soft, pale warm-gold glow, used only where described."
REF = " Use <Picture 1> only as a reference for the style and the world; do not copy its composition."
EMPTY = " This is an empty scene: there are no people, no human figures and no silhouettes anywhere in the picture."
NOTEXT = " The image contains no text, no letters and no writing that can be read."
HANDS = (" The only part of a person in the picture is one slender pale hand and the end of a dark sleeve, entering from the edge of the frame;"
         " the person's face, head and body are outside the picture. The hand has five well-formed fingers.")
P = {
 "q01": ("Near-total darkness inside a vast ruined gothic hall. The only light is one tall arched gothic window high in the dark, glowing cold moonlight, "
         "with a single soft shaft of light falling diagonally into the black, full of slowly drifting dust motes. Everything else is lost in deep shadow.", 0, 1),
 "q02": ("A low close view of a wet, reflective stone floor in the ruined gothic hall: loose pages of sheet music lie scattered among fallen dark blue rose petals "
         "and thorned vines; one page at the centre is just lifting off the floor, curling upward in the moonlight. Shallow depth of field.", 0, 1),
 "q03": ("A close-up of the music stand of a black grand piano: a single unfinished handwritten music score, only the first few bars filled with notes, "
         "the rest of the staves empty; an old dip pen rests on the ledge. Cold moonlight from the side, dust in the air.", 0, 1),
 "q04": ("An extreme close-up of black-and-white piano keys covered with a thin layer of grey dust; on a few keys the dust has been wiped by fingertips, "
         "leaving faint clean finger marks. A dark blue rose petal lies on the keys. Low raking moonlight.", 0, 1),
 "q05": ("A close-up of a small old brass lantern standing on the black lid of a grand piano, its flame giving a small, soft, pale warm-gold glow "
         "that lights the dust around it. Around it the ruined hall falls away into indigo darkness.", 1, 1),
 "q06": ("A tall stone wall of the ruined gothic hall lit by moonlight. On the wall falls a soft, large shadow shaped like a slender person seated at a grand piano, "
         "playing, with long hair; the person who casts the shadow is outside the picture and cannot be seen. Only the edge of a black piano is visible at the bottom.", 0, 0),
 "q07": ("A deep stone windowsill of a tall gothic window at night: an old open notebook with blank, slightly yellowed pages, a dried dark blue rose laid across it, "
         "moonlight pouring in, the night town far below out of focus.", 0, 1),
 "q08": ("A close-up inside an old tall pendulum clock: the brass pendulum, interlocking dark brass gears and the clock's escapement, "
         "dimly lit by cold moonlight through dusty glass; thorned vines have crept inside.", 0, 1),
 "q09": ("Looking straight up inside the ruined gothic hall: tall dark columns and a high vaulted ceiling, a broken crystal chandelier hanging from the centre, "
         "and a pale beam of light falling from a hole in the vault. A few small, soft, pale warm-gold sparks are rising up toward the light and vanishing.", 1, 1),
 "q11": ("A close-up of one tall glass bell jar on a dark antique shelf in a collector's archive: inside rests an old violin, softly glowing from within with a pale warm-gold light. "
         "A small blank brass plate is fixed below the jar. Dark blue roses and thorned vines creep along the shelf; the rest of the archive falls into darkness.", 1, 1),
 "q12": ("A close-up of one glass bell jar on a dark antique shelf in a collector's archive: inside rests a pair of worn satin ballet shoes, softly glowing from within with a pale warm-gold light. "
         "A small blank brass plate is fixed below the jar. Moonlight catches the curve of the glass.", 1, 1),
 "q13": ("A close-up of one glass bell jar on a dark antique shelf in a collector's archive: inside rests an old fountain pen on a folded letter, softly glowing from within with a pale warm-gold light. "
         "A small blank brass plate is fixed below the jar. Dark blue roses on the shelf.", 1, 1),
 "q14": ("A close-up of one glass bell jar on a dark antique shelf in a collector's archive: inside rests a small open music box with a tiny comb and cylinder, softly glowing from within with a pale warm-gold light. "
         "A small blank brass plate is fixed below the jar.", 1, 1),
 "q15": ("A close-up of one glass bell jar on a dark antique shelf in a collector's archive: inside floats a single white feather and an old paintbrush, softly glowing from within with a pale warm-gold light. "
         "A small blank brass plate is fixed below the jar. Moonlight reflects on the glass.", 1, 1),
 "q16": ("Pages of music manuscript paper spread across a dark wooden desk, almost all of the staves empty, only a few scattered notes here and there, "
         "an unfinished piece. Cold moonlight, dust, a dark blue rose petal on the paper.", 0, 1),
 "q17": ("At the end of a dark collector's archive, between tall shelves of glowing glass bell jars, stands one very large display case, taller than a person, "
         "completely covered by a heavy dark velvet cloth. A blank brass plate is fixed on its plinth. A cold shaft of moonlight falls on it from above.", 1, 1),
 "q19": ("A close-up of an old wooden valve radio on a stone windowsill at night, its small dial glowing a soft pale warm-gold; through the window behind it, "
         "out of focus, the dark rooftops of a quiet town.", 1, 1),
 "q20": ("An old upright piano standing alone in an empty railway station hall at night: iron and glass roof, a large station clock, benches, cold moonlight falling through the glass roof, "
         "the piano lid open.", 0, 1),
 "q21": ("A sharp broken shard of glass lying on a dark wet stone floor; in the shard is reflected a tiny, clear image of a night town with a few windows glowing a soft pale warm-gold. "
         "Everything around the shard is dark and out of focus.", 1, 1),
 "q22": ("A close-up of one empty glass bell jar on a dark antique shelf in a collector's archive: nothing inside it, only darkness and a little dust; "
         "a small blank brass plate below it, with nothing engraved. Cold moonlight from above glints on the glass.", 0, 1),
 "q23": ("A quiet old town at night seen from high above: layered rooftops, chimneys, a church spire, a river and a railway bridge. "
         "From the clouded sky a single narrow pale beam of light falls onto the rooftops like a searchlight, lighting one small attic window.", 0, 1),
 "q24": ("Looking straight up between two towering antique shelves in a collector's archive: rows upon rows of glass bell jars rising into darkness, "
         "each holding a small object softly glowing a pale warm-gold, getting smaller toward the far ceiling where cold moonlight falls in.", 1, 1),
 "q25": ("In a dark collector's archive stands a very large glass display case on a stone plinth with a blank brass plate; a heavy dark velvet cloth has just slipped off and lies crumpled at its foot. "
         "Inside the glass, like a museum exhibit, is the scene of <Picture 1> in miniature: the ruined hall, the black grand piano with dark blue roses, "
         "and the girl in the long black dress asleep over the piano with her face hidden in her arms. Moonlight reflects in a long streak on the glass.", 0, 1),
 "q27": ("A close-up of an unfinished handwritten music score on a dark wooden desk in moonlight; a dip pen is adding new notes to the empty bars.", 0, 2),
 "q28": ("A close-up of black-and-white piano keys in moonlight; a hand rests gently on the keys, about to press one.", 0, 2),
 "q29": ("Looking up through the collapsed, broken roof of a ruined gothic hall into a clear night sky full of stars; broken stone ribs of the vault and hanging vines frame the sky. "
         "The stars are small and pale.", 0, 1),
 "q30": ("A close-up of an empty black piano stool in front of a black grand piano in the ruined gothic hall, cold moonlight falling across the empty seat, "
         "dust in the air, one dark blue rose on the floor beside it.", 0, 1),
 "q31": ("A quiet old town at night seen from a high window: layered rooftops, chimneys, a church spire and a distant railway bridge under a moonlit sky. "
         "Very many windows all across the town glow with a small, soft, pale warm-gold light.", 1, 1),
 "q32": ("The music stand of a black grand piano in the ruined gothic hall: a handwritten music score whose staves are now completely filled with notes, "
         "and beside it a small old brass lantern glowing again with a small, soft, pale warm-gold flame. Calm moonlight.", 1, 1),
}
def prompt(k):
    txt, gold, kind = P[k]
    s = txt + " " + STYLE + (GOLD if gold else "") + REF
    if kind == 1: s += EMPTY
    if kind == 2: s += HANDS
    return s + NOTEXT
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for i, k in enumerate(P):
    for v, seed in (("a", 5000 + i * 37), ("b", 5000 + i * 37 + 1)):
        jid = f"20261115-0300-kami-{k}{v}"
        j = {"id": jid, "type": "comfy_graph", "graph": "C:\\AI model\\autopilot\\work\\mv\\graphs\\h3_image_ref1_v1.json",
             "set_inputs": {"4": {"image": "mv_kami_jacket_ref.png"}, "5": {"prompt": prompt(k), "width": 3072, "height": 1728},
                            "7": {"seed": seed}, "9": {"filename_prefix": f"mv/kami_{k}{v}"}}, "timeout": 5400}
        json.dump(j, open(os.path.join(out, jid + ".json"), "w"), ensure_ascii=False, indent=1)
json.dump({k: prompt(k) for k in P}, open(os.path.join(out, "..", "prompts.json"), "w"), ensure_ascii=False, indent=1)
print(len(P))
