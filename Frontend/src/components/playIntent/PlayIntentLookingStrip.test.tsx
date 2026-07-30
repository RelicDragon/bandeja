// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('@/components/motion/AnimatedMount', () => ({
  AnimatedMount: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/StatusPulseDot', () => ({
  StatusPulseDot: () => <span />,
}));

vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player: { id: string; firstName?: string } }) => (
    <span data-testid="tiny-player-avatar" data-player-id={player.id}>
      {player.firstName}
    </span>
  ),
}));

describe('PlayIntentLookingStrip', () => {
  it('uses tiny player avatars followed by the remaining count', async () => {
    const { PlayIntentLookingStrip } = await import('./PlayIntentLookingStrip');
    const html = renderToStaticMarkup(
      <PlayIntentLookingStrip
        proposal={false}
        whenLabel="Today"
        emptyPool={false}
        othersCount={14}
        stripMembers={[
          { userId: 'one', firstName: 'One', lastName: 'Player', avatar: '/one.jpg' },
          { userId: 'two', firstName: 'Two', lastName: 'Player', avatar: null },
          { userId: 'three', firstName: 'Three', lastName: 'Player', avatar: '/three.jpg' },
        ]}
        onOpenLobby={vi.fn()}
        onOpenProposal={vi.fn()}
        onConfirmStop={vi.fn()}
      />,
    );

    expect(html.match(/data-testid="tiny-player-avatar"/g)).toHaveLength(2);
    expect(html).toContain('data-player-id="two"');
    expect(html).toContain('12+');
  });
});

describe('PlayIntentIdleCtaCard', () => {
  it('shows nearby player activity before the viewer starts looking', async () => {
    const { PlayIntentIdleCtaCard } = await import('./PlayIntentIdleCtaCard');
    const html = renderToStaticMarkup(
      <PlayIntentIdleCtaCard
        sport="PADEL"
        title="I want to play"
        hint="2 players want to play Today, Tomorrow"
        members={[
          { userId: 'one', firstName: 'One', avatar: '/one.jpg' },
          { userId: 'two', firstName: 'Two', avatar: null },
        ]}
        onClick={vi.fn()}
      />,
    );

    expect(html).toContain('2 players want to play Today, Tomorrow');
    expect(html.match(/data-testid="tiny-player-avatar"/g)).toHaveLength(2);
  });
});
