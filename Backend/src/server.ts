import app from './app';
import { config } from './config/env';
import prisma from './config/database';
import { initializeLogManager } from './controllers/logs.controller';
import SocketService from './services/socket.service';
import telegramBotService from './services/telegramBot.service';
import { createServer } from 'http';

const startServer = async () => {
  try {
    initializeLogManager();
    console.log('📋 Log manager initialized');

    await prisma.$connect();
    console.log('✅ Database connected successfully');

    telegramBotService.initialize();

    // Create HTTP server
    const httpServer = createServer(app);
    
    // Initialize Socket.IO
    const socketService = new SocketService(httpServer);
    console.log('🔌 Socket.IO service initialized');
    
    // Make socket service available globally
    (global as any).socketService = socketService;

    const server = httpServer.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port} in ${config.nodeEnv} mode`);
      console.log(`📍 Health check: http://localhost:${config.port}/health`);
      console.log(`📍 API endpoints: http://localhost:${config.port}/api`);
      console.log(`🔌 Socket.IO server ready`);
    });

    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('HTTP server closed');
        
        telegramBotService.stop();
        
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

