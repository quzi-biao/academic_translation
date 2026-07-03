/**
 * admin/versions.js — App 版本管理接口
 *
 * GET    /api/admin/versions              版本列表
 * POST   /api/admin/versions              创建新版本（multipart/form-data，含 APK 文件）
 * PATCH  /api/admin/versions/:id          更新版本信息
 * DELETE /api/admin/versions/:id          删除版本
 * POST   /api/admin/versions/:id/current  设为当前全局版本
 */

import { Router } from 'express';
import multer  from 'multer';
import prisma  from '../../config/db.js';
import { requireAdmin, requireSuperAdmin } from './auth.js';
import { uploadBuffer } from '../../services/oss.js';

const router = Router();
router.use(requireAdmin);

// multer：内存存储，限制 200MB（APK 文件）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/vnd.android.package-archive' ||
        file.originalname.endsWith('.apk')) {
      cb(null, true);
    } else {
      cb(new Error('只支持上传 .apk 文件'));
    }
  },
});

// ── GET /api/admin/versions ───────────────────────────
router.get('/', async (req, res) => {
  try {
    const versions = await prisma.appVersion.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: '获取版本列表失败' });
  }
});

// ── POST /api/admin/versions ──────────────────────────
// multipart/form-data:
//   file          APK 文件（必填）
//   versionCode   整数版本号
//   versionName   字符串版本名
//   changelog     更新日志（可选）
//   forceUpgrade  是否强制升级（可选，默认 false）
router.post('/', requireSuperAdmin, upload.single('file'), async (req, res) => {
  const { versionCode, versionName, changelog, forceUpgrade } = req.body;

  if (!versionCode || !versionName) {
    return res.status(400).json({ error: 'versionCode / versionName 不能为空' });
  }
  if (!req.file) {
    return res.status(400).json({ error: '请上传 APK 文件' });
  }

  try {
    const apkUrl = await uploadBuffer(req.file.buffer, 'apk', 'apk', 'admin');

    const version = await prisma.appVersion.create({
      data: {
        versionCode:  parseInt(versionCode, 10),
        versionName,
        apkUrl,
        changelog:    changelog || null,
        forceUpgrade: forceUpgrade === 'true' || forceUpgrade === true,
      },
    });
    res.status(201).json({ version });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'versionCode 已存在' });
    console.error('[versions] 创建失败:', err.message);
    res.status(500).json({ error: '创建版本失败：' + err.message });
  }
});

// ── PATCH /api/admin/versions/:id ────────────────────
router.patch('/:id', requireSuperAdmin, async (req, res) => {
  const { versionName, apkUrl, changelog, forceUpgrade } = req.body;
  try {
    const updated = await prisma.appVersion.update({
      where: { id: req.params.id },
      data: {
        ...(versionName   !== undefined && { versionName }),
        ...(apkUrl        !== undefined && { apkUrl }),
        ...(changelog     !== undefined && { changelog }),
        ...(forceUpgrade  !== undefined && { forceUpgrade }),
      },
    });
    res.json({ version: updated });
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

// ── DELETE /api/admin/versions/current ───────────────
// 撤销当前版本（必须在 /:id 前定义，否则被动态路由拦截）
router.delete('/current', requireSuperAdmin, async (req, res) => {
  try {
    await prisma.appVersion.updateMany({ data: { isCurrent: false } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '撤销失败' });
  }
});

// ── DELETE /api/admin/versions/:id ───────────────────
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const v = await prisma.appVersion.findUnique({ where: { id: req.params.id } });
    if (v?.isCurrent) return res.status(400).json({ error: '不能删除当前生效版本' });
    await prisma.appVersion.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// ── POST /api/admin/versions/:id/current ─────────────
router.post('/:id/current', requireSuperAdmin, async (req, res) => {
  try {
    await prisma.appVersion.updateMany({ data: { isCurrent: false } });
    const version = await prisma.appVersion.update({
      where: { id: req.params.id },
      data:  { isCurrent: true },
    });
    res.json({ version });
  } catch (err) {
    res.status(500).json({ error: '设置当前版本失败' });
  }
});

export default router;
