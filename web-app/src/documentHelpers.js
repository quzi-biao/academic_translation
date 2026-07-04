import { normalizeMathExpression } from './math';

export function escapeMarkdownMathText(text = '') {
  return String(text).replace(/([\\`*_[\]<>])/g, '\\$1');
}

export function equationToMarkdown(expression = '') {
  const value = normalizeMathExpression(expression);
  if (!value) return '';
  if (/^\$\$[\s\S]*\$\$$/.test(value) || /^\$[^$][\s\S]*\$$/.test(value)) return value;
  return `$$\n${value}\n$$`;
}

export function richTextToMarkdown(richText = []) {
  return richText.map((item) => {
    if (!item) return '';
    if (item.type === 'text') return escapeMarkdownMathText(item.text || '');
    if (item.type === 'inline_equation') return `$${normalizeMathExpression(item.expression)}$`;
    if (item.type === 'inline_code') return `\`${String(item.code || '')}\``;
    if (item.type === 'link') return `[${escapeMarkdownMathText(item.text || item.href || '')}](${item.href || '#'})`;
    return '';
  }).join('');
}

export function stripFileExtension(name = '') {
  return String(name || '').replace(/\.[^.]+$/, '');
}

export function cloneBlockSnapshot(block) {
  if (!block) return null;
  return JSON.parse(JSON.stringify(block));
}

export function blockFallback(block) {
  if (block?.type === 'image' && block?.sourceContent?.url) return `![${block.sourceContent.alt || ''}](${block.sourceContent.url})`;
  if (block?.sourceContent?.url) return `[资源](${block.sourceContent.url})`;
  return '';
}

export function getEditableSourceText(block) {
  if (!block) return '';
  if (block.type === 'equation') return block.sourceContent?.expression || block.sourceText || '';
  if (block.type === 'image') return block.sourceContent?.caption || block.sourceText || '';
  return block.sourceText || blockFallback(block);
}

export function getEditableTranslatedText(block) {
  if (!block) return '';
  if (block.type === 'image') return block.translatedText || '';
  if (block.type === 'equation') return block.translatedText || block.sourceContent?.expression || block.sourceText || '';
  return block.translatedText || '';
}

export function replaceBlockInDocument(document, updatedBlock) {
  if (!document) return document;
  return {
    ...document,
    blocks: (document.blocks || []).map((block) => (block.id === updatedBlock.id ? updatedBlock : block)),
  };
}

export function removeBlockFromDocument(document, blockId) {
  if (!document) return document;
  return {
    ...document,
    blocks: (document.blocks || []).filter((block) => block.id !== blockId),
  };
}

export function restoreBlockIntoDocument(document, block) {
  if (!document) return document;
  const blocks = [...(document.blocks || []).filter((item) => item.id !== block.id), block]
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  return {
    ...document,
    blocks,
  };
}

export function isActiveTranslationStatus(status) {
  return ['queued', 'parsing', 'summarizing', 'translating'].includes(status);
}

export function statusNeedsDots(status) {
  return ['queued', 'parsing', 'summarizing', 'translating'].includes(status);
}

export function documentStatusHint(doc) {
  if (doc.summary || doc.errorMsg) return doc.summary || doc.errorMsg;
  if (doc.status === 'uploaded') return '文献已上传，等待开始翻译。';
  if (doc.status === 'stopped') return '翻译任务已停止，可稍后继续。';
  if (doc.status === 'parsing' && (doc.progress || 0) <= 5) return 'PDF 正在解析中，系统正在调用文档解析引擎处理原文，此步骤消耗时间较长（3-15分钟），请稍候。';
  if (doc.status === 'parsing') return '文档结构正在提取中，翻译任务仍在继续。';
  if (doc.status === 'summarizing') return '系统正在总结文献并生成翻译提示词。';
  if (doc.status === 'translating') return '系统正在逐段翻译文献内容。';
  if (doc.status === 'queued') return '任务已进入队列，等待开始处理。';
  return '等待系统解析、总结并翻译。';
}

export function formatCharCount(value) {
  const count = Number(value || 0);
  if (!count) return '待解析';
  return `${count.toLocaleString('zh-CN')} 字`;
}

export function statusText(status) {
  return ({ uploaded: '待翻译', queued: '排队中', parsing: '解析中', summarizing: '总结中', translating: '翻译中', stopped: '已停止', completed: '已完成', failed: '失败' }[status] || status);
}

export function inferNumberedHeadingLevel(text = '') {
  const value = String(text || '').trim();
  const match = value.match(/^(\d+(?:\.\d+)*)(?:\.|\s)/);
  if (!match) return 0;
  return Math.min(6, match[1].split('.').filter(Boolean).length);
}

export function getDisplayHeadingLevel(block) {
  const explicit = Number(block?.headingLevel || block?.level || block?.sourceContent?.level || String(block?.type || '').match(/^heading_(\d+)$/)?.[1] || 0);
  const numbered = inferNumberedHeadingLevel(block?.sourceText || block?.translatedText || '');
  if (numbered > 0 && explicit <= 1) return numbered;
  return explicit;
}

export function resolveBlockTone(block) {
  const headingLevel = getDisplayHeadingLevel(block);
  const semanticType = String(block.type || '').toLowerCase();
  const text = String(block.sourceText || '').trim();

  if (text.length > 300) return 'tone-body';
  if (headingLevel > 0) {
    if (headingLevel === 1) return 'tone-heading-1';
    if (headingLevel === 2) return 'tone-heading-2';
    return 'tone-heading-3';
  }
  if (semanticType.includes('title') || semanticType.includes('heading')) {
    if (text.length <= 40) return 'tone-heading-1';
    if (text.length <= 80) return 'tone-heading-2';
    return 'tone-heading-3';
  }
  if (semanticType.includes('quote')) return 'tone-quote';
  if (semanticType.includes('caption') || semanticType.includes('footnote')) return 'tone-meta';
  if (text.length <= 30) return 'tone-heading-3';
  return 'tone-body';
}

export function mergeShortBlocks(blocks) {
  const result = [];
  let buffer = null;
  const isHeadingLike = (block) => {
    const headingLevel = Number(block?.headingLevel || block?.level || block?.sourceContent?.level || 0);
    const type = String(block?.type || '').toLowerCase();
    return headingLevel > 0 || type.includes('heading') || type.includes('title');
  };

  const flush = () => {
    if (!buffer) return;
    result.push(buffer);
    buffer = null;
  };

  for (const block of blocks) {
    const sourceText = (block.sourceText || blockFallback(block) || '').trim();
    const translatedText = (block.translatedText || (block.status === 'failed' ? block.errorMsg : '') || '').trim();
    const displayText = sourceText || translatedText;
    const shortEnough = [...displayText].length > 0 && [...displayText].length < 50;

    if (isHeadingLike(block) || block.type === 'image' || block.type === 'table' || block.type === 'equation' || block.type === 'code') {
      flush();
      result.push(block);
      continue;
    }

    if (!shortEnough) {
      flush();
      result.push({ ...block, sourceText, translatedText });
      continue;
    }

    if (!buffer) {
      buffer = { ...block };
      continue;
    }

    buffer = {
      ...buffer,
      id: `${buffer.id}__${block.id}`,
      sourceText: [buffer.sourceText || '', sourceText].filter(Boolean).join('\n'),
      translatedText: [buffer.translatedText || '', translatedText].filter(Boolean).join('\n'),
    };
  }

  flush();
  return result;
}
