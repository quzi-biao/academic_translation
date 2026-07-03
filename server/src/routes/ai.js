import { Router } from 'express';
import sharp from 'sharp';
import { requireAuth } from '../middleware/auth.js';
import { generateImage, expandWithKnowledge } from '../services/ai/gemini.js';
import { identifyRegion, explainSpot, explainRegionFromUrl, explainRegionFromBase64 } from '../services/ai/gemini-vision.js';
import { generateTitle, generateTitleFromText, generateRandomTopics } from '../services/ai/gemini-text.js';
import { buildImagePromptGPT } from '../services/ai/gptimage-prompts.js';
import { uploadBase64 } from '../services/oss.js';
import { buildPromptHash, buildContentHash, buildMd5 } from '../services/hash.js';
import prisma from '../config/db.js';
import { requirePoints, deductPoints, getPointCost } from '../services/points.js';
import { checkText } from '../services/wechatSecurity.js';

/**
 * 获取设备绑定的提示词风格和全局模型配置
 */
async function getDeviceAiConfig(deviceId) {
  let promptStyle = null;
  if (deviceId) {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { promptStyle: true },
    });
    promptStyle = device?.promptStyle;
  }
  if (!promptStyle) {
    promptStyle = await prisma.promptStyle.findFirst({ where: { name: '酷炫科普风' } });
  }

  const globalConfigs = await prisma.globalConfig.findMany({
    where: { key: { in: ['model_image_gen', 'model_page_desc', 'model_region_expl'] } }
  });
  const configMap = Object.fromEntries(globalConfigs.map(c => [c.key, c.value]));

  return { promptStyle, configMap };
}

/**
 * 百科话题集合（O(1) 查找）
 * 从 DB topics 表加载，启动时一次性写入内存，无需静态文件
 */
let TOPIC_SET = new Set();

/** 从 DB 重新加载 TOPIC_SET（新增/删除话题后调用） */
export async function reloadTopicSet() {
  const rows = await prisma.topic.findMany({ select: { name: true } });
  TOPIC_SET = new Set(rows.map(r => r.name));
  console.log(`[TOPIC_SET] 已重新加载 ${TOPIC_SET.size} 个话题`);
}

// 启动时初始化
reloadTopicSet().catch(err => console.error('[TOPIC_SET] 加载失败:', err.message));


const router = Router();
router.use(requireAuth);

/** 获取当前请求者 ID（用于 OSS 路径等），兼容 deviceId 和 userId */
const getOwner = (req) => req.deviceId || req.user?.id || 'unknown';

/** book 归属 where 条件，兼容 deviceId 和 userId */
const bookWhere = (req, bookId) =>
  req.deviceId ? { id: bookId, deviceId: req.deviceId } : { id: bookId, userId: req.user.id };

/** 创建 book 时的归属字段 */
const bookOwnerData = (req) =>
  req.deviceId ? { deviceId: req.deviceId } : { userId: req.user.id };

