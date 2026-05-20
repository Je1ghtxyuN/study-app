# NetEase Playlist Expansion Design Spec

## Overview

Expand the NetEase Cloud Music integration from a single hardcoded playlist to a multi-playlist system with preset playlists (config-driven), logged-in user playlists, and custom playlist ID input. All accessible via a unified dropdown in the music panel.

## Motivation

- Current system has only one hardcoded default playlist (`17688647005`)
- Users want variety without needing to log in to NetEase
- Users who have their own playlists on NetEase want quick access
- Power users want to paste any playlist link/ID

## Architecture

### Preset Playlist Configuration

**New file: `server/src/config/playlists.js`**

```js
export const PRESET_PLAYLISTS = [
  { id: '17688647005', name: '默认歌单', description: '学习专注音乐' },
  // Add more presets here:
  // { id: 'xxxxxxxx', name: 'Lofi Beats', description: '放松节拍' },
]

export const DEFAULT_PLAYLIST_ID = PRESET_PLAYLISTS[0].id
```

This is the single source of truth for presets. Adding a new preset = adding one line to this array.

### Server API Changes

**Modified: `server/src/services/music.js`**

- Import `DEFAULT_PLAYLIST_ID` from config instead of hardcoding
- `getPlaylistDetail(id)` — no changes needed, already supports any ID

**Modified: `server/src/routes/music.js`**

New endpoint:

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/music/presets` | GET | Public | Returns `PRESET_PLAYLISTS` array |

Existing endpoints unchanged. `/music/playlist/:id?` already supports arbitrary IDs.

### Client API Changes

**Modified: `client/src/features/ambient-music/neteaseSource.js`**

Add:
```js
export async function fetchPresetPlaylists() {
  const res = await fetch(`${API_BASE}/music/presets`)
  return res.json()  // [{ id, name, description }]
}
```

### Controller Changes

**Modified: `client/src/features/ambient-music/useAmbientMusicController.js`**

New state:
- `presets: Array` — preset playlist list
- `userPlaylists: Array` — logged-in user's playlists (already partially exists)
- `currentPlaylistId: string` — currently active playlist ID
- `currentPlaylistName: string` — display name

Startup flow:
1. Fetch preset playlists → store in `presets`
2. Load default playlist (first preset) → store tracks
3. If NetEase login exists in localStorage → fetch user playlists → store in `userPlaylists`

New function:
```js
switchPlaylist(id) → {
  setCurrentPlaylistId(id)
  fetchPlaylistDetail(id) → update tracks
  reset current track index to 0
  auto-play first track
}
```

### UI Changes

**Modified: `client/src/features/ambient-music/AmbientMusicPanel.jsx`**

Replace existing playlist dropdown with unified selector:

```
┌─────────────────────────────────┐
│ ▶ Track Name                    │  ← current track info (existing)
│   Artist Name                   │
├─────────────────────────────────┤
│ ◀ ▶⏸ ▶  🔊━━━━━━━  🔀        │  ← playback controls (existing)
├─────────────────────────────────┤
│ 🎵 当前歌单名称          ▼     │  ← playlist dropdown trigger
├─────────────────────────────────┤ (dropdown open)
│ ── 预设歌单 ──                  │
│   ✓ 默认歌单                    │
│     Lofi Beats                  │
│     古典钢琴                    │
│ ── 我的歌单（登录后可用）──     │  ← greyed out if not logged in
│     我喜欢的音乐                │
│     深夜学习                    │
│ ── 自定义 ──                    │
│   [粘贴歌单链接/ID] [加载]      │  ← inline input + button
└─────────────────────────────────┘
```

Behavior:
- Preset playlists: always visible, clickable without login
- User playlists: visible but greyed out when not logged in; clicking prompts login
- Custom input: user pastes a playlist URL or ID → regex extracts numeric ID → `switchPlaylist(id)`
- Current playlist indicated with checkmark
- Dropdown closes on selection or outside click

### Custom Playlist ID Parsing

Accept any of these formats:
- Pure numeric ID: `17688647005`
- Web URL: `https://music.163.com/#/playlist?id=17688647005`
- Share link containing ID

Client-side regex: `/(\d{5,})/` — extract first sequence of 5+ digits.

Validation: attempt `fetchPlaylistDetail(id)` — if it fails (404 or error), show toast "歌单不存在或无法访问".

### Playlist Switch Flow

```
User clicks preset / user playlist / submits custom ID
  → switchPlaylist(id)
    → setCurrentPlaylistId(id)
    → fetchPlaylistDetail(id)
    → update tracks array in state
    → reset currentIndex to 0
    → fetchSongUrl(tracks[0].id)
    → auto-play
    → persist selectedPlaylistId to localStorage
```

On app restart: restore `selectedPlaylistId` from localStorage, reload that playlist.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `server/src/config/playlists.js` | Create | Preset playlist configuration |
| `server/src/services/music.js` | Modify | Import default ID from config |
| `server/src/routes/music.js` | Modify | Add `/music/presets` endpoint |
| `client/src/features/ambient-music/neteaseSource.js` | Modify | Add `fetchPresetPlaylists()` |
| `client/src/features/ambient-music/useAmbientMusicController.js` | Modify | Multi-playlist state + switch logic |
| `client/src/features/ambient-music/AmbientMusicPanel.jsx` | Modify | Unified playlist dropdown UI |

## Out of Scope

- Playlist caching/prefetching (all fetched live from NetEase API)
- Offline playlist support
- Playlist editing/reordering
- Search for playlists on NetEase
