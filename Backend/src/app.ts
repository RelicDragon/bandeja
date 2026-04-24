import express, { Application } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { errorHandler, notFoundHandler, reflectCorsOrigin } from './middleware/errorHandler';
import { recordPresenceActivity } from './middleware/recordPresenceActivity';
import { config } from './config/env';

const app: Application = express();

app.set('trust proxy', ['10.0.0.0/8', '127.0.0.1', '::1']);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Handle CORS preflight (incl. file:// Admin where Origin is the literal string "null")
app.options('*', (req, res) => {
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
    ],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(compression());

if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'development' ? 10000 : 10000,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => req.path.includes('/logs/stream'),
});

app.use('/api/', limiter);
app.use('/api', recordPresenceActivity);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

import { getGameMetaTags } from './controllers/metatags.controller';
app.get('/games/:gameId', getGameMetaTags);

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

