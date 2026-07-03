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
    const tickets = await prisma.supportTicket.findMany({ where: { customerId: req.customerId }, orderBy: { createdAt: 'desc' }, include: { messages: true } });
    res.json({ tickets });
  } catch (err) { next(err); }
});

export default router;
