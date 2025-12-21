import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, ConfirmationModal } from '@/components';
import { faqApi, Faq } from '@/api/faq';
import { Plus, Trash2, Edit3, ChevronUp, ChevronDown, X, Save, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface FaqEditProps {
  gameId: string;
  onFaqsChange?: (hasFaqs: boolean) => void;
}

export const FaqEdit = ({ gameId, onFaqsChange }: FaqEditProps) => {
  const { t } = useTranslation();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ question: '', answer: '' });
  const [faqToDelete, setFaqToDelete] = useState<Faq | null>(null);

  useEffect(() => {
    fetchFaqs();
  }, [gameId]);

  const fetchFaqs = async () => {
    try {
      setLoading(true);
      const response = await faqApi.getGameFaqs(gameId);
      setFaqs(response.data);
      onFaqsChange?.(response.data.length > 0);
    } catch (error) {
      console.error('Failed to fetch FAQs:', error);
      toast.error(t('faq.fetchError', { defaultValue: 'Failed to fetch questions' }));
      onFaqsChange?.(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
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
        toast.success(t('faq.created', { defaultValue: 'Question created successfully' }));
      } else if (editingId) {
        await faqApi.updateFaq(editingId, formData);
        toast.success(t('faq.updated', { defaultValue: 'Question updated successfully' }));
      }
      await fetchFaqs();
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
    const faqIds = newFaqs.map(f => f.id);

    try {
      await faqApi.reorderFaqs(gameId, faqIds);
      await fetchFaqs();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('faq.reorderError', { defaultValue: 'Failed to reorder questions' });
      toast.error(errorMessage);
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === faqs.length - 1) return;

    const newFaqs = [...faqs];
    [newFaqs[index], newFaqs[index + 1]] = [newFaqs[index + 1], newFaqs[index]];
    const faqIds = newFaqs.map(f => f.id);

    try {
      await faqApi.reorderFaqs(gameId, faqIds);
      await fetchFaqs();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('faq.reorderError', { defaultValue: 'Failed to reorder questions' });
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return (
      <Card>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              FAQ
            </h2>
          </div>
          {!isCreating && !editingId && (
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 border border-primary-600 dark:border-primary-600 shadow-primary-100 dark:shadow-primary-900/20 text-white font-medium"
            >
              <Plus size={18} />
              {t('faq.add', { defaultValue: 'Add Question' })}
            </button>
          )}
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
              <textarea
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
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

        <div className="space-y-2">
          {faqs.map((faq, index) => (
            <div
              key={faq.id}
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
                    <textarea
                      value={formData.answer}
                      onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
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
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white whitespace-pre-line">
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
            </div>
          ))}
        </div>
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
    </Card>
  );
};

