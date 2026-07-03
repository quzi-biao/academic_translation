import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import prisma from '../config/db.js';

const router = Router({ mergeParams: true }); // 继承 :pageId
router.use(requireAuth);

/**
 * 生成 page 归属查询条件，同时兼容 userId 和 deviceId
 * @param {import('express').Request} req
 * @returns {object}
 */
function bookFilter(req) {
  if (req.deviceId) return { deviceId: req.deviceId };
  return { userId: req.user.id };
}

/**
 * GET /api/pages/:pageId/annotations
 * 获取该页所有探索标注（含选框尺寸 w/h 和 exploredPageId）
 */
router.get('/', async (req, res, next) => {
  try {
    const { pageId } = req.params;
    const page = await prisma.page.findFirst({
      where: { id: pageId, book: bookFilter(req) },
    });
    if (!page) return res.status(404).json({ error: '页面不存在' });

    const annotations = await prisma.annotation.findMany({
      where: { pageId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, x: true, y: true, w: true, h: true, explanation: true, exploredPageId: true, createdAt: true },
    });
    res.json({ annotations });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/pages/:pageId/annotations
 * 创建框选标注
 * body: { x, y, w, h, explanation }  (x/y/w/h 均为占视口比例 0~1)
 */
router.post('/', async (req, res, next) => {
  try {
    const { pageId } = req.params;
    const { x, y, w = 0, h = 0, explanation } = req.body;

    if (x == null || y == null || !explanation) {
      return res.status(400).json({ error: '缺少必要字段 x/y/explanation' });
    }

    const page = await prisma.page.findFirst({
      where: { id: pageId, book: bookFilter(req) },
    });
    if (!page) return res.status(404).json({ error: '页面不存在' });

    const annotation = await prisma.annotation.create({
      data: {
        pageId,
        x: Number(x), y: Number(y),
        w: Number(w), h: Number(h),
        explanation,
        deviceId: req.deviceId || null,
      },
      select: { id: true, x: true, y: true, w: true, h: true, explanation: true, exploredPageId: true, createdAt: true },
    });
    res.status(201).json({ annotation });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/pages/:pageId/annotations/:id
 * 更新标注（仅支持 exploredPageId）
 * body: { exploredPageId: string }
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { exploredPageId } = req.body;

    // 校验归属
    const ann = await prisma.annotation.findFirst({
      where: { id, page: { book: bookFilter(req) } },
    });
    if (!ann) return res.status(404).json({ error: '标注不存在' });

    const updated = await prisma.annotation.update({
      where: { id },
      data: { exploredPageId },
      select: { id: true, x: true, y: true, w: true, h: true, explanation: true, exploredPageId: true, createdAt: true },
    });
    res.json({ annotation: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/annotations/:id
 * 删除探索标注（注册在 index.js 的 /api/annotations/:id）
 */
export const deleteAnnotation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ann = await prisma.annotation.findFirst({
      where: { id, page: { book: bookFilter(req) } },
    });
    if (!ann) return res.status(404).json({ error: '标注不存在' });
    await prisma.annotation.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

export default router;
