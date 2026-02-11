import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { marketplaceApi, citiesApi, mediaApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { MarketItem, MarketItemCategory, City, PriceCurrency, MarketItemTradeType } from '@/types';
import { Button, Input, Card } from '@/components';
import { FormField, MediaGalleryField, TradeTypeCheckboxes, PriceInputWithCurrency, priceToCents, centsToPrice, AuctionDurationSelector, CategorySelector, INPUT_CLASS } from '@/components/marketplace';
import { MapPin } from 'lucide-react';
import { pickImages } from '@/utils/photoCapture';

interface MarketItemEditFormProps {
  item: MarketItem;
  onSave: (updatedItem: MarketItem) => void;
  onCancel: () => void;
}

export const MarketItemEditForm = ({ item, onSave, onCancel }: MarketItemEditFormProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [categories, setCategories] = useState<MarketItemCategory[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const userCityId = user?.currentCity?.id || user?.currentCityId;

  const [form, setForm] = useState({
    categoryId: item.categoryId,
    cityId: item.cityId,
    title: item.title,
    description: item.description || '',
    mediaUrls: item.mediaUrls || [],
    tradeTypes: item.tradeTypes?.length ? item.tradeTypes : ['BUY_IT_NOW'] as MarketItemTradeType[],
    priceCents: centsToPrice(item.priceCents),
    currency: (item.currency || 'EUR') as PriceCurrency,
    auctionEndsAt: item.auctionEndsAt ? new Date(item.auctionEndsAt).toISOString() : '',
  });

  useEffect(() => {
    Promise.all([marketplaceApi.getCategories(), citiesApi.getAll()]).then(([catRes, cityRes]) => {
      setCategories(catRes.data || []);
      setCities(cityRes.data || []);
    });
  }, []);

  const handleAddPhotos = async () => {
    const result = await pickImages(5 - form.mediaUrls.length);
    if (!result?.files?.length) return;
    setUploadingMedia(true);
    try {
      const urls: string[] = [];
      for (const file of result.files) {
        const res = await mediaApi.uploadMarketItemImage(file);
        urls.push(res.originalUrl);
      }
      setForm((f) => ({ ...f, mediaUrls: [...f.mediaUrls, ...urls].slice(0, 5) }));
    } catch {
      toast.error(t('marketplace.uploadFailed', { defaultValue: 'Failed to upload image' }));
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error(t('marketplace.titleRequired', { defaultValue: 'Title is required' }));
      return;
    }
    if (!form.categoryId) {
      toast.error(t('marketplace.categoryRequired', { defaultValue: 'Category is required' }));
      return;
    }
    const cityId = form.cityId || userCityId;
    if (!cityId) {
      toast.error(t('marketplace.cityRequired', { defaultValue: 'City is required' }));
      return;
    }
    const isFree = form.tradeTypes.includes('FREE');
    const priceCentsVal = isFree ? undefined : priceToCents(form.priceCents);

    if (!isFree) {
      if (form.tradeTypes.includes('BUY_IT_NOW') && (priceCentsVal == null || priceCentsVal < 1)) {
        toast.error(t('marketplace.priceRequired', { defaultValue: 'Price is required for Buy now' }));
        return;
      }
      if (form.tradeTypes.includes('AUCTION')) {
        if (priceCentsVal == null || priceCentsVal < 0) {
          toast.error(t('marketplace.startingBidRequired', { defaultValue: 'Starting bid is required for Auction' }));
          return;
        }
        if (!form.auctionEndsAt) {
          toast.error(t('marketplace.auctionEndRequired', { defaultValue: 'Auction end date is required' }));
          return;
        }
        if (new Date(form.auctionEndsAt) <= new Date()) {
          toast.error(t('marketplace.auctionEndFuture', { defaultValue: 'Auction end date must be in the future' }));
          return;
        }
      }
    }
    setLoading(true);
    try {
      const res = await marketplaceApi.updateMarketItem(item.id, {
        categoryId: form.categoryId,
        cityId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        mediaUrls: form.mediaUrls,
        tradeTypes: form.tradeTypes,
        priceCents: priceCentsVal,
        currency: form.currency,
        auctionEndsAt: form.auctionEndsAt || undefined,
      });
      toast.success(t('marketplace.updated', { defaultValue: 'Listing updated' }));
      onSave(res.data);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(false);
    }
  };

  const tradeTypeOptions: Array<{ value: MarketItemTradeType; label: string }> = [
    { value: 'BUY_IT_NOW', label: t('marketplace.buyItNow', { defaultValue: 'Buy now' }) },
    { value: 'SUGGESTED_PRICE', label: t('marketplace.suggestedPrice', { defaultValue: 'Haggling welcome' }) },
    { value: 'AUCTION', label: t('marketplace.auction', { defaultValue: 'Auction' }) },
    { value: 'FREE', label: t('marketplace.free', { defaultValue: 'Free' }) },
  ];

  const handleTradeTypesChange = (newTypes: MarketItemTradeType[]) => {
    // If FREE is selected, make it exclusive and clear price
    if (newTypes.includes('FREE')) {
      setForm((f) => ({ ...f, tradeTypes: ['FREE'], priceCents: '' }));
    } else {
      setForm((f) => ({ ...f, tradeTypes: newTypes }));
    }
  };

  return (
    <div className="pb-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-3 space-y-3 border-0 shadow-none">
          {(() => {
            const cityId = form.cityId || userCityId;
            const cityName = user?.currentCity?.name ?? cities.find((c) => c.id === cityId)?.name;
            return cityName ? (
              <p className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-primary-500" strokeWidth={2.25} />
                {t('marketplace.itemPlacedIn', { defaultValue: 'Your listing will be placed in {{city}}', city: cityName })}
              </p>
            ) : null;
          })()}

          <FormField>
            <MediaGalleryField
              urls={form.mediaUrls}
              onAdd={handleAddPhotos}
              onRemove={(i) => setForm((f) => ({ ...f, mediaUrls: f.mediaUrls.filter((_, idx) => idx !== i) }))}
              uploading={uploadingMedia}
            />
          </FormField>

          <FormField required>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('marketplace.titlePlaceholder', { defaultValue: 'Listing title' })}
              className="px-3 py-2 rounded-lg"
            />
          </FormField>

          <FormField>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className={INPUT_CLASS}
              placeholder={t('marketplace.descriptionPlaceholder', { defaultValue: 'Describe your listing...' })}
            />
          </FormField>

          <div className="w-full">
            <CategorySelector
              value={form.categoryId}
              onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              categories={categories}
            />
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />

          <FormField>
            <TradeTypeCheckboxes
              value={form.tradeTypes}
              onChange={handleTradeTypesChange}
              options={tradeTypeOptions}
            />
          </FormField>

          {!form.tradeTypes.includes('FREE') && (form.tradeTypes.includes('BUY_IT_NOW') || form.tradeTypes.includes('AUCTION')) && (
            <FormField required>
              <PriceInputWithCurrency
                value={form.priceCents}
                onChange={(v) => setForm((f) => ({ ...f, priceCents: v }))}
                currency={form.currency}
                onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                placeholder="0.00"
              />
            </FormField>
          )}

          {!form.tradeTypes.includes('FREE') && form.tradeTypes.includes('AUCTION') && (
            <FormField required>
              <AuctionDurationSelector
                value={form.auctionEndsAt}
                onChange={(endTime) => setForm((f) => ({ ...f, auctionEndsAt: endTime }))}
              />
            </FormField>
          )}
        </Card>

        <div className="flex gap-3 justify-center">
          <Button type="button" variant="secondary" className="w-full max-w-[150px]" size="md" onClick={onCancel}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button type="submit" variant="primary" className="w-full max-w-[150px] shadow-[0_0_20px_rgba(14,165,233,0.4)]" size="md" disabled={loading}>
            {loading ? t('common.loading', { defaultValue: 'Loading...' }) : t('marketplace.save', { defaultValue: 'Save' })}
          </Button>
        </div>
      </form>
    </div>
  );
};
