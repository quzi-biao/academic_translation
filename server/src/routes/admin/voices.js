/**
 * admin/voices.js — 管理员音色管理路由
 *
 * GET  /api/admin/voices              获取全部音色列表
 * POST /api/admin/voices/sync         立即触发 MiniMax 音色同步
 * PATCH /api/admin/voices/:id/toggle  切换启用/禁用
 * GET  /api/admin/voices/:id/preview  获取试听 URL（OSS → 合成 → 上传）
 */

import { Router }   from 'express';
import prisma       from '../../config/db.js';
import { requireAuth } from '../../middleware/auth.js';
import { syncVoices, DEFAULT_VOICE_ID } from '../../services/ai/voiceSync.js';
import { synthesizeSpeech } from '../../services/ai/tts.js';
import { uploadBuffer }     from '../../services/oss.js';

const router = Router();
router.use(requireAuth);

/** 试听固定文本 */
const PREVIEW_TEXT = '热带雨林是地球上最古老、结构最复杂且生物多样性最丰富的陆地生态系统';

// ── GET /api/admin/voices ──────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { type } = req.query;
    const where = type ? { voiceType: type } : {};
    const voices = await prisma.voice.findMany({
      where,
      // 启用的排在最前，同类型内按创建时间排序
      orderBy: [{ enabled: 'desc' }, { voiceType: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ voices });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/voices/sync ────────────────────────────────────
router.post('/sync', async (req, res, next) => {
  try {
    const total = await syncVoices();
    res.json({ success: true, total });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/admin/voices/:id/toggle ────────────────────────────
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const voice = await prisma.voice.findUnique({ where: { id } });
    if (!voice) return res.status(404).json({ error: '音色不存在' });

    // 默认音色不允许被禁用
    if (voice.voiceId === DEFAULT_VOICE_ID && voice.enabled) {
      return res.status(400).json({ error: '系统默认音色不可禁用' });
    }

    const updated = await prisma.voice.update({
      where: { id },
      data:  { enabled: !voice.enabled },
    });
    res.json({ voice: updated });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/voices/:id/preview ─────────────────────────────
router.get('/:id/preview', async (req, res, next) => {
  try {
    const { id } = req.params;
    const voice = await prisma.voice.findUnique({ where: { id } });
    if (!voice) return res.status(404).json({ error: '音色不存在' });

    // 已有试听 URL，直接返回
    if (voice.previewUrl) {
      return res.json({ url: voice.previewUrl });
    }

    // 合成试听音频
    const { totalBuffer } = await synthesizeSpeech(PREVIEW_TEXT, {
      voiceId: voice.voiceId,
    });

    // 上传 OSS（固定路径 voice-preview/{voiceId}.mp3）
    const ossKey = `voice-preview/${voice.voiceId}.mp3`;
    const url    = await uploadBuffer(totalBuffer, 'audio', 'mp3', 'system', ossKey);

    // 保存 URL 到 DB
    await prisma.voice.update({ where: { id }, data: { previewUrl: url } });

    res.json({ url });
  } catch (err) {
    next(err);
  }
});

export default router;
