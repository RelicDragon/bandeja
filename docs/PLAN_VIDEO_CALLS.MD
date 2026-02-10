# Production-Grade Native Calling for a Capacitor App (Big Picture, Step-by-Step)

This document describes the full “WhatsApp/Telegram-like” calling system for a Capacitor-wrapped app (React UI + Node backend) using a **native media stack** (iOS/Android), **system call UI** (CallKit / Telecom ConnectionService), existing **APNs/FCM sending via native provider packages**, and a backend designed to be **P2P now but SFU/group-call ready**.

---

## 0) Target Outcomes (What “bulletproof” means)

**User experience**
- Incoming call **rings like a phone** (system UI), even when app is backgrounded/terminated.
- Answer/reject works from lock screen.
- Audio routing behaves correctly (speaker/Bluetooth/headset).
- Video call works reliably on mobile data + Wi-Fi.

**Reliability**
- Calls connect through NATs/CGNAT/enterprise Wi-Fi via **TURN**.
- Idempotent call state: duplicate pushes / retries don’t break call flow.
- Scalable: can handle spikes, multi-device users, high concurrency.

**Futureproof**
- Call model is **room-based** (Call ID + Participant IDs), not “peer socket to peer socket”.
- Media routing can swap from **P2P to SFU** without changing call UX, call state machine, or client call UI.

---

## 1) High-Level Architecture (Big Picture)

### 1.1 Components

**Client**
- Capacitor app: React UI for chat/app screens.
- Native calling module (iOS + Android):
  - Captures mic/camera, runs WebRTC or vendor SDK.
  - Shows system call UI:
    - iOS: CallKit
    - Android: Telecom framework via ConnectionService (self-managed)
  - Talks to backend via HTTPS + WebSocket (or socket.io) for signaling/call control.
  - Can operate when app UI is backgrounded (within OS constraints).

**Backend**
- **Call Control Service** (can be part of Node initially, but logically separate):
  - Creates calls, assigns Call ID, stores state, manages participants.
  - Decides which devices to ring.
  - Sends push notifications for incoming calls.
  - Routes signaling (SDP/ICE or vendor join info) via WebSockets.
  - Issues **Call Tokens** (short-lived) for media authorization (P2P now, SFU later).
- **User/Device Registry**
  - Stores user’s devices (platform, push token, last seen, capabilities).
- **TURN Service**
  - STUN/TURN endpoints for NAT traversal (TURN is mandatory in production).
- **Observability**
  - Logs/metrics/traces keyed by Call ID.

### 1.2 Data flows at a glance

**Outgoing call**
1. Caller requests a call from backend → gets `callId` + call token.
2. Backend rings callee’s eligible devices:
   - If callee is online in app: socket event.
   - If background/killed: push to device.
3. Callee sees system incoming call UI (CallKit/Telecom).
4. On answer → app establishes media (P2P or SFU).

**Incoming push (background/killed)**
- iOS: VoIP push → report incoming call to CallKit quickly → user answers → bring app/extension alive → join media.
- Android: push → start incoming call flow → Telecom/ConnectionService displays incoming call UI → user answers → connect media.

---

## 2) Canonical Call Model (SFU-Ready by design)

### 2.1 Core entities

**Call**
- `callId`: globally unique (UUID).
- `type`: `audio` | `video`
- `mode`: `p2p` | `sfu` (even if you only use `p2p` now, include the field)
- `state`: `created` → `ringing` → `connecting` → `connected` → `ended`
- `createdAt`, `answeredAt`, `endedAt`
- `initiatorUserId`

**Participant**
- `participantId` (can be same as userId, but keep distinct for future roles)
- `userId`
- `role`: `host` | `member`
- `state`: `invited` | `ringing` | `accepted` | `declined` | `busy` | `left`
- `deviceId` currently handling the call (important for multi-device)

**Device**
- `deviceId`
- `userId`
- `platform`: `ios` | `android` | `web`
- `pushToken` + token type metadata (iOS voip token vs regular APNs token)
- `lastSeenAt`
- `capabilities`: e.g., supports video, supports callkit/telecom, etc.

### 2.2 Token model (futureproof)

**Call Token** (JWT-like, short-lived)
- `callId`
- `userId`
- `participantId`
- `permissions`: publishAudio/publishVideo/subscribe
- `expiresAt` (e.g., 60–120s)
- Optional: `mediaMode` hint `p2p|sfu`

This token is the bridge:
- P2P now: token authorizes receiving TURN creds + signaling in call room.
- SFU later: token authorizes joining SFU room.

---

