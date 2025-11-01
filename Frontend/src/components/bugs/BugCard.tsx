import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components';
import { Bug, BugStatus, BugType } from '@/types';

const BUG_STATUS_VALUES: BugStatus[] = ['CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED'];
const BUG_TYPE_VALUES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION'];
import { formatRelativeTime } from '@/utils/dateFormat';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { bugsApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronUp, MoreVertical, Trash2, MessageCircle } from 'lucide-react';
import { Button } from '@/components';

interface BugCardProps {
  bug: Bug;
  unreadCount?: number;
  onUpdate?: () => void;
  onDelete?: (bugId: string) => void;
}

export const BugCard = ({ bug, unreadCount = 0, onUpdate, onDelete }: BugCardProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [showMenu]);

  const getStatusColor = (status: BugStatus) => {
    switch (status) {
      case 'CREATED': return 'bg-gray-100 text-gray-800';
      case 'CONFIRMED': return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS': return 'bg-yellow-100 text-yellow-800';
      case 'TEST': return 'bg-purple-100 text-purple-800';
      case 'FINISHED': return 'bg-green-100 text-green-800';
      case 'ARCHIVED': return 'bg-slate-100 text-slate-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: BugType) => {
    switch (type) {
      case 'BUG': return 'bg-red-100 text-red-800';
      case 'CRITICAL': return 'bg-red-200 text-red-900';
      case 'SUGGESTION': return 'bg-blue-100 text-blue-800';
      case 'QUESTION': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };


  const handleStatusChange = async (newStatus: BugStatus) => {
    if (!user?.isAdmin && bug.senderId !== user?.id) return;

    setIsUpdating(true);
    try {
      await bugsApi.updateBug(bug.id, { status: newStatus });
      toast.success(t('bug.statusUpdated'));
      onUpdate?.();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'bug.statusUpdateError';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsUpdating(false);
      setShowMenu(false);
    }
  };

  const handleTypeChange = async (newType: BugType) => {
    if (!user?.isAdmin && bug.senderId !== user?.id) return;

    setIsUpdating(true);
    try {
      await bugsApi.updateBug(bug.id, { bugType: newType });
      toast.success(t('bug.typeUpdated'));
      onUpdate?.();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'bug.typeUpdateError';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsUpdating(false);
      setShowMenu(false);
    }
  };

  const handleDelete = async () => {
    if (!user?.isAdmin && bug.senderId !== user?.id) return;

    try {
      await bugsApi.deleteBug(bug.id);
      toast.success(t('bug.deleted'));
      onDelete?.(bug.id);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'bug.deleteError';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
    setShowMenu(false);
  };

  const handleOpenChat = () => {
    navigate(`/bugs/${bug.id}/chat`);
  };

  const canModify = user?.isAdmin || bug.senderId === user?.id;

  return (
    <Card className="p-4 mb-3 relative">
      <div className="flex items-start">
        <div className="flex-1 ">
          <div className="flex items-center gap-2 mb-1">
            <PlayerAvatar
              player={bug.sender}
              extrasmall
              showName={false}
            />
            <span className="text-sm font-medium">
              {bug.sender.firstName} {bug.sender.lastName}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(bug.bugType)}`}>
              {t(`bug.types.${bug.bugType}`)}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(bug.status)}`}>
              {t(`bug.statuses.${bug.status}`)}
            </span>
            <span className="text-xs text-gray-500">
              {formatRelativeTime(bug.createdAt)}
            </span>
          </div>

          <div className="text-sm text-gray-700 mb-2 w-full">
            {isExpanded ? bug.text : `${bug.text.substring(0, 100)}${bug.text.length > 100 ? '...' : ''}`}
          </div>

          {bug.text.length > 100 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-0 h-auto text-xs text-blue-600 hover:text-blue-800"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3 mr-1" />
                  {t('common.showLess')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3 mr-1" />
                  {t('common.showMore')}
                </>
              )}
            </Button>
          )}
        </div>

        <div className="absolute top-4 right-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenChat}
            className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 relative"
            title={t('bug.openChat')}
          >
            <MessageCircle className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>

          {canModify && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMenu(!showMenu)}
                disabled={isUpdating}
                className="p-1"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>

            {showMenu && createPortal(
              <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div
                  ref={modalRef}
                  className="bg-white rounded-lg shadow-xl max-w-sm w-full max-h-[80vh] overflow-y-auto"
                >
                  {(user?.isAdmin || bug.senderId === user?.id) ? (
                    <>
                      <div className="p-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">{t('bug.actions')}</h3>
                      </div>
                      <div className="p-2">
                        <div className="py-1">
                          <button
                            onClick={handleDelete}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
                            disabled={isUpdating}
                          >
                            <Trash2 className="w-3 h-3 mr-2 inline" />
                            {t('common.delete')}
                          </button>
                        </div>
                        <div className="border-t border-gray-200 py-1 mt-2">
                          <h4 className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {t('bug.changeStatus')}
                          </h4>
                          {BUG_STATUS_VALUES.map((status) => (
                            <button
                              key={status}
                              onClick={() => handleStatusChange(status)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md"
                              disabled={isUpdating}
                            >
                              {t(`bug.statuses.${status}`)}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-gray-200 py-1 mt-2">
                          <h4 className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {t('bug.changeType')}
                          </h4>
                          {BUG_TYPE_VALUES.map((type) => (
                            <button
                              key={type}
                              onClick={() => handleTypeChange(type)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md"
                              disabled={isUpdating}
                            >
                              {t(`bug.types.${type}`)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-4">
                      <div className="py-1">
                        <button
                          onClick={handleDelete}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
                          disabled={isUpdating}
                        >
                          <Trash2 className="w-3 h-3 mr-2 inline" />
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>,
              document.body
            )}
          </div>
        )}
        </div>
      </div>
    </Card>
  );
};
