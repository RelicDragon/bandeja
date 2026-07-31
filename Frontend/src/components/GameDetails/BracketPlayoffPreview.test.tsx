import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildBracketPlan } from '@/utils/bracketStructure';
import { BracketPlayoffPreview } from './BracketPlayoffPreview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; match?: string }) =>
      (options?.defaultValue ?? _key).replace('{{match}}', options?.match ?? ''),
  }),
}));

vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: () => null,
}));

describe('BracketPlayoffPreview', () => {
  const plan = buildBracketPlan(4, ['a', 'b', 'c', 'd']);
  const standingsById = new Map();

  it('shows the third-place fixture when enabled', () => {
    const html = renderToStaticMarkup(
      <BracketPlayoffPreview
        plan={plan}
        standingsById={standingsById}
        includeThirdPlace
      />
    );

    expect(html).toContain('Third place');
    expect(html).toContain('Loser SF1');
    expect(html).toContain('Loser SF2');
    expect(html.indexOf('Third place')).toBeGreaterThan(html.indexOf('Final'));
    expect(html.match(/<section/g)).toHaveLength(2);
  });

  it('hides the third-place fixture when disabled', () => {
    const html = renderToStaticMarkup(
      <BracketPlayoffPreview plan={plan} standingsById={standingsById} />
    );

    expect(html).not.toContain('Third place');
  });

  it('hides third-place when the bracket is too small to support it', () => {
    const tinyPlan = buildBracketPlan(2, ['a', 'b']);
    const html = renderToStaticMarkup(
      <BracketPlayoffPreview
        plan={tinyPlan}
        standingsById={standingsById}
        includeThirdPlace
      />
    );

    expect(html).not.toContain('Third place');
  });

  it('renders the consolation bracket matches', () => {
    const eightTeamPlan = buildBracketPlan(8, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const html = renderToStaticMarkup(
      <BracketPlayoffPreview
        plan={eightTeamPlan}
        standingsById={standingsById}
        includeConsolationBracket
      />
    );

    expect(html).toContain('Consolation bracket');
    expect(html).toContain('Loser QF1');
    expect(html).toContain('Consolation final');
  });

  it('renders every losers round, grand final, and reset final', () => {
    const eightTeamPlan = buildBracketPlan(8, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const html = renderToStaticMarkup(
      <BracketPlayoffPreview
        plan={eightTeamPlan}
        standingsById={standingsById}
        includeDoubleElimination
      />
    );

    expect(html).toContain('Losers bracket');
    expect(html).toContain('Loser QF1');
    expect(html).toContain('Loser SF2');
    expect(html).toContain('Loser F');
    expect(html).toContain('Grand final');
    expect(html).toContain('Reset final if required');
    expect(html).toContain('Winner GF1');
    expect(html).toContain('Loser GF1');
  });
});
