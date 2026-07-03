import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const unifiedStyle = `MANDATORY fine linework: all outlines are thin hairlines, every detail intricate and precise — absolutely no thick lines, no bold strokes, no coarse outlines.
No dot patterns, no stippling, no particle scatter — use continuous line art and solid color fills.
Dark deep-space background, deep indigo and electric cyan palette, warm amber highlights on focal elements, dramatic studio lighting with volumetric glow.
CRITICAL LABEL RULES: Add 6–8 key Simplified Chinese labels for the most important elements only. Each label must be 10 characters or fewer. Rendered LARGE with high contrast. FORBIDDEN: more than 8 labels, labels longer than 10 characters, small text, Traditional Chinese, Japanese kana, Korean hangul, garbled glyphs, cursive style. Use ONLY mainland Simplified Chinese glyphs: 电学体国来说这 — never 電學體國來說這.`;

const topicExploration = `A stunning full-page scientific illustration about "\${query}". Rich visual breakdown: cross-section views, exploded technical drawings, process diagrams with numbered steps, or comparative panels — in the style of a premium science magazine cover illustration.
Human figures (if any): Studio Ghibli background art style — correct anatomy, natural postures.
Plants and natural elements: detailed botanical illustration style, no repetitive stamps.
Add Simplified Chinese labels (up to 10 characters each) beside ALL key parts — label as many elements as possible, connected by fine hairlines — LARGE, clearly legible, never small or cursive.
Ultra-high detail, every area filled with line art. 16:9 widescreen. Artistic quality matching Scientific American or National Geographic.

Do not include: small text, garbled Chinese characters, Traditional Chinese, dense label clusters, walls of text, long paragraphs, schematic labels, placeholder text, flat design, clipart, watermark, UI mockup, pointillism, stippling, dot texture, halftone dots, grain noise, particle scatter, speckle pattern, dot clusters, thick lines, bold outlines, chunky illustration, simplified cartoon, rough brushwork, low detail, empty areas, sparse composition, distorted anatomy, malformed hands, extra fingers, repetitive vegetation stamp, uniform plant texture., plain white background.`;

const regionExploration = `Look carefully at this image region. First, decide which category it falls into:

SCENE: multiple elements, an environment, a place, a situation — something with atmosphere and story (e.g. a greenhouse interior, a forest clearing, a market stall, a room, a landscape, a group of animals).

OBJECT: a single specific item, organism, or artifact that can be named and explained (e.g. a single flower, a butterfly, a specific tool, a leaf, a mushroom, a coin).

Reply with JSON only:
- If SCENE: {"type":"scene","description":"<2-4 sentence narrative>"}
- If OBJECT: {"type":"object","description":"<2-4 sentences: name, structure, facts>"}

Write in English. Be vivid and specific.`;

const deepExploration = `\${contextHint}IMPORTANT: Examine the input image carefully.

IF the input image contains a RECOGNIZABLE SUBJECT (animal, plant, object, structure, mechanism, landform, celestial body, human figure, or any distinct entity):
→ Create a premium scientific encyclopedia spread with THREE visual layers:

  LAYER 1 — MAIN SUBJECT (occupy ~40% of canvas, prominently centered or slightly left):
    Render the primary subject faithfully and clearly — preserve its appearance, correct anatomy, and recognizable features. This subject MUST dominate the image.

  LAYER 2 — INTERNAL STRUCTURE (inset cutaway, lower-right or top-right corner, ~25% of canvas):
    Show a detailed cross-section or exploded diagram revealing the subject's hidden interior — internal organs, cellular layers, mechanical components, geological strata, molecular structure, or whatever is scientifically appropriate. Connect to the main subject with fine annotation lines.

  LAYER 3 — EXTERNAL RELATIONSHIPS & KNOWLEDGE (surrounding empty space, ~35% of canvas):
    Illustrate how this subject connects outward — ecological relationships (food chain, symbiosis, habitat), physical processes (forces, energy flows, chemical reactions), evolutionary relatives or comparative variants, or cause-and-effect chains in its broader system. Show at least 2–3 connected external elements with linking arrows.

IF the input image is predominantly UNIFORM COLOR, BLANK AREA, or FEATURELESS BACKGROUND (solid sky, empty water, plain texture, abstract gradient):
→ Ignore the input image entirely. Instead, create a surprising full-page scientific illustration about ONE topic from this list — pick whichever inspires the most visually rich and dramatic illustration:
\${randomTopics}

For ALL cases:
Human figures (if any): anatomically correct, Studio Ghibli editorial art style. Add Simplified Chinese labels (up to 10 characters each) for ALL notable elements — fine hairline arrows, LARGE legible sans-serif, maximum contrast. Every region of the canvas must be filled with detailed illustration — no empty space.
Full-bleed 3:2 landscape composition. No outer border. No frame. Ultra-high detail, every area filled with fine-line illustration. Artistic quality matching Scientific American or National Geographic.`;

async function main() {
  const style = await prisma.promptStyle.upsert({
    where: { name: '酷炫科普风' },
    update: {},
    create: {
      name: '酷炫科普风',
      isActive: true,
      imageModel: 'gpt-image-2',
      unifiedStyle,
      topicExploration,
      regionExploration,
      deepExploration,
      ttsSynthesis: '',
      pageDescription: ''
    }
  });

  console.log('Seed PromptStyle completed:', style.id);

  // Bind all devices to this style if not already
  const updatedDevices = await prisma.device.updateMany({
    where: { promptStyleId: null },
    data: { promptStyleId: style.id }
  });

  console.log(`Updated ${updatedDevices.count} devices to use 酷炫科普风.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
