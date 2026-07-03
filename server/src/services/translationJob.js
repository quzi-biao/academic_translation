import prisma from '../config/db.js';
import { uploadBuffer } from './oss.js';
import { fileToMarkdown } from './parser/readers.js';
import { parseMdToBlocks, flattenBlocks, extractBlockText } from './parser/mdToBlocks.js';
import { summarizeAcademicDocument, buildTranslationPrompt, translateBlockText } from './llm.js';
import { deductPoints, estimateTranslationCost } from './customerPoints.js';

const runningJobs = new Set();

function getTranslatableBlocks(flatBlocks) {
  return flatBlocks.filter((b) => !['document', 'table_row', 'table_cell', 'divider', 'frontmatter'].includes(b.type));
}

async function ensureParsedDocument(doc) {
  if (doc.sourceMd) {
    const existingBlocks = await prisma.translationBlock.findMany({
      where: { documentId: doc.id },
      orderBy: { sequence: 'asc' },
    });
    if (existingBlocks.length) return { md: doc.sourceMd, flatBlocks: existingBlocks };
  }

  await prisma.translationDocument.update({
    where: { id: doc.id },
    data: { status: 'parsing', progress: 5, startedAt: doc.startedAt || new Date(), errorMsg: null },
  });

  const fileRes = await fetch(doc.sourceUrl);
  if (!fileRes.ok) throw new Error(`源文件下载失败: ${fileRes.status}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const md = await fileToMarkdown(buffer, doc.originalName, doc.customerId);
  await prisma.translationDocument.update({
    where: { id: doc.id },
    data: { sourceMd: md, progress: 12 },
  });

  const blockTree = parseMdToBlocks(md);
  const flatBlocks = flattenBlocks(blockTree);
  await prisma.translationBlock.deleteMany({ where: { documentId: doc.id } });
  await prisma.translationBlock.createMany({
    data: flatBlocks.map((b) => ({
      id: b.id,
      documentId: doc.id,
      rootId: b.root_id,
      parentId: b.parent_id,
      type: b.type,
      sequence: b.sequence,
      sourceContent: b.content || {},
      sourceText: extractBlockText(b),
      status: b.type === 'document' ? 'skipped' : 'pending',
    })),
  });

  const translatableBlocks = getTranslatableBlocks(flatBlocks);
  const combinedText = translatableBlocks
    .map((b) => String(b.sourceText || extractBlockText(b) || '').trim())
    .filter(Boolean)
    .join('\n\n');
  const pointCost = await estimateTranslationCost(combinedText);
  await prisma.translationDocument.update({
    where: { id: doc.id },
    data: {
      totalBlocks: translatableBlocks.length,
      pointCost,
      status: 'summarizing',
      progress: 20,
    },
  });

  return {
    md,
    flatBlocks: await prisma.translationBlock.findMany({ where: { documentId: doc.id }, orderBy: { sequence: 'asc' } }),
  };
}

async function ensureBilling(doc, flatBlocks) {
  if ((doc.pointCost || 0) <= 0) {
    // flatBlocks may come from Prisma (stored blocks) or parser nodes; use persisted sourceText when available.
    const combinedText = getTranslatableBlocks(flatBlocks)
      .map((b) => String(b.sourceText || extractBlockText(b) || '').trim())
      .filter(Boolean)
      .join('\n\n');
    const pointCost = await estimateTranslationCost(combinedText);
    doc.pointCost = pointCost;
    await prisma.translationDocument.update({ where: { id: doc.id }, data: { pointCost } });
  }
  if (doc.status === 'queued' || doc.status === 'parsing' || doc.status === 'summarizing') {
    const deduction = await deductPoints(doc.customerId, doc.pointCost, 'consume_translation', `翻译文档 ${doc.originalName}`, doc.id);
    if (!deduction.ok) {
      await prisma.translationDocument.update({
        where: { id: doc.id },
        data: { status: 'failed', errorMsg: `点数不足，需要 ${doc.pointCost} 点，当前余额 ${deduction.balance}`, progress: 0 },
      });
      return { ok: false };
    }
  }
  return { ok: true };
}

async function ensureSummaryAndPrompt(doc, md) {
  let nextDoc = doc;
  if (!doc.summary) {
    await prisma.translationDocument.update({
      where: { id: doc.id },
      data: { status: 'summarizing', progress: Math.max(doc.progress || 20, 20), errorMsg: null },
    });
    const summary = await summarizeAcademicDocument(md);
    await prisma.translationDocument.update({
      where: { id: doc.id },
      data: { summary, progress: 26 },
    });
    nextDoc = { ...nextDoc, summary };
  }
  if (!nextDoc.translationPrompt) {
    const translationPrompt = await buildTranslationPrompt(nextDoc.summary);
    await prisma.translationDocument.update({
      where: { id: doc.id },
      data: { translationPrompt, status: 'translating', progress: 30 },
    });
    nextDoc = { ...nextDoc, translationPrompt };
  }
  return nextDoc;
}

export async function createTranslationDocument({ customerId, file }) {
  const ext = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
  const sourceUrl = await uploadBuffer(file.buffer, 'documents', ext, customerId);
  const doc = await prisma.translationDocument.create({
    data: {
      customerId,
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      fileType: file.mimetype || ext,
      fileSize: file.size,
      sourceUrl,
      status: 'queued',
      progress: 1,
    },
  });
  queueTranslation(doc.id);
  return doc;
}

export function queueTranslation(documentId) {
  if (runningJobs.has(documentId)) return;
  runningJobs.add(documentId);
  setImmediate(async () => {
    try {
      await runTranslation(documentId);
    } catch (err) {
      console.error('[translationJob]', documentId, err);
      await prisma.translationDocument.update({ where: { id: documentId }, data: { status: 'failed', errorMsg: err.message || String(err) } }).catch(() => {});
    } finally {
      runningJobs.delete(documentId);
    }
  });
}

export async function resumeStaleTranslationJobs() {
  const docs = await prisma.translationDocument.findMany({
    where: { status: { in: ['queued', 'parsing', 'summarizing', 'translating'] } },
    select: { id: true },
  });
  for (const doc of docs) queueTranslation(doc.id);
}

export async function retryTranslation(documentId, customerId) {
  const doc = await prisma.translationDocument.findFirst({
    where: { id: documentId, customerId },
  });
  if (!doc) return { ok: false, code: 404, error: '文档不存在' };
  if (runningJobs.has(documentId)) return { ok: false, code: 400, error: '任务正在处理中，暂不能重试' };

  const blockStats = await prisma.translationBlock.groupBy({
    by: ['status'],
    where: { documentId },
    _count: { _all: true },
  });
  const translatedCount = blockStats.find((item) => item.status === 'translated')?._count._all || 0;
  const skippedCount = blockStats.find((item) => item.status === 'skipped')?._count._all || 0;
  const failedCount = blockStats.find((item) => item.status === 'failed')?._count._all || 0;
  const pendingCount = blockStats.find((item) => item.status === 'pending')?._count._all || 0;
  const hasRetryableState = ['failed', 'queued', 'parsing', 'summarizing', 'translating'].includes(doc.status);
  const completedButBroken = doc.status === 'completed' && (failedCount > 0 || pendingCount > 0 || translatedCount < Math.max(0, doc.totalBlocks || 0));

  if (!hasRetryableState && !completedButBroken) {
    return { ok: false, code: 400, error: '当前状态不支持重试' };
  }

  await prisma.translationBlock.updateMany({
    where: { documentId, type: { not: 'document' } },
    data: {
      status: 'pending',
      translatedText: null,
      errorMsg: null,
    },
  });

  await prisma.translationDocument.update({
    where: { id: documentId },
    data: {
      status: 'queued',
      progress: 1,
      translatedBlocks: 0,
      errorMsg: null,
      startedAt: null,
      completedAt: null,
    },
  });
  queueTranslation(documentId);
  return { ok: true };
}

export async function deleteTranslation(documentId, customerId) {
  const doc = await prisma.translationDocument.findFirst({
    where: { id: documentId, customerId },
    select: { id: true },
  });
  if (!doc) return { ok: false, code: 404, error: '文档不存在' };
  if (runningJobs.has(documentId)) return { ok: false, code: 400, error: '任务正在处理中，暂不能删除' };
  await prisma.translationDocument.delete({ where: { id: documentId } });
  return { ok: true };
}

async function runTranslation(documentId) {
  let doc = await prisma.translationDocument.findUnique({ where: { id: documentId } });
  if (!doc) return;
  const { md, flatBlocks } = await ensureParsedDocument(doc);
  doc = await prisma.translationDocument.findUnique({ where: { id: documentId } });
  if (!doc) return;
  const billing = await ensureBilling(doc, flatBlocks);
  if (!billing.ok) return;
  doc = await ensureSummaryAndPrompt(doc, md);

  const translatableBlocks = getTranslatableBlocks(flatBlocks);
  let done = 0;
  let translatedCount = 0;
  let skippedCount = 0;
  for (const block of translatableBlocks) {
    const existing = await prisma.translationBlock.findUnique({ where: { id: block.id } });
    if (existing?.status === 'translated' && existing.translatedText) {
      done += 1;
      translatedCount += 1;
    } else {
      // When ensureParsedDocument returns Prisma blocks, `block.content` isn't present (it's `sourceContent`).
      // Prefer persisted `sourceText` from DB to avoid accidentally skipping translatable content.
      const text = String(existing?.sourceText || block.sourceText || extractBlockText(block) || '');
      if (!text.trim()) {
        await prisma.translationBlock.update({ where: { id: block.id }, data: { status: 'skipped', translatedText: '', errorMsg: null } });
        skippedCount += 1;
      } else {
        try {
          const translatedText = await translateBlockText(text, doc.translationPrompt, doc.summary);
          await prisma.translationBlock.update({ where: { id: block.id }, data: { status: 'translated', translatedText, errorMsg: null } });
          translatedCount += 1;
        } catch (err) {
          await prisma.translationBlock.update({ where: { id: block.id }, data: { status: 'failed', errorMsg: err.message || String(err) } });
          throw err;
        }
      }
      done += 1;
    }
    const progress = 30 + Math.floor((done / Math.max(1, translatableBlocks.length)) * 68);
    await prisma.translationDocument.update({ where: { id: documentId }, data: { translatedBlocks: translatedCount, progress } });
  }

  if (translatedCount === 0 && skippedCount > 0) {
    await prisma.translationDocument.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        progress: 0,
        translatedBlocks: 0,
        errorMsg: '文档解析后未提取到可翻译的文本块，请检查解析结果或原始文档格式。',
        completedAt: null,
      },
    });
    return;
  }

  await prisma.translationDocument.update({ where: { id: documentId }, data: { status: 'completed', progress: 100, translatedBlocks: translatedCount, completedAt: new Date() } });
}
