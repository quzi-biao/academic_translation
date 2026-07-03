import { Router } from 'express';
import prisma from '../../config/db.js';
import { refundOrder } from '../../services/wechat.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '20'));
    const status = req.query.status;
    const where = status ? { status } : {};
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { customer: { select: { id: true, phone: true, email: true, username: true } }, plan: true, payment: true } }),
    ]);
    res.json({ total, page, limit, orders });
  } catch (err) { next(err); }
});

router.post('/:id/refund', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.status !== 'paid') return res.status(400).json({ error: '只能退款已支付订单' });
    if (order.payment?.channel === 'wechat') await refundOrder(order.id, `REFUND_${order.id}`, order.amount, order.amount, '管理员后台发起退款');
    await prisma.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message || '退款失败' }); }
});

export default router;
