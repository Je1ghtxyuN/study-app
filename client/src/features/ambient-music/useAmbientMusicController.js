import { useCallback, useEffect, useRef, useState } from 'react'
import { useStudyRoomLocale } from '../../i18n/useStudyRoomLocale.js'
import {
  useStudyRoomActions,
  useStudyRoomState,
} from '../../state/useStudyRoom.js'
import { getAmbientTrackSource, MUSIC_SOURCE_TYPES } from './musicSources.js'
import { loginNetEase, loginNetEasePhone, sendSmsCode, verifySmsCode, fetchUserPlaylists, fetchPresetPlaylists, scrobbleSong } from './neteaseSource.js'

const PLAY_MODES = ['loop', 'sequential', 'shuffle']
const PLAY_MODE_ICONS = { loop: '↻', sequential: '→', shuffle: '⇄' }

const getTrackIndex = (tracks, trackId) => {
  const index = tracks.findIndex((track) => track.id === trackId)
  return index >= 0 ? index : 0
}

// Shared audio ref — survives panel mount/unmount
let globalAudio = null
// Track ID currently loaded in the audio element — survives panel mount/unmount
let lastSetTrackId = null
// Module-level callback for auto-advance — survives panel mount/unmount
let onTrackEnded = null

function getGlobalAudio() {
  if (!globalAudio) {
    globalAudio = new Audio()
    globalAudio.preload = 'auto'
    globalAudio.addEventListener('ended', () => {
      onTrackEnded?.()
    })
  }
  return globalAudio
}

