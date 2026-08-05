import { HANDLES } from '../data/names'
import type { Player, PlayerRole, Skills } from '../types'

const ROLES: PlayerRole[] = ['ENT', 'IGL', 'SUP', 'LURK', 'AWP']
const FLAGS = ['BR', 'PL', 'FI', 'US', 'KR', 'SE', 'DK', 'UA', 'FR', 'DE']

let seq = 0

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function rarityWeight(): Player['rarity'] {
  const roll = Math.random()
  if (roll < 0.55) return 'Common'
  if (roll < 0.82) return 'Rare'
  if (roll < 0.95) return 'Epic'
  return 'Legend'
}

function rarityBias(rarity: Player['rarity']) {
  switch (rarity) {
    case 'Common':
      return 0
    case 'Rare':
      return 8
    case 'Epic':
      return 18
    case 'Legend':
      return 30
  }
}

export function makeSkills(base = 40, bias = 0): Skills {
  const roll = () => Math.max(10, Math.min(99, base + bias + rand(-12, 12)))
  return {
    aim: roll(),
    reflex: roll(),
    recoil: roll(),
    positioning: roll(),
    utility: roll(),
    clutch: roll(),
  }
}

export function playerPower(p: Player): number {
  const vals = Object.values(p.skills)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const rarityBonus =
    p.rarity === 'Legend' ? 40 : p.rarity === 'Epic' ? 25 : p.rarity === 'Rare' ? 12 : 0
  return Math.round(avg * 8 + p.level * 6 + rarityBonus)
}

export function squadPower(squad: Player[]): number {
  if (!squad.length) return 100
  return Math.round(squad.reduce((sum, p) => sum + playerPower(p), 0) / Math.max(1, squad.length / 5))
}

export function createPlayer(opts?: {
  role?: PlayerRole
  rarity?: Player['rarity']
  levelBias?: number
}): Player {
  const rarity = opts?.rarity ?? rarityWeight()
  const bias = rarityBias(rarity) + (opts?.levelBias ?? 0)
  seq += 1
  return {
    id: `p_${Date.now()}_${seq}`,
    name: pick(HANDLES),
    role: opts?.role ?? pick(ROLES),
    rarity,
    nationality: pick(FLAGS),
    skills: makeSkills(42, bias),
    level: rand(1, 8) + Math.floor(bias / 5),
  }
}

export function createStarterSquad(): Player[] {
  return ROLES.map((role) =>
    createPlayer({
      role,
      rarity: role === 'IGL' || role === 'ENT' ? 'Rare' : 'Common',
      levelBias: 6,
    }),
  )
}

export function createMarket(count = 6, leagueTier = 1): Player[] {
  return Array.from({ length: count }, () =>
    createPlayer({ levelBias: leagueTier * 4 }),
  )
}

export function skillUpgradeCost(level: number, skillValue: number): number {
  return Math.round(1200 + level * 450 + skillValue * 80)
}

export function marketPrice(p: Player): number {
  const base =
    p.rarity === 'Legend' ? 180000 : p.rarity === 'Epic' ? 90000 : p.rarity === 'Rare' ? 35000 : 12000
  return Math.round(base + playerPower(p) * 40)
}

export function formatCash(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${Math.floor(n)}`
}
