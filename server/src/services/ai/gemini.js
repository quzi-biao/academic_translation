/**
 * gemini.js — Gemini 图像生成模块
 *
 * 函数列表：
 *   generateImage        - 文生图（query → 科普插画）
 *   expandWithKnowledge  - 图生图（选区图片 → 扩展科普图）
 *
 * 视觉识别函数 → gemini-vision.js
 * 文本生成函数 → gemini-text.js
 *
 * 图像生成 Provider 切换：
 *   IMAGE_PROVIDER=gptimage  → 使用 yunwu.ai gpt-image-2（默认）
 *   IMAGE_PROVIDER=gemini    → 使用 Gemini 原生图像模型
 */
import sharp from 'sharp';
import { generateImageGPT, expandImageGPT } from './gptimage.js';
import { pickTopics } from './knowledge-topics.js';

const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const GEMINI_BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';

/** 图像生成 Provider：'gptimage'（默认）或 'gemini' */
const IMAGE_PROVIDER = (process.env.IMAGE_PROVIDER || 'gptimage').toLowerCase();

const IMG_MODEL    = 'gemini-3-pro-image-preview';
const EXPAND_MODEL = 'gemini-3-pro-image-preview';

/**
 * 将 16:9 图片转为 16:10 比例。
 * 策略：保留全部高度，裁切两侧宽度（居中裁剪，各边约 5%）。
 * @param {string} dataUrl  data:<mime>;base64,<data>
 * @returns {Promise<string>} 裁剪后的 jpeg data URL
 */
async function cropTo16x10(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  const b64      = dataUrl.slice(commaIdx + 1);
  const buf      = Buffer.from(b64, 'base64');
  const { height } = await sharp(buf).metadata();
  const newWidth = Math.round(height * 16 / 10);
  const cropped  = await sharp(buf)
    .resize(newWidth, height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92 })
    .toBuffer();
  return `data:image/jpeg;base64,${cropped.toString('base64')}`;
}

/** 提取并解析 inlineData 图片，返回 base64 data URL */
function extractImageFromCandidates(data) {
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`模型终止（${candidate.finishReason}）`);
  }
  const parts   = candidate?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) {
    const texts = parts.filter((p) => p.text).map((p) => p.text).join(' ');
    throw new Error(`未返回图片（模型响应: "${texts.slice(0, 120)}"）`);
  }
  return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
}

/**
 * 文生图：根据 query 生成科普插画（无限之书·暗色调）
 * 根据 IMAGE_PROVIDER 选择使用 gpt-image-2 或 Gemini
 * @param {string} query
 * @returns {Promise<string>} base64 data URL
 */
export async function generateImage(query, promptStyle, configMap) {
  const provider = (promptStyle?.imageModel || configMap?.model_image_gen || process.env.IMAGE_PROVIDER || 'gptimage').toLowerCase();

  const basePrompt = promptStyle?.topicExploration ? promptStyle.topicExploration.replace(/\$\{query\}/g, query) : query;
  const unified = promptStyle?.unifiedStyle ? `\n\n${promptStyle.unifiedStyle}` : '';
  const finalPrompt = basePrompt + unified;

  if (provider === 'gptimage' || provider === 'gpt-image-2') {
    console.log('[generateImage] 使用 gpt-image-2 (yunwu.ai)');
    return generateImageGPT(finalPrompt);
  }

  // Gemini 原生实现
  console.log('[generateImage] 使用 Gemini 原生');
  const url    = `${GEMINI_BASE}/models/${IMG_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return cropTo16x10(extractImageFromCandidates(data));
}

/**
 * 图生图：基于识别结果扩展图片（科普插画风格）
 * 根据 IMAGE_PROVIDER 选择使用 gpt-image-2 或 Gemini
 * @param {string} imageBase64   裁剪区域图片（data URL）
 * @param {{ type: string, description: string }} identification
 * @returns {Promise<string>} 扩展后图片的 base64 data URL
 */
export async function expandWithKnowledge(imageBase64, identification, promptStyle, configMap) {
  const { type = 'scene', description = '' } = identification;
  const provider = (promptStyle?.imageModel || configMap?.model_image_gen || process.env.IMAGE_PROVIDER || 'gptimage').toLowerCase();

  const summary = description ? description.replace(/[#*`>_\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  const contextHint = summary ? `The selected region contains: "${summary}"\n\n` : '';
  const randomTopics = pickTopics(10).map(t => `  • ${t}`).join('\n');

  let basePrompt = promptStyle?.deepExploration || '';
  if (basePrompt) {
    basePrompt = basePrompt.replace(/\$\{contextHint\}/g, contextHint).replace(/\$\{randomTopics\}/g, randomTopics);
  } else {
    basePrompt = description;
  }
  const unified = promptStyle?.unifiedStyle ? `\n\n${promptStyle.unifiedStyle}` : '';
  const finalPrompt = basePrompt + unified;

  if (provider === 'gptimage' || provider === 'gpt-image-2') {
    console.log('[expandWithKnowledge] 使用 gpt-image-2 图生图 (yunwu.ai)，传入框选区域图');
    return expandImageGPT(imageBase64, finalPrompt);
  }

  // Gemini 原生实现
  console.log('[expandWithKnowledge] 使用 Gemini 原生');
  const commaIdx = imageBase64.indexOf(',');
  const b64      = imageBase64.slice(commaIdx + 1);
  const mimeType = imageBase64.slice(0, commaIdx).replace('data:', '').replace(';base64', '');

  const url = `${GEMINI_BASE}/models/${EXPAND_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: b64 } },
          { text: finalPrompt },
        ]
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return cropTo16x10(extractImageFromCandidates(data));
}
