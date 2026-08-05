import { ROLE_LABELS } from '../data/names'
import {
  formatCash,
  marketPrice,
  playerPower,
  useGameStore,
} from '../store/gameStore'
import './SquadScreen.css'

export function SquadScreen() {
  const squad = useGameStore((s) => s.squad)
  const selectedPlayerId = useGameStore((s) => s.selectedPlayerId)
  const selectPlayer = useGameStore((s) => s.selectPlayer)
  const sellPlayer = useGameStore((s) => s.sellPlayer)
  const setScreen = useGameStore((s) => s.setScreen)

  const selected = squad.find((p) => p.id === selectedPlayerId) ?? squad[0]

  return (
    <div className="screen stack">
      <section className="panel">
        <div className="row space">
          <h2 className="panel-title">Build Your Squad</h2>
          <span className="pill">{squad.length}/8 roster</span>
        </div>
        <div className="squad-list">
          {squad.map((p) => (
            <button
              key={p.id}
              className={p.id === selected?.id ? 'squad-row active' : 'squad-row'}
              onClick={() => selectPlayer(p.id)}
            >
              <span className={`tag ${p.role}`}>{p.role}</span>
              <div className="squad-meta">
                <strong>{p.name}</strong>
                <span>
                  {ROLE_LABELS[p.role]} · Lv.{p.level}
                </span>
              </div>
              <div className="squad-power">
                <em className={`rarity-${p.rarity}`}>{p.rarity}</em>
                <strong>{playerPower(p)}</strong>
              </div>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section className="panel selected-card">
          <div className="row space">
            <div>
              <h3>{selected.name}</h3>
              <p className="muted">
                {selected.nationality} · {ROLE_LABELS[selected.role]} ·{' '}
                <span className={`rarity-${selected.rarity}`}>{selected.rarity}</span>
              </p>
            </div>
            <div className="power-badge">
              <span>PWR</span>
              <strong>{playerPower(selected)}</strong>
            </div>
          </div>

          <div className="skill-mini">
            {Object.entries(selected.skills).map(([k, v]) => (
              <div key={k} className="skill-mini-row">
                <span>{k}</span>
                <div className="bar">
                  <i style={{ width: `${v}%` }} />
                </div>
                <strong>{v}</strong>
              </div>
            ))}
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setScreen('career')}>
              Train skills
            </button>
            <button
              className="btn btn-ghost"
              disabled={squad.length <= 5}
              onClick={() => sellPlayer(selected.id)}
              title={squad.length <= 5 ? 'Keep at least 5 players' : 'Sell player'}
            >
              Sell {formatCash(Math.round(marketPrice(selected) * 0.45))}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
