import * as cron from 'node-cron';
import { PlayIntentService } from './playIntent/playIntent.service';
import { MatchProposalService } from './playIntent/matchProposal.service';
import { InviteService } from './invite.service';
import { PlayIntentMatchService } from './playIntent/playIntentMatch.service';

export class PlayIntentScheduler {
  private expireCron: cron.ScheduledTask | null = null;
  private expireRunning = false;

  start() {
    this.expireCron = cron.schedule('*/5 * * * *', async () => {
      if (this.expireRunning) return;
      this.expireRunning = true;
      try {
        const invites = await InviteService.expireDueInvites();
        const intents = await PlayIntentService.expireDueIntents();
        const proposals = await MatchProposalService.expireDue();
        const matches = await PlayIntentMatchService.runClusterPass();
        if (invites > 0 || intents > 0 || proposals > 0 || matches > 0) {
          console.log(
            `[PlayIntentScheduler] Expired invites=${invites} intents=${intents} proposals=${proposals}; proposals created=${matches}`,
          );
        }
      } catch (err) {
        console.error('[PlayIntentScheduler] expire error:', err);
      } finally {
        this.expireRunning = false;
      }
    });

    console.log('🎾 Play Intent scheduler started (expire/reconcile: 5m)');
  }

  stop() {
    this.expireCron?.stop();
    this.expireCron = null;
    console.log('🛑 Play Intent scheduler stopped');
  }
}