## 3) Platform Administrative & Configuration Steps (No code)

> Note: You already send APNs/FCM **natively via Apple/Google provider packages**. This document focuses on what additional configuration, identifiers, headers, payload conventions, and store-console updates you must make to support “system incoming calls”.

---

## 4) iOS Step-by-Step (Apple Developer Portal + App Config + Store)

### 4.1 Apple Developer Portal: App ID and capabilities

1. Open **Apple Developer → Certificates, Identifiers & Profiles**
2. Select your app’s **Identifier (App ID)**
3. Ensure capability **Push Notifications** is enabled.
4. Plan for VoIP push:
   - VoIP pushes require **PushKit** usage on-device.
   - You will use an APNs auth key (.p8) or certificates (auth key is recommended).
   - Keep track of the **bundle identifier**. VoIP pushes use a `.voip` APNs topic.

**Deliverable:** App ID configured for push, APNs credentials ready.

### 4.2 APNs provider requirements (you already send APNs natively)

You must support **two APNs channels**:
- **Regular notifications** (messages, etc.) → existing
- **VoIP pushes** (incoming call) → new, required for “rings when killed”

Administrative checklist for your push sender:
1. Confirm you can send APNs with:
   - `apns-push-type: voip`
   - `apns-topic: <bundleId>.voip`
   - high priority (VoIP is treated differently)
2. Ensure you can store and target **VoIP push token(s)** separately from regular APNs token(s).

**Deliverable:** APNs sender can send VoIP pushes with correct headers/topic.

### 4.3 iOS app target configuration (Xcode project settings)

1. Enable **Background Modes** for the iOS target:
   - Audio, AirPlay, Picture in Picture (for call audio continuity)
   - Voice over IP (if using PushKit/VoIP pushes)
2. Add required privacy strings (Info.plist):
   - `NSMicrophoneUsageDescription`
   - `NSCameraUsageDescription`
   - (Optional but common) `NSBluetoothAlwaysUsageDescription` if supporting Bluetooth routing explicitly

**Deliverable:** iOS build has required entitlements and privacy strings.

### 4.4 CallKit operational compliance checklist

To keep VoIP pushes reliable and App Store safe:
1. Incoming VoIP push must be used **only** for real-time calling.
2. When a VoIP push arrives, your app must **report an incoming call** to CallKit promptly.
3. Handle: Answer, Decline, End, Timeout, Missed.
4. Ensure call UI appears even if app UI is not running.

**Deliverable:** Policy-compliant VoIP push behavior with CallKit.

### 4.5 App Store Connect updates (because you’re adding voice/video calls)

1. Update **App Privacy** disclosures:
   - microphone/camera usage
   - device identifiers (push tokens)
   - call metadata (if you log it)
2. Update your **Privacy Policy** URL text to explicitly mention:
   - voice/video communications
   - what metadata is stored and for how long
3. Update your store description/screenshots if necessary (optional but recommended).

**Deliverable:** Store listing and privacy disclosures match new features.

---

## 5) Android Step-by-Step (Telecom + ConnectionService + Play Console + Android 14+)

### 5.1 Choose ConnectionService mode (recommended)

Use **Telecom + ConnectionService (self-managed)** for VoIP apps:
- Presents a system-level calling experience.
- More futureproof than relying on full-screen notifications alone.

**Deliverable:** Decision: self-managed ConnectionService.

### 5.2 Android app configuration (manifest + permissions + OS policies)

Administrative checklist:
1. Declare all runtime permissions needed for calling UX:
   - Microphone, Camera
   - Bluetooth connect permissions on newer Android versions if needed for routing
   - Notifications (`POST_NOTIFICATIONS` on Android 13+)
2. Foreground services (Android 10+ increasing restrictions):
   - If call must persist in background, you must use a **foreground service** while capturing mic/camera.
   - For Android 14+ targeting API 34, declare correct **foreground service types** (e.g., microphone, camera, phoneCall).
3. Telecom/ConnectionService binding:
   - Declare the ConnectionService properly and any required permissions for self-managed calling.

**Deliverable:** Android build meets modern background and calling restrictions.

### 5.3 FCM requirements (you already send FCM natively)

For incoming calls:
1. Use high-priority delivery where permitted.
2. Include a **call payload** that can launch the incoming call flow quickly.
3. Support multi-device: ring the correct device(s), avoid ringing all devices forever.

**Deliverable:** FCM sender supports “incoming call” payloads and priority settings.

### 5.4 Google Play Console updates

1. Update **Data safety**:
   - microphone/camera usage
   - call metadata collection
   - identifiers/push tokens
