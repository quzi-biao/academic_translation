/**
 * points.js — 学习点数服务
 *
 * checkBalance(deviceId)          查询当前余额
 * requirePoints(deviceId, res)    余额检查中间件（≤0 返回 402，返回 false）
 * deductPoints(deviceId, delta, type, reason)  扣点（delta 为负整数）
 * getPointCost(key)               读取 GlobalConfig 中的点数配置
 */

import prisma from '../config/db.js';

/**
 * 读取 GlobalConfig 数值配置
 * @param {string} key
 * @param {number} defaultVal
 * @returns {Promise<number>}
 */
async function getPointCost(key, defaultVal = 0) {
  const row = await prisma.globalConfig.findUnique({ where: { key } });
  return parseFloat(row?.value ?? defaultVal);
}

/**
 * 查询设备当前点数余额，若钱包不存在则以 init_points 自动创建
 * @param {string} deviceId
 * @returns {Promise<{balance:number, walletId:string|null}>}
 */
async function checkBalance(deviceId) {
  let wallet = await prisma.deviceWallet.findUnique({ where: { deviceId } });

  if (!wallet) {
    // 老设备没有钱包 → 懒创建，赠送 init_points
    const initPoints = parseInt(await getPointCost('init_points', 100), 10);
    try {
      wallet = await prisma.deviceWallet.create({
        data: {
          deviceId,
          balance: initPoints,
          ledger: {
            create: {
              deviceId,
              delta: initPoints,
              balance: initPoints,
              type: 'init',
              reason: '设备首次使用自动赠送初始点数',
            },
          },
        },
      });
      console.log(`[points] 懒创建钱包 device:${deviceId}，初始点数 ${initPoints}`);
    } catch (e) {
      // P2002 = 并发冲突（另一请求同时创建了钱包）→ 重新查询
      if (e.code === 'P2002') {
        wallet = await prisma.deviceWallet.findUnique({ where: { deviceId } });
      } else {
        console.error('[points] 懒创建钱包失败:', e.message);
        return { balance: 0, walletId: null };
      }
    }
  }

  return { balance: wallet?.balance ?? 0, walletId: wallet?.id ?? null };
}

/**
 * 余额前置检查：余额 ≤ 0 时写 402 响应并返回 false
 * 只对设备 Token（deviceId 存在）有效；用户 Token 直接放行
 * 钱包不存在时自动创建（赠送 init_points）
 * @param {string|null} deviceId
 * @param {import('express').Response} res
 * @returns {Promise<boolean>} true = 可继续；false = 已响应 402
 */
async function requirePoints(deviceId, res) {
  if (!deviceId) return true; // 用户 Token，不限制点数

  try {
    const { balance } = await checkBalance(deviceId);
    if (balance <= 0) {
      res.status(402).json({ error: '点数不足，请联系客服充值', balance });
      return false;
    }
    return true;
  } catch (err) {
    console.error('[points] checkBalance 失败:', err.message);
    return true; // 查询失败不阻断请求
  }
}

/**
 * 原子扣点：更新余额 + 写流水（事务）
 * 异步执行，不阻塞主流程；扣点失败只打日志
 * @param {string} deviceId
 * @param {number} delta       负整数，如 -10
 * @param {string} type        类型标识，如 'image' | 'tts' | 'text'
 * @param {string} reason      人类可读描述
 * @returns {Promise<{ok:boolean, balance:number}>}
 */
async function deductPoints(deviceId, delta, type, reason) {
  if (!deviceId || delta >= 0) return { ok: false, balance: 0 };

  try {
    const { walletId, balance: currentBalance } = await checkBalance(deviceId);
    if (!walletId) return { ok: false, balance: 0 };

    const newBalance = currentBalance + delta;

    await prisma.$transaction([
      prisma.deviceWallet.update({
        where: { id: walletId },
        data:  { balance: { increment: delta } },
      }),
      prisma.pointLedger.create({
        data: {
          walletId,
          deviceId,
          delta,
          balance: newBalance,
          type,
          reason,
        },
      }),
    ]);

    console.log(`[points] 设备 ${deviceId} 扣点 ${delta}，余额 ${newBalance}（${reason}）`);
    return { ok: true, balance: newBalance };
  } catch (err) {
    console.error('[points] deductPoints 失败:', err.message);
    return { ok: false, balance: 0 };
  }
}

export { getPointCost, checkBalance, requirePoints, deductPoints };
