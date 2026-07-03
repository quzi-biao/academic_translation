import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/prompts/:key ──────────────────────────────
router.get('/:key', async (req, res, next) => {
  try {
    const prompt = await prisma.prompt.findUnique({
      where: { key: req.params.key },
    });
    if (!prompt) return res.status(404).json({ error: `Prompt '${req.params.key}' 不存在` });
    res.json({ prompt });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/prompts ───────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const prompts = await prisma.prompt.findMany({ orderBy: { key: 'asc' } });
    res.json({ prompts });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/prompts/:key ──────────────────────────────
// 创建或更新（upsert）
router.put('/:key', async (req, res, next) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ error: 'value 不能为空' });

    const prompt = await prisma.prompt.upsert({
      where:  { key: req.params.key },
      create: { key: req.params.key, value },
      update: { value },
    });
    res.json({ prompt });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/prompts/:key ───────────────────────────
router.delete('/:key', async (req, res, next) => {
  try {
    await prisma.prompt.delete({ where: { key: req.params.key } });
    res.json({ message: '已删除' });
  } catch (err) {
    next(err);
  }
});

export default router;
