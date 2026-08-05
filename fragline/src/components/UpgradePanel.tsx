import { formatCash, upgradeCost, useGameStore } from '../store/gameStore'
import './UpgradePanel.css'

export function UpgradePanel() {
  const upgrades = useGameStore((s) => s.upgrades)
  const cash = useGameStore((s) => s.cash)
  const buyUpgrade = useGameStore((s) => s.buyUpgrade)

  return (
    <section className="panel upgrade-panel">
      <div className="row space">
        <h2 className="panel-title">Power Upgrades</h2>
        <span className="pill">⚡ Team boosts</span>
      </div>
      <div className="upgrade-rail">
        {upgrades.map((u) => {
          const cost = upgradeCost(u)
          const canBuy = cash >= cost
          return (
            <article key={u.id} className="upgrade-card">
              <div className="upgrade-icon" aria-hidden>
                ⚡
              </div>
              <div className="upgrade-body">
                <strong>{u.name}</strong>
                <span>
                  Lv. {u.level} · +{u.powerPerLevel} power
                </span>
              </div>
              <button
                className="btn btn-warn upgrade-btn"
                disabled={!canBuy}
                onClick={() => buyUpgrade(u.id)}
              >
                UPGRADE
                <small>{formatCash(cost)}</small>
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
