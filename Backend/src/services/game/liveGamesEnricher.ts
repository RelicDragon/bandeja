/**
 * PRD 349 — attaches `liveSummary` to Find / Home / My-tab game cards.
 *
 * Side-effect module: importing it registers the enricher. `liveGames.routes.ts`
 * imports it, and that router is mounted from `routes/index.ts`, so the
 * registration always runs (wave-2 backend scaffold report §7).
 */
import { registerAvailableGamesEnricher } from './availableGamesEnrichment';
import type { AvailableGameEnrichFields } from './availableGamesEnrichment';
import { liveSummariesForGameIds } from './liveGames.service';

registerAvailableGamesEnricher('liveSummary', async (_userId, games) => {
  const ids = games.map((g) => g.id);
  if (ids.length === 0) return {};

  const summaries = await liveSummariesForGameIds(ids);

  const out: Record<string, Partial<AvailableGameEnrichFields>> = {};
  for (const id of ids) {
    // `null` is meaningful: it clears a stale `liveSummary` on a card whose
    // game has since finished or been hidden from the rail.
    out[id] = { liveSummary: summaries[id] ?? null };
  }
  return out;
});
