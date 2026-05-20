const DB_NAME = 'study-app-backgrounds'
const DB_VERSION = 1
const STORE_NAME = 'backgrounds'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function extractVideoThumbnail(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadeddata = () => {
      video.currentTime = 1
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0)
      canvas.toBlob((thumbBlob) => {
        URL.revokeObjectURL(url)
        resolve(thumbBlob)
      }, 'image/jpeg', 0.7)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    video.src = url
  })
}

function generateId() {
  return `bg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const VALIDATORS = {
  image: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'], maxSize: 5 * 1024 * 1024 },
  video: { mimeTypes: ['video/mp4', 'video/webm'], maxSize: 50 * 1024 * 1024 },
}

export function validateFile(file) {
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  if (!isImage && !isVideo) return { ok: false, error: 'Unsupported file type' }
  const category = isImage ? 'image' : 'video'
  const { mimeTypes, maxSize } = VALIDATORS[category]
  if (!mimeTypes.includes(file.type)) return { ok: false, error: `Unsupported ${category} format: ${file.type}` }
  if (file.size > maxSize) return { ok: false, error: `File too large. Max ${category} size: ${maxSize / 1024 / 1024}MB` }
  return { ok: true, category }
}

export async function saveBackground(file) {
  const validation = validateFile(file)
  if (!validation.ok) throw new Error(validation.error)
  const { category } = validation
  const id = generateId()
  const name = file.name.replace(/\.[^/.]+$/, '')
  const blob = file
  const thumbnail = category === 'video' ? await extractVideoThumbnail(blob) : null
  const record = {
    id,
    name,
    type: category,
    mimeType: file.type,
    blob,
    thumbnail,
    serverId: null,
    createdAt: Date.now(),
  }
  const db = await openDB()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    return record
  } finally {
    db.close()
  }
}

export async function listBackgrounds() {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    const results = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return results.map(({ blob, ...meta }) => meta)
  } finally {
    db.close()
  }
}

export async function getBackgroundBlob(id) {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(id)
    const record = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return record?.blob ?? null
  } finally {
    db.close()
  }
}

export async function deleteBackground(id) {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function updateServerId(localId, serverId) {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(localId)
    const record = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (record) {
      record.serverId = serverId
      store.put(record)
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
