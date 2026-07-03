import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import prisma from '../config/db.js';
import { requireCustomer } from '../middleware/customerAuth.js';
import { createTranslationDocument, deleteTranslation, retryTranslation, startTranslation, stopTranslation } from '../services/translationJob.js';
import { renderTranslatedPdf } from '../services/exportPdf.js';
import { supportedExtensions } from '../services/parser/readers.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });

router.use(requireCustomer);

function countDocumentCharacters(sourceMd = '') {
  const normalized = String(sourceMd || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, ' ')
    .replace(/[#>*_\-\[\]\(\)]/g, ' ')
    .replace(/\s+/g, '');
  return normalized.length;
}

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = originalName.split('.').pop()?.toLowerCase() || '';
    if (!supportedExtensions.has(ext)) return res.status(400).json({ error: '仅支持 PDF、DOCX、DOC、MD、TXT' });
    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const existing = await prisma.translationDocument.findFirst({
      where: { customerId: req.customerId, fileChecksum: checksum },
      orderBy: { createdAt: 'desc' },
      select: { id: true, originalName: true, status: true, createdAt: true },
    });
    const forceUpload = ['1', 'true', 'yes'].includes(String(req.body.force || '').toLowerCase());
    if (existing && !forceUpload) {
      return res.status(409).json({
        error: '文献已存在，是否再次上传？',
        duplicateDocument: existing,
      });
    }
    const autoStart = !['0', 'false', 'no'].includes(String(req.body.autoStart || '').toLowerCase());
    const doc = await createTranslationDocument({ customerId: req.customerId, file: req.file, autoStart });
    res.status(202).json({ document: doc });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(50, parseInt(req.query.limit || '20'));
    const where = { customerId: req.customerId };
    const [total, documents, blockGroups] = await Promise.all([
      prisma.translationDocument.count({ where }),
      prisma.translationDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, originalName: true, status: true, progress: true, summary: true, totalBlocks: true, translatedBlocks: true, pointCost: true, errorMsg: true, createdAt: true, completedAt: true, sourceMd: true },
      }),
      prisma.translationBlock.groupBy({
        by: ['documentId', 'status'],
        where: {
          documentId: {
            in: await prisma.translationDocument.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              skip: (page - 1) * limit,
              take: limit,
              select: { id: true },
            }).then((rows) => rows.map((row) => row.id)),
          },
        },
        _count: { _all: true },
      }),
    ]);
    const statsByDocument = new Map();
    for (const item of blockGroups) {
      const stats = statsByDocument.get(item.documentId) || { translated: 0, skipped: 0, failed: 0, pending: 0 };
      stats[item.status] = item._count._all;
      statsByDocument.set(item.documentId, stats);
    }
    const normalizedDocuments = documents.map((doc) => {
      const stats = statsByDocument.get(doc.id) || { translated: 0, skipped: 0, failed: 0, pending: 0 };
      const effectiveTotalBlocks = Math.max(0, (doc.totalBlocks || 0) - (stats.skipped || 0));
      const translatedBlocks = Math.min(doc.translatedBlocks || 0, effectiveTotalBlocks || doc.translatedBlocks || 0);
      let status = doc.status;
      let progress = doc.progress;

      if (status === 'completed' && effectiveTotalBlocks > 0 && translatedBlocks < effectiveTotalBlocks) {
        status = stats.failed > 0 ? 'failed' : 'translating';
        progress = Math.min(progress || 0, 99);
      }

      return {
        ...doc,
        status,
        progress,
        charCount: countDocumentCharacters(doc.sourceMd),
        translatedBlocks,
        skippedBlocks: stats.skipped || 0,
        effectiveTotalBlocks,
        sourceMd: undefined,
      };
    });
    res.json({ total, page, limit, documents: normalizedDocuments });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const document = await prisma.translationDocument.findFirst({
      where: { id: req.params.id, customerId: req.customerId },
      include: { blocks: { orderBy: { sequence: 'asc' } } },
    });
    if (!document) return res.status(404).json({ error: '文档不存在' });
    res.json({ document });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const originalName = String(req.body?.originalName || '').trim();
    if (!originalName) return res.status(400).json({ error: '请输入文献名称' });
    const document = await prisma.translationDocument.findFirst({
      where: { id: req.params.id, customerId: req.customerId },
      select: { id: true },
    });
    if (!document) return res.status(404).json({ error: '文档不存在' });
    const updated = await prisma.translationDocument.update({
      where: { id: document.id },
      data: { originalName },
      select: { id: true, originalName: true },
    });
    res.json({ document: updated });
  } catch (err) { next(err); }
});

router.get('/:id/export-pdf', async (req, res, next) => {
  try {
    const document = await prisma.translationDocument.findFirst({
      where: { id: req.params.id, customerId: req.customerId },
      include: { blocks: { orderBy: { sequence: 'asc' } } },
    });
    if (!document) return res.status(404).json({ error: '文档不存在' });
    if (document.status !== 'completed') return res.status(400).json({ error: '仅支持导出已完成的翻译文档' });

    const pdfBuffer = await renderTranslatedPdf(document, document.blocks || []);
    const payload = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    const safeName = (document.originalName || 'translation').replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${safeName}-translated.pdf`)}"`);
    res.setHeader('Content-Length', String(payload.length));
    res.end(payload);
  } catch (err) { next(err); }
});

router.post('/:id/retry', async (req, res, next) => {
  try {
    const result = await retryTranslation(req.params.id, req.customerId);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/start', async (req, res, next) => {
  try {
    const result = await startTranslation(req.params.id, req.customerId);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/stop', async (req, res, next) => {
  try {
    const result = await stopTranslation(req.params.id, req.customerId);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteTranslation(req.params.id, req.customerId);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
