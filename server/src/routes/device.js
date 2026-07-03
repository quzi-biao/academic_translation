/**
 * device.js — 设备注册、心跳、信息更新接口
 *
 * POST /api/device/register   设备首次注册或续签 Token
 * POST /api/device/heartbeat  心跳（需 DeviceToken）
 * GET  /api/device/info       获取当前设备信息（需 DeviceToken）
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { synthesizeSpeech } from '../services/ai/tts.js';
import { uploadBuffer }     from '../services/oss.js';

const router = express.Router();


const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'flipbook-jwt-secret-2024';

// 内存中维护心跳时间（生产可换 Redis）
// Map<deviceId, { lastBeat: number, sessionId: string }>
const heartbeatMap = new Map();
const OFFLINE_THRESHOLD_MS = 300_000; // 5分钟 未心跳视为离线

/**
 * 生成区块链地址格式的设备码
 * 格式：0x + 40位十六进制（类以太坊地址）
 * @returns {string}
 */
function generateDeviceCode() {
  return '0x' + crypto.randomBytes(20).toString('hex');
}

/**
 * 获取全局配置值
 * @param {string} key
 * @param {string} defaultVal
 * @returns {Promise<string>}
 */
async function getConfig(key, defaultVal = '') {
  const row = await prisma.globalConfig.findUnique({ where: { key } });
  return row?.value ?? defaultVal;
}

/**
 * POST /api/device/register
 * 设备启动时调用，指纹不存在则创建新设备并赠送初始点数，已存在则更新信息并续签 Token
 *
 * Body: { fingerprint, appVersion, deviceModel, osVersion }
 * Response: { token, device: { id, deviceCode, balance } }
 */
router.post('/register', async (req, res) => {
  const { fingerprint, appVersion, deviceModel, osVersion } = req.body;

  if (!fingerprint) {
    return res.status(400).json({ error: '缺少 fingerprint' });
  }

  try {
    let device = await prisma.device.findUnique({
      where: { fingerprint },
      include: { wallet: true },
    });

    if (!device) {
      // 新设备：创建 + 赠送初始点数
      const initPoints = parseInt(await getConfig('init_points', '100'), 10);
      const deviceCode = generateDeviceCode();

      device = await prisma.device.create({
        data: {
          fingerprint,
          deviceCode,
          appVersion,
          deviceModel,
          osVersion,
          ipAddress: req.ip,
          lastSeenAt: new Date(),
          wallet: {
            create: {
              balance: initPoints,
              ledger: {
                create: {
                  deviceId: '', // 先占位，下面更新
                  delta: initPoints,
                  balance: initPoints,
                  type: 'init',
                  reason: '新设备注册赠送初始点数',
                },
              },
            },
          },
        },
        include: { wallet: true },
      });

      // 回填 ledger.deviceId（Prisma 嵌套 create 时无法直接引用 parent id）
      await prisma.pointLedger.updateMany({
        where: { walletId: device.wallet.id, deviceId: '' },
        data: { deviceId: device.id },
      });
    } else {
      // 已有设备：更新硬件信息 + lastSeenAt
      device = await prisma.device.update({
        where: { id: device.id },
        data: {
          appVersion,
          deviceModel: deviceModel || device.deviceModel,
          osVersion: osVersion || device.osVersion,
          ipAddress: req.ip,
          lastSeenAt: new Date(),
        },
        include: { wallet: true },
      });
    }

    // 颁发 DeviceToken（7天有效期）
    const token = jwt.sign(
      { sub: device.id, type: 'device' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      device: {
        id: device.id,
        deviceCode: device.deviceCode,
        balance: device.wallet?.balance ?? 0,
      },
    });
  } catch (err) {
    console.error('[device/register]', err);
    res.status(500).json({ error: '注册失败' });
  }
});

/**
 * POST /api/device/heartbeat
 * App 每 10s 调用一次，维护在线状态和会话时长
 * Header: Authorization: Bearer <DeviceToken>
 */
