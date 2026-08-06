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
  canSeeThrough,
  isGoodAngleHold,
  placeClaymore,
  throwFrag,
  throwSmoke,
  tickGadgets,
  trySpotClaymores,
} from './gadgets'
import { buffsWithBrain, mapFamiliarity } from './learning'
import type {
  CombatFx,
  Gadget,
  MatchPlayer,
  MatchState,
  Player,
  PlayerRole,
  TacticalBrain,
  Team,
  Upgrade,
} from '../types'

let fxSeq = 0
function nextFxId(prefix = 'fx') {
  fxSeq += 1
  return `${prefix}_${fxSeq}`
}

const ENEMY_ROLES: PlayerRole[] = ['ENT', 'IGL', 'AWP', 'SUP', 'LURK']

const CALLOUTS = [
  { id: 'split_a', label: 'CALL: Split A', bias: 'a_site' },
  { id: 'stack_b', label: 'CALL: Stack B', bias: 'b_site' },
  { id: 'default_mid', label: 'CALL: Default mid', bias: 'mid' },
  { id: 'lurk_flank', label: 'CALL: Lurk flank', bias: 'flank' },
] as const

function roleMods(role: PlayerRole) {
  switch (role) {
    case 'AWP':
      return { range: 1.35, dmg: 1.25, aim: 1.2, hold: 1.15, speed: 0.92 }
    case 'ENT':
      return { range: 0.9, dmg: 1.15, aim: 0.95, hold: 0.85, speed: 1.12 }
    case 'IGL':
      return { range: 1.05, dmg: 0.95, aim: 1.05, hold: 1.1, speed: 1.0 }
    case 'SUP':
      return { range: 1.0, dmg: 0.9, aim: 1.0, hold: 1.05, speed: 1.05 }
    case 'LURK':
      return { range: 1.1, dmg: 1.05, aim: 1.1, hold: 1.2, speed: 0.98 }
    default:
      return { range: 1, dmg: 1, aim: 1, hold: 1, speed: 1 }
  }
}

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
    | 'commitTime'
    | 'aimTargetId'
    | 'aimTime'
    | 'fireCooldown'
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
    commitTime: 0.5 + Math.random() * 1.2,
    aimTargetId: null,
    aimTime: 0,
    fireCooldown: 0.3 + Math.random() * 0.5,
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
    peakStreak: 0,
    pendingXp: 0,
    pendingLessons: [],
    roundBanner: null,
    bannerTime: 0,
    callout: null,
    siteControl: 50,
    hotSite: null,
    plantProgress: 0,
    bombPlanted: false,
  }
}

