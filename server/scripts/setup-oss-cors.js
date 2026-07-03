/**
 * 为 OSS bucket 设置 CORS 跨域规则
 * 允许浏览器直接加载 OSS 图片资源
 * 运行方式: node server/scripts/setup-oss-cors.js
 */
import 'dotenv/config';
import OSS from 'ali-oss';

const client = new OSS({
  region:          'oss-cn-hangzhou',
  accessKeyId:     process.env.OSS_KEY_ID,
  accessKeySecret: process.env.OSS_KEY_SECRET,
  bucket:          process.env.OSS_BUCKET,
});

const corsRules = [
  {
    allowedOrigin: ['*'],                              // 允许所有源（生产环境可改为具体域名）
    allowedMethod: ['GET', 'HEAD'],                   // 图片只需 GET/HEAD
    allowedHeader: ['*'],
    exposeHeader:  ['ETag', 'Content-Length'],
    maxAgeSeconds: '3600',
  },
];

async function main() {
  const bucket = process.env.OSS_BUCKET;
  console.log(`🔧 正在为 bucket "${bucket}" 设置 CORS 规则...`);

  await client.putBucketCORS(bucket, corsRules);

  console.log('✅ CORS 规则设置成功！');
  console.log('   AllowedOrigin: *');
  console.log('   AllowedMethod: GET, HEAD');
  console.log('   MaxAgeSeconds: 3600');

  // 读回来验证
  const { rules } = await client.getBucketCORS(bucket);
  console.log('\n📋 当前生效的 CORS 规则:');
  rules.forEach((r, i) => {
    console.log(`   [${i + 1}] origin=${r.allowedOrigin}  method=${r.allowedMethod}  age=${r.maxAgeSeconds}s`);
  });
}

main().catch((e) => {
  console.error('❌ 设置失败:', e.message);
  process.exit(1);
});
