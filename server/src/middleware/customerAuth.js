import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'academic-translation-jwt-secret';

export function signCustomerToken(customer) {
  return jwt.sign(
    { sub: customer.id, phone: customer.phone, email: customer.email, type: 'customer' },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export function requireCustomer(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: '请先登录' });

  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.type !== 'customer') throw new Error('not customer token');
    req.customerId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}
