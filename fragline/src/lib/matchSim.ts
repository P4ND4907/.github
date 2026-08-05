import {
  findGridPath,
  getMap,
  hasLineOfSight,
  isOpenCell,
  pathToWorld,
  pickRandomMap,
  randomOpenCell,
  UNIT_SEP,
  worldToCell,
  zoneById,
  type GameMap,
  type GridPoint,
} from '../data/map'
import {
  isGoodAngleHold,
  placeClaymore,
  throwFrag,
  tickGadgets,
  trySpotClaymores,
} from './gadgets'
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
    | 'stuckTime'
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
    stuckTime: 0,
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
    gadgets: [],
    pendingCash: 0,
    fragStreak: 0,
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
    gadgets: [],
    pendingCash: 0,
    fragStreak: 0,
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
  foes?: MatchPlayer[],
  allies?: MatchPlayer[],
): GridPoint {
  // Hold angles when defending — strategy upgrades bias toward cover peeks
  const wantHold =
    p.team === 'ally'
      ? winChance < 48 + buffs.strategy
      : winChance > 52 - buffs.strategy

  if (wantHold && Math.random() < 0.14 + buffs.strategy * 0.03) {
    const pool = p.team === 'ally' ? map.allyHold : map.enemyHold
    const candidates = pool
      .map((id) => zoneById(map, id))
      .filter((z) => isGoodAngleHold(map, z.x, z.y))
    if (candidates.length) {
      const z = candidates[Math.floor(Math.random() * candidates.length)]
      return { col: z.col, row: z.row }
    }
  }

  // Flank instead of stacking the same lane as a teammate
  if (allies?.length && Math.random() < 0.4 + buffs.intelligence * 0.05) {
    const crowded = allies.filter(
      (a) => a.id !== p.id && a.alive && Math.hypot(a.x - p.x, a.y - p.y) < 16,
    )
    if (crowded.length && map.flankZones.length) {
      const z = zoneById(
        map,
        map.flankZones[Math.floor(Math.random() * map.flankZones.length)],
      )
      return { col: z.col, row: z.row }
    }
  }

  // Avoid pathing onto a teammate's current target cell
  const allyTargets = new Set(
    (allies ?? [])
      .filter((a) => a.alive)
      .map((a) => {
        const c = worldToCell(a.targetX, a.targetY)
        return `${c.col},${c.row}`
      }),
  )

  // Hunt visible enemies — approach adjacent cell, don't stack on them
  if (foes?.length) {
    const visible = foes
      .filter((f) => f.alive)
      .map((f) => ({ f, d: Math.hypot(f.x - p.x, f.y - p.y) }))
      .filter(({ f, d }) => d < 36 && hasLineOfSight(map, p.x, p.y, f.x, f.y))
      .sort((a, b) => a.d - b.d)
    if (visible.length && Math.random() < 0.45 + buffs.strategy * 0.04) {
      const prey = visible[0].f
      const cell = worldToCell(prey.x, prey.y)
      return randomOpenCell(map, cell, 3)
    }
  }

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
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    for (const id of shuffled) {
      const z = zoneById(map, id)
      if (!allyTargets.has(`${z.col},${z.row}`)) return { col: z.col, row: z.row }
    }
    const z = zoneById(map, pool[Math.floor(Math.random() * pool.length)])
    return { col: z.col, row: z.row }
  }

  const here = worldToCell(p.x, p.y)
  const roamRadius = 3 + Math.min(6, Math.floor(buffs.intelligence / 2))
  for (let attempt = 0; attempt < 6; attempt++) {
    const cell = randomOpenCell(map, here, roamRadius)
    if (!allyTargets.has(`${cell.col},${cell.row}`)) return cell
  }
  return randomOpenCell(map, here, roamRadius)
}

