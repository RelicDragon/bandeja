/**
 * PRD 362 — wiring pins for the two ~2 000-line pages a rematch passes through.
 *
 * `GameDetailsShell` and `CreateGame` have no seam a unit test can render, so
 * these assertions read the source: Duplicate must be gated on
 * `resultsStatus === 'NONE'` (FINAL games get "Play with this group again"
 * instead), the rematch button must be mounted where the results share card is
 * not (TRAINING and BAR), the wrapper must forward the invitee users and the
 * trainer, and the post-create invite loop must send the trainer invite as a
 * trainer. Same technique PRD 360 used for the create payload.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('PRD 362 wiring', () => {
  describe('GameDetailsShell', () => {
    const shell = read('src/pages/GameDetailsShell.tsx');

    it('renders the Duplicate card only while results are NONE', () => {
      const duplicateGate = shell.match(/\{user && canEdit && !isLeague && ([^?]+)\? \(\s*<div key="duplicate-game"/);
      expect(duplicateGate, 'duplicate-game block').not.toBeNull();
      expect(duplicateGate![1]).toContain("game.resultsStatus === 'NONE'");
      expect(duplicateGate![1]).not.toContain("!== 'IN_PROGRESS'");
    });

    it('mounts the rematch button in the TRAINING and BAR FINAL blocks', () => {
      const training = shell.indexOf('key="training-results"');
      const bar = shell.indexOf('key="bar-participants"');
      expect(training).toBeGreaterThan(-1);
      expect(bar).toBeGreaterThan(-1);
      expect(shell.slice(training, training + 600)).toContain('<PlayWithGroupAgainButton game={game} />');
      expect(shell.slice(bar, bar + 600)).toContain('<PlayWithGroupAgainButton game={game} />');
      expect(shell).toContain(
        "import { PlayWithGroupAgainButton } from '@/components/GameDetails/PlayWithGroupAgainButton';",
      );
    });
  });

  describe('GameResultsShareCard', () => {
    const card = read('src/components/GameDetails/GameResultsShareCard.tsx');

    it('no longer renders the old Play again and delegates to the rematch button', () => {
      expect(card).not.toContain('playAgainCta');
      expect(card).not.toContain('buildDuplicateGameInitialData');
      expect(card).toContain('<PlayWithGroupAgainButton game={game} />');
    });
  });

  describe('CreateGameWrapper → CreateGame', () => {
    const wrapper = read('src/pages/CreateGameWrapper.tsx');
    const create = read('src/pages/CreateGame.tsx');

    it('forwards the rematch state fields', () => {
      for (const line of [
        'initialInvitedPlayerIds={state?.invitedPlayerIds}',
        'initialInvitedPlayers={state?.invitedPlayers}',
        'initialTrainerInviteId={state?.invitedTrainerId}',
        'initialCreatorNonPlaying={state?.creatorNonPlaying}',
        'rematchOf={state?.rematchOf}',
      ]) {
        expect(wrapper).toContain(line);
      }
    });

    it('seeds invitee chips from the passed users and keeps them when the store lacks a player', () => {
      expect(create).toContain('useState<BasicUser[]>(() => initialInvitedPlayers)');
      expect(create).toContain('.map((id) => users[id] ?? fallbackById.get(id))');
    });

    it('sends the previous trainer an asTrainer invite unless the creator coaches', () => {
      const loop = create.slice(create.indexOf('for (const receiverId of invitedPlayerIds)'));
      const send = loop.slice(0, loop.indexOf('});') + 3);
      expect(send).toContain('asTrainer:');
      expect(send).toContain("entityType === 'TRAINING'");
      expect(send).toContain('receiverId === initialTrainerInviteId');
      expect(send).toContain('!creatorNonPlaying');
    });

    it('shows the rematch banner only for a rematch draft', () => {
      expect(create).toContain(
        '{rematchOf ? (\n          <RematchDraftBanner source={rematchOf} inviteeCount={invitedPlayerIds.length} />\n        ) : null}',
      );
    });

    it('drops blocked users from a preselected roster before the rows render', () => {
      expect(create).toContain("import { blockedUsersApi } from '@/api/blockedUsers';");
      expect(create).toContain('blockedUsersApi.getBlockedUserIds().catch(() => [] as string[])');
      expect(create).toContain('const allowedIds = initialInvitedPlayerIds.filter((id) => !blocked.has(id));');
      expect(create).toContain('setInvitedPlayerIds((prev) => prev.filter((id) => !blocked.has(id)));');
    });

    it('marks the previous trainer as the trainer invitee in the Players step', () => {
      expect(create).toContain(
        "trainerInviteId={\n            entityType === 'TRAINING' && !creatorNonPlaying ? initialTrainerInviteId : null\n          }",
      );
    });

    it('does not let a stale default array re-run the invitee effect every render', () => {
      expect(create).toContain('const EMPTY_INVITED_PLAYERS: BasicUser[] = [];');
      expect(create).toContain('initialInvitedPlayers = EMPTY_INVITED_PLAYERS,');
    });
  });

  describe('locales', () => {
    const LOCALES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'];

    it('carry the new copy in all 11 locales and no locale keeps the retired key', () => {
      for (const locale of LOCALES) {
        const results = JSON.parse(read(`src/i18n/locales/${locale}/gameResults.json`)) as {
          gameResults: Record<string, unknown>;
        };
        expect(results.gameResults.playWithGroupAgainCta, locale).toBeTypeOf('string');
        expect(results.gameResults.playWithGroupAgainCaption, locale).toBeTypeOf('string');
        expect(results.gameResults.playAgainCta, locale).toBeUndefined();

        const create = JSON.parse(read(`src/i18n/locales/${locale}/createGame.json`)) as {
          createGame: { rematch: Record<string, string> };
        };
        expect(create.createGame.rematch.title_other, locale).toContain('{{count}}');
        expect(create.createGame.rematch.titleNoInvitees, locale).toBeTypeOf('string');
        expect(create.createGame.rematch.hint, locale).toContain('{{name}}');
      }
    });
  });
});
