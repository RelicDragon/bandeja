import * as cron from 'node-cron';
import CurrencyService from './currency.service';

/**
 * Currency scheduler service
 * Updates exchange rates from Frankfurter API every 2 hours
 */
export class CurrencyScheduler {
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Start the currency update scheduler
   * Runs every 2 hours
   */
  start() {
    console.log('💱 Currency scheduler started (runs every 2 hours)');

    // Run at minute 0 of every 2nd hour (00:00, 02:00, 04:00, etc.)
    this.cronJob = cron.schedule('0 */2 * * *', async () => {
      await this.updateExchangeRates();
    });

    // Run immediately on startup to ensure we have initial rates
    this.updateExchangeRates();
  }

  /**
   * Update exchange rates from API
   */
  private async updateExchangeRates() {
    try {
      console.log('💱 Updating exchange rates...');
      await CurrencyService.updateRatesFromAPI();
    } catch (error) {
      console.error('❌ Error in currency scheduler:', error);
    }
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Currency scheduler stopped');
    }
  }
}
