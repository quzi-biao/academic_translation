/**
 * imageUtils.js — AI 服务共享图片工具
 *
 * 主要功能：下载 OSS 图片 + sharp 压缩 → base64 data URL
 * 压缩目标：≤ 1024px 宽，JPEG quality 80，payload < 200KB
 * 大幅降低 AI API 请求 payload 大小，从 ~1.4MB 缩到 ~150KB（约 10x 加速）
 */
import sharp from 'sharp';

/** 压缩后最大宽度（px）；足够 AI 视觉理解，远小于原始大图 */
const MAX_WIDTH  = 1024;
/** JPEG 压缩质量（0-100） */
const JPEG_QUALITY = 80;

/**
 * 下载图片并用 sharp 压缩后返回 base64 data URL
 * 若图片宽度 ≤ MAX_WIDTH 则不放大，只压缩质量。
 *
 * @param {string} imageUrl  公开可访问的图片 URL（OSS 等）
 * @returns {Promise<string>} data:image/jpeg;base64,{base64}
 */
export async function fetchAndCompressImage(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`图片下载失败 (${res.status})`);

  const rawBuffer = Buffer.from(await res.arrayBuffer());

  // sharp 压缩：等比缩放到 ≤ MAX_WIDTH，不放大小图，输出 JPEG
  const compressed = await sharp(rawBuffer)
    .resize(MAX_WIDTH, null, { withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return `data:image/jpeg;base64,${compressed.toString('base64')}`;
}

/**
 * 将已有 base64 data URL 用 sharp 压缩
 * 用于已经是 data URL 的情况（如前端裁剪图）
 *
 * @param {string} dataUrl  data:image/...;base64,...
 * @returns {Promise<string>} 压缩后的 data:image/jpeg;base64,...
 */
export async function compressDataUrl(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  const b64      = dataUrl.slice(commaIdx + 1);
  const rawBuffer = Buffer.from(b64, 'base64');

  const compressed = await sharp(rawBuffer)
    .resize(MAX_WIDTH, null, { withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return `data:image/jpeg;base64,${compressed.toString('base64')}`;
}