router.post('/heartbeat', requireDeviceToken, async (req, res) => {
  const deviceId   = req.deviceId;
  const now        = Date.now();
  const appVersion = req.body?.appVersion || null; // 前端上报当前版本

  const prev = heartbeatMap.get(deviceId);

  if (!prev) {
    // 新会话前，先结束该设备所有未结束的历史会话（如服务器重启导致的遗留状态）
    await prisma.deviceSession.updateMany({
      where: { deviceId, endAt: null },
      data: { endAt: new Date() }
    });

    // 新会话：创建 DeviceSession
    const session = await prisma.deviceSession.create({
      data: { deviceId, startAt: new Date() },
    });
    heartbeatMap.set(deviceId, { lastBeat: now, sessionId: session.id, sessionStartTs: now });
  } else {
    const elapsed = now - prev.lastBeat;
    if (elapsed > OFFLINE_THRESHOLD_MS) {
      // 断线重连：关闭旧会话，开新会话
      await prisma.deviceSession.update({
        where: { id: prev.sessionId },
        data: {
          endAt: new Date(prev.lastBeat),
          durationSeconds: Math.floor((prev.lastBeat - (prev.sessionStartTs || prev.lastBeat)) / 1000),
        },
      });
      const session = await prisma.deviceSession.create({
        data: { deviceId, startAt: new Date() },
      });
      heartbeatMap.set(deviceId, { lastBeat: now, sessionId: session.id, sessionStartTs: now });
    } else {
      // 正常续跳：更新内存时间戳
      heartbeatMap.set(deviceId, { ...prev, lastBeat: now });
    }
  }

  // 更新 lastSeenAt + appVersion（异步，不阻塞响应）
  prisma.device.update({
    where: { id: deviceId },
    data:  {
      lastSeenAt: new Date(),
      ipAddress: req.ip,
      ...(appVersion ? { appVersion } : {}),
    },
  }).catch(() => {});

  res.json({ ok: true, ts: now });
});

/**
 * GET /api/device/info
 * 获取当前设备信息（版本检查、点数余额）
 */
router.get('/info', requireDeviceToken, async (req, res) => {
  try {
    const device = await prisma.device.findUnique({
      where: { id: req.deviceId },
      include: {
        wallet: true,
        _count: { select: { books: true, pages: true } },
      },
    });

    if (!device) return res.status(404).json({ error: '设备不存在' });

    // 获取当前全局版本 & 设备专属版本
    const [globalVersion, targetVersion] = await Promise.all([
      prisma.appVersion.findFirst({ where: { isCurrent: true } }),
      device.targetVersionId
        ? prisma.appVersion.findUnique({ where: { id: device.targetVersionId } })
        : null,
    ]);

    const latestVersion = targetVersion || globalVersion;

    res.json({
      device: {
        id: device.id,
        deviceCode: device.deviceCode,
        appVersion: device.appVersion,
        balance: device.wallet?.balance ?? 0,
        bookCount: device._count.books,
        pageCount: device._count.pages,
      },
      latestVersion: latestVersion
        ? {
            versionCode:  latestVersion.versionCode,
            versionName:  latestVersion.versionName,
            apkUrl:       latestVersion.apkUrl,
            changelog:    latestVersion.changelog,
            forceUpgrade: latestVersion.forceUpgrade,  // ← OTA 强制升级标记
          }
        : null,
    });
  } catch (err) {
    console.error('[device/info]', err);
    res.status(500).json({ error: '获取设备信息失败' });
  }
});

/**
 * POST /api/device/factory-reset
 * 恢复出厂设置：删除该设备所有云端数据
 * 删除书本后，Prisma 级联删除：pages → annotations / pageExplanations
 * Header: Authorization: Bearer <DeviceToken>
 */
router.post('/factory-reset', requireDeviceToken, async (req, res, next) => {
  try {
    const { count } = await prisma.book.deleteMany({
      where: { deviceId: req.deviceId },
    });
    console.log(`[device/factory-reset] deviceId=${req.deviceId} deletedBooks=${count}`);
    res.json({ success: true, deletedBooks: count });
  } catch (err) {
    next(err);
  }
});

/**
 * DeviceToken 校验中间件
 * 解析 Authorization: Bearer <token>，将 deviceId 挂到 req.deviceId
 */
function requireDeviceToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ error: '未提供 Token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'device') throw new Error('not device token');
    req.deviceId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

/**
 * 查询某设备当前是否在线
 * @param {string} deviceId
 * @returns {boolean}
 */
function isDeviceOnline(deviceId) {
  const entry = heartbeatMap.get(deviceId);
  if (!entry) return false;
  return Date.now() - entry.lastBeat < OFFLINE_THRESHOLD_MS;
}

/**
 * 获取设备当前会话已在线时长（秒）
 * @param {string} deviceId
 * @returns {number}
 */
function getSessionSeconds(deviceId) {
  const entry = heartbeatMap.get(deviceId);
  if (!entry || !isDeviceOnline(deviceId)) return 0;
  const startTs = entry.sessionStartTs || entry.lastBeat;
  return Math.floor((Date.now() - startTs) / 1000);
}

export default router;
export { requireDeviceToken, isDeviceOnline, getSessionSeconds };

// ─────────────────────────────────────────────────────────────────
// 音色路由（需要 DeviceToken）
// ─────────────────────────────────────────────────────────────────
const PREVIEW_TEXT = '热带雨林是地球上最古老、结构最复杂且生物多样性最丰富的陆地生态系统';

