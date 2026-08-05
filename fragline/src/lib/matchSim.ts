import {
  findGridPath,
  getMap,
  isOpenCell,
  pathToWorld,
  pickRandomMap,
  randomOpenCell,
  worldToCell,
  zoneById,
  type GameMap,
  type GridPoint,
} from '../data/map'
import { playerPower } from './players'
import type { CombatFx, MatchPlayer, MatchState, Player, Team, Upgrade } from '../types'

export interface MatchBuffs {
  power: number
  intelligence: number
  strategy: number
  reflex: number
  utility: number
  clutch: number
}

/** Stronger curves so upgrades are clearly felt in-match */
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

export function describeBuffs(buffs: MatchBuffs): string {
  return `PWR${buffs.power} INT${buffs.intelligence} STR${buffs.strategy} RFX${buffs.reflex} UTL${buffs.utility} CLU${buffs.clutch}`
}

function unitCombat(p: Player): number {
  const s = p.skills
  return Math.round(
    s.aim * 0.35 +
      s.reflex * 0.15 +
      s.recoil * 0.1 +
      s.positioning * 0.15 +
      s.utility * 0.1 +
      s.clutch * 0.15 +
      p.level * 2,
  )
}

function unitSpeed(p: Player): number {
  return 1 + p.skills.reflex / 120 + p.skills.positioning / 200
}

function enemyCombat(seed: number): number {
  return 38 + seed * 7 + Math.floor(Math.random() * 18)
}

function spawnPlayer(
  map: GameMap,
  base: Omit<
    MatchPlayer,
    | 'x'
    | 'y'
    | 'targetX'
    | 'targetY'
    | 'waypoints'
    | 'alive'
    | 'orderedTime'
    | 'hp'
    | 'firingTime'
  >,
  zoneId: string,
): MatchPlayer {
  const z = zoneById(map, zoneId)
  const x = z.x + (Math.random() * 0.8 - 0.4)
  const y = z.y + (Math.random() * 0.8 - 0.4)
  return {
    ...base,
    alive: true,
    hp: base.maxHp,
    x,
    y,
    targetX: x,
    targetY: y,
    waypoints: [],
    orderedTime: 0,
    firingTime: 0,
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
    selectedUnitId: null,
    orderMarker: null,
    fx: [],
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
  // Clear, strong upgrade impact on opening win%
  const powerBias =
    (buffs.power - 1) * 4.5 +
    (buffs.strategy - 1) * 3 +
    (buffs.intelligence - 1) * 1.5
  const winChance = Math.max(
    10,
    Math.min(
      90,
      Math.round((teamPower / (teamPower + opponent.power)) * 100 + powerBias),
    ),
  )

  const allies: MatchPlayer[] = squad.slice(0, 5).map((p, i) =>
    spawnPlayer(
      map,
      {
        id: p.id,
        squadId: p.id,
        name: p.name,
        team: 'ally',
        maxHp: 100 + Math.floor(p.skills.clutch / 2),
        combat: unitCombat(p),
        speed: unitSpeed(p),
      },
      map.allySpawns[i] ?? map.allySpawns[0],
    ),
  )

  const enemyNames = ['nyx', 'volt', 'shade', 'hexor', 'riptide']
  const enemies: MatchPlayer[] = enemyNames.map((name, i) =>
    spawnPlayer(
      map,
      {
        id: `e_${i}`,
        squadId: null,
        name,
        team: 'enemy',
        maxHp: 100,
        combat: enemyCombat(i) + Math.floor(opponent.power / 80),
        speed: 1 + Math.random() * 0.25,
      },
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
      `MAP → ${map.name}`,
      `vs ${opponent.name}`,
      describeBuffs(buffs),
      'Tap a blue unit, then tap the map to move',
    ],
    opponentId: opponent.id,
    result: null,
    selectedUnitId: allies[0]?.id ?? null,
    orderMarker: null,
    fx: [],
  }
}

function assignRoamPath(
  map: GameMap,
  p: MatchPlayer,
  dest: GridPoint,
  orderedTime = 0,
): MatchPlayer {
  const from = worldToCell(p.x, p.y)
  let cells = findGridPath(map, from, dest)

  if (cells.length <= 1) {
    const near = randomOpenCell(map, from, 2)
    cells = findGridPath(map, from, near)
  }

  const world = pathToWorld(cells.slice(1))
  if (!world.length) {
    return { ...p, waypoints: [], targetX: p.x, targetY: p.y, orderedTime }
  }

  const [first, ...rest] = world
  return {
    ...p,
    waypoints: rest,
    targetX: first.x,
    targetY: first.y,
    orderedTime,
  }
}

/** Player-issued move order — pathfinds around walls */
export function commandUnitTo(
  state: MatchState,
  unitId: string,
  worldX: number,
  worldY: number,
): MatchState {
  if (state.phase !== 'live') return state
  const map = getMap(state.mapId)
  const cell = worldToCell(worldX, worldY)
  if (!isOpenCell(map, cell.col, cell.row)) {
    const near = randomOpenCell(map, cell, 2)
    return commandUnitTo(
      state,
      unitId,
      near.col * 10 + 5,
      near.row * 10 + 5,
    )
  }

  const players = state.players.map((p) => {
    if (p.id !== unitId || p.team !== 'ally' || !p.alive) return p
    return assignRoamPath(map, p, cell, 12)
  })

  const unit = players.find((p) => p.id === unitId)
  const events = unit
    ? [...state.events, `${unit.name} ordered → ${cell.col},${cell.row}`]
    : state.events

  return {
    ...state,
    players,
    selectedUnitId: unitId,
    orderMarker: { x: cell.col * 10 + 5, y: cell.row * 10 + 5 },
    events: events.slice(-8),
  }
}

export function selectMatchUnit(state: MatchState, unitId: string | null): MatchState {
  return { ...state, selectedUnitId: unitId }
}

/** Refresh ally combat stats from squad mid-match after unit upgrade */
export function syncAllyStats(state: MatchState, squad: Player[]): MatchState {
  return {
    ...state,
    players: state.players.map((mp) => {
      if (mp.team !== 'ally' || !mp.squadId) return mp
      const p = squad.find((s) => s.id === mp.squadId)
      if (!p) return mp
      const combat = unitCombat(p)
      const speed = unitSpeed(p)
      const maxHp = 100 + Math.floor(p.skills.clutch / 2)
      return {
        ...mp,
        combat,
        speed,
        maxHp,
        hp: mp.alive ? Math.min(mp.hp + 8, maxHp) : mp.hp,
        name: p.name,
      }
    }),
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
      ? winChance > 40 + buffs.strategy * 2
      : winChance < 60 - buffs.strategy * 2

  const useObjective =
    Math.random() < 0.3 + buffs.intelligence * 0.08 + buffs.strategy * 0.05

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

  const here = worldToCell(p.x, p.y)
  const roamRadius = 2 + Math.min(5, Math.floor(buffs.intelligence / 2))
  return randomOpenCell(map, here, roamRadius)
}

function retarget(
  map: GameMap,
  p: MatchPlayer,
  winChance: number,
  buffs: MatchBuffs,
  dt: number,
): MatchPlayer {
  if (!p.alive) return p

  if (p.orderedTime > 0) {
    return { ...p, orderedTime: Math.max(0, p.orderedTime - dt) }
  }

  // Stay on current path — only rarely repath (smooth travel)
  if (p.waypoints.length > 0) return p

  const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y)
  if (dist > 1.2) return p

  // ~repath every 1.2–2.4s depending on intelligence
  const repathRate = (0.55 - buffs.intelligence * 0.04) * dt
  if (Math.random() > Math.max(0.08, repathRate)) return p

  return assignRoamPath(map, p, pickDestination(map, p, winChance, buffs))
}

function advanceWaypoints(p: MatchPlayer): MatchPlayer {
  if (!p.alive) return p
  const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y)
  if (dist > 0.85) return p
  if (!p.waypoints.length) return p
  const [next, ...rest] = p.waypoints
  return { ...p, waypoints: rest, targetX: next.x, targetY: next.y }
}

