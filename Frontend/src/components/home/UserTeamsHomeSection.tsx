import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { ConfirmationModal, TeamAvatar } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { userTeamsApi } from '@/api';
import type { UserTeam } from '@/types';
import toast from 'react-hot-toast';
import { toastApiError } from '@/utils/toastApiError';
import {
  hydrateUserTeamsHomeExpandedFromIdb,
  persistUserTeamsHomeExpanded,
  readUserTeamsHomeExpandedSync,
} from '@/utils/userTeamsHomeSectionStorage';
import { findLatestSoloOwnedTeam, isSoloOwnedTeam } from '@/utils/soloOwnedUserTeam';

function teamNameWordRows(name: string): string[] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts : [name.trim() || '\u00A0'];
}

function isUserTeamReady(team: UserTeam): boolean {
  const accepted = team.members.filter((m) => m.status === 'ACCEPTED').length;
  return accepted >= team.size;
}

interface UserTeamsHomeSectionProps {
  className?: string;
}

export function UserTeamsHomeSection({ className = '' }: UserTeamsHomeSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { teams, memberships, refreshAll, isLoading, removeTeamLocal } = useUserTeamsStore();
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(readUserTeamsHomeExpandedSync);
  const [deleteTeamId, setDeleteTeamId] = useState<string | null>(null);
  const [deletingTeam, setDeletingTeam] = useState(false);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    let cancel = false;
    void hydrateUserTeamsHomeExpandedFromIdb().then((v) => {
      if (!cancel) setExpanded(v);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const pending = useMemo(
    () => memberships.filter((m) => !m.isOwner && m.status === 'PENDING'),
    [memberships]
  );

  const displayTeams = useMemo(() => {
    const asParticipant = memberships
      .filter((m) => !m.isOwner && m.status === 'ACCEPTED')
      .map((m) => m.team)
      .filter(Boolean) as UserTeam[];
    const merged = [...teams, ...asParticipant];
    merged.sort((a, b) => {
      const ra = isUserTeamReady(a);
      const rb = isUserTeamReady(b);
      if (ra !== rb) return Number(ra) - Number(rb);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return merged;
  }, [teams, memberships]);

  const totalTiles = displayTeams.length + pending.length;
  const showSkeleton = isLoading && displayTeams.length === 0 && pending.length === 0;

  const handleNewTeam = async () => {
    setCreating(true);
    try {
      const refreshed = await refreshAll();
      if (!refreshed) {
        toast.error(t('errors.networkError'));
        return;
      }
      const existing = findLatestSoloOwnedTeam(useUserTeamsStore.getState().teams, user?.id);
      if (existing) {
        navigate(`/user-team/${existing.id}`);
        return;
      }
      const team = await userTeamsApi.create({});
      useUserTeamsStore.getState().setTeam(team);
      await refreshAll();
      navigate(`/user-team/${team.id}`);
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmDeleteTeam = async () => {
    if (!deleteTeamId) return;
    setDeletingTeam(true);
    try {
      await userTeamsApi.delete(deleteTeamId);
      removeTeamLocal(deleteTeamId);
      toast.success(t('teams.deleted'));
      setDeleteTeamId(null);
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setDeletingTeam(false);
    }
  };

  return (
    <section className={`overflow-hidden rounded-3xl px-3 py-2 ${className}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-2xl py-0.5 text-left transition-colors hover:bg-zinc-500/[0.06] active:bg-zinc-500/[0.08] dark:hover:bg-white/[0.05] dark:active:bg-white/[0.07]"
        onClick={() =>
          setExpanded((v) => {
            const next = !v;
            persistUserTeamsHomeExpanded(next);
            return next;
          })
        }
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{t('teams.title')}</h3>
          {!showSkeleton && totalTiles > 0 && (
            <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-zinc-900/5 px-2 text-xs font-semibold tabular-nums text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
              {totalTiles}
            </span>
          )}
        </div>
        <ChevronDown
          size={22}
          strokeWidth={2}
          className={`shrink-0 text-zinc-500 transition-transform duration-300 ease-out dark:text-zinc-400 ${expanded ? '' : '-rotate-90'}`}
          aria-hidden
        />
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              className="group flex min-w-[5.75rem] max-w-[7rem] shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border border-dashed border-zinc-300/90 bg-transparent py-2 text-center shadow-none transition-[transform,background-color,border-color] duration-200 hover:border-primary-400/70 hover:bg-primary-500/[0.04] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:hover:border-primary-500/50 dark:hover:bg-primary-400/[0.06]"
              onClick={handleNewTeam}
              disabled={creating}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-md transition group-hover:bg-primary-600 dark:bg-zinc-100 dark:text-zinc-900 dark:group-hover:bg-primary-400 dark:group-hover:text-zinc-950">
                {creating ? <Loader2 size={20} className="animate-spin" /> : <Plus size={22} strokeWidth={2} />}
              </span>
              <div className="flex w-full flex-col items-center justify-start px-1 pb-px">
                {teamNameWordRows(t('teams.create')).map((word, i) => (
                  <span
                    key={i}
                    className="block max-w-full break-words text-center text-[11px] font-semibold leading-snug text-zinc-800 dark:text-zinc-200"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </button>

            {pending.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/user-team/${m.teamId}`)}
                className="flex min-w-[5.75rem] max-w-[7rem] shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border border-amber-200/80 bg-white py-2 text-center shadow-lg shadow-gray-900/5 transition-[transform,box-shadow,border-color] duration-200 hover:border-amber-300 hover:shadow-md active:scale-[0.98] dark:border-amber-500/35 dark:bg-gray-800 dark:shadow-black/20 dark:hover:border-amber-500/50"
              >
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                  <TeamAvatar team={m.team} size="tile" />
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500 dark:border-gray-800" />
                </span>
                <div className="flex w-full flex-col items-center justify-start px-1 pb-px">
                  {teamNameWordRows(m.team.name).map((word, i) => (
                    <span
                      key={i}
                      className="block max-w-full break-words text-center text-[11px] font-semibold leading-snug text-amber-950 dark:text-amber-50"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </button>
            ))}

            {displayTeams.map((team) => {
              const showSoloDelete = isSoloOwnedTeam(team, user?.id);
              const ready = isUserTeamReady(team);
              return (
                <div
                  key={team.id}
                  className="relative min-w-[5.75rem] max-w-[7rem] shrink-0 snap-start"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/user-team/${team.id}`)}
                    className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border py-2 text-center shadow-lg transition-[transform,box-shadow,border-color,background-color] duration-200 hover:shadow-md active:scale-[0.98] ${
                      ready
                        ? 'border-emerald-200/85 bg-emerald-50/95 shadow-emerald-900/5 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-800/45 dark:bg-emerald-950/35 dark:shadow-black/20 dark:hover:border-emerald-700/50 dark:hover:bg-emerald-950/45'
                        : 'border-zinc-200/90 bg-zinc-100/90 shadow-gray-900/5 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/85 dark:shadow-black/20 dark:hover:border-zinc-500 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center">
                      <TeamAvatar team={team} size="tile" />
                    </span>
                    <div className="flex w-full flex-col items-center justify-start px-1 pb-px">
                      {teamNameWordRows(team.name).map((word, i) => (
                        <span
                          key={i}
                          className="block max-w-full break-words text-center text-[11px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  </button>
                  {showSoloDelete && (
                    <button
                      type="button"
                      className="absolute -right-0.5 -top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-zinc-500 shadow-md transition hover:bg-red-50 hover:text-red-600 dark:border-gray-600 dark:bg-gray-800 dark:text-zinc-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                      aria-label={t('teams.deleteTeam')}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteTeamId(team.id);
                      }}
                    >
                      <X size={14} strokeWidth={2.5} aria-hidden />
                    </button>
                  )}
                </div>
              );
            })}

            {showSkeleton && (
              <div className="flex min-w-[5.75rem] max-w-[7rem] shrink-0 snap-start flex-col items-center gap-1.5 py-2">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-zinc-200/90 dark:bg-zinc-700/80" />
                <div className="flex w-full items-start justify-center px-1 pb-px pt-0.5">
                  <div className="h-2.5 w-12 animate-pulse rounded-md bg-zinc-200/90 dark:bg-zinc-700/80" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {deleteTeamId && (
        <ConfirmationModal
          isOpen
          onClose={() => !deletingTeam && setDeleteTeamId(null)}
          title={t('teams.deleteTeam')}
          message={t('teams.deleteTeamConfirm')}
          confirmVariant="danger"
          confirmText={t('teams.deleteTeam')}
          isLoading={deletingTeam}
          closeOnConfirm={false}
          onConfirm={() => void handleConfirmDeleteTeam()}
        />
      )}
    </section>
  );
}
