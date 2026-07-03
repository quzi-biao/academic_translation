import { Router } from 'express';
import prisma from '../../config/db.js';
import { addPoints } from '../../services/customerPoints.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '20'));
    const search = req.query.search || '';
    const where = search ? { OR: [{ phone: { contains: search } }, { email: { contains: search, mode: 'insensitive' } }, { username: { contains: search, mode: 'insensitive' } }] } : {};
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { wallet: true, _count: { select: { documents: true, orders: true } } } }),
    ]);
    res.json({ total, page, limit, customers });
  } catch (err) { next(err); }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    const ledger = await prisma.pointLedger.findMany({ where: { customerId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ ledger });
  } catch (err) { next(err); }
});

router.post('/:id/points', async (req, res, next) => {
  try {
    const delta = parseInt(req.body.delta, 10);
    if (!delta || delta <= 0) return res.status(400).json({ error: '请输入正整数点数' });
    const result = await addPoints(req.params.id, delta, 'admin_grant', req.body.reason || '后台手动增点', null);
    res.json(result);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: { status: req.body.status } });
    res.json({ customer });
  } catch (err) { next(err); }
});

export default router;
