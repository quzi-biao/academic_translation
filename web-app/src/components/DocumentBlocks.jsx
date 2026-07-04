import React from 'react';
import MarkdownContent from './MarkdownContent';
import {
  blockFallback,
  equationToMarkdown,
  getDisplayHeadingLevel,
  mergeShortBlocks,
  resolveBlockTone,
  richTextToMarkdown,
} from '../documentHelpers';

export { mergeShortBlocks };

export function BlockRenderer({ block, translated = false }) {
  if (block.type === 'image' && block.sourceContent?.url) {
    const caption = translated
      ? (block.translatedText || block.sourceContent.caption || block.sourceContent.alt || '图片')
      : (block.sourceContent.caption || block.sourceContent.alt || block.translatedText || '图片');
    return <figure className="block-media">
      <img src={block.sourceContent.url} alt={block.sourceContent.alt || ''} />
      <figcaption><MarkdownContent content={caption} /></figcaption>
    </figure>;
  }
  if (block.type === 'table') {
    return <div className="table-placeholder">表格结构已记录，请查看下方 `table_row / table_cell` 内容。</div>;
  }
  let text = translated ? (block.translatedText || (block.status === 'failed' ? block.errorMsg : '等待翻译...')) : (block.sourceText || blockFallback(block));
  const headingLevel = getDisplayHeadingLevel(block);

  if (block.type === 'equation') {
    const expression = translated
      ? (block.translatedText || block.sourceContent?.expression || block.sourceText || '')
      : (block.sourceContent?.expression || block.sourceText || '');
    text = equationToMarkdown(expression);
  } else if (headingLevel > 0) {
    text = `${'#'.repeat(Math.min(headingLevel, 6))} ${text}`;
  } else if (!translated && Array.isArray(block.sourceContent?.rich_text)) {
    text = richTextToMarkdown(block.sourceContent.rich_text) || text;
  }

  const blockClassName = `block-content ${resolveBlockTone(block)}`;
  return <div className={blockClassName}><MarkdownContent content={text} /></div>;
}
