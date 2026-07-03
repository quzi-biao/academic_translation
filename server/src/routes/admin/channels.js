import { Router } from 'express';
import prisma from '../../config/db.js';
import { requireAdmin } from './auth.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res, next) => {
  try {
    const channels = await prisma.channel.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { devices: true, orders: true, settlements: true, tickets: true } },
      },
    });

    const orderStats = await prisma.order.groupBy({
      by: ['channelId', 'channelSettlementStatus'],
      where: { status: 'paid' },
      _sum: { amount: true }
    });

    const result = channels.map(channel => {
      const pendingStats = orderStats.find(o => o.channelId === channel.id && o.channelSettlementStatus === 'unsettled');
      const settledStats = orderStats.find(o => o.channelId === channel.id && o.channelSettlementStatus === 'settled');
      const pendingAmount = pendingStats?._sum?.amount || 0;
      const settledAmount = settledStats?._sum?.amount || 0;
      const pendingCommissionFen = Math.floor(pendingAmount * channel.subscriptionCommissionRate);
      const settledCommissionFen = Math.floor(settledAmount * channel.subscriptionCommissionRate);
      return {
        ...channel,
        pendingCommissionFen,
        totalCommissionFen: pendingCommissionFen + settledCommissionFen
      };
    });

    res.json({ channels: result });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, type = 'affiliate', contactName, contactPhone, hardwareCommissionFen = 300, subscriptionCommissionRate = 0.2, notes, isActive = true } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: '渠道名称不能为空' });

    const channel = await prisma.channel.create({
      data: {
        name: name.trim(),
        type,
        contactName: contactName?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        hardwareCommissionFen: Number(hardwareCommissionFen),
        subscriptionCommissionRate: Number(subscriptionCommissionRate),
        notes: notes || null,
        isActive: !!isActive,
      },
    });
    res.status(201).json({ channel });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { name, type, contactName, contactPhone, hardwareCommissionFen, subscriptionCommissionRate, notes, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (type !== undefined) data.type = type;
    if (contactName !== undefined) data.contactName = contactName?.trim() || null;
    if (contactPhone !== undefined) data.contactPhone = contactPhone?.trim() || null;
    if (hardwareCommissionFen !== undefined) data.hardwareCommissionFen = Number(hardwareCommissionFen);
    if (subscriptionCommissionRate !== undefined) data.subscriptionCommissionRate = Number(subscriptionCommissionRate);
    if (notes !== undefined) data.notes = notes || null;
    if (isActive !== undefined) data.isActive = !!isActive;

    const channel = await prisma.channel.update({ where: { id: req.params.id }, data });
    res.json({ channel });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.channel.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const channelId = req.params.id;
    const channel = await prisma.channel.findUnique({
      where: { id: channelId }
    });
    if (!channel) return res.status(404).json({ error: '渠道不存在' });

    const devicesRaw = await prisma.$queryRaw`
      SELECT d.id
      FROM devices d
      LEFT JOIN pages p ON p."deviceId" = d.id
      WHERE d."channelId" = ${channelId}
      GROUP BY d.id
      HAVING COUNT(p.id) > 1
    `;
    const validDeviceCount = devicesRaw.length;

    const pendingOrders = await prisma.order.findMany({
      where: { channelId, status: 'paid', channelSettlementStatus: 'unsettled' }
    });
    const settledOrders = await prisma.order.findMany({
      where: { channelId, status: 'paid', channelSettlementStatus: 'settled' }
    });

    const pendingAmountFen = pendingOrders.reduce((sum, o) => sum + o.amount, 0);
    const settledAmountFen = settledOrders.reduce((sum, o) => sum + o.amount, 0);

    const pendingCommissionFen = Math.floor(pendingAmountFen * channel.subscriptionCommissionRate);
    const settledCommissionFen = Math.floor(settledAmountFen * channel.subscriptionCommissionRate);

    res.json({
      channel: {
        ...channel,
        validDeviceCount,
        pendingAmountFen,
        pendingCommissionFen,
        settledAmountFen,
        settledCommissionFen
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/settlements', async (req, res, next) => {
  try {
    const settlements = await prisma.channelSettlement.findMany({
      where: { channelId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ settlements });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/settlements/preview', async (req, res, next) => {
  try {
    const channelId = req.params.id;
    const { periodStart, periodEnd } = req.body;
    
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: '必须提供时间范围' });
    }

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return res.status(404).json({ error: '渠道不存在' });

    const orders = await prisma.order.findMany({
      where: {
        channelId,
        status: 'paid',
        channelSettlementStatus: 'unsettled',
        paidAt: { gte: start, lte: end }
      },
      include: {
        device: { select: { deviceCode: true } }
      },
      orderBy: { paidAt: 'desc' }
    });

    const totalRevenueFen = orders.reduce((s, o) => s + o.amount, 0);
    const totalCommissionFen = Math.floor(totalRevenueFen * channel.subscriptionCommissionRate);

    res.json({ success: true, revenue: totalRevenueFen, commission: totalCommissionFen, orders });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/settlements', async (req, res, next) => {
  try {
    const channelId = req.params.id;
    const { periodStart, periodEnd, note } = req.body;
    
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: '必须提供时间范围' });
    }

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return res.status(404).json({ error: '渠道不存在' });

    const orders = await prisma.order.findMany({
      where: {
        channelId,
        status: 'paid',
        channelSettlementStatus: 'unsettled',
        paidAt: { gte: start, lte: end }
      }
    });

    if (orders.length === 0) {
      return res.status(400).json({ error: '该时间范围内没有待结算的订单' });
    }

    const totalRevenueFen = orders.reduce((s, o) => s + o.amount, 0);
    const totalCommissionFen = Math.floor(totalRevenueFen * channel.subscriptionCommissionRate);

    await prisma.$transaction([
      prisma.channelSettlement.create({
        data: {
          channelId,
          periodStart: start,
          periodEnd: end,
          subscriptionRevenueFen: totalRevenueFen,
          subscriptionCommissionFen: totalCommissionFen,
          totalCommissionFen: totalCommissionFen,
          status: 'paid',
          note: note || ''
        }
      }),
      prisma.order.updateMany({
        where: { id: { in: orders.map(o => o.id) } },
        data: { channelSettlementStatus: 'settled' }
      })
    ]);

    res.json({ success: true, revenue: totalRevenueFen, commission: totalCommissionFen });
  } catch (err) {
    next(err);
  }
});

export default router;
