import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Crown, Medal, Trophy } from 'lucide-react';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { BracketPlayoffGroupDto } from '@/api/leagues';
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
      return <Medal className="h-5 w-5 text-amber-700/80" />;
    default:
      return null;
  }
}

function podiumAccent(kind: BracketPodiumDisplayRow['kind'], inProgress: boolean): string {
  if (inProgress) {
    return 'bg-gray-50/50 dark:bg-gray-800/30 ring-1 ring-dashed ring-gray-300/80 dark:ring-gray-600/60';
  }
  switch (kind) {
    case 'champion':
      return 'bg-amber-50/90 dark:bg-amber-950/30 ring-1 ring-amber-200/80 dark:ring-amber-900/50';
    case 'thirdPlace':
      return 'bg-amber-50/70 dark:bg-amber-950/25 ring-1 ring-amber-200/60 dark:ring-amber-900/40';
    default:
      return 'bg-gray-50/80 dark:bg-gray-800/50';
  }
}

function PodiumRow({
  row,
  slots,
  label,
  icon,
  accentClass,
}: {
  row: BracketPodiumDisplayRow;
  slots: BracketPlayoffGroupDto['slots'];
  label: string;
  icon: ReactNode;
  accentClass: string;
}) {
  const { t } = useTranslation();
  const inProgress = row.status === 'in_progress';
  const slot = row.participantId ? slots.find((s) => s.participant?.id === row.participantId) : null;
  const users = teamUsersFromParticipant(slot?.participant);
  const name = inProgress
    ? t('gameDetails.bracketPodiumInProgress')
    : participantLabelFromSlots(row.participantId ?? '', slots) || '—';

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${accentClass}`}>
      <span className="shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {users.length > 0 ? (
          <div className="flex -space-x-1.5 shrink-0">
            {users.map((u, i) => (
              <span
                key={u.id}
                className="relative rounded-full ring-2 ring-white dark:ring-gray-900"
                style={{ zIndex: i + 1 }}
              >
                <PlayerAvatar
                  player={u}
                  inlineFace
                  inlineFacePlain
                  inlineFaceSize="sm"
                  showName={false}
                  subscribePresence={false}
                  asDiv
                />
              </span>
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
            label={podiumLabel(row, t)}
            icon={podiumIcon(row.kind)}
            accentClass={podiumAccent(row.kind, row.status === 'in_progress')}
          />
        ))}
      </div>
    </Card>
  );
}
