import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarPlus,
  ChevronRight,
  Clock3,
  ImagePlus,
  LogOut,
  Trash2,
  UserMinus,
  UserPlus,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import {
  type AvatarUploadHandle,
  Button,
  AvatarUpload,
  ConfirmationModal,
  PlayerListModal,
  TeamAvatar,
  TeamAvatarCutDial,
} from '@/components';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { useAuthStore } from '@/store/authStore';
import { userTeamsApi, mediaApi } from '@/api';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { socketService } from '@/services/socketService';
import type { UserTeam } from '@/types';
import { toastApiError } from '@/utils/toastApiError';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { getUserPrimarySport, resolveActivePrimarySport } from '@/utils/profileSports';
import { isUserTeamReady } from '@/components/playerInvite/inviteEntries';
import { AddUserTeamToGameSheet } from '@/components/userTeam/AddUserTeamToGameSheet';
import { UserTeamDuo } from '@/components/userTeam/UserTeamDuo';
import { heroGlass } from '@/components/userTeam/heroGlass';
import { UserTeamColorPicker } from '@/components/userTeam/UserTeamColorPicker';
import type { UserTeamColor } from '@shared/userTeamColors';
import { UserTeamHero, UserTeamHeroField, UserTeamStaticTitle } from '@/components/userTeam/UserTeamHero';
import { UserTeamManageList, type UserTeamManageAction } from '@/components/userTeam/UserTeamManageList';
import { UserTeamRecord } from '@/components/userTeam/UserTeamRecord';
import { UserTeamRivalries } from '@/components/userTeam/UserTeamRivalries';
import { UserTeamRankChip } from '@/components/userTeam/UserTeamRankChip';
import { UserTeamNextGame } from '@/components/userTeam/UserTeamNextGame';
import { UserTeamMessagePartner } from '@/components/userTeam/UserTeamMessagePartner';
import { UserTeamChallengeAction } from '@/components/userTeam/UserTeamChallengeAction';

type MemberActionKind = 'removeAccepted' | 'cancelInvite' | 'leave';

const MEMBER_ACTION_COPY: Record<MemberActionKind, { title: string; message: string; confirm: string; done: string }> = {
  removeAccepted: {
    title: 'teams.removeMember',
    message: 'teams.removeMemberConfirm',
    confirm: 'common.confirm',
    done: 'teams.memberRemoved',
  },
  cancelInvite: {
    title: 'teams.cancelInvitation',
    message: 'teams.cancelInvitationConfirm',
    confirm: 'teams.cancelInvitation',
    done: 'teams.invitationCancelled',
  },
  leave: { title: 'teams.leave', message: 'teams.leaveConfirm', confirm: 'teams.leave', done: 'teams.leftTeam' },
};

function displayName(u: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
}

/** 404: deleted. 403: no longer a member. Either way the team is gone for this viewer. */
function isTeamGoneError(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status;
  return status === 403 || status === 404;
}