function retarget(
  map: GameMap,
  p: MatchPlayer,
  winChance: number,
  buffs: MatchBuffs,
  dt: number,
  foes?: MatchPlayer[],
  allies?: MatchPlayer[],
): MatchPlayer {
  if (!p.alive) return p

  // Force repath when jammed — don't sit on a dead waypoint list
  if (p.stuckTime > 0.45 && p.orderedTime <= 0) {
    const from = worldToCell(p.x, p.y)
    const escape = randomOpenCell(map, from, 5)
    return { ...assignRoamPath(map, p, escape), stuckTime: 0 }
  }

  if (p.orderedTime > 0) {
    return { ...p, orderedTime: Math.max(0, p.orderedTime - dt) }
  }

  if (p.waypoints.length > 0 && p.stuckTime < 0.35) return p

  const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y)
  if (dist > 1.2 && p.stuckTime < 0.35) return p

  const repathRate = (0.65 - buffs.intelligence * 0.03) * dt
  const huntBoost =
    foes?.some(
      (f) =>
        f.alive &&
        Math.hypot(f.x - p.x, f.y - p.y) < 28 &&
        hasLineOfSight(map, p.x, p.y, f.x, f.y),
    )
      ? 0.45
      : 0
  if (Math.random() > Math.max(0.12, repathRate + huntBoost * dt)) return p

  return assignRoamPath(
    map,
    p,
    pickDestination(map, p, winChance, buffs, foes, allies),
  )
}

function advanceWaypoints(p: MatchPlayer): MatchPlayer {
  if (!p.alive) return p
  const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y)
  if (dist > 0.85) return p
  if (!p.waypoints.length) return p
  const [next, ...rest] = p.waypoints
  return { ...p, waypoints: rest, targetX: next.x, targetY: next.y }
}

