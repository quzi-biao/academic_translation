/**
 * admin/topics.js — 话题管理
 *
 * GET    /api/admin/topics/all   全量话题列表（带缓存状态）
 * POST   /api/admin/topics       新增话题
 * DELETE /api/admin/topics/:id   删除话题（Topic 表；缓存永久保留）
 *
 * 注：TopicCache 缓存是永久的，不提供删除接口。
 */

import { Router } from 'express';
import prisma from '../../config/db.js';
import { requireAdmin } from './auth.js';
import { reloadTopicSet } from '../ai.js';

const router = Router();
router.use(requireAdmin);

/**
 * 全量话题列表（来自 Topic 表，含缓存状态）
 * GET /api/admin/topics/all?search=&category=&cached=true|false&page=1&limit=50
 */
router.get('/all', async (req, res) => {
  const { search = '', category = '', cached } = req.query;
  const page  = Math.max(1, parseInt(req.query.page  || '1'));
  const limit = Math.min(500, parseInt(req.query.limit || '50'));

  try {
    const [allTopics, allCategories, cacheRecords, cachedTotal] = await Promise.all([
      prisma.topic.findMany({ 
        select: { id: true, name: true, category: true, categoryId: true, categoryRef: { select: { name: true } } } 
      }),
      prisma.topicCategory.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.topicCache.findMany({
        select: { id: true, topicName: true, imageUrl: true, hitCount: true },
      }),
      prisma.topicCache.count(),
    ]);

    // 缓存 Map: topicName -> cacheRecord
    const cacheMap = new Map(cacheRecords.map(r => [r.topicName, r]));

    // 组合
    let topics = allTopics.map(t => {
      const cr = cacheMap.get(t.name);
      return {
        id: t.id,
        name: t.name,
        category: t.categoryRef ? t.categoryRef.name : t.category, // fallback to old string
        categoryId: t.categoryId,
        cached: !!cr,
        imageUrl: cr?.imageUrl || null,
        hitCount: cr?.hitCount || 0,
      };
    });

    // 过滤
    if (search) {
      const q = search.toLowerCase();
      topics = topics.filter(t => t.name.toLowerCase().includes(q));
    }
    if (category) {
      topics = topics.filter(t => t.categoryId === category || t.category === category);
    }
    if (cached === 'true')  topics = topics.filter(t => t.cached);
    if (cached === 'false') topics = topics.filter(t => !t.cached);

    // 排序：有缓存 → 命中次数降序；无缓存 → 保持原顺序
    topics.sort((a, b) => {
      if (a.cached !== b.cached) return a.cached ? -1 : 1;
      if (a.cached && b.cached) return b.hitCount - a.hitCount;
      return 0;
    });

    // 内存分页，并补充序号
    const total = topics.length;
    const paged = topics.slice((page - 1) * limit, page * limit).map((t, i) => ({
      ...t,
      index: (page - 1) * limit + i + 1,
    }));

    const categories = allCategories.map(c => ({ id: c.id, name: c.name }));
    res.json({ total, cachedTotal, page, limit, topics: paged, categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取话题列表失败' });
  }
});

/**
 * 新增话题
 * POST /api/admin/topics
 * Body: { name: string, category?: string }
 */
router.post('/', async (req, res) => {
  const { name, categoryId, category = '自定义' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '话题名称不能为空' });

  try {
    const data = { name: name.trim() };
    if (categoryId) {
      data.categoryId = categoryId;
    } else {
      data.category = category.trim() || '自定义';
    }

    const topic = await prisma.topic.create({ data });
    // 刷新内存中的 TOPIC_SET
    reloadTopicSet().catch(() => {});
    res.json({ topic });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: '话题已存在' });
    res.status(500).json({ error: '新增话题失败' });
  }
});

/**
 * 删除话题（仅删除 Topic 表记录，缓存永久保留）
 * DELETE /api/admin/topics/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    await prisma.topic.delete({ where: { id: req.params.id } });
    // 刷新内存中的 TOPIC_SET
    reloadTopicSet().catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: '话题不存在' });
    res.status(500).json({ error: '删除失败' });
  }
});

export default router;
