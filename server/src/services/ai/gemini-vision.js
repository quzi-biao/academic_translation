/**
 * gemini-vision.js — 视觉识别模块
 *
 * 使用 OpenAI-compatible API（yunwu.ai）+ gemini-2.5-flash 多模态
 * 避免直连 generativelanguage.googleapis.com（国内服务器被封）
 *
 * 函数列表：
 *   identifyRegion        - 识别图片区域内容（→ expand 阶段使用）
 *   explainSpot           - 探索标注：给定 URL + 点击坐标返回中文解释
 *   explainRegionFromUrl  - 框选解读：后端 fetch 全图 → base64 → AI
 *   explainRegionFromBase64 - 框选解读：前端裁剪小图直接发送
 */
import { fetchAndCompressImage, compressDataUrl } from './imageUtils.js';

const BASE_URL = process.env.GPTIMAGE_BASE_URL || 'https://yunwu.ai';
const API_KEY  = process.env.GPTIMAGE_API_KEY;
const MODEL    = 'gemini-2.5-flash';


/**
 * 通用 vision 调用（图片 base64 dataUrl + 文本 prompt）
 * @param {string} imageDataUrl  data:image/...;base64,... 格式
 * @param {string} prompt
 * @param {number} [maxTokens]
 * @returns {Promise<string>}  AI 返回文本
 */
async function visionChat(imageDataUrl, prompt, maxTokens = 4096) {
  if (!API_KEY) throw new Error('GPTIMAGE_API_KEY 未配置');
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role:    'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text',      text: prompt },
        ],
      }],
      max_tokens:  maxTokens,
      temperature: 0.7,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('模型未返回内容');
  return content;
}

/**
 * 下载 OSS 图片并用 sharp 压缩后返回压缩后的 data URL
 * @param {string} imageUrl
 * @returns {Promise<string>}  data:image/jpeg;base64,...
 */
async function fetchImageAsDataUrl(imageUrl) {
  return fetchAndCompressImage(imageUrl);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 识别图片选区内容（用于 expand 阶段的 identification 参数）
 * @param {string} imageBase64  data URL（data:<mime>;base64,<data>）
 * @returns {Promise<{ type: string, description: string }>}
 */
export async function identifyRegion(imageBase64, promptStyle, configMap) {
  const prompt = promptStyle?.regionExploration || `Look carefully at this image region. First, decide which category it falls into:

SCENE: multiple elements, an environment, a place, a situation — something with atmosphere and story.

OBJECT: a single specific item, organism, or artifact that can be named and explained.

Reply with JSON only:
- If SCENE: {"type":"scene","description":"<2-4 sentence narrative>"}
- If OBJECT: {"type":"object","description":"<2-4 sentences: name, structure, facts>"}

Write in English. Be vivid and specific.`;
  const raw    = await visionChat(imageBase64, prompt, 300);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.type && parsed.description) return parsed;
    } catch { /* fall through */ }
  }
  return { type: 'scene', description: raw };
}

/**
 * 探索标注：给定图片 URL + 点击坐标（比例），返回中文解释。
 * 下载图片后转为 base64 发送（国内服务器可访问 OSS，yunwu.ai 无法直接 fetch 文件 URL）
 * @param {string} imageUrl  公开可访问的图片 URL（OSS）
 * @param {number} x         相对图片宽度的百分比 0~1
 * @param {number} y         相对图片高度的百分比 0~1
 * @returns {Promise<string>} 中文解释文字
 */
export async function explainSpot(imageUrl, x, y, promptStyle, configMap) {
  const xPct = Math.round(x * 100);
  const yPct = Math.round(y * 100);

  const prompt =
    `请以专业科普作者的视角，介绍图片中横向约 ${xPct}%、纵向约 ${yPct}%（从左上角起算）` +
    `位置的内容。要求：\n` +
    `① 准确识别该位置是什么（天体、物体、人物、场景等）\n` +
    `② 介绍其核心科学原理或文化意义，语言生动\n` +
    `③ 知识点精炼、信息密度高，表达简洁\n` +
    `④ 直接输出正文，不要出现"在图片"、"该位置"、"我看到"等引导词，不需要标题。`;

  const dataUrl = await fetchImageAsDataUrl(imageUrl);
  return visionChat(dataUrl, prompt, 4096);
}

/**
 * 框选区域解读：后端 fetch 全图 → base64 → AI Vision
 * @param {string} imageUrl  OSS 图片 URL
 * @param {{ x1, y1, x2, y2 }} region  选区百分比（0~1）
 * @returns {Promise<string>} 中文科普解释（Markdown 格式）
 */
export async function explainRegionFromUrl(imageUrl, region, promptStyle, configMap) {
  const x1 = Math.round(region.x1 * 100);
  const y1 = Math.round(region.y1 * 100);
  const x2 = Math.round(region.x2 * 100);
  const y2 = Math.round(region.y2 * 100);

  const prompt =
    `请以专业科普作者的视角，介绍图片中横向 ${x1}%~${x2}%、纵向 ${y1}%~${y2}%（从左上角起算）` +
    `区域的内容。要求：\n` +
    `① 准确识别该区域是什么（天体、物体、人物、场景、文字等）\n` +
    `② 介绍其核心科学原理、历史背景或文化意义\n` +
    `③ 使用 Markdown 格式（标题、加粗、列表等）组织内容\n` +
    `④ 内容精炼、知识密度高\n` +
    `直接开始正文，不要出现"在图片"、"该区域"、"我看到"等引导词。`;

  const dataUrl = await fetchImageAsDataUrl(imageUrl);
  return visionChat(dataUrl, prompt, 8192);
}

/**
 * 框选区域解读（直接 base64 版本）
 * 前端已裁剪缩放好，直接发送小图
 * @param {string} b64       纯 base64（无 data: 前缀）
 * @param {string} mimeType  如 'image/jpeg'
 * @returns {Promise<string>} 中文科普解释（Markdown 格式）
 */
export async function explainRegionFromBase64(b64, mimeType = 'image/jpeg', promptStyle, configMap) {
  const prompt = promptStyle?.pageDescription ||
    `请以专业科普作者的视角，介绍这张图片中展示的内容。要求：\n` +
    `① 准确识别图片中是什么（天体、物体、人物、场景、文字等）\n` +
    `② 介绍其核心科学原理、历史背景或文化意义\n` +
    `③ 使用 Markdown 格式（标题、加粗、列表等）组织内容\n` +
    `④ 内容精炼、知识密度高\n` +
    `直接开始正文，不要出现"在图片"、"该区域"、"我看到"等引导词。`;

  // 压缩裁剪图再发送，减小上传 payload
  const rawDataUrl       = `data:${mimeType};base64,${b64}`;
  const compressedDataUrl = await compressDataUrl(rawDataUrl);
  return visionChat(compressedDataUrl, prompt, 8192);
}
