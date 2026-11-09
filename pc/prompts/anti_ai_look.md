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

## Anima (graph `pc/comfy_graphs/anima_t2i_v1.json`)

~40 s per image (er_sde, 30 steps, cfg 4). `anima-aesthetic-v1.1` with
`masterpiece, best quality, score_7, safe,` gives a polished modern illustration;
`anime screenshot, anime coloring, flat color,` gives flat anime coloring. In this test the hair
color drifted lighter than asked, the umbrella came out pure #FFFF00 yellow, and some hands broke.

## Licences

- Qwen Image 2.1: Qwen Research License, model use is non-commercial (research/evaluation).
- Anima: model is non-commercial, but the model card states generated images may be used commercially.
