import fetch from 'node-fetch';
import { checkLocalText } from './localSecurity.js';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * 获取微信小程序 Access Token (带内存缓存)
 */
export async function getAccessToken() {
  // 提前 5 分钟刷新
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const appid = process.env.WX_MINI_APPID;
  const secret = process.env.WX_MINI_SECRET;

  if (!appid || !secret) {
    throw new Error('Missing WX_MINI_APPID or WX_MINI_SECRET in environment variables');
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.errcode) {
      throw new Error(`WeChat Token Error: ${data.errmsg} (${data.errcode})`);
    }

    cachedToken = data.access_token;
    // data.expires_in 通常是 7200 秒
    tokenExpiresAt = Date.now() + data.expires_in * 1000;
    console.log('[Wechat Security] Access Token Refreshed.');
    
    return cachedToken;
  } catch (err) {
    console.error('[Wechat Security] Failed to get access token:', err);
    throw err;
  }
}

/**
 * 调用微信内容安全接口检测文本
 * @param {string} text - 待检测的文本
 * @returns {Promise<Object>} - { isSafe: boolean, matchedWords?: string[] }
 */
export async function checkText(text) {
  if (!text || typeof text !== 'string') return { isSafe: true };
  
  // 1. 第一层：本地极速敏感词拦截
  const localResult = checkLocalText(text);
  if (!localResult.isSafe) {
    return localResult; // 包含 { isSafe: false, matchedWords: [...] }
  }

  // 微信单次检测限制 10000 字节，简单截断前 3000 字
  const content = text.slice(0, 3000); 

  try {
    const token = await getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`;
    
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ content }),
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    
    // errcode 87014 表示含有违法违规内容
    if (data.errcode === 87014) {
      console.warn(`[Wechat Security] Blocked risky text: "${content.slice(0, 20)}..."`);
      return { isSafe: false, matchedWords: ['云端风控词'] };
    }
    
    // errcode 0 表示合规
    if (data.errcode !== 0) {
      console.error('[Wechat Security] msg_sec_check error:', data);
      // 如果接口报错（如 token 失效或其他异常），默认放行，避免阻断正常业务
      return { isSafe: true };
    }

    return { isSafe: true };
  } catch (err) {
    console.error('[Wechat Security] Network error during checkText:', err);
    return { isSafe: true }; // 发生网络异常时默认放行，防误杀
  }
}
