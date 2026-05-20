# Custom Backgrounds Design Spec

## Overview

Allow users to upload custom images and videos as study room backgrounds. Custom backgrounds integrate directly into the existing scene selector in Settings, appearing below the 3 built-in scenes. Storage uses browser IndexedDB by default; server sync deferred to a future phase.

## Motivation

- Users want personalization beyond the 3 hardcoded video scenes
- The existing scene system (`studyScene.js` + `BackgroundLayer.jsx`) already supports image/video rendering with atmospheric overlays
- IndexedDB avoids server storage costs and keeps the feature simple for MVP

## Architecture

### Storage: IndexedDB

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
  createdAt: number (Date.now())
}
```

API:
- `openDB()` — open/create database with versioned schema migration
- `saveBackground(file: File)` — validate → generate ID → store → return record
- `listBackgrounds()` — return all records (metadata + thumbnail blobs, not full blobs)
- `getBackgroundBlob(id)` — return full blob for playback
- `deleteBackground(id)` — remove record
- `extractVideoThumbnail(blob: Blob)` — load video in hidden `<video>` element, seek to 1s, draw to `<canvas>`, export as JPEG blob. Called during `saveBackground` for video files.

### File Validation

| Type | Allowed MIME types | Max size |
|------|-------------------|----------|
| Image | `image/jpeg`, `image/png`, `image/webp` | 5 MB |
| Video | `video/mp4`, `video/webm` | 50 MB |

Validation runs client-side before storing. Errors shown via existing toast notification system.

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
- After file selection: validate → store in IndexedDB → refresh list → auto-select

### Custom Scene ID Convention

Custom scene IDs use prefix `custom:` followed by the IndexedDB record ID.
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

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `client/src/lib/backgroundStorage.js` | Create | IndexedDB CRUD operations |
| `client/src/app/panels/SettingsPanelContent.jsx` | Modify | Add custom backgrounds + upload button to scene selector |
| `client/src/lib/studyScene.js` | Modify | Add `getCustomSceneDefinition()`, export default atmosphere |
| `client/src/app/AppShell.jsx` | Modify | Support `custom:` prefix scene loading |
| `client/src/components/BackgroundLayer.jsx` | Modify | Support image media type + Object URL lifecycle |

## Out of Scope (Future Enhancements)

- Server-side sync for logged-in users
- Image cropping/editing tools
- Automatic dominant color extraction for atmosphere
- Video compression
- Background sharing/community features
- Admin UI for managing uploaded content

## Non-Goals

- No database schema changes needed (IndexedDB only for MVP)
- No new API endpoints
- No server storage or disk usage impact