/**
 * GET /api/device/voices
 * 返回已启用的音色列表（设备选音色用）
 */
router.get('/voices', requireDeviceToken, async (req, res, next) => {
  try {
    const voices = await prisma.voice.findMany({
      where:   { enabled: true },
      orderBy: [{ voiceType: 'asc' }, { createdAt: 'asc' }],
      select:  { id: true, voiceId: true, voiceName: true, description: true, voiceType: true, previewUrl: true },
    });
    // 同时返回设备当前绑定的 voiceId
    const device = await prisma.device.findUnique({
      where:  { id: req.deviceId },
      select: { voiceId: true },
    });
    res.json({ voices, currentVoiceId: device?.voiceId ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/device/settings/voice
 * 设备绑定音色 { voiceId: string }
 */
router.patch('/settings/voice', requireDeviceToken, async (req, res, next) => {
  try {
    const { voiceId } = req.body;
    if (!voiceId) return res.status(400).json({ error: '缺少 voiceId' });

    // 确认音色存在且已启用
    const voice = await prisma.voice.findFirst({ where: { voiceId, enabled: true } });
    if (!voice) return res.status(404).json({ error: '音色不存在或未启用' });

    await prisma.device.update({
      where: { id: req.deviceId },
      data:  { voiceId },
    });
    res.json({ success: true, voiceId });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/device/voices/:voiceId/preview
 * 获取试听 URL（优先 OSS，无则合成后上传）
 */
router.get('/voices/:voiceId/preview', requireDeviceToken, async (req, res, next) => {
  try {
    const { voiceId } = req.params;
    const voice = await prisma.voice.findUnique({ where: { voiceId } });
    if (!voice) return res.status(404).json({ error: '音色不存在' });

    // 已有试听 URL
    if (voice.previewUrl) return res.json({ url: voice.previewUrl });

    // 合成并上传 OSS
    const { totalBuffer } = await synthesizeSpeech(PREVIEW_TEXT, { voiceId });
    const url = await uploadBuffer(totalBuffer, 'audio', 'mp3', 'system', `voice-preview/${voiceId}.mp3`);
    await prisma.voice.update({ where: { id: voice.id }, data: { previewUrl: url } });

    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────
// 提示词风格路由（需要 DeviceToken）
// ─────────────────────────────────────────────────────────────────

/**
 * GET /api/device/prompt-styles
 * 返回已启用的提示词风格列表
 */
router.get('/prompt-styles', requireDeviceToken, async (req, res, next) => {
  try {
    const styles = await prisma.promptStyle.findMany({
      where:   { isActive: true },
      orderBy: { createdAt: 'desc' },
      select:  { id: true, name: true, imageModel: true },
    });
    const device = await prisma.device.findUnique({
      where:  { id: req.deviceId },
      select: { promptStyleId: true },
    });
    res.json({ styles, currentPromptStyleId: device?.promptStyleId ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/device/settings/prompt-style
 * 设备绑定提示词风格 { promptStyleId: string }
 */
router.patch('/settings/prompt-style', requireDeviceToken, async (req, res, next) => {
  try {
    const { promptStyleId } = req.body;
    if (!promptStyleId) return res.status(400).json({ error: '缺少 promptStyleId' });

    const style = await prisma.promptStyle.findFirst({ where: { id: promptStyleId, isActive: true } });
    if (!style) return res.status(404).json({ error: '风格不存在或未启用' });

    await prisma.device.update({
      where: { id: req.deviceId },
      data:  { promptStyleId },
    });
    res.json({ success: true, promptStyleId });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────
// 话题分类路由（需要 DeviceToken）
// ─────────────────────────────────────────────────────────────────

/**
 * GET /api/device/topic-categories
 * 返回所有已启用的话题分类以及对应的所有话题
 */
router.get('/topic-categories', requireDeviceToken, async (req, res, next) => {
  try {
    const categories = await prisma.topicCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        topics: {
          select: {
            id: true,
            name: true,
          },
          // 这里暂时不限定只返回有缓存的话题。若有需要，可在后续加过滤
        }
      }
    });

    // 顺便查找那些没有归属到分类（或者归属到被禁用分类）的话题，归入“其他”
    const activeCategoryIds = categories.map(c => c.id);
    const unassignedTopics = await prisma.topic.findMany({
      where: {
        OR: [
          { categoryId: null },
          { categoryId: { notIn: activeCategoryIds } }
        ]
      },
      select: { id: true, name: true }
    });

    if (unassignedTopics.length > 0) {
      categories.push({
        id: 'unassigned',
        name: '其他',
        topics: unassignedTopics,
      });
    }

    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

