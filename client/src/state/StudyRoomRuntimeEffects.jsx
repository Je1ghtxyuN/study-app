import { useEffect, useRef } from 'react'
import bellCueSource from '../../../assets/se/BreakOrWork.mp3'
import { writePersistedStudyRoomState } from './studyRoomStorage.js'
import { useStudyRoomState } from './useStudyRoom.js'
import { recordPomodoro, saveUserPrefs, fetchCurrentUser } from './studySessionRecorder.js'

export function StudyRoomRuntimeEffects() {
  const state = useStudyRoomState()
  const bellAudioRef = useRef(null)
  const lastHandledTransitionIdRef = useRef(0)
  const lastRecordedTransitionIdRef = useRef(0)
  const accumulatedWorkSecondsRef = useRef(0)
  const { preferences, timer } = state
  const {
    locale,
    selectedSceneId,
    selectedTrackId,
    soundEnabled,
    timerDisplayMode,
    volume,
  } = preferences
  const { durations, longBreakInterval, lastAutoTransition } = timer

  useEffect(() => {
    writePersistedStudyRoomState({
      preferences: {
        locale,
        selectedSceneId,
        selectedTrackId,
        soundEnabled,
        timerDisplayMode,
        volume,
      },
      timer: {
        durations: {
          work: durations.work,
          shortBreak: durations.shortBreak,
          longBreak: durations.longBreak,
        },
        longBreakInterval,
      },
    })
  }, [
    durations.longBreak,
    durations.shortBreak,
    durations.work,
    locale,
    longBreakInterval,
    selectedSceneId,
    selectedTrackId,
    soundEnabled,
    timerDisplayMode,
    volume,
  ])

  useEffect(() => {
    const bellAudio = new Audio(bellCueSource)
    bellAudio.preload = 'auto'
    bellAudioRef.current = bellAudio

    return () => {
      bellAudio.pause()
      bellAudio.src = ''
      bellAudioRef.current = null
    }
  }, [])

  // Sync preferences to backend when logged in
  useEffect(() => {
    fetchCurrentUser().then((user) => {
      if (!user) return
      saveUserPrefs({
        selectedSceneId,
        selectedTrackId,
        timerDisplayMode,
        volume,
        soundEnabled,
        durations: {
          work: durations.work,
          shortBreak: durations.shortBreak,
          longBreak: durations.longBreak,
        },
        longBreakInterval,
      })
    })
  }, [selectedSceneId, selectedTrackId, timerDisplayMode, volume, soundEnabled, durations.work, durations.shortBreak, durations.longBreak, longBreakInterval])

  // Helper: flush accumulated seconds → minutes, send to backend, reset
  const flushAccumulatedRef = useRef(() => {})
  flushAccumulatedRef.current = () => {
    if (accumulatedWorkSecondsRef.current > 0) {
      recordPomodoro(Math.round(accumulatedWorkSecondsRef.current / 60))
      accumulatedWorkSecondsRef.current = 0
    }
  }

  // Continuous work time tracking — accumulate seconds in memory, flush only on
  // page hide/close so time is never lost.  Pomodoro count is 1 per completed
  // work cycle (recorded via lastAutoTransition), not 1 per minute.
  useEffect(() => {
    if (timer.status !== 'running' || timer.sessionType !== 'work') return

    const interval = setInterval(() => {
      accumulatedWorkSecondsRef.current += 1
    }, 1000)

    const handleBeforeUnload = () => { flushAccumulatedRef.current() }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [timer.status, timer.sessionType])

  // Record completed work sessions via lastAutoTransition (set by reducer on
  // natural timer completion). This records exactly 1 Pomodoro per completed
  // work cycle. Accumulated seconds are discarded — the full session duration
  // is what counts.
  useEffect(() => {
    const transition = lastAutoTransition
    if (!transition) return
    if (transition.fromSessionType !== 'work') return
    if (transition.id === lastRecordedTransitionIdRef.current) return

    lastRecordedTransitionIdRef.current = transition.id
    accumulatedWorkSecondsRef.current = 0
    recordPomodoro(Math.round(durations.work / 60))
  }, [lastAutoTransition, durations.work])

  // Bell sound on session transition
  useEffect(() => {
    const transition = lastAutoTransition

    if (!transition) return
    if (transition.id === lastHandledTransitionIdRef.current) return

    lastHandledTransitionIdRef.current = transition.id

    if (!soundEnabled) return

    const bellAudio = bellAudioRef.current

    if (!bellAudio) return

    bellAudio.currentTime = 0
    void bellAudio.play().catch(() => {
      // Playback can be blocked until the browser receives a user gesture.
    })
  }, [lastAutoTransition, soundEnabled])

  return null
}
