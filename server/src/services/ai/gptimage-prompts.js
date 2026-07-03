/**
 * gpt-image-2 专用提示词构建器
 * 与 prompts.js（Gemini 用）分离，单独维护优化策略：
 *   - 文字标注适量（6-8个）且大（防乱码）
 *   - 深入探索：以框选主体为核心，展开内部结构/外部关系/相关知识
 *   - 禁止点状/点彩/噪点元素，使用连续线条填充
 */

import { pickTopics } from './knowledge-topics.js';

// ── 共用样式常量 ─────────────────────────────────────────────

/** 中文标注规范（大字、防乱码） */
const CHINESE_LABEL_RULE =
  `CRITICAL LABEL RULES: ` +
  `Add 6–8 key Simplified Chinese labels for the most important elements only. ` +
  `Each label must be 10 characters or fewer. Rendered LARGE with high contrast. ` +
  `FORBIDDEN: more than 8 labels, labels longer than 10 characters, small text, Traditional Chinese, Japanese kana, Korean hangul, garbled glyphs, cursive style. ` +
  `Use ONLY mainland Simplified Chinese glyphs: 电学体国来说这 — never 電學體國來說這.`;

/** 暗色调风格 */
const DARK_THEME_STYLE =
  `Dark deep-space background, deep indigo and electric cyan palette, ` +
  `warm amber highlights on focal elements, dramatic studio lighting with volumetric glow.`;

/** 细线工艺规范 */
const FINE_LINE_RULE =
  `MANDATORY fine linework: all outlines are thin hairlines, every detail intricate and precise — ` +
  `absolutely no thick lines, no bold strokes, no coarse outlines.`;

/** negative prompt 基础 */
const NEGATIVE_BASE =
  `small text, garbled Chinese characters, Traditional Chinese, dense label clusters, ` +
  `walls of text, long paragraphs, schematic labels, placeholder text, ` +
  `flat design, clipart, watermark, UI mockup, ` +
  `pointillism, stippling, dot texture, halftone dots, grain noise, particle scatter, speckle pattern, dot clusters, ` +
  `thick lines, bold outlines, chunky illustration, simplified cartoon, rough brushwork, ` +
  `low detail, empty areas, sparse composition, ` +
  `distorted anatomy, malformed hands, extra fingers, ` +
  `repetitive vegetation stamp, uniform plant texture.`;

/**
 * 构建文生图 prompt（gpt-image-2 版）
 * @param {string} query
 * @returns {{ positive: string, negative: string, full: string }}
 */
export function buildImagePromptGPT(query) {
  const positive =
    `A stunning full-page scientific illustration about "${query}". ` +
    `Rich visual breakdown: cross-section views, exploded technical drawings, ` +
    `process diagrams with numbered steps, or comparative panels — ` +
    `in the style of a premium science magazine cover illustration. ` +
    `${FINE_LINE_RULE} ` +
    `No dot patterns, no stippling, no particle scatter — use continuous line art and solid color fills. ` +
    `Human figures (if any): Studio Ghibli background art style — correct anatomy, natural postures. ` +
    `Plants and natural elements: detailed botanical illustration style, no repetitive stamps. ` +
    `Add Simplified Chinese labels (up to 10 characters each) beside ALL key parts — label as many elements as possible, ` +
    `connected by fine hairlines — LARGE, clearly legible, never small or cursive. ` +
    `${CHINESE_LABEL_RULE} ` +
    `${DARK_THEME_STYLE} ` +
    `Ultra-high detail, every area filled with line art. 16:9 widescreen. ` +
    `Artistic quality matching Scientific American or National Geographic.`;

  const negative = `${NEGATIVE_BASE}, plain white background.`;
  return { positive, negative, full: `${positive}\n\nDo not include: ${negative}` };
}

