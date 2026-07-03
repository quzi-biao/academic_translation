/**
 * voiceSync.js — MiniMax 音色同步服务
 *
 * 职责：
 *  1. 调用 MiniMax GET /v1/get_voice 获取全部类型音色
 *  2. upsert 到本地 voices 表
 *  3. 首次同步时，自动将前 5 个 system 音色设为 enabled=true
 *  4. 导出 syncVoices() 供启动和定时任务调用
 */

import prisma from '../../config/db.js';

const MINIMAX_KEY       = process.env.MINIMAX_API_KEY;
const MINIMAX_VOICE_URL = 'https://api.minimaxi.com/v1/get_voice';
/** 系统默认音色 ID，始终保持启用状态，不允许被禁用 */
export const DEFAULT_VOICE_ID = 'Chinese (Mandarin)_Lyrical_Voice';

/**
 * 从 MiniMax API 拉取所有音色并同步到 DB
 * @returns {Promise<number>} 同步的音色总数
 */
export async function syncVoices() {
  if (!MINIMAX_KEY) {
    console.warn('[voiceSync] MINIMAX_API_KEY 未配置，跳过音色同步');
    return 0;
  }

  console.log('[voiceSync] 开始同步 MiniMax 音色...');

  let data;
  try {
    const res = await fetch(MINIMAX_VOICE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ voice_type: 'all' }),
    });
    data = await res.json();
  } catch (err) {
    console.error('[voiceSync] 请求 MiniMax 失败:', err.message);
    throw err;
  }

  if (data.base_resp?.status_code !== 0) {
    const msg = data.base_resp?.status_msg || '未知错误';
    console.error('[voiceSync] MiniMax 返回错误:', msg);
    throw new Error(`MiniMax 音色 API 错误: ${msg}`);
  }

  const now = new Date();
  let total = 0;

  /** 批量 upsert 指定类型的音色列表 */
  const upsertList = async (list, voiceType) => {
    if (!list?.length) return;
    for (const item of list) {
      const voiceId = item.voice_id;
      if (!voiceId) continue;

      const desc = Array.isArray(item.description)
        ? item.description.join(' ')
        : (item.description || null);

      await prisma.voice.upsert({
        where:  { voiceId },
        create: {
          voiceId,
          voiceName:   item.voice_name || null,
          description: desc,
          voiceType,
          enabled:     false,
          syncedAt:    now,
        },
        update: {
          voiceName:   item.voice_name || null,
          description: desc,
          voiceType,
          syncedAt:    now,
        },
      });
      total++;
    }
  };

  await upsertList(data.system_voice,     'system');
  await upsertList(data.voice_cloning,    'voice_cloning');
  await upsertList(data.voice_generation, 'voice_generation');

  // 首次同步：如果没有任何启用的音色，自动启用默认音色 + 前几个系统音色
  const enabledCount = await prisma.voice.count({ where: { enabled: true } });
  if (enabledCount === 0) {
    // 先尝试启用默认音色
    const defaultVoice = await prisma.voice.findUnique({
      where: { voiceId: DEFAULT_VOICE_ID },
    });
    if (defaultVoice) {
      await prisma.voice.update({ where: { id: defaultVoice.id }, data: { enabled: true } });
    }
    // 再补满前 5 个系统音色（跳过已启用的）
    const systemVoices = await prisma.voice.findMany({
      where:   { voiceType: 'system', enabled: false },
      orderBy: { createdAt: 'asc' },
      take:    5,
    });
    for (const v of systemVoices) {
      await prisma.voice.update({ where: { id: v.id }, data: { enabled: true } });
    }
    console.log(`[voiceSync] 首次同步，自动启用默认音色及系统音色`);
  } else {
    // 非首次：确保默认音色始终启用
    await prisma.voice.updateMany({
      where: { voiceId: DEFAULT_VOICE_ID },
      data:  { enabled: true },
    });
  }

  console.log(`[voiceSync] 同步完成，共 ${total} 个音色`);
  return total;
}

/**
 * 启动定时同步（每 24h 执行一次）
 * 应在 server/src/index.js 中调用一次
 */
export function startVoiceSyncJob() {
  // 启动时立即同步一次
  syncVoices().catch((err) => console.error('[voiceSync] 启动同步失败:', err.message));

  // 每 24h 同步一次
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    syncVoices().catch((err) => console.error('[voiceSync] 定时同步失败:', err.message));
  }, INTERVAL_MS);
}
