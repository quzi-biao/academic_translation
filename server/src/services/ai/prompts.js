/**
 * 服务端 AI 提示词构建器
 * 仅保留「无限之书」暗色调模式（book/dark），其他模式已移除
 */

/** 中文标注规范（防繁体字、防乱码：大字、清晰） */
const CHINESE_LABEL_RULE =
  `CRITICAL LABEL RULES — follow exactly: ` +
  `All Simplified Chinese labels must be rendered LARGE (minimum 40px equivalent), in a clean modern sans-serif typeface, with extremely high contrast against the background. Each label is 1–4 characters. ` +
  `STRICTLY FORBIDDEN: small text, tiny characters, any text smaller than the focal element, Traditional Chinese characters (繁体字), Japanese kana, Korean hangul, garbled glyphs, cursive or calligraphic style. ` +
  `Use ONLY mainland Simplified Chinese standard glyphs: 电、学、体、国、来、说、这 — never 電、學、體、國、來、說、這.`;

/** 两侧安全区规范（防内容被裁剪） */
const SAFE_ZONE_RULE =
  `COMPOSITION SAFE ZONE — keep all key subjects, focal elements, text labels, and important details ` +
  `strictly within the central 90% of the image width. ` +
  `The leftmost 5% and rightmost 5% of the canvas must contain ONLY soft background scenery, ` +
  `atmospheric gradients, or gentle environment fill — ` +
  `absolutely NO critical content, NO text labels, NO key structural elements near the left or right edges. ` +
  `Top and bottom edges have no restrictions — content may extend fully to all vertical edges.`;


const NEGATIVE_BASE =
  `small text, tiny Chinese characters, walls of text, long paragraphs, ` +
  `text overlays reading "label", "callout", "annotation", "dotted line", "dashed line", ` +
  `"diagonal line", "label text", "text here", "placeholder", "caption", "schematic", ` +
  `Traditional Chinese characters, 繁体字, 繁體字, ` +
  `garbled Chinese glyphs, corrupted Chinese characters, illegible CJK text, mojibake, ` +
  `pixelated text, blurry text, low-resolution characters, mixed-script labels, incorrect stroke order glyphs, ` +
  `Japanese hiragana, Japanese katakana, Korean hangul, ` +
  `flat design, clipart, watermark, UI mockup, ` +
  `thick lines, bold outlines, heavy strokes, chunky illustration, ` +
  `coarse line art, simplified cartoon, loose sketch, rough brushwork, ` +
  `low detail, empty areas, sparse composition, minimal detail, ` +
  `distorted human figure, deformed anatomy, twisted limbs, incorrect body proportions, ` +
  `malformed hands, extra fingers, melted face, unnatural pose, ` +
  `uniform plant texture, repetitive vegetation stamp, copy-paste plant pattern, ` +
  `coarse crop texture, blocky vegetation, flat plant fill.`;

/** 暗色调主题风格描述 */
const DARK_THEME_STYLE =
  'Dark deep-space background with rich shadows, deep indigo and electric cyan color palette, ' +
  'warm amber highlights on focal elements, dramatic studio lighting with volumetric glow ' +
  'and cinematic depth of field.';

/**
 * 构建文生图 prompt（无限之书 — book/dark）
 * @param {string} query
 * @returns {{ positive: string, negative: string, full: string }}
 */
export function buildImagePrompt(query) {
  const positive =
    `A stunning full-page scientific illustration about "${query}". ` +
    `The image is a rich, detailed visual breakdown: cross-section views, exploded technical drawings, ` +
    `process diagrams with numbered steps, or comparative panels — ` +
    `rendered in the style of a premium science magazine cover illustration. ` +
    `FINE LINEWORK is mandatory: all outlines are thin hairlines, every detail is intricate and precise — ` +
    `no thick lines, no bold strokes, no coarse outlines anywhere. ` +
    `Human figures (if any) drawn in the style of Studio Ghibli background art — ` +
    `correct anatomy, gentle natural postures, precise editorial line art. ` +
    `Plants and natural elements individually rendered with distinct fine-line detail — ` +
    `in the style of detailed botanical illustration, no repetitive texture stamps, no uniform fills. ` +
    `Short Simplified Chinese labels (1–4 characters each) appear beside key parts, ` +
    `connected by fine hairlines — rendered LARGE and clearly legible, never small or cursive. ` +
    `${CHINESE_LABEL_RULE} ` +
    `${SAFE_ZONE_RULE} ` +
    `${DARK_THEME_STYLE} ` +
    `Ultra-high detail, every area filled with fine-line illustration content, 16:9 widescreen composition. ` +
    `Artistic quality matching Scientific American covers or National Geographic photo essays.`;

  const negative = `${NEGATIVE_BASE}, plain white background.`;
  return { positive, negative, full: `${positive}\n\nDo not include: ${negative}` };
}

/**
 * STEP 2：识别框选区域内容的 prompt
 */
