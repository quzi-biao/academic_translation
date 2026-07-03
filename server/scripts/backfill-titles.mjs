/**
 * 全量重建所有页面标题（强制覆盖旧值）
 * - 重新从图片内容调 Gemini Vision 生成 4-15 字中文标题
 * - 失败则保留原 title 不改动
 *
 * 运行：docker exec flipbook sh -c "cd /app/server && node scripts/backfill-titles.mjs"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const GEMINI_BASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const VIS_MODEL   = 'gemini-2.5-flash';
const CONCURRENCY = 2;
const DELAY_MS    = 800;

async function generateTitleFromImage(imageUrl) {
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!imgRes.ok) throw new Error(`图片 HTTP ${imgRes.status}`);
  const buffer = await imgRes.arrayBuffer();
  if (buffer.byteLength < 100) throw new Error(`图片过小 (${buffer.byteLength}B)`);
  const b64 = Buffer.from(buffer).toString('base64');
  const mimeType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';

  const prompt =
    `观察这张图片，用2到15个汉字生成一个简洁精准的中文页面标题。\n` +
    `直接输出标题文字，不要加引号、序号或任何解释。`;

  const url = `${GEMINI_BASE}/models/${VIS_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      contents: [{ parts: [
        { inlineData: { mimeType, data: b64 } },
        { text: prompt },
      ]}],
      generationConfig: { maxOutputTokens: 60, temperature: 0.3 },
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `Gemini HTTP ${res.status}`);

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  // 按 Unicode 字符截断到 15 字
  const trimmed = [...raw].slice(0, 15).join('');
  if (trimmed.length < 2) throw new Error(`Gemini 返回太短: "${raw}"`);
  return trimmed;
}

async function batchProcess(items, fn, batchSize, delayMs) {
  let done = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(fn));
    done += batch.length;
    console.log(`  进度: ${done}/${items.length}`);
    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  console.log('🔍 查询所有有图片的页面…');

  // 查所有有图片的页面（强制全量重建）
  const pages = await prisma.$queryRawUnsafe(`
    SELECT id, "imageUrl" FROM pages
    WHERE "imageUrl" IS NOT NULL AND "imageUrl" != ''
    ORDER BY "createdAt" ASC
  `);

  console.log(`📋 共 ${pages.length} 个页面\n`);
  if (!pages.length) { console.log('无页面'); return; }

  let ok = 0, fail = 0;

  await batchProcess(pages, async (page) => {
    const shortId = page.id.slice(-8);
    try {
      const title = await generateTitleFromImage(page.imageUrl);
      await prisma.$executeRawUnsafe(
        `UPDATE pages SET title = $1 WHERE id = $2`,
        title, page.id
      );
      console.log(`  ✅ ${shortId} → ${title}`);
      ok++;
    } catch (e) {
      // 失败重试一次
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const title = await generateTitleFromImage(page.imageUrl);
        await prisma.$executeRawUnsafe(
          `UPDATE pages SET title = $1 WHERE id = $2`,
          title, page.id
        );
        console.log(`  ✅ ${shortId} [重试] → ${title}`);
        ok++;
      } catch (e2) {
        console.error(`  ❌ ${shortId} 失败: ${e2.message}`);
        fail++;
      }
    }
  }, CONCURRENCY, DELAY_MS);

  console.log(`\n🎉 完成！成功: ${ok}，失败: ${fail}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
