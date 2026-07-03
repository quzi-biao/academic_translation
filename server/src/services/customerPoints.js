import prisma from '../config/db.js';

export async function getConfigNumber(key, defaultVal = 0) {
  const row = await prisma.globalConfig.findUnique({ where: { key } });
  return Number(row?.value ?? defaultVal);
}

export async function ensureWallet(customerId) {
  let wallet = await prisma.customerWallet.findUnique({ where: { customerId } });
  if (wallet) return wallet;

  const initPoints = Math.floor(await getConfigNumber('init_points', 0));
  try {
    wallet = await prisma.customerWallet.create({ data: { customerId, balance: initPoints } });
    if (initPoints > 0) {
      await prisma.pointLedger.create({
        data: {
          walletId: wallet.id,
          customerId,
          delta: initPoints,
          balance: initPoints,
          type: 'init',
          reason: '新用户注册赠送初始点数',
        },
      });
    }
    return wallet;
  } catch (e) {
    if (e.code === 'P2002') return prisma.customerWallet.findUnique({ where: { customerId } });
    throw e;
  }
}

export async function getBalance(customerId) {
  const wallet = await ensureWallet(customerId);
  return { walletId: wallet.id, balance: wallet.balance };
}

export async function deductPoints(customerId, points, type, reason, refId = null) {
  if (!customerId || points <= 0) return { ok: false, balance: 0 };
  return prisma.$transaction(async (tx) => {
    let wallet = await tx.customerWallet.findUnique({ where: { customerId } });
    if (!wallet) wallet = await tx.customerWallet.create({ data: { customerId, balance: 0 } });
    if (wallet.balance < points) return { ok: false, balance: wallet.balance, insufficient: true };
    const newBalance = wallet.balance - points;
    await tx.customerWallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
    await tx.pointLedger.create({
      data: { walletId: wallet.id, customerId, delta: -points, balance: newBalance, type, reason, refId },
    });
    return { ok: true, balance: newBalance };
  });
}

export async function addPoints(customerId, points, type, reason, refId = null) {
  if (!customerId || points <= 0) return { ok: false, balance: 0 };
  return prisma.$transaction(async (tx) => {
    let wallet = await tx.customerWallet.findUnique({ where: { customerId } });
    if (!wallet) wallet = await tx.customerWallet.create({ data: { customerId, balance: 0 } });
    const newBalance = wallet.balance + points;
    await tx.customerWallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
    await tx.pointLedger.create({
      data: { walletId: wallet.id, customerId, delta: points, balance: newBalance, type, reason, refId },
    });
    return { ok: true, balance: newBalance };
  });
}

export async function estimateTranslationCost(text) {
  const perThousand = await getConfigNumber('points_per_1000_chars', 1);
  const minCost = await getConfigNumber('translation_min_points', 1);
  const chars = [...(text || '')].length;
  return Math.max(minCost, Math.ceil((chars / 1000) * perThousand));
}
