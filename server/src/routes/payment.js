import express from 'express';
import prisma from '../config/db.js';
import { requireCustomer } from '../middleware/customerAuth.js';
import { createNativeOrder, verifyAndDecodeNotify, queryOrder } from '../services/wechat.js';
import { addPoints } from '../services/customerPoints.js';

const router = express.Router();
const ORDER_TTL_MS = 300_000;

async function cancelExpiredPendingOrders(customerId) {
  await prisma.order.updateMany({
    where: {
      customerId,
      status: 'pending',
      createdAt: { lt: new Date(Date.now() - ORDER_TTL_MS) },
    },
    data: { status: 'cancelled' },
  });
}

function remainingSecondsOf(order) {
  const expiresAt = new Date(order.createdAt).getTime() + ORDER_TTL_MS;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

async function findReusablePendingOrder(customerId, planId = null) {
  await cancelExpiredPendingOrders(customerId);
  return prisma.order.findFirst({
    where: {
      customerId,
      status: 'pending',
      planId,
    },
    orderBy: { createdAt: 'desc' },
    include: { plan: { select: { name: true } } },
  });
}

async function findAnyPendingOrder(customerId) {
  await cancelExpiredPendingOrders(customerId);
  return prisma.order.findFirst({
    where: {
      customerId,
      status: 'pending',
    },
    orderBy: { createdAt: 'desc' },
    include: { plan: { select: { name: true } } },
  });
}

async function buildOrderPaymentPayload(order, description) {
  const remainingSeconds = remainingSecondsOf(order);
  if (remainingSeconds <= 0) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
    throw new Error('订单已超时，请重新发起支付');
  }
  const codeUrl = await createNativeOrder(order.id, order.amount, description, Math.max(remainingSeconds, 30));
  return {
    orderId: order.id,
    codeUrl,
    amount: order.amount,
    points: order.points,
    createdAt: order.createdAt,
    remainingSeconds,
    status: order.status,
  };
}

router.get('/plans', requireCustomer, async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] });
    res.json({ plans });
  } catch (err) { next(err); }
});

router.post('/create', requireCustomer, async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: '缺少 planId' });
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) return res.status(404).json({ error: '套餐不存在或已停用' });
    const existingPending = await findAnyPendingOrder(req.customerId);
    if (existingPending && existingPending.planId !== plan.id) {
      return res.status(409).json({
        error: '当前有未支付订单，请先完成支付或取消后再下单',
        pendingOrder: {
          orderId: existingPending.id,
          amount: existingPending.amount,
          points: existingPending.points,
          createdAt: existingPending.createdAt,
          remainingSeconds: remainingSecondsOf(existingPending),
          planName: existingPending.plan?.name || null,
        },
      });
    }

    const reusable = existingPending?.planId === plan.id
      ? existingPending
      : await findReusablePendingOrder(req.customerId, plan.id);
    if (reusable) {
      const payload = await buildOrderPaymentPayload(reusable, `闻一翻译 ${plan.name} ${reusable.points}点`);
      return res.json(payload);
    }

    const order = await prisma.order.create({ data: { customerId: req.customerId, planId: plan.id, amount: plan.price, points: plan.points, status: 'pending' } });
    const payload = await buildOrderPaymentPayload(order, `闻一翻译 ${plan.name} ${plan.points}点`);
    res.json(payload);
  } catch (err) { next(err); }
});

router.post('/direct', requireCustomer, async (req, res, next) => {
  try {
    const yuan = parseFloat(req.body.amountYuan);
    if (Number.isNaN(yuan) || yuan <= 0) return res.status(400).json({ error: '请输入有效金额' });
    const cfgs = await prisma.globalConfig.findMany({ where: { key: { in: ['POINTS_PER_YUAN', 'DIRECT_RECHARGE_MIN', 'DIRECT_RECHARGE_MAX'] } } });
    const cfgMap = Object.fromEntries(cfgs.map((c) => [c.key, Number(c.value)]));
    const pointsPerYuan = cfgMap.POINTS_PER_YUAN ?? 100;
    const minYuan = cfgMap.DIRECT_RECHARGE_MIN ?? 10;
    const maxYuan = cfgMap.DIRECT_RECHARGE_MAX ?? 2000;
    if (yuan < minYuan) return res.status(400).json({ error: `充值金额最低 ${minYuan} 元` });
    if (yuan > maxYuan) return res.status(400).json({ error: `充值金额最高 ${maxYuan} 元` });
    const amountFen = Math.round(yuan * 100);
    const points = Math.floor(yuan * pointsPerYuan);
    const existingPending = await findAnyPendingOrder(req.customerId);
    if (existingPending && (existingPending.planId || existingPending.amount !== amountFen || existingPending.points !== points)) {
      return res.status(409).json({
        error: '当前有未支付订单，请先完成支付或取消后再下单',
        pendingOrder: {
          orderId: existingPending.id,
          amount: existingPending.amount,
          points: existingPending.points,
          createdAt: existingPending.createdAt,
          remainingSeconds: remainingSecondsOf(existingPending),
          planName: existingPending.plan?.name || null,
        },
      });
    }

    const reusable = !existingPending?.planId && existingPending?.amount === amountFen && existingPending?.points === points
      ? existingPending
      : await findReusablePendingOrder(req.customerId, null);
    if (reusable && !reusable.planId && reusable.amount === amountFen && reusable.points === points) {
      const payload = await buildOrderPaymentPayload(reusable, `闻一翻译自定义充值 ${reusable.points}点`);
      return res.json(payload);
    }

    const order = await prisma.order.create({ data: { customerId: req.customerId, amount: amountFen, points, status: 'pending' } });
    const payload = await buildOrderPaymentPayload(order, `闻一翻译自定义充值 ${points}点`);
    res.json(payload);
  } catch (err) { next(err); }
});

