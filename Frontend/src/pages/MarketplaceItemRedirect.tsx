import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marketplaceApi } from '@/api';

export const MarketplaceItemRedirect = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'notfound'>('loading');

  const location = useLocation();
  const fromSubtab = (location.state as { fromMarketplaceSubtab?: 'my' | 'market' } | null)?.fromMarketplaceSubtab;

  useEffect(() => {
    if (!id) {
      setStatus('notfound');
      return;
    }
    marketplaceApi.getMarketItemById(id)
      .then((res) => {
        const item = res.data;
        if (item) {
          setStatus('redirecting');
          const listPath = fromSubtab === 'my' ? '/marketplace/my' : '/marketplace';
          navigate(listPath, { replace: true, state: { openMarketItem: item } });
        } else {
          setStatus('notfound');
        }
      })
      .catch(() => setStatus('notfound'));
  }, [id, navigate, fromSubtab]);

  if (status === 'notfound') {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <p className="text-gray-500 dark:text-gray-400 mb-6">{t('marketplace.itemNotFound', { defaultValue: 'Listing not found' })}</p>
        <button
          onClick={() => navigate(fromSubtab === 'my' ? '/marketplace/my' : '/marketplace')}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          {t('marketplace.backToList', { defaultValue: 'Back to marketplace' })}
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-10 w-10 border-2 border-primary-500 border-t-transparent rounded-full" />
    </div>
  );
};
