import * as cron from 'node-cron';
import { WeatherForecastService } from './weatherForecast.service';

/**
 * Keeps Open-Meteo forecast caches warm for cities with upcoming games
 * so Find enrichment never blocks on a cold refresh.
 */
export class WeatherForecastScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start(): void {
    console.log('🌤️  Weather forecast scheduler started (every 30 min)');
    this.cronJob = cron.schedule('*/30 * * * *', () => void this.run());
    void this.run();
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await WeatherForecastService.prewarmUpcomingGameCities();
      if (result.candidates > 0 || result.warmed > 0 || result.failed > 0) {
        console.log(
          `[WeatherForecastScheduler] candidates=${result.candidates} warmed=${result.warmed} skippedFresh=${result.skippedFresh} failed=${result.failed}`,
        );
      }
    } catch (error) {
      console.error('[WeatherForecastScheduler] error:', error);
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Weather forecast scheduler stopped');
    }
  }
}