export function useAmbientMusicController() {
  const { preferences } = useStudyRoomState()
  const { setPreference } = useStudyRoomActions()
  const { t } = useStudyRoomLocale()
  const nextTrackRef = useRef(null)
  const wasPlayingRef = useRef(false)
  const [playbackState, setPlaybackState] = useState(getGlobalAudio().paused ? 'idle' : 'playing')
  const [playbackError, setPlaybackError] = useState('')
  const [tracks, setTracks] = useState([])
  const [playlistName, setPlaylistName] = useState('')
  const [loading, setLoading] = useState(false)
  const [neteaseUser, setNeteaseUser] = useState(null)
  const [userPlaylists, setUserPlaylists] = useState([])
  const [loginError, setLoginError] = useState('')
  const [presets, setPresets] = useState([])
  const [currentPlaylistId, setCurrentPlaylistId] = useState(() => {
    try { return localStorage.getItem('selectedPlaylistId') || '' } catch { return '' }
  })
  const [currentPlaylistType, setCurrentPlaylistType] = useState(() => {
    try { return localStorage.getItem('selectedPlaylistType') || 'playlist' } catch { return 'playlist' }
  })
  // Scrobble tracking
  const scrobbledRef = useRef(new Set())
  const playStartRef = useRef(null)
  const accumulatedRef = useRef(0)
  const currentPlaylistIdRef = useRef(currentPlaylistId)
  useEffect(() => { currentPlaylistIdRef.current = currentPlaylistId }, [currentPlaylistId])
  const sourceType = MUSIC_SOURCE_TYPES.netease
  const trackSource = getAmbientTrackSource(sourceType)
  const audio = getGlobalAudio()

  const selectedTrackIndex = getTrackIndex(tracks, preferences.selectedTrackId)
  const currentTrack = tracks[selectedTrackIndex] || { id: '', title: '', src: '' }

  // Load presets and initial playlist on mount
  useEffect(() => {
    setLoading(true)
    fetchPresetPlaylists().then(({ presets: p }) => {
      setPresets(p || [])
    }).catch(() => {})

    const savedPlaylistId = currentPlaylistId
    const savedPlaylistType = currentPlaylistType
    trackSource.loadPlaylist(savedPlaylistId || undefined, savedPlaylistType).then(({ tracks: newTracks, name, id }) => {
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

  // Track user play intent — audio.paused is unreliable after track ends
  useEffect(() => {
    wasPlayingRef.current = playbackState === 'playing'
  }, [playbackState])

  // Scrobble previous track on track change (must run before play time tracking)
  useEffect(() => {
    if (!lastSetTrackId || lastSetTrackId === currentTrack.id) return
    if (playStartRef.current) {
      accumulatedRef.current += (Date.now() - playStartRef.current) / 1000
      playStartRef.current = null
    }
    if (accumulatedRef.current >= 30 && neteaseUser && !scrobbledRef.current.has(lastSetTrackId)) {
      scrobbledRef.current.add(lastSetTrackId)
      scrobbleSong(lastSetTrackId, currentPlaylistIdRef.current, accumulatedRef.current)
    }
    accumulatedRef.current = 0
  }, [currentTrack.id, neteaseUser])

  // Track play time for scrobble
  useEffect(() => {
    if (playbackState === 'playing') {
      if (!playStartRef.current) {
        playStartRef.current = Date.now()
      }
    } else {
      if (playStartRef.current) {
        accumulatedRef.current += (Date.now() - playStartRef.current) / 1000
        playStartRef.current = null
      }
      // Scrobble if threshold met and not yet scrobbled
      if (accumulatedRef.current >= 30 && neteaseUser && !scrobbledRef.current.has(currentTrack.id)) {
        scrobbledRef.current.add(currentTrack.id)
        scrobbleSong(currentTrack.id, currentPlaylistIdRef.current, accumulatedRef.current)
      }
    }
  }, [playbackState, neteaseUser, currentTrack.id])

  // Fetch song URL when track changes
  useEffect(() => {
    if (sourceType !== MUSIC_SOURCE_TYPES.netease) return
    if (!currentTrack.id) return
    let cancelled = false
    trackSource.getTrackUrl(currentTrack.id).then((url) => {
      if (cancelled) return
      if (url) {
        setTracks((prev) =>
          prev.map((t) => (t.id === currentTrack.id ? { ...t, src: url } : t)),
        )
      } else {
        // URL fetch failed — skip to next track if we were playing
        if (wasPlayingRef.current && tracks.length > 1) {
          nextTrackRef.current?.()
        }
      }
    })
    return () => { cancelled = true }
  }, [currentTrack.id, sourceType])

  // Sync volume
  useEffect(() => {
    audio.volume = preferences.volume
  }, [preferences.volume])

  // Switch track — skip if audio already has this track loaded
  useEffect(() => {
    if (!currentTrack.src) return
    if (lastSetTrackId === currentTrack.id) {
      const ended = audio.paused && audio.currentTime >= (audio.duration || Infinity) - 0.5
      if (ended && wasPlayingRef.current) {
        // Track ended (e.g. single-track playlist loop) — restart
        audio.currentTime = 0
        void audio.play().catch(() => {})
      }
      setPlaybackState(audio.paused ? 'paused' : 'playing')
      return
    }
    const shouldPlay = wasPlayingRef.current
    audio.pause()
    audio.src = currentTrack.src
    audio.load()
    lastSetTrackId = currentTrack.id
    if (shouldPlay) {
      void audio.play().catch(() => {
        setPlaybackState('paused')
      })
    }
  }, [currentTrack.id, currentTrack.src])

  useEffect(() => {
    if (preferences.soundEnabled) return
    audio.pause()
    setPlaybackState('paused')
  }, [preferences.soundEnabled])

  const play = useCallback(async () => {
    if (!preferences.soundEnabled) {
      setPlaybackError(t('studyRoom.music.errors.enableSound', {}, 'Enable sound'))
      return
    }
    try {
      await audio.play()
      setPlaybackState('playing')
      setPlaybackError('')
    } catch {
      setPlaybackState('paused')
      setPlaybackError(t('studyRoom.music.errors.blocked', {}, 'Playback blocked'))
    }
  }, [preferences.soundEnabled, t])

  const pause = useCallback(() => {
    audio.pause()
    setPlaybackState('paused')
  }, [])

  const selectTrack = useCallback((trackId) => {
    setPreference('selectedTrackId', trackId)
    setPlaybackError('')
  }, [setPreference])

  const goToTrack = useCallback((direction) => {
    const nextIndex = (selectedTrackIndex + direction + tracks.length) % tracks.length
    selectTrack(tracks[nextIndex]?.id)
  }, [selectedTrackIndex, tracks, selectTrack])

  // Store nextTrack function in ref so ended listener always has latest.
  // Handles audio switching directly so auto-advance works even when panel is unmounted.
  nextTrackRef.current = () => {
    const mode = preferences.playMode
    let nextIndex
    if (mode === 'shuffle' && tracks.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * tracks.length)
      } while (nextIndex === selectedTrackIndex)
    } else if (mode === 'sequential' && selectedTrackIndex >= tracks.length - 1) {
      pause()
      return
    } else {
      nextIndex = (selectedTrackIndex + 1) % tracks.length
    }
    const nextTrack = tracks[nextIndex]
    if (!nextTrack) return
    selectTrack(nextTrack.id)

    // Directly switch audio element — works even when panel/component is unmounted
    const switchAudio = (url) => {
      audio.pause()
      audio.src = url
      audio.load()
      lastSetTrackId = nextTrack.id
      void audio.play().catch(() => {})
    }
    if (nextTrack.src) {
      switchAudio(nextTrack.src)
    } else {
      trackSource.getTrackUrl(nextTrack.id).then((url) => {
        if (url) switchAudio(url)
      })
    }
  }

  // Auto-advance to next track when current ends (module-level so it survives panel unmount)
  useEffect(() => {
    onTrackEnded = () => { nextTrackRef.current?.() }
  }, [])

  const doNetEaseLogin = useCallback(async (account, password) => {
    setLoginError('')
    try {
      // Auto-detect: if account looks like a phone number (11 digits), use phone login
      const isPhone = /^\d{11}$/.test(account)
      const result = isPhone
        ? await loginNetEasePhone(account, password)
        : await loginNetEase(account, password)
      if (result.ok) {
        setNeteaseUser(result.profile)
        localStorage.setItem('netease_user', JSON.stringify(result.profile))
        const pl = await fetchUserPlaylists()
        setUserPlaylists(pl.playlists || [])
      } else {
        setLoginError(result.message || 'Login failed')
      }
    } catch (e) {
      setLoginError(e.message)
    }
  }, [])

  const doSendSms = useCallback(async (phone) => {
    setLoginError('')
    try {
      const result = await sendSmsCode(phone)
      if (!result.ok) setLoginError(result.message || 'Failed to send SMS')
      return result.ok
    } catch (e) {
      setLoginError(e.message)
      return false
    }
  }, [])

  const doSmsLogin = useCallback(async (phone, code) => {
    setLoginError('')
    try {
      const result = await verifySmsCode(phone, code)
      if (result.ok) {
        setNeteaseUser(result.profile)
        localStorage.setItem('netease_user', JSON.stringify(result.profile))
        const pl = await fetchUserPlaylists()
        setUserPlaylists(pl.playlists || [])
      } else {
        setLoginError(result.message || 'Verification failed')
      }
    } catch (e) {
      setLoginError(e.message)
    }
  }, [])

  const doNetEaseLogout = useCallback(() => {
    setNeteaseUser(null)
    setUserPlaylists([])
    localStorage.removeItem('netease_user')
  }, [])

  const cyclePlayMode = useCallback(() => {
    const nextIndex = (PLAY_MODES.indexOf(preferences.playMode) + 1) % PLAY_MODES.length
    setPreference('playMode', PLAY_MODES[nextIndex])
  }, [preferences.playMode, setPreference])

  const switchToPlaylist = useCallback(async (playlistId, type = 'playlist') => {
    setLoading(true)
    try {
      const base = import.meta.env.DEV ? 'http://localhost:3001' : ''
      const url = type === 'album'
        ? `${base}/music/playlist/${playlistId}?type=album`
        : `${base}/music/playlist/${playlistId}`
      const res = await fetch(url)
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
        setCurrentPlaylistType(type)
        try {
          localStorage.setItem('selectedPlaylistId', playlistId)
          localStorage.setItem('selectedPlaylistType', type)
        } catch {}
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

  const loadCustomPlaylist = useCallback(async (input) => {
    const match = input.match(/(\d{5,})/)
    if (!match) {
      setLoginError('Invalid playlist ID or URL')
      return
    }
    await switchToPlaylist(match[1])
  }, [switchToPlaylist])

  // Restore login state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('netease_user')
      if (saved) {
        const profile = JSON.parse(saved)
        setNeteaseUser(profile)
        fetchUserPlaylists().then((pl) => setUserPlaylists(pl.playlists || []))
      }
    } catch {}
  }, [])

  return {
    musicSourceType: sourceType,
    musicSourceLabel: sourceType === MUSIC_SOURCE_TYPES.netease
      ? playlistName || t('studyRoom.music.source.neteaseLabel', {}, 'NetEase Cloud')
      : t('studyRoom.music.source.localLabel', {}, 'Local Library'),
    playlistName,
    tracks,
    currentTrack,
    playbackState,
    playbackError,
    loading,
    volume: preferences.volume,
    soundEnabled: preferences.soundEnabled,
    play,
    pause,
    togglePlayback() {
      if (playbackState === 'playing') pause()
      else void play()
    },
    selectTrack,
    nextTrack() { goToTrack(1) },
    previousTrack() { goToTrack(-1) },
    setVolume(value) { setPreference('volume', value) },
    playMode: preferences.playMode,
    playModeIcon: PLAY_MODE_ICONS[preferences.playMode],
    cyclePlayMode,
    // NetEase login
    neteaseUser,
    userPlaylists,
    loginError,
    doNetEaseLogin,
    doNetEaseLogout,
    doSendSms,
    doSmsLogin,
    switchToPlaylist,
    presets,
    currentPlaylistId,
    loadCustomPlaylist,
  }
}
