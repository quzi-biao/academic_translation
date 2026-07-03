import OSS from 'ali-oss';
import { randomUUID } from 'crypto';

const client = new OSS({
  endpoint:        process.env.OSS_ENDPOINT,
  accessKeyId:     process.env.OSS_KEY_ID,
  accessKeySecret: process.env.OSS_KEY_SECRET,
  bucket:          process.env.OSS_BUCKET,
  timeout:         '300s',   // 默认超时 5 分钟（ali-oss 默认 60s 对大图不够）
});

const FOLDER = process.env.OSS_FOLDER || 'flipbook';

/**
 * 将 base64 图片上传到 OSS
 * @param {string} base64  data URL 或纯 base64 字符串
 * @param {string} subdir  子目录：'covers' | 'pages' | 'selections'
 * @param {string} [userId]
 * @returns {Promise<string>} 公开访问的 OSS URL
 */
export async function uploadBase64(base64, subdir = 'pages', userId = 'anon') {
  // 解析 data URL
  let mimeType = 'image/png';
  let b64Data  = base64;

  if (base64.startsWith('data:')) {
    const commaIdx = base64.indexOf(',');
    const meta = base64.slice(0, commaIdx);
    mimeType   = meta.replace('data:', '').replace(';base64', '');
    b64Data    = base64.slice(commaIdx + 1);
  }

  const ext      = mimeType.split('/')[1] || 'png';
  const filename = `${randomUUID()}.${ext}`;
  const ossKey   = `${FOLDER}/${subdir}/${userId}/${filename}`;

  const buffer = Buffer.from(b64Data, 'base64');

  await client.put(ossKey, buffer, {
    timeout: 300000,            // 5 分钟，与 constructor timeout 对齐
    headers: {
      'Content-Type':       mimeType,
      'x-oss-object-acl':  'public-read',  // 对象公开可读，支持浏览器直接加载
    },
  });

  // 返回公开 URL
  const url = `https://${process.env.OSS_BUCKET}.${process.env.OSS_ENDPOINT}/${ossKey}`;
  return url;
}

/**
 * 从 URL 下载图片并上传到 OSS（用于外部图片 URL 归档）
 * @param {string} imageUrl  外部图片 URL
 * @param {string} subdir
 * @param {string} userId
 * @returns {Promise<string>} OSS URL
 */
export async function uploadFromUrl(imageUrl, subdir = 'pages', userId = 'anon') {
  const res    = await fetch(imageUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ct     = res.headers.get('content-type') || 'image/png';
  const ext    = ct.split('/')[1] || 'png';

  const filename = `${randomUUID()}.${ext}`;
  const ossKey   = `${FOLDER}/${subdir}/${userId}/${filename}`;

  await client.put(ossKey, buffer, {
    headers: {
      'Content-Type':      ct,
      'x-oss-object-acl': 'public-read',
    },
  });

  return `https://${process.env.OSS_BUCKET}.${process.env.OSS_ENDPOINT}/${ossKey}`;
}

/**
 * 直接将 Buffer 上传到 OSS（用于 TTS 音频等二进制内容）
 * @param {Buffer} buffer
 * @param {string} subdir         子目录，如 'audio'
 * @param {string} ext            文件扩展名，如 'mp3'
 * @param {string} [userId]
 * @param {string} [ossKeyOverride] 完整 OSS Key（不含 FOLDER 前缀），传入则忽略 subdir/ext/userId
 * @returns {Promise<string>} 公开访问的 OSS URL
 */
export async function uploadBuffer(buffer, subdir = 'audio', ext = 'mp3', userId = 'anon', ossKeyOverride = null) {
  const { randomUUID } = await import('crypto');
  const ossKey = ossKeyOverride
    ? `${FOLDER}/${ossKeyOverride}`
    : `${FOLDER}/${subdir}/${userId}/${randomUUID()}.${ext}`;

  const mimeMap  = { mp3: 'audio/mpeg', mp4: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav' };
  const mimeType = mimeMap[ext] || 'application/octet-stream';

  await client.put(ossKey, buffer, {
    timeout: 120000,
    headers: {
      'Content-Type':      mimeType,
      'x-oss-object-acl': 'public-read',
    },
  });

  return `https://${process.env.OSS_BUCKET}.${process.env.OSS_ENDPOINT}/${ossKey}`;
}
