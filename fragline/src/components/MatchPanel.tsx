import { SKILL_LABELS } from '../data/names'
import { getMap } from '../data/map'
import {
  buffsFromUpgrades,
  formatClock,
  idlePreviewPlayers,
} from '../lib/matchSim'
import { buffsWithBrain } from '../lib/learning'
import {
  formatCash,
  skillUpgradeCost,
  useGameStore,
} from '../store/gameStore'
import type { SkillKey } from '../types'
import { TacticalMap } from './TacticalMap'
import './MatchPanel.css'

const QUICK_SKILLS: SkillKey[] = ['aim', 'reflex', 'positioning', 'clutch']

export function MatchPanel() {
  const match = useGameStore((s) => s.match)
  const teamName = useGameStore((s) => s.teamName)
  const teamPower = useGameStore((s) => s.teamPower)
  const standings = useGameStore((s) => s.standings)
  const upgrades = useGameStore((s) => s.upgrades)
  const brain = useGameStore((s) => s.brain)
  const squad = useGameStore((s) => s.squad)
  const cash = useGameStore((s) => s.cash)
  const playMatch = useGameStore((s) => s.playMatch)
  const dismissResult = useGameStore((s) => s.dismissResult)
  const cycleMap = useGameStore((s) => s.cycleMap)
  const selectMatchUnit = useGameStore((s) => s.selectMatchUnit)
  const commandSelectedUnit = useGameStore((s) => s.commandSelectedUnit)
  const holdSelectedUnit = useGameStore((s) => s.holdSelectedUnit)
  const scoutRival = useGameStore((s) => s.scoutRival)
  const gems = useGameStore((s) => s.gems)
  const upgradeSkill = useGameStore((s) => s.upgradeSkill)

  const lastUpgradeId = useGameStore((s) => s.lastUpgradeId)
  const lastUpgradeAt = useGameStore((s) => s.lastUpgradeAt)
  const flashFresh = Date.now() - lastUpgradeAt < 2200

  const opponent =
    standings.find((t) => t.id === match.opponentId) ??
    standings.find((t) => !t.isPlayer)
  const enemyName = opponent?.name ?? 'Rival Squad'
  const enemyPower = opponent?.power ?? Math.round(teamPower * 0.9)
  const live = match.phase === 'live'
  const done = match.phase === 'result'
  const map = getMap(match.mapId)
  const previewPlayers = idlePreviewPlayers(map)
  const brainBuffs = buffsWithBrain(buffsFromUpgrades(upgrades), brain)

  const selected =
    match.players.find((p) => p.id === match.selectedUnitId) ??
    match.players.find((p) => p.team === 'ally' && p.alive)
  const squadUnit = selected?.squadId
    ? squad.find((p) => p.id === selected.squadId)
    : null

  const buffChips = upgrades.map((u) => ({
    id: u.id,
    label:
      u.id === 'power'
        ? 'PWR'
        : u.id === 'intelligence'
          ? 'INT'
          : u.id === 'strategy'
            ? 'STR'
            : u.id === 'reflex'
              ? 'RFX'
              : u.id === 'utility'
                ? 'UTL'
                : 'CLU',
    level: u.level,
  }))

  const alliesAlive = match.players.filter((p) => p.alive && p.team === 'ally').length
  const enemiesAlive = match.players.filter((p) => p.alive && p.team === 'enemy').length
  const xpPct = Math.min(
    100,
    Math.round(((brain.xp ?? 0) / Math.max(1, brain.xpToNext ?? 70)) * 100),
  )

  function jumpToUpgrade(id: string) {
    document.getElementById(`upgrade-${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }

  return (
    <section className="panel match-panel">
      <div className="match-scoreboard">
        <div className="side ally">
          <strong>{teamName}</strong>
          <span>({teamPower})</span>
        </div>
        <div className="chance">
          <div className="chance-bar">
            <i style={{ width: `${match.phase === 'idle' ? 50 : match.winChance}%` }} />
          </div>
          <div className="chance-nums">
            <span>{live || done ? match.winChance : 50}%</span>
            <span>{live || done ? 100 - match.winChance : 50}%</span>
          </div>
        </div>
        <div className="side enemy">
          <strong>{enemyName}</strong>
          <span>({enemyPower})</span>
        </div>
      </div>

      <div className="buff-strip" title="Upgrade levels — tap to jump">
        {buffChips.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`buff-chip ${
              flashFresh && lastUpgradeId === b.id ? 'flash' : ''
            }`}
            onClick={() => jumpToUpgrade(b.id)}
          >
            <em>{b.label}</em> Lv.{b.level}
          </button>
        ))}
      </div>

      <div className="match-meta">
        <div className="score-chip">
          {live || done
            ? `${match.allyScore} – ${match.enemyScore}`
            : 'READY'}
        </div>
        {(live || done) && (
          <div className="round-chip">R{match.round}/{match.maxRounds}</div>
        )}
        <div className="clock-chip">
          {live ? formatClock(match.timeLeft) : done ? 'FT' : 'BO16'}
        </div>
        <div className="map-chip" style={{ color: map.accent }}>
          {match.mapName}
        </div>
        {match.phase === 'idle' && (
          <button className="btn btn-ghost map-cycle" onClick={cycleMap}>
            Next map
          </button>
        )}
        {live && (
          <div className="alive-chip">
            {alliesAlive}/{enemiesAlive}
          </div>
        )}
        {live && (
          <div
            className={`site-chip ${
              (match.siteControl ?? 50) >= 55
                ? 'ally'
                : (match.siteControl ?? 50) <= 45
                  ? 'enemy'
                  : ''
            }`}
            title="Site control"
          >
            SITE {match.hotSite ?? '—'} {Math.round(match.siteControl ?? 50)}%
          </div>
        )}
      </div>

      {match.phase === 'idle' ? (
        <div className="map-placeholder">
          <TacticalMap players={previewPlayers} mapId={match.mapId} />
          <div className="idle-overlay">
            <p>
              <strong>{match.mapName}</strong> · IQ <strong>{brain.iq}</strong>{' '}
              studying ({xpPct}% to next) · brain edge{' '}
              <strong>+{brainBuffs.power.toFixed(1)}</strong> PWR
            </p>
          </div>
        </div>
      ) : (
        <div className="live-map-wrap">
          <TacticalMap
            players={match.players}
            mapId={match.mapId}
            live={live}
            interactive={live}
            selectedUnitId={match.selectedUnitId}
            orderMarker={match.orderMarker}
            fx={match.fx}
            gadgets={match.gadgets ?? []}
            onSelectUnit={selectMatchUnit}
            onCommandMove={commandSelectedUnit}
          />
          {live && match.roundBanner && (match.bannerTime ?? 0) > 0 && (
            <div className="round-banner-pop">{match.roundBanner}</div>
          )}
        </div>
      )}

      {live && match.fragStreak >= 2 && (
        <div className="streak-banner">
          {match.fragStreak}x FRAG STREAK — keep the pressure on
        </div>
      )}

      {live && match.callout && (
        <div className="callout-chip">IGL · {match.callout.replace(/_/g, ' ').toUpperCase()}</div>
      )}

      {live && (
        <div className="battle-dock">
          <div className="unit-rail">
            {match.players
              .filter((p) => p.team === 'ally')
              .map((p) => (
                <button
                  key={p.id}
                  className={`unit-chip ${p.id === selected?.id ? 'active' : ''} ${
                    p.alive ? '' : 'dead'
                  }`}
                  onClick={() => selectMatchUnit(p.id)}
                >
                  <strong>
                    {p.name}
                    <em className="role-tag">{p.role}</em>
                  </strong>
                  <span>
                    {p.alive ? `HP ${p.hp}` : 'DOWN'} · CBM {p.combat}
                  </span>
                </button>
              ))}
          </div>

          {squadUnit && selected && (
            <div className="unit-train">
              <div className="row space">
                <div>
                  <strong>
                    {selected.name}{' '}
                    <span className="tag">{selected.role}</span>
                  </strong>
                  <p className="muted">Tap map to move · HOLD locks the angle</p>
                </div>
                <div className="unit-actions">
                  <button
                    type="button"
                    className="btn btn-ghost hold-btn"
                    disabled={!selected.alive}
                    onClick={holdSelectedUnit}
                  >
                    HOLD
                  </button>
                  <span className="pill">CBM {selected.combat}</span>
                </div>
              </div>
              <div className="quick-skills">
                {QUICK_SKILLS.map((skill) => {
                  const value = squadUnit.skills[skill]
                  const cost = skillUpgradeCost(squadUnit.level, value)
                  const maxed = value >= 99
                  return (
                    <button
                      key={skill}
                      className="btn btn-ghost skill-quick"
                      disabled={maxed || cash < cost || !selected.alive}
                      onClick={() => upgradeSkill(squadUnit.id, skill)}
                    >
                      <em>{SKILL_LABELS[skill]}</em>
                      <strong>{value}</strong>
                      <small>{maxed ? 'MAX' : formatCash(cost)}</small>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {match.events.length > 0 && (
        <ul className="match-feed">
          {match.events
            .filter((e) => !e.startsWith('LIVE'))
            .slice(-4)
            .map((e, i) => (
              <li key={`${e}-${i}`}>{e}</li>
            ))}
        </ul>
      )}

      {done && (
        <div className={`result-banner ${match.result}`}>
          <strong>
            {match.result === 'win'
              ? 'Match Won'
              : match.result === 'draw'
                ? 'Draw'
                : 'Match Lost'}
          </strong>
          <span>
            {match.allyScore} – {match.enemyScore}
          </span>
          <button className="btn btn-primary" onClick={dismissResult}>
            Collect & continue
          </button>
        </div>
      )}

      {match.phase === 'idle' && (
        <div className="idle-cta-row">
          <button className="btn btn-primary play-btn" onClick={playMatch}>
            Play game <span aria-hidden>›</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost scout-btn"
            disabled={gems < 5}
            onClick={scoutRival}
          >
            Scout ◆5
          </button>
        </div>
      )}
    </section>
  )
}
