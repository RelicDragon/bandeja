import React from 'react';
import { Poll } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { BasicUser } from '@/types';

interface PollVotersModalProps {
  open: boolean;
  onClose: () => void;
  poll: Poll;
}

export const PollVotersModal: React.FC<PollVotersModalProps> = ({ open, onClose, poll }) => {
  const { user } = useAuthStore();
  const userVotes = poll.votes.filter(v => v.userId === user?.id).map(v => v.optionId);
  const isQuiz = poll.type === 'QUIZ';

  return (
    <Dialog open={open} onClose={onClose} modalId="poll-voters-modal">
      <DialogContent className="max-w-sm max-h-[80vh] overflow-hidden flex flex-col" showCloseButton>
        <div className="flex items-baseline justify-between gap-2 pr-8">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">{poll.question}</h3>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums shrink-0">{poll.votes.length}</span>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0 mt-2 space-y-2">
          {poll.options.map((option) => {
            const isCorrect = isQuiz && option.isCorrect;
            const isUserVote = userVotes.includes(option.id);
            const voters = option.votes?.filter(v => v.user).map(v => v.user!) ?? [];
            const count = option.votes?.length ?? 0;
            const optionBg = isCorrect ? 'bg-emerald-500/10 border-emerald-500/40' : isUserVote ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700';
            return (
              <div key={option.id} className={`rounded-lg border px-2 py-1.5 ${optionBg}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate min-w-0">{option.text}</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums shrink-0">{count}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {voters.map((voter: BasicUser) => (
                    <div key={voter.id} className={`flex items-center gap-1.5 ${voter.id === user?.id ? 'ring-1 ring-emerald-500/50 rounded px-1 -mx-1' : ''}`}>
                      <PlayerAvatar player={voter} extrasmall fullHideName showName={false} asDiv />
                      <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate max-w-[100px]">
                        {[voter.firstName, voter.lastName].filter(Boolean).join(' ') || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
