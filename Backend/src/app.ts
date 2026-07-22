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
import { shouldSkipApiRateLimit } from './config/apiRateLimit';
import {
  createCorsOriginDelegate,
  getCorsAllowedOrigins,
} from './config/corsOrigins';
import { buildPublicHealthPayload } from './utils/healthInfo';
import { getResponseBodySize } from './utils/responseSize';

const app: Application = express();

const corsAllowedOrigins = getCorsAllowedOrigins({
  nodeEnv: config.nodeEnv,
  frontendUrl: config.frontendUrl,
  extraOrigins: config.corsAllowedOrigins,
});

app.set('trust proxy', config.trustProxy);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS preflight — allowlisted origins only (never reflect arbitrary / `null`).
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') {
    next();
    return;
  }
  reflectCorsOrigin(req, res);
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

app.use(
  cors({
    origin: createCorsOriginDelegate(corsAllowedOrigins),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cache-Control',
      'Pragma',
      'Expires',
      'Accept',
      'If-None-Match',
      'X-Client-Version',
      'X-Client-Platform',
      'X-E2E-Test',
    ],
    exposedHeaders: ['ETag', 'X-Response-Size'],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  })
);

app.use(
  express.json({
    limit: '5mb',
    verify: (req, _res, buf) => {
      const url =
        ('originalUrl' in req && typeof (req as { originalUrl?: string }).originalUrl === 'string'
          ? (req as { originalUrl: string }).originalUrl
          : req.url) || '';
      if (url.startsWith('/webhooks/replicate')) {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(
  compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }

      const contentType = res.getHeader('Content-Type');
      if (contentType?.toString().includes('application/json')) {
        return true;
      }

      return compression.filter(req, res);
    },
    threshold: 1024,
    level: 6,
  })
);

app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (data: any) {
    const size = getResponseBodySize(data);
    res.setHeader('X-Response-Size', String(size));
    return originalSend.call(this, data);
  };
  next();
});

app.use(e2eTestContextMiddleware);

if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

const limiter = rateLimit({
  windowMs: config.apiRateLimit.windowMs,
  limit: config.apiRateLimit.max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'rateLimit.global',
  },
  keyGenerator: (req) => rateLimitKeyFromRequest(req),
  // Mount-stripped pathname only — never originalUrl (query can embed skip prefixes).
  skip: (req) =>
    shouldSkipApiRateLimit(req.path || '', config.apiRateLimit.skipPathPrefixes),
});

app.use('/api/', limiter);
app.use('/api', recordPresenceActivity);

app.get('/health', (_req, res) => {
  res.json(buildPublicHealthPayload());
});

app.use('/webhooks', replicateWebhookRoutes);

import { getGameMetaTags } from './controllers/metatags.controller';
app.get('/games/:gameId', getGameMetaTags);

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
