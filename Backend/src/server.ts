import app from './app';
import { config } from './config/env';
import prisma from './config/database';
import { initializeLogManager } from './controllers/logs.controller';
import SocketService from './services/socket.service';
import telegramBotService from './services/telegram/bot.service';
import pushNotificationService from './services/push/push-notification.service';
import { GameStatusScheduler } from './services/gameStatusScheduler.service';
import { createServer } from 'http';

const startServer = async () => {
  try {
    initializeLogManager();
    console.log('📋 Log manager initialized');

    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    const engine = (prisma as any)._engine;
    if (engine) {
      if (typeof engine.setMaxListeners === 'function') {
        engine.setMaxListeners(20);
      }
      
      const connection = engine.connection;
      if (connection && typeof connection.setMaxListeners === 'function') {
        connection.setMaxListeners(20);
      }
    }

    await telegramBotService.initialize();
    pushNotificationService.initialize();

    const gameStatusScheduler = new GameStatusScheduler();
    gameStatusScheduler.start();

    // Create HTTP server
    const httpServer = createServer(app);
    
    // Initialize Socket.IO
    const socketService = new SocketService(httpServer);
    console.log('🔌 Socket.IO service initialized');
    
    // Make socket service available globally
    (global as any).socketService = socketService;

    const server = httpServer.listen(config.port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${config.port} in ${config.nodeEnv} mode`);
      console.log(`📍 Health check: http://localhost:${config.port}/health`);
      console.log(`📍 API endpoints: http://localhost:${config.port}/api`);
      console.log(`🔌 Socket.IO server ready`);
    });

    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('HTTP server closed');
        
        gameStatusScheduler.stop();
        telegramBotService.stop();
        pushNotificationService.shutdown();
        
        await prisma.$disconnect();
        console.log('Database connection closed');
        
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

