/**
 * PRD 360 — "Novices welcome" in the create flow.
 *
 * Covers the three ways this can go wrong without anyone noticing: the row
 * appearing on an entity type that cannot carry the promise, the hint that says
 * the level range still applies being hidden behind the notes button while the
 * switch is on, and the create payload quietly dropping the flag so the game is
 * created untagged with the switch showing "on".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '@/types';

let showNotes = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../ToggleSwitch', () => ({
  ToggleSwitch: ({ checked }: { checked: boolean }) => (
    <button type="button" data-toggle={checked ? 'on' : 'off'} />
  ),
}));

vi.mock('../Divider', () => ({ Divider: () => null }));

vi.mock('@/hooks/useShowSettingsNotes', () => ({
  useShowSettingsNotes: () => ({ showNotes, toggleShowNotes: () => {} }),
}));

vi.mock('@/components/gameSettings', () => ({
  CollapsibleSettingsShell: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));

const { GameSettingsSection } = await import('./GameSettingsSection');

const TITLE = 'createGame.suitableForNovices.title';
const HINT = 'createGame.suitableForNovices.hint';

function render(entityType: EntityType, suitableForNovices = false) {
  return renderToStaticMarkup(
    <GameSettingsSection
      isPublic
      isRatingGame
      anyoneCanInvite={false}
      resultsByAnyone={false}
      allowDirectJoin={false}
      afterGameGoToBar={false}
      suitableForNovices={suitableForNovices}
      participantsOnlyChat={false}
      entityType={entityType}
      onPublicChange={() => {}}
      onRatingGameChange={() => {}}
      onAnyoneCanInviteChange={() => {}}
      onResultsByAnyoneChange={() => {}}
      onAllowDirectJoinChange={() => {}}
      onAfterGameGoToBarChange={() => {}}
      onSuitableForNovicesChange={() => {}}
      onParticipantsOnlyChatChange={() => {}}
    />,
  );
}

describe('create flow — novices welcome toggle', () => {
  it('renders after the anyone-can-invite row, off by default', () => {
    showNotes = true;
    const html = render('GAME');
    const anyoneCanInvite = html.indexOf('createGame.anyoneCanInvite.title');
    const novices = html.indexOf(TITLE);
    expect(anyoneCanInvite).toBeGreaterThan(-1);
    expect(novices).toBeGreaterThan(anyoneCanInvite);
    expect(html).toContain('data-toggle="off"');
  });

  it('keeps the "level range still applies" hint on screen while the switch is on', () => {
    showNotes = false;
    expect(render('GAME', false)).not.toContain(HINT);
    expect(render('GAME', true)).toContain(HINT);
  });

  it('only offers the promise on entity types that can make it', () => {
    showNotes = true;
    for (const entityType of ['GAME', 'TOURNAMENT', 'TRAINING', 'BAR'] as const) {
      expect(render(entityType)).toContain(TITLE);
    }
    for (const entityType of ['LEAGUE', 'LEAGUE_SEASON', 'EVENT'] as const) {
      expect(render(entityType)).not.toContain(TITLE);
    }
  });

  /*
   * The create page is a 2 000-line component with no seam to render in a test,
   * so the payload link is pinned at the source level instead — the same
   * approach the Find card projection contract uses on the backend. Without it,
   * the toggle above can keep working while the created game is never tagged.
   */
  it('threads the switch into the create payload', () => {
    const source = readFileSync(
      path.join(__dirname, '..', '..', 'pages', 'CreateGame.tsx'),
      'utf8',
    );
    expect(source).toMatch(/const \[suitableForNovices, setSuitableForNovices\] = useState<boolean>\(\s*initialGameData\?\.suitableForNovices \?\? false,/);
    expect(source).toContain('suitableForNovices,\n        name: gameName');
    expect(source).toContain('suitableForNovices={suitableForNovices}');
    expect(source).toContain('onSuitableForNovicesChange={setSuitableForNovices}');
  });
});
