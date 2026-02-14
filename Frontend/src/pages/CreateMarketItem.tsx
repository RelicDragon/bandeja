import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { marketplaceApi, citiesApi, mediaApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { MarketItemCategory, City, PriceCurrency, MarketItemTradeType, AuctionType } from '@/types';
import { Button, Input, Card } from '@/components';
import { FormField, MediaGalleryField, TradeTypeCheckboxes, PriceInputWithCurrency, priceToCents, centsToPrice, AuctionDurationSelector, CategorySelector, CitySelectorField, INPUT_CLASS, PRICING_SECTION_LABEL, PRICING_SECTION_LABEL_INLINE } from '@/components/marketplace';
import { ToggleSwitch } from '@/components';
import { formatPrice } from '@/utils/currency';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { MapPin } from 'lucide-react';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { pickImages } from '@/utils/photoCapture';

const MARKETPLACE_DRAFT_KEY = 'marketplace_create_draft';

type DraftForm = {
  categoryId: string;
  cityId: string;
  additionalCityIds: string[];
  title: string;
  description: string;
  mediaUrls: string[];
  tradeTypes: MarketItemTradeType[];
  priceCents: string;
  currency: PriceCurrency;
};

const loadDraft = (): Partial<DraftForm> | null => {
  try {
    const s = localStorage.getItem(MARKETPLACE_DRAFT_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

const clearDraft = () => {
  try {
    localStorage.removeItem(MARKETPLACE_DRAFT_KEY);
  } catch {
    // ignore
  }
};

export const CreateMarketItem = () => {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isEdit = !!id;
  const [categories, setCategories] = useState<MarketItemCategory[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

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

  const userCityId = user?.currentCity?.id || user?.currentCityId;
  const [form, setForm] = useState({
    categoryId: '',
    cityId: userCityId ?? '',
    additionalCityIds: [] as string[],
    title: '',
    description: '',
    mediaUrls: [] as string[],
    tradeTypes: ['BUY_IT_NOW'] as MarketItemTradeType[],
    negotiationAcceptable: false,
    priceCents: '',
    currency: 'EUR' as PriceCurrency,
    auctionEndsAt: '',
    auctionType: 'RISING' as AuctionType,
    reservePriceCents: '',
    buyItNowPriceCents: '',
    hollandDecrement: '',
    hollandIntervalMinutes: '' as '' | number,
  });

  useEffect(() => {
    Promise.all([marketplaceApi.getCategories(), citiesApi.getAll()]).then(([catRes, cityRes]) => {
      const cats = catRes.data || [];
      setCategories(cats);
      setCities(cityRes.data || []);
      setForm((f) => {
        let next = !f.cityId && userCityId ? { ...f, cityId: userCityId } : f;
        if (!id) {
          const draft = loadDraft();
          if (draft) {
            next = {
              ...next,
              categoryId: draft.categoryId ?? next.categoryId,
              cityId: draft.cityId ?? userCityId ?? next.cityId,
              additionalCityIds: draft.additionalCityIds ?? [],
              title: draft.title ?? '',
              description: draft.description ?? '',
              mediaUrls: draft.mediaUrls ?? [],
              tradeTypes: draft.tradeTypes ?? ['BUY_IT_NOW'],
              priceCents: draft.priceCents ?? '',
              currency: (draft.currency ?? 'EUR') as PriceCurrency,
              auctionEndsAt: '',
            };
          }
          if (!next.categoryId && cats.length > 0) next = { ...next, categoryId: cats[0].id };
        }
        return next;
      });
    });
  }, [userCityId, id]);

  useEffect(() => {
    if (id && user) {
      marketplaceApi.getMarketItemById(id).then((res) => {
        const item = res.data;
        if (item.sellerId !== user.id) {
          toast.error(t('marketplace.notSeller', { defaultValue: 'You can only edit your own listings' }));
          navigate('/marketplace');
          return;
        }
        setForm({
          categoryId: item.categoryId,
          cityId: item.cityId,
          additionalCityIds: item.additionalCityIds || [],
          title: item.title,
          description: item.description || '',
          mediaUrls: item.mediaUrls || [],
          tradeTypes: item.tradeTypes?.length ? [item.tradeTypes[0]] : ['BUY_IT_NOW'],
          negotiationAcceptable: item.negotiationAcceptable ?? false,
          priceCents: centsToPrice(item.startingPriceCents ?? item.priceCents),
          currency: (item.currency || 'EUR') as PriceCurrency,
          auctionEndsAt: item.auctionEndsAt ? new Date(item.auctionEndsAt).toISOString() : '',
          auctionType: (item.auctionType || 'RISING') as AuctionType,
          reservePriceCents: centsToPrice(item.reservePriceCents),
          buyItNowPriceCents: centsToPrice(item.buyItNowPriceCents),
          hollandDecrement: item.hollandDecrementCents != null ? centsToPrice(item.hollandDecrementCents) : '',
          hollandIntervalMinutes: item.hollandIntervalMinutes ?? '',
        });
      }).catch(() => navigate('/marketplace'));
    }
  }, [id, user, navigate, t]);

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
    const reserveCentsVal = form.tradeTypes.includes('AUCTION') && form.reservePriceCents !== '' ? priceToCents(form.reservePriceCents) : undefined;
    const buyItNowCentsVal = form.tradeTypes.includes('AUCTION') && form.buyItNowPriceCents !== '' ? priceToCents(form.buyItNowPriceCents) : undefined;

    if (!isFree) {
      if (form.tradeTypes.includes('BUY_IT_NOW') && !form.tradeTypes.includes('AUCTION') && (priceCentsVal == null || priceCentsVal < 1)) {
        toast.error(t('marketplace.priceRequired', { defaultValue: 'Price is required for Buy now' }));
        return;
      }
      if (form.tradeTypes.includes('AUCTION')) {
        if (priceCentsVal == null || priceCentsVal < 0) {
          toast.error(t('marketplace.startingBidRequired', { defaultValue: 'Starting bid is required for Auction' }));
          return;
        }
        if (reserveCentsVal != null && (reserveCentsVal < (priceCentsVal ?? 0) || (buyItNowCentsVal != null && reserveCentsVal > buyItNowCentsVal))) {
          toast.error(t('marketplace.reserveBetweenStartAndBin', { defaultValue: 'Reserve must be between starting and Buy it now price' }));
          return;
        }
        if (buyItNowCentsVal != null && buyItNowCentsVal < (priceCentsVal ?? 0)) {
          toast.error(t('marketplace.binMinStarting', { defaultValue: 'Buy it now must be at least starting price' }));
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
        if (form.auctionType === 'HOLLAND') {
          const decCents = form.hollandDecrement !== '' ? priceToCents(form.hollandDecrement) : undefined;
          if (decCents == null || decCents < 1) {
            toast.error(t('marketplace.hollandPriceDropMin', { defaultValue: 'Price drop must be at least 0.01' }));
            return;
          }
          if (form.hollandIntervalMinutes === '' || Number(form.hollandIntervalMinutes) < 1) {
            toast.error(t('marketplace.hollandIntervalMin', { defaultValue: 'Interval is required (min 1 minute)' }));
            return;
          }
        }
      }
    }
    setLoading(true);
    try {
      if (isEdit && id) {
        await marketplaceApi.updateMarketItem(id, {
          categoryId: form.categoryId,
          cityId,
          additionalCityIds: form.additionalCityIds,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          mediaUrls: form.mediaUrls,
          tradeTypes: form.tradeTypes,
          negotiationAcceptable: form.tradeTypes.includes('BUY_IT_NOW') ? form.negotiationAcceptable : undefined,
          priceCents: priceCentsVal,
          currency: form.currency,
          auctionEndsAt: form.auctionEndsAt || undefined,
          auctionType: form.tradeTypes.includes('AUCTION') ? form.auctionType : undefined,
          startingPriceCents: form.tradeTypes.includes('AUCTION') ? priceCentsVal : undefined,
          reservePriceCents: reserveCentsVal,
          buyItNowPriceCents: buyItNowCentsVal,
          hollandDecrementCents: form.auctionType === 'HOLLAND' && form.hollandDecrement !== '' ? priceToCents(form.hollandDecrement) : undefined,
          hollandIntervalMinutes: form.auctionType === 'HOLLAND' && form.hollandIntervalMinutes !== '' ? Number(form.hollandIntervalMinutes) : undefined,
        });
        clearDraft();
        toast.success(t('marketplace.updated', { defaultValue: 'Listing updated' }));
        navigate(`/marketplace/${id}`);
      } else {
        const res = await marketplaceApi.createMarketItem({
          categoryId: form.categoryId,
          cityId,
          additionalCityIds: form.additionalCityIds,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          mediaUrls: form.mediaUrls,
          tradeTypes: form.tradeTypes,
          negotiationAcceptable: form.tradeTypes.includes('BUY_IT_NOW') ? form.negotiationAcceptable : undefined,
          priceCents: priceCentsVal,
          currency: form.currency,
          auctionEndsAt: form.auctionEndsAt || undefined,
          auctionType: form.tradeTypes.includes('AUCTION') ? form.auctionType : undefined,
          startingPriceCents: form.tradeTypes.includes('AUCTION') ? priceCentsVal : undefined,
          reservePriceCents: reserveCentsVal,
          buyItNowPriceCents: buyItNowCentsVal,
          hollandDecrementCents: form.auctionType === 'HOLLAND' && form.hollandDecrement !== '' ? priceToCents(form.hollandDecrement) : undefined,
          hollandIntervalMinutes: form.auctionType === 'HOLLAND' && form.hollandIntervalMinutes !== '' ? Number(form.hollandIntervalMinutes) : undefined,
        });
        clearDraft();
        toast.success(t('marketplace.created', { defaultValue: 'Listing created' }));
        navigate(`/marketplace/${res.data.id}`);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  const tradeTypeOptions: Array<{ value: MarketItemTradeType; label: string }> = [
    { value: 'BUY_IT_NOW', label: t('marketplace.sellingTypePrice', { defaultValue: 'Price' }) },
    { value: 'AUCTION', label: t('marketplace.sellingTypeAuction', { defaultValue: 'Auction' }) },
    { value: 'SUGGESTED_PRICE', label: t('marketplace.sellingTypeConsiderOffers', { defaultValue: 'Consider offers' }) },
    { value: 'FREE', label: t('marketplace.sellingTypeFree', { defaultValue: 'Free' }) },
  ];

  const handleTradeTypesChange = (newTypes: MarketItemTradeType[]) => {
    const single = newTypes.length ? [newTypes[0]] : form.tradeTypes;
    if (single[0] === 'FREE') {
      setForm((f) => ({ ...f, tradeTypes: ['FREE'], priceCents: '', negotiationAcceptable: false }));
    } else {
      setForm((f) => ({ ...f, tradeTypes: single, negotiationAcceptable: single[0] === 'BUY_IT_NOW' ? f.negotiationAcceptable : false }));
    }
  };

  return (
    <div className="pb-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="p-3 space-y-3 border-0 shadow-none">
          {(() => {
            const cityId = form.cityId || userCityId;
            const city = user?.currentCity ?? cities.find((c) => c.id === cityId);
            const cityDisplay = city ? translateCity(city.id, city.name, city.country) : '';
            return cityDisplay ? (
              <p className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-primary-500" strokeWidth={2.25} />
                {t('marketplace.itemPlacedIn', { defaultValue: 'Your listing will be placed in {{city}}', city: cityDisplay })}
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

          {(() => {
            const cityId = form.cityId || userCityId;
            const city = user?.currentCity ?? cities.find((c) => c.id === cityId);
            const cityDisplay = city ? translateCity(city.id, city.name, city.country) : '';
            return cityId && cityDisplay ? (
              <CitySelectorField
                primaryCityId={cityId}
                primaryCityName={cityDisplay}
                additionalCityIds={form.additionalCityIds}
                cities={cities}
                onAddCity={(newCityId) => {
                  setForm((f) => ({
                    ...f,
                    additionalCityIds: [...f.additionalCityIds, newCityId],
                  }));
                }}
                onRemoveCity={(removeCityId) => {
                  setForm((f) => ({
                    ...f,
                    additionalCityIds: f.additionalCityIds.filter((id) => id !== removeCityId),
                  }));
                }}
                disabled={loading}
              />
            ) : null;
          })()}

          <hr className="border-gray-200 dark:border-gray-700" />

          <FormField>
            <TradeTypeCheckboxes
              value={form.tradeTypes}
              onChange={handleTradeTypesChange}
              options={tradeTypeOptions}
            />
            {(form.tradeTypes[0] === 'FREE' || form.tradeTypes[0] === 'SUGGESTED_PRICE') && (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {form.tradeTypes[0] === 'FREE'
                  ? t('marketplace.hintFree', { defaultValue: 'Item is given away at no cost. Buyers can take it for free.' })
                  : t('marketplace.hintSuggestedPrice', { defaultValue: 'No fixed price. Buyers will suggest their price and you can accept or negotiate.' })}
              </p>
            )}
          </FormField>

          {!form.tradeTypes.includes('FREE') && (form.tradeTypes.includes('BUY_IT_NOW') || form.tradeTypes.includes('AUCTION')) && (() => {
            const cents = priceToCents(form.priceCents);
            const priceSet = cents != null;
            const priceDisplay = priceSet ? formatPrice(cents, form.currency) : '';
            return (
              <FormField required>
                <label className={PRICING_SECTION_LABEL}>
                  {form.tradeTypes.includes('AUCTION') ? t('marketplace.startingPrice', { defaultValue: 'Starting price' }) : t('marketplace.price', { defaultValue: 'Price' })}
                </label>
                <PriceInputWithCurrency
                  value={form.priceCents}
                  onChange={(v) => setForm((f) => ({ ...f, priceCents: v }))}
                  currency={form.currency}
                  onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                  placeholder="0.00"
                />
                {form.tradeTypes.includes('AUCTION') && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {priceSet
                      ? t('marketplace.hintStartingPrice', { defaultValue: 'Opening bid; first bid must be at least {{price}}.', price: priceDisplay })
                      : t('marketplace.setPriceFirst', { defaultValue: 'Set the price above first.' })}
                  </p>
                )}
                {form.tradeTypes.includes('BUY_IT_NOW') && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {priceSet
                      ? (form.negotiationAcceptable
                        ? t('marketplace.hintPriceWithNegotiation', { defaultValue: 'Your asking price {{price}}. Buyers see it and can make an offer in chat; you can accept or negotiate.', price: priceDisplay })
                        : t('marketplace.hintPrice', { defaultValue: 'Fixed price. Buyers pay {{price}} to buy.', price: priceDisplay }))
                      : t('marketplace.setPriceFirst', { defaultValue: 'Set the price above first.' })}
                  </p>
                )}
              </FormField>
            );
          })()}

          {form.tradeTypes[0] === 'BUY_IT_NOW' && (
            <FormField>
              <div className="flex items-center justify-between gap-3">
                <label className={PRICING_SECTION_LABEL_INLINE}>
                  {t('marketplace.negotiationAcceptable', { defaultValue: 'Negotiation acceptable' })}
                </label>
                <ToggleSwitch checked={form.negotiationAcceptable} onChange={(v) => setForm((f) => ({ ...f, negotiationAcceptable: v }))} />
              </div>
            </FormField>
          )}
          {!form.tradeTypes.includes('FREE') && form.tradeTypes.includes('AUCTION') && (
            <>
              <FormField>
                <label className={PRICING_SECTION_LABEL}>
                  {t('marketplace.auctionType', { defaultValue: 'Auction type' })}
                </label>
                <SegmentedSwitch
                  tabs={[
                    { id: 'RISING', label: t('marketplace.auctionClassical', { defaultValue: 'Classical' }) },
                    { id: 'HOLLAND', label: t('marketplace.auctionHolland', { defaultValue: 'Holland' }) },
                  ]}
                  activeId={form.auctionType}
                  onChange={(id) => setForm((f) => ({ ...f, auctionType: id as AuctionType }))}
                  titleInActiveOnly={false}
                  layoutId="auction-type-create"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {form.auctionType === 'HOLLAND'
                    ? t('marketplace.auctionTypeHintHolland', { defaultValue: 'Price drops at set intervals until someone buys at the current price.' })
                    : t('marketplace.auctionTypeHintRising', { defaultValue: 'Highest bid wins when the auction ends, if it meets the reserve.' })}
                </p>
              </FormField>
              <FormField>
                <label className={PRICING_SECTION_LABEL}>
                  {t('marketplace.reservePriceOptional', { defaultValue: 'Reserve price' })}
                </label>
                <PriceInputWithCurrency
                  value={form.reservePriceCents}
                  onChange={(v) => setForm((f) => ({ ...f, reservePriceCents: v }))}
                  currency={form.currency}
                  onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                  placeholder={t('marketplace.optional', { defaultValue: 'Optional' })}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('marketplace.reservePriceHint', { defaultValue: 'You will not sell below this. Hidden from bidders. Between starting and Buy it now (if set).' })}</p>
              </FormField>
              {form.auctionType === 'HOLLAND' && (
                <>
                  <FormField>
                    <label className={PRICING_SECTION_LABEL}>
                      {t('marketplace.hollandDecrement', { defaultValue: 'Price drop' })} ({form.currency})
                    </label>
                    <Input
                      type="number"
                      step={0.01}
                      min={0.01}
                      value={form.hollandDecrement}
                      onChange={(e) => setForm((f) => ({ ...f, hollandDecrement: e.target.value }))}
                      placeholder="0.50"
                      className={INPUT_CLASS}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('marketplace.hollandDecrementHint', { defaultValue: 'Amount the displayed price decreases each interval. Min 0.01.' })}</p>
                  </FormField>
                  <FormField>
                    <label className={PRICING_SECTION_LABEL}>
                      {t('marketplace.hollandInterval', { defaultValue: 'Interval (minutes)' })}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={form.hollandIntervalMinutes}
                      onChange={(e) => setForm((f) => ({ ...f, hollandIntervalMinutes: e.target.value === '' ? '' : Number(e.target.value) }))}
                      placeholder="5"
                      className={INPUT_CLASS}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('marketplace.hollandIntervalHint', { defaultValue: 'How often the price drops (e.g. every 5 minutes).' })}</p>
                  </FormField>
                </>
              )}
              <FormField>
                <label className={PRICING_SECTION_LABEL}>
                  {t('marketplace.buyItNowPriceOptional', { defaultValue: 'Buy it now price' })}
                </label>
                <PriceInputWithCurrency
                  value={form.buyItNowPriceCents}
                  onChange={(v) => setForm((f) => ({ ...f, buyItNowPriceCents: v }))}
                  currency={form.currency}
                  onCurrencyChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                  placeholder={t('marketplace.optional', { defaultValue: 'Optional' })}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('marketplace.buyItNowPriceHint', { defaultValue: 'If a buyer pays this, the auction ends immediately. Must be ≥ starting price.' })}</p>
              </FormField>
              <FormField required>
                <label className={PRICING_SECTION_LABEL}>
                  {t('marketplace.auctionEndsAt', { defaultValue: 'Auction ends' })}
                </label>
                <AuctionDurationSelector
                  value={form.auctionEndsAt}
                  onChange={(endTime) => setForm((f) => ({ ...f, auctionEndsAt: endTime }))}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('marketplace.auctionEndsHint', { defaultValue: 'Bidding closes at this time. For rising auctions, highest bid wins if it meets the reserve.' })}</p>
              </FormField>
              {(() => {
                const startCents = priceToCents(form.priceCents);
                const hasStart = startCents != null;
                const hasEnd = !!form.auctionEndsAt;
                const hollandComplete =
                  form.auctionType !== 'HOLLAND' ||
                  (form.hollandDecrement !== '' && form.hollandIntervalMinutes !== '');
                const notSet = t('marketplace.summaryNotSet', { defaultValue: 'not set' });
                const startingPrice = hasStart ? formatPrice(startCents!, form.currency) : notSet;
                const reserveCents = priceToCents(form.reservePriceCents);
                const binCents = priceToCents(form.buyItNowPriceCents);
                const reservePrice = reserveCents != null ? formatPrice(reserveCents, form.currency) : '';
                const buyItNowPrice = binCents != null ? formatPrice(binCents, form.currency) : '';
                const endsAt = hasEnd ? new Date(form.auctionEndsAt!).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }) : notSet;
                const parts: string[] = [];
                if (form.auctionType === 'RISING') {
                  parts.push(t('marketplace.auctionSummaryRisingIntro', { defaultValue: 'Start price is {{startingPrice}}. Bids will raise this price.', startingPrice }));
                  if (reserveCents != null) {
                    parts.push(t('marketplace.auctionSummaryReserveClause', { defaultValue: 'If the highest bid does not reach {{reservePrice}}, you will not sell it.', reservePrice }));
                  }
                  if (binCents != null) {
                    parts.push(t('marketplace.auctionSummaryBuyItNowClause', { defaultValue: 'You will sell immediately if someone pays {{buyItNowPrice}}.', buyItNowPrice }));
                  }
                } else {
                  const decrementStr = form.hollandDecrement !== '' ? formatPrice(priceToCents(form.hollandDecrement) ?? 0, form.currency) : notSet;
                  const intervalStr = form.hollandIntervalMinutes !== '' ? `${form.hollandIntervalMinutes} ${t('marketplace.minutesUnit', { defaultValue: 'min' })}` : notSet;
                  parts.push(t('marketplace.auctionSummaryHollandIntro', {
                    defaultValue: 'Price starts at {{startingPrice}} and drops by {{decrement}} every {{interval}} until someone buys at the current price.',
                    startingPrice,
                    decrement: decrementStr,
                    interval: intervalStr,
                  }));
                  if (binCents != null) {
                    parts.push(t('marketplace.auctionSummaryBuyItNowClause', { defaultValue: 'You will sell immediately if someone pays {{buyItNowPrice}}.', buyItNowPrice }));
                  }
                }
                parts.push(t('marketplace.auctionSummaryEndsClause', { defaultValue: 'Auction ends at {{endsAt}}.', endsAt }));
                if (!hasStart || !hasEnd || !hollandComplete) {
                  const missing: string[] = [];
                  if (!hasStart) missing.push(t('marketplace.requiredStartingPrice', { defaultValue: 'starting price' }));
                  if (!hasEnd) missing.push(t('marketplace.requiredEndDate', { defaultValue: 'end date' }));
                  if (form.auctionType === 'HOLLAND' && form.hollandDecrement === '') {
                    missing.push(t('marketplace.requiredPriceDrop', { defaultValue: 'price drop' }));
                  }
                  if (form.auctionType === 'HOLLAND' && form.hollandIntervalMinutes === '') {
                    missing.push(t('marketplace.requiredInterval', { defaultValue: 'interval' }));
                  }
                  const fields =
                    missing.length === 1
                      ? missing[0]
                      : missing.slice(0, -1).join(', ') + ' ' + t('marketplace.requiredListAnd', { defaultValue: 'and' }) + ' ' + missing[missing.length - 1];
                  parts.push(t('marketplace.setAuctionValuesFirst', { defaultValue: 'Set {{fields}} above first.', fields }));
                }
                return (
                  <p className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
                    {parts.join(' ')}
                  </p>
                );
              })()}
            </>
          )}
        </Card>

        <div className="flex justify-center">
          <Button type="submit" variant="primary" className="w-full max-w-[200px] shadow-[0_0_20px_rgba(14,165,233,0.4)]" size="md" disabled={loading}>
            {loading ? t('common.loading', { defaultValue: 'Loading...' }) : (isEdit ? t('marketplace.save', { defaultValue: 'Save' }) : t('marketplace.create', { defaultValue: 'Create' }))}
          </Button>
        </div>
      </form>
    </div>
  );
};
