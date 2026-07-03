/**
 * wechat.js — 微信支付 APIv3 服务封装（商户API公钥模式）
 *
 * 证书模式：使用「商户API公钥」（非对称加密），而非传统 APIv3 对称密钥
 * 环境变量：
 *   WX_APPID           — 公众号/移动应用 AppID
 *   WX_MCHID           — 商户号
 *   WX_PRIVATE_KEY_PATH — 商户私钥文件路径（apiclient_key.pem）
 *   WX_PUBLIC_KEY_PATH  — 微信平台公钥文件路径（pub_key.pem，用于验签）
 *   WX_PUBLIC_KEY_ID    — 平台公钥 ID（PUB_KEY_ID_xxx）
 *   WX_SERIAL_NO        — 商户证书序列号
 *   WX_NOTIFY_URL       — 支付回调地址
 *
 * 导出函数：
 *   createNativeOrder(outTradeNo, amount, description) → codeUrl
 *   verifyAndDecodeNotify(headers, rawBody)             → 解密后的业务数据
 *   queryOrder(outTradeNo)                              → 订单数据
 */

import fs from 'fs';
import Wechatpay from 'wechatpay-node-v3';

// ── 读取文件内容（带友好错误提示） ─────────────────────────
function readFile(envKey, filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new Error(`[WxPay] 读取 ${envKey} 失败（路径: ${filePath}）: ${e.message}`);
  }
}

// ── 初始化 WxPay 实例（懒加载） ──────────────────────────────
let _wxPay = null;

/**
 * 获取 WxPay 实例（首次调用时初始化）
 * @returns {Wechatpay}
 */
function getWxPay() {
  if (_wxPay) return _wxPay;

  const appid          = process.env.WX_APPID;
  const mchid          = process.env.WX_MCHID;
  const serialNo       = process.env.WX_SERIAL_NO;
  const privateKeyPath = process.env.WX_PRIVATE_KEY_PATH;
  const publicKeyPath  = process.env.WX_PUBLIC_KEY_PATH;
  const publicKeyId    = process.env.WX_PUBLIC_KEY_ID;

  if (!appid || !mchid || !serialNo || !privateKeyPath) {
    throw new Error('[WxPay] 微信支付环境变量未配置（WX_APPID/WX_MCHID/WX_SERIAL_NO/WX_PRIVATE_KEY_PATH）');
  }

  const privateKey = readFile('WX_PRIVATE_KEY_PATH', privateKeyPath);

  // 商户API公钥模式：需要传入公钥内容和公钥 ID
  const publicKey = publicKeyPath ? readFile('WX_PUBLIC_KEY_PATH', publicKeyPath) : undefined;

  _wxPay = new Wechatpay({
    appid,
    mchid,
    privateKey,
    // serial_no 直接传入，SDK 会跳过 getSN（getSN 只支持 X.509 格式，不支持 RSA 公钥）
    serial_no: serialNo,
    // 商户API公钥模式：publicKey 为 RSA 公钥内容，serial_no 为公钥 ID
    ...(publicKey && publicKeyId ? {
      publicKey,
      publicKeyId,
    } : {
      // 兜底：传统 APIv3 对称密钥模式
      key: process.env.WX_API_V3_KEY || '',
    }),
  });

  return _wxPay;
}

/**
 * 创建微信 Native 支付订单（扫码支付）
 * @param {string} outTradeNo      商户侧唯一订单号（Order.id）
 * @param {number} amount          金额（分，如 6000 = 60元）
 * @param {string} description     商品描述
 * @param {number} [expireSeconds] 订单有效期（秒），默认 310s（比前端 5 分钟略长）
 * @returns {Promise<string>}      codeUrl（二维码内容，前端用 qrcode 渲染）
 */
async function createNativeOrder(outTradeNo, amount, description, expireSeconds = 310) {
  const wxPay = getWxPay();
  const notifyUrl = process.env.WX_NOTIFY_URL;
  if (!notifyUrl) throw new Error('[WxPay] WX_NOTIFY_URL 未配置');

  // 微信要求 time_expire 格式：RFC3339，如 2018-06-08T10:34:56+08:00
  const expireAt = new Date(Date.now() + expireSeconds * 1000);
  const timeExpire = expireAt.toISOString().replace('Z', '+08:00')
    .replace(/\.\d{3}/, ''); // 去掉毫秒部分

  const result = await wxPay.transactions_native({
    description,
    out_trade_no: outTradeNo,
    notify_url:   notifyUrl,
    time_expire:  timeExpire,
    amount: {
      total:    amount,
      currency: 'CNY',
    },
  });

  // SDK 返回格式：{ status: 200, data: { code_url: "weixin://..." } }
  const codeUrl = result?.data?.code_url || result?.code_url;
  if (!codeUrl) {
    throw new Error(`[WxPay] 创建订单失败: ${JSON.stringify(result)}`);
  }

  return codeUrl;
}

/**
 * 验证微信支付回调签名并解密业务数据
 * @param {object} headers    请求头（含微信签名头）
 * @param {string} rawBody    原始请求体字符串
 * @returns {Promise<object>} 解密后的业务数据（含 out_trade_no, trade_state 等）
 */
async function verifyAndDecodeNotify(headers, rawBody) {
  const wxPay = getWxPay();

  const verified = await wxPay.verifySign({
    body:      rawBody,
    signature: headers['wechatpay-signature'],
    serial:    headers['wechatpay-serial'],
    nonce:     headers['wechatpay-nonce'],
    timestamp: headers['wechatpay-timestamp'],
  });

  if (!verified) throw new Error('[WxPay] 回调签名验证失败');

  // 解密 resource 字段
  const body = JSON.parse(rawBody);
  const { ciphertext, nonce, associated_data } = body.resource;
  const decrypted = wxPay.decipher_gcm(ciphertext, nonce, associated_data);
  return JSON.parse(decrypted);
}

/**
 * 主动查询订单状态
 * @param {string} outTradeNo  商户侧订单号
 * @returns {Promise<object>}  微信返回的订单数据，含 trade_state
 */
async function queryOrder(outTradeNo) {
  const wxPay = getWxPay();
  const mchid = process.env.WX_MCHID;
  return wxPay.query({ out_trade_no: outTradeNo, mchid });
}

/**
 * 创建微信支付退款申请
 * @param {string} outTradeNo   原支付订单号
 * @param {string} outRefundNo  退款单号（商户侧唯一）
 * @param {number} totalAmount  原订单总金额（分）
 * @param {number} refundAmount 退款金额（分）
 * @param {string} reason       退款原因
 */
async function refundOrder(outTradeNo, outRefundNo, totalAmount, refundAmount, reason) {
  const wxPay = getWxPay();
  const result = await wxPay.refunds({
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    reason,
    amount: {
      refund: refundAmount,
      total: totalAmount,
      currency: 'CNY',
    },
  });
  return result;
}

export { createNativeOrder, verifyAndDecodeNotify, queryOrder, refundOrder };
