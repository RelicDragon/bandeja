import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
  
  if (EventEmitter.defaultMaxListeners < 20) {
    EventEmitter.defaultMaxListeners = 20;
  }
}

export default prisma;

