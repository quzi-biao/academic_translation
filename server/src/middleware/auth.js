import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'flipbook-jwt-secret-2024';

/**
 * 统一认证中间件（同时支持 User JWT 和 Device JWT）
 *
 * User JWT payload:   { id, username, email, ... }  → 挂到 req.user
 * Device JWT payload: { sub: deviceId, type: 'device' } → 挂到 req.deviceId
 *
 * 两种 Token 均可通过此中间件，下游路由按需使用 req.user 或 req.deviceId。
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未认证，请先登录或注册设备' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, SECRET);

    if (payload.type === 'device') {
      // 设备 Token
      req.deviceId = payload.sub;
      req.user = null;
    } else {
      // 用户 Token（原有格式）
      req.user = payload; // { id, username, email }
      req.deviceId = null;
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

/**
 * 仅允许 Admin/Manager 用户（非设备 Token）
 */
export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}
