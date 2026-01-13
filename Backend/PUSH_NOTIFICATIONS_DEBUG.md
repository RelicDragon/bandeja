# Push Notifications Debugging Guide

## Overview

Enhanced logging and debugging tools have been added to investigate push notification issues, particularly for users with both iOS and Android devices registered.

## Added Logging

All push notification operations now include detailed logging with prefixes:
- `[PUSH]` - Main push notification service
- `[APNS]` - iOS push notifications
- `[FCM]` - Android push notifications (Firebase Cloud Messaging)
- `[PushTokenService]` - Token management
- `[NotificationService]` - High-level notification service

## Debugging Tools

### 1. Check Push Tokens Script

Check push tokens for a specific user or see users with multiple devices:

```bash
# Check specific user's tokens
npx ts-node check-push-tokens.ts <userId>

# List all users with push tokens
npx ts-node check-push-tokens.ts
```

This will show:
- User's push notification settings
- All registered tokens (iOS, Android, Web)
- Device IDs and last update times
- Warning if user has both iOS and Android tokens

### 2. Test Notification Endpoint

Send a test notification to yourself:

```bash
# Using curl
curl -X POST https://your-api.com/api/push/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Or from the app, make a POST request to `/api/push/test`

This will:
- Send a test notification to all your registered devices
- Return how many devices were notified
- Log detailed information about the sending process

### 3. Get User Tokens Endpoint

Check your registered tokens:

```bash
# Get all tokens
curl -X GET https://your-api.com/api/push/tokens \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get only iOS tokens
curl -X GET "https://your-api.com/api/push/tokens?platform=IOS" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get only Android tokens
curl -X GET "https://your-api.com/api/push/tokens?platform=ANDROID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## What to Look For in Logs

### Startup Logs

When the server starts, you should see:
```
[PUSH] Initializing push notification services...
[APNS] Initializing APNs Provider...
[APNS] ✅ APNs Provider initialized successfully
[PUSH] Initializing FCM service...
[FCM] ✅ FCM Admin SDK initialized successfully
[PUSH] Push notification services initialization complete
```

If APNs or FCM fail to initialize, check:
- Environment variables are set correctly
- APNs key file exists at the specified path
- FCM credentials are valid JSON

### When Sending Notifications

For each notification sent, you'll see:
```
[NotificationService] Sending push notification to user <userId>, type: <type>
[PUSH] Sending notification to user <userId>: { title: '...', type: '...' }
[PushTokenService] Getting tokens for user <userId>, platform: IOS
[PushTokenService] Found 1 token(s): [...]
[APNS] Sending to iOS token 1/1 (deviceId: ios)
[APNS] Preparing to send notification to token: <token preview>...
[APNS] ✅ Notification sent successfully
[APNS] Sent to 1/1 iOS device(s) for user <userId>
[FCM] Getting Android tokens for user: <userId>
[FCM] Found 1 token(s): [...]
[FCM] Sending to Android token 1/1 (deviceId: android)
[FCM] ✅ Notification sent successfully, message ID: <messageId>
[FCM] Sent to 1/1 Android device(s) for user <userId>
[PUSH] Total sent: 2 (iOS: 1, Android: 1)
```

### Common Issues

**No tokens found:**
```
[APNS] Found 0 iOS token(s) for user <userId>
```
→ User hasn't registered an iOS device

**APNs Provider not initialized:**
```
[APNS] Provider not initialized, skipping iOS notification
```
→ Check APNs configuration in environment variables

**Token registration error:**
```
[APNS] ❌ Notification failed: { status: '410', response: ... }
```
→ Token is invalid/expired and will be removed automatically

**Firebase error:**
```
[FCM] Error details: { code: 'messaging/invalid-registration-token', ... }
```
→ Token is invalid and will be removed automatically

## Potential Issue: Users with Both iOS and Android

The system should send notifications to BOTH platforms when a user has devices registered on both. Check logs to ensure:

1. Both iOS and Android tokens are being retrieved:
   ```
   [PushTokenService] Found 1 token(s): [{ platform: 'IOS', ... }]
   [PushTokenService] Found 1 token(s): [{ platform: 'ANDROID', ... }]
   ```

2. Both services are trying to send:
   ```
   [APNS] Sending to iOS token 1/1...
   [FCM] Sending to Android token 1/1...
   ```

3. Both are succeeding:
   ```
   [PUSH] Total sent: 2 (iOS: 1, Android: 1)
   ```

If iOS notifications aren't being sent but Android are:
- Check if APNs provider initialized successfully
- Check if there are any errors in the iOS sending process
- Verify the iOS token is valid

## Environment Variables

Required for APNs (iOS):
```
APNS_KEY_ID=<key-id>
APNS_TEAM_ID=<team-id>
APNS_BUNDLE_ID=com.funified.bandeja
APNS_KEY_PATH=<path-to-.p8-file>
APNS_PRODUCTION=true|false
```

Required for FCM (Android):
```
FCM_PROJECT_ID=<project-id>
FCM_PRIVATE_KEY=<private-key-from-service-account-json>
FCM_CLIENT_EMAIL=<client-email-from-service-account-json>
```
