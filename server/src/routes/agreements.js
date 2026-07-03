/**
 * api/agreements.js — 客户端拉取协议内容接口
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// 根据协议的 name 英文标识拉取协议
router.get('/:name', async (req, res, next) => {
  try {
    const agreement = await prisma.agreement.findUnique({
      where: { name: req.params.name }
    });
    
    if (!agreement) {
      return res.status(404).json({ error: '协议不存在' });
    }
    
    res.json({ agreement });
  } catch (err) {
    next(err);
  }
});

export default router;
