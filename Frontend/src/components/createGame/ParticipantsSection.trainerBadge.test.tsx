/**
 * PRD 362 — a TRAINING rematch re-invites the previous trainer *as trainer*.
 * Their row in the Players step must say so, and nobody else's may.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BasicUser } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; defaultValue?: string }) =>
      key === 'playerCard.isTrainer' ? 'Trainer' : (opts?.defaultValue ?? key),
  }),
}));

vi.mock('@/components', () => ({
  Button: ({ children }: React.PropsWithChildren) => <button type="button">{children}</button>,
  PlayerAvatar: ({ player }: { player: BasicUser | null }) => <span data-avatar={player?.id ?? 'empty'} />,
  RangeSlider: () => null,
}));

vi.mock('@/components/PremiumName', () => ({
  PremiumName: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));

const { ParticipantsSection } = await import('./ParticipantsSection');

const user = (id: string, firstName: string): BasicUser =>
  ({ id, firstName, lastName: 'X', level: 3 }) as unknown as BasicUser;

function render(props: {
  invitedPlayers: BasicUser[];
  trainerInviteId: string | null;
}) {
  return renderToStaticMarkup(
    <ParticipantsSection
      participants={[null, null, null, null]}
      maxParticipants={4}
      invitedPlayerIds={props.invitedPlayers.map((p) => p.id)}
      invitedPlayers={props.invitedPlayers}
      trainerInviteId={props.trainerInviteId}
      user={user('me', 'Me')}
      entityType="TRAINING"
      canInvitePlayers
      onMaxParticipantsChange={() => {}}
      onAddUserToGame={() => {}}
      onRemoveParticipant={() => {}}
      onOpenInviteModal={() => {}}
    />,
  );
}

describe('ParticipantsSection trainer invitee badge', () => {
  it('shows the Trainer badge on the trainer invitee row only', () => {
    const html = render({
      invitedPlayers: [user('p1', 'Ana'), user('coach', 'Coach')],
      trainerInviteId: 'coach',
    });
    expect(html.match(/data-testid="invitee-trainer-badge"/g)).toHaveLength(1);
    const badgeAt = html.indexOf('data-testid="invitee-trainer-badge"');
    const coachAt = html.indexOf('Coach');
    const anaAt = html.indexOf('Ana');
    expect(coachAt).toBeGreaterThan(-1);
    // The badge sits inside the Coach row: after "Coach", before nothing of Ana's row.
    expect(badgeAt).toBeGreaterThan(coachAt);
    expect(anaAt).toBeLessThan(badgeAt);
    expect(html.slice(badgeAt, html.indexOf('</span>', badgeAt) + 7)).toContain('Trainer');
  });

  it('shows no badge without a trainer invitee', () => {
    const html = render({ invitedPlayers: [user('p1', 'Ana')], trainerInviteId: null });
    expect(html).not.toContain('invitee-trainer-badge');
  });
});
