import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Poll, chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { Users } from 'lucide-react';
import { PollVotersModal } from './PollVotersModal';
import { PollOptionItem } from './PollOptionItem';

interface PollMessageProps {
    poll: Poll;
    messageId: string;
    onPollUpdated?: (messageId: string, updatedPoll: Poll) => void;
}

export const PollMessage: React.FC<PollMessageProps> = ({ poll, messageId, onPollUpdated }) => {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const [isVoting, setIsVoting] = useState(false);
    const [votingOptionId, setVotingOptionId] = useState<string | null>(null);
    const [votersModalOpen, setVotersModalOpen] = useState(false);

    const totalVotes = poll.votes.length;
    const uniqueVotersCount = new Set(poll.votes.map(v => v.userId)).size;
    const userVotes = poll.votes.filter(v => v.userId === user?.id).map(v => v.optionId);
    const hasVoted = userVotes.length > 0;
    const canShowVoters = !poll.isAnonymous && hasVoted;
    const isQuiz = poll.type === 'QUIZ';

    const handleVote = async (optionId: string) => {
        if (isVoting) return;
        if (isQuiz && hasVoted) return;

        setIsVoting(true);
        setVotingOptionId(optionId);
        try {
            let newOptionIds: string[];

            if (isQuiz) {
                newOptionIds = [optionId];
            } else {
                const isCurrentlySelected = userVotes.includes(optionId);

                if (poll.allowsMultipleAnswers) {
                    newOptionIds = isCurrentlySelected
                        ? userVotes.filter(id => id !== optionId)
                        : [...userVotes, optionId];
                } else {
                    newOptionIds = isCurrentlySelected ? [] : [optionId];
                }
            }

            const updatedPoll = await chatApi.votePoll(poll.id, newOptionIds);
            onPollUpdated?.(messageId, updatedPoll);
        } catch (error) {
            console.error('Failed to vote:', error);
        } finally {
            setIsVoting(false);
            setVotingOptionId(null);
        }
    };

    const hasBadges = isQuiz || poll.isAnonymous || poll.allowsMultipleAnswers;

    return (
        <div className="w-full">
            <div className="mb-3">
                <h3
                    className={`font-semibold text-[15px] leading-snug text-gray-900 dark:text-gray-100 ${canShowVoters ? 'cursor-pointer hover:underline decoration-gray-400/50' : ''}`}
                    onClick={() => canShowVoters && setVotersModalOpen(true)}
                >
                    {poll.question}
                </h3>

                {hasBadges && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {isQuiz && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
                                {t('chat.poll.quiz')}
                            </span>
                        )}
                        {poll.isAnonymous && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 dark:bg-gray-600/30 dark:text-gray-400">
                                {t('chat.poll.anonymous')}
                            </span>
                        )}
                        {poll.allowsMultipleAnswers && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                                {t('chat.poll.multiple')}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-1.5">
                {poll.options.map((option) => {
                    const voteCount = option.votes.length;
                    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

                    return (
                        <PollOptionItem
                            key={option.id}
                            option={option}
                            isSelected={userVotes.includes(option.id)}
                            hasVoted={hasVoted}
                            isVoting={isVoting}
                            isThisOptionVoting={isVoting && votingOptionId === option.id}
                            percentage={percentage}
                            voteCount={voteCount}
                            isQuiz={isQuiz}
                            isQuizLocked={isQuiz && hasVoted}
                            isCorrect={isQuiz && !!option.isCorrect}
                            allowsMultiple={poll.allowsMultipleAnswers}
                            onClick={() => handleVote(option.id)}
                        />
                    );
                })}
            </div>

            <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => canShowVoters && setVotersModalOpen(true)}
                    className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                        canShowVoters
                            ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300'
                            : 'text-gray-400 dark:text-gray-500 cursor-default'
                    }`}
                >
                    <Users size={12} />
                    <span>
                        {t('chat.poll.vote', { count: totalVotes })}
                        {poll.allowsMultipleAnswers && totalVotes > 0 && (
                            <> · {t('chat.poll.uniqueVoters', { count: uniqueVotersCount })}</>
                        )}
                    </span>
                </button>

                {isVoting && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                        <div className="w-3 h-3 border-[1.5px] border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {canShowVoters && (
                <PollVotersModal open={votersModalOpen} onClose={() => setVotersModalOpen(false)} poll={poll} />
            )}
        </div>
    );
};
