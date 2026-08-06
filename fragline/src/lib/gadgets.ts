import { CELL, GRID, hasLineOfSight, type GameMap } from '../data/map'
import type { CombatFx, Gadget, MatchPlayer } from '../types'

let gadgetSeq = 0

export function makeGadgetId() {
  gadgetSeq += 1
  return `g_${Date.now()}_${gadgetSeq}`
}

/** Chance intel spots an enemy claymore when nearby (base per-second rate) */
export function claymoreSpotChance(intelLevel: number): number {
  // Lv1 ~22%/s, Lv2 ~34%, Lv5 ~58%, Lv8 ~82%
  return Math.min(0.92, 0.1 + intelLevel * 0.12)
}

export function trySpotClaymores(
  gadgets: Gadget[],
  viewers: MatchPlayer[],
  intelLevel: number,
  viewerTeam: 'ally' | 'enemy',
  dt: number,
): { gadgets: Gadget[]; events: string[] } {
  const events: string[] = []
  const rate = claymoreSpotChance(intelLevel)
  const next = gadgets.map((g) => {
    if (g.kind !== 'claymore' || g.team === viewerTeam || g.spotted) return g
    const near = viewers.some(
      (v) =>
        v.alive &&
        v.team === viewerTeam &&
        Math.hypot(v.x - g.x, v.y - g.y) < 20,
    )
    if (!near) return g
    // Probability scales with dt so intel feels like a % chance over time
    if (Math.random() < rate * dt) {
      events.push(
        viewerTeam === 'ally'
          ? `Intel spotted enemy claymore`
          : `Enemy spotted our claymore`,
      )
      return { ...g, spotted: true }
    }
    return g
  })
  return { gadgets: next, events }
}

export function placeClaymore(
  map: GameMap,
  placer: MatchPlayer,
  existing: Gadget[],
): Gadget | null {
  const teamCount = existing.filter(
    (g) => g.kind === 'claymore' && g.team === placer.team && g.fuse > -1,
  ).length
  if (teamCount >= 3) return null

  // Face toward map mid / likely approach
  const cx = map.size / 2
  const cy = map.size / 2
  const facing = Math.atan2(cy - placer.y, cx - placer.x)

  return {
    id: makeGadgetId(),
    kind: 'claymore',
    team: placer.team,
    x: placer.x + Math.cos(facing) * 2.8,
    y: placer.y + Math.sin(facing) * 2.8,
    facing,
    fuse: 0.85,
    spotted: placer.team === 'ally',
    ownerId: placer.id,
  }
}

export function throwFrag(
  thrower: MatchPlayer,
  targetX: number,
  targetY: number,
): { gadget: Gadget; fx: CombatFx } {
  const tx = targetX + (Math.random() * 5 - 2.5)
  const ty = targetY + (Math.random() * 5 - 2.5)
  return {
    gadget: {
      id: makeGadgetId(),
      kind: 'frag',
      team: thrower.team,
      x: tx,
      y: ty,
      facing: 0,
      fuse: 0.9,
      spotted: true,
      ownerId: thrower.id,
    },
    fx: {
      id: `fx_nade_${Date.now()}_${gadgetSeq}`,
      kind: 'nade',
      fromX: thrower.x,
      fromY: thrower.y,
      toX: tx,
      toY: ty,
      team: thrower.team,
      life: 0.55,
      maxLife: 0.55,
    },
  }
}

/** Soft vision denial — fuse counts down remaining smoke life */
export function throwSmoke(
  thrower: MatchPlayer,
  targetX: number,
  targetY: number,
): { gadget: Gadget; fx: CombatFx } {
  const tx = targetX + (Math.random() * 4 - 2)
  const ty = targetY + (Math.random() * 4 - 2)
  return {
    gadget: {
      id: makeGadgetId(),
      kind: 'smoke',
      team: thrower.team,
      x: tx,
      y: ty,
      facing: 0,
      fuse: 7.5,
      spotted: true,
      ownerId: thrower.id,
    },
    fx: {
      id: `fx_smoke_${Date.now()}_${gadgetSeq}`,
      kind: 'smoke',
      fromX: thrower.x,
      fromY: thrower.y,
      toX: tx,
      toY: ty,
      team: thrower.team,
      life: 0.7,
      maxLife: 0.7,
    },
  }
}

