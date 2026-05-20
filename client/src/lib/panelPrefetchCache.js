const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const cache = new Map()
const inFlight = new Map()

export function setCacheEntry(panelId, data) {
  cache.set(panelId, { data, timestamp: Date.now() })
}

export function getCachedData(panelId) {
  const entry = cache.get(panelId)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(panelId)
    return null
  }
  return entry.data
}

export function isPanelCached(panelId) {
  return getCachedData(panelId) !== null
}

export function getInFlight(panelId) {
  return inFlight.get(panelId) ?? null
}

export function setInFlight(panelId, promise) {
  inFlight.set(panelId, promise)
  promise.finally(() => {
    inFlight.delete(panelId)
  })
}

export function invalidateCache(panelId) {
  cache.delete(panelId)
}
