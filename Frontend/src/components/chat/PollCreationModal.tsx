import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PollType } from '@/api/chat';
import { Plus, X, List, HelpCircle } from 'lucide-react';
import { Dialog, Transition } from '@headlessui/react';
import { ToggleSwitch } from '../ToggleSwitch';

interface PollCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (pollData: {
        question: string;
        options: string[];
        type: PollType;
        isAnonymous: boolean;
        allowsMultipleAnswers: boolean;
        quizCorrectOptionIndex?: number;
    }) => void;
}

export const PollCreationModal: React.FC<PollCreationModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const { t } = useTranslation();
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<string[]>(['', '']);
    const [type, setType] = useState<PollType>('CLASSICAL');
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [allowsMultipleAnswers, setAllowsMultipleAnswers] = useState(false);
    const [correctOptionIndex, setCorrectOptionIndex] = useState<number | undefined>(undefined);

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const addOption = () => {
        if (options.length < 10) {
            setOptions([...options, '']);
        }
    };

    const removeOption = (index: number) => {
        if (options.length > 2) {
            const newOptions = options.filter((_, i) => i !== index);
            setOptions(newOptions);
            if (correctOptionIndex === index) {
                setCorrectOptionIndex(undefined);
            } else if (correctOptionIndex !== undefined && correctOptionIndex > index) {
                setCorrectOptionIndex(correctOptionIndex - 1);
            }
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const filteredOptions = options.filter(o => o.trim());
        if (!question.trim() || filteredOptions.length < 2) return;
        if (type === 'QUIZ' && correctOptionIndex === undefined) return;

        onSubmit({
            question,
            options: filteredOptions,
            type,
            isAnonymous,
            allowsMultipleAnswers: type === 'QUIZ' ? false : allowsMultipleAnswers,
            quizCorrectOptionIndex: type === 'QUIZ' ? correctOptionIndex : undefined,
        });
        onClose();
    };

    return (
        <Transition show={isOpen} as={React.Fragment}>
            <Dialog onClose={onClose} className="relative z-50">
                <Transition.Child
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4">
                                    {t('chat.poll.createTitle', 'Create Poll')}
                                </Dialog.Title>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            {t('chat.poll.question', 'Question')}
                                        </label>
                                        <input
                                            type="text"
                                            value={question}
                                            onChange={(e) => setQuestion(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            {t('chat.poll.options', 'Options')}
                                        </label>
                                        <div className="space-y-2">
                                            {options.map((option, index) => (
                                                <div key={index} className="flex gap-2 items-center">
                                                    {type === 'QUIZ' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setCorrectOptionIndex(index)}
                                                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${correctOptionIndex === index
                                                                ? 'border-green-500 bg-green-500 text-white'
                                                                : 'border-gray-400'
                                                                }`}
                                                        >
                                                            {correctOptionIndex === index && <div className="w-2 h-2 bg-white rounded-full" />}
                                                        </button>
                                                    )}
                                                    <input
                                                        type="text"
                                                        value={option}
                                                        onChange={(e) => handleOptionChange(index, e.target.value)}
                                                        placeholder={t('chat.poll.optionPlaceholder', { index: index + 1 })}
                                                        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    {options.length > 2 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeOption(index)}
                                                            className="text-gray-400 hover:text-red-500"
                                                        >
                                                            <X size={20} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {options.length < 10 && (
                                            <button
                                                type="button"
                                                onClick={addOption}
                                                className="mt-2 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                <Plus size={16} />
                                                {t('chat.poll.addOption', 'Add Option')}
                                            </button>
                                        )}
                                    </div>

                                    {/* Settings */}
                                    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center gap-4">
                                            <button
                                                type="button"
                                                onClick={() => setType('CLASSICAL')}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${type === 'CLASSICAL'
                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                    }`}
                                            >
                                                <List size={16} />
                                                {t('chat.poll.typeRegular', 'Regular Poll')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setType('QUIZ')}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${type === 'QUIZ'
                                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                    }`}
                                            >
                                                <HelpCircle size={16} />
                                                {t('chat.poll.typeQuiz', 'Quiz Mode')}
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="flex items-center justify-between cursor-pointer p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    {t('chat.poll.anonymous', 'Anonymous Voting')}
                                                </span>
                                                <ToggleSwitch
                                                    checked={isAnonymous}
                                                    onChange={setIsAnonymous}
                                                />
                                            </label>

                                            {type !== 'QUIZ' && (
                                                <label className="flex items-center justify-between cursor-pointer p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        {t('chat.poll.multipleAnswers', 'Allow Multiple Answers')}
                                                    </span>
                                                    <ToggleSwitch
                                                        checked={allowsMultipleAnswers}
                                                        onChange={setAllowsMultipleAnswers}
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                        >
                                            {t('common.cancel', 'Cancel')}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!question.trim() || options.filter(o => o.trim()).length < 2 || (type === 'QUIZ' && correctOptionIndex === undefined)}
                                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {t('chat.poll.create', 'Create Poll')}
                                        </button>
                                    </div>
                                </form>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};