router.get('/order/:orderId', requireCustomer, async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, select: { id: true, status: true, customerId: true, points: true, createdAt: true } });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.customerId !== req.customerId) return res.status(403).json({ error: '无权查看此订单' });
    if (order.status === 'pending' && remainingSecondsOf(order) <= 0) {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
    }
    if (order.status === 'pending') {
      try {
        const wxResult = await queryOrder(order.id);
        const wxData = wxResult?.data || wxResult;
        if (wxData?.trade_state === 'SUCCESS') await handleOrderPaid(order.id, wxData);
      } catch {}
    }
    const updated = await prisma.order.findUnique({ where: { id: order.id }, include: { customer: { include: { wallet: true } } } });
    res.json({ status: updated.status, balance: updated.customer.wallet?.balance ?? 0, remainingSeconds: updated.status === 'pending' ? remainingSecondsOf(updated) : 0 });
  } catch (err) { next(err); }
});

router.post('/cancel/:orderId', requireCustomer, async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此订单' });
    if (order.status !== 'pending') return res.json({ status: order.status });
    try {
      const wxResult = await queryOrder(order.id);
      const wxData = wxResult?.data || wxResult;
      if (wxData?.trade_state === 'SUCCESS') {
        await handleOrderPaid(order.id, wxData);
        return res.json({ status: 'paid' });
      }
    } catch {}
    await prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
    res.json({ status: 'cancelled' });
  } catch (err) { next(err); }
});

router.post('/reopen/:orderId', requireCustomer, async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { plan: { select: { name: true } } },
    });
    if (!order) return res.status(404).json({ error: '订单不存在' });
    if (order.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此订单' });
    if (order.status !== 'pending') return res.status(400).json({ error: `订单状态为 ${order.status}，无法继续支付` });

    try {
      const wxResult = await queryOrder(order.id);
      const wxData = wxResult?.data || wxResult;
      if (wxData?.trade_state === 'SUCCESS') {
        await handleOrderPaid(order.id, wxData);
        const paid = await prisma.order.findUnique({ where: { id: order.id }, include: { customer: { include: { wallet: true } } } });
        return res.json({ status: 'paid', balance: paid.customer.wallet?.balance ?? 0 });
      }
    } catch {}

    const description = order.plan
      ? `闻一翻译 ${order.plan.name} ${order.points}点`
      : `闻一翻译自定义充值 ${order.points}点`;
    const payload = await buildOrderPaymentPayload(order, description);
    res.json(payload);
  } catch (err) { next(err); }
});

router.post('/notify', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {}));
  try {
    const data = await verifyAndDecodeNotify(req.headers, rawBody);
    if (data.trade_state === 'SUCCESS') await handleOrderPaid(data.out_trade_no, data);
    res.json({ code: 'SUCCESS', message: 'OK' });
  } catch (err) {
    console.error('[payment/notify]', err.message);
    res.status(500).json({ code: 'FAIL', message: err.message });
  }
});

async function handleOrderPaid(outTradeNo, wxData) {
  const order = await prisma.order.findUnique({ where: { id: outTradeNo } });
  if (!order || order.status === 'paid') return;
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: outTradeNo }, data: { status: 'paid', paidAt: new Date() } });
    await tx.payment.upsert({
      where: { orderId: outTradeNo },
      update: { channelOrderId: wxData.transaction_id, rawResponse: wxData, paidAt: new Date() },
      create: { orderId: outTradeNo, channel: 'wechat', channelOrderId: wxData.transaction_id, rawResponse: wxData, paidAt: new Date() },
    });
  });
  await addPoints(order.customerId, order.points, 'purchase', `微信支付充值 ${order.points} 点`, order.id);
}

export default router;
