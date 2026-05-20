# Custom Backgrounds Design Spec

## Overview

Allow users to upload custom images and videos as study room backgrounds. Custom backgrounds integrate directly into the existing scene selector in Settings, appearing below the 3 built-in scenes. Storage uses a dual strategy: IndexedDB for immediate local access, server-side storage for logged-in users to enable cross-device sync.

## Motivation

- Users want personalization beyond the 3 hardcoded video scenes
- The existing scene system (`studyScene.js` + `BackgroundLayer.jsx`) already supports image/video rendering with atmospheric overlays
- Logged-in users expect their backgrounds to persist across devices/sessions

## Architecture

### Storage Strategy

| User State | Primary Storage | Sync Behavior |
|------------|----------------|---------------|
| Guest / Not logged in | IndexedDB only | No sync |
| Logged in | IndexedDB + Server | Upload on save, download on login |

IndexedDB serves as the local cache for instant playback. Server is the source of truth for logged-in users.

### Client-side: IndexedDB

**New file: `client/src/lib/backgroundStorage.js`**

Database: `study-app-backgrounds`, Object store: `backgrounds`

Record schema:
```
{
  id: string (cuid),
  name: string (display name, derived from filename),
  type: "image" | "video",
  mimeType: string,
  blob: Blob (file binary),
  thumbnail: Blob? (video poster frame, extracted client-side),
  serverId: string? (server-side record ID, set after successful upload),
  createdAt: number (Date.now())
}
```

API:
- `openDB()` — open/create database with versioned schema migration
- `saveBackground(file: File)` — validate → generate ID → store → return record
- `listBackgrounds()` — return all records (metadata + thumbnail blobs, not full blobs)
- `getBackgroundBlob(id)` — return full blob for playback
- `deleteBackground(id)` — remove record
- `updateServerId(localId, serverId)` — link local record to server record after upload
- `extractVideoThumbnail(blob: Blob)` — load video in hidden `<video>` element, seek to 1s, draw to `<canvas>`, export as JPEG blob. Called during `saveBackground` for video files.

### Server-side: Prisma + Disk Storage

**New Prisma model `UserBackground` in `server/prisma/schema.prisma`:**

```prisma
model UserBackground {
  id            String   @id @default(cuid())
  userId        String
  fileName      String          // original filename
  fileType      String          // "image" | "video"
  mimeType      String          // "image/jpeg", "video/mp4" etc.
  fileSize      Int             // bytes
  filePath      String          // relative path on disk: backgrounds/{userId}/{id}.{ext}
  thumbnailPath String?         // thumbnail path for videos
  createdAt     DateTime @default(now())

  user StudyUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

**Storage directory:** `~/uploads/backgrounds/{userId}/{backgroundId}.{ext}`

**New file: `server/src/routes/backgrounds.js`** — API routes:

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/backgrounds` | GET | Required | List user's backgrounds (metadata only) |
| `/backgrounds` | POST | Required | Upload background file (multipart/form-data) |
| `/backgrounds/:id` | DELETE | Required | Delete background + file from disk |
| `/backgrounds/:id/file` | GET | Required | Serve the file (for sync/download) |
| `/backgrounds/:id/thumbnail` | GET | Required | Serve thumbnail (for sync/download) |

**Upload handling:** Use `@hono/node-server`'s multipart parsing or a library like `formidable`. File saved to disk, metadata saved to DB.

**File validation (server-side mirror of client validation):**

| Type | Allowed MIME types | Max size |
|------|-------------------|----------|
| Image | `image/jpeg`, `image/png`, `image/webp` | 5 MB |
| Video | `video/mp4`, `video/webm` | 50 MB |

Server validates independently (never trust client-only validation).

### Client Sync Logic

**New file: `client/src/lib/backgroundSync.js`**

```
syncBackgrounds(userId):
  1. Fetch server background list via GET /backgrounds
  2. For each server record not in IndexedDB (by serverId):
     - Download file via GET /backgrounds/:id/file
     - Store in IndexedDB with serverId set
  3. For each local record without serverId:
     - Upload via POST /backgrounds (multipart)
     - Update local record with returned serverId
  4. For each local record with serverId that no longer exists on server:
     - Delete from IndexedDB (server deletion takes priority)
  5. Refresh scene selector UI
```

**Sync triggers:**
- On login (after auth completes)
- On app mount (if already logged in)
- After local upload (immediate push to server)
- After local delete (immediate push to server)

**Network handling:**
- Upload/download failures are retried silently (up to 3 times)
- Background sync runs asynchronously — UI remains responsive
- Upload progress shown via toast for large video files

### Scene Selector UI

**Modified: `client/src/app/panels/SettingsPanelContent.jsx`**

