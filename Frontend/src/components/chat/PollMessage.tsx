import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Poll, chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { CheckCircle2, Circle, X } from 'lucide-react';

interface PollMessageProps {
    poll: Poll;
    messageId: string;
}

export const PollMessage: React.FC<PollMessageProps> = ({ poll }) => {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const [isVoting, setIsVoting] = useState(false);

    const totalVotes = poll.votes.length;
    const userVotes = poll.votes.filter(v => v.userId === user?.id).map(v => v.optionId);
    const hasVoted = userVotes.length > 0;

    const handleVote = async (optionId: string) => {
        if (isVoting) return;

        // Optimistic update logic could go here, but for now we'll wait for server
        setIsVoting(true);
        try {
            let newOptionIds = [...userVotes];

            if (poll.allowsMultipleAnswers) {
                if (newOptionIds.includes(optionId)) {
                    newOptionIds = newOptionIds.filter(id => id !== optionId);
                } else {
                    newOptionIds.push(optionId);
                }
            } else {
                // Single choice toggle
                if (newOptionIds.includes(optionId)) {
                    newOptionIds = []; // Deselect if clicking same
                } else {
                    newOptionIds = [optionId];
                }
            }

            await chatApi.votePoll(poll.id, newOptionIds);
        } catch (error) {
            console.error('Failed to vote:', error);
        } finally {
            setIsVoting(false);
        }
    };

    const isQuiz = poll.type === 'QUIZ';

    return (
        <div className="min-w-[280px] max-w-sm">
            <div className="mb-3">
                <h3 className="font-bold text-lg mb-1">{poll.question}</h3>
                <div className="text-xs text-gray-500 flex gap-2">
                    <span>{isQuiz ? t('chat.poll.quiz') : t('chat.poll.poll')}</span>
                    <span>•</span>
                    <span>{poll.isAnonymous ? t('chat.poll.anonymous') : t('chat.poll.public')}</span>
                </div>
            </div>

            <div className="space-y-2">
                {poll.options.map((option) => {
                    const voteCount = option.votes.length;
                    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                    const isSelected = userVotes.includes(option.id);
                    const isCorrect = isQuiz && option.isCorrect;

                    // Quiz logic: Show correct/wrong colors only if user has voted
                    let optionClass = "relative overflow-hidden rounded-lg border transition-all cursor-pointer";
                    let progressBarClass = "absolute left-0 top-0 bottom-0 opacity-20 transition-all duration-500";
                    let icon = isSelected ? <CheckCircle2 size={20} className="text-blue-500" /> : <Circle size={20} className="text-gray-300" />;

                    if (isQuiz && hasVoted) {
                        if (isCorrect) {
                            optionClass += " border-green-500 bg-green-50 dark:bg-green-900/20";
                            progressBarClass += " bg-green-500";
                            icon = <CheckCircle2 size={20} className="text-green-500" />;
                        } else if (isSelected && !isCorrect) {
                            optionClass += " border-red-500 bg-red-50 dark:bg-red-900/20";
                            progressBarClass += " bg-red-500";
                            icon = <X size={20} className="text-red-500" />; // Need to import X
                        } else {
                            optionClass += " border-gray-200 dark:border-gray-700";
                            progressBarClass += " bg-gray-200 dark:bg-gray-700";
                        }
                    } else {
                        if (isSelected) {
                            optionClass += " border-blue-500 bg-blue-50 dark:bg-blue-900/20";
                            progressBarClass += " bg-blue-500";
                        } else {
                            optionClass += " border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50";
                            progressBarClass += " bg-blue-200 dark:bg-blue-800";
                        }
                    }

                    return (
                        <div
                            key={option.id}
                            onClick={() => handleVote(option.id)}
                            className={optionClass}
                        >
                            <div
                                className={progressBarClass}
                                style={{ width: `${percentage}%` }}
                            />
                            <div className="relative p-3 flex items-center justify-between z-10">
                                <div className="flex items-center gap-3">
                                    {icon}
                                    <span className="font-medium">{option.text}</span>
                                </div>
                                {hasVoted && (
                                    <span className="text-sm font-semibold ml-2">
                                        {percentage}%
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-3 text-xs text-gray-500">
                {totalVotes} {totalVotes === 1 ? t('chat.poll.vote') : t('chat.poll.votes')}
            </div>
        </div>
    );
};
