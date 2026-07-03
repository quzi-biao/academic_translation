/**
 * admin/users.js — 用户/管理员查询接口
 */
import { Router } from 'express';
import prisma from '../../config/db.js';

const router = Router();

// 获取客户经理列表
router.get('/managers', async (req, res, next) => {
  try {
    const managers = await prisma.user.findMany({
      where: { role: 'manager' },
      select: { id: true, username: true }
    });
    res.json({ managers });
  } catch (err) {
    next(err);
  }
});

export default router;
