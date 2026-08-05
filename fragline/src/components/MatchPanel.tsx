import { formatClock } from '../lib/matchSim'
import { useGameStore } from '../store/gameStore'
import { TacticalMap } from './TacticalMap'
import './MatchPanel.css'

export function MatchPanel() {
  const match = useGameStore((s) => s.match)
  const teamName = useGameStore((s) => s.teamName)
  const teamPower = useGameStore((s) => s.teamPower)
  const standings = useGameStore((s) => s.standings)
  const playMatch = useGameStore((s) => s.playMatch)
  const dismissResult = useGameStore((s) => s.dismissResult)

  const opponent =
    standings.find((t) => t.id === match.opponentId) ??
    standings.find((t) => !t.isPlayer)
  const enemyName = opponent?.name ?? 'Rival Squad'
  const enemyPower = opponent?.power ?? Math.round(teamPower * 0.9)
  const live = match.phase === 'live'
  const done = match.phase === 'result'

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

      <div className="match-meta">
        <div className="score-chip">
          {live || done ? `${match.allyScore} – ${match.enemyScore}` : 'READY'}
        </div>
        <div className="clock-chip">
          {live ? formatClock(match.timeLeft) : done ? 'FT' : 'BO16'}
        </div>
        <div className="map-chip">{match.mapName}</div>
      </div>

      {match.phase === 'idle' ? (
        <div className="map-placeholder">
          <TacticalMap
            players={[
              { id: 'a1', name: 'ready', team: 'ally', x: 30, y: 60, alive: true, targetX: 30, targetY: 60 },
              { id: 'a2', name: 'ready', team: 'ally', x: 40, y: 70, alive: true, targetX: 40, targetY: 70 },
              { id: 'e1', name: 'wait', team: 'enemy', x: 70, y: 30, alive: true, targetX: 70, targetY: 30 },
              { id: 'e2', name: 'wait', team: 'enemy', x: 62, y: 40, alive: true, targetX: 62, targetY: 40 },
            ]}
          />
          <div className="idle-overlay">
            <p>Queue the next league match and watch the rounds unfold.</p>
          </div>
        </div>
      ) : (
        <TacticalMap players={match.players} live={live} />
      )}

      {match.events.length > 0 && (
        <ul className="match-feed">
          {match.events.slice(-3).map((e, i) => (
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
