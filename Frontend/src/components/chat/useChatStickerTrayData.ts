import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Sport } from '@shared/sport';
import {
  getMyStickerPrefs,
  putMyStickerPrefs,
  type ChatMediaRecent,
  type StickerDto,
  type StickerPackListItem,
  type UserStickerPrefs,
} from '@/api/stickers';
import {
  clearStickerCatalogCaches,
  fetchAndCachePackStickers,
  getCachedPackStickers,
  hydrateStickersByIds,
  listStickerPacksCached,
  putCachedStickers,
} from '@/services/stickers/stickerCatalogCache';
import {
  BANDEJA_PERSONAL_STICKER_SAVED,
  type PersonalStickerSavedDetail,
} from '@/services/stickers/personalStickerEvents';
import {
  readCachedStickerPrefs,
  writeCachedStickerPrefs,
} from '@/services/stickers/stickerPrefsCache';
import {
  MAX_STICKER_RECENT,
  bumpChatMediaRecent,
  mergeServerStickerPrefs,
  toggleStickerFavoriteIds,
} from '@/utils/stickerPrefsOrder';
import { filterStickersByQuery, sortPacksForSport } from '@/utils/stickerTrayPacks';
import { useAuthStore } from '@/store/authStore';

export type StickerTrayTab = 'recent' | 'favorites' | 'packs' | 'gifs';

const EMPTY_PREFS: UserStickerPrefs = { favorites: [], recentMedia: [] };

