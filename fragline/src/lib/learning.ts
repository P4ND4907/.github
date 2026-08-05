import type { MatchBuffs } from './matchSim'
import type { Playbook, TacticalBrain } from '../types'

export function xpToNextIq(iq: number): number {
  return Math.round(40 + iq * 28 + iq * iq * 1.4)
}

export function createBrain(): TacticalBrain {
  return {
    iq: 1,
    xp: 0,
    xpToNext: xpToNextIq(1),
    playbook: {
      holds: 8,
      flanks: 6,
      utility: 5,
      aggression: 10,
      clutch: 4,
    },
    mapMemory: {},
    lessons: ['Boot camp complete — squad starts studying angles'],
    studyRate: 1.2,
    matchesLearned: 0,
    idleStudying: true,
  }
}

function clampStat(n: number) {
  return Math.max(0, Math.min(100, n))
}

/** Apply XP; may level IQ and unlock playbook gains */
export function grantXp(
  brain: TacticalBrain,
  amount: number,
  lesson?: string,
): TacticalBrain {
  if (amount <= 0) return brain
  let xp = brain.xp + amount
  let iq = brain.iq
  let xpToNext = brain.xpToNext
  let playbook = { ...brain.playbook }
  const lessons = [...brain.lessons]

  while (xp >= xpToNext && iq < 99) {
    xp -= xpToNext
    iq += 1
    xpToNext = xpToNextIq(iq)
    // Level-up: nudge a random playbook pillar
    const keys = Object.keys(playbook) as (keyof Playbook)[]
    const key = keys[Math.floor(Math.random() * keys.length)]
    playbook[key] = clampStat(playbook[key] + 2 + Math.floor(Math.random() * 3))
    lessons.unshift(`IQ ${iq} — playbook ${key} sharpened`)
  }

  if (lesson) lessons.unshift(lesson)

  return {
    ...brain,
    iq,
    xp,
    xpToNext,
    playbook,
    lessons: lessons.slice(0, 8),
  }
}

/** Idle study loop — squad watches VODs / drills while not in a match */
export function idleStudy(brain: TacticalBrain, dt: number): TacticalBrain {
  if (!brain.idleStudying || dt <= 0) return brain
  const rate = brain.studyRate * (1 + brain.iq * 0.04)
  const gained = rate * dt
  // Slow organic playbook drift toward balance
  const playbook = { ...brain.playbook }
  if (Math.random() < 0.015 * dt) {
    const keys = Object.keys(playbook) as (keyof Playbook)[]
    const weakest = keys.reduce((a, b) => (playbook[a] <= playbook[b] ? a : b))
    playbook[weakest] = clampStat(playbook[weakest] + 0.35)
  }
  return grantXp({ ...brain, playbook }, gained)
}

export function rememberMap(brain: TacticalBrain, mapId: string, amount: number): TacticalBrain {
  const prev = brain.mapMemory[mapId] ?? 0
  return {
    ...brain,
    mapMemory: {
      ...brain.mapMemory,
      [mapId]: clampStat(prev + amount),
    },
  }
}

/** Match outcome → burst XP + targeted playbook learning */
export function learnFromMatch(
  brain: TacticalBrain,
  result: 'win' | 'draw' | 'loss',
  mapId: string,
  allyScore: number,
  enemyScore: number,
  fragStreakPeak: number,
): TacticalBrain {
  const margin = allyScore - enemyScore
  let xp =
    result === 'win' ? 55 + margin * 6 : result === 'draw' ? 28 : 18 + Math.max(0, 3 - Math.abs(margin)) * 4
  xp += Math.min(40, fragStreakPeak * 8)

  const playbook = { ...brain.playbook }
  let lesson = ''

  if (result === 'win' && margin >= 2) {
    playbook.aggression = clampStat(playbook.aggression + 2.5)
    lesson = 'Learned: keep pressure when ahead'
  } else if (result === 'loss' || margin < 0) {
    playbook.holds = clampStat(playbook.holds + 2.8)
    playbook.clutch = clampStat(playbook.clutch + 1.5)
    lesson = 'Learned: tighter angle holds after losses'
  } else {
    playbook.flanks = clampStat(playbook.flanks + 2)
    lesson = 'Learned: split map control mid-round'
  }

  if (fragStreakPeak >= 3) {
    playbook.utility = clampStat(playbook.utility + 2)
    lesson = 'Learned: stack utility during streaks'
  }

  let next = grantXp(
    {
      ...brain,
      playbook,
      matchesLearned: brain.matchesLearned + 1,
      studyRate: Math.min(8, brain.studyRate + 0.05),
    },
    xp,
    lesson,
  )
  next = rememberMap(next, mapId, result === 'win' ? 12 : result === 'draw' ? 7 : 5)
  return next
}

/** Mid-match micro-lessons from live events */
export function learnFromLiveSignal(
  brain: TacticalBrain,
  signal: 'frag' | 'spot' | 'hold' | 'nade' | 'clay',
): TacticalBrain {
  const playbook = { ...brain.playbook }
  let xp = 0
  let lesson: string | undefined
  switch (signal) {
    case 'frag':
      xp = 2.2
      playbook.aggression = clampStat(playbook.aggression + 0.08)
      break
    case 'spot':
      xp = 3.5
      playbook.utility = clampStat(playbook.utility + 0.15)
      lesson = Math.random() < 0.35 ? 'Studying trap timings…' : undefined
      break
    case 'hold':
      xp = 1.4
      playbook.holds = clampStat(playbook.holds + 0.12)
      break
    case 'nade':
      xp = 2.0
      playbook.utility = clampStat(playbook.utility + 0.1)
      break
    case 'clay':
      xp = 2.4
      playbook.holds = clampStat(playbook.holds + 0.1)
      break
  }
  return grantXp({ ...brain, playbook }, xp, lesson)
}

/**
 * Fold brain IQ + playbook into match buffs so the AI literally plays smarter.
 * Upgrades remain the base; brain is the strategy-idle growth layer.
 */
export function buffsWithBrain(base: MatchBuffs, brain: TacticalBrain): MatchBuffs {
  const iqBonus = (brain.iq - 1) * 0.18
  const pb = brain.playbook
  return {
    power: base.power + iqBonus * 0.35 + pb.aggression / 55,
    intelligence: base.intelligence + iqBonus * 0.55 + pb.flanks / 45 + pb.utility / 70,
    strategy: base.strategy + iqBonus * 0.5 + pb.holds / 40 + pb.flanks / 60,
    reflex: base.reflex + iqBonus * 0.25,
    utility: base.utility + iqBonus * 0.4 + pb.utility / 40,
    clutch: base.clutch + iqBonus * 0.35 + pb.clutch / 45,
  }
}

export function mapFamiliarity(brain: TacticalBrain, mapId: string): number {
  return brain.mapMemory[mapId] ?? 0
}

export function brainPowerBonus(brain: TacticalBrain): number {
  const pb = brain.playbook
  const avg =
    (pb.holds + pb.flanks + pb.utility + pb.aggression + pb.clutch) / 5
  return Math.round(brain.iq * 12 + avg * 1.8)
}

export function describePlaybook(pb: Playbook): string {
  return `HLD ${Math.round(pb.holds)} · FLK ${Math.round(pb.flanks)} · UTL ${Math.round(pb.utility)} · AGG ${Math.round(pb.aggression)} · CLU ${Math.round(pb.clutch)}`
}