export function buildIdentifyRegionPrompt() {
  return (
    `Look carefully at this image region. First, decide which category it falls into:\n\n` +
    `SCENE: multiple elements, an environment, a place, a situation — ` +
    `something with atmosphere and story (e.g. a greenhouse interior, a forest clearing, ` +
    `a market stall, a room, a landscape, a group of animals).\n\n` +
    `OBJECT: a single specific item, organism, or artifact that can be named and explained ` +
    `(e.g. a single flower, a butterfly, a specific tool, a leaf, a mushroom, a coin).\n\n` +
    `Reply with JSON only:\n` +
    `- If SCENE: {"type":"scene","description":"<2-4 sentence narrative>"}\n` +
    `- If OBJECT: {"type":"object","description":"<2-4 sentences: name, structure, facts>"}\n\n` +
    `Write in English. Be vivid and specific.`
  );
}

/**
 * STEP 3：基于识别结果扩展图片的 prompt
 * 风格与主图一致：无限之书暗色调（深空背景 + 电青 + 琥珀高光）
 *
 * 支持两种调用场景：
 *  1. 深入探索（description 为标注的科普解读长文本）
 *  2. 原有 scene/object 识别结果
 *
 * @param {'scene'|'object'} type
 * @param {string} description
 */
export function buildExpandWithKnowledgePrompt(type, description) {
  // 与 buildImagePrompt 使用相同的基础风格：暗色调科学杂志封面插图
  const styleBase =
    `FINE LINEWORK is mandatory: all outlines are thin hairlines, every detail is intricate and precise — ` +
    `no thick lines, no bold strokes, no coarse outlines anywhere. ` +
    `${DARK_THEME_STYLE} ` +
    `Full-bleed 16:9 widescreen composition. No outer border. No decorative frame. ` +
    `Ultra-high detail, every area filled with fine-line illustration content. ` +
    `Artistic quality matching Scientific American covers or National Geographic photo essays. ` +
    `${CHINESE_LABEL_RULE} ` +
    `${SAFE_ZONE_RULE}`;

  // ── 深入探索专用分支 ─────────────────────────────────
  // description 来自标注的科普解读（中文长文本）
  const isExplanation = description.length > 120 || /[\u4e00-\u9fa5]/.test(description);
  if (isExplanation) {
    const summary = description.replace(/[#*`>_\[\]]/g, '').slice(0, 300).trim();
    const action =
      `Using the provided reference image as a visual starting point, create a stunning full-page ` +
      `scientific illustration that deeply explores the subject matter described below.\n\n` +
      `Subject context (from scientific annotation):\n"${summary}"\n\n` +
      `Transform the reference image into a rich, complete educational illustration — ` +
      `a stunning full-page scientific breakdown: cross-section views, exploded technical drawings, ` +
      `process diagrams with numbered steps, or comparative panels — ` +
      `rendered in the style of a premium science magazine cover illustration. ` +
      `Show key structures, relationships, processes, or phenomena relevant to this topic. ` +
      `Add 5–8 Simplified Chinese labels (1–4 characters each) for key elements, ` +
      `connected by fine hairline arrows — rendered LARGE with high contrast, clearly legible. ` +
      `Every corner of the canvas should be filled with informative, beautifully illustrated detail.`;
    return `${action}\n\n${styleBase}`;
  }

  // ── scene 分支 ──────────────────────────────────────
  if (type === 'scene') {
    const action =
      `This image shows a scene: ${description}\n\n` +
      `Create a stunning full-page scientific illustration that expands on this scene. ` +
      `Render it in the style of a premium science magazine cover — ` +
      `every area richly detailed with fine-line illustration content. ` +
      `Populate the scene with scientifically accurate elements: ` +
      `characters, objects, natural features, and environmental details that feel real and inhabited. ` +
      `Human figures (if any) must be anatomically correct with natural posture and proper proportions, ` +
      `drawn in the style of Studio Ghibli background art — gentle, precise, expressive editorial line art. ` +
      `If the reference image contains distorted figures, redraw them correctly from scratch. ` +
      `Add 3–5 Simplified Chinese labels (1–4 characters each) for notable elements ` +
      `(fine hairline arrows, rendered LARGE and legible, high contrast against background).`;
    return `${action}\n\n${styleBase}`;
  }

  // ── object 分支 ─────────────────────────────────────
  const action =
    `This image shows: ${description}\n\n` +
    `Create a detailed scientific illustration in the style of a premium science magazine or nature encyclopedia. ` +
    `Show the subject from its most informative angle with all key structures clearly visible. ` +
    `The image is a rich visual breakdown: cross-section insets, exploded views, or comparative detail panels. ` +
    `Add 5–8 Simplified Chinese labels (1–4 characters each) for key anatomical or structural features, ` +
    `connected by fine hairline arrows — rendered LARGE with high contrast, clearly legible. ` +
    `Surround the main subject with closely related contextual elements ` +
    `(e.g. for a flower: show a bee approaching, a cross-section inset, nearby buds).`;
  return `${action}\n\n${styleBase}`;
}
