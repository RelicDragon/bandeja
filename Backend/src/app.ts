import express, { Application } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import replicateWebhookRoutes from './routes/replicateWebhook.routes';
import { rateLimitKeyFromRequest } from './utils/rateLimitClientKey';
import { errorHandler, notFoundHandler, reflectCorsOrigin } from './middleware/errorHandler';
import { recordPresenceActivity } from './middleware/recordPresenceActivity';
import { e2eTestContextMiddleware } from './middleware/e2eTestContext';
import { config } from './config/env';
import { buildHealthPayload } from './utils/healthInfo';

const app: Application = express();

app.set('trust proxy', config.trustProxy);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Handle CORS preflight for all paths (incl. file:// Admin where Origin is "null").
// Express 5 / path-to-regexp v8 rejects bare `*`; method middleware preserves behavior.
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') {
    next();
    return;
  }
  reflectCorsOrigin(req, res);
  if (!res.getHeader('Access-Control-Allow-Origin')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

// Configure CORS for API routes (reflect request Origin, including "null")
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cache-Control',
      'Pragma',
      'Expires',
      'Accept',
      'X-Client-Version',
      'X-Client-Platform',
      'X-E2E-Test',
    ],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(compression());
app.use(e2eTestContextMiddleware);

if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'development' ? 10000 : 10000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  skip: (req) => {
    const p = req.path || '';
    return (
      p.includes('/logs/stream') ||
      p.includes('/auth/login') ||
      p.includes('/auth/register') ||
      p.includes('/auth/refresh')
    );
  },
});

app.use('/api/', limiter);
app.use('/api', recordPresenceActivity);

app.get('/health', (_req, res) => {
  res.json(buildHealthPayload());
});

app.use('/webhooks', replicateWebhookRoutes);

import { getGameMetaTags } from './controllers/metatags.controller';
app.get('/games/:gameId', getGameMetaTags);

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

