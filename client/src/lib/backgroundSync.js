import { listBackgrounds, getBackgroundBlob, saveBackground, deleteBackground, updateServerId } from './backgroundStorage.js'

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

export async function syncBackgrounds() {
  try {
    const res = await fetch(`${API_BASE}/backgrounds`, { credentials: 'include' })
    if (!res.ok) return
    const { backgrounds: serverBgs } = await res.json()
    const localBgs = await listBackgrounds()

    const localByServerId = new Map(localBgs.filter((b) => b.serverId).map((b) => [b.serverId, b]))
    const serverById = new Map(serverBgs.map((b) => [b.id, b]))

    // Download server backgrounds missing locally
    for (const serverBg of serverBgs) {
      if (localByServerId.has(serverBg.id)) continue
      const fileRes = await fetch(`${API_BASE}/backgrounds/${serverBg.id}/file`, { credentials: 'include' })
      if (!fileRes.ok) continue
      const blob = await fileRes.blob()
      const file = new File([blob], serverBg.fileName, { type: serverBg.mimeType })
      const localRecord = await saveBackground(file)
      await updateServerId(localRecord.id, serverBg.id)
    }

    // Upload local backgrounds missing on server
    for (const localBg of localBgs) {
      if (localBg.serverId) continue
      const blob = await getBackgroundBlob(localBg.id)
      if (!blob) continue
      const formData = new FormData()
      formData.append('file', new File([blob], localBg.name, { type: localBg.mimeType }))
      try {
        const uploadRes = await fetch(`${API_BASE}/backgrounds`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
        if (uploadRes.ok) {
          const { background } = await uploadRes.json()
          await updateServerId(localBg.id, background.id)
        }
      } catch { /* retry next time */ }
    }

    // Delete local backgrounds removed from server
    for (const localBg of localBgs) {
      if (!localBg.serverId) continue
      if (!serverById.has(localBg.serverId)) {
        await deleteBackground(localBg.id)
      }
    }
  } catch {
    // Sync is best-effort
  }
}

export async function uploadToServer(localId, fileName, mimeType) {
  const blob = await getBackgroundBlob(localId)
  if (!blob) return null
  const formData = new FormData()
  formData.append('file', new File([blob], fileName, { type: mimeType }))
  const res = await fetch(`${API_BASE}/backgrounds`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) return null
  const { background } = await res.json()
  await updateServerId(localId, background.id)
  return background
}

export async function deleteFromServer(serverId) {
  await fetch(`${API_BASE}/backgrounds/${serverId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
}
