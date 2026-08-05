import {
  findGridPath,
  getMap,
  pathToWorld,
  pickRandomMap,
  randomOpenCell,
  worldToCell,
  zoneById,
  type GameMap,
  type GridPoint,
} from '../data/map'
import type { MatchPlayer, MatchState, Player, Team, Upgrade } from '../types'

export interface MatchBuffs {
  /** Combat / win chance */
  power: number
  /** Smarter paths, less idle dithering, better dest choice */
  intelligence: number
  /** Push vs hold timing, site focus */
  strategy: number
  /** Movement speed */
  reflex: number
  /** Fight range / skirmish chance */
  utility: number
  /** Late-round clutch bias */
  clutch: number
}

export function buffsFromUpgrades(upgrades: Upgrade[]): MatchBuffs {
  const levels = (id: string) => upgrades.find((u) => u.id === id)?.level ?? 1
  return {
    power: levels('power'),
    intelligence: levels('intelligence'),
    strategy: levels('strategy'),
    reflex: levels('reflex'),
    utility: levels('utility'),
    clutch: levels('clutch'),
  }
}

function spawnPlayer(
  map: GameMap,
  base: Omit<MatchPlayer, 'x' | 'y' | 'targetX' | 'targetY' | 'waypoints' | 'alive'>,
  zoneId: string,
): MatchPlayer {
  const z = zoneById(map, zoneId)
  const x = z.x + (Math.random() * 1.6 - 0.8)
  const y = z.y + (Math.random() * 1.6 - 0.8)
  return {
    ...base,
    alive: true,
    x,
    y,
    targetX: x,
    targetY: y,
    waypoints: [],
  }
}

export function createIdleMatch(excludeMapId?: string | null): MatchState {
  const map = pickRandomMap(excludeMapId)
  return {
    phase: 'idle',
    round: 0,
    maxRounds: 16,
    allyScore: 0,
    enemyScore: 0,
    timeLeft: 0,
    winChance: 50,
    mapId: map.id,
    mapName: map.name,
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
  previousMapId?: string | null,
  upgrades: Upgrade[] = [],
): MatchState {
  const map = pickRandomMap(previousMapId)
  const buffs = buffsFromUpgrades(upgrades)
  const powerBias = (buffs.power - 1) * 2.2 + (buffs.strategy - 1) * 1.4
  const winChance = Math.max(
    8,
    Math.min(
      92,
      Math.round((teamPower / (teamPower + opponent.power)) * 100 + powerBias),
    ),
  )

  const allies: MatchPlayer[] = squad.slice(0, 5).map((p, i) =>
    spawnPlayer(
      map,
      { id: p.id, name: p.name, team: 'ally' },
      map.allySpawns[i] ?? map.allySpawns[0],
    ),
  )

  const enemyNames = ['nyx', 'volt', 'shade', 'hexor', 'riptide']
  const enemies: MatchPlayer[] = enemyNames.map((name, i) =>
    spawnPlayer(
      map,
      { id: `e_${i}`, name, team: 'enemy' },
      map.enemySpawns[i] ?? map.enemySpawns[0],
    ),
  )

  return {
    phase: 'live',
    round: 1,
    maxRounds: 16,
    allyScore: 0,
    enemyScore: 0,
    timeLeft: 55,
    winChance,
    mapId: map.id,
    mapName: map.name,
    players: [...allies, ...enemies],
    events: [
      `Map: ${map.name}`,
      `Match vs ${opponent.name}`,
      `INT ${buffs.intelligence} · STRAT ${buffs.strategy} · PWR ${buffs.power}`,
    ],
    opponentId: opponent.id,
    result: null,
  }
}

function assignRoamPath(
  map: GameMap,
  p: MatchPlayer,
  dest: GridPoint,
): MatchPlayer {
  const from = worldToCell(p.x, p.y)
  let cells = findGridPath(map, from, dest)

  // Never beam across the map — if BFS failed, step to a neighbor instead
  if (cells.length <= 1) {
    const near = randomOpenCell(map, from, 2)
    cells = findGridPath(map, from, near)
  }

  const world = pathToWorld(cells.slice(1))
  if (!world.length) {
    // Stay put rather than clipping through walls
    return { ...p, waypoints: [], targetX: p.x, targetY: p.y }
  }

  const [first, ...rest] = world
  return {
    ...p,
    waypoints: rest,
    targetX: first.x,
    targetY: first.y,
  }
}

function pickDestination(
  map: GameMap,
  p: MatchPlayer,
  winChance: number,
  buffs: MatchBuffs,
): GridPoint {
  const aggressive =
    p.team === 'ally'
      ? winChance > 42 + buffs.strategy
      : winChance < 58 - buffs.strategy

  // Strategy: prefer named tactical zones
  // Intelligence: more often pick meaningful objectives vs random roam
  const useObjective = Math.random() < 0.35 + buffs.intelligence * 0.06 + buffs.strategy * 0.04

  if (useObjective) {
    const pool =
      p.team === 'ally'
        ? aggressive
          ? map.allyPush
          : map.allyHold
        : aggressive
          ? map.enemyPush
          : map.enemyHold
    const z = zoneById(map, pool[Math.floor(Math.random() * pool.length)])
    return { col: z.col, row: z.row }
  }

  // Free roam to a nearby open cell — explores the maze without slamming walls
  const here = worldToCell(p.x, p.y)
  const roamRadius = 2 + Math.min(4, Math.floor(buffs.intelligence / 2))
  return randomOpenCell(map, here, roamRadius)
}

function retarget(
  map: GameMap,
  p: MatchPlayer,
  winChance: number,
  buffs: MatchBuffs,
): MatchPlayer {
  if (!p.alive) return p
  // Still following a path — keep going (intelligence = stick to plan)
  const stickChance = 0.88 + buffs.intelligence * 0.015
  if (p.waypoints.length > 0 && Math.random() < stickChance) return p

  const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y)
  if (dist > 2.5 && Math.random() < stickChance) return p

  // Retarget cadence: smarter teams repath less randomly
  const repathChance = 0.55 - buffs.intelligence * 0.03
  if (Math.random() > Math.max(0.2, repathChance)) return p

  return assignRoamPath(map, p, pickDestination(map, p, winChance, buffs))
}

