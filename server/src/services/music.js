import { createRequire } from 'node:module'
import { DEFAULT_PLAYLIST_ID } from '../config/playlists.js'

const require = createRequire(import.meta.url)

let neteaseApi = null
let userCookies = null

function getNeteaseApi() {
  if (!neteaseApi) {
    neteaseApi = require('NeteaseCloudMusicApi')
  }
  return neteaseApi
}

export async function getPlaylistDetail(id) {
  const api = getNeteaseApi()
  const playlistId = id || DEFAULT_PLAYLIST_ID

  try {
    const result = await api.playlist_detail({
      id: playlistId,
      cookie: userCookies || '',
    })

    if (result.body.code !== 200) {
      throw new Error(result.body.message || `Failed to fetch playlist ${playlistId}`)
    }

    const playlist = result.body.playlist
    return {
      id: playlist.id,
      name: playlist.name,
      coverImgUrl: playlist.coverImgUrl,
      description: playlist.description,
      trackCount: playlist.trackCount,
      tracks: (playlist.tracks || []).map(formatTrack),
    }
  } catch (err) {
    console.error('[music] getPlaylistDetail error:', err.message)
    throw err
  }
}

export async function getAlbumDetail(id) {
  const api = getNeteaseApi()

  try {
    const result = await api.album({
      id,
      cookie: userCookies || '',
    })

    if (result.body.code !== 200) {
      throw new Error(result.body.message || `Failed to fetch album ${id}`)
    }

    const album = result.body.album
    const songs = result.body.songs || []
    return {
      id: album.id,
      name: album.name,
      coverImgUrl: album.picUrl,
      description: album.description || '',
      trackCount: album.size || songs.length,
      tracks: songs.map(formatTrack),
    }
  } catch (err) {
    console.error('[music] getAlbumDetail error:', err.message)
    throw err
  }
}

export async function scrobbleSong(id, sourceId, time) {
  const api = getNeteaseApi()

  if (!userCookies) {
    return { ok: false, message: 'Not logged in' }
  }

  try {
    const result = await api.scrobble({
      id,
      sourceid: sourceId || '',
      time: Math.round(time),
      cookie: userCookies,
    })

    return { ok: result.body.code === 200 }
  } catch (err) {
    console.error('[music] scrobble error:', err.message)
    return { ok: false, message: err.message }
  }
}

export async function getSongUrl(id) {
  const api = getNeteaseApi()

  try {
    const result = await api.song_url_v1({
      id,
      level: 'standard',
      cookie: userCookies || '',
    })

    if (result.body.code !== 200) {
      throw new Error(result.body.message || `Failed to fetch song URL for ${id}`)
    }

    const songData = result.body.data[0]
    if (!songData || !songData.url) {
      return null
    }

    return {
      id: songData.id,
      url: songData.url,
      type: songData.type,
      size: songData.size,
      time: songData.time,
    }
  } catch (err) {
    console.error('[music] getSongUrl error:', err.message)
    throw err
  }
}

export async function loginEmail(email, password) {
  const api = getNeteaseApi()
  try {
    const result = await api.login({ email, password })
    if (result.body.code !== 200) {
      return { ok: false, message: result.body.message || 'Login failed' }
    }
    userCookies = result.body.cookie || ''
    return {
      ok: true,
      profile: {
        userId: result.body.account?.id,
        nickname: result.body.profile?.nickname,
        avatarUrl: result.body.profile?.avatarUrl,
      },
    }
  } catch (err) {
    console.error('[music] login error:', err.message)
    throw err
  }
}

export async function sendCaptcha(phone) {
  const api = getNeteaseApi()
  try {
    const result = await api.captcha_sent({ phone })
    if (result.body.code !== 200) {
      return { ok: false, message: result.body.message || 'Failed to send SMS' }
    }
    return { ok: true, message: 'SMS sent' }
  } catch (err) {
    console.error('[music] captcha send error:', err.message)
    throw err
  }
}

export async function verifyCaptcha(phone, code) {
  const api = getNeteaseApi()
  try {
    const result = await api.captcha_verify({ phone, captcha: code })
    if (result.body.code !== 200) {
      return { ok: false, message: result.body.message || 'Verification failed' }
    }
    // After captcha verification, login without password
    const loginResult = await api.login_cellphone({ phone, captcha: code })
    if (loginResult.body.code !== 200) {
      return { ok: false, message: loginResult.body.message || 'Login failed after verification' }
    }
    userCookies = loginResult.body.cookie || ''
    return {
      ok: true,
      profile: {
        userId: loginResult.body.account?.id,
        nickname: loginResult.body.profile?.nickname,
        avatarUrl: loginResult.body.profile?.avatarUrl,
      },
    }
  } catch (err) {
    console.error('[music] captcha verify error:', err.message)
    throw err
  }
}

export async function loginPhone(phone, password) {
  const api = getNeteaseApi()
  try {
    const result = await api.login_cellphone({ phone, password })
    if (result.body.code !== 200) {
      return { ok: false, message: result.body.message || 'Login failed' }
    }
    userCookies = result.body.cookie || ''
    return {
      ok: true,
      profile: {
        userId: result.body.account?.id,
        nickname: result.body.profile?.nickname,
        avatarUrl: result.body.profile?.avatarUrl,
      },
    }
  } catch (err) {
    console.error('[music] login error:', err.message)
    throw err
  }
}

export async function login(email, password) {
  const api = getNeteaseApi()

  try {
    const result = await api.login({
      email,
      password,
    })

    if (result.body.code !== 200) {
      return { ok: false, message: result.body.message || 'Login failed' }
    }

    // Store cookies for subsequent API calls
    userCookies = result.body.cookie || ''

    return {
      ok: true,
      profile: {
        userId: result.body.account?.id,
        nickname: result.body.profile?.nickname,
        avatarUrl: result.body.profile?.avatarUrl,
      },
    }
  } catch (err) {
    console.error('[music] login error:', err.message)
    throw err
  }
}

export async function getUserPlaylists() {
  const api = getNeteaseApi()

  if (!userCookies) {
    return { playlists: [] }
  }

  try {
    const result = await api.user_playlist({
      uid: '', // will be inferred from cookie
      cookie: userCookies,
    })

    if (result.body.code !== 200) {
      return { playlists: [] }
    }

    return {
      playlists: (result.body.playlist || []).map((p) => ({
        id: p.id,
        name: p.name,
        trackCount: p.trackCount,
        coverImgUrl: p.coverImgUrl,
      })),
    }
  } catch (err) {
    console.error('[music] getUserPlaylists error:', err.message)
    return { playlists: [] }
  }
}

function formatTrack(track) {
  return {
    id: track.id,
    name: track.name,
    artists: (track.ar || []).map((a) => ({ id: a.id, name: a.name })),
    album: track.al ? { id: track.al.id, name: track.al.name, picUrl: track.al.picUrl } : null,
    duration: track.dt,
  }
}
