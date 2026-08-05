import { ROLE_LABELS } from '../data/names'
import {
  formatCash,
  marketPrice,
  playerPower,
  useGameStore,
} from '../store/gameStore'
import './MarketScreen.css'

export function MarketScreen() {
  const market = useGameStore((s) => s.market)
  const cash = useGameStore((s) => s.cash)
  const squad = useGameStore((s) => s.squad)
  const buyPlayer = useGameStore((s) => s.buyPlayer)
  const refreshMarket = useGameStore((s) => s.refreshMarket)

  return (
    <div className="screen stack">
      <section className="panel">
        <div className="row space">
          <div>
            <h2 className="panel-title">Transfer Market</h2>
            <p className="muted market-sub">Scout free agents and sharpen the roster.</p>
          </div>
          <button className="btn btn-ghost" onClick={refreshMarket} disabled={cash < 2500}>
            Refresh
            <small style={{ marginLeft: 4 }}>$2.5K</small>
          </button>
        </div>

        <div className="market-list">
          {market.map((p) => {
            const price = marketPrice(p)
            const canBuy = cash >= price && squad.length < 8
            return (
              <article key={p.id} className="market-card">
                <div className="market-top">
                  <span className={`tag ${p.role}`}>{p.role}</span>
                  <em className={`rarity-${p.rarity}`}>{p.rarity}</em>
                </div>
                <h3>{p.name}</h3>
                <p>
                  {ROLE_LABELS[p.role]} · {p.nationality} · Lv.{p.level}
                </p>
                <div className="market-stats">
                  <span>
                    Aim <strong>{p.skills.aim}</strong>
                  </span>
                  <span>
                    Clutch <strong>{p.skills.clutch}</strong>
                  </span>
                  <span>
                    PWR <strong>{playerPower(p)}</strong>
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!canBuy}
                  onClick={() => buyPlayer(p.id)}
                >
                  Sign · {formatCash(price)}
                </button>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
