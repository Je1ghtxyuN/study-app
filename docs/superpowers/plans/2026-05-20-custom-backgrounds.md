# Custom Backgrounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload custom images/videos as study room backgrounds, stored in IndexedDB locally and synced to server for logged-in users.

**Architecture:** Client stores backgrounds in IndexedDB for instant playback. Logged-in users sync to server via REST API (files on disk, metadata in Prisma). Custom scenes integrate into existing scene selector in SettingsPanelContent.

**Tech Stack:** IndexedDB (client), Hono + Prisma + disk storage (server), existing BackgroundLayer/studyScene system.

---

## File Map

| File | Role |
|------|------|
| `client/src/lib/backgroundStorage.js` | IndexedDB CRUD for backgrounds |
| `client/src/lib/backgroundSync.js` | Client-server sync logic |
| `server/prisma/schema.prisma` | Add `UserBackground` model |
| `server/src/routes/backgrounds.js` | REST API for background CRUD + file serve |
| `server/src/app.js` | Mount `/backgrounds` routes |
| `infra/nginx/default.conf` | Proxy `/backgrounds/` to backend |
| `client/src/lib/studyScene.js` | Add `getCustomSceneDefinition()`, export default atmosphere |
| `client/src/app/AppShell.jsx` | Support `custom:` prefix scene loading |
| `client/src/components/BackgroundLayer.jsx` | Support image media type + Object URL lifecycle |
| `client/src/app/panels/SettingsPanelContent.jsx` | Add custom backgrounds + upload to scene selector |

---

### Task 1: IndexedDB Storage Layer

**Files:**
- Create: `client/src/lib/backgroundStorage.js`

- [ ] **Step 1: Create backgroundStorage.js with full IndexedDB implementation**

```js
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
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(record)
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
  return record
}

export async function listBackgrounds() {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const request = store.getAll()
  const results = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return results.map(({ blob, ...meta }) => meta)
}

export async function getBackgroundBlob(id) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const request = tx.objectStore(STORE_NAME).get(id)
  const record = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return record?.blob ?? null
}

export async function deleteBackground(id) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).delete(id)
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function updateServerId(localId, serverId) {
  const db = await openDB()
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
  db.close()
}
```

- [ ] **Step 2: Verify the module imports cleanly**

Run: `cd client && node -e "import('./src/lib/backgroundStorage.js').then(() => console.log('OK'))"` (will fail in browser context but verifies syntax)

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/backgroundStorage.js
git commit -m "feat: add IndexedDB storage layer for custom backgrounds"
```

---

### Task 2: Server — Prisma Schema + Migration

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add UserBackground model to schema.prisma**

Append to the end of `server/prisma/schema.prisma`:

```prisma
model UserBackground {
  id            String   @id @default(cuid())
  userId        String
  fileName      String
  fileType      String
  mimeType      String
  fileSize      Int
  filePath      String
  thumbnailPath String?
  createdAt     DateTime @default(now())

  user StudyUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

- [ ] **Step 2: Add relation to StudyUser model**

In the `StudyUser` model, add:

```prisma
  backgrounds UserBackground[]
```

- [ ] **Step 3: Generate Prisma client**

Run: `cd server && npm run prisma:generate`

Expected: `Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat: add UserBackground model to Prisma schema"
```

---

### Task 3: Server — Background API Routes

**Files:**
- Create: `server/src/routes/backgrounds.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: Create backgrounds.js route file**

```js
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { prisma } from '../db/client.js'
import { writeFile, mkdir, unlink, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads'

const backgrounds = new Hono()

// All routes require auth
backgrounds.use('*', requireAuth())

// List user's backgrounds
backgrounds.get('/', async (c) => {
  const user = c.get('user')
  const items = await prisma.userBackground.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fileName: true, fileType: true, mimeType: true, fileSize: true, createdAt: true },
  })
  return c.json({ backgrounds: items })
})

