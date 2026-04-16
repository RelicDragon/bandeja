import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';
import type { AuthRequest } from './auth';

const CORS_ALLOW_HEADERS =
  'Content-Type, Authorization, Cache-Control, Pragma, Expires, Accept';

/** Browsers need this on error JSON too; `Origin: null` = Admin opened as file:// */
export function reflectCorsOrigin(req: Request, res: Response): void {
  const origin = req.get('Origin');
  if (typeof origin === 'string' && origin.length > 0) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.append('Vary', 'Origin');
  }
}

function isChatSyncApiPath(url: string): boolean {
  return url.includes('/chat/sync/');
}

function logChatSyncHttpError(req: Request, err: Error, statusCode: number): void {
  if (!config.chatSyncHttpErrorLog || !isChatSyncApiPath(req.originalUrl || req.url)) return;
  const auth = req as AuthRequest;
  const line = JSON.stringify({
    evt: 'chat_sync_http_error',
    path: req.originalUrl || req.url,
    method: req.method,
    status: statusCode,
    userId: auth.userId ?? null,
    name: err.name,
    message: err.message,
    ts: new Date().toISOString(),
  });
  console.error(line);
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  reflectCorsOrigin(req, res);
  if (err instanceof ApiError) {
    logChatSyncHttpError(req, err, err.statusCode);
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.data && { ...err.data }),
      ...(config.nodeEnv === 'development' && { stack: err.stack }),
    });
  }

  if (err.name === 'MulterError') {
    const code = (err as { code?: string }).code;
    const status = code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      code === 'LIMIT_FILE_SIZE'
        ? 'File too large; pick a smaller image or reduce resolution.'
        : err.message;
    return res.status(status).json({
      success: false,
      message,
      ...(config.nodeEnv === 'development' && { code, stack: err.stack }),
    });
  }

  logChatSyncHttpError(req, err, 500);
  console.error('Unhandled error:', err);

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(config.nodeEnv === 'development' && { 
      error: err.message,
      stack: err.stack 
    }),
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  reflectCorsOrigin(req, res);
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};

