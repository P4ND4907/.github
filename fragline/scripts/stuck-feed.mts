/**
 * Headless live-feed: run match ticks and log stuck / jammed units.
 */
import { createIdleMatch, startMatch, tickMatch, buffsFromUpgrades } from '../src/lib/matchSim'
import { getMap, isOpenCell, worldToCell, UNIT_SEP } from '../src/data/map'
import type { Upgrade } from '../src/types'

const upgrades: Upgrade[] = [
  { id: 'power', name: 'Power', blurb: '', icon: '', level: 2, powerPerLevel: 2, baseCost: 1, stat: 'power' },
  { id: 'intelligence', name: 'Intelligence', blurb: '', icon: '', level: 2, powerPerLevel: 1, baseCost: 1, stat: 'intelligence' },
  { id: 'strategy', name: 'Strategy', blurb: '', icon: '', level: 2, powerPerLevel: 2, baseCost: 1, stat: 'strategy' },
  { id: 'reflex', name: 'Reflex', blurb: '', icon: '', level: 2, powerPerLevel: 1, baseCost: 1, stat: 'reflex' },
  { id: 'utility', name: 'Utility', blurb: '', icon: '', level: 2, powerPerLevel: 1, baseCost: 1, stat: 'utility' },
  { id: 'clutch', name: 'Clutch', blurb: '', icon: '', level: 1, powerPerLevel: 2, baseCost: 1, stat: 'clutch' },
]

const squad = Array.from({ length: 5 }, (_, i) => ({
  id: `s${i}`,
  name: `A${i}`,
  role: 'ENT' as const,
  rarity: 'Rare' as const,
  nationality: 'US',
  skills: { aim: 40, reflex: 40, recoil: 40, positioning: 40, utility: 40, clutch: 40 },
  level: 3,
}))

const enemy = {
  id: 'opp',
  name: 'Rival',
  tag: 'RVL',
  power: 55,
  w: 0,
  d: 0,
  l: 0,
  fd: 0,
  pts: 0,
}

type Sample = {
  id: string
  name: string
  team: string
  moved: number
  distToTarget: number
  waypoints: number
  nearWall: boolean
  jammed: number // others within UNIT_SEP
  inWall: boolean
  holding: boolean
}

const stuckBuckets: Record<string, number> = {
  zeroMove: 0,
  zeroMoveWithWaypoints: 0,
  zeroMoveAtTarget: 0,
  jammedCluster: 0,
  inWall: 0,
  samples: 0,
}

const examples: string[] = []

function analyze(state: ReturnType<typeof tickMatch>, prev: Map<string, { x: number; y: number }>) {
  const map = getMap(state.mapId)
  for (const p of state.players) {
    if (!p.alive) continue
    stuckBuckets.samples++
    const before = prev.get(p.id) ?? { x: p.x, y: p.y }
    const moved = Math.hypot(p.x - before.x, p.y - before.y)
    const distToTarget = Math.hypot(p.targetX - p.x, p.targetY - p.y)
    const cell = worldToCell(p.x, p.y)
    const inWall = !isOpenCell(map, cell.col, cell.row)
    const jammed = state.players.filter(
      (o) => o.alive && o.id !== p.id && Math.hypot(o.x - p.x, o.y - p.y) < UNIT_SEP,
    ).length
    const holding = distToTarget < 1.5 && p.waypoints.length === 0

    if (moved < 0.05) {
      stuckBuckets.zeroMove++
      if (p.waypoints.length > 0 || distToTarget > 1.5) stuckBuckets.zeroMoveWithWaypoints++
      if (holding) stuckBuckets.zeroMoveAtTarget++
      if (jammed > 0) stuckBuckets.jammedCluster++
      if (examples.length < 40 && (p.waypoints.length > 0 || distToTarget > 2 || jammed > 1 || inWall)) {
        examples.push(
          `${p.name}(${p.team}) moved=${moved.toFixed(3)} tgtDist=${distToTarget.toFixed(1)} wp=${p.waypoints.length} jammed=${jammed} wall=${inWall} @(${p.x.toFixed(1)},${p.y.toFixed(1)}) -> (${p.targetX.toFixed(1)},${p.targetY.toFixed(1)})`,
        )
      }
    }
    if (inWall) stuckBuckets.inWall++
  }
}

let idle = createIdleMatch()
let state = startMatch(squad as never, enemy, 55, idle.mapId, upgrades)
const dt = 1 / 20
let ticks = 0
let liveFeed: string[] = []

while (state.phase === 'live' && ticks < 20 * 90) {
  const prev = new Map(state.players.map((p) => [p.id, { x: p.x, y: p.y }]))
  state = tickMatch(state, upgrades, dt)
  ticks++

  // Sample every 0.5s
  if (ticks % 10 === 0) {
    analyze(state, prev)
  }

  // Live feed every 2s
  if (ticks % 40 === 0) {
    const stuckNow = state.players.filter((p) => {
      if (!p.alive) return false
      const before = prev.get(p.id)!
      const moved = Math.hypot(p.x - before.x, p.y - before.y)
      const dist = Math.hypot(p.targetX - p.x, p.targetY - p.y)
      return moved < 0.08 && (dist > 2 || p.waypoints.length > 0)
    })
    liveFeed.push(
      `t=${(ticks * dt).toFixed(1)}s r${state.round} ${state.allyScore}-${state.enemyScore} alive ${state.players.filter((p) => p.alive && p.team === 'ally').length}/${state.players.filter((p) => p.alive && p.team === 'enemy').length} STUCK=${stuckNow.length} [${stuckNow.map((p) => p.name).join(',')}]`,
    )
  }

  if (state.phase === 'result') break
  // Continue through rounds
  if (state.phase !== 'live') break
}

console.log('=== LIVE FEED ===')
console.log(liveFeed.join('\n'))
console.log('\n=== STUCK BUCKETS ===')
console.log(JSON.stringify(stuckBuckets, null, 2))
console.log('\n=== EXAMPLES ===')
console.log(examples.slice(0, 25).join('\n'))
console.log('\nBuffs', buffsFromUpgrades(upgrades))
console.log('Map', state.mapName, 'ticks', ticks)
