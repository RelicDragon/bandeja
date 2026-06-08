import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { EventEmitter } from 'events';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DB_URL;
  if (!connectionString) {
    throw new Error('DB_URL is required for PrismaClient');
  }
  const schema = process.env.DB_SCHEMA || 'padelpulse';
  const adapter = new PrismaPg(
    {
      connectionString,
      options: `-c search_path=${schema}`,
    },
    { schema },
  );
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
  
  if (EventEmitter.defaultMaxListeners < 50) {
    EventEmitter.defaultMaxListeners = 50;
  }
}

export default prisma;

