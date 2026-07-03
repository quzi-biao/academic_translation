import { PrismaClient } from '@prisma/client';

/**
 * Prisma 客户端单例（避免开发模式下多实例问题）
 * connection_limit=5      连接池上限，防止数据库连接数爆炸
 * connect_timeout=30      连接建立超时（秒）
 * pool_timeout=30         从池中获取连接的等待超时（秒）
 */
function buildDatasourceUrl() {
  const base = process.env.DATABASE_URL || '';
  // 避免重复追加参数
  if (base.includes('connection_limit=')) return base;
  const sep = base.includes('?') ? '&' : '?';
  return (
    `${base}${sep}` +
    'connection_limit=5' +
    '&connect_timeout=30' +
    '&pool_timeout=600' +       // 覆盖图生图最长等待（270s）
    '&socket_timeout=600' +     // 单次查询最长 600s
    '&keepalives=1' +           // 开启 TCP keepalive
    '&keepalives_idle=60' +     // 60s 无数据后发探针
    '&keepalives_interval=10' + // 探针间隔 10s
    '&keepalives_count=5'       // 探针失败 5 次才断开
  );
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  datasourceUrl: buildDatasourceUrl(),
});

export default prisma;