// ── POST /api/ai/generate-image ────────────────────────
// 文生图，自动创建/更新 Book 和根页记录
router.post('/generate-image', async (req, res, next) => {
  try {
    const { query, bookId, parentPageId } = req.body;
    if (!query) return res.status(400).json({ error: 'query 不能为空' });

    // 微信敏感词拦截
    const result = await checkText(query);
    if (!result.isSafe) {
      const wordsStr = (result.matchedWords && result.matchedWords.length > 0) 
        ? `（${result.matchedWords.join('、')}）` 
        : '';
      return res.status(400).json({ error: `检测到违规词汇${wordsStr}，请修改后重试。` });
    }

    // 点数检查（仅设备 Token）
    if (!await requirePoints(req.deviceId, res)) return;

    const userId     = getOwner(req);
    const promptHash = buildPromptHash(query);
    const topicName  = query.trim();
    const isTopic    = TOPIC_SET.has(topicName);

    let imageUrl, contentHash;
    let finalPromptHash = null; // 只有非百科的全新生成才保存 promptHash

    if (isTopic) {
      // ── 百科话题：走全局 TopicCache（跨用户共享）──
      const cached = await prisma.topicCache.findUnique({ where: { topicName } });
      if (cached) {
        // 缓存命中：直接复用 OSS 图片，不调 AI
        imageUrl = cached.imageUrl;
        console.log(`[TopicCache] 命中 "${topicName}"，hitCount=${cached.hitCount + 1}`);
        // 异步更新命中次数（不阻塞响应）
        prisma.topicCache.update({
          where: { id: cached.id },
          data:  { hitCount: { increment: 1 } },
        }).catch(() => {});
      } else {
        // 缓存未命中：生成图片并写入 TopicCache
        const { promptStyle, configMap } = await getDeviceAiConfig(req.deviceId);
        
        // 我们不再在这里调用 buildImagePromptGPT，而是由底层的 generateImage 自行组装
        const imageBase64 = await generateImage(topicName, promptStyle, configMap);
        // 为了缓存 prompt 文本，我们需要生成最终 prompt，这里简便处理，将最终发送给大模型的 Prompt 提取回来或者在底层写回
        // 但其实 TopicCache 里的 promptText/promptMd5 可以使用 topicName 直接作为缓存键
        // 这里就使用拼装后的组合字符串来计算 MD5（因为底层也会拼装统一的 style）
        const generatedPromptText = promptStyle.topicExploration.replace('${query}', topicName) + '\n\n' + promptStyle.unifiedStyle;
        const promptMd5  = buildMd5(generatedPromptText);

        imageUrl    = await uploadBase64(imageBase64, 'pages', userId);
        contentHash = buildContentHash(imageBase64);
        try {
          await prisma.topicCache.create({
            data: { topicName, promptText: generatedPromptText, promptMd5, imageUrl },
          });
          console.log(`[TopicCache] 已缓存 "${topicName}"`);
        } catch (e) {
          // P2002 = 并发冲突（另一用户同时生成了同一话题）→ 忽略
          if (e.code !== 'P2002') throw e;
          console.warn(`[TopicCache] 并发写入冲突 "${topicName}"，忽略重复`);
        }
      }
    } else {
      // ── 非百科话题：按 Page.promptHash 走旧缓存逻辑 ──
      const cachedPage = await prisma.page.findUnique({ where: { promptHash } });
      if (cachedPage) {
        imageUrl    = cachedPage.imageUrl;
        contentHash = cachedPage.contentHash;
      } else {
        const { promptStyle, configMap } = await getDeviceAiConfig(req.deviceId);
        const imageBase64 = await generateImage(query, promptStyle, configMap);
        imageUrl    = await uploadBase64(imageBase64, 'pages', userId);
        contentHash = buildContentHash(imageBase64);
        finalPromptHash = promptHash; // 只有全新生成的非百科图片，才占坑 promptHash
      }
    }

    let book, page;

    if (bookId) {
      book = await prisma.book.findFirst({ where: bookWhere(req, bookId) });
      if (!book) return res.status(404).json({ error: 'Book 不存在' });

      // 在当前书里创建新页，parentPageId 指向来源页（构建层级）
      page = await prisma.page.create({
        data: {
          bookId: book.id,
          parentPageId: parentPageId || null,
          imageUrl,
          prompt: query,
          contentHash,
          promptHash: null,
          deviceId: req.deviceId || null,
        },
      });
    } else {
      // 创建新书（根页，无 parent）
      book = await prisma.book.create({
        data: { ...bookOwnerData(req), title: query, mode: 'book', prompt: query, coverUrl: imageUrl },
      });
      page = await prisma.page.create({
        data: { bookId: book.id, imageUrl, prompt: query, contentHash, promptHash: finalPromptHash, deviceId: req.deviceId || null },
      });
    }

    // 从 prompt（用户查询词）生成中文标题，不需要下载图片，更快更稳
    let pageTitle = query; // 默认降级到用户查询词
    try {
      const generatedTitle = await generateTitleFromText(query);
      if (generatedTitle) {
        pageTitle = generatedTitle;
        await prisma.page.update({ where: { id: page.id }, data: { title: generatedTitle } });
      }
    } catch (e) {
      console.warn('[generate-image] 标题生成失败:', e.message);
    }

    res.json({ imageUrl, bookId: book.id, pageId: page.id, pageTitle });

    // 异步扣点（不阻塞响应）
    if (req.deviceId) {
      getPointCost('points_per_image', 10).then((cost) =>
        deductPoints(req.deviceId, -Math.round(cost), 'image', `生成图片: ${query.slice(0, 30)}`)
      ).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/identify-region ───────────────────────
// 视觉识别框选区域内容，返回 { type, description }
router.post('/identify-region', async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 不能为空' });

    const { promptStyle, configMap } = await getDeviceAiConfig(req.deviceId);
    const identification = await identifyRegion(imageBase64, promptStyle, configMap);
    res.json({ identification });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/expand-region ─────────────────────────
// 图生图：基于识别结果扩展框选区域
// 支持 promptHash 缓存命中（复用图片 URL，但始终创建新页以保证层级正确）
router.post('/expand-region', async (req, res, next) => {
  try {
    const {
      selectionImageBase64,
      identification,
      bookId,
      parentPageId,
      selectionRegion,
    } = req.body;

    if (!selectionImageBase64 || !identification || !bookId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 点数检查（仅设备 Token）
    if (!await requirePoints(req.deviceId, res)) return;

    console.log('[expand-region] bookId:', bookId, '| parentPageId:', parentPageId ?? 'undefined');

    const userId = getOwner(req);

    // 验证 book 所属
    const book = await prisma.book.findFirst({ where: bookWhere(req, bookId) });
    if (!book) return res.status(404).json({ error: 'Book 不存在' });

    // 计算 promptHash
    const promptStr  = JSON.stringify(identification);
    const promptHash = buildPromptHash(promptStr, selectionImageBase64);

    let imageUrl, contentHash, selectionImageUrl;

    // 查询是否已生成过相同图片
    const cachedPage = await prisma.page.findUnique({ where: { promptHash } });
    if (cachedPage) {
      imageUrl         = cachedPage.imageUrl;
      contentHash      = cachedPage.contentHash;
      selectionImageUrl = cachedPage.selectionImageUrl;
    } else {
      // 上传框选区域图到 OSS
      selectionImageUrl = await uploadBase64(selectionImageBase64, 'selections', userId);
      // 调用 Gemini 扩展图片
      const { promptStyle, configMap } = await getDeviceAiConfig(req.deviceId);
      const resultBase64 = await expandWithKnowledge(selectionImageBase64, identification, promptStyle, configMap);
      imageUrl    = await uploadBase64(resultBase64, 'pages', userId);
      contentHash = buildContentHash(resultBase64);
    }

    // 始终创建新页记录（保证 bookId 和 parentPageId 正确，层级结构不被缓存破坏）
    const page = await prisma.page.create({
      data: {
        bookId,
        parentPageId: parentPageId || null,
        imageUrl,
        prompt: identification?.description || '深入探索',
        selectionRegion,
        selectionImageUrl,
        contentHash,
        promptHash: null,
        identification,
        deviceId: req.deviceId || null,
      },
    });

    // 清理 prompt 文本（去掉 JSON 外壳、Markdown）
    let promptText = identification?.description || '深入探索';
    if (promptText.startsWith('{')) {
      try { promptText = JSON.parse(promptText).description || promptText; } catch {}
    }
    promptText = promptText.replace(/[#*`>\[\]_]/g, '').slice(0, 300).trim() || '深入探索';

    // 同步等待标题生成
    let pageTitle = promptText.slice(0, 15);
    try {
      const generatedTitle = await generateTitleFromText(promptText);
      if (generatedTitle) {
        pageTitle = generatedTitle;
        await prisma.page.update({ where: { id: page.id }, data: { title: generatedTitle } });
      }
    } catch (e) {
      console.warn('[expand-region] 标题生成失败:', e.message);
    }

    res.json({ imageUrl, pageId: page.id, pageTitle, fromCache: !!cachedPage });

    // 异步扣点（不阻塞响应）
    if (req.deviceId) {
      const desc = identification?.description || '深入探索';
      getPointCost('points_per_image', 10).then((cost) =>
        deductPoints(req.deviceId, -Math.round(cost), 'image', `深入探索: ${desc.slice(0, 30)}`)
      ).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/explain-spot ───────────────────────────
// 探索标注：根据图片 URL + 点击坐标返回 AI 中文解释
router.post('/explain-spot', async (req, res, next) => {
  try {
    const { imageUrl, x, y } = req.body;
    if (!imageUrl || x == null || y == null) {
      return res.status(400).json({ error: '缺少必要参数 imageUrl/x/y' });
    }
    const { promptStyle, configMap } = await getDeviceAiConfig(req.deviceId);
    const explanation = await explainSpot(imageUrl, Number(x), Number(y), promptStyle, configMap);
    res.json({ explanation });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/explain-region ───────────────────────────────────
// 框选区域解读。
// 优先使用前端传来的裁剪 base64（小图，避免下载大图），
// 回退到全图 URL + region 坐标方式。
router.post('/explain-region', async (req, res, next) => {
  try {
    const { imageUrl, imageBase64, region } = req.body;
    if (!region) return res.status(400).json({ error: '缺少必要参数 region' });

    const { promptStyle, configMap } = await getDeviceAiConfig(req.deviceId);
    let explanation;
    if (imageBase64) {
      // 前端已裁剪好，直接用该小图输入 Gemini
      const [header, b64] = imageBase64.split(',');
      const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
      explanation = await explainRegionFromBase64(b64, mimeType, promptStyle, configMap);
    } else if (imageUrl) {
      explanation = await explainRegionFromUrl(imageUrl, region, promptStyle, configMap);
    } else {
      return res.status(400).json({ error: '缺少 imageBase64 或 imageUrl' });
    }

    res.json({ explanation });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/crop-region ──────────────────────────────────
// 后端裁剪图像：下载 OSS 全图 → sharp 裁剪 → 返回 base64
// 可避免前端 canvas tainted-origin 问题
// @param {{ imageUrl: string, region: { x1, y1, x2, y2 } }} body
//   region 是图像归一化坐标 (0~1)
router.post('/crop-region', async (req, res, next) => {
  try {
    const { imageUrl, region } = req.body;
    if (!imageUrl || !region) {
      return res.status(400).json({ error: '缺少 imageUrl 或 region' });
    }
    const { x1 = 0, y1 = 0, x2 = 1, y2 = 1 } = region;

    // 下载图像
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`图像下载失败 (${imgRes.status})`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // 获取图像元数据
    const meta = await sharp(buffer).metadata();
    const natW = meta.width;
    const natH = meta.height;

    // 将归一化坐标转为像素
    const left   = Math.max(0, Math.round(x1 * natW));
    const top    = Math.max(0, Math.round(y1 * natH));
    const right  = Math.min(natW, Math.round(x2 * natW));
    const bottom = Math.min(natH, Math.round(y2 * natH));
    const width  = right  - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) {
      return res.status(400).json({ error: '选区超出图像边界' });
    }

    // 裁剪并缩放（最大 800px 宽）
    const maxW = 800;
    const scale = width > maxW ? maxW / width : 1;
    const outW = Math.round(width  * scale);
    const outH = Math.round(height * scale);

    const cropped = await sharp(buffer)
      .extract({ left, top, width, height })
      .resize(outW, outH)
      .jpeg({ quality: 85 })
      .toBuffer();

    const b64 = cropped.toString('base64');
    res.json({ imageBase64: `data:image/jpeg;base64,${b64}` });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/generate-title ───────────────────────────────────
// 调用大模型对科普解读文本提炼超短标题（≤ 20 字）
router.post('/generate-title', async (req, res, next) => {
  try {
    const { explanation } = req.body;
    if (!explanation) return res.status(400).json({ error: 'explanation 不能为空' });
    const title = await generateTitle(explanation);
    res.json({ title });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/ai/random-topics ─────────────────────────────────────
// 随机生成 5 个科普话题（4-7 字）
router.get('/random-topics', async (req, res, next) => {
  try {
    const topics = await generateRandomTopics();
    res.json({ topics });
  } catch (err) {
    next(err);
  }
});

export default router;