2. Ensure your use of background behavior and foreground service aligns with policy expectations:
   - user-visible ongoing call notification/service behavior
3. Rollout strategy:
   - staged rollout with crash/ANR monitoring, especially on OEM devices.

**Deliverable:** Play listing and policy posture aligned with calling.

---

## 6) Push Payload Standard (Cross-Platform)

You already have push sending in place. Standardize an “incoming call push” payload so both native stacks behave consistently.

### 6.1 Required push fields (logical)

- `event`: `"incoming_call"`
- `callId`
- `fromUserId`
- `type`: `"audio" | "video"`
- `timestamp`
- `ttlSeconds` (e.g., 30–45)
- Optional:
  - `callerDisplayName`
  - `callerAvatarUrl`
  - `modeHint`: `"p2p" | "sfu"` (for future)

### 6.2 Critical delivery rules

- Push is a **wake/ring trigger**, not your signaling channel.
- Never send raw SDP/ICE via push.
- Push must be **idempotent**: multiple deliveries should not create multiple calls.

---

## 7) Backend: Production Call Control (Step-by-Step)

### 7.1 Split responsibilities

Even if in one repo, design as separate logical services:

**Call Control**
- Create call session.
- Select devices to ring.
- Manage call state and participant state.
- Expose APIs:
  - `POST /calls` (create)
  - `POST /calls/{callId}/accept`
  - `POST /calls/{callId}/decline`
  - `POST /calls/{callId}/end`
  - `POST /calls/{callId}/ice` / `sdp` (if P2P) OR `POST /calls/{callId}/joinInfo` (if SFU)
- Emits events over socket.io:
  - `call.ringing`, `call.accepted`, `call.ended`, `call.busy`, `call.timeout`
  - `signal.offer`, `signal.answer`, `signal.ice` (P2P) OR `sfu.join` (SFU)

**Device Registry**
- `POST /devices/register` (push token, platform, capabilities)
- `POST /devices/heartbeat` or update last-seen
- Store both:
  - iOS regular push token
  - iOS VoIP push token
  - Android FCM token

### 7.2 Ringing strategy (multi-device, realistic)

Rules:
- Ring a **bounded set** of devices (e.g., 1–3 most recent).
- Stop ringing on:
  - Accept on any device
  - Decline
  - Busy
  - Timeout
- Send “cancel call” push/event to other devices when call answered elsewhere.

### 7.3 State machine (idempotent + race-safe)

Implement state transitions with:
- **idempotency keys** (same accept processed once)
- **optimistic locking** or atomic updates
- timeouts:
  - ring timeout (e.g., 30–45s)
  - connect timeout (e.g., 20s after accept)

### 7.4 Security requirements

- All call actions require auth.
- Call tokens are short-lived.
- TURN credentials are short-lived.
- Rate limit:
  - call creation per user
  - push sends per user/device
  - signaling messages per call

---

## 8) Media Infrastructure (TURN now; SFU later)

### 8.1 TURN: mandatory for production

Step-by-step:
1. Deploy TURN servers (coturn recommended) with:
   - UDP 3478
   - TCP 3478
   - TLS 5349
2. Add regions as your user base grows.
3. Provide time-limited TURN credentials from backend:
   - generated per call token or per session
4. Protect against abuse:
   - require auth (no open relay)
   - rate limit allocations
   - monitor bandwidth anomalies

### 8.2 Media modes

**P2P (initial)**
- Native WebRTC stack on both devices
- Backend for signaling + TURN creds

**SFU (future-ready)**
- Keep the same call model and call tokens.
- Backend issues SFU join credentials instead of P2P signaling.
- Clients publish/subscribe streams via SFU.
- Group calls become straightforward.

### 8.3 When to switch to SFU

Practical triggers:
- You add group calls (almost always requires SFU).
- You want better quality under poor networks (SFU can help).
- You need recording, transcription, moderation.

---

## 9) Observability & Operations (What makes it “bulletproof”)

### 9.1 Metrics (minimum set)

Per call (tagged by `callId`, platform):
- Incoming push sent count, success/failure
- Call UI shown (client event)
- Answered vs missed vs declined
- Time to first audio (TTFA)
- ICE connection success/failure (P2P)
- TURN allocation rate
- Packet loss, jitter (if available)
- Call duration distributions

### 9.2 Logging & tracing

- Every call-related log line must include:
  - `callId`, `userId`, `deviceId`, `platform`
- Distributed tracing:
  - `POST /calls` → push send → client ack → accept → connect → end

