import { Router } from 'express';
import prisma from '../../config/db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '20'));
    const status = req.query.status;
    const search = req.query.search || '';
    const where = {
      ...(status ? { status } : {}),
      ...(search ? { originalName: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [total, documents] = await Promise.all([
      prisma.translationDocument.count({ where }),
      prisma.translationDocument.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { customer: { select: { id: true, phone: true, email: true, username: true } } } }),
    ]);
    res.json({ total, page, limit, documents });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const document = await prisma.translationDocument.findUnique({ where: { id: req.params.id }, include: { customer: true, blocks: { orderBy: { sequence: 'asc' } } } });
    if (!document) return res.status(404).json({ error: '文档不存在' });
    res.json({ document });
  } catch (err) { next(err); }
});

export default router;
