/**
 * `/my-clubs/:clubId/club/team` (`team.manage`) — who runs the club. Members with their role,
 * change role or remove from a member sheet (remove asks first), add a member through the app's
 * player search (`PlayerListModal`) and a role picker that explains ADMIN vs STAFF. The server
 * refuses to drop the last admin (error code `lastAdmin`); the UI also locks that row.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import type { ClubAdminRole, ClubTeamMember } from '@shared/clubAdmin/contract';
import { PlayerListModal } from '@/components/PlayerListModal';
import { personName } from '@/components/clubAdmin/console/bookingText';
import { ConsoleSheet } from '@/components/clubAdmin/console/ConsoleSheet';
import { useConsoleFormat } from '@/components/clubAdmin/console/format';
import { EmptyState, ErrorState, RowList, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { buttonClass, cx } from '@/components/clubAdmin/console/classes';
import { ConfirmSheet } from '@/components/clubAdmin/club/formChrome';
import { PersonFace } from '@/components/clubAdmin/club/PersonFace';
import { HeaderActions } from '@/clubAdmin/HeaderActions';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { consoleBase } from '@/clubAdmin/consoleNav';
import { useClubTeamQuery, useTeamMutation } from '@/queries/clubAdmin/clubArea';

const ROLES: ClubAdminRole[] = ['ADMIN', 'STAFF'];

function RoleBadge({ role }: { role: ClubAdminRole }) {
  const { t } = useTranslation('clubAdmin');
  return (
    <span
      className={cx(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide',
        role === 'ADMIN' ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'bg-ca-sunken text-muted-foreground'
      )}
    >
      {t(`club.team.role.${role}`)}
    </span>
  );
}

function RolePicker({ value, onChange, disabled }: { value: ClubAdminRole; onChange: (r: ClubAdminRole) => void; disabled?: boolean }) {
  const { t } = useTranslation('clubAdmin');
  return (
    <div role="radiogroup" aria-label={t('club.team.roleLabel')} className="space-y-2">
      {ROLES.map((r) => {
        const on = value === r;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(r)}
            className={cx(
              'flex w-full items-start gap-3 rounded-xl border p-3 text-start transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50',
              on ? 'border-primary-500 bg-primary-500/5' : 'border-border hover:bg-muted/60'
            )}
          >
            <span
              className={cx(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                on ? 'border-primary-600 dark:border-primary-400' : 'border-border'
              )}
              aria-hidden
            >
              {on ? <span className="h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{t(`club.team.role.${r}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`club.team.roleHint.${r}`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ClubTeamPage() {
  const { t } = useTranslation('clubAdmin');
  const { clubId, timeZone } = useClubConsole();
  const fmt = useConsoleFormat(timeZone);
  useConsoleHeader({ title: t('club.pages.team.title'), backTo: `${consoleBase(clubId)}/club` });

  const team = useClubTeamQuery(clubId);
  const mutate = useTeamMutation(clubId);
  const [searchOpen, setSearchOpen] = useState(false);
  const [adding, setAdding] = useState<{ userId: string } | null>(null);
  const [addRole, setAddRole] = useState<ClubAdminRole>('STAFF');
  const [selected, setSelected] = useState<ClubTeamMember | null>(null);
  const [role, setRole] = useState<ClubAdminRole>('STAFF');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const members = team.data ?? [];
  const adminCount = members.filter((m) => m.role === 'ADMIN').length;
  const isLastAdmin = (m: ClubTeamMember) => m.role === 'ADMIN' && adminCount <= 1;
  const name = (m: ClubTeamMember) => personName(m.user) || t('club.team.unnamed');

  const openMember = (m: ClubTeamMember) => {
    setSelected(m);
    setRole(m.role);
    setConfirmRemove(false);
  };

  const run = async (vars: Parameters<typeof mutate.mutateAsync>[0], success: string) => {
    try {
      await mutate.mutateAsync(vars);
      toast.success(success);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-8 lg:p-6">
      <HeaderActions>
        <button type="button" className={buttonClass('primary', 'min-h-9 px-3')} onClick={() => setSearchOpen(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">{t('club.team.add')}</span>
        </button>
      </HeaderActions>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-ca-surface p-3.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
        <p className="text-xs text-muted-foreground">{t('club.team.rolesIntro')}</p>
      </div>

      {team.isPending ? (
        <SkeletonRows rows={3} />
      ) : team.isError ? (
        <ErrorState onRetry={() => void team.refetch()} />
      ) : members.length === 0 ? (
        <EmptyState icon={Users} title={t('club.team.emptyTitle')} body={t('club.team.emptyBody')} />
      ) : (
        <RowList>
          {members.map((m) => (
            <button
              key={m.user.id || m.addedAt}
              type="button"
              onClick={() => openMember(m)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
            >
              <PersonFace person={m.user} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{name(m)}</span>
                  {m.isSelf ? <span className="shrink-0 text-xs text-muted-foreground">{t('club.team.you')}</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground">{t('club.team.since', { date: fmt.dateTime(m.addedAt) })}</span>
              </span>
              <RoleBadge role={m.role} />
            </button>
          ))}
        </RowList>
      )}

      {searchOpen ? (
        <PlayerListModal
          title={t('club.team.addTitle')}
          filterPlayerIds={members.map((m) => m.user.id)}
          onClose={() => setSearchOpen(false)}
          onConfirm={(ids) => {
            const userId = ids[0];
            setSearchOpen(false);
            if (userId) {
              setAddRole('STAFF');
              setAdding({ userId });
            }
          }}
        />
      ) : null}

      <ConsoleSheet
        open={adding !== null}
        onOpenChange={(o) => {
          if (!o && !mutate.isPending) setAdding(null);
        }}
        title={t('club.team.addRoleTitle')}
        modalId="club-team-add-role"
        dismissible={!mutate.isPending}
        footer={
          <button
            type="button"
            className={buttonClass('primary', 'w-full')}
            disabled={mutate.isPending}
            onClick={async () => {
              if (!adding) return;
              if (await run({ kind: 'add', userId: adding.userId, role: addRole }, t('club.team.added'))) setAdding(null);
            }}
          >
            {mutate.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t('club.team.addConfirm', { role: t(`club.team.role.${addRole}`) })}
          </button>
        }
      >
        <RolePicker value={addRole} onChange={setAddRole} disabled={mutate.isPending} />
      </ConsoleSheet>

      <ConsoleSheet
        open={selected !== null}
        onOpenChange={(o) => {
          if (!o && !mutate.isPending) setSelected(null);
        }}
        title={selected ? name(selected) : ''}
        description={selected?.isSelf ? t('club.team.you') : undefined}
        modalId="club-team-member"
        dismissible={!mutate.isPending}
        footer={
          selected ? (
            <div className="flex gap-2">
              <button
                type="button"
                className={buttonClass('secondary', 'flex-1 text-destructive')}
                disabled={mutate.isPending || isLastAdmin(selected)}
                onClick={() => setConfirmRemove(true)}
              >
                <UserMinus className="h-4 w-4" aria-hidden />
                {t('club.team.remove')}
              </button>
              <button
                type="button"
                className={buttonClass('primary', 'flex-1')}
                disabled={mutate.isPending || role === selected.role}
                onClick={async () => {
                  if (await run({ kind: 'role', userId: selected.user.id, role }, t('club.team.roleChanged'))) setSelected(null);
                }}
              >
                {mutate.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t('club.team.saveRole')}
              </button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-3">
            <RolePicker value={role} onChange={setRole} disabled={mutate.isPending || isLastAdmin(selected)} />
            {isLastAdmin(selected) ? <p className="text-xs text-muted-foreground">{t('club.team.lastAdminHint')}</p> : null}
            {selected.isSelf && selected.role === 'ADMIN' && role === 'STAFF' ? (
              <p className="rounded-xl bg-ca-warn-bg px-3 py-2 text-xs text-ca-warn">{t('club.team.selfDemoteWarning')}</p>
            ) : null}
          </div>
        ) : null}
      </ConsoleSheet>

      <ConfirmSheet
        open={confirmRemove && selected !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmRemove(false);
        }}
        nested
        modalId="club-team-remove"
        title={t('club.team.removeTitle', { name: selected ? name(selected) : '' })}
        body={selected?.isSelf ? t('club.team.removeSelfBody') : t('club.team.removeBody')}
        confirmLabel={t('club.team.remove')}
        busy={mutate.isPending}
        onConfirm={async () => {
          if (!selected) return;
          if (await run({ kind: 'remove', userId: selected.user.id }, t('club.team.removed'))) {
            setConfirmRemove(false);
            setSelected(null);
          }
        }}
      />
    </div>
  );
}
