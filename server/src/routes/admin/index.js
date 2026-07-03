import { Router } from 'express';
import authRouter from './auth.js';
import customersRouter from './customers.js';
import documentsRouter from './documents.js';
import ordersRouter from './orders.js';
import plansRouter from './plans.js';
import configRouter from './config.js';
import agreementsRouter from './agreements.js';
import { requireAdmin } from './auth.js';
import { getAdminMetrics } from '../../services/adminMetrics.js';

const router = Router();
router.use('/auth', authRouter);
router.use(requireAdmin);
router.use('/customers', customersRouter);
router.use('/documents', documentsRouter);
router.use('/orders', ordersRouter);
router.use('/plans', plansRouter);
router.use('/config', configRouter);
router.use('/agreements', agreementsRouter);
router.get('/dashboard', async (_req, res, next) => {
  try { res.json({ metrics: await getAdminMetrics() }); } catch (err) { next(err); }
});
export default router;
