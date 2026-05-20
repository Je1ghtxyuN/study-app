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
      Object.values(prev).forEach((u) => URL.revokeObjectURL(u))
      return urls
    })
  }, [])

  useEffect(() => { refreshList() }, [refreshList])

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const record = await saveBackground(file)
      await refreshList()
      setPreference('selectedSceneId', `custom:${record.id}`)
    } catch (err) {
      console.error('Upload failed:', err.message)
    }
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
