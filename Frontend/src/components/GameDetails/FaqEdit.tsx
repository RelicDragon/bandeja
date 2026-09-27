import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, ConfirmationModal } from '@/components';
import { faqApi, Faq } from '@/api/faq';
import { Plus, Trash2, Edit3, ChevronUp, ChevronDown, X, Save, HelpCircle, Languages } from 'lucide-react';
import toast from 'react-hot-toast';
import { buildFixedTeamStandingsFaq } from '@/utils/leagueFixedTeamStandingsFaq';
import { ExpandableTextarea } from '@/components/ui/ExpandableTextarea';
import { FaqTranslationsModal } from './FaqTranslationsModal';

interface FaqEditProps {
  gameId: string;
  onFaqsChange?: (hasFaqs: boolean) => void;
  includeFixedTeamStandingsFaq?: boolean;
}

export const FaqEdit = ({
  gameId,
  onFaqsChange,
  includeFixedTeamStandingsFaq = false,
}: FaqEditProps) => {
  const { t } = useTranslation();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ question: '', answer: '' });
  const [faqToDelete, setFaqToDelete] = useState<Faq | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [translationOpen, setTranslationOpen] = useState(false);
  const isInitialLoad = useRef(true);
  const requestSequence = useRef(0);
  const activeGameId = useRef(gameId);
  activeGameId.current = gameId;

  const onFaqsChangeRef = useRef(onFaqsChange);
  
  useEffect(() => {
    onFaqsChangeRef.current = onFaqsChange;
  }, [onFaqsChange]);

  const autoFaq = includeFixedTeamStandingsFaq
    ? buildFixedTeamStandingsFaq(gameId, t)
    : null;
  const hasListContent = faqs.length > 0 || Boolean(autoFaq);

  const fetchFaqs = useCallback(async () => {
    const request = ++requestSequence.current;
    try {
      setLoading(true);
      const response = await faqApi.getGameFaqs(gameId);
      if (request !== requestSequence.current || activeGameId.current !== gameId) return;
      setFaqs(response.data);
      onFaqsChangeRef.current?.(response.data.length > 0);
      if (isInitialLoad.current) {
        setIsExpanded(response.data.length === 0);
        isInitialLoad.current = false;
      }
    } catch (error) {
      if (request !== requestSequence.current || activeGameId.current !== gameId) return;
      console.error('Failed to fetch FAQs:', error);
      toast.error(t('faq.fetchError', { defaultValue: 'Failed to fetch questions' }));
      setFaqs([]);
      onFaqsChangeRef.current?.(false);
      if (isInitialLoad.current) {
        setIsExpanded(includeFixedTeamStandingsFaq);
        isInitialLoad.current = false;
      }
    } finally {
      if (request === requestSequence.current && activeGameId.current === gameId) setLoading(false);
    }
  }, [gameId, t, includeFixedTeamStandingsFaq]);

  useEffect(() => {
    requestSequence.current += 1;
    setFaqs([]);
    setLoading(true);
    setEditingId(null);
    setIsCreating(false);
    setFormData({ question: '', answer: '' });
    setFaqToDelete(null);
    setTranslationOpen(false);
    setIsExpanded(false);
    isInitialLoad.current = true;
  }, [gameId]);

  useEffect(() => {
    void fetchFaqs();
    return () => { requestSequence.current += 1; };
  }, [fetchFaqs]);

  const handleCreate = () => {
    setIsCreating(true);
    setIsExpanded(true);
    setFormData({ question: '', answer: '' });
  };

  const handleEdit = (faq: Faq) => {
    setEditingId(faq.id);
    setFormData({ question: faq.question, answer: faq.answer });
    setIsCreating(false);
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({ question: '', answer: '' });
  };

  const handleSave = async () => {
    if (!formData.question.trim() || !formData.answer.trim()) {
      toast.error(t('faq.fieldsRequired', { defaultValue: 'Question and answer are required' }));
      return;
    }

    try {
      if (isCreating) {
        await faqApi.createFaq({ gameId, ...formData });
        if (activeGameId.current !== gameId) return;
        toast.success(t('faq.created', { defaultValue: 'Question created successfully' }));
      } else if (editingId) {
        await faqApi.updateFaq(editingId, formData);
        if (activeGameId.current !== gameId) return;
        toast.success(t('faq.updated', { defaultValue: 'Question updated successfully' }));
      }
      await fetchFaqs();
      if (activeGameId.current !== gameId) return;
      handleCancel();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('faq.saveError', { defaultValue: 'Failed to save question' });
      toast.error(errorMessage);
    }
  };

  const handleDeleteClick = (faq: Faq) => {
    setFaqToDelete(faq);
  };

  const handleDeleteConfirm = async () => {
    if (!faqToDelete) return;

    try {
      await faqApi.deleteFaq(faqToDelete.id);
      if (activeGameId.current !== gameId) return;
      toast.success(t('faq.deleted', { defaultValue: 'Question deleted successfully' }));
      await fetchFaqs();
      setFaqToDelete(null);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('faq.deleteError', { defaultValue: 'Failed to delete question' });
      toast.error(errorMessage);
      setFaqToDelete(null);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;

    const newFaqs = [...faqs];
    [newFaqs[index - 1], newFaqs[index]] = [newFaqs[index], newFaqs[index - 1]];
    setFaqs(newFaqs);
    const faqIds = newFaqs.map(f => f.id);

    try {
      await faqApi.reorderFaqs(gameId, faqIds);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('faq.reorderError', { defaultValue: 'Failed to reorder questions' });
      toast.error(errorMessage);
      await fetchFaqs();
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === faqs.length - 1) return;

    const newFaqs = [...faqs];
    [newFaqs[index], newFaqs[index + 1]] = [newFaqs[index + 1], newFaqs[index]];
    setFaqs(newFaqs);
    const faqIds = newFaqs.map(f => f.id);

    try {
      await faqApi.reorderFaqs(gameId, faqIds);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('faq.reorderError', { defaultValue: 'Failed to reorder questions' });
      toast.error(errorMessage);
      await fetchFaqs();
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="section-title">FAQ</h2>
          </div>
          <button type="button" disabled aria-describedby="faq-translation-disabled-reason" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary-600 px-3 py-2 text-primary-700 opacity-50 dark:text-primary-300 sm:w-auto">
            <Languages size={18} />{t('faq.translation.title')}
          </button>
        </div>
        <p id="faq-translation-disabled-reason" className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-end">{t('app.loading')}</p>
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500 dark:text-gray-400">
            {t('app.loading', { defaultValue: 'Loading...' })}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-h-11 items-center gap-2 pe-12 sm:min-h-0 sm:pe-0">
            <HelpCircle size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="section-title">
              FAQ
            </h2>
          </div>
          <div className="flex min-w-0 items-start gap-2 sm:w-auto">
            <div className="min-w-0 flex-1 sm:flex-none">
              <button
                type="button"
                onClick={() => setTranslationOpen(true)}
                disabled={faqs.length === 0 || isCreating || Boolean(editingId)}
                aria-describedby={faqs.length === 0 || isCreating || editingId ? 'faq-translation-disabled-reason' : undefined}
                title={isCreating || editingId ? t('faq.translation.saveFirst') : faqs.length === 0 ? t('faq.translation.addFirst') : undefined}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary-600 px-3 py-2 text-center text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-primary-300 dark:hover:bg-gray-800 sm:w-auto sm:text-base"
              >
                <Languages size={18} className="shrink-0" />
                <span className="min-w-0 break-words">{t('faq.translation.title')}</span>
              </button>
              {(faqs.length === 0 || isCreating || editingId) && (
                <p id="faq-translation-disabled-reason" className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:max-w-48">
                  {isCreating || editingId ? t('faq.translation.saveFirst') : t('faq.translation.addFirst')}
                </p>
              )}
            </div>
            {!isCreating && !editingId && (
              <>
                {hasListContent && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    aria-label={isExpanded ? t('faq.collapse', { defaultValue: 'Collapse questions' }) : t('faq.expand', { defaultValue: 'Expand questions' })}
                    className="absolute end-0 top-0 flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-primary-600 bg-primary-600 px-3 py-2 font-medium text-white shadow-sm shadow-primary-100 transition-all duration-300 ease-in-out hover:bg-primary-700 hover:shadow-md dark:border-primary-600 dark:bg-primary-600 dark:shadow-primary-900/20 dark:hover:bg-primary-700 sm:static"
                  >
                    {isExpanded ? (
                      <ChevronUp size={24} />
                    ) : (
                      <ChevronDown size={24} />
                    )}
                  </button>
                )}
                <button
                  onClick={handleCreate}
                  className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-primary-600 bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-primary-100 transition-all duration-300 ease-in-out hover:bg-primary-700 hover:shadow-md dark:border-primary-600 dark:bg-primary-600 dark:shadow-primary-900/20 dark:hover:bg-primary-700 sm:px-4 sm:text-base"
                >
                  <Plus size={18} />
                  {t('common.create')}
                </button>
              </>
            )}
          </div>
        </div>

        {isCreating && !editingId && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('faq.question', { defaultValue: 'Question' })}
              </label>
              <textarea
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows={2}
                placeholder={t('faq.questionPlaceholder', { defaultValue: 'Enter question...' })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('faq.answer', { defaultValue: 'Answer' })}
              </label>
              <ExpandableTextarea
                value={formData.answer}
                onValueChange={(answer) => setFormData({ ...formData, answer })}
                fullscreenTitle={t('faq.answer', { defaultValue: 'Answer' })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows={4}
                placeholder={t('faq.answerPlaceholder', { defaultValue: 'Enter answer...' })}
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium"
              >
                <X size={18} />
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 border border-green-600 dark:border-green-600 text-white font-medium"
              >
                <Save size={18} />
                {t('common.save', { defaultValue: 'Save' })}
              </button>
            </div>
          </div>
        )}

        {isExpanded && (
          <motion.div layout className="space-y-2">
            <AnimatePresence initial={false}>
              {faqs.map((faq, index) => (
              <motion.div
                key={faq.id}
                layout
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                className={`p-4 border rounded-lg ${
                  editingId === faq.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
              {editingId === faq.id ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('faq.question', { defaultValue: 'Question' })}
                    </label>
                    <textarea
                      value={formData.question}
                      onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('faq.answer', { defaultValue: 'Answer' })}
                    </label>
                    <ExpandableTextarea
                      value={formData.answer}
                      onValueChange={(answer) => setFormData({ ...formData, answer })}
                      fullscreenTitle={t('faq.answer', { defaultValue: 'Answer' })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={4}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium"
                    >
                      <X size={18} />
                      {t('common.cancel', { defaultValue: 'Cancel' })}
                    </button>
                    <button
                      onClick={handleSave}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 border border-green-600 dark:border-green-600 text-white font-medium"
                    >
                      <Save size={18} />
                      {t('common.save', { defaultValue: 'Save' })}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={t('faq.moveUp', { defaultValue: 'Move up' })}
                    >
                      <ChevronUp size={20} />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === faqs.length - 1}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={t('faq.moveDown', { defaultValue: 'Move down' })}
                    >
                      <ChevronDown size={20} />
                    </button>
                  </div>
                  <div className="flex-1">
                    <h3 className="section-title whitespace-pre-line">
                      {faq.question}
                    </h3>
                    <p className="mt-2 text-gray-700 dark:text-gray-300 whitespace-pre-line">
                      {faq.answer}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(faq)}
                      className="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
                      title={t('common.edit', { defaultValue: 'Edit' })}
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(faq)}
                      className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                      title={t('common.delete', { defaultValue: 'Delete' })}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
              {autoFaq && (
                <motion.div
                  key={autoFaq.id}
                  layout
                  transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                  className="p-4 border rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
                >
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                    {t('faq.automaticLabel')}
                  </p>
                  <h3 className="section-title whitespace-pre-line">{autoFaq.question}</h3>
                  <p className="mt-2 text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {autoFaq.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {faqToDelete && (
        <ConfirmationModal
          isOpen={!!faqToDelete}
          title={t('faq.deleteTitle', { defaultValue: 'Delete Question' })}
          message={t('faq.deleteConfirm', { defaultValue: 'Are you sure you want to delete this question?' })}
          confirmText={t('common.delete', { defaultValue: 'Delete' })}
          cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
          confirmVariant="danger"
          onConfirm={handleDeleteConfirm}
          onClose={() => setFaqToDelete(null)}
        />
      )}
      <FaqTranslationsModal gameId={gameId} open={translationOpen} onClose={() => setTranslationOpen(false)} />
    </Card>
  );
};
