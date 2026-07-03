/**
 * Prompts KV 种子脚本
 * 将所有 AI 提示词预存到数据库 prompts 表
 * 运行方式: node server/scripts/seed-prompts.js
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── 负向 prompt（全局共用） ────────────────────────────────
const NEGATIVE_BASE =
  `text overlays reading "label", "callout", "annotation", "dotted line", "dashed line", ` +
  `"diagonal line", "label text", "text here", "placeholder", "caption", "schematic", ` +
  `long paragraphs, body text blocks, walls of text, ` +
  `Chinese characters, Japanese characters, Korean characters, Asian scripts, ` +
  `garbled text, mojibake, corrupted glyphs, pixelated text, ` +
  `flat design, clipart, watermark, UI mockup, ` +
  `thick lines, bold outlines, heavy strokes, chunky illustration, ` +
  `coarse line art, simplified cartoon, loose sketch, rough brushwork, ` +
  `low detail, empty areas, sparse composition, minimal detail, ` +
  `distorted human figure, deformed anatomy, twisted limbs, incorrect body proportions, ` +
  `malformed hands, extra fingers, melted face, unnatural pose, ` +
  `uniform plant texture, repetitive vegetation stamp, copy-paste plant pattern, ` +
  `coarse crop texture, blocky vegetation, flat plant fill.`;

// ── 主题风格 ─────────────────────────────────────────────
const THEME_DARK =
  `Dark deep-space background with rich shadows, deep indigo and electric cyan color palette, ` +
  `warm amber highlights on focal elements, dramatic studio lighting with volumetric glow ` +
  `and cinematic depth of field.`;

const THEME_LIGHT =
  `Bright clean editorial background with crisp white and subtle warm cream tones, ` +
  `navy blue and warm gold as accent colors. Precise illustration style of a premium ` +
  `science print journal — clean sharp outlines, high contrast, professional daylight studio lighting.`;

// ── 空间模式正向 prompt（模板，{query} 由运行时替换） ──────
const SPACE_POSITIVE_TEMPLATE =
  `A stunning isometric editorial illustration of "{query}", ` +
  `rendered in a precise, clean isometric or elevated 3/4-perspective style. ` +
  `Art style: high-quality editorial infographic illustration — ` +
  `FINE, PRECISE linework throughout: every outline is a thin hairline, ` +
  `intricate detail in every element — no thick lines, no bold outlines anywhere. ` +
  `Every element crisply defined and legible at high magnification. ` +
  `Color palette — follow this exactly: ` +
  `warm cream / soft off-white as the dominant background tone; ` +
  `muted sage green for all vegetation, trees, and organic life; ` +
  `warm medium grey for stone, rock, concrete, and terrain surfaces; ` +
  `dusty terracotta and muted salmon-pink as accent and highlight colors; ` +
  `golden wood brown for organic structures and warm elements; ` +
  `soft blue-grey for shadows, depth, and atmospheric receding planes. ` +
  `All colors are desaturated and harmonious — never bright, neon, or oversaturated. ` +
  `The scene is richly layered with ecological or geographic depth: ` +
  `foreground elements are large and precisely detailed; ` +
  `mid-ground has varied life, terrain, and forms; ` +
  `background recedes with soft atmospheric perspective. ` +
  `Human figures (if any) must be anatomically correct with natural posture and proper proportions, ` +
  `drawn in the style of Studio Ghibli background art — gentle, precise, expressive editorial line art. ` +
  `Vegetation and crops must be individually rendered: each plant drawn separately ` +
  `with distinct fine-line leaf shapes and natural spacing variation — ` +
  `in the style of detailed botanical illustration, never uniform texture stamps. ` +
  `3 to 6 key elements are labeled with short English nouns or short phrases (1–4 words), ` +
  `each connected to its element by a fine hairline arrow — ` +
  `labels use a clean minimal sans-serif typeface, small and unobtrusive. ` +
  `The illustration fills the entire canvas to all four edges with no outer border, ` +
  `no decorative frame, no corner brackets, no white margin. ` +
  `Wide 16:9 horizontal composition, full-bleed.`;

const SPACE_NEGATIVE =
  `${NEGATIVE_BASE}, ` +
  `photorealistic photograph, blurry, soft focus, out of focus, ` +
  `neon colors, oversaturated palette, dark gothic mood, ` +
  `outer border, picture frame, decorative frame, rectangular frame outline, ` +
  `corner brackets, page border, white margin, thick outline around the image, ` +
  `panel edge, comic book panel border, vignette border, ` +
  `empty scene, single isolated object, plain white background, watermark, ` +
  `more than 8 text labels, long text blocks, paragraph text.`;

// ── 书模式正向 prompt（模板） ─────────────────────────────
const BOOK_POSITIVE_TEMPLATE =
  `A stunning full-page scientific illustration about "{query}". ` +
  `The image is a rich, detailed visual breakdown: cross-section views, exploded technical drawings, ` +
  `process diagrams with numbered steps, or comparative panels — ` +
  `rendered in the style of a premium science magazine cover illustration. ` +
  `FINE LINEWORK is mandatory: all outlines are thin hairlines, every detail is intricate and precise — ` +
  `no thick lines, no bold strokes, no coarse outlines anywhere. ` +
  `Human figures (if any) drawn in the style of Studio Ghibli background art — ` +
  `correct anatomy, gentle natural postures, precise editorial line art. ` +
  `Plants and natural elements individually rendered with distinct fine-line detail — ` +
  `in the style of detailed botanical illustration, no repetitive texture stamps, no uniform fills. ` +
  `Short identifying names (1–3 English words) appear beside key parts, ` +
  `connected by fine hairlines. ` +
  `Ultra-high detail, every area filled with fine-line illustration content, 16:9 widescreen composition. ` +
  `Artistic quality matching Scientific American covers or National Geographic photo essays.`;

const BOOK_NEGATIVE = `${NEGATIVE_BASE}, plain white background.`;

// ── STEP 2：识别框选区域 prompt ───────────────────────────
const IDENTIFY_REGION_PROMPT =
  `Look carefully at this image region. First, decide which category it falls into:\n\n` +
  `SCENE: multiple elements, an environment, a place, a situation — ` +
  `something with atmosphere and story (e.g. a greenhouse interior, a forest clearing, ` +
  `a market stall, a room, a landscape, a group of animals).\n\n` +
  `OBJECT: a single specific item, organism, or artifact that can be named and explained ` +
  `(e.g. a single flower, a butterfly, a specific tool, a leaf, a mushroom, a coin).\n\n` +
  `Reply with JSON only:\n` +
  `- If SCENE: {"type":"scene","description":"<2-4 sentence narrative>"}\n` +
  `- If OBJECT: {"type":"object","description":"<2-4 sentences: name, structure, facts>"}\n\n` +
  `Write in English. Be vivid and specific.`;

// ── STEP 3：场景扩展 prompt（模板，{description} 由运行时替换） ─
const EXPAND_SCENE_TEMPLATE =
  `This image shows a scene: {description}\n\n` +
  `Create a richly detailed isometric editorial illustration that brings this scene to life. ` +
  `Tell the story of this place: populate every area with characters, objects, textures, ` +
  `lighting, and life that makes the scene feel inhabited and alive. ` +
  `Capture the mood and atmosphere — time of day, season, activity, emotion. ` +
  `Every corner should hold something interesting to discover. ` +
  `IMPORTANT — Figure correction: if the reference image contains human figures that look ` +
  `distorted, deformed, twisted, or anatomically incorrect, do NOT copy that distortion. ` +
  `Redraw all human figures from scratch in the style of Studio Ghibli background art — ` +
  `correct anatomy, natural proportions, gentle expressive postures, precise clean linework. ` +
  `Treat the reference image as a rough draft for composition only; figures must be redrawn correctly. ` +
  `Add 3–5 short English labels for notable scene elements (hairline arrows, unobtrusive). ` +
  `Style: FINE, PRECISE linework — every outline is a thin hairline, intricate detail throughout. ` +
  `No thick lines, no bold outlines, no coarse strokes. ` +
  `Color palette: warm cream background, muted sage green, warm medium grey, dusty terracotta accents. ` +
  `Full-bleed 16:9 wide canvas. No outer border. No decorative frame.`;

// ── STEP 3：物体扩展 prompt（模板） ───────────────────────
const EXPAND_OBJECT_TEMPLATE =
  `This image shows: {description}\n\n` +
  `Create a detailed scientific/educational illustration in the style of a nature encyclopedia ` +
  `or premium science magazine diagram. ` +
  `Show the subject from its most informative angle with all key structures clearly visible. ` +
  `Add 5–8 precise scientific annotations: label each key anatomical or structural feature ` +
  `with its correct English name, connected by fine hairline arrows. ` +
  `Surround the main subject with closely related contextual elements ` +
  `(e.g. for a flower: show a bee approaching, a cross-section inset, nearby buds). ` +
  `Style: FINE, PRECISE linework — every outline is a thin hairline, intricate detail throughout. ` +
  `No thick lines, no bold outlines, no coarse strokes. ` +
  `Color palette: warm cream background, muted sage green, warm medium grey, dusty terracotta accents. ` +
  `Full-bleed 16:9 wide canvas. No outer border. No decorative frame.`;

// ── 种子数据 ──────────────────────────────────────────────
const SEEDS = [
  { key: 'negative.base',           value: NEGATIVE_BASE },
  { key: 'theme.dark',              value: THEME_DARK },
  { key: 'theme.light',             value: THEME_LIGHT },
  { key: 'space.positive.template', value: SPACE_POSITIVE_TEMPLATE },
  { key: 'space.negative',          value: SPACE_NEGATIVE },
  { key: 'book.positive.template',  value: BOOK_POSITIVE_TEMPLATE },
  { key: 'book.negative',           value: BOOK_NEGATIVE },
  { key: 'identify.region',         value: IDENTIFY_REGION_PROMPT },
  { key: 'expand.scene.template',   value: EXPAND_SCENE_TEMPLATE },
  { key: 'expand.object.template',  value: EXPAND_OBJECT_TEMPLATE },
];

async function main() {
  console.log('🌱 开始写入 prompts 种子数据...');
  let count = 0;

  for (const { key, value } of SEEDS) {
    await prisma.prompt.upsert({
      where:  { key },
      create: { key, value },
      update: { value },
    });
    console.log(`  ✅ ${key}`);
    count++;
  }

  console.log(`\n🎉 完成！共写入 ${count} 条 prompt 记录。`);
}

main()
  .catch((e) => { console.error('❌ 错误:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
