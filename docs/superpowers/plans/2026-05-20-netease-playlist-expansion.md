# NetEase Playlist Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand from one hardcoded playlist to a multi-playlist system with preset playlists, user playlists, and custom playlist ID input — all via a unified dropdown in the music panel.

**Architecture:** Server serves a preset playlist config via `/music/presets` endpoint. Client merges presets, user playlists, and custom input into one dropdown. Playlist selection persists in localStorage.

**Tech Stack:** Hono (server), React hooks (client), localStorage (persistence).

---

## File Map

| File | Role |
|------|------|
| `server/src/config/playlists.js` | Preset playlist configuration |
| `server/src/services/music.js` | Import default ID from config |
| `server/src/routes/music.js` | Add `/music/presets` endpoint |
| `client/src/features/ambient-music/neteaseSource.js` | Add `fetchPresetPlaylists()` |
| `client/src/features/ambient-music/useAmbientMusicController.js` | Multi-playlist state + switch logic |
| `client/src/features/ambient-music/AmbientMusicPanel.jsx` | Unified playlist dropdown UI |

---

### Task 1: Server — Preset Playlist Config

**Files:**
- Create: `server/src/config/playlists.js`
- Modify: `server/src/services/music.js`

- [ ] **Step 1: Create playlists.js config**

```js
export const PRESET_PLAYLISTS = [
  { id: '17688647005', name: '默认歌单', description: '学习专注音乐' },
  // Add more presets here:
  // { id: 'xxxxxxxx', name: 'Lofi Beats', description: '放松节拍' },
]

export const DEFAULT_PLAYLIST_ID = PRESET_PLAYLISTS[0].id
```

- [ ] **Step 2: Update music.js to import from config**

In `server/src/services/music.js`, replace line 5:

```js
const DEFAULT_PLAYLIST_ID = '17688647005'
```

with:

```js
import { DEFAULT_PLAYLIST_ID } from '../config/playlists.js'
```

Remove the `getDefaultPlaylistId` export function (lines 224-226) since it's no longer needed — routes will import directly from config.

- [ ] **Step 3: Commit**

```bash
git add server/src/config/playlists.js server/src/services/music.js
git commit -m "feat: extract preset playlist config from hardcoded value"
```

---

### Task 2: Server — Preset Playlists Endpoint

**Files:**
- Modify: `server/src/routes/music.js`

- [ ] **Step 1: Add /music/presets endpoint**

In `server/src/routes/music.js`, add import at the top:

```js
import { PRESET_PLAYLISTS } from '../config/playlists.js'
```

