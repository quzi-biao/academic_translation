/**
 * admin/devices.js — 设备管理接口
 *
 * GET  /api/admin/devices          设备列表（分页、搜索）
 * GET  /api/admin/devices/:id      设备详情
 * PATCH /api/admin/devices/:id     更新设备备注/客户经理/目标版本
 * GET  /api/admin/devices/:id/stats 设备统计（书本数、页数、标注数、TTS时长等）
 * GET  /api/admin/devices/:id/points 点数流水
 * POST /api/admin/devices/:id/points 手动增减点数
 */

import { Router } from 'express';
import prisma from '../../config/db.js';
import { requireAdmin } from './auth.js';
import { isDeviceOnline, getSessionSeconds } from '../device.js';

const router = Router();
router.use(requireAdmin);

// ── GET /api/admin/devices ─────────────────────────────
router.get('/', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1'));
  const limit  = Math.min(100, parseInt(req.query.limit || '20'));
  const search = req.query.search || '';
  const filterManagerId = req.query.managerId;
  const filterChannelId = req.query.channelId;
  const skip   = (page - 1) * limit;

  // 客户经理只能看自己关联的设备
  const managerFilter = req.adminUser.role === 'manager'
    ? { managerId: req.adminUser.id }
    : (filterManagerId ? { managerId: filterManagerId } : {});

  const channelFilter = filterChannelId ? { channelId: filterChannelId } : {};

  const where = {
    ...managerFilter,
    ...channelFilter,
    ...(search ? {
      OR: [
        { deviceCode: { contains: search, mode: 'insensitive' } },
        { notes:      { contains: search, mode: 'insensitive' } },
        { deviceModel:{ contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  };

  try {
    const [total, devices] = await Promise.all([
      prisma.device.count({ where }),
      prisma.device.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastSeenAt: 'desc' },
        include: {
          wallet: { select: { balance: true } },
          manager: { select: { username: true } },
          channel: { select: { id: true, name: true } },
          _count: { select: { books: true, pages: true } },
        },
      }),
    ]);

    const now = Date.now();
    const list = devices.map((d) => ({
      id:           d.id,
      deviceCode:   d.deviceCode,
      appVersion:   d.appVersion,
      deviceModel:  d.deviceModel,
      notes:        d.notes,
      balance:      d.wallet?.balance ?? 0,
      manager:      d.manager?.username ?? null,
      channel:      d.channel ? { id: d.channel.id, name: d.channel.name } : null,
      channelId:    d.channel?.id ?? null,
      targetVersionId: d.targetVersionId ?? null,
      lastSeenAt:   d.lastSeenAt,
      online:       isDeviceOnline(d.id),
      sessionSeconds: getSessionSeconds(d.id),
      bookCount:    d._count.books,
      pageCount:    d._count.pages,
    }));

    res.json({ total, page, limit, devices: list });
  } catch (err) {
    console.error('[admin/devices]', err);
    res.status(500).json({ error: '获取设备列表失败' });
  }
});

// ── GET /api/admin/devices/:id ─────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const d = await prisma.device.findFirst({
      where: { 
        OR: [
          { id: req.params.id },
          { deviceCode: req.params.id }
        ]
      },
      include: {
        wallet: true,
        manager: { select: { id: true, username: true } },
        channel: { select: { id: true, name: true } },
        _count: {
          select: { books: true, pages: true, annotations: true, audioMasters: true },
        },
      },
    });
    if (!d) return res.status(404).json({ error: '设备不存在' });

    // 累计在线时长（所有已结束的 session 之和）
    const sessionAgg = await prisma.deviceSession.aggregate({
      where: { deviceId: d.id },
      _sum: { durationSeconds: true },
    });

    res.json({
      device: {
        ...d,
        balance:       d.wallet?.balance ?? 0,
        online:        isDeviceOnline(d.id),
        sessionSeconds:getSessionSeconds(d.id),
        totalOnlineSeconds: (sessionAgg._sum.durationSeconds ?? 0) + getSessionSeconds(d.id),
      },
    });
  } catch (err) {
    res.status(500).json({ error: '获取设备详情失败' });
  }
});

