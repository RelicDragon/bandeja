import { config } from './config/env';
import { assertProductionJwtAuthConfig } from './config/jwtAuthConfig';
import {
  connectWorkersDatabase,
  disconnectWorkersDatabase,
  startQueueWorkers,
  stopQueueWorkers,
} from './workers/startQueueWorkers';

const run = async () => {
  try {
    assertProductionJwtAuthConfig({
      nodeEnv: config.nodeEnv,
      jwtSecret: config.jwtSecret,
      jwtAccessExpiresIn: config.jwtAccessExpiresIn,
      refreshTokenExpiresIn: config.refreshTokenExpiresIn,
      refreshTokenEnabled: config.refreshTokenEnabled,
      legacyJwtIssuanceEndAt: config.legacyJwtIssuanceEndAt,
    });
    await connectWorkersDatabase();
    console.log('✅ Database connected (worker process)');
    startQueueWorkers();
    console.log('🌐 Translation queue worker started');
    console.log('🎨 Results artifacts queue worker started');
  } catch (error) {
    console.error('Failed to start worker process:', error);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Stopping queue workers...`);
    stopQueueWorkers();
    await disconnectWorkersDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

void run();
