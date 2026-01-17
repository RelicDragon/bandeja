import jwt from 'jsonwebtoken';
import { config } from '../config/env';

interface JwtPayload {
  userId: string;
  phone?: string;
  telegramId?: string;
  appleId?: string;
  isAdmin?: boolean;
}

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
};

