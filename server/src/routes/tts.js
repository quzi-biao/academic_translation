/**
 * TTS 路由（流式合成 + 分段 OSS 缓存，支持分段命中）
 *
 * GET  /api/tts/page/:pageId?lang=zh
 *   → 检查缓存（contentMd5 对比）
 *   → { cached: true,  complete: bool, segments: [{index,url,duration}], totalDuration }
 *   → { cached: false }
 *
 * POST /api/tts/page/:pageId?lang=zh
 *   → 流式合成 audio/mpeg（边合成边推前端）
 *   → 合成前创建 AudioMaster（isComplete=false）
 *   → 每段 is_final 后：立即写 AudioSegment（真实 masterId）
 *   → 全部完成后：更新 AudioMaster.isComplete=true + totalSeconds
 *
 * POST /api/tts（纯文本，调试，无缓存）
 */

import crypto     from 'crypto';
import { Router }  from 'express';
import prisma      from '../config/db.js';
import { requireAuth }      from '../middleware/auth.js';
import { synthesizeSpeech }        from '../services/ai/tts.js';
import { uploadBuffer }             from '../services/oss.js';
import { generatePageExplanation } from '../services/ai/explanation.js';
import { requirePoints, deductPoints, getPointCost } from '../services/points.js';

const router = Router();
router.use(requireAuth);

/** 计算字符串 MD5 */
const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');

/**
 * book 归属查询，兼容 deviceId（设备Token）和 userId（旧用户Token）
 * @param {import('express').Request} req
 */
function bookFilter(req) {
  if (req.deviceId) return { deviceId: req.deviceId };
  return { userId: req.user.id };
}

/** 获取当前用户/设备 ID（用于 OSS 上传路径） */
function getOwnerId(req) {
  return req.deviceId || req.user?.id || 'unknown';
}

/** 设置流式响应头 */
const setStreamHeaders = (res) =>
  res.set({
    'Content-Type':      'audio/mpeg',
    'Cache-Control':     'no-store',
    'X-Accel-Buffering': 'no',
  });