export function startMatch(
  squad: Player[],
  opponent: Team,
  teamPower: number,
  previousMapId?: string | null,
  upgrades: Upgrade[] = [],
  brain?: TacticalBrain,
): MatchState {
  const map = pickRandomMap(previousMapId)
  const buffs = brain
    ? buffsWithBrain(buffsFromUpgrades(upgrades), brain)
    : buffsFromUpgrades(upgrades)
  const fam = brain ? mapFamiliarity(brain, map.id) : 0
  // Clear, strong upgrade + IQ impact on opening win%
  const powerBias =
    (buffs.power - 1) * 4.5 +
    (buffs.strategy - 1) * 3 +
    (buffs.intelligence - 1) * 1.5 +
    (brain ? (brain.iq - 1) * 0.8 + fam * 0.06 : 0)
  const winChance = Math.max(
    10,
    Math.min(
      90,
      Math.round((teamPower / (teamPower + opponent.power)) * 100 + powerBias),
    ),
  )

  const openingCall = CALLOUTS[Math.floor(Math.random() * CALLOUTS.length)]

  const allies: MatchPlayer[] = squad.slice(0, 5).map((p, i) => {
    const rm = roleMods(p.role)
    return spawnPlayer(
      map,
      {
        id: p.id,
        squadId: p.id,
        name: p.name,
        team: 'ally',
        role: p.role,
        maxHp: 100 + Math.floor(p.skills.clutch / 2),
        combat: Math.round(unitCombat(p) * (p.role === 'AWP' ? 1.08 : 1)),
        speed: unitSpeed(p) * rm.speed,
      },
      map.allySpawns[i] ?? map.allySpawns[0],
    )
  })

  const enemyNames = ['nyx', 'volt', 'shade', 'hexor', 'riptide']
  const enemies: MatchPlayer[] = enemyNames.map((name, i) => {
    const role = ENEMY_ROLES[i] ?? 'ENT'
    const rm = roleMods(role)
    return spawnPlayer(
      map,
      {
        id: `e_${i}`,
        squadId: null,
        name,
        team: 'enemy',
        role,
        maxHp: 100,
        combat: Math.round(
          (enemyCombat(i) + Math.floor(opponent.power / 80)) *
            (role === 'AWP' ? 1.1 : 1),
        ),
        speed: (1 + Math.random() * 0.25) * rm.speed,
      },
      map.enemySpawns[i] ?? map.enemySpawns[0],
    )
  })

  const iqLine = brain
    ? `Squad IQ ${brain.iq} · map read ${Math.round(fam)}%`
    : 'Squad IQ warming up'

  return {
    phase: 'live',
    round: 1,
    maxRounds: 16,
    allyScore: 0,
    enemyScore: 0,
    timeLeft: 70,
    winChance,
    mapId: map.id,
    mapName: map.name,
    players: [...allies, ...enemies],
    events: [
      `MAP → ${map.name}`,
      `vs ${opponent.name}`,
      iqLine,
      openingCall.label,
      describeBuffs(buffs),
      'Tap a green unit, then tap the map to move',
    ],
    opponentId: opponent.id,
    result: null,
    selectedUnitId: allies[0]?.id ?? null,
    orderMarker: null,
    fx: [],
    gadgets: [],
    pendingCash: 0,
    fragStreak: 0,
    peakStreak: 0,
    pendingXp: 0,
    pendingLessons: [],
    roundBanner: openingCall.label,
    bannerTime: 2.4,
    callout: openingCall.id,
    siteControl: 50,
    hotSite: null,
    plantProgress: 0,
    bombPlanted: false,
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
    return {
      ...p,
      waypoints: [],
      targetX: p.x,
      targetY: p.y,
      orderedTime,
      commitTime: Math.max(p.commitTime, 1.2),
    }
  }

  const [first, ...rest] = world
  // Commit longer on longer routes so they finish the push
  const commit = Math.min(5.5, 1.8 + world.length * 0.22)
  return {
    ...p,
    waypoints: rest,
    targetX: first.x,
    targetY: first.y,
    orderedTime,
    commitTime: orderedTime > 0 ? Math.max(orderedTime, commit) : commit,
    // Clear aim when committing to a new move (unless mid-order peek)
    aimTargetId: orderedTime > 0 ? p.aimTargetId : null,
    aimTime: orderedTime > 0 ? p.aimTime : 0,
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

export function commandHoldAngle(state: MatchState, unitId: string): MatchState {
  if (state.phase !== 'live') return state
  const players = state.players.map((p) => {
    if (p.id !== unitId || p.team !== 'ally' || !p.alive) return p
    // Freeze on current cell as a hard hold
    return {
      ...p,
      waypoints: [],
      targetX: p.x,
      targetY: p.y,
      orderedTime: 14,
      commitTime: 14,
      aimTargetId: p.aimTargetId,
    }
  })
  const unit = players.find((p) => p.id === unitId)
  const events = unit
    ? [...state.events, `${unit.name} HOLDING ANGLE`]
    : state.events
  return {
    ...state,
    players,
    selectedUnitId: unitId,
    orderMarker: unit ? { x: unit.x, y: unit.y } : state.orderMarker,
    events: events.slice(-8),
    roundBanner: unit ? `${unit.name.toUpperCase()} HOLD` : state.roundBanner,
    bannerTime: unit ? 1.1 : state.bannerTime,
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
      const rm = roleMods(p.role)
      return {
        ...mp,
        role: p.role,
        combat,
        speed: speed * rm.speed,
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
  mapFam = 0,
  callout: string | null = null,
): GridPoint {
  // Learned map memory → prefer known hold/flank routes
  const memoryBias = mapFam / 100
  const rm = roleMods(p.role ?? 'ENT')

  // IGL callout bias — signature FRAGLINE round order
  if (p.team === 'ally' && callout && Math.random() < 0.55) {
    if (callout === 'split_a' || callout === 'stack_b') {
      const site = callout === 'split_a' ? 'A' : 'B'
      const z = map.zones.find((zone) => zone.site === site)
      if (z) return { col: z.col, row: z.row }
    }
    if (callout === 'lurk_flank' && (p.role === 'LURK' || Math.random() < 0.5)) {
      if (map.flankZones.length) {
        const z = zoneById(
          map,
          map.flankZones[Math.floor(Math.random() * map.flankZones.length)],
        )
        return { col: z.col, row: z.row }
      }
    }
    if (callout === 'default_mid') {
      const mid =
        map.zones.find((z) => /mid|courtyard|bridge/i.test(z.id)) ??
        map.zones.find((z) => !z.site)
      if (mid) return { col: mid.col, row: mid.row }
    }
  }

  // Hold angles when defending — strategy + learned holds + role
  const wantHold =
    p.team === 'ally'
      ? winChance < 48 + buffs.strategy + memoryBias * 8
      : winChance > 52 - buffs.strategy

  if (
    wantHold &&
    Math.random() < (0.14 + buffs.strategy * 0.03 + memoryBias * 0.12) * rm.hold
  ) {
    const pool = p.team === 'ally' ? map.allyHold : map.enemyHold
    const candidates = pool
      .map((id) => zoneById(map, id))
      .filter((z) => isGoodAngleHold(map, z.x, z.y))
    if (candidates.length) {
      const z = candidates[Math.floor(Math.random() * candidates.length)]
      return { col: z.col, row: z.row }
    }
  }

  // Flank instead of stacking — intelligence + map memory
  if (allies?.length && Math.random() < 0.4 + buffs.intelligence * 0.05 + memoryBias * 0.15) {
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
    if (visible.length && Math.random() < 0.45 + buffs.strategy * 0.04 + memoryBias * 0.08) {
      const prey = visible[0].f
      const cell = worldToCell(prey.x, prey.y)
      return randomOpenCell(map, cell, 3)
    }
  }

  const aggressive =
    p.team === 'ally'
      ? winChance > 40 + buffs.strategy * 2 - memoryBias * 4
      : winChance < 60 - buffs.strategy * 2

  const useObjective =
    Math.random() < 0.3 + buffs.intelligence * 0.08 + buffs.strategy * 0.05 + memoryBias * 0.1

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
  const roamRadius = 4 + Math.min(8, Math.floor(buffs.intelligence / 2 + memoryBias * 3))
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
  mapFam = 0,
  callout: string | null = null,
  gadgets: Gadget[] = [],
): MatchPlayer {
  if (!p.alive) return p

  let next = {
    ...p,
    commitTime: Math.max(0, (p.commitTime ?? 0) - dt),
    fireCooldown: Math.max(0, (p.fireCooldown ?? 0) - dt),
  }

  // Engaging a visible foe — hold the angle, don't slingshot away
  const rm = roleMods(p.role ?? 'ENT')
  const engageRange = (24 + buffs.utility * 3) * rm.range
  const visibleFoe = (foes ?? []).find(
    (f) =>
      f.alive &&
      Math.hypot(f.x - next.x, f.y - next.y) < engageRange &&
      canSeeThrough(map, gadgets, next.x, next.y, f.x, f.y),
  )
  if (visibleFoe) {
    return {
      ...next,
      // Stay put / crawl while aiming
      waypoints: [],
      targetX: next.x,
      targetY: next.y,
      commitTime: Math.max(next.commitTime, 0.8),
      aimTargetId: visibleFoe.id,
      aimTime: (next.aimTargetId === visibleFoe.id ? next.aimTime : 0) + dt,
    }
  }

  // Lost LOS — clear aim lock
  if (next.aimTargetId) {
    next = { ...next, aimTargetId: null, aimTime: 0 }
  }

  // Forced unstuck only
  if (next.stuckTime > 0.7 && next.orderedTime <= 0) {
    const from = worldToCell(next.x, next.y)
    const escape = randomOpenCell(map, from, 4)
    return { ...assignRoamPath(map, next, escape), stuckTime: 0 }
  }

  if (next.orderedTime > 0) {
    return { ...next, orderedTime: Math.max(0, next.orderedTime - dt) }
  }

  // Still committed to current route
  if (next.commitTime > 0 && (next.waypoints.length > 0 || Math.hypot(next.targetX - next.x, next.targetY - next.y) > 1.5)) {
    return next
  }

  // Arrived / idle — occasional deliberate repath (not every tick)
  const arriveDist = Math.hypot(next.targetX - next.x, next.targetY - next.y)
  if (arriveDist > 1.4 || next.waypoints.length > 0) return next

  // ~1 repath every 2.5–4s once settled
  const repathChance = (0.28 + buffs.intelligence * 0.02 + mapFam * 0.001) * dt
  if (Math.random() > repathChance) return next

  return assignRoamPath(
    map,
    next,
    pickDestination(map, next, winChance, buffs, foes, allies, mapFam, callout),
  )
}

function advanceWaypoints(p: MatchPlayer): MatchPlayer {
  if (!p.alive) return p
  const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y)
  if (dist > 1.1) return p
  if (!p.waypoints.length) return p
  const [next, ...rest] = p.waypoints
  return { ...p, waypoints: rest, targetX: next.x, targetY: next.y }
}

/** units per second in map space */
function moveToward(p: MatchPlayer, teamSpeed: number, dt: number): MatchPlayer {
  if (!p.alive) return p
  // Freeze locomotion while aiming / firing
  if (p.aimTargetId || p.firingTime > 0.05) {
    return {
      ...p,
      waypoints: [],
      targetX: p.x,
      targetY: p.y,
    }
  }

  let stepped = advanceWaypoints(p)
  const dx = stepped.targetX - stepped.x
  const dy = stepped.targetY - stepped.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.2) return stepped
  const speed = teamSpeed * p.speed
  const step = Math.min(speed * dt, dist)
  return {
    ...stepped,
    x: stepped.x + (dx / dist) * step,
    y: stepped.y + (dy / dist) * step,
  }
}

/** Soft body collision — gentle slide, avoid jitter while aiming */
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

      // Aiming units barely get shoved — stops slingshot jitter in duels
      const iAim = !!next[i].aimTargetId
      const jAim = !!next[j].aimTargetId
      const nx = dx / d
      const ny = dy / d
      const push = ((UNIT_SEP - d) / 2) * (iAim || jAim ? 0.22 : 0.42)
      const side = iAim || jAim ? 0.12 : 0.28
      const sx = -ny * side
      const sy = nx * side

      const tryMove = (idx: number, ox: number, oy: number, scale: number) => {
        const nx2 = next[idx].x + ox * scale
        const ny2 = next[idx].y + oy * scale
        const cell = worldToCell(nx2, ny2)
        if (isOpenCell(map, cell.col, cell.row)) {
          next[idx].x = nx2
          next[idx].y = ny2
          return true
        }
        return false
      }

      const di = Math.hypot(next[i].targetX - next[i].x, next[i].targetY - next[i].y)
      const dj = Math.hypot(next[j].targetX - next[j].x, next[j].targetY - next[j].y)
      const iYield = iAim ? 0.15 : di < dj ? 0.35 : 0.65
      const jYield = jAim ? 0.15 : 1 - iYield

      tryMove(
        i,
        -nx * push * iYield + sx * (i % 2 === 0 ? 1 : -1),
        -ny * push * iYield + sy * (i % 2 === 0 ? 1 : -1),
        1,
      )
      tryMove(
        j,
        nx * push * jYield + sx * (j % 2 === 0 ? 1 : -1),
        ny * push * jYield + sy * (j % 2 === 0 ? 1 : -1),
        1,
      )
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
    if (p.aimTargetId) return { ...p, stuckTime: 0 }
    const prev = before.find((b) => b.id === p.id)
    if (!prev) return p
    const moved = Math.hypot(p.x - prev.x, p.y - prev.y)
    const needMove =
      Math.hypot(p.targetX - p.x, p.targetY - p.y) > 1.4 || p.waypoints.length > 0
    if (needMove && moved < 0.08) {
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
  brain?: TacticalBrain,
): MatchState {
  if (state.phase !== 'live') return state
  const map = getMap(state.mapId)
  const buffs = brain
    ? buffsWithBrain(buffsFromUpgrades(upgrades), brain)
    : buffsFromUpgrades(upgrades)
  const mapFam = brain ? mapFamiliarity(brain, state.mapId) : 0
  // Steady pace — no slingshot sprinting across the arena
  const teamSpeed = 9.5 + buffs.reflex * 1.4

  let timeLeft = state.timeLeft - dt
  let round = state.round
  let allyScore = state.allyScore
  let enemyScore = state.enemyScore
  let bannerTime = Math.max(0, (state.bannerTime ?? 0) - dt)
  let roundBanner = bannerTime > 0 ? state.roundBanner : null
  let callout = state.callout ?? null
  let players = state.players.map((p) => {
    const foes = state.players.filter(
      (o) => o.team !== p.team && o.alive,
    )
    const allies = state.players.filter(
      (o) => o.team === p.team && o.alive && o.id !== p.id,
    )
    const moved = moveToward(
      retarget(
        map,
        p,
        state.winChance,
        buffs,
        dt,
        foes,
        allies,
        mapFam,
        callout,
        state.gadgets ?? [],
      ),
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

  // Unstuck pass — rarer, only truly jammed movers
  const unstuckNames: string[] = []
  players = players.map((p) => {
    if (!p.alive || p.aimTargetId || (p.stuckTime ?? 0) < 0.85) return p
    if (p.orderedTime > 0.2) return p
    const from = worldToCell(p.x, p.y)
    const escape = randomOpenCell(map, from, 5)
    const next = assignRoamPath(map, p, escape)
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
  let pendingXp = 0
  const pendingLessons: string[] = []
  let fragStreak = state.fragStreak
  let peakStreak = state.peakStreak ?? 0

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
        if (p.team === 'ally') {
          events.push(`${p.name} planted claymore`)
          pendingXp += 2.2
        }
      }
    }


    if (Math.random() < ((p.role === 'SUP' ? 0.07 : 0.025) + util * 0.015) * dt) {
      const foes = players.filter((o) => o.team !== p.team && o.alive)
      if (foes.length) {
        const nearest = foes.reduce((best, f) =>
          Math.hypot(f.x - p.x, f.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)
            ? f
            : best,
        )
        const d = Math.hypot(nearest.x - p.x, nearest.y - p.y)
        if (d > 10 && d < 48) {
          const thrown = throwSmoke(p, (p.x + nearest.x) / 2, (p.y + nearest.y) / 2)
          gadgets = [...gadgets, thrown.gadget]
          fx = [...fx, thrown.fx]
          if (p.team === 'ally') {
            events.push(`${p.name} smoked the lane`)
            pendingXp += 1.8
          }
        }
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
        if (d > 14 && d < 58 && hasLineOfSight(map, p.x, p.y, nearest.x, nearest.y)) {
          const thrown = throwFrag(p, nearest.x, nearest.y)
          gadgets = [...gadgets, thrown.gadget]
          fx.push(thrown.fx)
          events.push(`${p.name} cooked frag`)
          if (p.team === 'ally') pendingXp += 1.8
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
    if (spotted.events.length) {
      pendingXp += spotted.events.length * 3.2
      if (Math.random() < 0.4) pendingLessons.push('Studying trap timings…')
    }

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
      peakStreak = Math.max(peakStreak, fragStreak)
      const payout = result.pendingCash + fragStreak * 350
      pendingCash += payout
      pendingXp += 4
      events.push(`+$${Math.round(payout / 100) / 10}K gadget`)
    }
    if (result.events.some((e) => e.includes('Walked into claymore'))) {
      fragStreak = 0
    }
  }

  // Purposeful gunfights — each unit aims at a locked target, then fires
  const baseAimNeeded = Math.max(0.28, 0.55 - buffs.reflex * 0.03)
  const baseEngage = 24 + buffs.utility * 3
  {
    const byId = new Map(players.map((p) => [p.id, p]))
    const shots: {
      shooterId: string
      targetId: string
      dmg: number
      willKill: boolean
    }[] = []

    for (const shooter of players) {
      if (!shooter.alive) continue
      if ((shooter.fireCooldown ?? 0) > 0) continue
      const rm = roleMods(shooter.role ?? 'ENT')
      const aimNeeded = baseAimNeeded / rm.aim
      const engageRange = baseEngage * rm.range
      if (!shooter.aimTargetId || (shooter.aimTime ?? 0) < aimNeeded) continue
      const target = byId.get(shooter.aimTargetId)
      if (!target?.alive || target.team === shooter.team) {
        players = players.map((p) =>
          p.id === shooter.id ? { ...p, aimTargetId: null, aimTime: 0 } : p,
        )
        continue
      }
      const d = Math.hypot(target.x - shooter.x, target.y - shooter.y)
      if (
        d > engageRange + 2 ||
        !canSeeThrough(map, gadgets, shooter.x, shooter.y, target.x, target.y)
      ) {
        players = players.map((p) =>
          p.id === shooter.id ? { ...p, aimTargetId: null, aimTime: 0 } : p,
        )
        continue
      }

      const late = timeLeft < 18 || players.filter((p) => p.alive).length <= 4
      const clutchBias = late ? buffs.clutch * 2.5 : buffs.clutch * 0.4
      const combatDelta = (shooter.combat - target.combat) * 0.4
      const teamBias =
        shooter.team === 'ally' ? (buffs.power - 1) * 3 : -(buffs.power - 1) * 1.5
      const hitChance = Math.max(
        28,
        Math.min(
          88,
          52 + combatDelta + clutchBias + teamBias + (shooter.aimTime - aimNeeded) * 12,
        ),
      )
      const hit = Math.random() * 100 < hitChance
      if (!hit) {
        const overshoot = 4 + Math.random() * 6
        const ang = Math.atan2(target.y - shooter.y, target.x - shooter.x)
        const missX = target.x + Math.cos(ang) * overshoot + (Math.random() * 6 - 3)
        const missY = target.y + Math.sin(ang) * overshoot + (Math.random() * 6 - 3)
        fx.push({
          id: nextFxId('shot'),
          kind: 'shot',
          fromX: shooter.x,
          fromY: shooter.y,
          toX: missX,
          toY: missY,
          team: shooter.team,
          life: 0.22,
          maxLife: 0.22,
        })
        players = players.map((p) =>
          p.id === shooter.id
            ? {
                ...p,
                firingTime: 0.18,
                fireCooldown: 0.55 + Math.random() * 0.25,
                aimTime: aimNeeded * 0.35,
              }
            : p,
        )
        continue
      }

      const dmg = Math.round(
        (22 + buffs.power * 3 + Math.floor(Math.random() * 14)) * rm.dmg,
      )
      shots.push({
        shooterId: shooter.id,
        targetId: target.id,
        dmg,
        willKill: target.hp - dmg <= 0,
      })
    }

    for (const shot of shots) {
      const shooter = players.find((p) => p.id === shot.shooterId)
      const target = players.find((p) => p.id === shot.targetId)
      if (!shooter?.alive || !target?.alive) continue

      fx.push({
        id: nextFxId('shot'),
        kind: 'shot',
        fromX: shooter.x,
        fromY: shooter.y,
        toX: target.x,
        toY: target.y,
        team: shooter.team,
        life: 0.26,
        maxLife: 0.26,
      })
      fx.push({
        id: nextFxId('hit'),
        kind: shot.willKill ? 'kill' : 'hit',
        fromX: shooter.x,
        fromY: shooter.y,
        toX: target.x,
        toY: target.y,
        team: shooter.team,
        life: shot.willKill ? 0.9 : 0.32,
        maxLife: shot.willKill ? 0.9 : 0.32,
      })

      players = players.map((p) => {
        if (p.id === shooter.id) {
          return {
            ...p,
            firingTime: 0.2,
            fireCooldown: 0.65 + Math.random() * 0.3,
            aimTime: 0,
            aimTargetId: shot.willKill ? null : p.aimTargetId,
          }
        }
        if (p.id === target.id) {
          const hp = p.hp - shot.dmg
          if (hp <= 0) return { ...p, alive: false, hp: 0, aimTargetId: null, aimTime: 0 }
          return { ...p, hp }
        }
        return p
      })

      if (shot.willKill) {
        events.push(`${shooter.name} fragged ${target.name}`)
        if (shooter.team === 'ally') {
          fragStreak += 1
          peakStreak = Math.max(peakStreak, fragStreak)
          const streakBonus = fragStreak >= 3 ? 900 * fragStreak : 0
          const payout = 1200 + shot.dmg * 18 + streakBonus
          pendingCash += payout
          pendingXp += 2.5 + fragStreak * 0.6
          const cashLabel =
            fragStreak >= 2
              ? `${fragStreak}x +$${Math.round(payout / 100) / 10}K`
              : `+$${Math.round(payout / 100) / 10}K`
          fx.push({
            id: nextFxId('float'),
            kind: 'float',
            fromX: target.x,
            fromY: target.y,
            toX: target.x,
            toY: target.y - 8,
            team: 'ally',
            life: 1.15,
            maxLife: 1.15,
            label: 'FRAG',
            amount: payout,
          })
          fx.push({
            id: nextFxId('cash'),
            kind: 'float',
            fromX: target.x + 2,
            fromY: target.y - 2,
            toX: target.x + 2,
            toY: target.y - 12,
            team: 'ally',
            life: 1.25,
            maxLife: 1.25,
            label: cashLabel,
          })
          events.push(cashLabel)
          if (fragStreak >= 5) {
            roundBanner = 'ACE'
            bannerTime = 1.6
            events.push('ACE — clean round')
          } else if (
            players.filter((p) => p.alive && p.team === 'ally').length === 1
          ) {
            roundBanner = 'CLUTCH TIME'
            bannerTime = 1.4
          }
        } else {
          fragStreak = 0
          fx.push({
            id: nextFxId('float'),
            kind: 'float',
            fromX: target.x,
            fromY: target.y,
            toX: target.x,
            toY: target.y - 8,
            team: 'enemy',
            life: 0.9,
            maxLife: 0.9,
            label: 'DOWN',
          })
        }
      }
    }
  }

  const alliesAlive = players.filter((p) => p.alive && p.team === 'ally').length
  const enemiesAlive = players.filter((p) => p.alive && p.team === 'enemy').length

  // Site control — unique FRAGLINE objective layer
  let siteControl = state.siteControl ?? 50
  let hotSite: 'A' | 'B' | null = state.hotSite ?? null
  {
    const sites = map.zones.filter((z) => z.site)
    let best: { site: 'A' | 'B'; score: number } | null = null
    for (const z of sites) {
      if (!z.site) continue
      const nearAlly = players.filter(
        (p) => p.alive && p.team === 'ally' && Math.hypot(p.x - z.x, p.y - z.y) < 18,
      ).length
      const nearEnemy = players.filter(
        (p) => p.alive && p.team === 'enemy' && Math.hypot(p.x - z.x, p.y - z.y) < 18,
      ).length
      const score = nearAlly - nearEnemy
      if (!best || Math.abs(score) > Math.abs(best.score)) {
        best = { site: z.site, score }
      }
      siteControl += (nearAlly - nearEnemy) * 7 * dt
    }
    siteControl = Math.max(0, Math.min(100, siteControl))
    hotSite = best?.site ?? null
    if (best && Math.abs(best.score) >= 2 && Math.random() < 0.015) {
      events.push(
        best.score > 0
          ? `Site ${best.site} pressure · ${Math.round(siteControl)}%`
          : `Losing site ${best.site} · ${Math.round(siteControl)}%`,
      )
    }
  }

  let plantProgress = state.plantProgress ?? 0
  let bombPlanted = state.bombPlanted ?? false
  {
    const siteZone = hotSite
      ? map.zones.find((z) => z.site === hotSite)
      : null
    if (siteZone && !bombPlanted) {
      const planters = players.filter(
        (p) =>
          p.alive &&
          p.team === 'ally' &&
          Math.hypot(p.x - siteZone.x, p.y - siteZone.y) < 14,
      ).length
      const defenders = players.filter(
        (p) =>
          p.alive &&
          p.team === 'enemy' &&
          Math.hypot(p.x - siteZone.x, p.y - siteZone.y) < 14,
      ).length
      if (planters > 0 && siteControl >= 58 && planters >= defenders) {
        plantProgress = Math.min(100, plantProgress + (12 + planters * 6) * dt)
        if (plantProgress >= 100) {
          bombPlanted = true
          plantProgress = 100
          timeLeft = Math.min(timeLeft, 28)
          roundBanner = `BOMB PLANTED · ${hotSite}`
          bannerTime = 1.8
          events.push(`Bomb planted on ${hotSite}`)
          pendingXp += 10
          pendingCash += 2200
        }
      } else if (defenders > planters) {
        plantProgress = Math.max(0, plantProgress - 18 * dt)
      }
    } else if (bombPlanted && siteZone) {
      const defusers = players.filter(
        (p) =>
          p.alive &&
          p.team === 'enemy' &&
          Math.hypot(p.x - siteZone.x, p.y - siteZone.y) < 12,
      ).length
      if (defusers > 0) {
        plantProgress = Math.max(0, plantProgress - 22 * dt)
        if (plantProgress <= 0) {
          bombPlanted = false
          roundBanner = 'BOMB DEFUSED'
          bannerTime = 1.5
          events.push('Bomb defused')
        }
      }
    }
  }

  const roundOver =
    timeLeft <= 0 ||
    alliesAlive === 0 ||
    enemiesAlive === 0 ||
    (bombPlanted && timeLeft <= 0)

  if (roundOver) {
    const sitePressure = buffs.strategy * 0.06
    // Time-up: site control decides (not a coin flip)
    const allyWonRound =
      enemiesAlive === 0 ||
      (bombPlanted && timeLeft <= 0 && alliesAlive > 0) ||
      (!bombPlanted && timeLeft <= 0 && siteControl >= 55) ||
      (timeLeft <= 0 && siteControl > 45 && alliesAlive > enemiesAlive) ||
      (alliesAlive > enemiesAlive && Math.random() < 0.18 + sitePressure)

    if (allyWonRound) {
      allyScore += 1
      events.push(`Round ${round} won · ${allyScore}–${enemyScore}`)
      pendingXp += 8
      roundBanner = `ROUND WON  ${allyScore}–${enemyScore}`
      bannerTime = 1.8
      if (Math.random() < 0.45) pendingLessons.push('Round win locked into playbook')
    } else {
      enemyScore += 1
      events.push(`Round ${round} lost · ${allyScore}–${enemyScore}`)
      pendingXp += 4
      roundBanner = `ROUND LOST  ${allyScore}–${enemyScore}`
      bannerTime = 1.8
      if (Math.random() < 0.5) pendingLessons.push('Adjusting holds after round loss')
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
        events: events.slice(-10),
        result,
        orderMarker: null,
        fx: [],
        gadgets: [],
        pendingCash, // keep final-tick frag payouts
        fragStreak: 0,
        peakStreak,
        pendingXp,
        pendingLessons,
        roundBanner:
          result === 'win' ? 'MATCH WON' : result === 'draw' ? 'DRAW' : 'MATCH LOST',
        bannerTime: 2.2,
        callout: null,
        siteControl,
        hotSite,
        plantProgress,
        bombPlanted,
      }
    }

    const nextCall = CALLOUTS[Math.floor(Math.random() * CALLOUTS.length)]
    callout = nextCall.id
    roundBanner = `${roundBanner ?? 'ROUND'} · ${nextCall.label}`
    bannerTime = 2.2
    siteControl = 50
    hotSite = null
    plantProgress = 0
    bombPlanted = false

    timeLeft = 70
    orderMarker = null
    // Keep float FX briefly into next round
    fx = fx.filter((f) => f.kind === 'float').slice(-6)
    gadgets = []
    // Keep match streak dopamine — only soft decay
    fragStreak = Math.max(0, fragStreak - 1)
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
          role: p.role ?? 'ENT',
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

  // Priority feed only — kill/round/callouts (telemetry lives in HUD chips)
  const priority = events.filter((e) => !e.startsWith('LIVE'))

  return {
    ...state,
    round,
    allyScore,
    enemyScore,
    timeLeft,
    winChance: Math.round(winChance),
    players,
    events: priority.slice(-8),
    orderMarker,
    fx: fx.slice(-24),
    gadgets,
    pendingCash,
    fragStreak,
    peakStreak,
    pendingXp,
    pendingLessons,
    roundBanner,
    bannerTime,
    callout,
    siteControl,
    hotSite,
    plantProgress,
    bombPlanted,
  }
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function idlePreviewPlayers(map: GameMap, t = 0): MatchPlayer[] {
  const mk = (
    id: string,
    name: string,
    team: 'ally' | 'enemy',
    zoneId: string,
    role: PlayerRole,
    phase: number,
  ): MatchPlayer => {
    const z = zoneById(map, zoneId)
    // Soft ghost drift for idle VOD fantasy
    const drift = Math.sin(t * 0.7 + phase) * 3.2
    const driftY = Math.cos(t * 0.55 + phase) * 2.4
    return {
      id,
      squadId: null,
      name,
      team,
      role,
      x: z.x + drift,
      y: z.y + driftY,
      alive: true,
      hp: 100,
      maxHp: 100,
      combat: 50,
      speed: 1,
      targetX: z.x + drift,
      targetY: z.y + driftY,
      waypoints: [],
      orderedTime: 0,
      firingTime: 0,
      stuckTime: 0,
      commitTime: 0,
      aimTargetId: null,
      aimTime: 0,
      fireCooldown: 0,
    }
  }
  const roles: PlayerRole[] = ['ENT', 'IGL', 'AWP', 'SUP']
  return [
    ...map.allySpawns.slice(0, 3).map((id, i) =>
      mk(`preview_a${i}`, 'ghost', 'ally', id, roles[i] ?? 'ENT', i * 1.2),
    ),
    ...map.enemySpawns.slice(0, 3).map((id, i) =>
      mk(`preview_e${i}`, 'rival', 'enemy', id, roles[i] ?? 'LURK', i * 1.4 + 2),
    ),
  ]
}
