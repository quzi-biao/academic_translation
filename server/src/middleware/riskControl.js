import { checkText } from '../services/wechatSecurity.js';

/**
 * 遍历对象中的所有字符串，提取并拼接
 */
function extractStrings(obj) {
  let textArray = [];
  if (typeof obj === 'string') {
    textArray.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      textArray.push(extractStrings(item));
    }
  } else if (obj !== null && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      textArray.push(extractStrings(obj[key]));
    }
  }
  return textArray.join(' ');
}

/**
 * Express 全局风控中间件
 * 拦截 POST / PUT / PATCH 请求，检查 req.body 中的所有文本内容
 */
export async function validateContentMiddleware(req, res, next) {
  // 只检查修改数据的请求
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }

  // 忽略空 body 或非 JSON 请求
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  // 提取所有的文本
  const allText = extractStrings(req.body);
  
  if (!allText.trim()) {
    return next();
  }

  try {
    const result = await checkText(allText);
    if (!result.isSafe) {
      const wordsStr = (result.matchedWords && result.matchedWords.length > 0) 
        ? `（${result.matchedWords.join('、')}）` 
        : '';
      return res.status(400).json({ error: `风控拦截：内容包含敏感/违规词汇${wordsStr}，请修改后重试。` });
    }
    next();
  } catch (err) {
    console.error('[RiskControl Middleware] Error checking text:', err);
    // 报错放行，避免因风控接口挂掉导致大面积业务瘫痪
    next();
  }
}
