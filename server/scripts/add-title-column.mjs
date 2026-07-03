import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 1. 加列（幂等）
await prisma.$executeRawUnsafe(`ALTER TABLE pages ADD COLUMN IF NOT EXISTS title TEXT`);
console.log('✅ 列 title 已添加（或已存在）');

// 2. 验证
const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as n FROM pages WHERE title IS NULL`);
console.log(`📋 title 为空的页面数: ${rows[0].n}`);

await prisma.$disconnect();
