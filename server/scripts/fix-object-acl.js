/**
 * 批量将 flipbook/ 目录下所有对象 ACL 设为 public-read
 * 修复已上传图片的 CORS 访问问题
 * 运行: node server/scripts/fix-object-acl.js
 */
import 'dotenv/config';
import OSS from 'ali-oss';

const client = new OSS({
  region:          'oss-cn-hangzhou',
  accessKeyId:     process.env.OSS_KEY_ID,
  accessKeySecret: process.env.OSS_KEY_SECRET,
  bucket:          process.env.OSS_BUCKET,
});

const FOLDER  = process.env.OSS_FOLDER || 'flipbook';
const BUCKET  = process.env.OSS_BUCKET;

async function fixAll() {
  console.log(`🔧 批量修复 ${BUCKET}/${FOLDER}/ 下所有对象 ACL → public-read\n`);
  let marker    = '';
  let total     = 0;
  let fixed     = 0;

  // 分页列出所有对象
  do {
    const result = await client.list({
      prefix:  `${FOLDER}/`,
      marker,
      'max-keys': 100,
    });

    const objects = result.objects || [];

    for (const obj of objects) {
      total++;
      try {
        await client.putACL(obj.name, 'public-read');
        fixed++;
        process.stdout.write(`\r  已处理: ${fixed}/${total}`);
      } catch (e) {
        console.warn(`\n  ⚠️  ${obj.name}: ${e.message}`);
      }
    }

    marker = result.nextMarker;
  } while (marker);

  console.log(`\n\n✅ 完成！共处理 ${fixed}/${total} 个对象。`);
}

fixAll().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
