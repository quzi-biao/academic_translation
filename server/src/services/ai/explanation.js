/**
 * explanation.js — 书页科普解读生成服务
 *
 * 使用 OpenAI-compatible API（yunwu.ai）+ gemini-2.5-flash 多模态
 * 避免直连 generativelanguage.googleapis.com（国内服务器被封）
 *
 * 风格：科普，生动活泼，600-1000字，中文，内容客观真实
 */

import { fetchAndCompressImage } from './imageUtils.js';

const BASE_URL = process.env.GPTIMAGE_BASE_URL || 'https://yunwu.ai';
const API_KEY  = process.env.GPTIMAGE_API_KEY;
const MODEL    = 'gemini-2.5-flash';


/**
 * 根据语言代码返回解读提示词
 * @param {string} pagePrompt  生成该页的原始提示词
 * @param {string} lang        语言代码 'zh' | 'en'
 * @returns {string}
 */
function buildExplanationPrompt(pagePrompt, lang) {
  if (lang === 'zh') {
    return `你是一位顶级科普作家，擅长将复杂知识以生动有趣、深入浅出的方式传递给大众。

这张图片的主题是："${pagePrompt}"。

请仔细观察图片的每一个细节，结合你扎实的科学知识，撰写一篇关于这个主题的科普文章。

写作要求：
1. **字数**：600～1000 字，内容准确充实，行文流畅，全文必须完整（最后一句话以句号结尾）
2. **风格**：生动活泼，语言风趣，像讲故事一样引人入胜，避免枯燥的说教
3. **准确性**：所有知识点必须客观真实，经过验证，不编造任何信息
4. **结构**：使用 Markdown 格式，包含开篇、知识点段落、结尾；最后一段以完整句号结束
5. **视角**：从图片中可见的内容出发，延伸到背后的科学原理、历史背景、有趣事实

请直接输出文章内容，用中文撰写，使用 Markdown 格式。`;
  }
  return `You are a top science writer. Write an engaging, accurate article (600-900 words, must end with a complete sentence) about the topic shown in this image: "${pagePrompt}". Use Markdown format.`;
}


/**
 * 生成书页科普解读
 * @param {string} imageUrl   页面图片 OSS URL
 * @param {string} pagePrompt 生成该页的提示词
 * @param {string} [lang]     语言代码，默认 'zh'
 * @returns {Promise<string>} Markdown 格式的解读文章
 */
export async function generatePageExplanation(imageUrl, pagePrompt, lang = 'zh') {
  if (!API_KEY) throw new Error('GPTIMAGE_API_KEY 未配置');

  // 压缩图片到 ≤1024px / JPEG 80%，payload 从 ~1.4MB → ~150KB
  const dataUrl    = await fetchAndCompressImage(imageUrl);
  const textPrompt = buildExplanationPrompt(pagePrompt || '未知主题', lang);

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
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text',      text: textPrompt },
        ],
      }],
      max_tokens:  4096,
      temperature: 1.0,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('模型未返回文字内容');
  return content;
}
