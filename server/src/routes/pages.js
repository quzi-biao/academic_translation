import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { generateTitleFromText } from '../services/ai/gemini-text.js';

const router = Router();
router.use(requireAuth);

/** 将平铺的 page 列表转为树结构 */
function buildTree(pages, parentId = null) {
  return pages
    .filter((p) => p.parentPageId === parentId)
    .map((p) => ({ ...p, children: buildTree(pages, p.id) }));
}

/**
 * 生成 book 归属查询条件，同时兼容 userId（旧用户Token）和 deviceId（设备Token）
 * @param {import('express').Request} req
 * @param {string} bookId
 */
function bookOwnerWhere(req, bookId) {
  if (req.deviceId) return { id: bookId, deviceId: req.deviceId };
  return { id: bookId, userId: req.user.id };
}

// ── GET /api/books/:bookId/pages ───────────────────────
// 挂载在 booksRouter 下，相对路径为 /:bookId/pages
router.get('/:bookId/pages', async (req, res, next) => {
  try {
    const book = await prisma.book.findFirst({
      where: bookOwnerWhere(req, req.params.bookId),
    });
    if (!book) return res.status(404).json({ error: 'Book 不存在' });

    const pages = await prisma.page.findMany({
      where: { bookId: req.params.bookId },
      orderBy: { createdAt: 'asc' },
      select: {
        id:               true,
        bookId:           true,
        parentPageId:     true,
        imageUrl:         true,
        selectionImageUrl: true,
        selectionRegion:  true,
        title:            true,
        prompt:           true,
        createdAt:        true,
        // 排除大字段：identification / promptHash / contentHash
      },
    });

    res.json({ pages, tree: buildTree(pages) });

    // 异步补生成：对 title 为空的页面，后台重新从 prompt 生成标题
    const nullPages = pages.filter((p) => !p.title && p.prompt);
    if (nullPages.length > 0) {
      nullPages.forEach((page) => {
        generateTitleFromText(page.prompt)
          .then((title) => {
            if (title) {
              return prisma.page.update({ where: { id: page.id }, data: { title } });
            }
          })
          .catch((e) => console.warn(`[pages] 补生成标题失败 ${page.id}:`, e.message));
      });
    }
  } catch (err) {
    next(err);
  }
});


// ── POST /api/books/:bookId/pages ──────────────────────
router.post('/:bookId/pages', async (req, res, next) => {
  try {
    const book = await prisma.book.findFirst({
      where: bookOwnerWhere(req, req.params.bookId),
    });
    if (!book) return res.status(404).json({ error: 'Book 不存在' });

    const {
      parentPageId,
      imageUrl,
      prompt,
      selectionRegion,
      selectionImageUrl,
      contentHash,
      promptHash,
      identification,
    } = req.body;

    if (!imageUrl) return res.status(400).json({ error: 'imageUrl 不能为空' });

    const page = await prisma.page.create({
      data: {
        bookId: req.params.bookId,
        parentPageId: parentPageId || null,
        imageUrl,
        prompt,
        selectionRegion,
        selectionImageUrl,
        contentHash,
        promptHash,
        identification,
      },
    });
    res.status(201).json({ page });
  } catch (err) {
    next(err);
  }
});

export default router;
