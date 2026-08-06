import { claymoreSpotChance } from '../lib/gadgets'
import { formatCash, upgradeCost, useGameStore } from '../store/gameStore'
import type { Upgrade, UpgradeStat } from '../types'
import './UpgradePanel.css'

const STAT_MARK: Record<UpgradeStat, string> = {
  power: 'PWR',
  intelligence: 'INT',
  strategy: 'STR',
  reflex: 'RFX',
  utility: 'UTL',
  clutch: 'CLU',
}

function effectLine(u: Upgrade): string {
  const lv = u.level
  const next = lv + 1
  switch (u.stat) {
    case 'power':
      return `Lv.${lv} → gunfight +${(lv - 1) * 3}% · next +${(next - 1) * 3}%`
    case 'intelligence':
      return `Claymore spot ~${Math.round(claymoreSpotChance(lv) * 100)}%/s · next ~${Math.round(claymoreSpotChance(next) * 100)}%`
    case 'strategy':
      return `Site pressure ${(lv * 6).toFixed(0)}% · next ${(next * 6).toFixed(0)}%`
    case 'reflex':
      return `Move ${9.5 + lv * 1.4} u/s → next ${9.5 + next * 1.4}`
    case 'utility':
      return `Util rate & blast ×${(1 + lv * 0.12).toFixed(2)} → ×${(1 + next * 0.12).toFixed(2)}`
    case 'clutch':
      return `Late swing +${(lv * 2.5).toFixed(0)}% → +${(next * 2.5).toFixed(0)}%`
    default:
      return u.blurb
  }
}

export function UpgradePanel() {
  const upgrades = useGameStore((s) => s.upgrades)
  const cash = useGameStore((s) => s.cash)
  const buyUpgrade = useGameStore((s) => s.buyUpgrade)
  const lastUpgradeId = useGameStore((s) => s.lastUpgradeId)
  const lastUpgradeAt = useGameStore((s) => s.lastUpgradeAt)
  const flashFresh = Date.now() - lastUpgradeAt < 2200

  return (
    <section className="panel upgrade-panel" id="team-upgrades">
      <div className="row space">
        <h2 className="panel-title">Team Upgrades</h2>
        <span className="pill">Live in every match</span>
      </div>
      <p className="upgrade-lead muted">
        Tap UPGRADE — levels apply immediately to the buff strip and live sim
        (Intel spots claymores, Utility throws more frags, etc).
      </p>
      <div className="upgrade-rail">
        {upgrades.map((u) => {
          const cost = upgradeCost(u)
          const canBuy = cash >= cost
          const flashing = flashFresh && lastUpgradeId === u.id
          return (
            <article
              key={u.id}
              id={`upgrade-${u.id}`}
              className={`upgrade-card ${flashing ? 'just-bought' : ''} ${
                canBuy ? 'can-buy' : ''
              }`}
            >
              <div className={`upgrade-icon stat-${u.stat}`} aria-hidden>
                <span>{STAT_MARK[u.stat]}</span>
              </div>
              <div className="upgrade-body">
                <strong>{u.name}</strong>
                <span className="upgrade-level">
                  Lv. {u.level}
                  <em>→ {u.level + 1}</em>
                </span>
                <span className="upgrade-effect">{effectLine(u)}</span>
                <span className="upgrade-blurb">{u.blurb}</span>
              </div>
              <button
                type="button"
                className="btn btn-warn upgrade-btn"
                disabled={!canBuy}
                aria-label={`Upgrade ${u.name} to level ${u.level + 1} for ${formatCash(cost)}`}
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