// ---------------------------------------------------------------------------
// GET /api/tts/page/:pageId  —— 缓存命中检查（支持分段命中）
// ---------------------------------------------------------------------------
router.get('/page/:pageId', async (req, res, next) => {
  try {
    const { lang = 'zh' } = req.query;
    const { pageId } = req.params;

    const exp = await prisma.pageExplanation.findUnique({
      where: { pageId_language: { pageId, language: lang } },
    });
    if (!exp) return res.json({ cached: false });

    const contentMd5 = md5(exp.content);

    // 获取设备音色
    let voiceId = 'Chinese (Mandarin)_Lyrical_Voice';
    if (req.deviceId) {
      const device = await prisma.device.findUnique({ where: { id: req.deviceId }, select: { voiceId: true } });
      if (device?.voiceId) {
        voiceId = device.voiceId;
      } else {
        const firstEnabled = await prisma.voice.findFirst({ where: { enabled: true }, orderBy: { createdAt: 'asc' } });
        if (firstEnabled) voiceId = firstEnabled.voiceId;
      }
    }

    const master = await prisma.audioMaster.findUnique({
      where:   { sourceType_sourceId_language_voiceId: { sourceType: 'page', sourceId: pageId, language: lang, voiceId } },
      include: { segments: { orderBy: { segmentIndex: 'asc' } } },
    });

    // 未命中 或 内容已变更（MD5 不一致）
    if (!master || master.contentMd5 !== contentMd5 || master.segments.length === 0) {
      return res.json({ cached: false });
    }

    // 分段命中：返回已缓存的段（可能是全部，也可能是前 N 段）
    return res.json({
      cached:        true,
      complete:      master.isComplete,
      totalDuration: master.totalSeconds,
      segments:      master.segments.map((s) => ({
        index:    s.segmentIndex,
        url:      s.ossUrl,
        duration: s.durationSeconds,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/tts/page/:pageId  —— 流式合成 + 逐段写缓存 (支持 triggerOnly)
// ---------------------------------------------------------------------------
router.post('/page/:pageId', async (req, res, next) => {
  try {
    const { lang = 'zh' } = req.query;
    const triggerOnly = req.query.triggerOnly === '1' || req.query.triggerOnly === 'true';
    const { pageId } = req.params;

    const page = await prisma.page.findFirst({
      where:   { id: pageId, book: bookFilter(req) },
      include: { explanations: { where: { language: lang } }, book: true },
    });
    if (!page) return res.status(404).json({ error: '页不存在' });

    // 点数检查（仅设备 Token）
    if (!await requirePoints(req.deviceId, res)) return;

    let text;
    if (page.explanations.length > 0) {
      // 已有解读，直接使用
      text = page.explanations[0].content;
    } else {
      // 无解读 → 自动生成（与 GET /pages/:id/explanation 逻辑一致）
      text = await generatePageExplanation(page.imageUrl, page.prompt || '', lang);
      await prisma.pageExplanation.create({
        data: { pageId, language: lang, content: text, deviceId: req.deviceId || null },
      });
    }

    const contentMd5 = md5(text);

    // 获取设备绑定的音色（null 时取第一个启用音色或默认值）
    let voiceId = 'Chinese (Mandarin)_Lyrical_Voice';
    if (req.deviceId) {
      const device = await prisma.device.findUnique({ where: { id: req.deviceId }, select: { voiceId: true } });
      if (device?.voiceId) {
        voiceId = device.voiceId;
      } else {
        const firstEnabled = await prisma.voice.findFirst({ where: { enabled: true }, orderBy: { createdAt: 'asc' } });
        if (firstEnabled) voiceId = firstEnabled.voiceId;
      }
    }

    if (!triggerOnly) {
      setStreamHeaders(res);
    } else {
      res.json({ started: true });
    }

    // ── 预先创建（或重置）AudioMaster，isComplete=false ──
    // 这样合成中途如果中断，已完成的段也能被下次命中
    let master = null;
    try {
      master = await prisma.audioMaster.upsert({
        where:  { sourceType_sourceId_language_voiceId: { sourceType: 'page', sourceId: pageId, language: lang, voiceId } },
        create: { sourceType: 'page', sourceId: pageId, language: lang, voiceId, contentMd5, isComplete: false, segmentCount: 0, deviceId: req.deviceId || null },
        update: { contentMd5, isComplete: false, totalSeconds: null },
      });

      // 如果是内容变更导致的重新合成，删除旧分段
      await prisma.audioSegment.deleteMany({ where: { masterId: master.id } });
    } catch (dbErr) {
      console.error('[TTS] 创建 AudioMaster 失败:', dbErr);
      // DB 出错不阻断合成流程，只是无法缓存
    }

    let totalSeconds = 0;

    const { textChunks } = await synthesizeSpeech(text, {
      voiceId,
      // 每个原始音频包立即推给前端 (仅在非 triggerOnly 模式)
      onChunk: (buf) => {
        if (!triggerOnly && !res.writableEnded) res.write(buf);
      },

      // 每段完成：立即异步写 AudioSegment（真实 masterId）
      onSegmentDone: (idx, textChunk, segBuf, durationSec) => {
        totalSeconds += durationSec;
        if (!master) return;

        uploadBuffer(segBuf, 'audio', 'mp3', getOwnerId(req))
          .then((ossUrl) =>
            prisma.audioSegment.create({
              data: {
                masterId:        master.id,   // ← 真实 ID
                segmentIndex:    idx,
                textChunk,
                ossUrl,
                durationSeconds: durationSec,
              },
            })
          )
          .then(() => console.log(`[TTS] 段 ${idx + 1} 已缓存`))
          .catch((err) => console.error(`[TTS] 段 ${idx} 缓存失败:`, err));
      },
    });

    // 流式响应结束 (非 triggerOnly)
    if (!triggerOnly && !res.writableEnded) res.end();

    // 全部段写完后，标记主记录为完成
    if (master) {
      prisma.audioMaster.update({
        where: { id: master.id },
        data:  { isComplete: true, totalSeconds, segmentCount: textChunks.length },
      })
        .then(() => {
          console.log(`[TTS] 缓存完成 page:${pageId}，共 ${textChunks.length} 段，${totalSeconds.toFixed(1)}s`);
          // 按实际时长异步扣点
          if (req.deviceId && totalSeconds > 0) {
            getPointCost('points_per_tts_min', 5).then((costPerMin) => {
              const cost = Math.ceil(totalSeconds / 60) * costPerMin;
              return deductPoints(req.deviceId, -Math.round(cost), 'tts', `TTS 页面 ${totalSeconds.toFixed(0)}s`);
            }).catch(() => {});
          }
        })
        .catch((err) => console.error('[TTS] 更新 AudioMaster 失败:', err));
    }
  } catch (err) {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /api/tts  —— 纯文本合成（调试，无缓存）
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text 不能为空' });

    setStreamHeaders(res);

    await synthesizeSpeech(text.trim(), {
      onChunk: (buf) => { if (!res.writableEnded) res.write(buf); },
    });

    if (!res.writableEnded) res.end();
  } catch (err) {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  }
});

// ---------------------------------------------------------------------------
// 区域解读（Annotation）TTS：公共缓存逻辑提取
// ---------------------------------------------------------------------------

/**
 * 通用缓存查询（page 和 annotation 共用逻辑）
 * @param {string} sourceType 'page' | 'annotation'
 * @param {string} sourceId
 * @param {string} text       原始文本（用于计算 MD5）
 * @param {string} voiceId    音色 ID
 * @returns {Promise<{cached,complete?,segments?,totalDuration?}>}
 */
async function queryCache(sourceType, sourceId, text, voiceId = 'Chinese (Mandarin)_Lyrical_Voice') {
  const contentMd5 = md5(text);
  const master = await prisma.audioMaster.findUnique({
    where:   { sourceType_sourceId_language_voiceId: { sourceType, sourceId, language: 'zh', voiceId } },
    include: { segments: { orderBy: { segmentIndex: 'asc' } } },
  });
  if (!master || master.contentMd5 !== contentMd5 || master.segments.length === 0) {
    return { cached: false };
  }
  return {
    cached:        true,
    complete:      master.isComplete,
    totalDuration: master.totalSeconds,
    segments:      master.segments.map((s) => ({
      index:    s.segmentIndex,
      url:      s.ossUrl,
      duration: s.durationSeconds,
    })),
  };
}

/**
 * 通用流式合成 + 缓存写入
 * @param {object} opts { sourceType, sourceId, text, userId, deviceId, voiceId, res, triggerOnly }
 */
async function synthAndCache({ sourceType, sourceId, text, userId, deviceId, voiceId = 'Chinese (Mandarin)_Lyrical_Voice', res, triggerOnly }) {
  if (!triggerOnly) {
    setStreamHeaders(res);
  } else {
    res.json({ started: true });
  }

  const contentMd5 = md5(text);

  let master = null;
  try {
    master = await prisma.audioMaster.upsert({
      where:  { sourceType_sourceId_language_voiceId: { sourceType, sourceId, language: 'zh', voiceId } },
      create: { sourceType, sourceId, language: 'zh', voiceId, contentMd5, isComplete: false, segmentCount: 0, deviceId: deviceId || null },
      update: { contentMd5, isComplete: false, totalSeconds: null },
    });
    await prisma.audioSegment.deleteMany({ where: { masterId: master.id } });
  } catch (err) {
    console.error('[TTS] 创建 AudioMaster 失败:', err);
  }

  let totalSeconds = 0;

  const { textChunks } = await synthesizeSpeech(text, {
    voiceId,
    onChunk: (buf) => { if (!triggerOnly && !res.writableEnded) res.write(buf); },
    onSegmentDone: (idx, textChunk, segBuf, durationSec) => {
      totalSeconds += durationSec;
      if (!master) return;
      uploadBuffer(segBuf, 'audio', 'mp3', userId)
        .then((ossUrl) =>
          prisma.audioSegment.create({
            data: { masterId: master.id, segmentIndex: idx, textChunk, ossUrl, durationSeconds: durationSec },
          })
        )
        .then(() => console.log(`[TTS] ${sourceType}:${sourceId} 段 ${idx + 1} 已缓存`))
        .catch((err) => console.error(`[TTS] 段 ${idx} 缓存失败:`, err));
    },
  });

  if (!triggerOnly && !res.writableEnded) res.end();

  if (master) {
    prisma.audioMaster.update({
      where: { id: master.id },
      data:  { isComplete: true, totalSeconds, segmentCount: textChunks.length },
    })
      .then(() => {
        console.log(`[TTS] 缓存完成 ${sourceType}:${sourceId}，${textChunks.length} 段，${totalSeconds.toFixed(1)}s`);
        // 按实际时长异步扣点
        if (deviceId && totalSeconds > 0) {
          getPointCost('points_per_tts_min', 5).then((costPerMin) => {
            const cost = Math.ceil(totalSeconds / 60) * costPerMin;
            return deductPoints(deviceId, -Math.round(cost), 'tts', `TTS ${sourceType} ${totalSeconds.toFixed(0)}s`);
          }).catch(() => {});
        }
      })
      .catch((err) => console.error('[TTS] 更新 AudioMaster 失败:', err));
  }
}

// ---------------------------------------------------------------------------
// GET /api/tts/annotation/:annotationId  —— 缓存检查
// ---------------------------------------------------------------------------
router.get('/annotation/:annotationId', async (req, res, next) => {
  try {
    const { annotationId } = req.params;

    const ann = await prisma.annotation.findFirst({
      where: { id: annotationId, page: { book: bookFilter(req) } },
    });
    if (!ann) return res.status(404).json({ error: '标注不存在' });
    if (!ann.explanation) return res.json({ cached: false });

    // 获取设备音色
    let voiceId = 'Chinese (Mandarin)_Lyrical_Voice';
    if (req.deviceId) {
      const device = await prisma.device.findUnique({ where: { id: req.deviceId }, select: { voiceId: true } });
      if (device?.voiceId) {
        voiceId = device.voiceId;
      } else {
        const firstEnabled = await prisma.voice.findFirst({ where: { enabled: true }, orderBy: { createdAt: 'asc' } });
        if (firstEnabled) voiceId = firstEnabled.voiceId;
      }
    }

    const result = await queryCache('annotation', annotationId, ann.explanation, voiceId);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/tts/annotation/:annotationId  —— 流式合成 + 分段缓存
// ---------------------------------------------------------------------------
router.post('/annotation/:annotationId', async (req, res, next) => {
  try {
    const { annotationId } = req.params;

    const ann = await prisma.annotation.findFirst({
      where: { id: annotationId, page: { book: bookFilter(req) } },
    });
    if (!ann)             return res.status(404).json({ error: '标注不存在' });
    if (!ann.explanation) return res.status(400).json({ error: '标注暂无解读内容' });

    // 点数检查（仅设备 Token）
    if (!await requirePoints(req.deviceId, res)) return;

    // 获取设备音色
    let voiceId = 'Chinese (Mandarin)_Lyrical_Voice';
    if (req.deviceId) {
      const device = await prisma.device.findUnique({ where: { id: req.deviceId }, select: { voiceId: true } });
      if (device?.voiceId) {
        voiceId = device.voiceId;
      } else {
        const firstEnabled = await prisma.voice.findFirst({ where: { enabled: true }, orderBy: { createdAt: 'asc' } });
        if (firstEnabled) voiceId = firstEnabled.voiceId;
      }
    }

    await synthAndCache({
      sourceType: 'annotation',
      sourceId:   annotationId,
      text:       ann.explanation,
      userId:     getOwnerId(req),
      deviceId:   req.deviceId || null,
      voiceId,
      res,
      triggerOnly: req.query.triggerOnly === '1' || req.query.triggerOnly === 'true',
    });
  } catch (err) {
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  }
});

export default router;
