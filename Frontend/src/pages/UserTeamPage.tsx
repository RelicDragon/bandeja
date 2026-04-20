import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Check, Plus, ImagePlus, X } from 'lucide-react';
import {
  type AvatarUploadHandle,
  Button,
  Input,
  AvatarUpload,
  ConfirmationModal,
  PlayerListModal,
  PlayerAvatar,
  TeamAvatar,
  TeamAvatarCutDial,
} from '@/components';
import { useAuthStore } from '@/store/authStore';
import { userTeamsApi, mediaApi } from '@/api';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import type { UserTeam } from '@/types';
import { toastApiError } from '@/utils/toastApiError';

export function UserTeamPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const leaveTeam = () => navigate('/', { replace: true });
  const user = useAuthStore((s) => s.user);
  const refreshAll = useUserTeamsStore((s) => s.refreshAll);
  const setTeam = useUserTeamsStore((s) => s.setTeam);
  const removeTeamLocal = useUserTeamsStore((s) => s.removeTeamLocal);

  const [team, setTeamLocal] = useState<UserTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState('');
  const [editVerbalStatus, setEditVerbalStatus] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteTeam, setShowDeleteTeam] = useState(false);
  const [memberActionModal, setMemberActionModal] = useState<{
    userId: string;
    kind: 'removeAccepted' | 'cancelInvite';
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
  const teamAvatarUploadRef = useRef<AvatarUploadHandle>(null);

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
      toastApiError(t, e);
      setTeamLocal(null);
    } finally {
      setLoading(false);
    }
  }, [id, setTeam, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setCutAngleLive(null);
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
    setBusy(true);
    try {
      await userTeamsApi.delete(team.id);
      removeTeamLocal(team.id);
      toast.success(t('teams.deleted'));
      leaveTeam();
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setBusy(false);
      setShowDeleteTeam(false);
    }
  };

  const handleAccept = async () => {
    if (!team) return;
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
    const { userId, kind } = memberActionModal;
    setBusy(true);
    try {
      const updated = await userTeamsApi.removeMember(team.id, userId);
      if (updated) {
        setTeamLocal(updated);
        setTeam(updated);
      } else {
        removeTeamLocal(team.id);
        leaveTeam();
      }
      await refreshAll();
      toast.success(kind === 'cancelInvite' ? t('teams.invitationCancelled') : t('teams.memberRemoved'));
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
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col gap-5 py-8 sm:flex-row sm:items-start sm:gap-8">
          <div className="mx-auto shrink-0 sm:mx-0">
            <div className="h-[7.5rem] w-[7.5rem] animate-pulse rounded-[1.2rem] bg-gradient-to-br from-zinc-200 to-zinc-300 sm:h-32 sm:w-32 dark:from-zinc-700 dark:to-zinc-600" />
          </div>
          <div className="flex flex-1 justify-center gap-2 sm:justify-start sm:pt-1">
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-zinc-200/90 dark:bg-zinc-700/90" />
            <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-zinc-200/90 dark:bg-zinc-700/90" />
          </div>
        </div>
      </div>
    );
  } else if (!team) {
    body = (
      <div className="mx-auto max-w-2xl">
        <p className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {t('errors.generic', { defaultValue: 'Something went wrong' })}
        </p>
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
    const teamForAvatar = { ...team, cutAngle: cutAngleDisplay };
    const showCutDial = isOwner && !team.avatar && !!secondUser;

    body = (
      <div className="mx-auto max-w-2xl space-y-3 pb-2">
        <div className="py-2 sm:py-3">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
            <div className="mx-auto shrink-0 sm:mx-0">
              {isOwner ? (
                <TeamAvatarCutDial
                  enabled={showCutDial}
                  angleDeg={cutAngleDisplay}
                  onAngleChange={setCutAngleLive}
                  onCommit={async (d) => {
                    try {
                      const updated = await userTeamsApi.update(team.id, { cutAngle: d });
                      setTeamLocal(updated);
                      setTeam(updated);
                    } catch (e: unknown) {
                      toastApiError(t, e);
                    } finally {
                      setCutAngleLive(null);
                    }
                  }}
                  disabled={busy}
                  footer={
                    showCutDial ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void teamAvatarUploadRef.current?.openPicker()}
                        className="group w-full rounded-2xl border border-zinc-200/90 bg-white/90 px-3.5 py-3 text-left shadow-sm outline-none ring-primary-500/0 transition-[border-color,box-shadow,transform,background-color] hover:border-primary-400/45 hover:bg-primary-50/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary-500/30 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 dark:border-zinc-700/90 dark:bg-zinc-900/55 dark:hover:border-primary-500/35 dark:hover:bg-primary-950/25"
                      >
                        <span className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-md shadow-primary-600/25 ring-1 ring-black/5 dark:shadow-primary-900/40 dark:ring-white/10">
                            <ImagePlus size={20} strokeWidth={2} aria-hidden className="opacity-95" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                              {t('teams.addTeamPhotoTitle')}
                            </span>
                            <span className="mt-0.5 block text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                              {t('teams.addTeamPhotoHint')}
                            </span>
                          </span>
                        </span>
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
                    emptyBackground={
                      !team.avatar ? <TeamAvatar team={teamForAvatar} size="fill" /> : undefined
                    }
                  />
                </TeamAvatarCutDial>
              ) : team.avatar ? (
                <img src={team.avatar} alt="" className="h-[7.5rem] w-[7.5rem] rounded-[1.2rem] object-cover sm:h-32 sm:w-32" />
              ) : (
                <TeamAvatar team={team} size="hero" />
              )}
            </div>
            <div className="min-w-0 flex-1 text-center sm:pt-1 sm:text-left">
              {!isOwner ? (
                <div className="mb-4">
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
                    {team.name}
                  </h2>
                  {team.verbalStatus?.trim() ? (
                    <p className="verbal-status mt-1.5">{team.verbalStatus.trim()}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex justify-center gap-2 sm:justify-start">
                <div className="flex w-16 shrink-0 flex-col items-center">
                  <PlayerAvatar
                    player={team.owner}
                    isCurrentUser={team.ownerId === user.id}
                    role="OWNER"
                    smallLayout
                  />
                </div>
                <div className="relative flex min-w-[4.5rem] max-w-[5.5rem] shrink-0 flex-col items-center">
                  {secondUser ? (
                    <>
                      <div
                        className={
                          isOwner && teammatePending
                            ? 'relative z-0 rounded-full p-[3px] ring-2 ring-dashed ring-amber-500/80 dark:ring-amber-400/70'
                            : 'relative z-0'
                        }
                      >
                        <PlayerAvatar
                          player={secondUser}
                          isCurrentUser={secondUser.id === user.id}
                          removable={!isOwner && !!teammateAccepted && teammateAccepted.userId === user.id}
                          onRemoveClick={
                            !isOwner && !!teammateAccepted && teammateAccepted.userId === user.id
                              ? () => setMemberActionModal({ userId: user.id, kind: 'removeAccepted' })
                              : undefined
                          }
                          role="PLAYER"
                          smallLayout
                        />
                      </div>
                      {isOwner && teammateAccepted && teammateAccepted.userId !== user.id ? (
                        <button
                          type="button"
                          className="absolute -right-1 -top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-red-500 text-white shadow-md dark:border-gray-900 dark:bg-red-600"
                          onClick={() =>
                            setMemberActionModal({ userId: teammateAccepted.userId, kind: 'removeAccepted' })
                          }
                          aria-label={t('teams.removeMember')}
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      ) : null}
                      {isOwner && teammatePending && teammatePending.userId !== user.id ? (
                        <button
                          type="button"
                          className="absolute -right-1 -top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-amber-600 text-white shadow-md dark:border-gray-900 dark:bg-amber-700"
                          onClick={() =>
                            setMemberActionModal({ userId: teammatePending.userId, kind: 'cancelInvite' })
                          }
                          aria-label={t('teams.cancelInvitation')}
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                      ) : null}
                      {isOwner && teammatePending ? (
                        <span className="mt-1 text-center text-[10px] font-semibold leading-tight text-amber-800 dark:text-amber-200">
                          {t('teams.invitedAwaitingReply')}
                        </span>
                      ) : null}
                    </>
                  ) : showPlusSlot ? (
                    <button
                      type="button"
                      onClick={() => setShowInvite(true)}
                      disabled={busy}
                      className="flex w-full flex-col items-center"
                      aria-label={t('teams.inviteTeammate')}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-primary-400 bg-primary-50 transition-colors hover:bg-primary-100 dark:border-primary-600 dark:bg-primary-900/20 dark:hover:bg-primary-800/30">
                        <Plus className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                      </div>
                    </button>
                  ) : (
                    <PlayerAvatar player={null} smallLayout />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {isOwner ? (
          <>
            <div className="relative">
              <Input
                label={t('teams.name')}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                error={nameError}
              />
              {nameValidationStatus === 'saving' && (
                <div className="absolute right-3 top-9">
                  <Loader2 size={16} className="animate-spin text-primary-600 dark:text-primary-400" />
                </div>
              )}
              {nameValidationStatus === 'saved' && (
                <div className="absolute right-3 top-9">
                  <Check size={16} className="text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
            </div>
            <div className="relative">
              <Input
                label={t('teams.verbalStatus')}
                value={editVerbalStatus}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length <= 32) setEditVerbalStatus(v);
                }}
                placeholder={t('teams.verbalStatusPlaceholder')}
                maxLength={32}
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {editVerbalStatus.length}/32 {t('profile.characters')}
              </p>
              {verbalStatusValidationStatus === 'saving' && (
                <div className="absolute right-3 top-9">
                  <Loader2 size={16} className="animate-spin text-primary-600 dark:text-primary-400" />
                </div>
              )}
              {verbalStatusValidationStatus === 'saved' && (
                <div className="absolute right-3 top-9">
                  <Check size={16} className="text-emerald-600 dark:text-emerald-400" />
                </div>
              )}
            </div>
          </>
        ) : null}

        {isPendingInvite && (
          <div className="rounded-2xl border border-amber-200/70 p-4 dark:border-amber-500/35">
            <p className="mb-4 text-sm leading-relaxed text-amber-950 dark:text-amber-100">{t('teams.invitePrompt')}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Button className="flex-1 rounded-2xl py-3.5" onClick={handleAccept} disabled={busy}>
                {t('teams.accept')}
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-2xl border-amber-300/90 py-3.5 dark:border-amber-600/50"
                onClick={handleDecline}
                disabled={busy}
              >
                {t('teams.decline')}
              </Button>
            </div>
          </div>
        )}

        {isOwner && (
          <button
            type="button"
            className="w-full rounded-2xl border border-red-200/90 bg-transparent py-3.5 text-sm font-semibold text-red-600 transition-[background-color,transform] duration-200 hover:bg-red-50 active:scale-[0.99] dark:border-red-500/25 dark:text-red-400 dark:hover:bg-red-950/40"
            onClick={() => setShowDeleteTeam(true)}
          >
            {t('teams.deleteTeam')}
          </button>
        )}

        {showInvite && (
          <PlayerListModal
            onClose={() => setShowInvite(false)}
            title={t('teams.inviteTeammate')}
            filterPlayerIds={memberUserIds}
            onConfirm={async (ids) => {
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
            }}
          />
        )}

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
          title={
            memberActionModal?.kind === 'cancelInvite'
              ? t('teams.cancelInvitation')
              : t('teams.removeMember')
          }
          message={
            memberActionModal?.kind === 'cancelInvite'
              ? t('teams.cancelInvitationConfirm')
              : t('teams.removeMemberConfirm')
          }
          confirmText={
            memberActionModal?.kind === 'cancelInvite'
              ? t('teams.cancelInvitation')
              : t('common.confirm')
          }
          confirmVariant={memberActionModal?.kind === 'cancelInvite' ? 'primary' : 'danger'}
          closeOnConfirm={false}
          isLoading={busy}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
    </div>
  );
}
