import { Router } from 'express';
import prisma from '../../config/db.js';
import { requireAdmin } from './auth.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const { status, type, search = '' } = req.query;
    const where = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { contactName: { contains: search, mode: 'insensitive' } },
          { contactPhone: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        device: { select: { id: true, deviceCode: true, notes: true } },
        channel: { select: { id: true, name: true } },
        assignee: { select: { id: true, username: true } },
        messages: { orderBy: { createdAt: 'desc' } },
        _count: { select: { messages: true } },
      },
    });
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { deviceId, channelId, title, type = 'feedback', priority = 'medium', contactName, contactPhone, description, assigneeId } = req.body;
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }
    const ticket = await prisma.supportTicket.create({
      data: {
        deviceId: deviceId || null,
        channelId: channelId || null,
        title: title.trim(),
        type,
        priority,
        contactName: contactName?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        description: description.trim(),
        assigneeId: assigneeId || null,
      },
    });
    res.status(201).json({ ticket });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { status, priority, resolution, assigneeId, type, title, description } = req.body;
    const data = {};
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (resolution !== undefined) data.resolution = resolution || null;
    if (assigneeId !== undefined) data.assigneeId = assigneeId || null;
    if (type !== undefined) data.type = type;
    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = String(description).trim();

    if (status === 'resolved') data.resolvedAt = new Date();
    if (status === 'closed') data.closedAt = new Date();

    const ticket = await prisma.supportTicket.update({ where: { id: req.params.id }, data });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const { content, authorType = 'agent', authorName } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '内容不能为空' });
    const message = await prisma.supportTicketMessage.create({
      data: {
        ticketId: req.params.id,
        content: content.trim(),
        authorType,
        authorName: authorName?.trim() || null,
      },
    });
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

export default router;
