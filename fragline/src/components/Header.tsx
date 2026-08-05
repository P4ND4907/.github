import { formatCash, useGameStore } from '../store/gameStore'
import './Header.css'

export function Header() {
  const cash = useGameStore((s) => s.cash)
  const gems = useGameStore((s) => s.gems)
  const incomePerSec = useGameStore((s) => s.incomePerSec)
  const teamPower = useGameStore((s) => s.teamPower)
  const iq = useGameStore((s) => s.brain?.iq ?? 1)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <div>
          <strong>FRAGLINE</strong>
          <small>Strategy Idle Esports</small>
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
        <div className="res iq" title="Tactical IQ">
          <span className="res-label">IQ</span>
          <strong>{iq}</strong>
        </div>
        <div className="res power" title="Team power">
          <span className="res-label power-mark" aria-hidden>
            P
          </span>
          <strong>{teamPower}</strong>
        </div>
      </div>
    </header>
  )
}
