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
  const buffs = buffsWithBrain(buffsFromUpgrades(upgrades), brain)

  const selected =
    match.players.find((p) => p.id === match.selectedUnitId) ??
    match.players.find((p) => p.team === 'ally' && p.alive)
  const squadUnit = selected?.squadId
    ? squad.find((p) => p.id === selected.squadId)
    : null

  const buffChips: { id: string; label: string; value: number }[] = [
    { id: 'power', label: 'PWR', value: buffs.power },
    { id: 'intelligence', label: 'INT', value: buffs.intelligence },
    { id: 'strategy', label: 'STR', value: buffs.strategy },
    { id: 'reflex', label: 'RFX', value: buffs.reflex },
    { id: 'utility', label: 'UTL', value: buffs.utility },
    { id: 'clutch', label: 'CLU', value: buffs.clutch },
  ]

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

      <div className="buff-strip" title="Team upgrade levels — tap to jump">
        {buffChips.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`buff-chip ${
              flashFresh && lastUpgradeId === b.id ? 'flash' : ''
            }`}
            onClick={() => jumpToUpgrade(b.id)}
          >
            <em>{b.label}</em>{' '}
            {Number.isInteger(b.value) ? b.value : b.value.toFixed(1)}
          </button>
        ))}
      </div>

      <div className="match-meta">
        <div className="score-chip">
          {live || done ? `${match.allyScore} – ${match.enemyScore}` : 'READY'}
        </div>
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
      </div>

      {match.phase === 'idle' ? (
        <div className="map-placeholder">
          <TacticalMap players={previewPlayers} mapId={match.mapId} />
          <div className="idle-overlay">
            <p>
              Next map: <strong>{match.mapName}</strong>. Squad IQ{' '}
              <strong>{brain.iq}</strong> is studying holds & flanks while idle —
              play a match to teach them live.
            </p>
          </div>
        </div>
      ) : (
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
      )}

      {live && match.fragStreak >= 2 && (
        <div className="streak-banner">
          {match.fragStreak}x FRAG STREAK — keep the pressure on
        </div>
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
                  <strong>{p.name}</strong>
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
                  <strong>{selected.name}</strong>
                  <p className="muted">
                    Upgrade this unit — combat & speed update live
                  </p>
                </div>
                <span className="pill">CBM {selected.combat}</span>
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

      {live && (
        <div className="live-data" aria-live="polite">
          {(() => {
            const jammed = match.players.filter(
              (p) => p.alive && (p.stuckTime ?? 0) > 0.25,
            ).length
            const moving = match.players.filter(
              (p) =>
                p.alive &&
                (p.waypoints.length > 0 ||
                  Math.hypot(p.targetX - p.x, p.targetY - p.y) > 1.5),
            ).length
            const clays = (match.gadgets ?? []).filter((g) => g.kind === 'claymore')
              .length
            return (
              <>
                <span>{moving} moving</span>
                <span className={jammed > 0 ? 'warn' : ''}>{jammed} jammed</span>
                <span>{clays} clay</span>
                <span>
                  {
                    match.players.filter((p) => p.alive && p.team === 'ally').length
                  }
                  /
                  {
                    match.players.filter((p) => p.alive && p.team === 'enemy')
                      .length
                  }{' '}
                  alive
                </span>
              </>
            )
          })()}
        </div>
      )}

      {match.events.length > 0 && (
        <ul className="match-feed">
          {match.events.slice(-5).map((e, i) => (
            <li key={`${e}-${i}`} className={e.startsWith('LIVE') ? 'telemetry' : ''}>
              {e}
            </li>
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
          <button className="btn btn-ghost" onClick={dismissResult}>
            Continue
          </button>
        </div>
      )}

      {match.phase === 'idle' && (
        <button className="btn btn-primary play-btn" onClick={playMatch}>
          Play game <span aria-hidden>›</span>
        </button>
      )}
    </section>
  )
}
