import { MAP_ZONES } from '../data/map'
import type { MatchPlayer, MatchState, Player, Team } from '../types'

function zone(id: string) {
  return MAP_ZONES.find((z) => z.id === id) ?? MAP_ZONES[0]
}

function jitter(n: number, amount = 4) {
  return n + (Math.random() * amount * 2 - amount)
}

function pickZone(ids: string[]) {
  return zone(ids[Math.floor(Math.random() * ids.length)])
}

export function createIdleMatch(): MatchState {
  return {
    phase: 'idle',
    round: 0,
    maxRounds: 16,
    allyScore: 0,
    enemyScore: 0,
    timeLeft: 0,
    winChance: 50,
    mapName: 'DUSTLINE',
    players: [],
    events: [],
    opponentId: null,
    result: null,
  }
}

export function startMatch(
  squad: Player[],
  opponent: Team,
  teamPower: number,
): MatchState {
  const winChance = Math.max(
    8,
    Math.min(92, Math.round((teamPower / (teamPower + opponent.power)) * 100)),
  )

  const allySpawns = ['tspawn', 'mid', 'xbox', 'a_long', 'b_tunnels']
  const enemySpawns = ['ctspawn', 'a_site', 'b_site', 'cat', 'doors']

  const allies: MatchPlayer[] = squad.slice(0, 5).map((p, i) => {
    const z = zone(allySpawns[i] ?? 'tspawn')
    return {
      id: p.id,
      name: p.name,
      team: 'ally',
      x: jitter(z.x),
      y: jitter(z.y),
      alive: true,
      targetX: jitter(z.x),
      targetY: jitter(z.y),
    }
  })

  const enemyNames = ['nyx', 'volt', 'shade', 'hexor', 'riptide']
  const enemies: MatchPlayer[] = enemyNames.map((name, i) => {
    const z = zone(enemySpawns[i] ?? 'ctspawn')
    return {
      id: `e_${i}`,
      name,
      team: 'enemy',
      x: jitter(z.x),
      y: jitter(z.y),
      alive: true,
      targetX: jitter(z.x),
      targetY: jitter(z.y),
    }
  })

  return {
    phase: 'live',
    round: 1,
    maxRounds: 16,
    allyScore: 0,
    enemyScore: 0,
    timeLeft: 95,
    winChance,
    mapName: 'DUSTLINE',
    players: [...allies, ...enemies],
    events: [`Match vs ${opponent.name}`, 'Round 1 — pistol'],
    opponentId: opponent.id,
    result: null,
  }
}

function moveToward(p: MatchPlayer, speed = 1.8): MatchPlayer {
  const dx = p.targetX - p.x
  const dy = p.targetY - p.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1.2) return p
  const step = Math.min(speed, dist)
  return {
    ...p,
    x: p.x + (dx / dist) * step,
    y: p.y + (dy / dist) * step,
  }
}

function retarget(p: MatchPlayer, winChance: number): MatchPlayer {
  if (!p.alive) return p
  if (Math.random() > 0.35) return p

  const allyPush = ['mid', 'cat', 'a_short', 'a_site', 'b_tunnels', 'b_site', 'xbox']
  const allyHold = ['tspawn', 'mid', 'xbox', 'a_long', 'doors']
  const enemyHold = ['a_site', 'b_site', 'ctspawn', 'cat', 'doors', 'b_window']
  const enemyPush = ['mid', 'xbox', 'a_short', 'doors', 'b_tunnels']

  const aggressive = p.team === 'ally' ? winChance > 45 : winChance < 55
  const z = p.team === 'ally'
    ? pickZone(aggressive ? allyPush : allyHold)
    : pickZone(aggressive ? enemyPush : enemyHold)

  return {
    ...p,
    targetX: jitter(z.x, 5),
    targetY: jitter(z.y, 5),
  }
}

export function tickMatch(state: MatchState): MatchState {
  if (state.phase !== 'live') return state

  let timeLeft = state.timeLeft - 1
  let round = state.round
  let allyScore = state.allyScore
  let enemyScore = state.enemyScore
  let players = state.players.map((p) => moveToward(retarget(p, state.winChance)))
  const events = [...state.events]

  // Combat skirmishes near teammates
  if (Math.random() < 0.22) {
    const aliveAllies = players.filter((p) => p.alive && p.team === 'ally')
    const aliveEnemies = players.filter((p) => p.alive && p.team === 'enemy')
    if (aliveAllies.length && aliveEnemies.length) {
      const a = aliveAllies[Math.floor(Math.random() * aliveAllies.length)]
      const e = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)]
      const allyFavored = Math.random() * 100 < state.winChance
      if (allyFavored) {
        players = players.map((p) =>
          p.id === e.id ? { ...p, alive: false } : p,
        )
        events.push(`${a.name} fragged ${e.name}`)
      } else {
        players = players.map((p) =>
          p.id === a.id ? { ...p, alive: false } : p,
        )
        events.push(`${e.name} fragged ${a.name}`)
      }
    }
  }

  const alliesAlive = players.filter((p) => p.alive && p.team === 'ally').length
  const enemiesAlive = players.filter((p) => p.alive && p.team === 'enemy').length
  let roundOver = timeLeft <= 0 || alliesAlive === 0 || enemiesAlive === 0

  if (roundOver) {
    const allyWonRound =
      enemiesAlive === 0 ||
      (alliesAlive > 0 && timeLeft <= 0 && Math.random() * 100 < state.winChance) ||
      (alliesAlive > enemiesAlive && Math.random() < 0.55)

    if (allyWonRound) {
      allyScore += 1
      events.push(`Round ${round} won`)
    } else {
      enemyScore += 1
      events.push(`Round ${round} lost`)
    }

    round += 1
    const matchOver =
      allyScore >= 9 || enemyScore >= 9 || round > state.maxRounds

    if (matchOver) {
      const result: MatchState['result'] =
        allyScore === enemyScore ? 'draw' : allyScore > enemyScore ? 'win' : 'loss'
      return {
        ...state,
        phase: 'result',
        round: Math.min(round, state.maxRounds),
        allyScore,
        enemyScore,
        timeLeft: 0,
        players,
        events: events.slice(-8),
        result,
      }
    }

    // Reset round
    timeLeft = 95
    players = players.map((p) => {
      const spawnIds =
        p.team === 'ally'
          ? ['tspawn', 'mid', 'xbox', 'a_long', 'b_tunnels']
          : ['ctspawn', 'a_site', 'b_site', 'cat', 'doors']
      const idx = players.filter((x) => x.team === p.team).findIndex((x) => x.id === p.id)
      const z = zone(spawnIds[idx] ?? spawnIds[0])
      return {
        ...p,
        alive: true,
        x: jitter(z.x),
        y: jitter(z.y),
        targetX: jitter(z.x),
        targetY: jitter(z.y),
      }
    })
  }

  // Win chance drifts slightly with alive counts
  const aliveFactor =
    (alliesAlive - enemiesAlive) * 3 +
    (allyScore - enemyScore) * 2
  const winChance = Math.max(8, Math.min(92, state.winChance + aliveFactor * 0.05))

  return {
    ...state,
    round,
    allyScore,
    enemyScore,
    timeLeft,
    winChance: Math.round(winChance),
    players,
    events: events.slice(-8),
  }
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
