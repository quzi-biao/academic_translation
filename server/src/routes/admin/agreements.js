/**
 * admin/agreements.js — 管理后台协议管理接口
 */
import { Router } from 'express';
import prisma from '../../config/db.js';
import { requireAdmin } from './auth.js';

const router = Router();
router.use(requireAdmin);

// 获取所有协议列表
router.get('/', async (req, res, next) => {
  try {
    const agreements = await prisma.agreement.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ agreements });
  } catch (err) {
    next(err);
  }
});

// 获取单个协议
router.get('/:id', async (req, res, next) => {
  try {
    const agreement = await prisma.agreement.findUnique({
      where: { id: req.params.id }
    });
    if (!agreement) return res.status(404).json({ error: '协议不存在' });
    res.json({ agreement });
  } catch (err) {
    next(err);
  }
});

// 新建协议
router.post('/', async (req, res, next) => {
  try {
    const { name, title, content } = req.body;
    if (!name || !title || !content) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    const existing = await prisma.agreement.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ error: '协议标识名称(name)已存在' });
    }
    const agreement = await prisma.agreement.create({
      data: { name, title, content }
    });
    res.json({ agreement });
  } catch (err) {
    next(err);
  }
});

// 更新协议
router.put('/:id', async (req, res, next) => {
  try {
    const { name, title, content } = req.body;
    const existing = await prisma.agreement.findUnique({ where: { name } });
    if (existing && existing.id !== req.params.id) {
      return res.status(400).json({ error: '协议标识名称(name)已被其他协议使用' });
    }
    const agreement = await prisma.agreement.update({
      where: { id: req.params.id },
      data: { name, title, content }
    });
    res.json({ agreement });
  } catch (err) {
    next(err);
  }
});

// 删除协议
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.agreement.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
