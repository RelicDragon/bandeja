import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import {
  Button,
  CityModal,
  ClubModal,
  Input,
  RangeSlider,
} from '@/components';
import { CreateFlowSportSelector } from '@/components/createGame/CreateFlowSportSelector';
import { PriceSection } from '@/components/createGame/PriceSection';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
} from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { clubsApi, gamesApi, mediaApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { listCreateFlowSports } from '@/utils/profileSports';
import { parseGameSport } from '@/utils/gameSport';
import { resolveUserCurrency } from '@/utils/currency';
import { pickImages } from '@/utils/photoCapture';
import { EVENT_MAX_HEROES } from '@shared/entityCapabilities';
import { eventKindI18nKey } from '@/utils/eventDetails/eventListingFormat';
import { sortEventHeroes } from '@/utils/eventDetails/eventHeroSlides';
import type { Club, EventKind, Game, PriceCurrency, PriceType, Sport } from '@/types';
import { EventEditHeroesField } from './EventEditHeroesField';
import {
  datetimeLocalToIso,
  EVENT_KIND_OPTIONS,
  toDatetimeLocalValue,
  type EventHeroDraft,
} from './eventEditTypes';
import { GameTextAuthoredFieldsHint } from '@/components/gameText/GameTextAuthoredFieldsHint';
import { GameTextTranslationsOpenButton } from '@/components/gameText/GameTextTranslationsOpenButton';
import { GameTextTranslationsPanel } from '@/components/gameText/GameTextTranslationsPanel';
import { ExpandableTextarea } from '@/components/ui/ExpandableTextarea';
import {
  authoredGameTextForEdit,
  shouldLabelAuthoredEditAsOriginal,
} from '@/utils/gameText/authoredGameTextForEdit';

type EventEditListingModalProps = {
  isOpen: boolean;
  game: Game;
  onClose: () => void;
  onSaved: (game: Game) => void;
};

export function EventEditListingModal({ isOpen, game, onClose, onSaved }: EventEditListingModalProps) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const sports = useMemo(() => listCreateFlowSports(user), [user]);
  const initialAuthored = authoredGameTextForEdit(game);
  const [kind, setKind] = useState<EventKind>(game.eventKind ?? 'CAMP');
  const [sport, setSport] = useState<Sport>(parseGameSport(game.sport));
  const [levelRange, setLevelRange] = useState<[number, number]>([
    game.minLevel ?? 1,
    game.maxLevel ?? 7,
  ]);
  const [name, setName] = useState(initialAuthored.name);
  const [description, setDescription] = useState(initialAuthored.description);
  const [cityId, setCityId] = useState(game.city?.id ?? '');
  const [cityName, setCityName] = useState(game.city?.name ?? '');
  const [clubId, setClubId] = useState(game.clubId ?? '');
  const [venueText, setVenueText] = useState(game.venueText ?? '');
  const [startLocal, setStartLocal] = useState(toDatetimeLocalValue(game.startTime));
  const [endLocal, setEndLocal] = useState(toDatetimeLocalValue(game.endTime));
  const [priceTotal, setPriceTotal] = useState<number | undefined>(game.priceTotal ?? undefined);
  const [priceType, setPriceType] = useState<PriceType>(game.priceType ?? 'NOT_KNOWN');
  const [priceCurrency, setPriceCurrency] = useState<PriceCurrency | undefined>(
    game.priceCurrency ?? resolveUserCurrency(user?.defaultCurrency),
  );
  const [externalUrl, setExternalUrl] = useState(game.externalUrl ?? '');
  const [heroes, setHeroes] = useState<EventHeroDraft[]>(
    sortEventHeroes(game.eventHeroes).map((h) => ({
      originalUrl: h.originalUrl,
      thumbnailUrl: h.thumbnailUrl,
    })),
  );
  const [clubs, setClubs] = useState<Club[]>([]);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [clubModalOpen, setClubModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [translationsOpen, setTranslationsOpen] = useState(false);

  useBackButtonModal(isOpen, onClose, 'event-edit-listing');

  useEffect(() => {
    if (!isOpen) return;
    const authored = authoredGameTextForEdit(game);
    setKind(game.eventKind ?? 'CAMP');
    setSport(parseGameSport(game.sport));
    setLevelRange([game.minLevel ?? 1, game.maxLevel ?? 7]);
    setName(authored.name);
    setDescription(authored.description);
    setCityId(game.city?.id ?? '');
    setCityName(game.city?.name ?? '');
    setClubId(game.clubId ?? '');
    setVenueText(game.venueText ?? '');
    setStartLocal(toDatetimeLocalValue(game.startTime));
    setEndLocal(toDatetimeLocalValue(game.endTime));
    setPriceTotal(game.priceTotal ?? undefined);
    setPriceType(game.priceType ?? 'NOT_KNOWN');
    setPriceCurrency(game.priceCurrency ?? resolveUserCurrency(user?.defaultCurrency));
    setExternalUrl(game.externalUrl ?? '');
    setHeroes(
      sortEventHeroes(game.eventHeroes).map((h) => ({
        originalUrl: h.originalUrl,
        thumbnailUrl: h.thumbnailUrl,
      })),
    );
  }, [isOpen, game, user?.defaultCurrency]);

  const showOriginalLabel = shouldLabelAuthoredEditAsOriginal(game, i18n.language);

  useEffect(() => {
    if (!isOpen || !cityId) return;
    void clubsApi.getByCityId(cityId, 'EVENT').then((res) => setClubs(res.data)).catch(() => setClubs([]));
  }, [isOpen, cityId]);

  const selectedClub = clubs.find((c) => c.id === clubId) ?? (clubId === game.clubId ? game.club : undefined);

  const addHeroes = async () => {
    const remaining = EVENT_MAX_HEROES - heroes.length;
    if (remaining <= 0) return;
    const picked = await pickImages(remaining);
    if (!picked?.files.length) return;
    setUploading(true);
    try {
      const uploaded: EventHeroDraft[] = [];
      for (const file of picked.files) {
        const data = await mediaApi.uploadEventHero(file);
        uploaded.push({ originalUrl: data.originalUrl, thumbnailUrl: data.thumbnailUrl });
      }
      setHeroes((prev) => [...prev, ...uploaded].slice(0, EVENT_MAX_HEROES));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error(t('createEvent.nameRequired'));
      return;
    }
    if (heroes.length < 1) {
      toast.error(t('createEvent.heroesHint'));
      return;
    }
    if (!cityId) {
      toast.error(t('createEvent.selectCity'));
      return;
    }
    const startIso = datetimeLocalToIso(startLocal);
    const endIso = datetimeLocalToIso(endLocal);
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      toast.error(t('createEvent.datesInvalid'));
      return;
    }
    const url = externalUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      toast.error(t('createEvent.urlInvalid'));
      return;
    }
    const priced = priceType !== 'NOT_KNOWN' && priceType !== 'FREE';
    setSaving(true);
    try {
      await gamesApi.update(game.id, {
        eventKind: kind,
        sport,
        minLevel: levelRange[0],
        maxLevel: levelRange[1],
        name: trimmedName,
        description: description.trim() || null,
        cityId,
        clubId: clubId || null,
        venueText: clubId ? null : venueText.trim() || null,
        startTime: startIso,
        endTime: endIso,
        priceTotal: priced ? priceTotal : null,
        priceType,
        priceCurrency: priced ? priceCurrency : null,
        externalUrl: url || null,
      } as Partial<Game>);
      const heroesRes = await gamesApi.putEventHeroes(game.id, heroes);
      toast.success(t('eventDetails.saved'));
      onSaved(heroesRes.data);
      onClose();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent
        className="!max-h-[94dvh] max-w-[428px]"
        accessibleTitle={t('eventDetails.editListing')}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-lg font-semibold">{t('eventDetails.editListing')}</h2>
          <DrawerCloseButton />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('createEvent.kindLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_KIND_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    kind === option
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {t(eventKindI18nKey(option))}
                </button>
              ))}
            </div>
          </div>
          {sports.length > 1 && (
            <CreateFlowSportSelector sports={sports} value={sport} onChange={setSport} />
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('createEvent.playerLevel')}</p>
            <RangeSlider min={1} max={7} step={0.1} value={levelRange} onChange={setLevelRange} />
          </div>
          <Input label={t('createEvent.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GameTextAuthoredFieldsHint showOriginalLabel={showOriginalLabel} />
            <GameTextTranslationsOpenButton onClick={() => setTranslationsOpen(true)} />
          </div>
          <EventEditHeroesField
            heroes={heroes}
            uploading={uploading}
            onAdd={() => void addHeroes()}
            onRemove={(index) => setHeroes((prev) => prev.filter((_, i) => i !== index))}
          />
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('createEvent.description')}
            <ExpandableTextarea
              wrapperClassName="mt-1.5"
              className="w-full rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-200"
              rows={4}
              value={description}
              onValueChange={setDescription}
              fullscreenTitle={t('createEvent.description')}
              placeholder={t('createEvent.descriptionPlaceholder')}
              dir="auto"
            />
          </label>
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{t('createEvent.selectCity')}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCityModalOpen(true)}>
              {cityName || t('createEvent.selectCity')}
            </Button>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{t('createEvent.venue')}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => setClubModalOpen(true)}>
              {selectedClub?.name || t('createEvent.selectClub')}
            </Button>
            {clubId && (
              <button
                type="button"
                className="ml-2 text-xs text-violet-600 underline"
                onClick={() => setClubId('')}
              >
                {t('createEvent.clearClub')}
              </button>
            )}
            {!clubId && (
              <div className="mt-2">
                <Input
                  label={t('createEvent.venueText')}
                  value={venueText}
                  onChange={(e) => setVenueText(e.target.value)}
                  placeholder={t('createEvent.venueText')}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('createEvent.start')}
              <input
                type="datetime-local"
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800/40"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('createEvent.end')}
              <input
                type="datetime-local"
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800/40"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />
            </label>
          </div>
          <div>
            <PriceSection
              embedded
              priceTotal={priceTotal}
              priceType={priceType}
              priceCurrency={priceCurrency}
              defaultCurrency={user?.defaultCurrency as PriceCurrency | undefined}
              onPriceTotalChange={setPriceTotal}
              onPriceTypeChange={setPriceType}
              onPriceCurrencyChange={setPriceCurrency}
            />
          </div>
          <Input
            label={t('createEvent.registerUrl')}
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <Button type="button" className="w-full" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" size={18} /> : t('createEvent.save')}
          </Button>
        </div>
        <CityModal
          isOpen={cityModalOpen}
          onClose={() => setCityModalOpen(false)}
          selectedId={cityId}
          onSelect={(id, city) => {
            setCityId(id);
            setCityName(city?.name ?? '');
            setClubId('');
            setCityModalOpen(false);
          }}
        />
        <ClubModal
          isOpen={clubModalOpen}
          onClose={() => setClubModalOpen(false)}
          clubs={clubs}
          selectedId={clubId}
          onSelect={(id) => {
            setClubId(id);
            setVenueText('');
            setClubModalOpen(false);
          }}
          cityId={cityId}
          entityType="EVENT"
          preferredSport={sport}
        />
        <GameTextTranslationsPanel
          gameId={game.id}
          isOpen={translationsOpen}
          onClose={() => setTranslationsOpen(false)}
        />
      </DrawerContent>
    </Drawer>
  );
}