The existing `scene-selector` div (lines 44-54) renders 3 built-in scene buttons. Extend it:

```
[Coastal Cafe] [Retro Desk] [Aquarium Room]   ← built-in scenes (existing)
[thumb1] [thumb2] ...                           ← user custom backgrounds from IndexedDB
[+]                                             ← upload trigger button
```

- Custom background buttons show thumbnail (image preview or video poster frame)
- Hover shows name tooltip
- Click selects the scene via `setPreference('selectedSceneId', 'custom:{id}')`
- Long-press or context menu with delete option (confirmation dialog)
- "+" button triggers hidden `<input type="file" accept="image/*,video/*">`
- After file selection: validate → store in IndexedDB → if logged in, upload to server → refresh list → auto-select

### Custom Scene ID Convention

Custom scene IDs use prefix `custom:` followed by the local IndexedDB record ID.
Example: `custom:clxyz123456`

This distinguishes from built-in scene IDs (`coastal-cafe`, `retro-desk`, `aquarium-room`).

### Scene Resolution

**Modified: `client/src/lib/studyScene.js`**

Add function:
```js
export async function getCustomSceneDefinition(id) {
  // id = "custom:xxx" → extract xxx → load from IndexedDB
  // Create Object URL from blob
  // Return scene definition with default atmosphere params
}
```

Default atmosphere for custom backgrounds:
```js
{
  idleOverlayStrength: 0.3,
  focusOverlayStrength: 0.5,
  ambientGlow: 'rgba(120, 140, 180, 0.15)',
  accentGlow: 'rgba(180, 160, 120, 0.1)',
  vignetteColor: 'rgba(0, 0, 0, 0.6)',
  reactiveAtmosphere: {
    work: { overlayStrength: 0.45, glowOpacity: 0.3, vignetteOpacity: 0.6, brightness: 0.85 },
    shortBreak: { overlayStrength: 0.25, glowOpacity: 0.2, vignetteOpacity: 0.4, brightness: 1.0 },
    longBreak: { overlayStrength: 0.2, glowOpacity: 0.15, vignetteOpacity: 0.35, brightness: 1.05 }
  }
}
```

### AppShell Integration

**Modified: `client/src/app/AppShell.jsx`**

Current flow:
```js
const scene = getStudyScene(preferences.selectedSceneId)
```

New flow:
```js
const [customScene, setCustomScene] = useState(null)

useEffect(() => {
  if (preferences.selectedSceneId?.startsWith('custom:')) {
    getCustomSceneDefinition(preferences.selectedSceneId).then(setCustomScene)
  } else {
    setCustomScene(null)
  }
}, [preferences.selectedSceneId])

const scene = customScene || getStudyScene(preferences.selectedSceneId)
```

### BackgroundLayer Changes

**Modified: `client/src/components/BackgroundLayer.jsx`**

- Currently only renders `<video>` elements. Add support for `<img>` when `mediaType === 'image'`
- For custom scenes, `mediaSrc` is an Object URL (blob:)
- Add cleanup: `URL.revokeObjectURL()` on unmount or when src changes
- Image rendering: `<img>` with same CSS structure as video (fade-in on load, same overlay layers on top)

### Lifecycle Management

1. Object URLs created when scene is selected
2. Revoked when:
   - Component unmounts
   - User switches to a different scene
   - User deletes the background
3. On page refresh: re-create Object URL from IndexedDB blob
4. On login: sync backgrounds from server to IndexedDB, then refresh UI

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `client/src/lib/backgroundStorage.js` | Create | IndexedDB CRUD operations |
| `client/src/lib/backgroundSync.js` | Create | Client-server sync logic |
| `client/src/app/panels/SettingsPanelContent.jsx` | Modify | Add custom backgrounds + upload button to scene selector |
| `client/src/lib/studyScene.js` | Modify | Add `getCustomSceneDefinition()`, export default atmosphere |
| `client/src/app/AppShell.jsx` | Modify | Support `custom:` prefix scene loading |
| `client/src/components/BackgroundLayer.jsx` | Modify | Support image media type + Object URL lifecycle |
| `server/prisma/schema.prisma` | Modify | Add `UserBackground` model |
| `server/src/routes/backgrounds.js` | Create | Background upload/list/delete/serve API |
| `server/src/app.js` | Modify | Mount `/backgrounds` routes |
| `infra/docker-compose.yml` | Modify | Mount uploads volume for persistence |

## Out of Scope (Future Enhancements)

- Image cropping/editing tools
- Automatic dominant color extraction for atmosphere
- Video compression
- Background sharing/community features
- Admin UI for managing uploaded content

## Non-Goals

- No background sharing between users
- No cloud object storage (S3/MinIO) — local disk sufficient for single-server deployment
