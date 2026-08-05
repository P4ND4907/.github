import { formatCash, useGameStore } from '../store/gameStore'
import './Header.css'

export function Header() {
  const cash = useGameStore((s) => s.cash)
  const gems = useGameStore((s) => s.gems)
  const incomePerSec = useGameStore((s) => s.incomePerSec)
  const teamPower = useGameStore((s) => s.teamPower)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <div>
          <strong>FRAGLINE</strong>
          <small>Idle Esports Manager</small>
        </div>
      </div>
      <div className="resources">
        <div className="res" title="Cash">
          <span className="res-label">$</span>
          <strong>{formatCash(cash).replace('$', '')}</strong>
          <em>+{Math.round(incomePerSec)}/s</em>
        </div>
        <div className="res gem" title="Gems">
          <span className="res-label">◆</span>
          <strong>{gems}</strong>
        </div>
        <div className="res power" title="Team power">
          <span className="res-label">⚡</span>
          <strong>{teamPower}</strong>
        </div>
      </div>
    </header>
  )
}