// ── PATCH /api/admin/devices/:id ──────────────────────
router.patch('/:id', async (req, res) => {
  const { notes, managerId, channelId, targetVersionId } = req.body;
  try {
    const updated = await prisma.device.update({
      where: { id: req.params.id },
      data: {
        ...(notes !== undefined && { notes }),
        ...(managerId !== undefined && { managerId: managerId || null }),
        ...(channelId !== undefined && { channelId: channelId || null }),
        ...(targetVersionId !== undefined && { targetVersionId: targetVersionId || null }),
      },
    });
    res.json({ device: updated });
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

// ── DELETE /api/admin/devices/:id ──────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const d = await prisma.device.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { books: true, pages: true } }
      }
    });
    if (!d) return res.status(404).json({ error: '设备不存在' });
    if (d._count.books > 1 || d._count.pages > 1) {
      return res.status(400).json({ error: '设备包含大于1本书或页，无法删除' });
    }
    await prisma.device.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/devices/delete]', err);
    res.status(500).json({ error: '删除设备失败' });
  }
});

// ── GET /api/admin/devices/:id/stats ──────────────────
router.get('/:id/stats', async (req, res) => {
  const deviceId = req.params.id;
  try {
    const [books, pages, annotations, ttsSumRaw, charSumRaw, sessions] = await Promise.all([
      prisma.book.count({ where: { deviceId } }),
      prisma.page.count({ where: { deviceId } }),
      prisma.annotation.count({ where: { deviceId } }),
      // DB 层聚合 TTS 总时长
      prisma.$queryRaw`
        SELECT COALESCE(SUM("totalSeconds"), 0) AS val
        FROM audio_masters
        WHERE "deviceId" = ${deviceId}
      `,
      // DB 层聚合总字数（页面解读 + 区域解读）
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(LENGTH(pe.content)), 0) +
          COALESCE((
            SELECT SUM(LENGTH(a.explanation))
            FROM annotations a
            WHERE a."deviceId" = ${deviceId}
              AND a.explanation IS NOT NULL
          ), 0) AS val
        FROM page_explanations pe
        WHERE pe."deviceId" = ${deviceId}
      `,
      prisma.deviceSession.findMany({
        where: { deviceId },
        orderBy: { startAt: 'desc' },
        take: 30,
        select: { startAt: true, endAt: true, durationSeconds: true },
      }),
    ]);

    const ttsSeconds  = Number(ttsSumRaw[0]?.val ?? 0);
    const totalChars  = Number(charSumRaw[0]?.val ?? 0);
    const totalOnline = sessions.reduce((s, ss) => s + (ss.durationSeconds ?? 0), 0) + getSessionSeconds(deviceId);

    res.json({
      bookCount:       books,
      pageCount:       pages,
      annotationCount: annotations,
      ttsSeconds,
      totalChars,
      imageCount:      pages, // 每页一张图
      totalOnlineSeconds: totalOnline,
      recentSessions: sessions,
    });
  } catch (err) {
    res.status(500).json({ error: '获取统计失败' });
  }
});

// ── GET /api/admin/devices/:id/points ─────────────────
router.get('/:id/points', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page  || '1'));
  const limit = Math.min(100, parseInt(req.query.limit || '30'));

  try {
    const wallet = await prisma.deviceWallet.findUnique({
      where: { deviceId: req.params.id },
    });
    if (!wallet) return res.json({ total: 0, ledger: [], balance: 0 });

    const [total, ledger] = await Promise.all([
      prisma.pointLedger.count({ where: { walletId: wallet.id } }),
      prisma.pointLedger.findMany({
        where:   { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
    ]);

    res.json({ total, page, limit, balance: wallet.balance, ledger });
  } catch (err) {
    res.status(500).json({ error: '获取点数记录失败' });
  }
});

// ── POST /api/admin/devices/:id/points ─────────────────
// 手动增减点数
router.post('/:id/points', async (req, res) => {
  const { delta, reason } = req.body;
  if (!delta || typeof delta !== 'number') {
    return res.status(400).json({ error: 'delta 必须为非零整数' });
  }

  try {
    const wallet = await prisma.deviceWallet.findUnique({
      where: { deviceId: req.params.id },
    });
    if (!wallet) return res.status(404).json({ error: '设备钱包不存在' });

    // 原子更新余额
    const [updated, ledger] = await prisma.$transaction([
      prisma.deviceWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: delta } },
      }),
      prisma.pointLedger.create({
        data: {
          walletId:   wallet.id,
          deviceId:   req.params.id,
          delta,
          balance:    wallet.balance + delta,
          type:       'admin_grant',
          reason:     reason || (delta > 0 ? '管理员手动充值' : '管理员手动扣除'),
          operatorId: req.adminUser.id,
        },
      }),
    ]);

    res.json({ balance: updated.balance, ledger });
  } catch (err) {
    console.error('[admin/devices/points]', err);
    res.status(500).json({ error: '点数操作失败' });
  }
});

export default router;
