import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadBase64, uploadFromUrl } from '../services/oss.js';

const router = Router();
router.use(requireAuth);

// ── POST /api/upload/image ────────────────────────────
// 将图片（base64 或外部 URL）上传到 OSS，返回 OSS URL
router.post('/image', async (req, res, next) => {
  try {
    const { imageBase64, imageUrl, subdir = 'pages' } = req.body;
    const userId = req.deviceId || req.user?.id || 'unknown';

    if (!imageBase64 && !imageUrl) {
      return res.status(400).json({ error: '请提供 imageBase64 或 imageUrl' });
    }

    const validSubdirs = ['pages', 'covers', 'selections'];
    if (!validSubdirs.includes(subdir)) {
      return res.status(400).json({ error: `subdir 必须是 ${validSubdirs.join('/')} 之一` });
    }

    let ossUrl;
    if (imageBase64) {
      ossUrl = await uploadBase64(imageBase64, subdir, userId);
    } else {
      ossUrl = await uploadFromUrl(imageUrl, subdir, userId);
    }

    res.json({ url: ossUrl });
  } catch (err) {
    next(err);
  }
});

export default router;