export function UserTeamPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const leaveTeam = () => navigate('/', { replace: true });
  const user = useAuthStore((s) => s.user);
  const reduceMotion = usePrefersReducedMotion();
  const teamInviteLevelSport = resolveActivePrimarySport(user) ?? getUserPrimarySport(user);
  const refreshAll = useUserTeamsStore((s) => s.refreshAll);
  const setTeam = useUserTeamsStore((s) => s.setTeam);
  const removeTeamLocal = useUserTeamsStore((s) => s.removeTeamLocal);

  const [team, setTeamLocal] = useState<UserTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editVerbalStatus, setEditVerbalStatus] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showAddToGame, setShowAddToGame] = useState(false);
  const [showDeleteTeam, setShowDeleteTeam] = useState(false);
  const [memberActionModal, setMemberActionModal] = useState<{
    userId: string;
    kind: MemberActionKind;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameValidationStatus, setNameValidationStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const nameSaveRequestId = useRef(0);
  const verbalStatusSaveRequestId = useRef(0);
  const [verbalStatusValidationStatus, setVerbalStatusValidationStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [cutAngleLive, setCutAngleLive] = useState<number | null>(null);
  /** Optimistic colour while a save is in flight; `undefined` = use the server value. */
  const [colorLive, setColorLive] = useState<UserTeamColor | null | undefined>(undefined);
  const colorSaveRequestId = useRef(0);
  const cutAngleSaveRequestId = useRef(0);
  const teamAvatarUploadRef = useRef<AvatarUploadHandle>(null);

  const leaveGoneTeam = useCallback(
    (teamId: string, reason: 'deleted' | 'unavailable') => {
      removeTeamLocal(teamId);
      // Shared id: the owner's own delete toast and its socket echo collapse into one.
      const toastId = `user-team-gone-${teamId}`;
      if (reason === 'deleted') toast.success(t('teams.deleted'), { id: toastId });
      else toast(t('teams.unavailable'), { id: toastId });
      navigate('/', { replace: true });
    },
    [navigate, removeTeamLocal, t],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await userTeamsApi.getById(id);
      setTeamLocal(data);
      setEditName(data.name);
      setEditVerbalStatus(data.verbalStatus ?? '');
      setTeam(data);
      setNameError('');
      setNameValidationStatus('idle');
      verbalStatusSaveRequestId.current += 1;
      setVerbalStatusValidationStatus('idle');
    } catch (e: unknown) {
      if (isTeamGoneError(e)) {
        leaveGoneTeam(id, 'unavailable');
        return;
      }
      toastApiError(t, e);
      setTeamLocal(null);
    } finally {
      setLoading(false);
    }
  }, [id, leaveGoneTeam, setTeam, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // The owner can delete the team while a teammate has this page open. The socket
  // event covers a live session; the reconnect check covers a backgrounded app.
  useEffect(() => {
    if (!id) return;
    const handleDeleted = (data: unknown) => {
      if ((data as { teamId?: string } | null)?.teamId !== id) return;
      leaveGoneTeam(id, 'deleted');
    };
    const recheckOnReconnect = () => {
      userTeamsApi.getById(id).catch((e: unknown) => {
        if (isTeamGoneError(e)) leaveGoneTeam(id, 'unavailable');
      });
    };
    socketService.on('user-team:deleted', handleDeleted);
    const unsubscribeConnect = socketService.onConnect(recheckOnReconnect);
    return () => {
      socketService.off('user-team:deleted', handleDeleted);
      unsubscribeConnect();
    };
  }, [id, leaveGoneTeam]);

  useEffect(() => {
    setCutAngleLive(null);
    setColorLive(undefined);
  }, [id]);

  useEffect(() => {
    if (!team || !user || team.ownerId !== user.id) return;

    const trimmed = editName.trim();
    if (trimmed === team.name) {
      nameSaveRequestId.current += 1;
      setNameError('');
      setNameValidationStatus('idle');
      return;
    }

    if (trimmed.length > 0 && trimmed.length < 3) {
      setNameError(t('teams.nameMinLength'));
      setNameValidationStatus('error');
      return;
    }

    if (trimmed.length === 0) {
      setNameError(t('teams.nameMinLength'));
      setNameValidationStatus('error');
      return;
    }

    setNameError('');
    const timeoutId = setTimeout(() => {
      const rid = ++nameSaveRequestId.current;
      setNameValidationStatus('saving');
      void (async () => {
        try {
          const updated = await userTeamsApi.update(team.id, { name: trimmed });
          if (rid !== nameSaveRequestId.current) return;
          setTeamLocal(updated);
          setTeam(updated);
          setNameValidationStatus('saved');
          setTimeout(() => {
            setNameValidationStatus((prev) => (prev === 'saved' ? 'idle' : prev));
          }, 2000);
        } catch (e: unknown) {
          if (rid !== nameSaveRequestId.current) return;
          setNameValidationStatus('error');
          toastApiError(t, e);
        }
      })();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [editName, team, user, setTeam, t]);

  useEffect(() => {
    if (!team || !user || team.ownerId !== user.id) return;

    const trimmed = editVerbalStatus.trim().slice(0, 32);
    const serverVal = (team.verbalStatus ?? '').trim();
    if (trimmed === serverVal) {
      verbalStatusSaveRequestId.current += 1;
      setVerbalStatusValidationStatus('idle');
      return;
    }

    const timeoutId = setTimeout(() => {
      const rid = ++verbalStatusSaveRequestId.current;
      setVerbalStatusValidationStatus('saving');
      void (async () => {
        try {
          const updated = await userTeamsApi.update(team.id, { verbalStatus: trimmed.length > 0 ? trimmed : null });
          if (rid !== verbalStatusSaveRequestId.current) return;
          setTeamLocal(updated);
          setTeam(updated);
          setVerbalStatusValidationStatus('saved');
          setTimeout(() => {
            setVerbalStatusValidationStatus((prev) => (prev === 'saved' ? 'idle' : prev));
          }, 2000);
        } catch (e: unknown) {
          if (rid !== verbalStatusSaveRequestId.current) return;
          setVerbalStatusValidationStatus('error');
          toastApiError(t, e);
        }
      })();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [editVerbalStatus, team, user, setTeam, t]);

  if (!id) return <Navigate to="/" replace />;

  const handleTeamAvatar = async (avatarFile: File, originalFile: File) => {
    if (!team) return;
    setBusy(true);
    try {
      await mediaApi.uploadUserTeamAvatar(team.id, avatarFile, originalFile);
      const updated = await userTeamsApi.getById(team.id);
      setTeamLocal(updated);
      setTeam(updated);
      toast.success(t('teams.avatarUpdated'));
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!team) return;
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleDeleteTeam());
      return;
    }
    setBusy(true);
    try {
      await userTeamsApi.delete(team.id);
      leaveGoneTeam(team.id, 'deleted');
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setBusy(false);
      setShowDeleteTeam(false);
    }
  };

  const handleAccept = async () => {
    if (!team) return;
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleAccept());
      return;
    }
    setBusy(true);
    try {
      const updated = await userTeamsApi.accept(team.id);
      setTeamLocal(updated);
      setTeam(updated);
      await refreshAll();
      toast.success(t('teams.joined'));
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!team) return;
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleDecline());
      return;
    }
    setBusy(true);
    try {
      await userTeamsApi.decline(team.id);
      removeTeamLocal(team.id);
      await refreshAll();
      toast.success(t('teams.declined'));
      leaveTeam();
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmMemberAction = async () => {
    if (!team || !memberActionModal) return;
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleConfirmMemberAction());
      return;
    }
    const { userId, kind } = memberActionModal;
    setBusy(true);
    try {
      const updated = await userTeamsApi.removeMember(team.id, userId);
      if (kind === 'leave') {
        removeTeamLocal(team.id);
        await refreshAll();
        toast.success(t(MEMBER_ACTION_COPY.leave.done));
        setMemberActionModal(null);
        leaveTeam();
        return;
      }
      if (updated) {
        setTeamLocal(updated);
        setTeam(updated);
      } else {
        removeTeamLocal(team.id);
        leaveTeam();
      }
      await refreshAll();
      toast.success(t(MEMBER_ACTION_COPY[kind].done));
      setMemberActionModal(null);
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (loading || !user) {
    body = (
      <div className="mx-auto w-full max-w-2xl space-y-3 pb-4" aria-busy="true">
        {/* Same frame as UserTeamHero (padding, picture box, title, seats) so the swap does not jump. */}
        <div className="flex flex-col items-center rounded-[2rem] bg-[var(--ui-surface)] px-4 pb-6 pt-4 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <div className="p-3">
            <div className={`${shimmerBlock} h-[7.5rem] w-[7.5rem] rounded-[1.2rem] sm:h-32 sm:w-32`} />
          </div>
          <div className={`${shimmerBlock} mt-2 h-8 w-48 rounded-xl`} />
          <div className={`${shimmerBlock} mt-2.5 h-4 w-28 rounded-lg`} />
          <div className="mt-6 flex items-start gap-14">
            <div className={`${shimmerBlock} h-12 w-12 rounded-full`} />
            <div className={`${shimmerBlock} h-12 w-12 rounded-full`} />
          </div>
          <div className="h-6" />
        </div>
        <div className={`${shimmerBlock} h-[4.5rem] w-full rounded-[1.375rem]`} />
        <div className={`${shimmerBlock} h-40 w-full rounded-[1.75rem]`} />
      </div>
    );
  } else if (!team) {
    body = (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 px-6 py-16 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('errors.generic', { defaultValue: 'Something went wrong' })}
        </p>
        <Button variant="outline" className="rounded-2xl px-6" onClick={() => void load()}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </div>
    );
  } else {
    const isOwner = team.ownerId === user.id;
    const myMembership = team.members.find((m) => m.userId === user.id);
    const isPendingInvite = myMembership?.status === 'PENDING' && !myMembership.isOwner;
    const acceptedCount = team.members.filter((m) => m.status === 'ACCEPTED').length;
    const canInviteMore = acceptedCount < team.size;
    const memberUserIds = team.members.map((m) => m.userId);
    const teammateAccepted = team.members.find((m) => !m.isOwner && m.status === 'ACCEPTED');
    const teammatePending = team.members.find((m) => !m.isOwner && m.status === 'PENDING');
    const secondUser = teammateAccepted?.user ?? teammatePending?.user ?? null;
    const showPlusSlot = isOwner && !secondUser && canInviteMore;
    const cutAngleDisplay = cutAngleLive ?? team.cutAngle ?? 45;
    const colorDisplay = colorLive !== undefined ? colorLive : (team.color ?? null);
    const teamForAvatar = { ...team, cutAngle: cutAngleDisplay, color: colorDisplay };
    // The colour belongs to the team, photo or not (hero wash + initials).
    const showColorPicker = isOwner;
    const handleColor = async (color: UserTeamColor | null) => {
      setColorLive(color);
      const rid = ++colorSaveRequestId.current;
      try {
        const updated = await userTeamsApi.update(team.id, { color });
        if (rid !== colorSaveRequestId.current) return;
        setTeamLocal(updated);
        setTeam(updated);
      } catch (e: unknown) {
        if (rid === colorSaveRequestId.current) toastApiError(t, e);
      } finally {
        if (rid === colorSaveRequestId.current) setColorLive(undefined);
      }
    };
    const showCutDial = isOwner && !team.avatar && !!secondUser;
    const teamReady = isUserTeamReady(team);
    const canAddToGame = Boolean(myMembership && myMembership.status === 'ACCEPTED');
    const partnerName = displayName(teammateAccepted?.user);
    const openInvite = () => setShowInvite(true);
    // A complete team, seen by one of its two accepted members: the other one.
    const viewerPartner =
      myMembership?.status === 'ACCEPTED' && teammateAccepted
        ? isOwner
          ? teammateAccepted.user
          : team.owner
        : null;

    const avatar = isOwner ? (
      <TeamAvatarCutDial
        enabled={showCutDial}
        angleDeg={cutAngleDisplay}
        onAngleChange={setCutAngleLive}
        onCommit={async (d) => {
          // Only the latest save may touch state, or a slow reply snaps the seam back mid-drag.
          const rid = ++cutAngleSaveRequestId.current;
          try {
            const updated = await userTeamsApi.update(team.id, { cutAngle: d });
            if (rid !== cutAngleSaveRequestId.current) return;
            setTeamLocal(updated);
            setTeam(updated);
          } catch (e: unknown) {
            if (rid === cutAngleSaveRequestId.current) toastApiError(t, e);
          } finally {
            if (rid === cutAngleSaveRequestId.current) setCutAngleLive(null);
          }
        }}
        disabled={busy}
        colorPicker={
          showColorPicker ? (
            <UserTeamColorPicker value={colorDisplay} onChange={(c) => void handleColor(c)} disabled={busy} />
          ) : undefined
        }
        footer={
          isOwner && !team.avatar ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void teamAvatarUploadRef.current?.openPicker()}
              className={`mx-auto flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold text-primary-700 outline-none transition-[background-color,scale] duration-200 hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 dark:text-primary-200 dark:hover:bg-white/[0.12] ${heroGlass} ${pressScaleGuard}`}
              title={t('teams.addTeamPhotoHint')}
            >
              <ImagePlus size={15} strokeWidth={2} aria-hidden />
              {t('teams.addTeamPhotoTitle')}
            </button>
          ) : null
        }
      >
        <AvatarUpload
          ref={teamAvatarUploadRef}
          variant="squircle"
          sizeClassName="h-full w-full"
          currentAvatar={team.avatar || undefined}
          onUpload={handleTeamAvatar}
          disabled={busy}
          surfaceInteractive={!showCutDial}
          emptyBackground={!team.avatar ? <TeamAvatar team={teamForAvatar} size="fill" /> : undefined}
        />
      </TeamAvatarCutDial>
    ) : (
      <div className="p-3">
        <TeamAvatar team={team} size="hero" />
      </div>
    );

    const title = isOwner ? (
      <>
        <UserTeamHeroField
          variant="title"
          value={editName}
          onChange={setEditName}
          ariaLabel={t('teams.name')}
          status={nameValidationStatus}
          error={nameError || undefined}
        />
        <UserTeamHeroField
          variant="status"
          value={editVerbalStatus}
          onChange={setEditVerbalStatus}
          ariaLabel={t('teams.verbalStatus')}
          placeholder={t('teams.statusAddPlaceholder')}
          status={verbalStatusValidationStatus}
          maxLength={32}
        />
      </>
    ) : (
      <UserTeamStaticTitle name={team.name} status={team.verbalStatus} />
    );

    let primary: ReactNode = null;
    if (canAddToGame && teamReady) {
      primary = (
        <PrimaryAction
          testId="user-team-add-to-game"
          icon={CalendarPlus}
          title={t('teams.addToGame')}
          detail={t('teams.addToGameCta')}
          onClick={() => runWithProfileName(() => setShowAddToGame(true))}
          disabled={busy}
        />
      );
    } else if (showPlusSlot) {
      primary = (
        <PrimaryAction
          testId="user-team-invite-teammate"
          icon={UserPlus}
          title={t('teams.inviteTeammate')}
          detail={t('teams.invitePartnerHint')}
          onClick={openInvite}
          disabled={busy}
        />
      );
    } else if (canAddToGame) {
      primary = (
        <div
          data-testid="user-team-add-to-game-pending"
          className="flex w-full items-center gap-3.5 rounded-[1.375rem] border border-dashed border-zinc-300/90 px-4 py-3.5 dark:border-zinc-700"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock3 size={20} strokeWidth={2} aria-hidden />
          </span>
          <p className="min-w-0 text-sm leading-snug text-zinc-600 [text-wrap:pretty] dark:text-zinc-400">
            {t('teams.addToGamePending')}
          </p>
        </div>
      );
    }

    const manageActions: UserTeamManageAction[] = [];
    if (isOwner && teammatePending) {
      manageActions.push({
        key: 'cancel',
        icon: UserX,
        label: t('teams.cancelInvitation'),
        detail: displayName(teammatePending.user),
        onClick: () => setMemberActionModal({ userId: teammatePending.userId, kind: 'cancelInvite' }),
      });
    }
    if (isOwner && teammateAccepted) {
      manageActions.push({
        key: 'remove',
        icon: UserMinus,
        label: t('teams.removeMember'),
        detail: partnerName,
        danger: true,
        onClick: () => setMemberActionModal({ userId: teammateAccepted.userId, kind: 'removeAccepted' }),
      });
    }
    if (!isOwner && myMembership?.status === 'ACCEPTED') {
      manageActions.push({
        key: 'leave',
        icon: LogOut,
        label: t('teams.leave'),
        danger: true,
        testId: 'user-team-leave',
        onClick: () => setMemberActionModal({ userId: user.id, kind: 'leave' }),
      });
    }
    if (isOwner) {
      manageActions.push({
        key: 'delete',
        icon: Trash2,
        label: t('teams.deleteTeam'),
        danger: true,
        testId: 'user-team-delete',
        onClick: () => setShowDeleteTeam(true),
      });
    }

    const modalCopy = memberActionModal ? MEMBER_ACTION_COPY[memberActionModal.kind] : null;

    body = (
      <div className="mx-auto w-full max-w-2xl pb-4">
        {/* One short fade from half opacity: never blank between skeleton and content. */}
        <motion.div
          key={team.id}
          className="space-y-3"
          initial={reduceMotion ? false : { opacity: 0.5 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <UserTeamHero
            team={teamForAvatar}
            avatar={avatar}
            title={title}
            meta={
              teammateAccepted ? <UserTeamRankChip userAId={team.ownerId} userBId={teammateAccepted.userId} /> : null
            }
            footer={
              viewerPartner && viewerPartner.id !== user.id ? (
                <UserTeamMessagePartner partner={viewerPartner} />
              ) : null
            }
          >
            <UserTeamDuo
              owner={team.owner}
              partner={secondUser}
              viewerId={user.id}
              partnerPending={Boolean(teammatePending && !teammateAccepted)}
              onInvite={showPlusSlot ? openInvite : undefined}
              disabled={busy}
            />
          </UserTeamHero>

          {isPendingInvite ? (
            <section
              data-testid="user-team-invite-response"
              className="rounded-[1.75rem] bg-amber-50 px-4 pb-4 pt-4 ring-1 ring-amber-200/70 dark:bg-amber-500/[0.08] dark:ring-amber-400/20"
            >
              <p className="text-[15px] font-semibold tracking-tight text-amber-950 [text-wrap:balance] dark:text-amber-50">
                {t('teams.invitedBy', { name: team.owner.firstName || displayName(team.owner) })}
              </p>
              <p className="mt-0.5 text-sm leading-snug text-amber-900/75 dark:text-amber-100/70">
                {t('teams.invitePrompt')}
              </p>
              <div className="mt-4 flex gap-2">
                <Button className="flex-1 rounded-2xl py-3" onClick={handleAccept} disabled={busy}>
                  {t('teams.accept')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 rounded-2xl border-amber-300/90 py-3 dark:border-amber-500/40"
                  onClick={handleDecline}
                  disabled={busy}
                >
                  {t('teams.decline')}
                </Button>
              </div>
            </section>
          ) : null}

          {primary}

          {viewerPartner ? <UserTeamNextGame teamId={team.id} teamColor={colorDisplay} /> : null}

          {/* Someone else's complete pair: challenge it with one of yours. */}
          {!myMembership ? (
            <UserTeamChallengeAction team={team} sport={teamInviteLevelSport} disabled={busy} />
          ) : null}

          {secondUser ? (
            <UserTeamRecord userAId={team.ownerId} userBId={secondUser.id} viewerIsMember={Boolean(myMembership)} />
          ) : null}

          {teammateAccepted ? (
            <UserTeamRivalries
              userAId={team.ownerId}
              userBId={teammateAccepted.userId}
              viewerId={user.id}
              teamMembers={[team.owner, teammateAccepted.user]}
              canRematch={canAddToGame}
              viewerIsMember={Boolean(myMembership)}
            />
          ) : null}

          {manageActions.length > 0 ? (
            <UserTeamManageList actions={manageActions} disabled={busy} />
          ) : null}
        </motion.div>

        {showInvite && (
          <PlayerListModal
            onClose={() => setShowInvite(false)}
            title={t('teams.inviteTeammate')}
            gameSport={teamInviteLevelSport}
            filterPlayerIds={memberUserIds}
            onConfirm={async (ids) => {
              const run = async () => {
                const uid = ids[0];
                if (!uid) return;
                setBusy(true);
                try {
                  const { team: next } = await userTeamsApi.invite(team.id, uid);
                  setTeamLocal(next);
                  setTeam(next);
                  await refreshAll();
                  toast.success(t('teams.inviteSent'));
                } catch (e: unknown) {
                  toastApiError(t, e);
                } finally {
                  setBusy(false);
                }
              };
              const authUser = useAuthStore.getState().user;
              if (authUser && authUser.nameIsSet !== true) {
                runWithProfileName(() => void run());
                return;
              }
              await run();
            }}
          />
        )}

        <AddUserTeamToGameSheet
          open={showAddToGame}
          onOpenChange={setShowAddToGame}
          teamId={team.id}
          partnerName={partnerName || null}
        />

        <ConfirmationModal
          isOpen={showDeleteTeam}
          onClose={() => setShowDeleteTeam(false)}
          onConfirm={handleDeleteTeam}
          title={t('teams.deleteTeam')}
          message={t('teams.deleteTeamConfirm')}
          confirmText={t('common.delete')}
          confirmVariant="danger"
        />

        <ConfirmationModal
          isOpen={!!memberActionModal}
          onClose={() => setMemberActionModal(null)}
          onConfirm={() => void handleConfirmMemberAction()}
          title={modalCopy ? t(modalCopy.title) : ''}
          message={modalCopy ? t(modalCopy.message) : ''}
          confirmText={modalCopy ? t(modalCopy.confirm) : ''}
          confirmVariant={memberActionModal?.kind === 'cancelInvite' ? 'primary' : 'danger'}
          closeOnConfirm={false}
          isLoading={busy}
        />
      </div>
    );
  }

  return body;
}

type PrimaryActionProps = {
  testId: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
};

/** The one filled call to action on the page. */
function PrimaryAction({ testId, icon: Icon, title, detail, onClick, disabled }: PrimaryActionProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex w-full items-center gap-3.5 overflow-hidden rounded-[1.375rem] bg-primary-600 px-4 py-3.5 text-start text-white shadow-lg shadow-primary-600/30 outline-none transition-[background-color,scale,box-shadow] duration-200 hover:bg-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 active:scale-[0.985] disabled:opacity-60 dark:focus-visible:ring-offset-gray-900 ${pressScaleGuard}`}
    >
      <span
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(255,255,255,0.22),transparent_55%)]"
        aria-hidden
      />
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/25">
        <Icon size={21} strokeWidth={2} aria-hidden />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-semibold tracking-tight">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-white/75">{detail}</span>
      </span>
      <ChevronRight
        size={20}
        className="relative shrink-0 text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        aria-hidden
      />
    </button>
  );
}
