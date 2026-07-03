/**
 * gemini-text.js — 文本/图片标题生成模块
 *
 * 使用 OpenAI-compatible API（yunwu.ai）+ gemini-2.5-flash
 * 避免直连 generativelanguage.googleapis.com（国内服务器被封）
 *
 * 函数列表：
 *   generateTitleFromText  - 从文本提示词生成简短中文标题
 *   generateTitleFromImage - 从图片 URL 生成简短中文标题
 *   generateTitle          - 为深入探索页面生成标题（from 标注 explanation）
 *   generateRandomTopics   - 随机生成 5 个百科话题（从 DB topics 表）
 */
import prisma from '../../config/db.js';

const BASE_URL = process.env.GPTIMAGE_BASE_URL || 'https://yunwu.ai';
const API_KEY  = process.env.GPTIMAGE_API_KEY;
const MODEL    = 'gemini-2.5-flash';

/**
 * 调用 OpenAI chat completions（纯文本）
 * @param {string} prompt
 * @param {number} [maxTokens]
 * @returns {Promise<string>}
 */
async function chatText(prompt, maxTokens = 512) {
  if (!API_KEY) throw new Error('GPTIMAGE_API_KEY 未配置');
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model:       MODEL,
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  maxTokens,
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * 调用 OpenAI chat completions（图片 + 文本）
 * @param {string} imageDataUrl  data:image/...;base64,...
 * @param {string} prompt
 * @param {number} [maxTokens]
 * @returns {Promise<string>}
 */
async function chatVision(imageDataUrl, prompt, maxTokens = 60) {
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
      temperature: 0.3,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * 从文本提示词生成简短中文标题（2-15 字）
 * @param {string} text  prompt 或解读文本
 * @returns {Promise<string|null>}
 */
export async function generateTitleFromText(text) {
  if (!text) return null;

  // 清理输入：如果是 JSON 字符串，尝试提取 description
  let cleaned = text.trim();
  if (cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned);
      cleaned = parsed.description || parsed.title || cleaned;
    } catch { /* 非 JSON，保持原文 */ }
  }
  // 去掉 Markdown 标记，截取前 600 字
  cleaned = cleaned.replace(/[#*`>\[\]_]/g, '').slice(0, 600).trim();
  if (!cleaned) return null;

  const prompt =
    `根据以下内容，生成一个简短的中文页面标题。\n` +
    `要求：\n` +
    `① 不超过 15 个汉字（含标点）\n` +
    `② 语言简洁、精准，能概括核心主题\n` +
    `③ 直接输出标题文字，不要加引号、序号或任何解释\n\n` +
    `内容：\n${cleaned}`;

  const raw     = await chatText(prompt, 60);
  const trimmed = raw.length <= 15 ? raw : raw.slice(0, 15);
  return trimmed.length >= 2 ? trimmed : null;
}

/**
 * 从图片 URL 生成简短中文标题（4-15 字）
 * @param {string} imageUrl  公开可访问的图片 URL
 * @returns {Promise<string|null>}
 */
export async function generateTitleFromImage(imageUrl) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`图片下载失败 (${imgRes.status})`);
  const buffer   = await imgRes.arrayBuffer();
  const b64      = Buffer.from(buffer).toString('base64');
  const mimeType = (imgRes.headers.get('content-type')?.split(';')[0]) || 'image/jpeg';
  const dataUrl  = `data:${mimeType};base64,${b64}`;

  const prompt =
    `观察这张图片，用4到15个汉字（含标点）生成一个简洁精准的中文页面标题。\n` +
    `要求：\n` +
    `① 不少于 4 个汉字，不超过 15 个汉字（含标点）\n` +
    `② 语言简洁、精准，能概括图片核心主题\n` +
    `③ 直接输出标题文字，不要加引号、序号或任何解释`;

  const raw     = await chatVision(dataUrl, prompt, 60);
  const trimmed = raw.length <= 15 ? raw : raw.slice(0, 15);
  return trimmed.length >= 4 ? trimmed : null;
}

/**
 * 为深入探索页面生成简短标题（≤ 15 字）
 * @param {string} explanation  标注的科普解读原文（可含 Markdown）
 * @returns {Promise<string>}
 */
export async function generateTitle(explanation) {
  const text = explanation.replace(/[#*`>_\[\]]/g, '').slice(0, 600).trim();

  const prompt =
    `根据以下科普内容，生成一个简短的中文页面标题。\n` +
    `要求：\n` +
    `① 不少于 4 个汉字，不超过 15 个汉字（含标点）\n` +
    `② 语言简洁、精准，能概括核心主题\n` +
    `③ 直接输出标题文字，不要加引号、序号或任何解释\n\n` +
    `内容：\n${text}`;

  const raw     = await chatText(prompt, 60);
  const trimmed = raw.length <= 15 ? raw : raw.slice(0, 15);
  return trimmed.length >= 4 ? trimmed : (raw.slice(0, 15) || '深入探索');
}

/**
 * 随机生成 5 个百科话题（直接从 DB topics 表随机查询）
 * @returns {Promise<string[]>}
 */
export async function generateRandomTopics() {
  const rows   = await prisma.$queryRaw`SELECT name FROM topics ORDER BY RANDOM() LIMIT 5`;
  const topics = rows.map(r => r.name);
  console.log('[generateRandomTopics]', topics);
  return topics;
}
