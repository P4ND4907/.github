import { formatCash, upgradeCost, useGameStore } from '../store/gameStore'
import './UpgradePanel.css'

export function UpgradePanel() {
  const upgrades = useGameStore((s) => s.upgrades)
  const cash = useGameStore((s) => s.cash)
  const buyUpgrade = useGameStore((s) => s.buyUpgrade)

  return (
    <section className="panel upgrade-panel">
      <div className="row space">
        <h2 className="panel-title">Team Upgrades</h2>
        <span className="pill">Improve match play</span>
      </div>
      <p className="upgrade-lead muted">
        Power, Intelligence, Strategy and more — each level changes how your squad
        free-roams, fights, and closes rounds.
      </p>
      <div className="upgrade-rail">
        {upgrades.map((u) => {
          const cost = upgradeCost(u)
          const canBuy = cash >= cost
          return (
            <article key={u.id} className="upgrade-card">
              <div className="upgrade-icon" aria-hidden>
                {u.icon}
              </div>
              <div className="upgrade-body">
                <strong>{u.name}</strong>
                <span className="upgrade-level">
                  Lv. {u.level} · +{u.powerPerLevel} team power
                </span>
                <span className="upgrade-blurb">{u.blurb}</span>
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
