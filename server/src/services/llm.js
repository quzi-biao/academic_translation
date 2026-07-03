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
    { role: 'user', content: `根据下面的文献总结，生成一段用于逐块翻译该文献的系统提示词。要求：
1. 保持术语一致，保留公式、引用、编号、表格结构、图片占位和 Markdown 语义。
2. 中文表达准确、克制、学术化，体现领域和作者文风。
3. 必须加入硬约束：只能翻译当前 block 中实际出现的内容，严禁补全、扩写、解释、推断、总结、润色性增补。
4. 如果当前 block 只有标题，就只能输出标题译文；如果原文残缺，就按残缺原样翻译，不得根据上下文补写缺失内容。
5. 不得把文献摘要、上下文说明或常识内容混入译文。

只输出提示词正文。\n\n${summary}` },
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
    { role: 'user', content: `文献摘要上下文（仅用于术语和风格一致性，不能补充原文缺失内容）：\n${documentSummary}\n\n请翻译下面这个 block，并严格遵守以下硬约束：
1. 只能翻译当前 block 中实际出现的文字、代码、编号、表格与图片描述。
2. 严禁补全、扩写、解释、推断、总结、重述、润色性增补，严禁加入原文没有出现的句子或段落。
3. 如果当前 block 只有标题、作者信息、机构信息、图注、表注或残缺片段，就只输出对应的翻译，不得延展成正文。
4. 不得根据文献摘要、上下文或常识补写原文省略的内容。
5. 输出必须与当前 block 一一对应；原文有几行核心结构，译文就保持等价结构。
6. 形如 [[INLINE_MATH_n]] 和 [[DISPLAY_MATH_n]] 的占位符代表公式，禁止修改、翻译、拆分、重排、删除或新增这些占位符，必须逐字原样保留在原位置。
7. 只输出译文本身，不要添加任何解释、说明、前缀或后缀。

需要保留 Markdown 语义、代码、引用编号和专有名词一致性。

[Block]
${text}` },
  ], { maxTokens: Math.min(4096, Math.max(800, Math.ceil(text.length * 2.2))), signal: options.signal });
}
