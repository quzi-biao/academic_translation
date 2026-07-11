import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/db.js';

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      result[key] = 'true';
      continue;
    }
    result[key] = next;
    i += 1;
  }
  return result;
}

function printUsage() {
  console.log(`
用法：
  npm run admin:init -- --username admin --email admin@example.com --password your-password --role superadmin

也可以使用环境变量：
  ADMIN_USERNAME
  ADMIN_EMAIL
  ADMIN_PASSWORD
  ADMIN_ROLE

默认值：
  username = admin
  email    = admin@example.com
  role     = superadmin
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const username = String(args.username || process.env.ADMIN_USERNAME || 'admin').trim();
  const email = String(args.email || process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
  const password = String(args.password || process.env.ADMIN_PASSWORD || '').trim();
  const role = String(args.role || process.env.ADMIN_ROLE || 'superadmin').trim();

  if (!username) {
    throw new Error('缺少管理员用户名，请通过 --username 或 ADMIN_USERNAME 提供');
  }
  if (!email) {
    throw new Error('缺少管理员邮箱，请通过 --email 或 ADMIN_EMAIL 提供');
  }
  if (!password) {
    throw new Error('缺少管理员密码，请通过 --password 或 ADMIN_PASSWORD 提供');
  }
  if (!['superadmin', 'manager'].includes(role)) {
    throw new Error('管理员角色仅支持 superadmin 或 manager');
  }

  const sameEmailUser = await prisma.user.findUnique({ where: { email } });
  if (sameEmailUser && sameEmailUser.username !== username) {
    throw new Error(`邮箱 ${email} 已被用户 ${sameEmailUser.username} 使用，请更换邮箱或用户名`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existed = await prisma.user.findUnique({ where: { username } });

  const user = await prisma.user.upsert({
    where: { username },
    update: {
      email,
      passwordHash,
      role,
    },
    create: {
      username,
      email,
      passwordHash,
      role,
    },
  });

  console.log(existed ? '管理员已更新。' : '管理员已创建。');
  console.log(`username: ${user.username}`);
  console.log(`email:    ${user.email}`);
  console.log(`role:     ${user.role}`);
  console.log('');
  console.log('现在可以使用该账号登录后台。');
}

main()
  .catch((err) => {
    console.error('[init-admin]', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
