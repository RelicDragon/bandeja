import React from 'react';
import { Check, X } from 'lucide-react';
import { PollOption } from '@/api/chat';

interface PollOptionItemProps {
    option: PollOption;
    isSelected: boolean;
    hasVoted: boolean;
    isVoting: boolean;
    isThisOptionVoting: boolean;
    percentage: number;
    voteCount: number;
    isQuiz: boolean;
    isQuizLocked: boolean;
    isCorrect: boolean;
    allowsMultiple: boolean;
    onClick: () => void;
}

export const PollOptionItem: React.FC<PollOptionItemProps> = ({
    option,
    isSelected,
    hasVoted,
    isVoting,
    isThisOptionVoting,
    percentage,
    isQuiz,
    isQuizLocked,
    isCorrect,
    allowsMultiple,
    onClick,
}) => {
    const disabled = isVoting || isQuizLocked;

    const getContainerClasses = () => {
        const base = 'relative w-full text-left rounded-xl overflow-hidden transition-all duration-200';
        const cursor = disabled ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]';
        const opacity = isVoting && !isThisOptionVoting ? 'opacity-60' : '';

        if (isQuiz && hasVoted) {
            if (isCorrect) {
                return `${base} ${cursor} ${opacity} border border-emerald-400/50 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5`;
            }
            if (isSelected && !isCorrect) {
                return `${base} ${cursor} ${opacity} border border-rose-400/50 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/5`;
            }
            return `${base} ${cursor} ${opacity} border border-gray-200/60 dark:border-gray-600/40 bg-gray-50/30 dark:bg-gray-700/20`;
        }

        if (isSelected) {
            return `${base} ${cursor} ${opacity} border border-emerald-400/50 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5`;
        }

        if (hasVoted) {
            return `${base} ${cursor} ${opacity} border border-gray-200/60 dark:border-gray-600/40 bg-gray-50/30 dark:bg-gray-700/20`;
        }

        return `${base} ${cursor} ${opacity} border border-gray-200 dark:border-gray-600/60 bg-gray-50/50 dark:bg-gray-700/30 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 hover:border-gray-300 dark:hover:border-gray-500/60`;
    };

    const getProgressBarClasses = () => {
        if (isQuiz && hasVoted) {
            if (isCorrect) return 'bg-emerald-400/20 dark:bg-emerald-500/15';
            if (isSelected) return 'bg-rose-400/20 dark:bg-rose-500/15';
            return 'bg-gray-200/30 dark:bg-gray-600/15';
        }
        if (isSelected) return 'bg-emerald-400/20 dark:bg-emerald-500/15';
        return 'bg-gray-200/40 dark:bg-gray-600/15';
    };

    const getIndicator = () => {
        if (isThisOptionVoting) {
            return (
                <div className="w-[18px] h-[18px] border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            );
        }

        if (isQuiz && hasVoted) {
            if (isCorrect) {
                return (
                    <div className="w-[18px] h-[18px] rounded-full bg-emerald-500 flex items-center justify-center">
                        <Check size={11} className="text-white" strokeWidth={3} />
                    </div>
                );
            }
            if (isSelected && !isCorrect) {
                return (
                    <div className="w-[18px] h-[18px] rounded-full bg-rose-500 flex items-center justify-center">
                        <X size={11} className="text-white" strokeWidth={3} />
                    </div>
                );
            }
            return <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 dark:border-gray-500" />;
        }

        if (isSelected) {
            return (
                <div className="w-[18px] h-[18px] rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check size={11} className="text-white" strokeWidth={3} />
                </div>
            );
        }

        const shape = allowsMultiple ? 'rounded-[4px]' : 'rounded-full';
        return <div className={`w-[18px] h-[18px] ${shape} border-2 border-gray-300 dark:border-gray-500 transition-colors group-hover:border-gray-400 dark:group-hover:border-gray-400`} />;
    };

    const getPercentageColor = () => {
        if (isQuiz && hasVoted) {
            if (isCorrect) return 'text-emerald-600 dark:text-emerald-400';
            if (isSelected) return 'text-rose-600 dark:text-rose-400';
            return 'text-gray-400 dark:text-gray-500';
        }
        if (isSelected) return 'text-emerald-600 dark:text-emerald-400';
        return 'text-gray-400 dark:text-gray-500';
    };

    const getTextColor = () => {
        if (isQuiz && hasVoted) {
            if (isCorrect) return 'text-emerald-800 dark:text-emerald-200';
            if (isSelected && !isCorrect) return 'text-rose-800 dark:text-rose-200';
        }
        return 'text-gray-800 dark:text-gray-200';
    };

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`${getContainerClasses()} group`}
        >
            {hasVoted && (
                <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${getProgressBarClasses()}`}
                    style={{ width: `${percentage}%` }}
                />
            )}

            <div className="relative flex items-center gap-2.5 px-3 py-2.5">
                <div className="shrink-0">
                    {getIndicator()}
                </div>

                <span className={`flex-1 text-[13px] font-medium leading-snug ${getTextColor()}`}>
                    {option.text}
                </span>

                {hasVoted && !isThisOptionVoting && (
                    <span className={`shrink-0 text-xs font-semibold tabular-nums ${getPercentageColor()}`}>
                        {percentage}%
                    </span>
                )}
            </div>
        </button>
    );
};