/**
 * 构建深入探索 prompt（gpt-image-2 版）
 *
 * 核心策略：
 *   - 以框选主体为核心中心，不能丢失主体
 *   - 三层展开：内部结构 + 外部关系 + 相关知识
 *   - 若框选区域为纯色/空白，从 knowledge-topics.js 随机抽 10 条让 AI 选
 *   - 文字标注 6-8 个，字号大，防乱码
 *   - 禁止点状/噪点元素
 *
 * @param {'scene'|'object'} type
 * @param {string} description  区域解读文本（中文科普内容）
 * @returns {string}
 */
export function buildExpandWithKnowledgePromptGPT(type, description) {
  const styleBase =
    `${FINE_LINE_RULE} ` +
    `No dot patterns, no stippling, no particle scatter, no grain — use continuous line art and solid color fills. ` +
    `${DARK_THEME_STYLE} ` +
    `Full-bleed 3:2 landscape composition. No outer border. No frame. ` +
    `Ultra-high detail, every area filled with fine-line illustration. ` +
    `Artistic quality matching Scientific American or National Geographic. ` +
    `${CHINESE_LABEL_RULE} `;

  // 从解读文本中提取简短摘要（去除 Markdown）
  const summary = description
    ? description.replace(/[#*`>_\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
    : '';

  const contextHint = summary
    ? `The selected region contains: "${summary}"\n\n`
    : '';

  // 每次随机抽取 10 个知识点（来自独立 knowledge-topics.js）
  const randomTopics = pickTopics(10).map(t => `  • ${t}`).join('\n');

  const action =
    `${contextHint}` +
    `IMPORTANT: Examine the input image carefully.\n\n` +

    // ── 情形 A：有明确主体 ──
    `IF the input image contains a RECOGNIZABLE SUBJECT ` +
    `(animal, plant, object, structure, mechanism, landform, celestial body, human figure, or any distinct entity):\n` +
    `→ Create a premium scientific encyclopedia spread with THREE visual layers:\n\n` +

    `  LAYER 1 — MAIN SUBJECT (occupy ~40% of canvas, prominently centered or slightly left):\n` +
    `    Render the primary subject faithfully and clearly — preserve its appearance, ` +
    `    correct anatomy, and recognizable features. This subject MUST dominate the image.\n\n` +

    `  LAYER 2 — INTERNAL STRUCTURE (inset cutaway, lower-right or top-right corner, ~25% of canvas):\n` +
    `    Show a detailed cross-section or exploded diagram revealing the subject's hidden interior — ` +
    `    internal organs, cellular layers, mechanical components, geological strata, ` +
    `    molecular structure, or whatever is scientifically appropriate. ` +
    `    Connect to the main subject with fine annotation lines.\n\n` +

    `  LAYER 3 — EXTERNAL RELATIONSHIPS & KNOWLEDGE (surrounding empty space, ~35% of canvas):\n` +
    `    Illustrate how this subject connects outward — ` +
    `    ecological relationships (food chain, symbiosis, habitat), ` +
    `    physical processes (forces, energy flows, chemical reactions), ` +
    `    evolutionary relatives or comparative variants, ` +
    `    or cause-and-effect chains in its broader system. ` +
    `    Show at least 2–3 connected external elements with linking arrows.\n\n` +

    // ── 情形 B：纯色/空白区域 ──
    `IF the input image is predominantly UNIFORM COLOR, BLANK AREA, ` +
    `or FEATURELESS BACKGROUND (solid sky, empty water, plain texture, abstract gradient):\n` +
    `→ Ignore the input image entirely. Instead, create a surprising full-page ` +
    `scientific illustration about ONE topic from this list — ` +
    `pick whichever inspires the most visually rich and dramatic illustration:\n` +
    `${randomTopics}\n\n` +

    // ── 共同规则 ──
    `For ALL cases:\n` +
    `Human figures (if any): anatomically correct, Studio Ghibli editorial art style. ` +
    `Add Simplified Chinese labels (up to 10 characters each) for ALL notable elements — ` +
    `fine hairline arrows, LARGE legible sans-serif, maximum contrast. ` +
    `Every region of the canvas must be filled with detailed illustration — no empty space.`;

  return `${action}\n\n${styleBase}`;
}
