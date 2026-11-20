# H3 Image test jobs: painted blood running down from the top edge, on flat black, in the style of the jacket reference.
import json, os, sys
STYLE = (" Paint it with exactly the same hand, the same fine detail and the same soft, semi-realistic painterly rendering as <Picture 1>: "
         "the same soft brushwork and the same cold moonlight glinting on wet surfaces.")
REF = " Use <Picture 1> only as a reference for the painting style; do not copy its composition, its girl or its objects."
ONLY = (" Nothing else is in the picture: the background is completely flat, pure black (#000000) with no texture, no light, no objects, "
        "no people and no text.")
P = {
 "b1": ("Thick, dark crimson blood running down from the very top edge of the picture: a continuous uneven band of blood along the top edge, "
        "and from it eight drips of very different lengths running straight down, a few long and thin reaching past the middle of the picture, "
        "others short and heavy, each ending in a rounded, swollen drop; two separate small drops falling below them. The blood is glossy and "
        "viscous, deep near-black crimson in the body with thin pale silver highlights from cold moonlight along its edges."),
 "b2": ("Heavy, slow, dark crimson blood seeping down from the very top edge of the picture like thick syrup: an irregular band of blood along "
        "the top edge with uneven bulges, and from it six drips of varied length and thickness running straight down with slight wobbles, "
        "each with a heavy teardrop-shaped bead at its end, one thin drip reaching two thirds of the way down. Wet, glossy surface with small sharp "
        "silver-white reflections of cold moonlight and soft darker crimson shading inside, like oil paint."),
}
out = sys.argv[1]; stamp = sys.argv[2]
for i, k in enumerate(P):
    for v, seed in (("a", 9300 + i * 37), ("b", 9300 + i * 37 + 1)):
        jid = f"{stamp}-kuro-blood-{k}{v}"
        j = {"id": jid, "type": "comfy_graph", "graph": "C:\\AI model\\autopilot\\work\\mv\\graphs\\h3_image_ref1_v1.json",
             "set_inputs": {"4": {"image": "mv_kuro_jacket_ref.png"}, "5": {"prompt": P[k] + STYLE + REF + ONLY, "width": 3072, "height": 1728},
                            "7": {"seed": seed}, "9": {"filename_prefix": f"mv/kuro_blood_{k}{v}"}}, "timeout": 5400}
        json.dump(j, open(os.path.join(out, jid + ".json"), "w"), ensure_ascii=False, indent=1)
        print(jid)
