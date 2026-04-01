# Audio Messages — Implementation Plan (Telegram-Style)

Reference for implementing voice/audio messages in GameChat and shared chat UI. Aligns with existing `GameChat` → `MessageInput` → `MessageBubble` flow.

---

## Current State

- Messages support text, images (`mediaUrls` / `uploadChatImage`), polls.
- `ChatMessage` has `mediaUrls` / `thumbnailUrls` but no explicit message kind for audio.
- Backend `media.controller` multer accepts images + documents only (no audio MIME types yet).
- Prisma `ChatMessage` has no `messageType` or waveform fields.

---

## Schema & API

### Prisma (`ChatMessage`)

Add enum and fields:

```prisma
enum MessageType {
  TEXT
  IMAGE
  VOICE
  POLL
}

model ChatMessage {
  // ...
  messageType     MessageType @default(TEXT)
  audioDurationMs Int?
  waveformData    Float[]     // ~50–80 normalized peaks 0.0–1.0
}
```

Store waveform peaks so every client renders the same bars without decoding audio.

### Frontend types (`Frontend/src/api/chat.ts`)

- `MessageType` union / enum.
- Extend `ChatMessage`: optional `messageType`, `audioDurationMs`, `waveformData`.
- Extend `CreateMessageRequest` / optimistic payload: `messageType`, `audioDurationMs`, `waveformData`; audio URL can live in `mediaUrls[0]` or dedicated `audioUrl` — pick one convention and use it consistently.

### Backend

- **POST** `/media/upload/chat/audio` — multipart `audio`, context id (same pattern as chat image: `gameId` / `bugId` / `userChatId` / `groupChannelId`).
- Allow MIME: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/wav`, `audio/mpeg`; size limit e.g. 15MB.
- Upload to S3; return `{ audioUrl: string }`.
- `message.service`: when `messageType === VOICE`, validate URL + duration + waveform; set `contentSearchable` / last-message preview e.g. `🎤 Voice message (0:12)`.

---

## Frontend — Suggested File Layout

```
Frontend/src/components/audio/
  VoiceRecordButton.tsx
  VoiceRecordingOverlay.tsx
  AudioWaveform.tsx
  AudioMessageBubble.tsx
  AudioPlaybackBar.tsx          // optional split from bubble
  useAudioRecorder.ts
  useAudioPlayback.ts
  audioWaveformUtils.ts