// Upload a background
backgrounds.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.parseBody({ all: true })
  const file = body['file']
  if (!file || typeof file === 'string') {
    return c.json({ error: 'File is required (field name: file)' }, 400)
  }

  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  if (!isImage && !isVideo) return c.json({ error: 'Only image/video files allowed' }, 400)

  const validators = {
    image: { types: ['image/jpeg', 'image/png', 'image/webp'], maxSize: 5 * 1024 * 1024 },
    video: { types: ['video/mp4', 'video/webm'], maxSize: 50 * 1024 * 1024 },
  }
  const category = isImage ? 'image' : 'video'
  const { types, maxSize } = validators[category]
  if (!types.includes(file.type)) return c.json({ error: `Unsupported format: ${file.type}` }, 400)
  if (file.size > maxSize) return c.json({ error: `File too large. Max: ${maxSize / 1024 / 1024}MB` }, 400)

  const id = crypto.randomUUID()
  const ext = extname(file.name) || (file.type === 'image/jpeg' ? '.jpg' : `.${file.type.split('/')[1]}`)
  const userDir = join(UPLOADS_DIR, user.id)
  await mkdir(userDir, { recursive: true })
  const filePath = join(userDir, `${id}${ext}`)
  const arrayBuffer = await file.arrayBuffer()
  await writeFile(filePath, Buffer.from(arrayBuffer))

  const record = await prisma.userBackground.create({
    data: {
      id,
      userId: user.id,
      fileName: file.name,
      fileType: category,
      mimeType: file.type,
      fileSize: file.size,
      filePath: `${user.id}/${id}${ext}`,
    },
  })

  return c.json({ background: { id: record.id, fileName: record.fileName, fileType: record.fileType, mimeType: record.mimeType, fileSize: record.fileSize, createdAt: record.createdAt } }, 201)
})

// Delete a background
backgrounds.delete('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const record = await prisma.userBackground.findFirst({ where: { id, userId: user.id } })
  if (!record) return c.json({ error: 'Not found' }, 404)

  // Delete file from disk (best-effort)
  const fullPath = join(UPLOADS_DIR, record.filePath)
  await unlink(fullPath).catch(() => {})
  if (record.thumbnailPath) {
    await unlink(join(UPLOADS_DIR, record.thumbnailPath)).catch(() => {})
  }

  await prisma.userBackground.delete({ where: { id } })
  return c.json({ ok: true })
})

// Serve background file
backgrounds.get('/:id/file', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const record = await prisma.userBackground.findFirst({ where: { id, userId: user.id } })
  if (!record) return c.json({ error: 'Not found' }, 404)

  const fullPath = join(UPLOADS_DIR, record.filePath)
  const data = await readFile(fullPath)
  return new Response(data, {
    headers: {
      'Content-Type': record.mimeType,
      'Cache-Control': 'private, max-age=86400',
    },
  })
})

export { backgrounds }
```

- [ ] **Step 2: Mount routes in app.js**

In `server/src/app.js`, add import:
```js
import { backgrounds } from './routes/backgrounds.js'
```

Add route (after the `todos` route):
```js
  app.route('/backgrounds', backgrounds)
