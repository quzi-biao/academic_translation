/**
 * admin/topicCategories.js — 话题分类管理路由
 * 挂载点：/api/admin/topic-categories
 */

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import prisma from '../../config/db.js';

const router = Router();
router.use(requireAuth);

/**
 * [GET] 获取话题分类列表
 */
router.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.topicCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { topics: true },
        },
      },
    });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

/**
 * [POST] 新建话题分类
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, isActive, prompt, sortOrder } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }

    const exists = await prisma.topicCategory.findUnique({
      where: { name: name.trim() },
    });
    if (exists) {
      return res.status(400).json({ error: '该分类已存在' });
    }

    const maxSort = await prisma.topicCategory.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const order = typeof sortOrder === 'number' ? sortOrder : ((maxSort?.sortOrder ?? 0) + 1);

    const category = await prisma.topicCategory.create({
      data: {
        name: name.trim(),
        isActive: isActive !== false,
        prompt: prompt?.trim() || null,
        sortOrder: order,
      },
    });

    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

/**
 * [PUT] 修改话题分类
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, isActive, prompt, sortOrder } = req.body;

    const dataToUpdate = {};
    if (name) {
      const exists = await prisma.topicCategory.findFirst({
        where: { name: name.trim(), id: { not: id } },
      });
      if (exists) return res.status(400).json({ error: '分类名称已存在' });
      dataToUpdate.name = name.trim();
    }
    if (typeof isActive === 'boolean') dataToUpdate.isActive = isActive;
    if (typeof prompt !== 'undefined') dataToUpdate.prompt = prompt?.trim() || null;
    if (typeof sortOrder === 'number') dataToUpdate.sortOrder = sortOrder;

    const category = await prisma.topicCategory.update({
      where: { id },
      data: dataToUpdate,
    });

    res.json({ category });
  } catch (err) {
    next(err);
  }
});

/**
 * [DELETE] 删除话题分类
 * 注意：如果有话题关联到此分类，可以设为级联删除，或者把相关话题的 categoryId 置空。
 * 我们这里采取置空的方式，保留话题数据。
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.$transaction(async (tx) => {
      // 1. 将该分类下的话题 categoryId 置空
      await tx.topic.updateMany({
        where: { categoryId: id },
        data: { categoryId: null },
      });
      // 2. 删除分类
      await tx.topicCategory.delete({
        where: { id },
      });
    });

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: '分类不存在' });
    }
    next(err);
  }
});

export default router;
