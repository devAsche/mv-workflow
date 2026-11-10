# Character prompts that avoid the generated look (tested 2026-11-09)

Tested on an RTX 3060 Ti 8GB, 896x1152, same character and seeds across variants.
Result images live outside the repo (project files `tests/ailook/`).

## Qwen Image 2.1 (graph `pc/comfy_graphs/qwen_t2i_v1.json`)

What made the difference was the wording of the prompt, not extra models:

- Leave out quality words (`highly detailed`, `masterpiece`, `best quality`, `beautiful lighting`, `crisp`).
- Ask for a hand-drawn TV anime cel: flat cel coloring with one hard-edged shadow tone per color,
  matte colors, no glossy highlights, varied line weight, simple eyes, a face that is not idealized,
  and a background with less detail than the character.
- cfg 1 ignores the negative prompt (ComfyUI skips the negative pass). cfg 2 with the negative
  below made lines a little cleaner; it takes ~140 s instead of ~80 s per image.
- The Texture-Fix VAE made no visible difference on these flat images.
- Name the palette from the character's own colors. A generic "muted greys" palette turned
  ash-brown hair grey.

Template (fill `{CHARACTER}`, `{SCENE}`, `{PALETTE}`):

```
Hand-drawn 2D TV anime key frame, like a single cel from a 2000s hand-painted anime episode.
{CHARACTER}, {SCENE}.
Flat cel coloring: each color has exactly one hard-edged shadow tone and no airbrushed gradients.
Matte colors with no glossy highlights on skin or hair. A restrained palette of {PALETTE}.
Slightly uneven, hand-inked outlines with varied line weight, thicker on the outer contour and thin inside.
Simple drawn eyes with one small highlight. A natural, slightly asymmetrical face that is not idealized.
The background is a loosely painted, simplified scene with much less detail than the character.
No text, no watermark.
```

Negative (only with cfg > 1):

```
3d render, cgi, octane render, glossy skin, shiny hair highlights, airbrushed gradient shading, soft glow,
bloom, rim light, lens flare, oversaturated colors, hyper detailed, over-rendered, intricate details everywhere,
plastic look, photorealistic, depth of field bokeh, perfectly symmetrical face, text, watermark, signature
```

## Anima "⑤" — the chosen look (2026-11-10)

Graph `pc/comfy_graphs/anima_t2i_v1.json` with `anima-aesthetic-v1.1.safetensors`
(text encoder `qwen_3_06b_base.safetensors` via CLIPLoader type `stable_diffusion`, VAE
`qwen_image_vae.safetensors`), er_sde / simple, 30 steps, cfg 4. About 40 s per image at
896x1152 or 1344x768 on the RTX 3060 Ti. 40 steps took 50 s and looked the same.

Positive = style prefix + Danbooru-style tags + at least two sentences of plain English.
Put every colour in words, both the one wanted and the one to avoid: without that, ash-brown hair
came out blonde, the yellow umbrella came out #FFFF00 (or ochre when asked for "golden-yellow"),
and some seeds gave darker skin than intended.

```
anime screenshot, anime coloring, flat color, safe, {CHARACTER_TAGS}, {SCENE_TAGS}.
{CHARACTER_SENTENCE with explicit colours, e.g. "fair skin", "ash-brown hair, a muted greyish brown
that is not blonde", "a bright yellow umbrella, clearly yellow rather than orange or ochre"}.
{POSE_SENTENCE, e.g. "fingers wrapped naturally around the curved handle"}. {SCENE_SENTENCE}.
```

Character negative:

```
worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia, 3d, realistic,
glossy skin, shiny skin, gradient, bloom, lens flare, text, watermark, blonde hair, dark skin,
orange umbrella, neon colors, oversaturated, bad hands, extra fingers, missing fingers, fused fingers, bad anatomy
```

Backgrounds without people: start the tags with `no humans, scenery,`, end the sentences with
"No people.", and add `people, person, 1girl, 1boy` to the negative. A cold scene takes `blue theme`.
Tested at 1344x768: a rainy night street with the character small in frame, an empty alley, a view
straight down on the umbrella, and a puddle close-up all kept the same look.

Character D tags used in the test (Amatsubu Parade protagonist):
`androgynous, solo, short hair, wavy hair, brown hair, ash brown hair, big eyes, round eyes, brown eyes,
fair skin, long coat, navy duffel coat, toggle buttons, mustard yellow scarf, fringe scarf, jeans,
cuffed jeans, brown boots, holding umbrella, yellow umbrella`

## Anima, first comparison (2026-11-09)

~40 s per image (er_sde, 30 steps, cfg 4). `anima-aesthetic-v1.1` with
`masterpiece, best quality, score_7, safe,` gives a polished modern illustration;
`anime screenshot, anime coloring, flat color,` gives flat anime coloring. In this test the hair
color drifted lighter than asked, the umbrella came out pure #FFFF00 yellow, and some hands broke.

## Licences

- Qwen Image 2.1: Qwen Research License, model use is non-commercial (research/evaluation).
- Anima: model is non-commercial, but the model card states generated images may be used commercially.
