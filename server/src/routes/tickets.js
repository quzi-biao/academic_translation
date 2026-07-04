import { Router } from 'express';
import prisma from '../config/db.js';
import { requireCustomer } from '../middleware/customerAuth.js';

const router = Router();
router.use(requireCustomer);

router.post('/', async (req, res, next) => {
  try {
    const { title = '用户反馈', content, contactName, contactPhone } = req.body;
    if (!content) return res.status(400).json({ error: '反馈内容不能为空' });
    const ticket = await prisma.supportTicket.create({
      data: {
        customerId: req.customerId,
        title,
        type: 'feedback',
        status: 'open',
        priority: 'medium',
        contactName,
        contactPhone,
        description: content,
        messages: { create: { authorType: 'customer', content } },
      },
    });
    res.json({ success: true, ticketId: ticket.id });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit || '10')));
    const where = { customerId: req.customerId };
    const [total, tickets] = await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { messages: { orderBy: { createdAt: 'desc' } } },
      }),
    ]);
    res.json({ tickets, total, page, limit });
  } catch (err) { next(err); }
});

export default router;
