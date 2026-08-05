import { ROLE_LABELS, SKILL_LABELS } from '../data/names'
import {
  formatCash,
  playerPower,
  skillUpgradeCost,
  useGameStore,
} from '../store/gameStore'
import type { SkillKey } from '../types'
import './CareerScreen.css'

const SKILLS = Object.keys(SKILL_LABELS) as SkillKey[]

export function CareerScreen() {
  const squad = useGameStore((s) => s.squad)
  const selectedPlayerId = useGameStore((s) => s.selectedPlayerId)
  const selectPlayer = useGameStore((s) => s.selectPlayer)
  const upgradeSkill = useGameStore((s) => s.upgradeSkill)
  const cash = useGameStore((s) => s.cash)
  const totalWins = useGameStore((s) => s.totalWins)
  const incomePerSec = useGameStore((s) => s.incomePerSec)

  const player = squad.find((p) => p.id === selectedPlayerId) ?? squad[0]
  if (!player) return null

  return (
    <div className="screen stack">
      <section className="panel career-hero">
        <div className="row space">
          <div>
            <p className="eyebrow">Build Your Career</p>
            <h2>{player.name}</h2>
            <p className="muted">
              {ROLE_LABELS[player.role]} · Overall {playerPower(player)}
            </p>
          </div>
          <div className="career-side">
            <span>Wins {totalWins}</span>
            <span>Income ${Math.round(incomePerSec)}/s</span>
          </div>
        </div>

        <div className="player-picker">
          {squad.map((p) => (
            <button
              key={p.id}
              className={p.id === player.id ? 'picker active' : 'picker'}
              onClick={() => selectPlayer(p.id)}
            >
              {p.name.slice(0, 6)}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Skills</h3>
        <div className="skill-grid">
          {SKILLS.map((skill) => {
            const value = player.skills[skill]
            const cost = skillUpgradeCost(player.level, value)
            const maxed = value >= 99
            return (
              <article key={skill} className="skill-card">
                <div className="skill-head">
                  <strong>{SKILL_LABELS[skill]}</strong>
                  <span>{value}</span>
                </div>
                <div className="bar">
                  <i style={{ width: `${value}%` }} />
                </div>
                <button
                  className="btn btn-ghost"
                  disabled={maxed || cash < cost}
                  onClick={() => upgradeSkill(player.id, skill)}
                >
                  {maxed ? 'MAX' : `Upgrade · ${formatCash(cost)}`}
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
