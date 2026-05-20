import { useCallback, useRef } from 'react'
import { fetchCurrentUser, fetchStats, fetchDailyStats } from '../state/studySessionRecorder.js'
import { fetchPresetPlaylists } from '../features/ambient-music/neteaseSource.js'
import { getAmbientTrackSource, MUSIC_SOURCE_TYPES } from '../features/ambient-music/musicSources.js'
import { setCacheEntry, getInFlight, setInFlight, isPanelCached } from './panelPrefetchCache.js'

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''
const DEBOUNCE_MS = 5000

const prefetchers = {
  async todo() {
    const user = await fetchCurrentUser()
    if (!user?.id) return { userId: null, items: [] }
    const res = await fetch(`${API_BASE}/todos`, { credentials: 'include' })
    const data = await res.json()
    return { userId: user.id, items: data.items || [] }
  },

  async music() {
    const trackSource = getAmbientTrackSource(MUSIC_SOURCE_TYPES.netease)
    const savedPlaylistId = (() => {
      try { return localStorage.getItem('selectedPlaylistId') || '' } catch { return '' }
    })()
    const savedPlaylistType = (() => {
      try { return localStorage.getItem('selectedPlaylistType') || 'playlist' } catch { return 'playlist' }
    })()
    const [presetsResult, playlistResult] = await Promise.all([
      fetchPresetPlaylists().catch(() => ({ presets: [] })),
      trackSource.loadPlaylist(savedPlaylistId || undefined, savedPlaylistType).catch(() => ({ tracks: [], name: '', id: '' })),
    ])
    return {
      presets: presetsResult.presets || [],
      tracks: playlistResult.tracks || [],
      playlistName: playlistResult.name || '',
      playlistId: playlistResult.id || '',
    }
  },

  async statistics() {
    const [user, stats, dailyResult] = await Promise.all([
      fetchCurrentUser().catch(() => null),
      fetchStats().catch(() => ({ total: 0, today: 0, thisWeek: 0, totalMinutes: 0 })),
      fetchDailyStats().catch(() => ({ daily: [] })),
    ])
    return { user, stats, daily: dailyResult.daily || [] }
  },
}

export function usePanelPrefetch() {
  const lastHoverRef = useRef({})

  const onPanelHover = useCallback((panelId) => {
    if (!prefetchers[panelId]) return
    if (isPanelCached(panelId)) return

    const now = Date.now()
    if (lastHoverRef.current[panelId] && now - lastHoverRef.current[panelId] < DEBOUNCE_MS) return
    lastHoverRef.current[panelId] = now

    const existing = getInFlight(panelId)
    if (existing) return

    const promise = prefetchers[panelId]().then((data) => {
      setCacheEntry(panelId, data)
      return data
    })
    setInFlight(panelId, promise)
  }, [])

  return { onPanelHover }
}