```

- [ ] **Step 3: Add nginx proxy for /backgrounds/**

In `infra/nginx/default.conf`, add before the `location /health` block:

```nginx
    location /backgrounds/ {
        proxy_pass http://study-backend:3002/backgrounds/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/backgrounds.js server/src/app.js infra/nginx/default.conf
git commit -m "feat: add background upload/list/delete/serve API routes"
```

---

### Task 4: Client — Custom Scene Definition

**Files:**
- Modify: `client/src/lib/studyScene.js`

- [ ] **Step 1: Add DEFAULT_CUSTOM_ATMOSPHERE and getCustomSceneDefinition**

At the top of `client/src/lib/studyScene.js`, after the imports and before `DEFAULT_MEDIA_BEHAVIOR`, add:

```js
const DEFAULT_CUSTOM_ATMOSPHERE = Object.freeze({
  work: Object.freeze({
    overlayShift: Object.freeze({ idle: 0.04, focus: 0.08 }),
    highlightOpacity: 0.08,
    glowOpacity: 0.66,
    glowScale: 1.03,
    glowDriftY: '-1.2%',
    vignetteOpacity: 0.8,
    mediaBrightness: 0.72,
    mediaSaturation: 1.0,
    mediaContrast: 1.04,
    motionDurationScale: 1.0,
    overlayDriftY: '-0.5%',
    grainDriftX: '-1.1%',
    grainDriftY: '0.65%',
  }),
  shortBreak: Object.freeze({
    overlayShift: Object.freeze({ idle: -0.03, focus: -0.06 }),
    highlightOpacity: 0.12,
    glowOpacity: 0.76,
    glowScale: 1.06,
    glowDriftY: '-1.5%',
    vignetteOpacity: 0.66,
    mediaBrightness: 0.8,
    mediaSaturation: 1.04,
    mediaContrast: 1.02,
    motionDurationScale: 1.06,
    overlayDriftY: '-0.38%',
    grainDriftX: '-0.9%',
    grainDriftY: '0.55%',
  }),
  longBreak: Object.freeze({
    overlayShift: Object.freeze({ idle: -0.06, focus: -0.1 }),
    highlightOpacity: 0.15,
    glowOpacity: 0.82,
    glowScale: 1.08,
    glowDriftY: '-1.7%',
    vignetteOpacity: 0.6,
    mediaBrightness: 0.84,
    mediaSaturation: 1.06,
    mediaContrast: 1.0,
    motionDurationScale: 1.15,
    overlayDriftY: '-0.3%',
    grainDriftX: '-0.7%',
    grainDriftY: '0.45%',
  }),
})
```

At the end of the file (after `resolveStudyScenePresentation`), add:

```js
export function getCustomSceneDefinition(id, { name, type, objectUrl }) {
  return createSceneDefinition({
    id,
    localeKey: null,
    name: name || 'Custom Background',
    label: name || 'Custom Background',
    description: 'User-uploaded custom background',
    media: {
      type,
      src: objectUrl,
      poster: type === 'image' ? objectUrl : '',
    },
    backgroundPosition: 'center center',
    backgroundScale: 1.0,
    idleOverlayStrength: 0.3,
    focusOverlayStrength: 0.5,
    ambientGlow: 'rgba(120, 140, 180, 0.15)',
    accentGlow: 'rgba(180, 160, 120, 0.1)',
    vignetteColor: 'rgba(0, 0, 0, 0.6)',
    reactiveAtmosphere: {
      work: DEFAULT_CUSTOM_ATMOSPHERE.work,
      shortBreak: DEFAULT_CUSTOM_ATMOSPHERE.shortBreak,
      longBreak: DEFAULT_CUSTOM_ATMOSPHERE.longBreak,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/studyScene.js
git commit -m "feat: add getCustomSceneDefinition for user-uploaded backgrounds"
```

---

### Task 5: Client — AppShell Custom Scene Support

**Files:**
- Modify: `client/src/app/AppShell.jsx`

- [ ] **Step 1: Update AppShell to load custom scenes**

Replace the contents of `client/src/app/AppShell.jsx` with:

```jsx
import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { SessionTransitionCue } from './SessionTransitionCue.jsx'
import { GitHubCallback } from './GitHubCallback.jsx'
import { BackgroundLayer } from '../components/BackgroundLayer.jsx'
import {
  getStudyScene,
  getCustomSceneDefinition,
  resolveStudyScenePresentation,
} from '../lib/studyScene.js'
import { useStudyRoomState } from '../state/useStudyRoom.js'
import { getBackgroundBlob } from '../lib/backgroundStorage.js'

export function AppShell() {
  const { preferences, timer, ui } = useStudyRoomState()
  const displayMode = ui.mode === 'panel' ? ui.previousMode : ui.mode
  const [customScene, setCustomScene] = useState(null)
  const [objectUrl, setObjectUrl] = useState(null)

  useEffect(() => {
    const sceneId = preferences.selectedSceneId
    if (!sceneId?.startsWith('custom:')) {
      setCustomScene(null)
      if (objectUrl) { URL.revokeObjectURL(objectUrl); setObjectUrl(null) }
      return
    }

    const localId = sceneId.replace('custom:', '')
    let cancelled = false
    let currentUrl = null

    getBackgroundBlob(localId).then((blob) => {
      if (cancelled || !blob) return
      currentUrl = URL.createObjectURL(blob)
      setObjectUrl(currentUrl)
      const isVideo = blob.type.startsWith('video/')
      setCustomScene(getCustomSceneDefinition(sceneId, {
        name: localId,
        type: isVideo ? 'video' : 'image',
        objectUrl: currentUrl,
      }))
    })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [preferences.selectedSceneId])

  const activeScene = customScene || getStudyScene(preferences.selectedSceneId)
  const scenePresentation = resolveStudyScenePresentation(activeScene, {
    sessionType: timer.sessionType,
    uiMode: displayMode,
  })

  const appClassName = [
    'study-app',
    `study-app--display-${displayMode}`,
    `study-app--session-${timer.sessionType}`,
    ui.mode === 'panel' ? 'study-app--panel-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={appClassName}>
      <GitHubCallback />
      <BackgroundLayer scene={activeScene} presentation={scenePresentation} />
      <div className="study-app__surface">
        <SessionTransitionCue />
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/app/AppShell.jsx
git commit -m "feat: support custom: prefix scenes in AppShell"
```

---

### Task 6: Client — BackgroundLayer Image Support

**Files:**
- Modify: `client/src/components/BackgroundLayer.jsx`

- [ ] **Step 1: Add BackgroundImage component and update BackgroundLayer**

Replace the contents of `client/src/components/BackgroundLayer.jsx` with:

```jsx
import { useEffect, useRef } from 'react'
import {
  getStudyScene,
  resolveStudyScenePresentation,
} from '../lib/studyScene.js'

function BackgroundVideo({ scene }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlaying = () => video.classList.add('background-layer__video--visible')
    video.addEventListener('playing', handlePlaying, { once: true })

    return () => video.removeEventListener('playing', handlePlaying)
  }, [scene.mediaSrc])

  return (
    <video
      ref={videoRef}
      className="background-layer__video"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster={scene.posterImage || scene.backgroundImage}
    >
      <source src={scene.mediaSrc} type={scene.videoType || 'video/mp4'} />
    </video>
  )
}

function BackgroundImage({ scene }) {
  const imgRef = useRef(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    const handleLoad = () => img.classList.add('background-layer__image-el--visible')
    img.addEventListener('load', handleLoad, { once: true })

    return () => img.removeEventListener('load', handleLoad)
  }, [scene.mediaSrc])

  return (
    <img
      ref={imgRef}
      className="background-layer__image-el"
      src={scene.mediaSrc}
      alt=""
      draggable={false}
    />
  )
}

export function BackgroundLayer({ scene, presentation }) {
  const activeScene = scene ?? getStudyScene()
  const activePresentation =
    presentation ?? resolveStudyScenePresentation(activeScene)
  const sceneStyle = {
    '--study-background-image': `url(${activeScene.posterImage || activeScene.backgroundImage || ''})`,
    '--study-background-overlay-strength': `${activePresentation.overlayStrength ?? activeScene.idleOverlayStrength ?? 0.42}`,
    '--study-background-highlight-opacity': `${activePresentation.highlightOpacity ?? 0.08}`,
    '--study-background-glow': activeScene.ambientGlow,
    '--study-background-accent-glow': activeScene.accentGlow,
    '--study-background-vignette': activeScene.vignetteColor,
    '--study-background-position': activeScene.backgroundPosition || 'center center',
    '--study-background-scale': `${activeScene.backgroundScale ?? 1.06}`,
    '--study-background-glow-opacity': `${activePresentation.glowOpacity ?? 0.72}`,
    '--study-background-glow-scale': `${activePresentation.glowScale ?? 1.05}`,
    '--study-background-glow-drift-y': activePresentation.glowDriftY ?? '-1.4%',
    '--study-background-vignette-opacity': `${activePresentation.vignetteOpacity ?? 0.78}`,
    '--study-background-media-brightness': `${activePresentation.mediaBrightness ?? 0.72}`,
    '--study-background-media-saturation': `${activePresentation.mediaSaturation ?? 1.03}`,
    '--study-background-media-contrast': `${activePresentation.mediaContrast ?? 1.04}`,
    '--study-background-motion-scale': `${activePresentation.motionDurationScale ?? 1}`,
    '--study-background-overlay-drift-y': activePresentation.overlayDriftY ?? '-0.5%',
    '--study-background-grain-drift-x': activePresentation.grainDriftX ?? '-1.2%',
    '--study-background-grain-drift-y': activePresentation.grainDriftY ?? '0.7%',
  }

  const mediaType = activeScene.mediaType || 'image'
  const hasVideoLayer = mediaType === 'video' && activeScene.mediaSrc
  const hasImageLayer = mediaType === 'image' && activeScene.mediaSrc

  return (
    <div
      className="background-layer"
      style={sceneStyle}
      data-scene-id={activeScene.id}
      data-session-type={activePresentation.sessionType}
      aria-hidden="true"
    >
      <div className="background-layer__media">
        <div className="background-layer__image" />
        {hasImageLayer ? <BackgroundImage key={activeScene.id} scene={activeScene} /> : null}
        {hasVideoLayer ? <BackgroundVideo key={activeScene.id} scene={activeScene} /> : null}
      </div>
      <div className="background-layer__ambient-glow" />
      <div className="background-layer__overlay" />
      <div className="background-layer__vignette" />
      <div className="background-layer__grain" />
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for the new image element**

Find the CSS file for BackgroundLayer (likely in `client/src/components/` or a global stylesheet) and add:

```css
.background-layer__image-el {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.8s ease;
}

.background-layer__image-el--visible {
  opacity: 1;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BackgroundLayer.jsx
git commit -m "feat: add image media type support to BackgroundLayer"
```

---

### Task 7: Client — Settings Panel Scene Selector

**Files:**
- Modify: `client/src/app/panels/SettingsPanelContent.jsx`

- [ ] **Step 1: Add custom backgrounds state and upload logic to SettingsPanelContent**

Replace the contents of `client/src/app/panels/SettingsPanelContent.jsx` with:

```jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { TimerSettingsWidget } from '../../features/timer/index.js'
import { useStudyRoomLocale } from '../../i18n/useStudyRoomLocale.js'
import { STUDY_SCENES } from '../../lib/studyScene.js'
import { TIMER_DISPLAY_MODES } from '../../state/studyRoomReducer.js'
import {
  useStudyRoomActions,
  useStudyRoomState,
} from '../../state/useStudyRoom.js'
import {
  listBackgrounds,
  saveBackground,
  deleteBackground,
  getBackgroundBlob,
} from '../../lib/backgroundStorage.js'

const DISPLAY_OPTIONS = [
  { id: TIMER_DISPLAY_MODES.centerFocus, labelKey: 'studyRoom.settings.displayModes.center_focus.label', fallback: 'Center Focus' },
  { id: TIMER_DISPLAY_MODES.minimalOverlay, labelKey: 'studyRoom.settings.displayModes.minimal_overlay.label', fallback: 'Minimal Overlay' },
  { id: TIMER_DISPLAY_MODES.cornerEmbed, labelKey: 'studyRoom.settings.displayModes.corner_embed.label', fallback: 'Corner Embed' },
]

export function SettingsPanelContent() {
  const { preferences } = useStudyRoomState()
  const { setPreference } = useStudyRoomActions()
  const { locale, setLocale, supportedLocales, t } = useStudyRoomLocale()
  const [customBgs, setCustomBgs] = useState([])
  const [thumbUrls, setThumbUrls] = useState({})
  const fileInputRef = useRef(null)

  const refreshList = useCallback(async () => {
    const items = await listBackgrounds()
    setCustomBgs(items)
    // Load thumbnails
    const urls = {}
    for (const item of items) {
      if (item.thumbnail) {
        urls[item.id] = URL.createObjectURL(item.thumbnail)
      } else {
        const blob = await getBackgroundBlob(item.id)
        if (blob) urls[item.id] = URL.createObjectURL(blob)
      }
    }
    setThumbUrls((prev) => {
      // Revoke old URLs
      Object.values(prev).forEach((u) => URL.revokeObjectURL(u))
      return urls
    })
  }, [])

  useEffect(() => { refreshList() }, [refreshList])

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await saveBackground(file)
      await refreshList()
      // Auto-select the newly uploaded background
      const items = await listBackgrounds()
      const newest = items[items.length - 1]
      if (newest) setPreference('selectedSceneId', `custom:${newest.id}`)
    } catch (err) {
      console.error('Upload failed:', err.message)
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [refreshList, setPreference])

  const handleDelete = useCallback(async (id) => {
    await deleteBackground(id)
    if (preferences.selectedSceneId === `custom:${id}`) {
      setPreference('selectedSceneId', STUDY_SCENES[0].id)
    }
    await refreshList()
  }, [preferences.selectedSceneId, setPreference, refreshList])

  return (
    <div className="panel-stack">
      <section className="floating-widget">
        <h3 className="floating-widget__title">{t('studyRoom.settings.title', {}, 'Preferences')}</h3>

        <div className="settings-group">
          <h4 className="floating-widget__title">{t('studyRoom.settings.languageTitle', {}, 'Language')}</h4>
          <div className="settings-choice-grid">
            {supportedLocales.map((item) => (
              <button
                key={item.code}
                type="button"
                className={`settings-choice${locale === item.code ? ' settings-choice--active' : ''}`}
                onClick={() => setLocale(item.code)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <h4 className="floating-widget__title">{t('studyRoom.settings.sceneTitle', {}, 'Scene')}</h4>
          <div className="scene-selector">
            {STUDY_SCENES.map((scene) => (
              <button
                key={scene.id}
                type="button"
                className={`scene-selector__option${preferences.selectedSceneId === scene.id ? ' scene-selector__option--active' : ''}`}
                onClick={() => setPreference('selectedSceneId', scene.id)}
              >
                <span className="scene-selector__label">{t(`studyRoom.scenes.${scene.localeKey}.name`, {}, scene.name)}</span>
              </button>
            ))}
            {customBgs.map((bg) => (
              <button
                key={bg.id}
                type="button"
                className={`scene-selector__option scene-selector__option--custom${preferences.selectedSceneId === `custom:${bg.id}` ? ' scene-selector__option--active' : ''}`}
                onClick={() => setPreference('selectedSceneId', `custom:${bg.id}`)}
                title={bg.name}
              >
                {thumbUrls[bg.id] ? (
                  <img className="scene-selector__thumb" src={thumbUrls[bg.id]} alt={bg.name} />
                ) : (
                  <span className="scene-selector__label">{bg.name}</span>
                )}
                <button
                  type="button"
                  className="scene-selector__delete"
                  onClick={(e) => { e.stopPropagation(); handleDelete(bg.id) }}
                  title="Delete"
                >
                  x
                </button>
              </button>
            ))}
            <button
              type="button"
              className="scene-selector__option scene-selector__option--add"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="scene-selector__label">+</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
          </div>
        </div>

        <div className="settings-group">
          <h4 className="floating-widget__title">{t('studyRoom.settings.displayTitle', {}, 'Timer Display')}</h4>
          <div className="settings-choice-grid">
            {DISPLAY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`settings-choice${preferences.timerDisplayMode === opt.id ? ' settings-choice--active' : ''}`}
                onClick={() => setPreference('timerDisplayMode', opt.id)}
              >
                {t(opt.labelKey, {}, opt.fallback)}
              </button>
            ))}
          </div>
        </div>

        <TimerSettingsWidget />
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Add CSS for custom scene selector items**

Add to the relevant CSS file:

```css
.scene-selector__option--custom {
  position: relative;
  overflow: hidden;
}

.scene-selector__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scene-selector__delete {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.scene-selector__option--custom:hover .scene-selector__delete {
  opacity: 1;
}

.scene-selector__option--add {
  border-style: dashed;
  opacity: 0.6;
}

.scene-selector__option--add:hover {
  opacity: 1;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/app/panels/SettingsPanelContent.jsx
git commit -m "feat: add custom background upload and selection to scene selector"
```

---

### Task 8: Server-Side Sync (Logged-in Users)

**Files:**
- Create: `client/src/lib/backgroundSync.js`
- Modify: `client/src/app/panels/SettingsPanelContent.jsx` (add sync trigger)

- [ ] **Step 1: Create backgroundSync.js**

```js
import { listBackgrounds, getBackgroundBlob, saveBackground, deleteBackground, updateServerId } from './backgroundStorage.js'

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : ''

export async function syncBackgrounds() {
  try {
    // 1. Fetch server list
    const res = await fetch(`${API_BASE}/backgrounds`, { credentials: 'include' })
    if (!res.ok) return // Not logged in or error
    const { backgrounds: serverBgs } = await res.json()
    const localBgs = await listBackgrounds()

    const localByServerId = new Map(localBgs.filter((b) => b.serverId).map((b) => [b.serverId, b]))
    const serverById = new Map(serverBgs.map((b) => [b.id, b]))

    // 2. Download server backgrounds missing locally
    for (const serverBg of serverBgs) {
      if (localByServerId.has(serverBg.id)) continue
      const fileRes = await fetch(`${API_BASE}/backgrounds/${serverBg.id}/file`, { credentials: 'include' })
      if (!fileRes.ok) continue
      const blob = await fileRes.blob()
      const file = new File([blob], serverBg.fileName, { type: serverBg.mimeType })
      const localRecord = await saveBackground(file)
      await updateServerId(localRecord.id, serverBg.id)
    }

    // 3. Upload local backgrounds missing on server
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

    // 4. Delete local backgrounds removed from server
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
```

- [ ] **Step 2: Add sync trigger to SettingsPanelContent**

In `client/src/app/panels/SettingsPanelContent.jsx`, add import:

```js
import { syncBackgrounds, uploadToServer, deleteFromServer } from '../../lib/backgroundSync.js'
```

Add a `useEffect` after the existing `useEffect` for `refreshList`:

```js
  useEffect(() => {
    syncBackgrounds().then(refreshList)
  }, [])
```

Update `handleUpload` to also upload to server after saving locally:

```js
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const record = await saveBackground(file)
      // Best-effort server upload for logged-in users
      uploadToServer(record.id, file.name, file.type).catch(() => {})
      await refreshList()
      setPreference('selectedSceneId', `custom:${record.id}`)
    } catch (err) {
      console.error('Upload failed:', err.message)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [refreshList, setPreference])
```

Update `handleDelete` to also delete from server:

```js
  const handleDelete = useCallback(async (id) => {
    const items = await listBackgrounds()
    const item = items.find((b) => b.id === id)
    if (item?.serverId) deleteFromServer(item.serverId).catch(() => {})
    await deleteBackground(id)
    if (preferences.selectedSceneId === `custom:${id}`) {
      setPreference('selectedSceneId', STUDY_SCENES[0].id)
    }
    await refreshList()
  }, [preferences.selectedSceneId, setPreference, refreshList])
```

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/backgroundSync.js client/src/app/panels/SettingsPanelContent.jsx
git commit -m "feat: add server sync for custom backgrounds (logged-in users)"
```

---

### Task 9: Deploy and Verify

- [ ] **Step 1: Run Prisma migration on server**

Run: `bash scripts/deploy.sh`

This will build client, sync files, rebuild Docker, and run `prisma migrate deploy`.

- [ ] **Step 2: Verify deployment**

```bash
ssh je1ght-server "docker ps --filter name=study-backend --format '{{.Names}}\t{{.Status}}'"
```

Expected: `study-backend	Up X seconds`

- [ ] **Step 3: Test the full flow in browser**

1. Open `https://study.je1ght.top`
2. Open Settings panel
3. Verify 3 built-in scenes appear
4. Click "+" to upload an image
5. Verify custom background appears in scene selector
6. Click it to select — background changes
7. Verify atmosphere effects (glow, vignette) work on custom background
8. Refresh page — verify custom background persists
9. Login with NetEase account — verify sync happens
10. Delete custom background — verify it's removed

- [ ] **Step 4: Final commit with any fixes**

```bash
git add -A && git commit -m "fix: address issues found during testing"
```
