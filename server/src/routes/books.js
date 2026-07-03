import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// 所有 books 路由都需要认证（User Token 或 Device Token）
router.use(requireAuth);

/**
 * 从请求中获取书本过滤条件
 * Device Token 优先，User Token 兼容历史数据
 * @param {Request} req
 * @returns {{ deviceId?: string, userId?: string }}
 */
function getOwnerFilter(req) {
  if (req.deviceId) return { deviceId: req.deviceId };
  return { userId: req.user.id };
}

// ── GET /api/books ─────────────────────────────────────
// 获取当前设备/用户的所有 book 列表
router.get('/', async (req, res, next) => {
  try {
    const books = await prisma.book.findMany({
      where: getOwnerFilter(req),
      orderBy: { createdAt: 'desc' },
      select: {
        id:        true,
        title:     true,
        mode:      true,
        coverUrl:  true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { pages: true } },
      },
    });
    res.json({ books });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/books ────────────────────────────────────
// 创建新 book（生成第一张图时自动调用）
router.post('/', async (req, res, next) => {
  try {
    const { title, mode = 'book', modelName, prompt, coverUrl } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title 不能为空' });
    }

    const book = await prisma.book.create({
      data: {
        // 设备维度优先，兼容用户维度
        ...(req.deviceId ? { deviceId: req.deviceId } : { userId: req.user.id }),
        title,
        mode,
        modelName,
        prompt,
        coverUrl,
      },
    });
    res.status(201).json({ book });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/books/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const book = await prisma.book.findFirst({
      where: { id: req.params.id, ...getOwnerFilter(req) },
    });
    if (!book) return res.status(404).json({ error: 'Book 不存在' });
    res.json({ book });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/books/:id ───────────────────────────────
// 更新 book 信息（如封面 URL）
router.patch('/:id', async (req, res, next) => {
  try {
    const { coverUrl, title, modelName } = req.body;

    const book = await prisma.book.findFirst({
      where: { id: req.params.id, ...getOwnerFilter(req) },
    });
    if (!book) return res.status(404).json({ error: 'Book 不存在' });

    const updated = await prisma.book.update({
      where: { id: req.params.id },
      data: { coverUrl, title, modelName },
    });
    res.json({ book: updated });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/books/:id ──────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const book = await prisma.book.findFirst({
      where: { id: req.params.id, ...getOwnerFilter(req) },
    });
    if (!book) return res.status(404).json({ error: 'Book 不存在' });

    await prisma.book.delete({ where: { id: req.params.id } });
    res.json({ message: '已删除' });
  } catch (err) {
    next(err);
  }
});

export default router;
