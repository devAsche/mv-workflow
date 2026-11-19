# H3 Image jobs for 黒薔薇ノ契リ. Each picture twice (seeds a/b), the jacket reference as the style reference.
import json, os, sys
STYLE = ("Paint this with exactly the same hand, the same level of fine detail and the same lighting as <Picture 1>: a dark gothic "
         "illustration in a soft, semi-realistic, doll-like painterly style, cold moonlight, delicate black lace, satin ribbons, "
         "thin silver chains and small silver crosses, black roses. Deep near-black shadows and pale silver-lavender highlights. "
         "The palette is almost monochrome: desaturated blue-violet greys, silver and black only.")
RED = " The single exception to the monochrome palette is a very small amount of deep dark crimson red, used only where described."
REF = " Use <Picture 1> only as a reference for the style and the world; do not copy its composition."
EMPTY = " This is an empty scene: there are no people, no human figures and no faces anywhere in the picture."
NOTEXT = " The image contains no text, no letters and no writing that can be read."
HANDS = (" The only part of a person in the picture is a pair of slender pale hands with dark nails and thin silver rings, "
         "and the ends of black lace sleeves, entering from the edge of the frame; the face, head and body are outside the picture. "
         "Each hand has five well-formed fingers.")
P = {
 # key: (description, red accent, kind 0=free 1=empty 2=hands)
 "j16": ("Recreate <Picture 1> as a wide 16:9 illustration: the same pale girl with long silver-blonde hair, the same black lace bonnet with ribbons, "
         "silver chains and crosses, the same black frilled lace dress, holding the same black rose close to her lips with both hands, tears on her cheeks, "
         "the same black roses and the same tall gothic window behind her. Keep the girl and the rose in the right half of the picture and extend the dark room "
         "naturally to the left, with black roses and moonlight.", 1, 0),
 "p01": ("Near-total darkness. A single black rose petal is falling slowly through one narrow shaft of cold moonlight, "
         "with a few tiny specks of dust glinting in the light. Below, out of focus, a dark polished floor.", 0, 1),
 "p02": ("A quiet gothic bedroom at night: a tall arched window with thin leaded glass panes, cold moonlight pouring through it like glass "
         "and falling across an old dark wooden table with a lace cloth; on the table a slender silver vase holds a few black roses in bloom. "
         "Heavy dark curtains, a black lace canopy at the edge. Calm, tender and still.", 0, 1),
 "p03": ("The same gothic bedroom at night, now overgrown: thick thorned black rose vines have climbed the walls, the curtains and the arched window, "
         "countless black roses in full bloom crowd every surface, black petals cover the floor, torn old photographs lie scattered on the table "
         "beside a fallen silver vase. The moonlight through the window is cold and harsh.", 0, 1),
 "p04": ("An extreme close-up of one single black rose in full bloom in the dark, its velvet petals edged with silver moonlight, "
         "small clear dew drops on the petals like tears. Shallow depth of field, everything else in deep shadow.", 0, 1),
 "p05": ("A close-up of the hands gently holding the long thorned stem of a black rose against black lace; one thorn has pricked a fingertip "
         "and a single tiny drop of deep dark crimson blood sits on it. Soft cold moonlight.", 1, 2),
 "p06": ("A close-up of an old folded letter of thick cream-grey paper tied with a thin black satin ribbon, sealed with a black wax seal "
         "pressed in the shape of a rose, lying on black lace with a few black rose petals and a thin silver chain with a small cross. Cold moonlight.", 0, 1),
 "p07": ("A pale moonlit stone wall in the gothic room. On the wall fall two soft, long shadows of a girl with long hair and a bonnet and a taller young man, "
         "standing close together and holding hands; the people who cast the shadows are outside the picture and cannot be seen. "
         "A black rose lies on the floor at the bottom of the wall.", 0, 0),
 "p08": ("A close-up of an old silver photo frame standing on a dark table among black rose petals: the photograph in it has been painted over again and again "
         "with thick strokes of black paint so that nothing in it can be seen anymore; a paintbrush wet with black paint lies beside it. Cold moonlight.", 0, 1),
 "p09": ("A small dark gothic chapel at night: a stone altar with many thin white candles burning softly, a single black rose laid on the altar as an offering, "
         "a tall stained glass window above in dim violet and grey, drifting smoke from the candles.", 0, 1),
 "p10": ("A tall antique mirror with an ornate silver frame in the dark gothic room, its glass cracked and shattered into many pieces; "
         "the broken pieces reflect black roses, moonlight and darkness. A few shards and black petals lie on the floor below.", 0, 1),
 "p11": ("Countless black rose petals falling and piling up, filling the whole picture, swallowing everything into black; "
         "the moonlight is fading. Among them, only one single petal is a deep dark crimson red.", 1, 1),
}
def prompt(k):
    txt, red, kind = P[k]
    s = txt + " " + STYLE + (RED if red else "") + ("" if k == "j16" else REF)
    if kind == 1: s += EMPTY
    if kind == 2: s += HANDS
    return s + NOTEXT
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
for i, k in enumerate(P):
    for v, seed in (("a", 7100 + i * 37), ("b", 7100 + i * 37 + 1)):
        jid = f"20261119-2110-kuro-{k}{v}"
        j = {"id": jid, "type": "comfy_graph", "graph": "C:\\AI model\\autopilot\\work\\mv\\graphs\\h3_image_ref1_v1.json",
             "set_inputs": {"4": {"image": "mv_kuro_jacket_ref.png"}, "5": {"prompt": prompt(k), "width": 3072, "height": 1728},
                            "7": {"seed": seed}, "9": {"filename_prefix": f"mv/kuro_{k}{v}"}}, "timeout": 5400}
        json.dump(j, open(os.path.join(out, jid + ".json"), "w"), ensure_ascii=False, indent=1)
json.dump({k: prompt(k) for k in P}, open(os.path.join(out, "..", "prompts.json"), "w"), ensure_ascii=False, indent=1)
print(len(P))
