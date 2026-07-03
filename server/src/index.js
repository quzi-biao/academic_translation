import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import prisma from './config/db.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import walletRouter from './routes/wallet.js';
import paymentRouter from './routes/payment.js';
import agreementsRouter from './routes/agreements.js';
import ticketsRouter from './routes/tickets.js';
import adminRouter from './routes/admin/index.js';
import { resumeStaleTranslationJobs } from './services/translationJob.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 7000;
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: isProd ? true : ['http://localhost:7001', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'], credentials: true }));
app.set('trust proxy', true);
app.use(morgan(':method :url :status :response-time ms - IP: :remote-addr'));
app.use(express.json({
  limit: '80mb',
  verify: (req, _res, buf) => { req.rawBody = buf?.toString('utf8'); },
}));
app.use(express.urlencoded({ extended: true, limit: '80mb' }));

app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/agreements', agreementsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'wenyi-translation', ts: new Date().toISOString() }));

if (isProd) {
  const webDist = path.resolve(__dirname, '../../web-app/dist');
  const adminDist = path.resolve(__dirname, '../../admin-frontend/dist');
  const websitePath = path.resolve(__dirname, '../../website');
  app.use('/admin', express.static(adminDist));
  app.get('/admin/*', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
  app.use('/app', express.static(webDist));
  app.get('/app/*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  app.use('/', express.static(websitePath));
}

app.get('/', (_req, res) => res.json({ service: '闻一翻译', app: '/app', admin: '/admin' }));

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || err.statusCode || 500).json({ error: err.message || '服务器内部错误' });
});

const server = app.listen(PORT, () => {
  console.log(`闻一翻译 server running on http://localhost:${PORT}`);
  resumeStaleTranslationJobs().catch((err) => {
    console.error('[translationJob] resume failed', err);
  });
});

const keepalive = setInterval(async () => {
  try { await prisma.$queryRaw`SELECT 1`; } catch (e) { console.warn('[DB keepalive]', e.message); }
}, 60_000);
keepalive.unref();

async function shutdown(signal) {
  console.log(`\n[${signal}] shutting down...`);
  clearInterval(keepalive);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
