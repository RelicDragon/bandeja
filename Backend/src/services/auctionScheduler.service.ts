import * as cron from 'node-cron';
import { MarketItemBidService } from './marketItem/marketItemBid.service';

export class AuctionScheduler {
  private endCron: cron.ScheduledTask | null = null;
  private hollandCron: cron.ScheduledTask | null = null;

  start() {
    this.endCron = cron.schedule('* * * * *', async () => {
      try {
        const n = await MarketItemBidService.resolveEndedAuctions();
        if (n > 0) console.log(`[AuctionScheduler] Resolved ${n} ended auction(s)`);
      } catch (err) {
        console.error('[AuctionScheduler] resolveEndedAuctions error:', err);
      }
    });
    this.hollandCron = cron.schedule('*/5 * * * *', async () => {
      try {
        const n = await MarketItemBidService.tickHollandPrices();
        if (n > 0) console.log(`[AuctionScheduler] Tick ${n} Holland price(s)`);
      } catch (err) {
        console.error('[AuctionScheduler] tickHollandPrices error:', err);
      }
    });
    console.log('🔨 Auction scheduler started (end: every min, Holland: every 5 min)');
  }

  stop() {
    if (this.endCron) {
      this.endCron.stop();
      this.endCron = null;
    }
    if (this.hollandCron) {
      this.hollandCron.stop();
      this.hollandCron = null;
    }
    console.log('🛑 Auction scheduler stopped');
  }
}
