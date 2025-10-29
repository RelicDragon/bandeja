import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components';
import { Bug, BugStatus, BugType } from '@/types';

const BUG_STATUS_VALUES: BugStatus[] = ['CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED'];
import { formatRelativeTime } from '@/utils/dateFormat';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { bugsApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronUp, MoreVertical, Trash2, MessageCircle } from 'lucide-react';
import { Button } from '@/components';

interface BugCardProps {
  bug: Bug;
  onUpdate?: () => void;
  onDelete?: (bugId: string) => void;
}

export const BugCard = ({ bug, onUpdate, onDelete }: BugCardProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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

  const getStatusText = (status: BugStatus) => {
    return status.replace('_', ' ');
  };

  const handleStatusChange = async (newStatus: BugStatus) => {
    if (!user?.isAdmin && bug.senderId !== user?.id) return;

    setIsUpdating(true);
    try {
      await bugsApi.updateBug(bug.id, { status: newStatus });
      toast.success(t('bug.statusUpdated'));
      onUpdate?.();
    } catch (error) {
      toast.error(t('bug.statusUpdateError'));
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
    } catch (error) {
      toast.error(t('bug.deleteError'));
    }
    setShowMenu(false);
  };

  const handleOpenChat = () => {
    navigate(`/bugs/${bug.id}/chat`);
  };

  const canModify = user?.isAdmin || bug.senderId === user?.id;

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <PlayerAvatar
              player={bug.sender}
              extrasmall
            />
            <span className="text-sm font-medium">
              {bug.sender.firstName} {bug.sender.lastName}
            </span>
          </div>
          <div className="text-xs text-gray-500 mb-2">
            {formatRelativeTime(bug.createdAt)}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(bug.bugType)}`}>
              {bug.bugType}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(bug.status)}`}>
              {getStatusText(bug.status)}
            </span>
          </div>

          <div className="text-sm text-gray-700 mb-2">
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

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenChat}
            className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            title={t('bug.openChat')}
          >
            <MessageCircle className="w-4 h-4" />
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

            {showMenu && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-32">
                {user?.isAdmin && (
                  <div className="py-1">
                    {BUG_STATUS_VALUES.map((status) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                        disabled={isUpdating}
                      >
                        {getStatusText(status)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-gray-200">
                  <button
                    onClick={handleDelete}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    disabled={isUpdating}
                  >
                    <Trash2 className="w-3 h-3 mr-2 inline" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </Card>
  );
};
