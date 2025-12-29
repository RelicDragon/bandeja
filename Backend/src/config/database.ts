import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

EventEmitter.defaultMaxListeners = 20;

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export default prisma;

