import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { faqApi, Faq } from '@/api/faq';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface FaqTabProps {
  gameId: string;
}

export const FaqTab = ({ gameId }: FaqTabProps) => {
  const { t } = useTranslation();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        setLoading(true);
        const response = await faqApi.getGameFaqs(gameId);
        setFaqs(response.data);
      } catch (error) {
        console.error('Failed to fetch FAQs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFaqs();
  }, [gameId]);

  const toggleExpand = (faqId: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(faqId)) {
        newSet.delete(faqId);
      } else {
        newSet.add(faqId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      </Card>
    );
  }

  if (faqs.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            {t('faq.noFaqs', { defaultValue: 'No questions available' })}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {faqs.map((faq) => {
        const isExpanded = expandedIds.has(faq.id);
        return (
          <Card key={faq.id} className="overflow-hidden">
            <button
              onClick={() => toggleExpand(faq.id)}
              className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex-shrink-0 mt-1">
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white whitespace-pre-line">
                  {faq.question}
                </h3>
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            </button>
          </Card>
        );
      })}
    </div>
  );
};

