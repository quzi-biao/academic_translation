import prisma from '../config/db.js';

export async function getAdminMetrics() {
  const [customerCount, documentCount, completedDocuments, orders, paidOrders, refundedOrders, tickets] = await Promise.all([
    prisma.customer.count(),
    prisma.translationDocument.count(),
    prisma.translationDocument.count({ where: { status: 'completed' } }),
    prisma.order.count(),
    prisma.order.count({ where: { status: 'paid' } }),
    prisma.order.count({ where: { status: 'refunded' } }),
    prisma.supportTicket.count(),
  ]);
  const [totalRevenueRaw, recentOrders, recentDocuments] = await Promise.all([
    prisma.$queryRaw`SELECT COALESCE(SUM(amount), 0) AS val FROM orders WHERE status = 'paid'`,
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { customer: { select: { username: true, phone: true, email: true } }, plan: true } }),
    prisma.translationDocument.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { customer: { select: { username: true, phone: true, email: true } } } }),
  ]);
  return { customerCount, documentCount, completedDocuments, orders, paidOrders, refundedOrders, tickets, revenueFen: Number(totalRevenueRaw[0]?.val ?? 0), recentOrders, recentDocuments };
}
