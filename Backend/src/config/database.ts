import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Increase max listeners to avoid EventEmitter warnings
// Multiple services (socket, telegram, push notifications, etc.) attach listeners
(prisma as any).setMaxListeners?.(20);

// Set max listeners on the connection if available
const connection = (prisma as any)._engine?.connection;
if (connection?.setMaxListeners) {
  connection.setMaxListeners(20);
}

export default prisma;

