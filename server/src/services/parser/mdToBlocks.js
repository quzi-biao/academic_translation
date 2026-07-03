import { v4 as uuidv4 } from 'uuid';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkFrontmatter from 'remark-frontmatter';

function toRichText(nodes = [], annotations = {}) {
  return nodes.flatMap((n) => {
    if (n.type === 'text') return [{ type: 'text', text: n.value, annotations }];
    if (n.type === 'inlineMath') return [{ type: 'inline_equation', expression: n.value }];
    if (n.type === 'inlineCode') return [{ type: 'inline_code', code: n.value }];
    if (n.type === 'strong') return toRichText(n.children, { ...annotations, bold: true });
    if (n.type === 'emphasis') return toRichText(n.children, { ...annotations, italic: true });
    if (n.type === 'delete') return toRichText(n.children, { ...annotations, strikethrough: true });
    if (n.type === 'link') return [{ type: 'link', text: (n.children || []).map((c) => c.value || '').join(''), href: n.url }];
    if (n.type === 'image') return [{ type: 'text', text: `[图片: ${n.alt || ''}]`, annotations }];
    if (n.children) return toRichText(n.children, annotations);
    return [];
  });
}

function leaf(type, content, ctx) {
  return { id: uuidv4(), parent_id: ctx.parentId, root_id: ctx.rootId, type, sequence: ctx.sequence.value++, content, children: [] };
}

function container(type, content, ctx) {
  return leaf(type, content, ctx);
}

function handleNode(node, ctx) {
  switch (node.type) {
    case 'heading': return [leaf(`heading_${Math.min(node.depth, 6)}`, { rich_text: toRichText(node.children), level: Math.min(node.depth, 6) }, ctx)];
    case 'paragraph': {
      const children = node.children || [];
      if (children.length && children.every((c) => c.type === 'image')) return children.map((c) => leaf('image', { url: c.url, alt: c.alt || '', caption: c.title || '' }, ctx));
      return [leaf('paragraph', { rich_text: toRichText(children) }, ctx)];
    }
    case 'image': return [leaf('image', { url: node.url, alt: node.alt || '', caption: node.title || '' }, ctx)];
    case 'math': return [leaf('equation', { expression: node.value }, ctx)];
    case 'code': return [leaf('code', { language: node.lang || 'text', code: node.value }, ctx)];
    case 'blockquote': {
      const block = container('quote', {}, ctx);
      block.children = processChildren(node.children || [], { ...ctx, parentId: block.id });
      return [block];
    }
    case 'thematicBreak': return [leaf('divider', {}, ctx)];
    case 'yaml': return [leaf('frontmatter', { raw: node.value }, ctx)];
    case 'table': {
      const table = container('table', { has_column_header: true, column_count: node.children?.[0]?.children?.length || 0 }, ctx);
      table.children = (node.children || []).map((row, rowIdx) => {
        const rowBlock = container('table_row', { is_header: rowIdx === 0 }, { rootId: ctx.rootId, parentId: table.id, sequence: { value: rowIdx } });
        rowBlock.children = (row.children || []).map((cell, cellIdx) => leaf('table_cell', { rich_text: toRichText(cell.children || []) }, { rootId: ctx.rootId, parentId: rowBlock.id, sequence: { value: cellIdx } }));
        return rowBlock;
      });
      return [table];
    }
    case 'list': return (node.children || []).map((item, idx) => {
      const firstPara = item.children?.find((c) => c.type === 'paragraph');
      return container(node.ordered ? 'numbered_list_item' : 'bulleted_list_item', { rich_text: toRichText(firstPara?.children || []), ordered: !!node.ordered }, { rootId: ctx.rootId, parentId: ctx.parentId, sequence: { value: ctx.sequence.value + idx } });
    });
    case 'html': {
      const html = node.value || '';
      const blocks = [];
      const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*\/?>/gi;
      let match;
      while ((match = imgRe.exec(html))) blocks.push(leaf('image', { url: match[1], alt: '', caption: '' }, ctx));
      return blocks;
    }
    default: return [];
  }
}

function processChildren(nodes, ctx) {
  return nodes.flatMap((node) => handleNode(node, ctx));
}

function groupBlocksByHeadings(blocks, parentId) {
  const result = [];
  const stack = [];
  const depthOf = (b) => Number(b.type.match(/^heading_(\d+)$/)?.[1] || Infinity);
  const append = (node, parent) => {
    node.parent_id = parent ? parent.id : parentId;
    if (parent) parent.children.push(node); else result.push(node);
  };
  for (const block of blocks) {
    const depth = depthOf(block);
    if (depth === Infinity) append(block, stack.at(-1)?.block || null);
    else {
      while (stack.length && stack.at(-1).depth >= depth) stack.pop();
      const parent = stack.at(-1)?.block || null;
      append(block, parent);
      stack.push({ depth, block });
    }
  }
  return result;
}

export function parseMdToBlocks(mdContent) {
  const ast = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm).use(remarkMath).parse(mdContent);
  const rootId = uuidv4();
  const documentBlock = { id: rootId, parent_id: null, root_id: rootId, type: 'document', sequence: 0, content: {}, children: [] };
  const flatBlocks = processChildren(ast.children || [], { rootId, parentId: rootId, sequence: { value: 0 } });
  documentBlock.children = groupBlocksByHeadings(flatBlocks, rootId);
  return [documentBlock];
}

export function flattenBlocks(blocks) {
  const result = [];
  const walk = (block) => {
    const { children, ...rest } = block;
    result.push(rest);
    children.forEach(walk);
  };
  blocks.forEach(walk);
  return result;
}

export function extractBlockText(block) {
  const c = block.content || {};
  if (Array.isArray(c.rich_text)) return c.rich_text.map((r) => r.text || r.expression || r.code || '').join('');
  if (c.code) return c.code;
  if (c.expression) return c.expression;
  if (c.alt || c.caption) return [c.alt, c.caption].filter(Boolean).join('\n');
  return '';
}

export function extractBlockMarkdown(block) {
  const c = block.content || {};
  if (Array.isArray(c.rich_text)) {
    return c.rich_text.map((r) => {
      if (!r) return '';
      if (r.type === 'inline_equation') return `$${r.expression || ''}$`;
      if (r.type === 'inline_code') return `\`${r.code || ''}\``;
      if (r.type === 'link') return `[${r.text || r.href || ''}](${r.href || '#'})`;
      return r.text || '';
    }).join('');
  }
  if (c.code) return c.code;
  if (c.expression) return `$$\n${c.expression}\n$$`;
  if (c.alt || c.caption) return [c.alt, c.caption].filter(Boolean).join('\n');
  return '';
}