/** True if vision between two points is denied by an active smoke cloud */
export function visionBlockedBySmoke(
  gadgets: Gadget[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const smokes = gadgets.filter((g) => g.kind === 'smoke' && g.fuse > 0)
  if (!smokes.length) return false
  for (const s of smokes) {
    const r = 11
    // Block if either end is inside the cloud or the segment passes near center
    if (Math.hypot(x1 - s.x, y1 - s.y) < r) return true
    if (Math.hypot(x2 - s.x, y2 - s.y) < r) return true
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    if (Math.hypot(mx - s.x, my - s.y) < r * 0.85) return true
  }
  return false
}

export function canSeeThrough(
  map: GameMap,
  gadgets: Gadget[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (!hasLineOfSight(map, x1, y1, x2, y2)) return false
  if (visionBlockedBySmoke(gadgets, x1, y1, x2, y2)) return false
  return true
}

export function tickGadgets(
  map: GameMap,
  gadgets: Gadget[],
  players: MatchPlayer[],
  buffs: { utility: number },
  dt: number,
): {
  gadgets: Gadget[]
  players: MatchPlayer[]
  fx: CombatFx[]
  events: string[]
  pendingCash: number
} {
  const events: string[] = []
  const fx: CombatFx[] = []
  let pendingCash = 0
  let nextPlayers = [...players]
  const kept: Gadget[] = []

  for (const g of gadgets) {
    const fuse = g.fuse - dt

    if (g.kind === 'frag') {
      if (fuse > 0) {
        kept.push({ ...g, fuse })
        continue
      }
      const radius = 12 + buffs.utility * 0.7
      fx.push({
        id: `fx_boom_${g.id}`,
        kind: 'nade',
        fromX: g.x,
        fromY: g.y,
        toX: g.x,
        toY: g.y,
        team: g.team,
        life: 0.55,
        maxLife: 0.55,
      })
      events.push(`${g.team === 'ally' ? 'Frag' : 'Enemy frag'} detonated`)
      nextPlayers = nextPlayers.map((p) => {
        if (!p.alive || p.team === g.team) return p
        const d = Math.hypot(p.x - g.x, p.y - g.y)
        if (d > radius) return p
        if (!hasLineOfSight(map, g.x, g.y, p.x, p.y)) return p
        const dmg = Math.round(40 + buffs.utility * 5 - d * 1.4)
        const hp = p.hp - Math.max(14, dmg)
        if (hp <= 0) {
          events.push(`Nade fragged ${p.name}`)
          if (g.team === 'ally') pendingCash += 1500
          return { ...p, alive: false, hp: 0 }
        }
        return { ...p, hp }
      })
      continue
    }

    if (g.kind === 'claymore') {
      const armed = { ...g, fuse: Math.max(0, fuse) }
      if (armed.fuse > 0) {
        kept.push(armed)
        continue
      }

      const victims = nextPlayers.filter((p) => {
        if (!p.alive || p.team === g.team) return false
        const dx = p.x - g.x
        const dy = p.y - g.y
        const d = Math.hypot(dx, dy)
        if (d > 10 || d < 0.4) return false
        const ang = Math.atan2(dy, dx)
        let diff = ang - g.facing
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        if (Math.abs(diff) > 0.9) return false
        return hasLineOfSight(map, g.x, g.y, p.x, p.y)
      })

      if (victims.length) {
        fx.push({
          id: `fx_clay_${g.id}`,
          kind: 'claymore',
          fromX: g.x,
          fromY: g.y,
          toX: victims[0].x,
          toY: victims[0].y,
          team: g.team,
          life: 0.5,
          maxLife: 0.5,
        })
        events.push(
          g.team === 'ally' ? 'Claymore triggered!' : 'Walked into claymore!',
        )
        const hit = victims[0]
        nextPlayers = nextPlayers.map((p) => {
          if (p.id !== hit.id) return p
          const hp = p.hp - (58 + buffs.utility * 4)
          if (hp <= 0) {
            if (g.team === 'ally') pendingCash += 1700
            return { ...p, alive: false, hp: 0 }
          }
          return { ...p, hp }
        })
        continue
      }
      kept.push(armed)
      continue
    }

    if (g.kind === 'smoke') {
      if (fuse > 0) {
        kept.push({ ...g, fuse })
        continue
      }
      // Cloud expired
      continue
    }

    if (fuse > -2) kept.push({ ...g, fuse })
  }

  return { gadgets: kept.slice(-16), players: nextPlayers, fx, events, pendingCash }
}

/** Corner / doorway hold — adjacent to 1–3 walls */
export function isGoodAngleHold(map: GameMap, x: number, y: number): boolean {
  let wallNeighbors = 0
  const cellX = Math.floor(x / CELL)
  const cellY = Math.floor(y / CELL)
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const c = cellX + dc
    const r = cellY + dr
    if (c < 0 || r < 0 || c >= GRID || r >= GRID) continue
    if (map.grid[r]?.[c]) wallNeighbors++
  }
  return wallNeighbors >= 1 && wallNeighbors <= 3
}
