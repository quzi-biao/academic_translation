/**
 * admin/config.js — 全局配置管理接口
 *
 * GET  /api/admin/config        获取所有配置项
 * PATCH /api/admin/config/:key  更新单个配置项的值
 */

import { Router } from 'express';
import prisma from '../../config/db.js';
import { requireAdmin, requireSuperAdmin } from './auth.js';

const router = Router();
router.use(requireAdmin);

// ── GET /api/admin/config ─────────────────────────────
// 返回所有 GlobalConfig 条目（含 key、value、desc）
router.get('/', async (req, res) => {
  try {
    const configs = await prisma.globalConfig.findMany({
      orderBy: { key: 'asc' },
    });
    res.json({ configs });
  } catch (err) {
    res.status(500).json({ error: '获取配置失败' });
  }
});

// ── PATCH /api/admin/config/:key ──────────────────────
// Body: { value: string }
router.patch('/:key', requireSuperAdmin, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined || value === null) {
    return res.status(400).json({ error: 'value 不能为空' });
  }

  try {
    const updated = await prisma.globalConfig.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
    res.json({ config: updated });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: '配置项不存在' });
    res.status(500).json({ error: '更新失败' });
  }
});

export default router;
