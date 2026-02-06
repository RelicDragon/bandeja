import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Poll, chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { CheckCircle2, Circle, X, BarChart3, Users, Play } from 'lucide-react';
import { PollVotersModal } from './PollVotersModal';

interface PollMessageProps {
    poll: Poll;
    messageId: string;
}

export const PollMessage: React.FC<PollMessageProps> = ({ poll }) => {
    const { t } = useTranslation();
    const { user } = useAuthStore();
    const [isVoting, setIsVoting] = useState(false);
    const [votersModalOpen, setVotersModalOpen] = useState(false);

    const totalVotes = poll.votes.length;
    const userVotes = poll.votes.filter(v => v.userId === user?.id).map(v => v.optionId);
    const hasVoted = userVotes.length > 0;
    const canShowVoters = !poll.isAnonymous && hasVoted;

    const handleVote = async (optionId: string) => {
        if (isVoting) return;

        const isQuiz = poll.type === 'QUIZ';
        
        if (isQuiz && hasVoted) {
            return;
        }

        setIsVoting(true);
        try {
            let newOptionIds: string[];

            if (isQuiz) {
                newOptionIds = [optionId];
            } else {
                const isCurrentlySelected = userVotes.includes(optionId);

                if (poll.allowsMultipleAnswers) {
                    if (isCurrentlySelected) {
                        newOptionIds = userVotes.filter(id => id !== optionId);
                    } else {
                        newOptionIds = [...userVotes, optionId];
                    }
                } else {
                    if (isCurrentlySelected) {
                        newOptionIds = [];
                    } else {
                        newOptionIds = [optionId];
                    }
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
        <div className="max-w-md">
            <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                    <BarChart3 size={16} className="text-gray-500 dark:text-gray-400 shrink-0" />
                    <h3
                        className={`font-semibold text-gray-900 dark:text-gray-100 text-[15px] leading-snug ${canShowVoters ? 'cursor-pointer hover:underline' : ''}`}
                        onClick={() => canShowVoters && setVotersModalOpen(true)}
                    >
                        {poll.question}
                    </h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    {isQuiz && <span>{t('chat.poll.quiz')}</span>}
                    {poll.isAnonymous && <span>{t('chat.poll.anonymous')}</span>}
                    {poll.allowsMultipleAnswers && <span>{t('chat.poll.multiple')}</span>}
                </div>
            </div>

            <div className="space-y-1.5">
                {poll.options.map((option) => {
                    const voteCount = option.votes.length;
                    const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                    const isSelected = userVotes.includes(option.id);
                    const isCorrect = isQuiz && option.isCorrect;
                    const isQuizLocked = isQuiz && hasVoted;

                    let optionClass = `relative overflow-hidden rounded-lg border transition-all duration-200 ${isQuizLocked ? 'cursor-not-allowed' : 'cursor-pointer'} group`;
                    let progressBarClass = "absolute left-0 top-0 bottom-0 transition-all duration-500";
                    let icon: React.ReactNode;
                    let iconColor = "";

                    if (isQuiz && hasVoted) {
                        if (isCorrect && isSelected) {
                            optionClass += " border-emerald-500/60 bg-emerald-500/5";
                            progressBarClass += " bg-emerald-500/20";
                            icon = <CheckCircle2 size={16} />;
                            iconColor = "text-emerald-600 dark:text-emerald-400";
                        } else if (isCorrect && !isSelected) {
                            optionClass += " border-emerald-500/60 bg-emerald-500/5";
                            progressBarClass += " bg-emerald-500/20";
                            icon = <Play size={16} className="fill-current" />;
                            iconColor = "text-emerald-600 dark:text-emerald-400";
                        } else if (isSelected && !isCorrect) {
                            optionClass += " border-red-500/60 bg-red-500/5";
                            progressBarClass += " bg-red-500/20";
                            icon = <X size={16} />;
                            iconColor = "text-red-600 dark:text-red-400";
                        } else {
                            optionClass += " border-gray-200 dark:border-gray-700";
                            progressBarClass += " bg-gray-200/50 dark:bg-gray-600/30";
                            icon = <span className="w-4 h-4 shrink-0" />;
                        }
                    } else {
                        icon = isSelected ? <CheckCircle2 size={16} /> : <Circle size={16} />;
                        if (isSelected) {
                            optionClass += " border-emerald-500/60 bg-emerald-500/5 dark:bg-emerald-500/10";
                            progressBarClass += " bg-emerald-500/20";
                            iconColor = "text-emerald-600 dark:text-emerald-400";
                        } else {
                            optionClass += " border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50";
                            progressBarClass += " bg-gray-200/50 dark:bg-gray-600/30";
                            iconColor = "text-gray-500 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300";
                        }
                    }

                    return (
                        <div
                            key={option.id}
                            onClick={() => handleVote(option.id)}
                            className={optionClass}
                        >
                            <div className={progressBarClass} style={{ width: `${percentage}%` }} />
                            <div className="relative px-3 py-2 flex items-center justify-between z-10">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <div className={`shrink-0 ${iconColor}`}>{icon}</div>
                                    <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{option.text}</span>
                                </div>
                                {hasVoted && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-2 tabular-nums">
                                        {percentage}%{voteCount > 0 && ` (${voteCount})`}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-2 pt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div
                    className={`flex items-center gap-1 ${canShowVoters ? 'cursor-pointer hover:text-gray-700 dark:hover:text-gray-300' : ''}`}
                    onClick={() => canShowVoters && setVotersModalOpen(true)}
                >
                    <Users size={12} />
                    <span>{totalVotes} {totalVotes === 1 ? t('chat.poll.vote') : t('chat.poll.votes')}</span>
                </div>
                {isVoting && (
                    <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                        <span>{t('chat.poll.voting')}</span>
                    </div>
                )}
            </div>
            {canShowVoters && (
                <PollVotersModal open={votersModalOpen} onClose={() => setVotersModalOpen(false)} poll={poll} />
            )}
        </div>
    );
};