```

Optional: `store/audioPlaybackStore.ts` for global single-player behavior.

---

## Recording UX

### v1 (recommended first ship)

- When composer text is empty and no images: show **mic** instead of **send** (same slot; animate with Framer Motion).
- Tap mic → start recording; overlay replaces input area.
- Overlay: red recording dot, timer `MM:SS`, **live** waveform from `AnalyserNode`, cancel (✕), stop/send (✓).
- On send: stop `MediaRecorder`, extract peaks (see below), upload blob, then `createMessage` with optimistic UI.

### v2 (Telegram-like gestures)

- Press-and-hold to record; release to send.
- Slide left to cancel; slide up to lock hands-free.
- Requires more gesture handling on web + Capacitor.

---

## Waveform

### Live (while recording)

- `getUserMedia` → `AudioContext` → `AnalyserNode` → draw ~40–60 bars in canvas, scroll or refresh.

### Peaks for persistence (before upload)

- Decode blob with `AudioContext.decodeAudioData` or `OfflineAudioContext`.
- Split channel data into ~60 segments; RMS per segment; normalize to 0–1.
- Send `waveformData: number[]` with the message.

### Playback

- Canvas bars from stored `waveformData`.
- Left = played (full opacity), right = unplayed (lower opacity).
- Tap/drag on waveform to seek (optional v2).
- Prefer **custom canvas** (~50 lines) over heavy libs; Wavesurfer is overkill for chat bubbles.

---

## Playback UX (Telegram-like)

- Row: **play/pause** | **waveform** | **duration** (and elapsed while playing).
- Optional speed pill: **1× / 1.5× / 2×** (cycle on tap).
- **Single global player**: starting another message stops the previous (`HTMLAudioElement` + Zustand or small store).
- Own bubble: white waveform on blue gradient; other: blue bars on neutral bubble (match `MessageBubble` variants).

---

## Integration Points

| Area | Change |
|------|--------|
| `MessageInput.tsx` | Mic/send toggle, recording overlay, call upload + optimistic send |
| `MessageBubble.tsx` | If `messageType === 'VOICE'`, render `AudioMessageBubble` |
| `MessageItem` | Hide edit for voice; keep reply, delete, react, pin as applicable |
| `chatSendService` / queue | Include voice fields; upload audio before or inside same flow as images |
| Chat list / previews | Show `🎤` + duration or “Voice message” |

---

## Capacitor / permissions

- **iOS**: `NSMicrophoneUsageDescription` in `Info.plist`.
- **Android**: `RECORD_AUDIO` in manifest.
- `getUserMedia` works in WebView; add native plugins only if needed later.

---

## Implementation Phases

**Phase 1 — MVP**

1. Migration + API types + create/upload audio + create message with voice metadata.
2. `useAudioRecorder`, `audioWaveformUtils`, `AudioWaveform`, `AudioMessageBubble`.
3. `VoiceRecordButton` + overlay in `MessageInput`.
4. Global playback store + wiring in bubble.
5. List preview strings for voice.

**Phase 2 — Polish**

- Speed control, scrubbing, press-hold + slide cancel/lock, optional ffmpeg transcoding on server.

**Phase 3 — Advanced**

- Background play, raise-to-ear, transcription.

---

## Dependencies

- **No new frontend package required** for v1 if using canvas + Web Audio API.
- Optional server: `fluent-ffmpeg` for Opus transcode (later).

---

## Notes

- Align last-message and search preview with existing `LastMessagePreview` / `contentSearchable` patterns.
- Socket: reuse existing new-message payloads; clients branch on `messageType`.

---

## Migration & backfill

- Default new field `messageType` to `TEXT` for existing rows.
- Optional one-off backfill script: `IMAGE` if `mediaUrls.length > 0` and no `pollId`; `POLL` if `pollId` set; else `TEXT`. New voice rows always set `VOICE` explicitly.
- Older clients that do not know `messageType` can infer: poll presence → poll; single audio URL + duration → treat as voice once shipped.

---

## Backend files to touch (checklist)

- `Backend/prisma/schema.prisma` — enum + fields; run `prisma migrate`.
- `Backend/src/routes/media.routes.ts` — `POST /upload/chat/audio`.
- `Backend/src/controllers/media.controller.ts` — multer `audio` field, MIME allowlist, handler (mirror `uploadChatImage` auth/context checks).
- `Backend/src/services/s3.service.ts` or existing upload helper — key prefix for chat audio.
- `Backend/src/services/chat/message.service.ts` (and create-message validation) — accept `messageType`, `audioDurationMs`, `waveformData`; validate voice payloads.
- Push / Telegram preview copy if notifications include last-message body — voice-specific string.

---

## Limits & validation

- **Max duration** (e.g. 10–15 minutes) — reject or trim on client + enforce on server from `audioDurationMs` / file size.
- **Min duration** (e.g. &lt; 0.5–1 s) — discard as noise, show toast.
- **Max waveform bars** — cap array length (e.g. 80) and payload size in API validation.

---

## Edge cases & product rules

- **Editing**: voice messages are not editable (hide edit in context menu; same as images-only in practice).
- **Reply**: allow reply-to on voice; reply preview row should show “Voice message” / icon, not raw URL.
- **Translate-to / draft translate**: do not apply to voice body; composer may still be hidden or disabled while recording.
- **Composer while recording**: block text send or clear recording first — single active mode.
- **Optimistic UI**: include placeholder `waveformData` (e.g. flat bars) and `_status` until upload + `createMessage` completes; failed send uses same queue/resend pattern as images.
- **Chat types** (e.g. `PHOTOS`): decide if voice is allowed; if not, hide mic in that tab.

---

## Frontend types to extend

- `OptimisticMessagePayload` (`Frontend/src/api/chat.ts`) — `messageType`, `audioDurationMs`, `waveformData` (and ensure `useGameChatOptimistic` passes them through).
- `QueuedMessage` / `messageQueueStorage` if persisted queue must store voice metadata for retry.

---

## Platform & UX failure modes

- **Mic permission denied** — toast + link to OS settings on native.
- **Insecure context** — `getUserMedia` may fail without HTTPS; detect and message.
- **iOS silent switch / audio session** — playback may still respect system volume; document for QA.
- **Cleanup** — `MediaStream.getTracks().forEach(stop)` on cancel/unmount; revoke blob URLs.

---

## Accessibility & i18n

- Play/pause: `aria-pressed`, `aria-label` with duration; avoid relying on color alone for recording state.
- Optional `aria-live="polite"` for “Recording…” / timer updates (sparingly to avoid noise).
- Strings: `chat.voiceMessage`, `chat.recording`, `chat.micPermissionDenied`, `chat.voiceTooShort`, etc. in `Frontend/src/i18n/locales/*.json`.

---

## CDN / playback

- Ensure audio URLs work with `HTMLAudioElement` (CORS if media is on another origin; CloudFront often needs `Access-Control-Allow-Origin` for range requests if you add seeking later).

---

## Search

- If full-text search indexes `contentSearchable`, voice messages should include a fixed phrase + duration so they are findable by keyword (“voice”) if desired.
