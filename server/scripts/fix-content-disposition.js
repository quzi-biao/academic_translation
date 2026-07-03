/**
 * 批量修复 OSS 历史对象的 Content-Disposition
 * 将 attachment（强制下载）改为 inline（浏览器直接显示）
 * 运行方式: cd server && node scripts/fix-content-disposition.js
 */
import 'dotenv/config';
import OSS from 'ali-oss';

const client = new OSS({
  region:          'oss-cn-hangzhou',
  accessKeyId:     process.env.OSS_KEY_ID,
  accessKeySecret: process.env.OSS_KEY_SECRET,
  bucket:          process.env.OSS_BUCKET,
});

const BUCKET = process.env.OSS_BUCKET;
const PREFIX = process.env.OSS_FOLDER || 'flipbook'; // 只处理 flipbook/ 目录下的对象

async function fixObject(key) {
  try {
    // 先获取当前 Content-Type
    const head = await client.head(key);
    const ct = head.res.headers['content-type'] || 'image/jpeg';

    // copy-in-place：复制到自身，覆盖 headers（OSS 支持此操作来修改 metadata）
    await client.copy(key, key, {
      headers: {
        'Content-Type':        ct,
        'Content-Disposition': 'inline',   // ← 核心修复：去掉 attachment
        'x-oss-object-acl':    'public-read',
        'x-oss-metadata-directive': 'REPLACE', // 强制替换所有 metadata
      },
    });
    return true;
  } catch (e) {
    console.error(`  ❌ 修复失败 [${key}]: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log(`🔍 扫描 bucket "${BUCKET}" 下 "${PREFIX}/" 目录...`);

  let continuationToken;
  let total = 0;
  let fixed = 0;

  do {
    const result = await client.listV2({
      prefix:             `${PREFIX}/`,
      'max-keys':         100,
      'continuation-token': continuationToken,
    });

    const objects = result.objects || [];
    console.log(`  找到 ${objects.length} 个对象（已处理 ${total} 个）`);

    for (const obj of objects) {
      process.stdout.write(`  修复: ${obj.name} ... `);
      const ok = await fixObject(obj.name);
      if (ok) {
        process.stdout.write('✅\n');
        fixed++;
      }
      total++;
    }

    continuationToken = result.nextContinuationToken;
  } while (continuationToken);

  console.log(`\n✅ 完成！共处理 ${total} 个对象，成功修复 ${fixed} 个`);
}

main().catch((e) => {
  console.error('❌ 脚本异常:', e.message);
  process.exit(1);
});