export function useChatStickerTrayData(
  open: boolean,
  sport?: Sport | null,
  initialTab: StickerTrayTab = 'recent'
) {
  const userId = useAuthStore((s) => s.user?.id);
  const [tab, setTab] = useState<StickerTrayTab>(initialTab);
  const [catalogPacks, setCatalogPacks] = useState<StickerPackListItem[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [packStickers, setPackStickers] = useState<StickerDto[]>([]);
  const [catalogStickers, setCatalogStickers] = useState<StickerDto[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [prefs, setPrefs] = useState<UserStickerPrefs>(EMPTY_PREFS);
  const [recentStickers, setRecentStickers] = useState<StickerDto[]>([]);
  const [favoriteStickers, setFavoriteStickers] = useState<StickerDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState(false);
  const [packReloadKey, setPackReloadKey] = useState(0);
  const [searchIndexing, setSearchIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const hydrateGenRef = useRef(0);
  const favChainRef = useRef(Promise.resolve());
  const searchIndexGenRef = useRef(0);
  const loadGenRef = useRef(0);
  const searchIndexedRef = useRef(false);
  const selectedPackIdRef = useRef<string | null>(null);
  selectedPackIdRef.current = selectedPackId;
  const prevFirstPackIdRef = useRef<string | null>(null);

  const packs = useMemo(
    () => sortPacksForSport(catalogPacks, sport),
    [catalogPacks, sport]
  );

  const favoriteIds = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);

  const searchResults = useMemo(() => {
    if (tab === 'favorites') return filterStickersByQuery(favoriteStickers, searchQuery);
    return filterStickersByQuery(catalogStickers, searchQuery);
  }, [tab, favoriteStickers, catalogStickers, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  const applyPrefs = useCallback(
    (next: UserStickerPrefs) => {
      prefsRef.current = next;
      setPrefs(next);
      if (userId) writeCachedStickerPrefs(userId, next);
    },
    [userId]
  );

  const loadPrefsStickers = useCallback(async (next: UserStickerPrefs) => {
    const gen = ++hydrateGenRef.current;
    const [recent, favorites] = await Promise.all([
      hydrateStickersByIds(
        next.recentMedia.flatMap((item) => (item.kind === 'STICKER' ? [item.stickerId] : []))
      ),
      hydrateStickersByIds(next.favorites),
    ]);
    if (gen !== hydrateGenRef.current) return;
    setRecentStickers(recent);
    setFavoriteStickers(favorites);
  }, []);

  const readLocalRecent = useCallback((): ChatMediaRecent[] => {
    if (userId) {
      const cached = readCachedStickerPrefs(userId);
      if (cached) return cached.recentMedia;
    }
    return prefsRef.current.recentMedia;
  }, [userId]);

  useLayoutEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSearchQuery('');
    const cached = userId ? readCachedStickerPrefs(userId) : null;
    if (cached) {
      applyPrefs(cached);
      void loadPrefsStickers(cached);
      setLoading(false);
      setPrefsReady(true);
    } else {
      setLoading(true);
      setPrefsReady(false);
    }
  }, [open, initialTab, userId, applyPrefs, loadPrefsStickers]);

  // Open / user change: fetch catalog once. Sport only re-sorts via `packs` memo.
  useEffect(() => {
    if (!open) {
      prevFirstPackIdRef.current = null;
      return;
    }
    const gen = ++loadGenRef.current;
    setError(null);
    setCatalogStickers([]);
    searchIndexedRef.current = false;
    searchIndexGenRef.current += 1;

    void (async () => {
      try {
        const cached = userId ? readCachedStickerPrefs(userId) : null;
        if (cached) {
          applyPrefs(cached);
          void loadPrefsStickers(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }

        // Fresh catalog each open — avoids stale mock URLs after seed/regenerate.
        clearStickerCatalogCaches();
        const [packList, nextPrefs] = await Promise.all([
          listStickerPacksCached({ force: true }).catch(() => null),
          getMyStickerPrefs().catch(() => cached ?? EMPTY_PREFS),
        ]);
        if (gen !== loadGenRef.current) return;

        if (packList) setCatalogPacks(packList);
        else setError('catalog_load_failed');
        const merged = mergeServerStickerPrefs(nextPrefs, readLocalRecent());
        applyPrefs(merged);
        setLoading(false);
        setPrefsReady(true);
        void loadPrefsStickers(merged);
      } catch {
        if (gen === loadGenRef.current) {
          setError('load_failed');
          setLoading(false);
          setPrefsReady(true);
        }
      }
    })();

    return () => {
      loadGenRef.current += 1;
    };
  }, [open, userId, initialTab, applyPrefs, loadPrefsStickers, readLocalRecent]);

  // Live-refresh catalog when a personal sticker is saved (menu) while tray is open.
  useEffect(() => {
    if (!open) return;
    const onSaved = (ev: Event) => {
      const detail = (ev as CustomEvent<PersonalStickerSavedDetail>).detail;
      if (!detail?.packId) return;
      const gen = ++loadGenRef.current;
      void (async () => {
        try {
          const [packList, stickers] = await Promise.all([
            listStickerPacksCached({ force: true }),
            fetchAndCachePackStickers(detail.packId, { force: true }),
          ]);
          if (gen !== loadGenRef.current) return;
          setCatalogPacks(packList);
          searchIndexedRef.current = false;
          setCatalogStickers([]);
          setPackStickers(stickers);
          setSelectedPackId(detail.packId);
          setTab('packs');
          const prefsNow = prefsRef.current;
          const nextRecent = bumpChatMediaRecent(prefsNow.recentMedia, {
            kind: 'STICKER',
            stickerId: detail.stickerId,
          });
          const nextPrefs = { ...prefsNow, recentMedia: nextRecent };
          applyPrefs(nextPrefs);
          void loadPrefsStickers(nextPrefs);
        } catch {
          /* tray stays on last good catalog */
        }
      })();
    };
    window.addEventListener(BANDEJA_PERSONAL_STICKER_SAVED, onSaved);
    return () => window.removeEventListener(BANDEJA_PERSONAL_STICKER_SAVED, onSaved);
  }, [open, applyPrefs, loadPrefsStickers]);

  // Default to first pack after sport sort; follow reorder if still on previous default head.
  useEffect(() => {
    if (!open || packs.length === 0) return;
    const first = packs[0]?.id ?? null;
    const current = selectedPackIdRef.current;
    const prevFirst = prevFirstPackIdRef.current;
    prevFirstPackIdRef.current = first;

    const missing = !current || !packs.some((p) => p.id === current);
    const stillOnPreviousDefault = current != null && current === prevFirst;
    if (missing || stillOnPreviousDefault || prevFirst == null) {
      if (current !== first) setSelectedPackId(first);
    }
  }, [open, packs]);

  // Search index once per open session (even if result set is empty).
  useEffect(() => {
    if (!open || tab !== 'packs' || !isSearching || catalogPacks.length === 0) return;
    if (searchIndexedRef.current) return;
    let cancelled = false;
    const gen = ++searchIndexGenRef.current;
    setSearchIndexing(true);
    void (async () => {
      try {
        const packDetails = await Promise.all(
          catalogPacks.map((p) =>
            fetchAndCachePackStickers(p.id).catch(() => [] as StickerDto[])
          )
        );
        if (cancelled || gen !== searchIndexGenRef.current) return;
        const indexed = packDetails.flat();
        putCachedStickers(indexed);
        searchIndexedRef.current = true;
        setCatalogStickers(indexed);
      } finally {
        if (!cancelled && gen === searchIndexGenRef.current) {
          setSearchIndexing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      setSearchIndexing(false);
    };
  }, [open, tab, isSearching, catalogPacks]);

  useEffect(() => {
    if (!open || !selectedPackId || tab !== 'packs') return;
    const cached = getCachedPackStickers(selectedPackId);
    if (cached) {
      setPackStickers(cached);
      setPackLoading(false);
      setPackError(false);
      return;
    }
    let cancelled = false;
    setPackStickers([]);
    setPackLoading(true);
    setPackError(false);
    void (async () => {
      try {
        const stickers = await fetchAndCachePackStickers(selectedPackId);
        if (cancelled) return;
        setPackStickers(stickers);
      } catch {
        if (!cancelled) setPackError(true);
      } finally {
        if (!cancelled) setPackLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedPackId, tab, packReloadKey]);

  const toggleFavorite = useCallback(
    (sticker: StickerDto) => {
      favChainRef.current = favChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const prevPrefs = prefsRef.current;
          const { favorites, isFavorite } = toggleStickerFavoriteIds(
            prevPrefs.favorites,
            sticker.id
          );
          const optimistic: UserStickerPrefs = { ...prevPrefs, favorites };
          applyPrefs(optimistic);
          setFavoriteStickers((prev) => {
            if (!isFavorite) return prev.filter((s) => s.id !== sticker.id);
            return [sticker, ...prev.filter((s) => s.id !== sticker.id)];
          });
          try {
            const saved = await putMyStickerPrefs({ favorites });
            const merged = mergeServerStickerPrefs(saved, readLocalRecent());
            applyPrefs(merged);
            await loadPrefsStickers(merged);
          } catch {
            applyPrefs(prevPrefs);
            await loadPrefsStickers(prevPrefs);
          }
        });
    },
    [applyPrefs, loadPrefsStickers, readLocalRecent]
  );

  const bumpRecentLocal = useCallback(
    (sticker: StickerDto) => {
      setRecentStickers((prev) =>
        [sticker, ...prev.filter((s) => s.id !== sticker.id)].slice(0, MAX_STICKER_RECENT)
      );
      const prev = prefsRef.current;
      const next: UserStickerPrefs = {
        ...prev,
        recentMedia: bumpChatMediaRecent(prev.recentMedia, {
          kind: 'STICKER',
          stickerId: sticker.id,
        }),
      };
      applyPrefs(next);
    },
    [applyPrefs]
  );

  return {
    tab,
    setTab,
    packs,
    selectedPackId,
    setSelectedPackId,
    packStickers,
    recentStickers,
    recentMedia: prefs.recentMedia,
    favoriteStickers,
    favoriteIds,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchIndexing,
    loading,
    prefsReady,
    packLoading,
    packError,
    retryPack: () => setPackReloadKey((value) => value + 1),
    error,
    toggleFavorite,
    bumpRecentLocal,
  };
}
