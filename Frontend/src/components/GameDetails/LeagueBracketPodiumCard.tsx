import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Crown, Medal, Trophy } from 'lucide-react';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { BracketPlayoffGroupDto, BracketSlotParticipantDto } from '@/api/leagues';
import type { LeagueGroup } from '@/api/leagues';
import {
  type BracketPodiumDisplayRow,
  participantLabelFromSlots,
  teamUsersFromParticipant,
} from '@/features/leagueBracket';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';

interface LeagueBracketPodiumCardProps {
  group: BracketPlayoffGroupDto;
  rows: BracketPodiumDisplayRow[];
  groupMeta?: LeagueGroup;
  crossGroupBracket?: boolean;
  fullscreenPath?: string | null;
  showViewLink?: boolean;
}

function podiumLabel(
  row: BracketPodiumDisplayRow,
  t: (key: string, opts?: { index?: number }) => string
): string {
  switch (row.kind) {
    case 'champion':
      return t('gameDetails.bracketPodiumChampion');
    case 'finalist':
      return t('gameDetails.bracketPodiumFinalist');
    case 'thirdPlace':
      return t('gameDetails.bracketPodiumThirdPlace');
    case 'semifinalist':
      return t('gameDetails.bracketPodiumSemifinalist', { index: row.semifinalistIndex ?? 1 });
    default:
      return '';
  }
}

function podiumIcon(kind: BracketPodiumDisplayRow['kind']): ReactNode {
  switch (kind) {
    case 'champion':
      return <Crown className="h-5 w-5 text-amber-500" />;
    case 'finalist':
      return <Trophy className="h-5 w-5 text-gray-400" />;
    case 'thirdPlace':
      return <Medal className="h-5 w-5 text-amber-600" />;
    case 'semifinalist':
      return (
        <span className="flex h-5 w-5 items-center justify-center text-sm font-semibold text-gray-900 dark:text-white">
          4
        </span>
      );
    default:
      return null;
  }
}

function podiumAccent(kind: BracketPodiumDisplayRow['kind'], inProgress: boolean): string {
  if (inProgress) {
    return 'bg-gray-50/50 dark:bg-gray-800/30 ring-1 ring-dashed ring-gray-300/80 dark:ring-gray-600/60';
  }
  if (kind === 'champion') {
    return 'bg-amber-50/90 dark:bg-amber-950/30 ring-1 ring-amber-200/80 dark:ring-amber-900/50';
  }
  return 'bg-gray-50/80 dark:bg-gray-800/50';
}

/** Picks the backend-resolved participant object for a podium row kind, so the
 * name/avatar render even when the bracket slot cache is stale. */
function podiumResolvedParticipant(
  row: BracketPodiumDisplayRow,
  group: BracketPlayoffGroupDto
): BracketSlotParticipantDto | null | undefined {
  switch (row.kind) {
    case 'champion':
      return group.champion;
    case 'finalist':
      return group.finalist;
    case 'thirdPlace':
      return group.thirdPlace;
    default:
      return null;
  }
}

function PodiumRow({
  row,
  slots,
  resolvedParticipant,
  label,
  icon,
  accentClass,
}: {
  row: BracketPodiumDisplayRow;
  slots: BracketPlayoffGroupDto['slots'];
  resolvedParticipant?: BracketSlotParticipantDto | null;
  label: string;
  icon: ReactNode;
  accentClass: string;
}) {
  const { t } = useTranslation();
  const inProgress = row.status === 'in_progress';
  // Prefer the backend-resolved podium participant (works even with a stale slot
  // cache); fall back to a slot lookup for navigation/avatars.
  const slot = row.participantId ? slots.find((s) => s.participant?.id === row.participantId) : null;
  const participant = resolvedParticipant ?? slot?.participant ?? null;
  const users = teamUsersFromParticipant(participant);
  const name = inProgress
    ? t('gameDetails.bracketPodiumInProgress')
    : participantLabelFromSlots(row.participantId ?? '', slots, resolvedParticipant) || '—';

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${accentClass}`}>
      <span className="shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {users.length > 0 ? (
          <div className="flex shrink-0 items-center -space-x-1">
            {users.map((u) => (
              <PlayerAvatar
                key={u.id}
                player={u}
                showName={false}
                fullHideName
                inlineFace
                inlineFacePlain
                inlineFaceSize="sm"
                inlineFaceFlatStack
                subscribePresence={false}
                asDiv
              />
            ))}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p
            className={`truncate text-sm font-medium ${
              inProgress ? 'italic text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'
            }`}
          >
            {name}
          </p>
        </div>
      </div>
    </div>
  );
}

export function LeagueBracketPodiumCard({
  group,
  rows,
  groupMeta,
  crossGroupBracket = false,
  fullscreenPath,
  showViewLink = true,
}: LeagueBracketPodiumCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (rows.length === 0) return null;

  const accent = getLeagueGroupColor(groupMeta?.color);
  const soft = getLeagueGroupSoftColor(groupMeta?.color, '22');

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: soft }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {crossGroupBracket
              ? t('gameDetails.bracketPodiumSeasonTitle')
              : t('gameDetails.bracketPodiumTitle')}
          </h3>
          {showViewLink && fullscreenPath ? (
            <button
              type="button"
              onClick={() => navigate(fullscreenPath)}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              {t('gameDetails.bracketViewFullBracket')}
            </button>
          ) : null}
        </div>
        {!crossGroupBracket && groupMeta?.name && (
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400" style={{ color: accent }}>
            {groupMeta.name}
          </p>
        )}
      </div>
      <div className="space-y-2 p-3">
        {rows.map((row) => (
          <PodiumRow
            key={`${row.kind}-${row.participantId ?? 'pending'}-${row.semifinalistIndex ?? 0}`}
            row={row}
            slots={group.slots}
            resolvedParticipant={podiumResolvedParticipant(row, group)}
            label={podiumLabel(row, t)}
            icon={podiumIcon(row.kind)}
            accentClass={podiumAccent(row.kind, row.status === 'in_progress')}
          />
        ))}
      </div>
    </Card>
  );
}