/** units per second in map space (0–100) */
function moveToward(p: MatchPlayer, teamSpeed: number, dt: number): MatchPlayer {
  if (!p.alive) return p
  let stepped = p
  // Chain a couple waypoint advances if already on top of target
  for (let i = 0; i < 3; i++) {
    stepped = advanceWaypoints(stepped)
  }
  const dx = stepped.targetX - stepped.x
  const dy = stepped.targetY - stepped.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.15) return stepped
  const speed = teamSpeed * p.speed
  const step = Math.min(speed * dt, dist)
  return {
    ...stepped,
    x: stepped.x + (dx / dist) * step,
    y: stepped.y + (dy / dist) * step,
  }
}

export function tickMatch(
  state: MatchState,
  upgrades: Upgrade[] = [],
  dt = 1 / 20,
): MatchState {
  if (state.phase !== 'live') return state
  const map = getMap(state.mapId)
  const buffs = buffsFromUpgrades(upgrades)
  // Smooth glide speed in map-units / second
  const teamSpeed = 11 + buffs.reflex * 1.8

  let timeLeft = state.timeLeft - dt
  let round = state.round
  let allyScore = state.allyScore
  let enemyScore = state.enemyScore
  let players = state.players.map((p) => {
    const moved = moveToward(
      retarget(map, p, state.winChance, buffs, dt),
      teamSpeed,
      dt,
    )
    return {
      ...moved,
      firingTime: Math.max(0, moved.firingTime - dt),
    }
  })
  const events = [...state.events]
  let orderMarker = state.orderMarker
  let fx: CombatFx[] = state.fx
    .map((f) => ({ ...f, life: f.life - dt }))
    .filter((f) => f.life > 0)

  if (orderMarker && state.selectedUnitId) {
    const u = players.find((p) => p.id === state.selectedUnitId)
    if (u && Math.hypot(u.x - orderMarker.x, u.y - orderMarker.y) < 3.5) {
      orderMarker = null
    }
  }

  // More frequent skirmishes so shooting VFX show up often
  const fightChance = (0.55 + buffs.utility * 0.08) * dt
  const fightRange = 18 + buffs.utility * 3.5

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
        const late =
          timeLeft < 18 || aliveAllies.length + aliveEnemies.length <= 3
        const clutchBias = late ? buffs.clutch * 3.5 : buffs.clutch * 0.5
        const combatDelta = (a.combat - e.combat) * 0.45
        const teamBias = (buffs.power - 1) * 3.5
        const chance = Math.max(
          8,
          Math.min(
            92,
            state.winChance * 0.55 + 25 + combatDelta + clutchBias + teamBias,
          ),
        )
        const dmg = 28 + buffs.power * 4 + Math.floor(Math.random() * 18)
        const allyWins = Math.random() * 100 < chance
        const shooter = allyWins ? a : e
        const target = allyWins ? e : a

        const shotId = `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        fx.push({
          id: `${shotId}_shot`,
          kind: 'shot',
          fromX: shooter.x,
          fromY: shooter.y,
          toX: target.x,
          toY: target.y,
          team: shooter.team,
          life: 0.28,
          maxLife: 0.28,
        })
        fx.push({
          id: `${shotId}_hit`,
          kind: allyWins && target.hp - dmg <= 0 ? 'kill' : 'hit',
          fromX: shooter.x,
          fromY: shooter.y,
          toX: target.x,
          toY: target.y,
          team: shooter.team,
          life: allyWins && target.hp - dmg <= 0 ? 0.55 : 0.35,
          maxLife: allyWins && target.hp - dmg <= 0 ? 0.55 : 0.35,
        })

        players = players.map((p) =>
          p.id === shooter.id ? { ...p, firingTime: 0.22 } : p,
        )

        const newHp = target.hp - dmg
        if (newHp <= 0) {
          players = players.map((p) =>
            p.id === target.id ? { ...p, alive: false, hp: 0 } : p,
          )
          events.push(`${shooter.name} fragged ${target.name}`)
        } else {
          players = players.map((p) =>
            p.id === target.id ? { ...p, hp: newHp } : p,
          )
          events.push(`${shooter.name} hit ${target.name} (−${dmg})`)
        }
      }
    }
  }

  fx = fx.slice(-18)

  const alliesAlive = players.filter((p) => p.alive && p.team === 'ally').length
  const enemiesAlive = players.filter((p) => p.alive && p.team === 'enemy').length
  const roundOver = timeLeft <= 0 || alliesAlive === 0 || enemiesAlive === 0

  if (roundOver) {
    const sitePressure = buffs.strategy * 0.06
    const allyWonRound =
      enemiesAlive === 0 ||
      (alliesAlive > 0 &&
        timeLeft <= 0 &&
        Math.random() * 100 < state.winChance + buffs.clutch * 3.5) ||
      (alliesAlive > enemiesAlive && Math.random() < 0.48 + sitePressure)

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
        orderMarker: null,
        fx: [],
      }
    }

    timeLeft = 55
    orderMarker = null
    fx = []
    players = players.map((p, _i, all) => {
      const spawns = p.team === 'ally' ? map.allySpawns : map.enemySpawns
      const idx = all.filter((x) => x.team === p.team).findIndex((x) => x.id === p.id)
      return spawnPlayer(
        map,
        {
          id: p.id,
          squadId: p.squadId,
          name: p.name,
          team: p.team,
          maxHp: p.maxHp,
          combat: p.combat,
          speed: p.speed,
        },
        spawns[idx] ?? spawns[0],
      )
    })
  }

  const aliveFactor =
    (alliesAlive - enemiesAlive) * 3 + (allyScore - enemyScore) * 2
  const winChance = Math.max(
    8,
    Math.min(92, state.winChance + aliveFactor * 0.05 * dt),
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
    orderMarker,
    fx,
  }
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function idlePreviewPlayers(map: GameMap): MatchPlayer[] {
  const mk = (
    id: string,
    name: string,
    team: 'ally' | 'enemy',
    zoneId: string,
  ): MatchPlayer => {
    const z = zoneById(map, zoneId)
    return {
      id,
      squadId: null,
      name,
      team,
      x: z.x,
      y: z.y,
      alive: true,
      hp: 100,
      maxHp: 100,
      combat: 50,
      speed: 1,
      targetX: z.x,
      targetY: z.y,
      waypoints: [],
      orderedTime: 0,
      firingTime: 0,
    }
  }
  return [
    ...map.allySpawns.slice(0, 2).map((id, i) => mk(`preview_a${i}`, 'ready', 'ally', id)),
    ...map.enemySpawns.slice(0, 2).map((id, i) => mk(`preview_e${i}`, 'wait', 'enemy', id)),
  ]
}

export { playerPower }
