import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const prisma = new PrismaClient();

async function main() {
  console.log('初始化闻一翻译种子数据...');
  const passwordHash = await bcrypt.hash('admin', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { role: 'superadmin' },
    create: { username: 'admin', email: 'admin@wenyi.local', passwordHash, role: 'superadmin' },
  });

  const configs = [
    ['init_points', '20'],
    ['POINTS_PER_YUAN', '100'],
    ['DIRECT_RECHARGE_MIN', '10'],
    ['DIRECT_RECHARGE_MAX', '2000'],
    ['points_per_1000_chars', '1'],
    ['translation_min_points', '1'],
  ];
  for (const [key, value] of configs) {
    await prisma.globalConfig.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  const plans = [
    { name: '体验包', price: 990, points: 1000, descriptionJson: JSON.stringify({ text: '适合体验短论文翻译。' }), sortOrder: 1 },
    { name: '标准包', price: 2990, points: 3500, descriptionJson: JSON.stringify({ text: '适合多篇论文翻译。' }), sortOrder: 2 },
    { name: '专业包', price: 9900, points: 13000, descriptionJson: JSON.stringify({ text: '适合高频学术阅读与翻译。' }), sortOrder: 3 },
  ];
  for (const plan of plans) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (!existing) await prisma.plan.create({ data: plan });
  }

  const agreements = [
    { name: 'terms_of_service', title: '闻一翻译用户协议', content: '请合理使用闻一翻译提供的学术文献翻译服务。' },
    { name: 'privacy_policy', title: '闻一翻译隐私政策', content: '我们会保护你的账号、订单和上传文档数据。' },
  ];
  for (const item of agreements) {
    await prisma.agreement.upsert({ where: { name: item.name }, update: {}, create: item });
  }
  console.log('完成。默认后台账号：admin / admin');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