function advanceWaypoints(p: MatchPlayer): MatchPlayer {
  if (!p.alive) return p
  const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y)
  if (dist > 1.6) return p
  if (!p.waypoints.length) return p
  const [next, ...rest] = p.waypoints
  return { ...p, waypoints: rest, targetX: next.x, targetY: next.y }
}

function moveToward(p: MatchPlayer, speed: number): MatchPlayer {
  if (!p.alive) return p
  const stepped = advanceWaypoints(p)
  const dx = stepped.targetX - stepped.x
  const dy = stepped.targetY - stepped.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.35) return stepped
  const step = Math.min(speed, dist)
  return {
    ...stepped,
    x: stepped.x + (dx / dist) * step,
    y: stepped.y + (dy / dist) * step,
  }
}

export function tickMatch(state: MatchState, upgrades: Upgrade[] = []): MatchState {
  if (state.phase !== 'live') return state
  const map = getMap(state.mapId)
  const buffs = buffsFromUpgrades(upgrades)
  const speed = 1.7 + buffs.reflex * 0.22

  let timeLeft = state.timeLeft - 1
  let round = state.round
  let allyScore = state.allyScore
  let enemyScore = state.enemyScore
  let players = state.players.map((p) =>
    moveToward(retarget(map, p, state.winChance, buffs), speed),
  )
  const events = [...state.events]

  const fightChance = 0.22 + buffs.utility * 0.035
  const fightRange = 18 + buffs.utility * 2.5

  if (Math.random() < fightChance) {
    const aliveAllies = players.filter((p) => p.alive && p.team === 'ally')
    const aliveEnemies = players.filter((p) => p.alive && p.team === 'enemy')
    if (aliveAllies.length && aliveEnemies.length) {
      let a = aliveAllies[0]
      let e = aliveEnemies[0]
      let best = Infinity
      for (const ally of aliveAllies) {
        for (const enemy of aliveEnemies) {
          const d = Math.hypot(ally.x - enemy.x, ally.y - enemy.y)
          if (d < best) {
            best = d
            a = ally
            e = enemy
          }
        }
      }
      if (best < fightRange) {
        const late = timeLeft < 18 || aliveAllies.length + aliveEnemies.length <= 3
        const clutchBias = late ? buffs.clutch * 1.8 : 0
        const allyFavored =
          Math.random() * 100 < state.winChance + clutchBias + (buffs.power - 1) * 1.5
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
  }

  const alliesAlive = players.filter((p) => p.alive && p.team === 'ally').length
  const enemiesAlive = players.filter((p) => p.alive && p.team === 'enemy').length
  const roundOver = timeLeft <= 0 || alliesAlive === 0 || enemiesAlive === 0

  if (roundOver) {
    const sitePressure = buffs.strategy * 0.04
    const allyWonRound =
      enemiesAlive === 0 ||
      (alliesAlive > 0 &&
        timeLeft <= 0 &&
        Math.random() * 100 < state.winChance + buffs.clutch * 2) ||
      (alliesAlive > enemiesAlive && Math.random() < 0.5 + sitePressure)

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

    timeLeft = 55
    players = players.map((p, _i, all) => {
      const spawns = p.team === 'ally' ? map.allySpawns : map.enemySpawns
      const idx = all.filter((x) => x.team === p.team).findIndex((x) => x.id === p.id)
      return spawnPlayer(
        map,
        { id: p.id, name: p.name, team: p.team },
        spawns[idx] ?? spawns[0],
      )
    })
  }

  const aliveFactor =
    (alliesAlive - enemiesAlive) * 3 + (allyScore - enemyScore) * 2
  const winChance = Math.max(
    8,
    Math.min(92, state.winChance + aliveFactor * 0.05),
  )

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

export function idlePreviewPlayers(map: GameMap): MatchPlayer[] {
  const ally = map.allySpawns.slice(0, 2).map((id, i) => {
    const z = zoneById(map, id)
    return {
      id: `preview_a${i}`,
      name: 'ready',
      team: 'ally' as const,
      x: z.x,
      y: z.y,
      alive: true,
      targetX: z.x,
      targetY: z.y,
      waypoints: [],
    }
  })
  const enemy = map.enemySpawns.slice(0, 2).map((id, i) => {
    const z = zoneById(map, id)
    return {
      id: `preview_e${i}`,
      name: 'wait',
      team: 'enemy' as const,
      x: z.x,
      y: z.y,
      alive: true,
      targetX: z.x,
      targetY: z.y,
      waypoints: [],
    }
  })
  return [...ally, ...enemy]
}
