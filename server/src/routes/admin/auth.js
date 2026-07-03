/**
 * admin/auth.js — Admin 登录认证
 *
 * POST /api/admin/login  用户名密码登录，返回 AdminToken（7天有效）
 * GET  /api/admin/me     获取当前 Admin 信息
 */

import { Router } from 'express';
import prisma from '../../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'flipbook-jwt-secret-2024';

/**
 * POST /api/admin/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: '用户名或密码错误' });

    if (!['superadmin', 'manager'].includes(user.role)) {
      return res.status(403).json({ error: '无后台访问权限' });
    }

    const token = jwt.sign(
      { sub: user.id, username: user.username, role: user.role, type: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error('[admin/login]', err);
    res.status(500).json({ error: '登录失败' });
  }
});

/**
 * GET /api/admin/me
 * Header: Authorization: Bearer <AdminToken>
 */
router.get('/me', requireAdmin, async (req, res) => {
  res.json({ user: req.adminUser });
});

/**
 * Admin Token 校验中间件
 * 挂到 req.adminUser = { id, username, role }
 */
export function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'admin') throw new Error('not admin token');
    req.adminUser = { id: payload.sub, username: payload.username, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期，请重新登录' });
  }
}

/**
 * 仅超级管理员可访问的中间件
 */
export function requireSuperAdmin(req, res, next) {
  if (req.adminUser?.role !== 'superadmin') {
    return res.status(403).json({ error: '需要超级管理员权限' });
  }
  next();
}

export default router;
