const BASE_URL = process.env.LLM_BASE_URL || process.env.GPTIMAGE_BASE_URL || 'https://yunwu.ai';
const API_KEY = process.env.LLM_API_KEY || process.env.GPTIMAGE_API_KEY;
const MODEL = process.env.LLM_MODEL || 'gemini-2.5-flash';

export async function chatText(messages, options = {}) {
  if (!API_KEY) throw new Error('LLM_API_KEY 未配置');
  const payloadMessages = Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages) }];
  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model || MODEL,
      messages: payloadMessages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.2,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error?.message || `LLM HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export async function buildTranslationPrompt(summary, options = {}) {
  return chatText([
    { role: 'system', content: '你是专业学术翻译提示词工程师。' },
    { role: 'user', content: `根据下面的文献总结，生成一段用于逐块翻译该文献的系统提示词。要求：保持术语一致，保留公式/引用/编号，中文表达准确自然，体现领域和作者文风。只输出提示词正文。\n\n${summary}` },
  ], { maxTokens: 1400, signal: options.signal });
}

export async function summarizeAcademicDocument(mdContent, options = {}) {
  const text = mdContent.slice(0, 24000);
  return chatText([
    { role: 'system', content: '你是学术文献分析助手。请用中文总结论文，不要编造。' },
    { role: 'user', content: `请总结以下学术文献，输出：研究领域、核心问题、方法、贡献、局限、术语风格、作者写作特点。\n\n${text}` },
  ], { maxTokens: 1800, signal: options.signal });
}

export async function translateBlockText(text, translationPrompt, documentSummary, options = {}) {
  if (!text?.trim()) return '';
  return chatText([
    { role: 'system', content: translationPrompt },
    { role: 'user', content: `文献摘要上下文：\n${documentSummary}\n\n请翻译这个 block。只输出译文，不要解释。需要保留 Markdown 语义、公式、代码、引用编号和专有名词一致性。\n\n[Block]\n${text}` },
  ], { maxTokens: Math.min(4096, Math.max(800, Math.ceil(text.length * 2.2))), signal: options.signal });
}
