import { Router } from 'express';
import prisma from '../../config/db.js';
import { requireAdmin } from './auth.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const { channelId, start, end } = req.query;
    const where = {
      ...(channelId ? { channelId } : {}),
      ...(start && end ? { periodStart: { gte: new Date(start) }, periodEnd: { lte: new Date(end) } } : {}),
    };

    const settlements = await prisma.channelSettlement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { channel: { select: { id: true, name: true, type: true } } },
    });
    res.json({ settlements });
  } catch (err) {
    next(err);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    const { channelId, periodStart, periodEnd } = req.body;
    if (!channelId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'channelId / periodStart / periodEnd 不能为空' });
    }

    const [paidOrders, ordersAgg] = await Promise.all([
      prisma.order.findMany({
        where: {
          channelId,
          status: 'paid',
          createdAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
        },
        select: { amount: true, points: true },
      }),
      prisma.order.aggregate({
        where: {
          channelId,
          status: 'paid',
          createdAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
        },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return res.status(404).json({ error: '渠道不存在' });

    const hardwareRevenueFen = Number(ordersAgg._sum.amount ?? 0);
    const hardwareCommissionFen = Math.round(paidOrders.length * (channel.hardwareCommissionFen ?? 0));

    const settlement = await prisma.channelSettlement.create({
      data: {
        channelId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        hardwareOrderCount: ordersAgg._count,
        hardwareRevenueFen,
        hardwareCommissionFen,
        subscriptionRevenueFen: 0,
        subscriptionCommissionFen: 0,
        refundFen: 0,
        totalCommissionFen: hardwareCommissionFen,
        status: 'draft',
      },
    });

    res.status(201).json({ settlement });
  } catch (err) {
    next(err);
  }
});

export default router;
