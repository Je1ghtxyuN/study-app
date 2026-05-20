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
