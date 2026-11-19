# copy the chosen H3 pictures (pick.json: key -> "a"|"b") into the work folder the AE specs read
import json, os, sys
H = os.path.dirname(os.path.abspath(__file__))
pick = json.load(open(os.path.join(H, 'pick.json')))
jid = sys.argv[1]
pairs = [[f"C:\\AI model\\ComfyUI\\output\\mv\\kuro_{k}{v}_00001_.png", f"C:\\AI model\\autopilot\\work\\mv\\kurobara\\img\\{k}.png"] for k, v in sorted(pick.items())]
json.dump({"id": jid, "type": "copy", "overwrite": True, "pairs": pairs}, open(os.path.join(H, jid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(pairs))