Remove the `getDefaultPlaylistId` import (it's no longer exported).

Update the playlist route to import from config directly:

```js
import { DEFAULT_PLAYLIST_ID } from '../config/playlists.js'
```

And change line 17 from:

```js
const id = c.req.param('id') || getDefaultPlaylistId()
```

to:

```js
const id = c.req.param('id') || DEFAULT_PLAYLIST_ID
```

Add the presets endpoint (before the playlist route):

```js
// Public: list preset playlists
music.get('/presets', (c) => {
  return c.json({ presets: PRESET_PLAYLISTS })
})
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/music.js
git commit -m "feat: add /music/presets endpoint"
```

---

### Task 3: Client — fetchPresetPlaylists

**Files:**
- Modify: `client/src/features/ambient-music/neteaseSource.js`

- [ ] **Step 1: Add fetchPresetPlaylists function**

Add at the end of `client/src/features/ambient-music/neteaseSource.js`:

```js
export async function fetchPresetPlaylists() {
  const res = await fetch(`${API_BASE}/music/presets`)
  if (!res.ok) return { presets: [] }
  return res.json()
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/features/ambient-music/neteaseSource.js
git commit -m "feat: add fetchPresetPlaylists client API"
```

---

### Task 4: Client — Multi-Playlist Controller

**Files:**
- Modify: `client/src/features/ambient-music/useAmbientMusicController.js`

- [ ] **Step 1: Update controller with preset + custom playlist support**

Update the import on line 8 to add `fetchPresetPlaylists`:

```js
import { loginNetEase, loginNetEasePhone, sendSmsCode, verifySmsCode, fetchUserPlaylists, fetchPresetPlaylists } from './neteaseSource.js'
```

Add new state variables after line 49:

```js
  const [presets, setPresets] = useState([])
  const [currentPlaylistId, setCurrentPlaylistId] = useState(() => {
    try { return localStorage.getItem('selectedPlaylistId') || '' } catch { return '' }
  })
```

Update the mount effect (lines 58-70) to load presets and restore last playlist:

```js
  // Load presets and initial playlist on mount
  useEffect(() => {
    setLoading(true)
    fetchPresetPlaylists().then(({ presets: p }) => {
      setPresets(p || [])
    }).catch(() => {})

    const savedPlaylistId = currentPlaylistId
    const loadId = savedPlaylistId || undefined
    trackSource.loadPlaylist(loadId).then(({ tracks: newTracks, name, id }) => {
      setTracks(newTracks)
      setPlaylistName(name)
      if (id) setCurrentPlaylistId(id)
      setLoading(false)
      if (newTracks.length > 0 && !preferences.selectedTrackId) {
        setPreference('selectedTrackId', newTracks[0].id)
      }
    }).catch(() => {
      setLoading(false)
    })
  }, [])
```

Update `switchToPlaylist` (lines 266-291) to also persist selection:

```js
  const switchToPlaylist = useCallback(async (playlistId) => {
    setLoading(true)
    try {
      const res = await fetch(`${import.meta.env.DEV ? 'http://localhost:3001' : ''}/music/playlist/${playlistId}`)
      const data = await res.json()
      if (data.playlist) {
        const newTracks = data.playlist.tracks.map((t) => ({
          id: String(t.id),
          title: t.name,
          artists: t.artists.map((a) => a.name).join(', '),
          album: t.album,
          duration: t.duration,
          src: '',
        }))
        setTracks(newTracks)
        setPlaylistName(data.playlist.name)
        setCurrentPlaylistId(playlistId)
        try { localStorage.setItem('selectedPlaylistId', playlistId) } catch {}
        if (newTracks.length > 0) {
          selectTrack(newTracks[0].id)
        }
      }
    } catch (e) {
      setLoginError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectTrack])
```

Add a `parseCustomPlaylistId` helper and `loadCustomPlaylist` function:

```js
  const loadCustomPlaylist = useCallback(async (input) => {
    const match = input.match(/(\d{5,})/)
    if (!match) {
      setLoginError('Invalid playlist ID or URL')
      return
    }
    await switchToPlaylist(match[1])
  }, [switchToPlaylist])
```

Update the return object to include new values:

```js
  return {
    // ... existing fields ...
    presets,
    currentPlaylistId,
    loadCustomPlaylist,
  }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/features/ambient-music/useAmbientMusicController.js
git commit -m "feat: add preset and custom playlist support to controller"
```

---

### Task 5: Client — Unified Playlist Dropdown UI

**Files:**
- Modify: `client/src/features/ambient-music/AmbientMusicPanel.jsx`

- [ ] **Step 1: Replace user playlists section with unified dropdown**

Update the destructuring at the top to include new fields:

```js
  const {
    // ... all existing fields ...
    presets,
    currentPlaylistId,
    loadCustomPlaylist,
  } = useAmbientMusicController()
```

Add new state for custom input:

```js
  const [customPlaylistInput, setCustomPlaylistInput] = useState('')
```

Replace the `{userPlaylists.length > 0 && (` block (lines 148-158) with the unified playlist selector:

```jsx
      {/* Playlist selector */}
      <div className="field">
        <label>{t('studyRoom.music.playlist', {}, 'Playlist')}</label>
        <select
          className="select"
          value={currentPlaylistId}
          onChange={(e) => { if (e.target.value) switchToPlaylist(e.target.value) }}
        >
          {presets.length > 0 && (
            <optgroup label={t('studyRoom.music.presetPlaylists', {}, 'Presets')}>
              {presets.map((pl) => (
                <option key={pl.id} value={pl.id}>{pl.name}</option>
              ))}
            </optgroup>
          )}
          {neteaseUser && userPlaylists.length > 0 && (
            <optgroup label={t('studyRoom.music.myPlaylists', {}, 'My Playlists')}>
              {userPlaylists.map((pl) => (
                <option key={pl.id} value={pl.id}>{pl.name} ({pl.trackCount})</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Custom playlist input */}
      <div className="field">
        <label>{t('studyRoom.music.customPlaylist', {}, 'Custom Playlist')}</label>
        <div className="custom-playlist-input">
          <input
            className="input"
            type="text"
            placeholder={t('studyRoom.music.customPlaylistPlaceholder', {}, 'Paste playlist ID or URL')}
            value={customPlaylistInput}
            onChange={(e) => setCustomPlaylistInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && customPlaylistInput) { loadCustomPlaylist(customPlaylistInput); setCustomPlaylistInput('') } }}
          />
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={() => { if (customPlaylistInput) { loadCustomPlaylist(customPlaylistInput); setCustomPlaylistInput('') } }}
            disabled={!customPlaylistInput}
          >
            {t('common.load', {}, 'Load')}
          </button>
        </div>
      </div>
```

- [ ] **Step 2: Add CSS for custom playlist input**

```css
.custom-playlist-input {
  display: flex;
  gap: 0.5rem;
}

.custom-playlist-input .input {
  flex: 1;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/features/ambient-music/AmbientMusicPanel.jsx
git commit -m "feat: add unified playlist dropdown with presets and custom input"
```

---

### Task 6: Deploy and Verify

- [ ] **Step 1: Deploy**

Run: `bash scripts/deploy.sh`

- [ ] **Step 2: Test the full flow**

1. Open `https://study.je1ght.top`
2. Open music panel
3. Verify preset playlists appear in dropdown
4. Switch between presets — tracks update
5. Paste a custom playlist ID — tracks load
6. Login to NetEase — user playlists appear in dropdown
7. Refresh page — verify last selected playlist persists
8. Verify playback works across playlist switches

- [ ] **Step 3: Final commit with any fixes**

```bash
git add -A && git commit -m "fix: address issues found during playlist testing"
```
