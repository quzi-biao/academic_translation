/**
 * admin/plans.js — 套餐管理 CRUD
 *
 * GET    /api/admin/plans          套餐列表（含已停用）
 * POST   /api/admin/plans          新建套餐
 * PATCH  /api/admin/plans/:id      编辑套餐
 * PATCH  /api/admin/plans/:id/toggle  切换启用/停用
 * DELETE /api/admin/plans/:id      删除套餐（无关联订单时允许）
 */

import { Router } from 'express';
import prisma from '../../config/db.js';
import { requireAdmin } from './auth.js';

const router = Router();
router.use(requireAdmin);

/**
 * GET /api/admin/plans
 * 返回所有套餐，按 sortOrder ASC 排序
 */
router.get('/', async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { orders: true } } },
    });
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/plans
 * 新建套餐
 * Body: { name, price, points, description?, isActive?, sortOrder? }
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, price, points, description, isActive = true, sortOrder = 0 } = req.body;

    if (!name)   return res.status(400).json({ error: '套餐名称不能为空' });
    if (!price || price <= 0) return res.status(400).json({ error: '价格必须大于 0（单位：分）' });
    if (!points || points <= 0) return res.status(400).json({ error: '点数必须大于 0' });

    const plan = await prisma.plan.create({
      data: {
        name,
        price: parseInt(price, 10),
        points: parseInt(points, 10),
        descriptionJson: description ?? null,
        isActive,
        sortOrder: parseInt(sortOrder, 10),
      },
    });

    res.status(201).json({ plan });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/plans/:id
 * 编辑套餐
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, price, points, description, isActive, sortOrder } = req.body;

    const data = {};
    if (name        !== undefined) data.name          = name;
    if (price       !== undefined) data.price         = parseInt(price, 10);
    if (points      !== undefined) data.points        = parseInt(points, 10);
    if (description !== undefined) data.descriptionJson = description;
    if (isActive    !== undefined) data.isActive      = isActive;
    if (sortOrder   !== undefined) data.sortOrder     = parseInt(sortOrder, 10);

    const plan = await prisma.plan.update({ where: { id }, data });
    res.json({ plan });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: '套餐不存在' });
    next(err);
  }
});

/**
 * PATCH /api/admin/plans/:id/toggle
 * 切换启用 / 停用
 */
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.plan.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '套餐不存在' });

    const plan = await prisma.plan.update({
      where: { id },
      data:  { isActive: !existing.isActive },
    });
    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/plans/:id
 * 删除套餐（有关联订单时禁止删除）
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const orderCount = await prisma.order.count({ where: { planId: id } });
    if (orderCount > 0) {
      return res.status(409).json({ error: `该套餐已有 ${orderCount} 笔订单，无法删除` });
    }

    await prisma.plan.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: '套餐不存在' });
    next(err);
  }
});

export default router;
