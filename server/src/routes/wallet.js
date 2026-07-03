import { Router } from 'express';
import prisma from '../config/db.js';
import { requireCustomer } from '../middleware/customerAuth.js';
import { getBalance } from '../services/customerPoints.js';

const router = Router();
router.use(requireCustomer);

router.get('/', async (req, res, next) => {
  try {
    const wallet = await getBalance(req.customerId);
    const [cfgRate, cfgMin, cfgMax] = await Promise.all([
      prisma.globalConfig.findUnique({ where: { key: 'POINTS_PER_YUAN' } }),
      prisma.globalConfig.findUnique({ where: { key: 'DIRECT_RECHARGE_MIN' } }),
      prisma.globalConfig.findUnique({ where: { key: 'DIRECT_RECHARGE_MAX' } }),
    ]);
    res.json({ balance: wallet.balance, pointsPerYuan: Number(cfgRate?.value ?? 100), minYuan: Number(cfgMin?.value ?? 10), maxYuan: Number(cfgMax?.value ?? 2000) });
  } catch (err) { next(err); }
});

router.get('/ledger', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '30'));
    const where = { customerId: req.customerId };
    const [total, ledger] = await Promise.all([
      prisma.pointLedger.count({ where }),
      prisma.pointLedger.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    res.json({ total, ledger });
  } catch (err) { next(err); }
});

router.get('/orders', async (req, res, next) => {
  try {
    await prisma.order.updateMany({
      where: {
        customerId: req.customerId,
        status: 'pending',
        createdAt: { lt: new Date(Date.now() - 300_000) },
      },
      data: { status: 'cancelled' },
    });
    const orders = await prisma.order.findMany({ where: { customerId: req.customerId }, orderBy: { createdAt: 'desc' }, take: 50, include: { plan: { select: { name: true } }, payment: true } });
    res.json({
      orders: orders.map((order) => ({
        ...order,
        remainingSeconds: order.status === 'pending'
          ? Math.max(0, Math.ceil((order.createdAt.getTime() + 300_000 - Date.now()) / 1000))
          : 0,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
