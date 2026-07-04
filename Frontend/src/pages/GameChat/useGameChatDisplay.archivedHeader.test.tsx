import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameChatDisplay } from './useGameChatDisplay';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) =>
        ({
          'chat.archivedGameChatBanner': 'This game was cancelled. Chat is read-only.',
          'gameDetails.gameCancelledTitle': 'Cancelled',
          'gameDetails.cancelledBy': 'Cancelled by',
          'gameDetails.datetimeNotSet': 'Time is not set yet',
        })[key] ?? key,
    }),
  };
});

vi.mock('./useGroupChannelOnlineCount', () => ({
  useGroupChannelOnlineCount: () => null,
}));

vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: () => null,
}));

vi.mock('./GameChatGameTitle', () => ({
  GameChatGameTitlePrimary: () => null,
  GameChatGameTitleMeta: () => null,
}));

function SubtitleProbe({
  isGameChatArchived,
  archivedGameMeta,
}: {
  isGameChatArchived: boolean;
  archivedGameMeta?: import('@/utils/cancelledGameChatStub').ArchivedGameChatMeta | null;
}) {
  const { subtitle } = useGameChatDisplay({
    contextType: 'GAME',
    game: {
      id: 'g1',
      entityType: 'GAME',
      gameType: 'CLASSIC',
      name: 'Morning match',
      timeIsSet: false,
    } as import('@/types').Game,
    bug: null,
    userChat: null,
    groupChannel: null,
    groupChannelParticipantsCount: 0,
    isBugChat: false,
    isItemChat: false,
    userId: 'u-me',
    displaySettings: {} as import('@/utils/displayPreferences').ResolvedDisplaySettings,
    onOpenItemPage: () => {},
    onOpenParticipantsPage: () => {},
    isGameChatArchived,
    archivedGameMeta,
  });

  return <div>{subtitle}</div>;
}

describe('useGameChatDisplay archived header', () => {
  it('renders cancellation time and canceller in archived game chat subtitle', () => {
    const html = renderToStaticMarkup(
      <SubtitleProbe
        isGameChatArchived
        archivedGameMeta={{
          cancelledAt: '2026-07-04T07:28:00.000Z',
          cancelledByUser: {
            id: 'u1',
            firstName: 'Alex',
            lastName: 'Stone',
          } as import('@/types').BasicUser,
          chatArchived: true,
        }}
      />
    );

    expect(html).toContain('Cancelled');
    expect(html).toContain('Cancelled by Alex Stone');
  });

  it('keeps active game chat subtitle behavior unchanged', () => {
    const html = renderToStaticMarkup(
      <SubtitleProbe isGameChatArchived={false} archivedGameMeta={null} />
    );

    expect(html).toContain('Time is not set yet');
    expect(html).not.toContain('Cancelled by');
  });
});
