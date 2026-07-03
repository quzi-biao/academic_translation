import puppeteer from 'puppeteer-core';
import { marked } from 'marked';

const CHROME_BIN = process.env.CHROME_BIN || '/snap/bin/chromium';

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(input = '') {
  return escapeHtml(input).replace(/`/g, '&#96;');
}

function pickText(block) {
  return String(block?.translatedText || block?.sourceText || '').trim();
}

function resolveHeadingLevel(block) {
  const explicit = Number(block?.sourceContent?.level || block?.headingLevel || block?.level || 0);
  if (explicit > 0) return Math.min(6, explicit);
  const match = String(block?.type || '').match(/^heading_(\d+)$/);
  if (match) return Math.min(6, Number(match[1]));
  return 0;
}

function normalizeMarkdown(text, fallbackHeadingLevel = 0) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (/^(#{1,6})\s+/m.test(value)) return value;
  if (fallbackHeadingLevel > 0) return `${'#'.repeat(fallbackHeadingLevel)} ${value}`;
  return value;
}

function paragraphLikeMarkdown(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (/^(#{1,6})\s+/m.test(value)) return value;
  return value
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .join('\n\n');
}

function protectMath(md) {
  return String(md || '')
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr) => `<div class="math math-display" data-expr="${escapeAttr(expr.trim())}"></div>`)
    .replace(/\$([^$\n]+?)\$/g, (_m, expr) => `<span class="math math-inline" data-expr="${escapeAttr(expr.trim())}"></span>`);
}

function markdownToHtml(md) {
  const safe = protectMath(md);
  return marked.parse(safe, { gfm: true, breaks: false });
}

function renderTextBlock(block) {
  const headingLevel = resolveHeadingLevel(block);
  const text = pickText(block);
  if (!text) return '';
  const semanticType = String(block?.type || '').toLowerCase();

  if (semanticType.includes('heading') || headingLevel > 0) {
    const html = markdownToHtml(normalizeMarkdown(text, headingLevel || 1));
    return `<section class="block block-heading level-${headingLevel || 1}">${html}</section>`;
  }

  if (semanticType.includes('equation')) {
    return `<section class="block block-equation"><div class="math math-display" data-expr="${escapeAttr(text)}"></div></section>`;
  }

  if (semanticType.includes('code')) {
    return `<section class="block block-code"><pre><code>${escapeHtml(text)}</code></pre></section>`;
  }

  if (semanticType.includes('quote')) {
    const html = markdownToHtml(text.split(/\n+/).map((line) => `> ${line}`).join('\n'));
    return `<section class="block block-quote">${html}</section>`;
  }

  const html = markdownToHtml(paragraphLikeMarkdown(text));
  return `<section class="block block-body">${html}</section>`;
}

function getImageUrl(block) {
  return block?.sourceContent?.url || block?.sourceContent?.src || '';
}

function getImageCaption(block) {
  return pickText(block) || block?.sourceContent?.caption || block?.sourceContent?.alt || '';
}

function renderImageBlock(block) {
  const url = getImageUrl(block);
  if (!url) return '';
  const caption = getImageCaption(block);
  return `<figure class="block block-image"><img src="${escapeAttr(url)}" alt="${escapeAttr(caption)}" />${caption ? `<figcaption>${markdownToHtml(caption)}</figcaption>` : ''}</figure>`;
}

function renderTableBlock(blocks, startIndex) {
  const tableBlock = blocks[startIndex];
  const rows = [];
  let cursor = startIndex + 1;

  while (cursor < blocks.length) {
    const rowBlock = blocks[cursor];
    if (rowBlock.parentId !== tableBlock.id || rowBlock.type !== 'table_row') break;

    const isHeader = Boolean(rowBlock?.sourceContent?.is_header);
    const cells = [];
    cursor += 1;

    while (cursor < blocks.length) {
      const cellBlock = blocks[cursor];
      if (cellBlock.parentId !== rowBlock.id || cellBlock.type !== 'table_cell') break;
      const cellText = pickText(cellBlock);
      const tag = isHeader ? 'th' : 'td';
      cells.push(`<${tag}>${markdownToHtml(paragraphLikeMarkdown(cellText || ' '))}</${tag}>`);
      cursor += 1;
    }

    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  return {
    html: `<section class="block block-table"><table>${rows.join('')}</table></section>`,
    nextIndex: cursor,
  };
}

function buildContent(blocks) {
  const content = [];
  for (let i = 0; i < blocks.length;) {
    const block = blocks[i];
    if (!block) {
      i += 1;
      continue;
    }
    if (['document', 'table_row', 'table_cell', 'divider', 'frontmatter'].includes(block.type)) {
      i += 1;
      continue;
    }
    if (block.type === 'image') {
      content.push(renderImageBlock(block));
      i += 1;
      continue;
    }
    if (block.type === 'table') {
      const rendered = renderTableBlock(blocks, i);
      content.push(rendered.html);
      i = rendered.nextIndex;
      continue;
    }
    content.push(renderTextBlock(block));
    i += 1;
  }
  return content.join('');
}

function buildHtml(document, blocks) {
  const body = buildContent(blocks);
  return `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --ink: #111111;
        --muted: #5f5f5f;
        --rule: #d3d3d3;
        --paper: #ffffff;
      }
      @page {
        size: A4;
        margin: 16mm 14mm 18mm;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif;
      }
      body {
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      .page { padding: 0; }
      .doc-header {
        margin-bottom: 16mm;
        padding-bottom: 8mm;
        border-bottom: 1px solid var(--rule);
      }
      .doc-title {
        margin: 0 0 4mm;
        font-size: 22px;
        line-height: 1.35;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .doc-meta {
        font-size: 10.5px;
        color: var(--muted);
      }
      .block {
        break-inside: avoid;
        page-break-inside: avoid;
        margin: 0 0 10px;
      }
      .block p {
        margin: 0 0 6px;
        font-size: 12.5px;
        line-height: 1.78;
      }
      .block ul, .block ol {
        margin: 4px 0 8px 20px;
        padding: 0;
      }
      .block li {
        margin: 0 0 4px;
        font-size: 12.5px;
        line-height: 1.72;
      }
      .block strong { font-weight: 700; }
      .block em { font-style: italic; }
      .block-heading h1,
      .block-heading h2,
      .block-heading h3,
      .block-heading h4,
      .block-heading h5,
      .block-heading h6 {
        margin: 0 0 6px;
        font-weight: 700;
        line-height: 1.4;
      }
      .block-heading.level-1 h1,
      .block-heading.level-1 h2,
      .block-heading.level-1 h3 { font-size: 17px; }
      .block-heading.level-2 h1,
      .block-heading.level-2 h2,
      .block-heading.level-2 h3 { font-size: 15px; }
      .block-heading.level-3 h1,
      .block-heading.level-3 h2,
      .block-heading.level-3 h3,
      .block-heading.level-4 h4,
      .block-heading.level-5 h5,
      .block-heading.level-6 h6 { font-size: 13px; }
      .block-quote {
        padding-left: 10px;
        border-left: 2px solid var(--rule);
        color: #333;
      }
      .block-code pre {
        margin: 0;
        padding: 10px 12px;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 11px;
        line-height: 1.6;
        font-family: "SFMono-Regular", "JetBrains Mono", "Menlo", monospace;
        background: #f4f4f4;
        border: 1px solid #e2e2e2;
      }
      .block-equation {
        text-align: center;
        margin: 10px 0 14px;
      }
      .math-inline, .math-display {
        font-family: "Times New Roman", "Cambria Math", serif;
        letter-spacing: 0;
      }
      .math-inline::before, .math-display::before {
        content: attr(data-expr);
        white-space: pre-wrap;
      }
      .math-display {
        display: block;
        text-align: center;
        font-size: 13px;
        line-height: 1.8;
      }
      .block-image {
        margin: 14px 0 16px;
        text-align: center;
      }
      .block-image img {
        display: block;
        max-width: 100%;
        max-height: 640px;
        margin: 0 auto 6px;
        object-fit: contain;
      }
      .block-image figcaption {
        color: var(--muted);
        font-size: 10.5px;
        line-height: 1.6;
      }
      .block-image figcaption p { font-size: 10.5px; }
      .block-table { margin: 12px 0 16px; }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th, td {
        border: 1px solid #bdbdbd;
        padding: 7px 8px;
        vertical-align: top;
        text-align: left;
      }
      th {
        background: #f3f3f3;
        font-weight: 700;
      }
      td p, th p {
        margin: 0 0 4px;
        font-size: 11px;
        line-height: 1.65;
      }
      .block-table table,
      .block-table tr,
      .block-table td,
      .block-table th {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="doc-header">
        <h1 class="doc-title">${escapeHtml(document.originalName || 'Translated Document')}</h1>
        <div class="doc-meta">闻一翻译导出</div>
      </header>
      ${body}
    </main>
  </body>
  </html>`;
}

export async function renderTranslatedPdf(document, blocks) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=medium',
      '--allow-file-access-from-files',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 2200, deviceScaleFactor: 2 });
    await page.setContent(buildHtml(document, blocks), { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
