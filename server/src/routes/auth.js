import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { signCustomerToken, requireCustomer } from '../middleware/customerAuth.js';
import { ensureWallet, getBalance } from '../services/customerPoints.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const { account, password, username } = req.body;
    if (!account || !password) return res.status(400).json({ error: '请输入账号和密码' });
    const isEmail = account.includes('@');
    const existing = await prisma.customer.findFirst({ where: isEmail ? { email: account } : { phone: account } });
    if (existing) return res.status(409).json({ error: '账号已注册' });
    const customer = await prisma.customer.create({
      data: {
        phone: isEmail ? null : account,
        email: isEmail ? account : null,
        username: username || account,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    await ensureWallet(customer.id);
    const token = signCustomerToken(customer);
    res.json({ token, customer: sanitizeCustomer(customer) });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { account, password } = req.body;
    if (!account || !password) return res.status(400).json({ error: '请输入账号和密码' });
    const customer = await prisma.customer.findFirst({ where: { OR: [{ phone: account }, { email: account }] } });
    if (!customer) return res.status(401).json({ error: '账号或密码错误' });
    const ok = await bcrypt.compare(password, customer.passwordHash);
    if (!ok) return res.status(401).json({ error: '账号或密码错误' });
    if (customer.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
    await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
    res.json({ token: signCustomerToken(customer), customer: sanitizeCustomer(customer) });
  } catch (err) { next(err); }
});

router.get('/me', requireCustomer, async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.customerId } });
    const wallet = await getBalance(req.customerId);
    res.json({ customer: sanitizeCustomer(customer), wallet });
  } catch (err) { next(err); }
});

function sanitizeCustomer(c) {
  if (!c) return null;
  return { id: c.id, phone: c.phone, email: c.email, username: c.username, avatarUrl: c.avatarUrl, createdAt: c.createdAt };
}

export default router;
