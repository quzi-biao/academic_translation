import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { generatePageExplanation } from '../services/ai/explanation.js';
import { generateTitleFromImage } from '../services/ai/gemini-text.js';
import { requirePoints, deductPoints, getPointCost } from '../services/points.js';

const router = Router();
router.use(requireAuth);

/**
 * 验证 page 归属，兼容 deviceId 和 userId
 * @param {import('express').Request} req
 * @param {{ book: { userId?: string, deviceId?: string } }} page
 */
function isOwner(req, page) {
  if (req.deviceId) return page.book.deviceId === req.deviceId;
  return page.book.userId === req.user?.id;
}

// ── GET /api/pages/cache/:promptHash ──────────────────
// 注意：cache 路由必须在 /:id 之前，避免被参数路由截获
router.get('/cache/:promptHash', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({
      where: { promptHash: req.params.promptHash },
      include: { book: true },
    });
    if (!page || !isOwner(req, page)) {
      return res.status(404).json({ cached: false });
    }
    res.json({ cached: true, page });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/pages/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({
      where: { id: req.params.id },
      include: { book: true },
    });
    if (!page) return res.status(404).json({ error: '页不存在' });
    if (!isOwner(req, page)) {
      return res.status(403).json({ error: '无权访问' });
    }
    res.json({ page });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/pages/:id ───────────────────────────────────────
// 修改页名称（title 字段 = 展示标题）
router.patch('/:id', async (req, res, next) => {
  try {
    const { prompt, title } = req.body;
    if (!prompt?.trim() && !title?.trim()) {
      return res.status(400).json({ error: 'prompt 或 title 不能为空' });
    }
    const page = await prisma.page.findUnique({
      where: { id: req.params.id },
      include: { book: true },
    });
    if (!page) return res.status(404).json({ error: '页不存在' });
    if (!isOwner(req, page)) {
      return res.status(403).json({ error: '无权访问' });
    }
    const data = {};
    if (prompt?.trim()) data.prompt = prompt.trim();
    if (title?.trim()) data.title  = title.trim();
    const updated = await prisma.page.update({ where: { id: req.params.id }, data });
    res.json({ page: updated });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/pages/:id/refresh-title ─────────────────────────────
// 强制从图片内容重新生成标题，并存入 DB
router.post('/:id/refresh-title', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({
      where: { id: req.params.id },
      include: { book: true },
    });
    if (!page) return res.status(404).json({ error: '页不存在' });
    if (!isOwner(req, page)) {
      return res.status(403).json({ error: '无权访问' });
    }

    const title = await generateTitleFromImage(page.imageUrl);
    if (!title) {
      return res.status(422).json({ error: '标题生成失败，请稍后重试' });
    }

    const updated = await prisma.page.update({
      where: { id: req.params.id },
      data:  { title },
    });
    res.json({ title: updated.title });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/pages/:id ──────────────────────────────
// 删除页（同时递归删除子页由 Prisma cascade 处理）
router.delete('/:id', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({
      where: { id: req.params.id },
      include: { book: true },
    });
    if (!page) return res.status(404).json({ error: '页不存在' });
    if (!isOwner(req, page)) {
      return res.status(403).json({ error: '无权访问' });
    }
    await prisma.page.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── GET /api/pages/:id/explanation ────────────────────
// 查询参数：?lang=zh（默认 zh）
// 1. DB 查询 → 存在直接返回（cached: true）
// 2. 不存在 → 调用 Gemini 生成 → 写入 DB → 返回（cached: false）
router.get('/:id/explanation', async (req, res, next) => {
  try {
    const { lang = 'zh' } = req.query;
    const pageId = req.params.id;

    // 验证页归属
    const page = await prisma.page.findUnique({
      where:   { id: pageId },
      include: { book: true },
    });
    if (!page) return res.status(404).json({ error: '页不存在' });
    if (!isOwner(req, page)) {
      return res.status(403).json({ error: '无权访问' });
    }

    // 查 DB 缓存
    const existing = await prisma.pageExplanation.findUnique({
      where: { pageId_language: { pageId, language: lang } },
    });
    if (existing) {
      return res.json({ explanation: existing.content, cached: true });
    }

    // 点数检查（仅设备 Token，缓存命中免检）
    if (!await requirePoints(req.deviceId, res)) return;

    // 懒生成：调用 Gemini
    const content = await generatePageExplanation(page.imageUrl, page.prompt || '', lang);

    // 写入 DB
    const record = await prisma.pageExplanation.create({
      data: { pageId, language: lang, content, deviceId: req.deviceId || null },
    });

    res.json({ explanation: record.content, cached: false });

    // 异步扣点（按万字）
    if (req.deviceId && content.length > 0) {
      getPointCost('points_per_wan_text', 1).then((costPerWan) => {
        const cost = Math.ceil(content.length / 10000) * costPerWan;
        if (cost > 0) deductPoints(req.deviceId, -Math.round(cost), 'text', `页面解读 ${content.length}字`);
      }).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

export default router;