/** units per second in map space */
function moveToward(p: MatchPlayer, teamSpeed: number, dt: number): MatchPlayer {
  if (!p.alive) return p
  let stepped = p
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

/** Soft body collision — slide past, don't lock into corridor deadlocks */
function separatePlayers(map: GameMap, players: MatchPlayer[]): MatchPlayer[] {
  const next = players.map((p) => ({ ...p }))
  for (let i = 0; i < next.length; i++) {
    if (!next[i].alive) continue
    for (let j = i + 1; j < next.length; j++) {
      if (!next[j].alive) continue
      const dx = next[j].x - next[i].x
      const dy = next[j].y - next[i].y
      const d = Math.hypot(dx, dy)
      if (d >= UNIT_SEP || d < 0.01) continue

      const nx = dx / d
      const ny = dy / d
      // Weaker push + lateral slide so units slip past each other
      const push = ((UNIT_SEP - d) / 2) * 0.55
      const side = 0.35
      const sx = -ny * side
      const sy = nx * side

      const tryMove = (idx: number, ox: number, oy: number) => {
        const nx2 = next[idx].x + ox
        const ny2 = next[idx].y + oy
        const cell = worldToCell(nx2, ny2)
        if (isOpenCell(map, cell.col, cell.row)) {
          next[idx].x = nx2
          next[idx].y = ny2
          return true
        }
        // Try pure lateral if forward push hits wall
        const lx = next[idx].x + (ox === 0 ? 0 : Math.sign(ox) === Math.sign(sx) ? sx : -sx)
        const ly = next[idx].y + (oy === 0 ? 0 : Math.sign(oy) === Math.sign(sy) ? sy : -sy)
        const lc = worldToCell(lx, ly)
        if (isOpenCell(map, lc.col, lc.row)) {
          next[idx].x = lx
          next[idx].y = ly
          return true
        }
        return false
      }

      // Unit closer to its goal yields less (keeps priority)
      const di = Math.hypot(next[i].targetX - next[i].x, next[i].targetY - next[i].y)
      const dj = Math.hypot(next[j].targetX - next[j].x, next[j].targetY - next[j].y)
      const iYield = di < dj ? 0.35 : 0.65
      const jYield = 1 - iYield

      tryMove(i, -nx * push * iYield + sx * (i % 2 === 0 ? 1 : -1), -ny * push * iYield + sy * (i % 2 === 0 ? 1 : -1))
      tryMove(j, nx * push * jYield + sx * (j % 2 === 0 ? 1 : -1), ny * push * jYield + sy * (j % 2 === 0 ? 1 : -1))
    }
  }
  return next
}

function markStuckProgress(
  before: MatchPlayer[],
  after: MatchPlayer[],
  dt: number,
): MatchPlayer[] {
  return after.map((p) => {
    if (!p.alive) return { ...p, stuckTime: 0 }
    const prev = before.find((b) => b.id === p.id)
    if (!prev) return p
    const moved = Math.hypot(p.x - prev.x, p.y - prev.y)
    const needMove =
      Math.hypot(p.targetX - p.x, p.targetY - p.y) > 1.4 || p.waypoints.length > 0
    if (needMove && moved < 0.12) {
      // Honor mid-tick repath resets (don't re-accumulate old stuckTime)
      const wasReset =
        (p.stuckTime ?? 0) === 0 && (prev.stuckTime ?? 0) > 0.3
      return {
        ...p,
        stuckTime: wasReset ? dt * 0.2 : (prev.stuckTime ?? 0) + dt,
      }
    }
    return { ...p, stuckTime: 0 }
  })
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
    const foes = state.players.filter(
      (o) => o.team !== p.team && o.alive,
    )
    const allies = state.players.filter(
      (o) => o.team === p.team && o.alive && o.id !== p.id,
    )
    const moved = moveToward(
      retarget(map, p, state.winChance, buffs, dt, foes, allies),
      teamSpeed,
      dt,
    )
    return {
      ...moved,
      firingTime: Math.max(0, moved.firingTime - dt),
    }
  })
  players = separatePlayers(map, players)
  players = markStuckProgress(state.players, players, dt)

  // Unstuck pass — clear deadlocks and peel to open ground
  const unstuckNames: string[] = []
  players = players.map((p) => {
    if (!p.alive || (p.stuckTime ?? 0) < 0.55) return p
    const from = worldToCell(p.x, p.y)
    const escape = randomOpenCell(map, from, 6)
    const ordered =
      p.orderedTime > 0.4 ? Math.max(2, p.orderedTime) : 0
    const next = assignRoamPath(map, p, escape, ordered)
    unstuckNames.push(p.name)
    return { ...next, stuckTime: 0 }
  })

  let gadgets = [...(state.gadgets ?? [])]
  const events = [...state.events]
  if (unstuckNames.length) {
    events.push(`Unstuck ${unstuckNames.slice(0, 3).join(', ')}`)
  }
  let orderMarker = state.orderMarker
  let fx: CombatFx[] = state.fx
    .map((f) => ({ ...f, life: f.life - dt }))
    .filter((f) => f.life > 0)
  let pendingCash = 0
  let fragStreak = state.fragStreak

  if (orderMarker && state.selectedUnitId) {
    const u = players.find((p) => p.id === state.selectedUnitId)
    if (u && Math.hypot(u.x - orderMarker.x, u.y - orderMarker.y) < 5) {
      orderMarker = null
    }
  }

  // Gadget AI — claymores on angle holds, frags when enemies stack mid-range
  const allyUtil = buffs.utility
  const enemyUtil = Math.max(1, 2.5 - buffs.intelligence * 0.15)
  for (const p of players) {
    if (!p.alive) continue
    const util = p.team === 'ally' ? allyUtil : enemyUtil
    const clayChance = (0.035 + util * 0.02) * dt
    const nadeChance = (0.045 + util * 0.025) * dt
    const holding =
      Math.hypot(p.x - p.targetX, p.y - p.targetY) < 2.2 &&
      isGoodAngleHold(map, p.x, p.y)

    if (holding && Math.random() < clayChance) {
      const g = placeClaymore(map, p, gadgets)
      if (g) {
        gadgets = [...gadgets, g]
        if (p.team === 'ally') events.push(`${p.name} planted claymore`)
      }
    }

    if (Math.random() < nadeChance) {
      const foes = players.filter((o) => o.team !== p.team && o.alive)
      if (foes.length) {
        const nearest = foes.reduce((best, f) =>
          Math.hypot(f.x - p.x, f.y - p.y) <
          Math.hypot(best.x - p.x, best.y - p.y)
            ? f
            : best,
        )
        const d = Math.hypot(nearest.x - p.x, nearest.y - p.y)
        if (d > 12 && d < 48 && hasLineOfSight(map, p.x, p.y, nearest.x, nearest.y)) {
          const thrown = throwFrag(p, nearest.x, nearest.y)
          gadgets = [...gadgets, thrown.gadget]
          fx.push(thrown.fx)
          events.push(`${p.name} cooked frag`)
        }
      }
    }
  }

  // Intelligence spots enemy claymores (probability scales with INT level)
  {
    const spotted = trySpotClaymores(
      gadgets,
      players,
      buffs.intelligence,
      'ally',
      dt,
    )
    gadgets = spotted.gadgets
    events.push(...spotted.events)

    // Enemies have weaker base intel to spot ours
    const enemySpot = trySpotClaymores(
      gadgets,
      players,
      Math.max(1, 3 - buffs.intelligence * 0.25),
      'enemy',
      dt * 0.55,
    )
    gadgets = enemySpot.gadgets
    events.push(...enemySpot.events)
  }

  // Tick traps + nades — utility buffs blast radius / damage
  {
    const result = tickGadgets(
      map,
      gadgets,
      players,
      { utility: buffs.utility },
      dt,
    )
    gadgets = result.gadgets
    players = result.players
    fx = [...fx, ...result.fx]
    events.push(...result.events)
    if (result.pendingCash > 0) {
      fragStreak += 1
      const payout = result.pendingCash + fragStreak * 350
      pendingCash += payout
      events.push(`+$${Math.round(payout / 100) / 10}K gadget`)
    }
    if (result.events.some((e) => e.includes('Walked into claymore'))) {
      fragStreak = 0
    }
  }

  // Skirmish only with clear line of sight (no wall-banging)
  const fightChance = (0.55 + buffs.utility * 0.08) * dt
  const fightRange = 22 + buffs.utility * 4

  if (Math.random() < fightChance) {
    const aliveAllies = players.filter((p) => p.alive && p.team === 'ally')
    const aliveEnemies = players.filter((p) => p.alive && p.team === 'enemy')
    if (aliveAllies.length && aliveEnemies.length) {
      // Prefer closest pair that can actually see each other
      type Pair = { a: (typeof aliveAllies)[0]; e: (typeof aliveEnemies)[0]; d: number }
      const visible: Pair[] = []
      for (const ally of aliveAllies) {
        for (const enemy of aliveEnemies) {
          const d = Math.hypot(ally.x - enemy.x, ally.y - enemy.y)
          if (d > fightRange) continue
          if (!hasLineOfSight(map, ally.x, ally.y, enemy.x, enemy.y)) continue
          visible.push({ a: ally, e: enemy, d })
        }
      }
      visible.sort((x, y) => x.d - y.d)

      if (visible.length) {
        const { a, e } = visible[0]
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

        // Double-check LOS at fire time (positions may have drifted)
        if (hasLineOfSight(map, shooter.x, shooter.y, target.x, target.y)) {
          const shotId = `fx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
          const willKill = target.hp - dmg <= 0
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
            kind: willKill ? 'kill' : 'hit',
            fromX: shooter.x,
            fromY: shooter.y,
            toX: target.x,
            toY: target.y,
            team: shooter.team,
            life: willKill ? 0.55 : 0.35,
            maxLife: willKill ? 0.55 : 0.35,
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
            if (shooter.team === 'ally') {
              fragStreak += 1
              const streakBonus = fragStreak >= 3 ? 900 * fragStreak : 0
              const payout = 1200 + dmg * 18 + streakBonus
              pendingCash += payout
              events.push(
                fragStreak >= 2
                  ? `+$${Math.round(payout / 100) / 10}K · ${fragStreak}x streak`
                  : `+$${Math.round(payout / 100) / 10}K frag`,
              )
            } else {
              fragStreak = 0
            }
          } else {
            players = players.map((p) =>
              p.id === target.id ? { ...p, hp: newHp } : p,
            )
            events.push(`${shooter.name} hit ${target.name} (−${dmg})`)
          }
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
        gadgets: [],
        pendingCash: 0,
        fragStreak: 0,
      }
    }

    timeLeft = 55
    orderMarker = null
    fx = []
    gadgets = []
    fragStreak = 0
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

  // Live data pulse for the match feed (~every 2s)
  const pulse = Math.floor(timeLeft / 2)
  const prevPulse = Math.floor(state.timeLeft / 2)
  if (pulse !== prevPulse) {
    const jammed = players.filter((p) => p.alive && (p.stuckTime ?? 0) > 0.25).length
    const moving = players.filter((p) => {
      if (!p.alive) return false
      return (
        p.waypoints.length > 0 ||
        Math.hypot(p.targetX - p.x, p.targetY - p.y) > 1.5
      )
    }).length
    const clays = gadgets.filter((g) => g.kind === 'claymore').length
    const nades = gadgets.filter((g) => g.kind === 'frag').length
    events.push(
      `LIVE · ${moving} moving · ${jammed} jammed · ${clays} clay · ${nades} nade`,
    )
  }

  return {
    ...state,
    round,
    allyScore,
    enemyScore,
    timeLeft,
    winChance: Math.round(winChance),
    players,
    events: events.slice(-10),
    orderMarker,
    fx,
    gadgets,
    pendingCash,
    fragStreak,
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
      stuckTime: 0,
    }
  }
  return [
    ...map.allySpawns.slice(0, 2).map((id, i) => mk(`preview_a${i}`, 'ready', 'ally', id)),
    ...map.enemySpawns.slice(0, 2).map((id, i) => mk(`preview_e${i}`, 'wait', 'enemy', id)),
  ]
}