### 9.3 Alerting

- TURN allocation failures spike
- Answer rate drops
- TTFA increases
- Push delivery errors spike
- Telecom/CallKit failure events spike

---

## 10) Testing Matrix (You must run this before wide rollout)

### 10.1 Functional test cases

- iOS → iOS audio
- iOS → iOS video
- Android → Android audio
- Android → Android video
- iOS ↔ Android audio/video

### 10.2 App lifecycle tests

For each platform:
- app foreground
- app background
- app terminated (killed)
- phone locked
- low power mode (iOS) / battery optimizations (Android)

### 10.3 Network tests

- Wi-Fi ↔ Wi-Fi
- LTE/5G ↔ Wi-Fi
- LTE/5G ↔ LTE/5G
- “hostile NAT” Wi-Fi (enterprise/cafe)
- VPN on/off

### 10.4 OEM tests (Android)

- Samsung (One UI)
- Xiaomi/MIUI
- Oppo/Realme
- Pixel (reference)

---

## 11) Release Plan (Safe for an app already in stores)

### 11.1 Feature flags

- Flag the entire calling feature.
- Separate flags:
  - incoming call UI enablement
  - audio call enablement
  - video call enablement

### 11.2 Staged rollout

1. Internal testing
2. Closed beta
3. 1% production
4. 10%
5. 50%
6. 100%

At each stage, verify:
- crash-free rate
- TTFA
- call connect success rate
- push-to-call-ui success rate
- OEM-specific anomalies

### 11.3 Backward compatibility

- Old clients should:
  - ignore unknown push payload fields
  - receive a “call unsupported” fallback message/event if needed

---

## 12) Operational Runbooks (What your team needs on day 1)

### 12.1 Common incident: “Incoming calls not ringing on iOS”

Checklist:
- VoIP token registration working?
- APNs headers include `apns-push-type: voip` and correct `.voip` topic?
- Is app reporting incoming call to CallKit quickly after push?
- Are you sending VoIP pushes for non-call events (Apple may throttle)?

### 12.2 Common incident: “Calls connect but no audio/video”

Checklist:
- TURN reachable from region?
- ICE candidates exchanged correctly?
- Foreground service running on Android while mic/camera active?
- Permissions granted?
- Audio route changes handled?

### 12.3 Common incident: “Android doesn’t show incoming call UI on some OEMs”

Checklist:
- Battery optimization exclusions guidance to users (when necessary)
- Notifications allowed + high-priority handling
- Telecom/ConnectionService registration correct
- Device-specific restrictions documented

---

## 13) Concrete “To-Do” Checklist (Administrative)

### 13.1 iOS
- [ ] Ensure Push Notifications capability enabled for App ID
- [ ] Confirm APNs Auth Key in place
- [ ] Add support for VoIP push sending:
  - [ ] Store VoIP token(s)
  - [ ] Send with `voip` push type and `.voip` topic
- [ ] Enable Background Modes relevant to calling (VoIP, Audio)
- [ ] Add Info.plist privacy strings (mic/camera)
- [ ] Update App Store Connect privacy disclosures + privacy policy text

### 13.2 Android
- [ ] Configure Telecom ConnectionService (self-managed) approach
- [ ] Confirm permission declarations and runtime permission flows
- [ ] Configure foreground service policy for Android 14+ (types)
- [ ] Ensure incoming call FCM payload standard + priority handling
- [ ] Update Play Console Data Safety and relevant disclosures

### 13.3 Backend/Infra
- [ ] Implement Call Control state machine (idempotent, race-safe)
- [ ] Implement Device Registry for multi-device push targeting
- [ ] Deploy TURN with UDP/TCP/TLS + monitoring
- [ ] Implement call token issuance (short-lived)
- [ ] Add call observability (metrics/logs/traces)
- [ ] Add rollout feature flags

### 13.4 SFU readiness
- [ ] Adopt Call ID + Participant model everywhere
- [ ] Standardize Call Token format (works for P2P and SFU)
- [ ] Keep signaling API abstract enough to swap:
  - P2P SDP/ICE now
  - SFU join info later

---

## 14) Final Notes (Reality checks)

- “Phone-like” incoming calls on iOS require correct VoIP push behavior + CallKit.
- “Phone-like” incoming calls on Android at scale is best served by Telecom/ConnectionService (self-managed) plus strict compliance with modern foreground service/background rules.
- TURN is non-negotiable in real-world calling.
- The biggest futureproofing move is **Call ID + Participant + Token** design; it lets you upgrade from P2P to SFU without tearing up your call UX.

---