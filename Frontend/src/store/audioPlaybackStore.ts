import { create } from 'zustand';
import { getStoredAudioPlaybackRate, persistAudioPlaybackRate } from '@/utils/audioPlaybackRateStorage';

let audioEl: HTMLAudioElement | null = null;
let listenersAttached = false;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

function ensureListeners() {
  if (listenersAttached) return;
  const a = getAudio();
  a.addEventListener('timeupdate', () => {
    useAudioPlaybackStore.setState({
      currentTime: a.currentTime,
      duration: Number.isFinite(a.duration) ? a.duration : 0,
    });
  });
  a.addEventListener('ended', () => {
    a.currentTime = 0;
    useAudioPlaybackStore.setState({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      activeMessageId: null,
      activeUrl: null,
    });
  });
  a.addEventListener('loadedmetadata', () => {
    useAudioPlaybackStore.setState({ duration: Number.isFinite(a.duration) ? a.duration : 0 });
  });
  a.addEventListener('seeked', () => {
    useAudioPlaybackStore.setState({
      currentTime: a.currentTime,
      duration: Number.isFinite(a.duration) ? a.duration : 0,
    });
  });
  listenersAttached = true;
}

type AudioPlaybackState = {
  activeMessageId: string | null;
  activeUrl: string | null;
  isPlaying: boolean;
  playbackRate: number;
  currentTime: number;
  duration: number;
  play: (messageId: string, url: string) => void;
  pause: () => void;
  toggle: (messageId: string, url: string) => void;
  cycleRate: () => void;
  seekBy: (messageId: string, deltaSeconds: number, maxDurationSec?: number) => void;
};

export const useAudioPlaybackStore = create<AudioPlaybackState>((set, get) => ({
  activeMessageId: null,
  activeUrl: null,
  isPlaying: false,
  playbackRate: 1,
  currentTime: 0,
  duration: 0,
  play: (messageId, url) => {
    ensureListeners();
    const a = getAudio();
    const st = get();
    if (st.activeMessageId !== messageId || st.activeUrl !== url) {
      a.src = url;
      set({ activeMessageId: messageId, activeUrl: url });
    }
    a.playbackRate = st.playbackRate;
    a.play()
      .then(() => set({ isPlaying: true }))
      .catch(() => set({ isPlaying: false }));
  },
  pause: () => {
    getAudio().pause();
    set({ isPlaying: false });
  },
  toggle: (messageId, url) => {
    const st = get();
    if (st.activeMessageId === messageId && st.isPlaying) {
      get().pause();
    } else {
      get().play(messageId, url);
    }
  },
  cycleRate: () => {
    const order = [1, 1.5, 2] as const;
    const cur = get().playbackRate;
    const idx = order.findIndex((x) => Math.abs(x - cur) < 0.01);
    const next = order[(idx < 0 ? 0 : idx + 1) % order.length];
    getAudio().playbackRate = next;
    set({ playbackRate: next });
    persistAudioPlaybackRate(next);
  },
  seekBy: (messageId, deltaSeconds, maxDurationSec) => {
    ensureListeners();
    const st = get();
    if (st.activeMessageId !== messageId) return;
    const a = getAudio();
    let cap = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
    if (cap <= 0 && maxDurationSec != null && maxDurationSec > 0) cap = maxDurationSec;
    let next = a.currentTime + deltaSeconds;
    if (cap > 0) next = Math.max(0, Math.min(cap, next));
    else next = Math.max(0, next);
    a.currentTime = next;
    set({ currentTime: next });
  },
}));

void getStoredAudioPlaybackRate().then((rate) => {
  useAudioPlaybackStore.setState({ playbackRate: rate });
  getAudio().playbackRate = rate;
});
