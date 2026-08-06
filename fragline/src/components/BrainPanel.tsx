import { useEffect, useState } from 'react'
import { describePlaybook } from '../lib/learning'
import { useGameStore } from '../store/gameStore'
import type { Playbook } from '../types'
import './BrainPanel.css'

const PILLARS: { key: keyof Playbook; label: string }[] = [
  { key: 'holds', label: 'Holds' },
  { key: 'flanks', label: 'Flanks' },
  { key: 'utility', label: 'Utility' },
  { key: 'aggression', label: 'Push' },
  { key: 'clutch', label: 'Clutch' },
]

const STUDY_LINES = [
  'Scrubbing entry timings…',
  'Marking crossfire angles…',
  'Drilling utility lineups…',
  'Rewatching lost retakes…',
  'Mapping lurk timings…',
]

export function BrainPanel() {
  const brain = useGameStore((s) => s.brain)
  const matchPhase = useGameStore((s) => s.match.phase)
  const mapId = useGameStore((s) => s.match.mapId)
  const toggleStudying = useGameStore((s) => s.toggleStudying)
  const xpPct = Math.min(100, (brain.xp / Math.max(1, brain.xpToNext)) * 100)
  const mapRead = Math.round(brain.mapMemory[mapId] ?? 0)
  const studying = brain.idleStudying && matchPhase !== 'live'
  const [lessonIdx, setLessonIdx] = useState(0)
  const weakest = PILLARS.reduce((a, b) =>
    brain.playbook[a.key] <= brain.playbook[b.key] ? a : b,
  )

  useEffect(() => {
    if (!studying) return
    const id = window.setInterval(() => {
      setLessonIdx((i) => (i + 1) % STUDY_LINES.length)
    }, 2800)
    return () => window.clearInterval(id)
  }, [studying])

  return (
    <section className="panel brain-panel">
      <div className="row space">
        <h2 className="panel-title">Squad Brain</h2>
        <button
          type="button"
          className={`study-toggle ${studying ? 'on' : ''}`}
          onClick={toggleStudying}
        >
          {studying ? 'Studying…' : matchPhase === 'live' ? 'In match' : 'Paused'}
        </button>
      </div>

      <div className="brain-hero">
        <div className="iq-block">
          <span className="iq-label">Tactical IQ</span>
          <strong className="iq-value">{brain.iq}</strong>
        </div>
        <div className="xp-block">
          <div className="row space">
            <span className="muted">Learning XP</span>
            <span className="xp-nums">
              {Math.floor(brain.xp)} / {brain.xpToNext}
            </span>
          </div>
          <div className={`xp-bar ${studying ? 'ticking' : ''}`} aria-hidden>
            <i style={{ width: `${xpPct}%` }} />
          </div>
          <p className="study-rate muted">
            {studying
              ? `${STUDY_LINES[lessonIdx]} · +${brain.studyRate.toFixed(1)} XP/s · focus ${weakest.label}`
              : matchPhase === 'live'
                ? `Learning from live plays · map read ${mapRead}%`
                : `Study paused · map read ${mapRead}%`}
          </p>
        </div>
      </div>

      <div className="playbook-grid">
        {PILLARS.map((p) => {
          const v = brain.playbook[p.key]
          return (
            <div key={p.key} className="playbook-pill">
              <div className="row space">
                <span>{p.label}</span>
                <strong>{Math.round(v)}</strong>
              </div>
              <div className="playbook-bar">
                <i style={{ width: `${Math.min(100, v)}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      <p className="playbook-summary muted">{describePlaybook(brain.playbook)}</p>

      <ul className="lesson-feed">
        {brain.lessons.slice(0, 4).map((l, i) => (
          <li key={`${l}-${i}`}>{l}</li>
        ))}
      </ul>
    </section>
  )
}
