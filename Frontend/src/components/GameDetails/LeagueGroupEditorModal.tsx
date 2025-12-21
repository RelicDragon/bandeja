import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Loader2, UserPlus, ChevronDown, Check, ArrowUp, ArrowDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { PlayerAvatar } from '@/components';
import { leaguesApi, LeagueGroupManagementPayload, LeagueStanding } from '@/api/leagues';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';

const RENAME_DEBOUNCE_MS = 800;

interface LeagueGroupEditorModalProps {
  isOpen: boolean;
  leagueSeasonId: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export const LeagueGroupEditorModal = ({
  isOpen,
  leagueSeasonId,
  onClose,
  onUpdated,
}: LeagueGroupEditorModalProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'general' | 'order'>('general');
  const [data, setData] = useState<LeagueGroupManagementPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [renameLoading, setRenameLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [participantSelections, setParticipantSelections] = useState<Record<string, string>>({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [reorderLoading, setReorderLoading] = useState(false);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const renameTimeouts = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await leaguesApi.getGroups(leagueSeasonId);
      setData(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setLoading(false);
    }
  }, [leagueSeasonId, t]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      fetchGroups();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, fetchGroups]);

  useEffect(() => {
    if (!data) {
      setNameDrafts({});
      return;
    }
    const drafts: Record<string, string> = {};
    data.groups.forEach((group) => {
      drafts[group.id] = group.name;
    });
    setNameDrafts(drafts);
  }, [data]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown && dropdownRefs.current[openDropdown]) {
        const dropdownElement = dropdownRefs.current[openDropdown];
        if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

  useEffect(() => {
    const timeouts = renameTimeouts.current;
    return () => {
      Object.values(timeouts).forEach((timeout) => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
    };
  }, []);

  const handleCreateGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      toast.error(t('gameDetails.groupNameRequired'));
      return;
    }

    setCreatingGroup(true);
    try {
      const response = await leaguesApi.createManualGroup(leagueSeasonId, trimmed);
      setData(response.data);
      setNewGroupName('');
      onUpdated?.();
      toast.success(t('gameDetails.groupCreated'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleRenameGroup = useCallback(
    async (groupId: string, rawName: string) => {
      const name = rawName.trim();
      if (!name) {
        return;
      }

      const currentGroupName = data?.groups.find((group) => group.id === groupId)?.name?.trim();
      if (currentGroupName && currentGroupName === name) {
        return;
      }

      setRenameLoading(groupId);
      try {
        const response = await leaguesApi.renameGroup(groupId, name);
        setData(response.data);
        onUpdated?.();
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      } finally {
        setRenameLoading(null);
      }
    },
    [data, onUpdated, t]
  );

  const scheduleRename = useCallback(
    (groupId: string, value: string) => {
      if (renameTimeouts.current[groupId]) {
        clearTimeout(renameTimeouts.current[groupId]!);
      }

      renameTimeouts.current[groupId] = setTimeout(() => {
        renameTimeouts.current[groupId] = null;
        handleRenameGroup(groupId, value);
      }, RENAME_DEBOUNCE_MS);
    },
    [handleRenameGroup]
  );

  const flushRename = useCallback(
    (groupId: string, value: string) => {
      if (renameTimeouts.current[groupId]) {
        clearTimeout(renameTimeouts.current[groupId]!);
        renameTimeouts.current[groupId] = null;
      }

      handleRenameGroup(groupId, value);
    },
    [handleRenameGroup]
  );

  const handleGroupNameChange = useCallback(
    (groupId: string, value: string) => {
      setNameDrafts((prev) => ({ ...prev, [groupId]: value }));
      scheduleRename(groupId, value);
    },
    [scheduleRename]
  );

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm(t('gameDetails.confirmDeleteGroup'))) {
      return;
    }

    setDeleteLoading(groupId);
    try {
      const response = await leaguesApi.deleteGroup(groupId);
      setData(response.data);
      onUpdated?.();
      toast.success(t('gameDetails.groupDeleted'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleAddParticipant = async (groupId: string) => {
    const participantId = participantSelections[groupId];
    if (!participantId) return;

    setAddLoading(groupId);
    try {
      const response = await leaguesApi.addParticipantToGroup(groupId, participantId);
      setData(response.data);
      setParticipantSelections((prev) => ({ ...prev, [groupId]: '' }));
      onUpdated?.();
      toast.success(t('gameDetails.participantAddedToGroup'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setAddLoading(null);
    }
  };

  const handleRemoveParticipant = async (groupId: string, participantId: string) => {
    setRemoveLoading(participantId);
    try {
      const response = await leaguesApi.removeParticipantFromGroup(groupId, participantId);
      setData(response.data);
      onUpdated?.();
      toast.success(t('gameDetails.participantRemovedFromGroup'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setRemoveLoading(null);
    }
  };

  const handleMoveGroup = (index: number, direction: 'up' | 'down') => {
    if (!data) return;
    const newGroups = [...data.groups];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]];
    setData({ ...data, groups: newGroups });
  };

  const handleSaveOrder = async () => {
    if (!data) return;
    setReorderLoading(true);
    try {
      const groupIds = data.groups.map((g) => g.id);
      const response = await leaguesApi.reorderGroups(leagueSeasonId, groupIds);
      setData(response.data);
      onUpdated?.();
      toast.success(t('gameDetails.groupOrderSaved'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setReorderLoading(false);
    }
  };

  const renderParticipant = (participant: LeagueStanding) => {
    if (participant.user) {
      return (
        <div className="flex items-center gap-2">
          <PlayerAvatar
            player={{
              id: participant.user.id,
              firstName: participant.user.firstName,
              lastName: participant.user.lastName,
              avatar: participant.user.avatar,
              level: participant.user.level,
              gender: participant.user.gender,
            }}
            showName={false}
            fullHideName={true}
            extrasmall
          />
          <div className="text-sm">
            <p className="font-medium text-gray-900 dark:text-white">
              {participant.user.firstName} {participant.user.lastName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('gameDetails.points')}: {participant.points}
            </p>
          </div>
        </div>
      );
    }

    if (participant.leagueTeam) {
      const names = participant.leagueTeam.players.map((p) => `${p.user?.firstName ?? ''} ${p.user?.lastName ?? ''}`.trim()).join(', ');
      return (
        <div className="text-sm text-gray-900 dark:text-white">
          {names}
        </div>
      );
    }

    return null;
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('gameDetails.groupEditorTitle')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('gameDetails.manageGroupsDescription')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="border-b border-gray-200 dark:border-gray-800">
          <div className="flex px-4">
            <button
              onClick={() => setActiveTab('general')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'general'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('gameDetails.generalTab')}
            </button>
            <button
              onClick={() => setActiveTab('order')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'order'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('gameDetails.orderTab')}
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-6">
          {activeTab === 'general' ? (
            <>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t('gameDetails.newGroupName')}
                className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleCreateGroup}
                disabled={creatingGroup}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {creatingGroup ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                <span>{t('gameDetails.addGroup')}</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data?.groups.map((group) => {
                const color = getLeagueGroupColor(group.color);
                const borderColor = getLeagueGroupSoftColor(group.color, '40');
                
                return (
                  <div
                    key={group.id}
                    className="rounded-xl border bg-white dark:bg-gray-900 p-4 shadow-sm"
                    style={{ borderColor }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-lg border flex items-center justify-center text-xs font-semibold uppercase"
                        style={{
                          borderColor: color,
                          color,
                          backgroundColor: getLeagueGroupSoftColor(group.color, '22'),
                        }}
                      >
                        {group.name.replace(/Group\s+/i, '').slice(0, 2) || group.name.slice(0, 2)}
                      </div>
                      <input
                        type="text"
                        value={nameDrafts[group.id] || ''}
                        onChange={(e) => handleGroupNameChange(group.id, e.target.value)}
                        onBlur={() => flushRename(group.id, nameDrafts[group.id] || '')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            flushRename(group.id, nameDrafts[group.id] || '');
                          }
                        }}
                        className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      {renameLoading === group.id && (
                        <Loader2 size={14} className="animate-spin text-primary-600 dark:text-primary-400" />
                      )}
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        disabled={deleteLoading === group.id}
                        className="px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleteLoading === group.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>

                  <div className="space-y-3 mb-4">
                    {group.participants.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('gameDetails.noStandings')}
                      </p>
                    ) : (
                      group.participants.map((participant) => (
                        <div
                          key={participant.id}
                          className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                        >
                          {renderParticipant(participant)}
                          <button
                            onClick={() => handleRemoveParticipant(group.id, participant.id)}
                            disabled={removeLoading === participant.id}
                            className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {removeLoading === participant.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <>
                                <Trash2 size={14} />
                                {t('common.remove')}
                              </>
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1" ref={(el) => { dropdownRefs.current[group.id] = el; }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpenDropdown(openDropdown === group.id ? null : group.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenDropdown(openDropdown === group.id ? null : group.id);
                          }
                        }}
                        className="w-full flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white pl-4 pr-3 py-2.5 text-sm font-medium shadow-sm transition-all duration-200 hover:border-primary-300 dark:hover:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {participantSelections[group.id] ? (
                            (() => {
                              const selected = data?.unassignedParticipants.find((p) => p.id === participantSelections[group.id]);
                              if (!selected) return null;
                              
                              return selected.user ? (
                                <>
                                  <PlayerAvatar
                                    player={{
                                      id: selected.user.id,
                                      firstName: selected.user.firstName,
                                      lastName: selected.user.lastName,
                                      avatar: selected.user.avatar,
                                      level: selected.user.level,
                                      gender: selected.user.gender,
                                    }}
                                    showName={false}
                                    fullHideName={true}
                                    extrasmall
                                  />
                                  <span className="truncate">
                                    {selected.user.firstName} {selected.user.lastName}
                                  </span>
                                </>
                              ) : (
                                <span className="truncate">
                                  {selected.leagueTeam?.players.map((player) => `${player.user?.firstName ?? ''} ${player.user?.lastName ?? ''}`.trim()).join(', ')}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">{t('gameDetails.selectParticipant')}</span>
                          )}
                        </div>
                        <ChevronDown
                          size={16}
                          className={`text-gray-500 dark:text-gray-400 transition-transform duration-200 flex-shrink-0 ${
                            openDropdown === group.id ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                      {openDropdown === group.id && data?.unassignedParticipants.length > 0 && (
                        <div className="absolute z-50 mt-2 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="max-h-64 overflow-y-auto py-1">
                            {data.unassignedParticipants.map((participant) => {
                              const isSelected = participantSelections[group.id] === participant.id;

                              return (
                                <div
                                  key={participant.id}
                                  onClick={() => {
                                    setParticipantSelections((prev) => ({ ...prev, [group.id]: participant.id }));
                                    setOpenDropdown(null);
                                  }}
                                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                                      : 'text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {participant.user ? (
                                      <>
                                        <PlayerAvatar
                                          player={{
                                            id: participant.user.id,
                                            firstName: participant.user.firstName,
                                            lastName: participant.user.lastName,
                                            avatar: participant.user.avatar,
                                            level: participant.user.level,
                                            gender: participant.user.gender,
                                          }}
                                          showName={false}
                                          fullHideName={true}
                                          extrasmall
                                        />
                                        <span className="font-medium truncate">
                                          {participant.user.firstName} {participant.user.lastName}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="font-medium truncate">
                                        {participant.leagueTeam?.players.map((player) => `${player.user?.firstName ?? ''} ${player.user?.lastName ?? ''}`.trim()).join(', ')}
                                      </span>
                                    )}
                                  </div>
                                  {isSelected && <Check size={16} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleAddParticipant(group.id)}
                      disabled={!participantSelections[group.id] || addLoading === group.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md active:scale-95"
                    >
                      {addLoading === group.id ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      <span>{t('gameDetails.addParticipant')}</span>
                    </button>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
            </>
          ) : (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      {t('gameDetails.groupOrderDescription')}
                    </p>
                  </div>

                  <motion.div layout className="space-y-3">
                    <AnimatePresence initial={false}>
                      {data?.groups.map((group, index) => (
                        <motion.div
                          key={group.id}
                          layout
                          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                          className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm"
                        >
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleMoveGroup(index, 'up')}
                            disabled={index === 0}
                            className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <ArrowUp size={16} className="text-gray-700 dark:text-gray-300" />
                          </button>
                          <button
                            onClick={() => handleMoveGroup(index, 'down')}
                            disabled={index === data.groups.length - 1}
                            className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <ArrowDown size={16} className="text-gray-700 dark:text-gray-300" />
                          </button>
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-semibold text-sm">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {group.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {group.participants.length} {t('gameDetails.participants')}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {index === 0 ? t('gameDetails.bestGroup') : index === data.groups.length - 1 ? t('gameDetails.worstGroup') : ''}
                        </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>

                  <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
                    <button
                      onClick={handleSaveOrder}
                      disabled={reorderLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 text-sm font-semibold shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md active:scale-95"
                    >
                      {reorderLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      <span>{t('common.save')}</span>
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};


