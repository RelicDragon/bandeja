import React from 'react';
import { Poll } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { BasicUser } from '@/types';
import { Check, X, Users } from 'lucide-react';

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
        <div className="flex items-center gap-2.5 pr-8 mb-1">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Users size={14} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
              {poll.question}
            </h3>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
              {poll.votes.length} {poll.votes.length === 1 ? 'vote' : 'votes'}
            </span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 mt-3 space-y-2.5">
          {poll.options.map((option) => {
            const isCorrect = isQuiz && option.isCorrect;
            const isUserVote = userVotes.includes(option.id);
            const voters = option.votes?.filter(v => v.user).map(v => v.user!) ?? [];
            const count = option.votes?.length ?? 0;

            let borderColor = 'border-gray-200 dark:border-gray-700';
            let bgColor = 'bg-gray-50/50 dark:bg-gray-800/30';
            if (isCorrect) {
              borderColor = 'border-emerald-300/60 dark:border-emerald-500/30';
              bgColor = 'bg-emerald-50/50 dark:bg-emerald-500/5';
            } else if (isUserVote) {
              borderColor = 'border-emerald-300/40 dark:border-emerald-500/20';
              bgColor = 'bg-emerald-50/30 dark:bg-emerald-500/5';
            }

            return (
              <div key={option.id} className={`rounded-xl border ${borderColor} ${bgColor} overflow-hidden`}>
                <div className="flex items-center gap-2 px-3 py-2">
                  {isQuiz && isCorrect && (
                    <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                  {isQuiz && !isCorrect && isUserVote && (
                    <div className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
                      <X size={10} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                  <span className="text-[13px] font-medium text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">
                    {option.text}
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0 font-semibold">
                    {count}
                  </span>
                </div>

                {voters.length > 0 && (
                  <div className="px-3 pb-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
                    {voters.map((voter: BasicUser) => (
                      <div
                        key={voter.id}
                        className={`flex items-center gap-1.5 py-0.5 ${
                          voter.id === user?.id
                            ? 'bg-emerald-100/60 dark:bg-emerald-500/10 rounded-full px-1.5 -mx-0.5'
                            : ''
                        }`}
                      >
                        <PlayerAvatar player={voter} extrasmall fullHideName showName={false} asDiv />
                        <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate max-w-[90px] font-medium">
                          {[voter.firstName, voter.lastName].filter(Boolean).join(' ') || '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
