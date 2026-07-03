import { Router } from 'express';
import multer from 'multer';
import prisma from '../config/db.js';
import { requireCustomer } from '../middleware/customerAuth.js';
import { createTranslationDocument, deleteTranslation, retryTranslation } from '../services/translationJob.js';
import { renderTranslatedPdf } from '../services/exportPdf.js';
import { supportedExtensions } from '../services/parser/readers.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });

router.use(requireCustomer);

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请选择文件' });
    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || '';
    if (!supportedExtensions.has(ext)) return res.status(400).json({ error: '仅支持 PDF、DOCX、DOC、MD、TXT' });
    const doc = await createTranslationDocument({ customerId: req.customerId, file: req.file });
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
        select: { id: true, originalName: true, status: true, progress: true, summary: true, totalBlocks: true, translatedBlocks: true, pointCost: true, errorMsg: true, createdAt: true, completedAt: true },
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
        translatedBlocks,
        skippedBlocks: stats.skipped || 0,
        effectiveTotalBlocks,
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

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteTranslation(req.params.id, req.customerId);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
