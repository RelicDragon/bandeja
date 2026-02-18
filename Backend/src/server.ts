import app from './app';
import { config } from './config/env';
import prisma from './config/database';
import { initializeLogManager } from './controllers/logs.controller';
import SocketService from './services/socket.service';
import telegramBotService from './services/telegram/bot.service';
import pushNotificationService from './services/push/push-notification.service';
import { GameStatusScheduler } from './services/gameStatusScheduler.service';
import { TelegramGamesScheduler } from './services/telegram/gamesScheduler.service';
import { CurrencyScheduler } from './services/currencyScheduler.service';
import { AuctionScheduler } from './services/auctionScheduler.service';
import { DraftScheduler } from './services/draftScheduler.service';
import { reportCriticalError, maybeReportFromConsole } from './services/developerAlert.service';
import { createServer } from 'http';

const startServer = async () => {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    setImmediate(() => reportCriticalError(reason, 'unhandledRejection').catch(() => {}));
  });
  process.on('uncaughtException', (err: Error) => {
    console.error('Uncaught Exception:', err);
    setImmediate(() => reportCriticalError(err, 'uncaughtException').catch(() => {}));
  });

  try {
    initializeLogManager();
    console.log('📋 Log manager initialized');

    await prisma.$connect();
    console.log('✅ Database connected successfully');

    await telegramBotService.initialize();
    pushNotificationService.initialize();

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      originalConsoleError.apply(console, args);
      if (args[0] instanceof Error) setImmediate(() => maybeReportFromConsole(args[0]));
    };

    const gameStatusScheduler = new GameStatusScheduler();
    gameStatusScheduler.start();

    const telegramGamesScheduler = new TelegramGamesScheduler();
    telegramGamesScheduler.start();

    const currencyScheduler = new CurrencyScheduler();
    currencyScheduler.start();

    const auctionScheduler = new AuctionScheduler();
    auctionScheduler.start();

    const draftScheduler = new DraftScheduler();
    draftScheduler.start();

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

      try {
        await socketService.close();
        console.log('Socket.IO closed');
      } catch (e) {
        console.error('Error closing Socket.IO:', e);
      }

      server.close(async () => {
        console.log('HTTP server closed');

        gameStatusScheduler.stop();
        telegramGamesScheduler.stop();
        currencyScheduler.stop();
        auctionScheduler.stop();
        draftScheduler.stop();
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

